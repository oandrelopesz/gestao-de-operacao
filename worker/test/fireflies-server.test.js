import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHmac } from "node:crypto";
import { lerConfig } from "../src/config.js";
import { criarServidor } from "../src/server.js";
import { DriveIndisponivel } from "../src/drive.js";

const CONFIG = {
  porta: 0, workerKey: "segredo", swipeKey: "sk", supabaseUrl: "https://sb.test", supabaseAnonKey: "anon",
  firefliesApiKey: "ff", firefliesWebhookSecret: "whsec", versao: "1.0.0",
};

/** Rotinas de mentira: guardam as chamadas; `travar` deixa uma rotina presa até `liberar()`. */
function rotinasFalsas() {
  const chamadas = [];
  const travas = {};
  const esperar = (nome) => (travas[nome] ? travas[nome].promessa : null);
  const r = {
    chamadas,
    travar(nome) { let liberar; const promessa = new Promise((ok) => { liberar = ok; }); travas[nome] = { promessa, liberar }; },
    liberar(nome) { travas[nome]?.liberar(); delete travas[nome]; },
    agenda: async () => { chamadas.push(["agenda"]); await esperar("agenda"); return { ok: true, enviados: [], falhas: [], ignorados: 0 }; },
    pendencias: async () => { chamadas.push(["pendencias"]); return { ok: true, renomeados: 0, excluidos: 0, erros: [] }; },
    sincronizar: async (op) => { chamadas.push(["sincronizar", op]); await esperar("sincronizar"); return { ok: true, importados: 0, falhas: [], restantes: 0, paginasLidas: 1, historicoCompleto: true }; },
    importar: async (id) => { chamadas.push(["importar", id]); return id === "ruim" ? { ok: false, id, erro: "falhou" } : { ok: true, id, titulo: "X" }; },
  };
  return r;
}

async function subir({ config = CONFIG, fireflies = rotinasFalsas(), executarJob = async () => ({ ok: true }) } = {}) {
  const servidor = criarServidor({ config, executarJob, fireflies });
  servidor.listen(0);
  await once(servidor, "listening");
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const post = (caminho, corpo, chave = "segredo") => fetch(`${base}${caminho}`, {
    method: "POST",
    headers: chave ? { "x-worker-key": chave } : {},
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo ?? {}),
  });
  return { base, post, fireflies, fechar: () => new Promise((r) => servidor.close(r)) };
}

const assinar = (corpo, segredo = "whsec") => `sha256=${createHmac("sha256", segredo).update(corpo, "utf8").digest("hex")}`;

test("lerConfig: chaves do Fireflies são opcionais", () => {
  const base = { WORKER_KEY: "a", SWIPE_KEY: "b", SUPABASE_URL: "https://sb" };
  const sem = lerConfig(base);
  assert.equal(sem.firefliesApiKey, null);
  assert.equal(sem.firefliesWebhookSecret, null);
  const com = lerConfig({ ...base, FIREFLIES_API_KEY: "k", FIREFLIES_WEBHOOK_SECRET: "s" });
  assert.equal(com.firefliesApiKey, "k");
  assert.equal(com.firefliesWebhookSecret, "s");
});

test("/fireflies/* sem a chave do worker é 401", async () => {
  const s = await subir();
  for (const rota of ["/fireflies/agenda", "/fireflies/pendencias", "/fireflies/sincronizar", "/fireflies/importar", "/fireflies/webhook"]) {
    const r = await s.post(rota, {}, null);
    assert.equal(r.status, 401, rota);
    const errada = await s.post(rota, {}, "outra");
    assert.equal(errada.status, 401, rota);
  }
  assert.equal(s.fireflies.chamadas.length, 0);
  await s.fechar();
});

test("sem FIREFLIES_API_KEY ou SUPABASE_ANON_KEY as rotas respondem 503", async () => {
  for (const faltando of ["firefliesApiKey", "supabaseAnonKey"]) {
    const s = await subir({ config: { ...CONFIG, [faltando]: null } });
    const r = await s.post("/fireflies/agenda", {});
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { ok: false, erro: "Fireflies não configurado" });
    await s.fechar();
  }
});

test("rota desconhecida e GET continuam 404; /health não muda", async () => {
  const s = await subir();
  assert.equal((await s.post("/fireflies/outra", {})).status, 404);
  assert.equal((await fetch(`${s.base}/fireflies/agenda`, { headers: { "x-worker-key": "segredo" } })).status, 404);
  assert.deepEqual(await (await fetch(`${s.base}/health`)).json(), { ok: true, busy: false, versao: "1.0.0" });
  await s.fechar();
});

test("agenda, pendências, sincronizar e importar chamam a rotina e devolvem o resultado", async () => {
  const s = await subir();
  assert.deepEqual(await (await s.post("/fireflies/agenda", {})).json(), { ok: true, enviados: [], falhas: [], ignorados: 0 });
  assert.equal((await (await s.post("/fireflies/pendencias", "")).json()).ok, true);
  assert.equal((await (await s.post("/fireflies/sincronizar", { limite: 5, completo: true })).json()).historicoCompleto, true);
  assert.deepEqual(await (await s.post("/fireflies/importar", { id: "m1" })).json(), { ok: true, id: "m1", titulo: "X" });
  assert.deepEqual(s.fireflies.chamadas, [["agenda"], ["pendencias"], ["sincronizar", { limite: 5, completo: true }], ["importar", "m1"]]);
  await s.fechar();
});

test("importar sem id e corpo que não é JSON respondem 400", async () => {
  const s = await subir();
  assert.equal((await s.post("/fireflies/importar", {})).status, 400);
  assert.equal((await s.post("/fireflies/sincronizar", "{quebrado")).status, 400);
  assert.equal((await s.post("/fireflies/sincronizar", "[1,2]")).status, 400);
  await s.fechar();
});

test("webhook V2 assinado com sha256= importa a reunião", async () => {
  const s = await subir();
  const corpo = JSON.stringify({ event: "meeting.summarized", timestamp: 1710876789456, meeting_id: "ASxwZxCstx" });
  const r = await s.post("/fireflies/webhook", { corpo, assinatura: assinar(corpo) });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, id: "ASxwZxCstx", importado: true, erro: null });
  assert.deepEqual(s.fireflies.chamadas, [["importar", "ASxwZxCstx"]]);
  await s.fechar();
});

test("webhook legado (meetingId, Transcription completed) também importa; falha na importação ainda é ok para o n8n", async () => {
  const s = await subir();
  const legado = JSON.stringify({ meetingId: "ruim", eventType: "Transcription completed", clientReferenceId: "x" });
  const r = await s.post("/fireflies/webhook", { corpo: legado, assinatura: assinar(legado).replace("sha256=", "") });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, id: "ruim", importado: false, erro: "falhou" });
  await s.fechar();
});

test("webhook meeting.bot_joined é ignorado sem importar", async () => {
  const s = await subir();
  const corpo = JSON.stringify({ event: "meeting.bot_joined", timestamp: 1, meeting_id: "A1" });
  const r = await s.post("/fireflies/webhook", { corpo, assinatura: assinar(corpo) });
  assert.deepEqual(await r.json(), { ok: true, ignorado: true, evento: "meeting.bot_joined" });
  assert.equal(s.fireflies.chamadas.length, 0);
  await s.fechar();
});

test("webhook de teste do Fireflies (corpo real, event: test) é ignorado sem importar", async () => {
  const s = await subir();
  const corpo = '{"event":"test","timestamp":1790393582337,"meeting_id":"test_00000000"}';
  const r = await s.post("/fireflies/webhook", { corpo, assinatura: assinar(corpo) });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, ignorado: true, evento: "test" });
  assert.equal(s.fireflies.chamadas.length, 0);
  await s.fechar();
});

test("webhook com a trava ocupada entra na fila e é importado quando ela solta (sem repetir id)", async () => {
  const fireflies = rotinasFalsas();
  fireflies.travar("sincronizar");
  const s = await subir({ fireflies });
  const longa = s.post("/fireflies/sincronizar", {});
  await new Promise((r) => setTimeout(r, 50));

  const transcrito = JSON.stringify({ event: "meeting.transcribed", timestamp: 1, meeting_id: "M9" });
  const resumido = JSON.stringify({ event: "meeting.summarized", timestamp: 2, meeting_id: "M9" });
  const r1 = await s.post("/fireflies/webhook", { corpo: transcrito, assinatura: assinar(transcrito) });
  const r2 = await s.post("/fireflies/webhook", { corpo: resumido, assinatura: assinar(resumido) });
  assert.equal(r1.status, 202);
  assert.deepEqual(await r2.json(), { ok: true, enfileirado: true, id: "M9" });
  assert.ok(!fireflies.chamadas.some((c) => c[0] === "importar"), "nada importado enquanto a sincronização roda");

  fireflies.liberar("sincronizar");
  await longa;
  for (let i = 0; i < 40 && !fireflies.chamadas.some((c) => c[0] === "importar"); i++) await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(fireflies.chamadas.filter((c) => c[0] === "importar"), [["importar", "M9"]]);
  await s.fechar();
});

test("webhook com assinatura errada, ausente ou de outro corpo é 401", async () => {
  const s = await subir();
  const corpo = JSON.stringify({ event: "meeting.transcribed", timestamp: 1, meeting_id: "A1" });
  assert.equal((await s.post("/fireflies/webhook", { corpo, assinatura: assinar(corpo, "outro") })).status, 401);
  assert.equal((await s.post("/fireflies/webhook", { corpo })).status, 401);
  assert.equal((await s.post("/fireflies/webhook", { corpo: `${corpo} `, assinatura: assinar(corpo) })).status, 401);
  assert.equal(s.fireflies.chamadas.length, 0);
  await s.fechar();
});

test("webhook sem FIREFLIES_WEBHOOK_SECRET é 503; corpo assinado que não é JSON é 400", async () => {
  const semSegredo = await subir({ config: { ...CONFIG, firefliesWebhookSecret: null } });
  const corpo = JSON.stringify({ event: "meeting.transcribed", meeting_id: "A1" });
  assert.equal((await semSegredo.post("/fireflies/webhook", { corpo, assinatura: assinar(corpo) })).status, 503);
  await semSegredo.fechar();

  const s = await subir();
  assert.equal((await s.post("/fireflies/webhook", { corpo: "não é json", assinatura: assinar("não é json") })).status, 400);
  await s.fechar();
});

test("sincronização longa: outra tarefa do Fireflies recebe 409, mas a agenda e o /job seguem", async () => {
  const fireflies = rotinasFalsas();
  fireflies.travar("sincronizar");
  let jobs = 0;
  const s = await subir({ fireflies, executarJob: async () => { jobs++; return { ok: true }; } });
  const longa = s.post("/fireflies/sincronizar", {});
  await new Promise((r) => setTimeout(r, 50));

  assert.equal((await s.post("/fireflies/pendencias", {})).status, 409);
  assert.equal((await s.post("/fireflies/importar", { id: "m1" })).status, 409);
  assert.equal((await s.post("/fireflies/agenda", {})).status, 200, "a agenda tem trava própria");
  const job = await s.post("/job", { id: "j1", payload: { link: "https://x", drive_folder_id: "p" } });
  assert.equal(job.status, 200, "o /job tem trava própria");
  assert.equal(jobs, 1);

  fireflies.liberar("sincronizar");
  assert.equal((await longa).status, 200);
  assert.equal((await s.post("/fireflies/pendencias", {})).status, 200, "trava liberada depois do fim");
  await s.fechar();
});

test("agenda ao mesmo tempo que outra agenda é 409", async () => {
  const fireflies = rotinasFalsas();
  fireflies.travar("agenda");
  const s = await subir({ fireflies });
  const primeira = s.post("/fireflies/agenda", {});
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await s.post("/fireflies/agenda", {})).status, 409);
  fireflies.liberar("agenda");
  assert.equal((await primeira).status, 200);
  await s.fechar();
});

test("erro da rotina vira 500 (503 se o Google estiver indisponível) e libera a trava", async () => {
  const fireflies = rotinasFalsas();
  fireflies.agenda = async () => { throw new DriveIndisponivel("Google Drive não conectado"); };
  fireflies.pendencias = async () => { throw new Error("Supabase 500: fora"); };
  const s = await subir({ fireflies });
  const agenda = await s.post("/fireflies/agenda", {});
  assert.equal(agenda.status, 503);
  assert.match((await agenda.json()).erro, /não conectado/);
  const pend = await s.post("/fireflies/pendencias", {});
  assert.equal(pend.status, 500);
  fireflies.pendencias = async () => ({ ok: true, renomeados: 0, excluidos: 0, erros: [] });
  assert.equal((await s.post("/fireflies/pendencias", {})).status, 200);
  await s.fechar();
});
