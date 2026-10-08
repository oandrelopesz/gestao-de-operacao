import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarRotaAudio, caminhoAudio } from "../src/transcritor/audio.js";

const ID = "11111111-2222-3333-4444-555555555555";

async function subir({ comArquivo = true } = {}) {
  const pasta = await mkdtemp(join(tmpdir(), "tr-audio-"));
  if (comArquivo) {
    await mkdir(join(pasta, "audios"), { recursive: true });
    await writeFile(caminhoAudio(pasta, ID), "0123456789");
  }
  const rota = criarRotaAudio({ pasta, origens: ["https://app.test"] });
  const tratados = [];
  const servidor = http.createServer(async (req, res) => {
    const tratado = await rota(req, res);
    tratados.push(tratado);
    if (!tratado) { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => servidor.listen(0, r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const pedir = (caminho, init = {}) => fetch(base + caminho, { ...init, headers: { origin: "https://app.test", ...(init.headers || {}) } });
  return { pasta, tratados, pedir, fechar: async () => { servidor.close(); await rm(pasta, { recursive: true, force: true }); } };
}

test("caminhoAudio aponta para audios/<id>.m4a", () => {
  assert.equal(caminhoAudio("/x", ID), join("/x", "audios", `${ID}.m4a`));
});

test("GET sem Range devolve o arquivo todo com cabeçalhos de áudio", async () => {
  const s = await subir();
  try {
    const r = await s.pedir(`/audio/${ID}.m4a`);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "0123456789");
    assert.equal(r.headers.get("content-type"), "audio/mp4");
    assert.equal(r.headers.get("accept-ranges"), "bytes");
    assert.equal(r.headers.get("content-length"), "10");
    assert.equal(r.headers.get("cache-control"), "private, max-age=3600");
    assert.equal(r.headers.get("access-control-allow-origin"), "https://app.test");
  } finally {
    await s.fechar();
  }
});

test("Range em bytes=a-b, bytes=a- e bytes=-n devolve 206 com Content-Range", async () => {
  const s = await subir();
  try {
    let r = await s.pedir(`/audio/${ID}.m4a`, { headers: { range: "bytes=2-5" } });
    assert.equal(r.status, 206);
    assert.equal(await r.text(), "2345");
    assert.equal(r.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(r.headers.get("content-length"), "4");

    r = await s.pedir(`/audio/${ID}.m4a`, { headers: { range: "bytes=3-" } });
    assert.equal(r.status, 206);
    assert.equal(await r.text(), "3456789");
    assert.equal(r.headers.get("content-range"), "bytes 3-9/10");

    r = await s.pedir(`/audio/${ID}.m4a`, { headers: { range: "bytes=-4" } });
    assert.equal(r.status, 206);
    assert.equal(await r.text(), "6789");
    assert.equal(r.headers.get("content-range"), "bytes 6-9/10");
  } finally {
    await s.fechar();
  }
});

test("Range fora do tamanho ou inválido devolve 416 com Content-Range de tamanho", async () => {
  const s = await subir();
  try {
    let r = await s.pedir(`/audio/${ID}.m4a`, { headers: { range: "bytes=10-12" } });
    assert.equal(r.status, 416);
    assert.equal(r.headers.get("content-range"), "bytes */10");

    r = await s.pedir(`/audio/${ID}.m4a`, { headers: { range: "bytes=abc" } });
    assert.equal(r.status, 416);
    assert.equal(r.headers.get("content-range"), "bytes */10");

    r = await s.pedir(`/audio/${ID}.m4a`, { headers: { range: "bytes=5-2" } });
    assert.equal(r.status, 416);
  } finally {
    await s.fechar();
  }
});

test("arquivo inexistente devolve 404", async () => {
  const s = await subir({ comArquivo: false });
  try {
    assert.equal((await s.pedir(`/audio/${ID}.m4a`)).status, 404);
  } finally {
    await s.fechar();
  }
});

test("HEAD devolve só os cabeçalhos", async () => {
  const s = await subir();
  try {
    const r = await s.pedir(`/audio/${ID}.m4a`, { method: "HEAD" });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-length"), "10");
    assert.equal(r.headers.get("accept-ranges"), "bytes");
    assert.equal(await r.text(), "");
  } finally {
    await s.fechar();
  }
});

test("OPTIONS responde 204 e método diferente de GET/HEAD devolve 405", async () => {
  const s = await subir();
  try {
    assert.equal((await s.pedir(`/audio/${ID}.m4a`, { method: "OPTIONS" })).status, 204);
    assert.equal((await s.pedir(`/audio/${ID}.m4a`, { method: "POST" })).status, 405);
  } finally {
    await s.fechar();
  }
});

test("outro caminho não é da rota: devolve false", async () => {
  const s = await subir();
  try {
    assert.equal((await s.pedir(`/uploads/${ID}`)).status, 404);
    assert.equal((await s.pedir(`/audio/nao-e-uuid.m4a`)).status, 404);
    assert.deepEqual(s.tratados, [false, false]);
  } finally {
    await s.fechar();
  }
});
