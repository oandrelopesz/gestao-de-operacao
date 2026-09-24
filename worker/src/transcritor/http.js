// POST sem o limite de 5 min do `fetch` do Node (o undici desiste se a resposta não começa em
// 300 s). O Speaches só responde quando termina o trecho inteiro, e na CPU da VPS isso pode passar
// de 5 min. Mesma "cara" do fetch para quem usa: `{ ok, status, text() }`.
import http from "node:http";
import https from "node:https";

const LIMITE_PADRAO_MS = 45 * 60 * 1000;

export async function postarLongo(url, { body, signal, timeoutMs = LIMITE_PADRAO_MS } = {}) {
  // O Request do próprio Node monta o multipart (boundary + Content-Type) a partir do FormData
  const pedido = new Request(url, { method: "POST", body });
  const corpo = Buffer.from(await pedido.arrayBuffer());
  const headers = { "Content-Length": corpo.length };
  const tipo = pedido.headers.get("content-type");
  if (tipo) headers["Content-Type"] = tipo;
  const alvo = new URL(url);
  const modulo = alvo.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = modulo.request(alvo, { method: "POST", headers, signal }, (res) => {
      const partes = [];
      res.on("data", (c) => partes.push(c));
      res.on("error", reject);
      res.on("end", () => {
        const texto = Buffer.concat(partes).toString("utf8");
        const status = res.statusCode || 0;
        resolve({ ok: status >= 200 && status < 300, status, text: async () => texto });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`sem resposta em ${Math.round(timeoutMs / 60000)} min`)));
    req.on("error", reject);
    req.end(corpo);
  });
}
