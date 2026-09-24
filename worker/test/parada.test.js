import test from "node:test";
import assert from "node:assert/strict";
import { rodar } from "../src/exec.js";
import { executarJob } from "../src/server.js";
import { JobPausado, pedirParada, reiniciarParada, registrar, vigiarPausa } from "../src/parada.js";

const CONFIG = { porta: 0, workerKey: "segredo", swipeKey: "sk", supabaseUrl: "https://sb.test", supabaseAnonKey: "anon", versao: "1.0.0" };
const JOB = { id: "j1", tipo: "lp", payload: { link: "https://x", categoria: "landing_page", nome_arquivo: "LP - N - P", drive_folder_id: "cat1", rede: "internet" }, ultima_tentativa: true };

test("pedirParada mata o comando em andamento e ele rejeita com JobPausado", async () => {
  reiniciarParada();
  const inicio = Date.now();
  const p = rodar(process.execPath, ["-e", "setTimeout(()=>{}, 20000)"]);
  setTimeout(pedirParada, 200);
  await assert.rejects(p, (e) => e instanceof JobPausado);
  assert.ok(Date.now() - inicio < 5000, "o comando deveria morrer logo, não esperar os 20 s");
  reiniciarParada();
});

test("depois da parada, comando novo nem começa", async () => {
  reiniciarParada();
  pedirParada();
  await assert.rejects(() => rodar(process.execPath, ["-e", "1"]), (e) => e instanceof JobPausado);
  reiniciarParada();
});

test("registrar depois da parada já para o recurso", async () => {
  reiniciarParada();
  pedirParada();
  let fechado = false;
  registrar(() => { fechado = true; });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(fechado, true);
  reiniciarParada();
});

test("vigiarPausa pede a parada quando o job fica 'pausado' no banco", async () => {
  reiniciarParada();
  let chamadas = 0;
  let parou = false;
  registrar(() => { parou = true; });
  const fetchFake = async (url, init) => {
    chamadas++;
    assert.match(url, /swipe_jobs\?id=eq\.j1&select=status/);
    assert.equal(init.headers.apikey, "anon");
    return { ok: true, json: async () => [{ status: chamadas >= 2 ? "pausado" : "rodando" }] };
  };
  const parar = vigiarPausa({ jobId: "j1", supabaseUrl: "https://sb.test", anonKey: "anon", intervaloMs: 20, fetch: fetchFake });
  await new Promise((r) => setTimeout(r, 120));
  parar();
  assert.equal(parou, true);
  reiniciarParada();
});

test("vigiarPausa sem chave pública não consulta nada", async () => {
  let chamou = false;
  const parar = vigiarPausa({ jobId: "j1", supabaseUrl: "https://sb.test", anonKey: null, intervaloMs: 10, fetch: async () => { chamou = true; } });
  await new Promise((r) => setTimeout(r, 50));
  parar();
  assert.equal(chamou, false);
});

test("executarJob pausado devolve pausado, sem publicar e sem criar o Docs mesmo na última tentativa", async () => {
  let criouDoc = false;
  let publicou = false;
  const r = await executarJob(JOB, {
    config: CONFIG,
    criarDrive: () => ({ criarDoc: async () => { criouDoc = true; return { id: "doc" }; } }),
    comPastaTemp: async (_p, fn) => fn("/tmp/j"),
    vigiarPausa: () => () => {},
    capturar: async () => {
      pedirParada();
      // A captura engole erros de etapas opcionais e devolve o que conseguiu
      return { arquivos: [{ nome: "LP.html", caminho: "/tmp/j/p.html", mime: "text/html" }] };
    },
    publicarLp: async () => { publicou = true; return {}; },
  });
  assert.deepEqual(r, { ok: false, pausado: true, erro: "pausado pelo usuário" });
  assert.equal(publicou, false);
  assert.equal(criouDoc, false);
  reiniciarParada();
});

test("executarJob zera a parada do job anterior e encerra a vigia no fim", async () => {
  pedirParada(); // sobra de um job anterior
  let vigiaEncerrada = false;
  const r = await executarJob({ ...JOB, tipo: "download" }, {
    config: CONFIG,
    criarDrive: () => ({}),
    comPastaTemp: async (_p, fn) => fn("/tmp/j"),
    vigiarPausa: () => () => { vigiaEncerrada = true; },
    baixar: async () => ({ arquivos: ["/tmp/j/x.mp4"], modo: "unico" }),
    publicarDownload: async () => ({ drive_file_id: "f1" }),
  });
  assert.deepEqual(r, { ok: true, resultado: { drive_file_id: "f1" } });
  assert.equal(vigiaEncerrada, true);
});

test("vigiarPausa: job apagado (cancelado no app) também pede a parada", async () => {
  reiniciarParada();
  let parou = false;
  registrar(() => { parou = true; });
  const parar = vigiarPausa({ jobId: "j1", supabaseUrl: "https://sb.test", anonKey: "anon", intervaloMs: 20, fetch: async () => ({ ok: true, json: async () => [] }) });
  await new Promise((r) => setTimeout(r, 80));
  parar();
  assert.equal(parou, true);
  reiniciarParada();
});

test("vigiarPausa: erro de rede ou resposta ruim não para o job", async () => {
  reiniciarParada();
  let parou = false;
  registrar(() => { parou = true; });
  let n = 0;
  const fetchFake = async () => {
    n++;
    if (n % 2) throw new Error("rede caiu");
    return { ok: false, json: async () => ({}) };
  };
  const parar = vigiarPausa({ jobId: "j1", supabaseUrl: "https://sb.test", anonKey: "anon", intervaloMs: 15, fetch: fetchFake });
  await new Promise((r) => setTimeout(r, 90));
  parar();
  assert.equal(parou, false);
  reiniciarParada();
});

test("vigiarPausa em outra tabela e com outro status de parada (Transcritor)", async () => {
  reiniciarParada();
  let parou = false;
  registrar(() => { parou = true; });
  const fetchFake = async (url) => {
    assert.match(url, /transcricoes\?id=eq\.t1&select=status/);
    return { ok: true, json: async () => [{ status: "pausada" }] };
  };
  const parar = vigiarPausa({ jobId: "t1", tabela: "transcricoes", statusDeParada: ["pausada"], supabaseUrl: "https://sb.test", anonKey: "anon", intervaloMs: 20, fetch: fetchFake });
  await new Promise((r) => setTimeout(r, 80));
  parar();
  assert.equal(parou, true);
  reiniciarParada();
});
