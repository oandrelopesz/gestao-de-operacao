import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { postarLongo } from "../src/transcritor/http.js";

function servidor(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${s.address().port}`, fechar: () => s.close() }));
  });
}

test("postarLongo envia multipart e devolve a resposta (ok, status, text)", async () => {
  let recebido = "";
  let tipo = "";
  const s = await servidor((req, res) => {
    tipo = req.headers["content-type"];
    req.on("data", (c) => (recebido += c));
    req.on("end", () => setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"text":"olá"}'); }, 300));
  });
  try {
    const form = new FormData();
    form.set("model", "turbo");
    form.set("file", new Blob(["abc"]), "a.ogg");
    const r = await postarLongo(`${s.url}/v1/audio/transcriptions`, { body: form });
    assert.equal(r.ok, true);
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(await r.text()), { text: "olá" });
    assert.match(tipo, /^multipart\/form-data; boundary=/);
    assert.match(recebido, /name="model"\r\n\r\nturbo/);
    assert.match(recebido, /filename="a.ogg"/);
  } finally {
    s.fechar();
  }
});

test("postarLongo devolve ok=false com o status de erro", async () => {
  const s = await servidor((req, res) => { req.resume(); req.on("end", () => { res.writeHead(500); res.end("falhou"); }); });
  try {
    const r = await postarLongo(s.url, { body: new FormData() });
    assert.equal(r.ok, false);
    assert.equal(r.status, 500);
    assert.equal(await r.text(), "falhou");
  } finally {
    s.fechar();
  }
});

test("postarLongo para quando o signal aborta", async () => {
  const s = await servidor(() => {}); // nunca responde
  try {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 100);
    await assert.rejects(postarLongo(s.url, { body: new FormData(), signal: ac.signal }));
  } finally {
    s.fechar();
  }
});
