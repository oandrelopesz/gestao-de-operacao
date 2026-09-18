import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { lerConfig } from "../src/config.js";
import { criarServidor, executarJob } from "../src/server.js";
import { DriveIndisponivel } from "../src/drive.js";

const CONFIG = { porta: 0, workerKey: "segredo", swipeKey: "sk", supabaseUrl: "https://sb.test", versao: "1.0.0" };

async function subir(executarJobFake) {
  const servidor = criarServidor({ config: CONFIG, executarJob: executarJobFake });
  servidor.listen(0);
  await once(servidor, "listening");
  const base = `http://127.0.0.1:${servidor.address().port}`;
  return { servidor, base, fechar: () => new Promise((r) => servidor.close(r)) };
}

const JOB = { id: "j1", tipo: "download", payload: { link: "https://x", categoria: "video_anuncio", nome_arquivo: "V - N - P", drive_folder_id: "cat1", rede: "youtube" }, ultima_tentativa: false };

test("lerConfig exige as variáveis obrigatórias", () => {
  assert.throws(() => lerConfig({}), /WORKER_KEY/);
  assert.throws(() => lerConfig({ WORKER_KEY: "a" }), /SWIPE_KEY/);
  assert.throws(() => lerConfig({ WORKER_KEY: "a", SWIPE_KEY: "b" }), /SUPABASE_URL/);
  const c = lerConfig({ WORKER_KEY: "a", SWIPE_KEY: "b", SUPABASE_URL: "https://sb/", PORTA: "9090" });
  assert.equal(c.porta, 9090);
  assert.equal(c.supabaseUrl, "https://sb");
});

test("/health responde sem chave", async () => {
  const s = await subir(async () => ({ ok: true }));
  const r = await fetch(`${s.base}/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, busy: false, versao: "1.0.0" });
  await s.fechar();
});

test("/job sem chave é 401", async () => {
  const s = await subir(async () => ({ ok: true }));
  const r = await fetch(`${s.base}/job`, { method: "POST", body: JSON.stringify(JOB) });
  assert.equal(r.status, 401);
  await s.fechar();
});

test("/job devolve o resultado do job", async () => {
  const s = await subir(async () => ({ ok: true, resultado: { drive_file_id: "f1" } }));
  const r = await fetch(`${s.base}/job`, { method: "POST", headers: { "x-worker-key": "segredo" }, body: JSON.stringify(JOB) });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, resultado: { drive_file_id: "f1" } });
  await s.fechar();
});

test("segundo job ao mesmo tempo recebe 409", async () => {
  let liberar;
  const trava = new Promise((r) => { liberar = r; });
  const s = await subir(async () => { await trava; return { ok: true }; });
  const primeiro = fetch(`${s.base}/job`, { method: "POST", headers: { "x-worker-key": "segredo" }, body: JSON.stringify(JOB) });
  await new Promise((r) => setTimeout(r, 50));
  const segundo = await fetch(`${s.base}/job`, { method: "POST", headers: { "x-worker-key": "segredo" }, body: JSON.stringify(JOB) });
  assert.equal(segundo.status, 409);
  liberar();
  await primeiro;
  await s.fechar();
});

test("DriveIndisponivel vira 503", async () => {
  const s = await subir(async () => { throw new DriveIndisponivel("Drive não conectado"); });
  const r = await fetch(`${s.base}/job`, { method: "POST", headers: { "x-worker-key": "segredo" }, body: JSON.stringify(JOB) });
  assert.equal(r.status, 503);
  assert.match((await r.json()).erro, /não conectado/);
  await s.fechar();
});

test("executarJob monta o resultado do download", async () => {
  const chamadas = [];
  const r = await executarJob(JOB, {
    criarDrive: () => ({ criarDoc: async () => ({ id: "doc" }) }),
    comPastaTemp: async (_p, fn) => fn("/tmp/j"),
    baixar: async (a) => { chamadas.push(a); return { arquivos: ["/tmp/j/x.mp4"], modo: "unico" }; },
    publicarDownload: async () => ({ drive_file_id: "f1", nome_arquivo: "V - N - P" }),
    config: CONFIG,
  });
  assert.deepEqual(r, { ok: true, resultado: { drive_file_id: "f1", nome_arquivo: "V - N - P" } });
  assert.equal(chamadas[0].link, "https://x");
});

test("falha na última tentativa cria o Docs com o link", async () => {
  let doc;
  const r = await executarJob({ ...JOB, ultima_tentativa: true }, {
    criarDrive: () => ({ criarDoc: async (paiId, nome, texto) => { doc = { paiId, nome, texto }; return { id: "d1", webViewLink: "https://docs/d1" }; } }),
    comPastaTemp: async (_p, fn) => fn("/tmp/j"),
    baixar: async () => { throw new Error("Instagram bloqueou"); },
    publicarDownload: async () => ({}),
    config: CONFIG,
  });
  assert.equal(r.ok, false);
  assert.match(r.erro, /Instagram bloqueou/);
  assert.equal(r.docs.drive_file_id, "d1");
  assert.equal(doc.paiId, "cat1");
  assert.equal(doc.nome, "V - N - P");
  assert.match(doc.texto, /https:\/\/x/);
});

test("falha que não é a última não cria Docs", async () => {
  const r = await executarJob(JOB, {
    criarDrive: () => ({ criarDoc: async () => { throw new Error("não devia criar"); } }),
    comPastaTemp: async (_p, fn) => fn("/tmp/j"),
    baixar: async () => { throw new Error("timeout"); },
    publicarDownload: async () => ({}),
    config: CONFIG,
  });
  assert.equal(r.ok, false);
  assert.equal(r.docs, null);
});

test("Drive fora do ar ao criar o Docs vira falha de infraestrutura", async () => {
  await assert.rejects(
    () => executarJob({ ...JOB, ultima_tentativa: true }, {
      criarDrive: () => ({ criarDoc: async () => { throw new DriveIndisponivel("Drive não conectado"); } }),
      comPastaTemp: async (_p, fn) => fn("/tmp/j"),
      baixar: async () => { throw new Error("Instagram bloqueou"); },
      publicarDownload: async () => ({}),
      config: CONFIG,
    }),
    DriveIndisponivel,
  );
});

test("corpo inválido responde 400", async () => {
  const s = await subir(async () => ({ ok: true }));
  const r = await fetch(`${s.base}/job`, { method: "POST", headers: { "x-worker-key": "segredo" }, body: "{isso não é json" });
  assert.equal(r.status, 400);
  await s.fechar();
});

test("corpo inválido libera a trava para o próximo job", async () => {
  const s = await subir(async () => ({ ok: true, resultado: { drive_file_id: "f1" } }));
  const ruim = await fetch(`${s.base}/job`, { method: "POST", headers: { "x-worker-key": "segredo" }, body: "{" });
  assert.equal(ruim.status, 400);
  const bom = await fetch(`${s.base}/job`, { method: "POST", headers: { "x-worker-key": "segredo" }, body: JSON.stringify(JOB) });
  assert.equal(bom.status, 200, "a trava não podia ter ficado presa depois do 400");
  await s.fechar();
});
