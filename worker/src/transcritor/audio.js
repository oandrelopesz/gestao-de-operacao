// Serve o áudio (.m4a) de cada transcrição para o player da aba: GET /audio/<uuid>.m4a
// Aceita Range (o navegador pula trechos sem baixar tudo) e HEAD (só cabeçalhos).
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { aplicarCors } from "./uploads.js";

const UUID = /^\/audio\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.m4a$/i;

export function caminhoAudio(pasta, id) {
  return join(pasta, "audios", `${id}.m4a`);
}

/**
 * Lê um Range simples ("bytes=a-b", "bytes=a-", "bytes=-n").
 * Devolve { inicio, fim } (fim inclusivo) ou null se for inválido ou fora do tamanho.
 */
function lerRange(valor, total) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(valor || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let inicio;
  let fim;
  if (m[1] === "") {
    // sufixo: os últimos n bytes
    const n = Number(m[2]);
    if (n === 0) return null;
    inicio = Math.max(0, total - n);
    fim = total - 1;
  } else {
    inicio = Number(m[1]);
    fim = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
  }
  if (total === 0 || inicio >= total || inicio > fim) return null;
  return { inicio, fim };
}

/** Devolve um tratador `(req, res) => Promise<boolean>` (true = era a rota de áudio). */
export function criarRotaAudio({ pasta, origens }) {
  return async function tratar(req, res) {
    const url = new URL(req.url, "http://local");
    const m = UUID.exec(url.pathname);
    if (!m) return false;
    aplicarCors(req, res, origens);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return true;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD, OPTIONS" });
      res.end();
      return true;
    }

    const caminho = caminhoAudio(pasta, m[1]);
    let total;
    try {
      total = (await stat(caminho)).size;
    } catch {
      res.writeHead(404);
      res.end();
      return true;
    }

    const base = { "Content-Type": "audio/mp4", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
    const pedido = req.headers.range;
    let inicio = 0;
    let fim = total - 1;

    if (pedido !== undefined) {
      const faixa = lerRange(pedido, total);
      if (!faixa) {
        res.writeHead(416, { ...base, "Content-Range": `bytes */${total}`, "Content-Length": 0 });
        res.end();
        return true;
      }
      ({ inicio, fim } = faixa);
      res.writeHead(206, { ...base, "Content-Range": `bytes ${inicio}-${fim}/${total}`, "Content-Length": fim - inicio + 1 });
    } else {
      res.writeHead(200, { ...base, "Content-Length": total });
    }

    if (req.method === "HEAD" || total === 0) {
      res.end();
      return true;
    }
    try {
      await pipeline(createReadStream(caminho, { start: inicio, end: fim }), res);
    } catch {
      // cliente fechou no meio (ex.: o navegador parou de pedir o trecho)
      res.destroy();
    }
    return true;
  };
}
