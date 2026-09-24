import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarRotasUpload, caminhoUpload } from "../src/transcritor/uploads.js";
import { AcessoNegado, criarVerificador } from "../src/transcritor/auth.js";

const ID = "11111111-2222-3333-4444-555555555555";

async function subir(linha) {
  const pasta = await mkdtemp(join(tmpdir(), "tr-"));
  const atualizacoes = [];
  const banco = {
    linha: async (id) => (id === ID ? linha : null),
    atualizar: async (id, campos, so) => { atualizacoes.push({ id, campos, so }); return { id, ...campos }; },
  };
  const verificar = async (token) => { if (token !== "ok") throw new AcessoNegado("sem login"); };
  const rotas = criarRotasUpload({ pasta, banco, verificar, origens: ["https://app.test"] });
  const servidor = http.createServer(async (req, res) => { if (!(await rotas(req, res))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => servidor.listen(0, r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const pedir = (caminho, init = {}) => fetch(base + caminho, { ...init, headers: { "x-google-id-token": "ok", origin: "https://app.test", ...(init.headers || {}) } });
  return { pasta, atualizacoes, pedir, fechar: async () => { servidor.close(); await rm(pasta, { recursive: true, force: true }); } };
}

test("envio em partes, retomada pelo 'recebido' e fim que põe na fila", async () => {
  const s = await subir({ id: ID, origem: "arquivo", status: "enviando", tamanho: 10 });
  try {
    assert.deepEqual(await (await s.pedir(`/uploads/${ID}`, { method: "POST" })).json(), { recebido: 0 });
    let r = await s.pedir(`/uploads/${ID}?offset=0`, { method: "PUT", body: Buffer.from("abcdef") });
    assert.deepEqual(await r.json(), { recebido: 6 });
    // parte repetida (a rede caiu e o navegador reenviou) é recusada com o offset certo
    r = await s.pedir(`/uploads/${ID}?offset=0`, { method: "PUT", body: Buffer.from("abcdef") });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).recebido, 6);
    // fim antes de completar é recusado
    assert.equal((await s.pedir(`/uploads/${ID}/fim`, { method: "POST" })).status, 409);
    r = await s.pedir(`/uploads/${ID}?offset=6`, { method: "PUT", body: Buffer.from("ghij") });
    assert.deepEqual(await r.json(), { recebido: 10 });
    r = await s.pedir(`/uploads/${ID}/fim`, { method: "POST" });
    assert.equal(r.status, 200);
    assert.equal(await readFile(caminhoUpload(s.pasta, ID), "utf8"), "abcdefghij");
    assert.equal(s.atualizacoes[0].campos.status, "aguardando");
    assert.deepEqual(s.atualizacoes[0].so, ["enviando"]);
    assert.equal(r.headers.get("access-control-allow-origin"), "https://app.test");
  } finally {
    await s.fechar();
  }
});

test("sem login do Google, recusa com 401", async () => {
  const s = await subir({ id: ID, origem: "arquivo", status: "enviando", tamanho: 10 });
  try {
    const r = await s.pedir(`/uploads/${ID}`, { method: "POST", headers: { "x-google-id-token": "" } });
    assert.equal(r.status, 401);
  } finally {
    await s.fechar();
  }
});

test("transcrição cancelada (linha apagada) ou já enviada é recusada", async () => {
  const s = await subir(null);
  try {
    assert.equal((await s.pedir(`/uploads/${ID}`, { method: "POST" })).status, 404);
  } finally {
    await s.fechar();
  }
  const s2 = await subir({ id: ID, origem: "arquivo", status: "aguardando", tamanho: 3 });
  try {
    assert.equal((await s2.pedir(`/uploads/${ID}?offset=0`, { method: "PUT", body: Buffer.from("abc") })).status, 409);
  } finally {
    await s2.fechar();
  }
});

test("parte que passa do tamanho declarado é recusada", async () => {
  const s = await subir({ id: ID, origem: "arquivo", status: "enviando", tamanho: 3 });
  try {
    assert.equal((await s.pedir(`/uploads/${ID}?offset=0`, { method: "PUT", body: Buffer.from("abcd") })).status, 400);
  } finally {
    await s.fechar();
  }
});

test("OPTIONS responde o preflight de CORS", async () => {
  const s = await subir({ id: ID, origem: "arquivo", status: "enviando", tamanho: 3 });
  try {
    const r = await s.pedir(`/uploads/${ID}`, { method: "OPTIONS" });
    assert.equal(r.status, 204);
    assert.match(r.headers.get("access-control-allow-headers"), /x-google-id-token/);
  } finally {
    await s.fechar();
  }
});

test("verificador do Google: aud, e-mail permitido e verificado, expiração e cache", async () => {
  let chamadas = 0;
  const info = { aud: "cid", email: "Contato@X.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 3600) };
  const fetchFake = async () => { chamadas++; return { ok: true, json: async () => info }; };
  const verificar = criarVerificador({ clientId: "cid", emailsPermitidos: ["contato@x.com"], fetch: fetchFake });
  assert.equal(await verificar("tok"), true);
  assert.equal(await verificar("tok"), true);
  assert.equal(chamadas, 1, "segunda vez vem do cache");
  const outro = criarVerificador({ clientId: "cid", emailsPermitidos: ["outra@x.com"], fetch: fetchFake });
  await assert.rejects(() => outro("tok"), AcessoNegado);
  const outroApp = criarVerificador({ clientId: "outro", emailsPermitidos: ["contato@x.com"], fetch: fetchFake });
  await assert.rejects(() => outroApp("tok"), AcessoNegado);
  await assert.rejects(() => verificar(""), AcessoNegado);
});
