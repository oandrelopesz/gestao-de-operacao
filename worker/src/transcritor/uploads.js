// Recebe arquivos do navegador em partes (retomável), direto na VPS — nada passa pelo Drive nem
// pelo banco. Protocolo:
//   POST /uploads/:id       → { recebido }  (quanto já chegou; 0 no começo)
//   PUT  /uploads/:id?offset=N  (corpo = parte de até 16 MB, a partir de N) → { recebido }
//   POST /uploads/:id/fim   → confere o tamanho e põe a transcrição na fila ("aguardando")
import { mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { AcessoNegado } from "./auth.js";

export const PARTE_MAX = 16 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function caminhoUpload(pasta, id) {
  return join(pasta, "uploads", `${id}.bin`);
}

async function tamanhoAtual(caminho) {
  try {
    return (await stat(caminho)).size;
  } catch {
    return 0;
  }
}

export function aplicarCors(req, res, origens) {
  const origem = req.headers.origin;
  if (origem && origens.includes(origem)) {
    res.setHeader("Access-Control-Allow-Origin", origem);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-google-id-token");
  res.setHeader("Access-Control-Max-Age", "600");
}

function responder(res, status, corpo) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(corpo));
}

/** Devolve um tratador `(req, res) => Promise<boolean>` (true = era uma rota de upload). */
export function criarRotasUpload({ pasta, banco, verificar, origens }) {
  return async function tratar(req, res) {
    const url = new URL(req.url, "http://local");
    const m = /^\/uploads\/([^/]+)(\/fim)?\/?$/.exec(url.pathname);
    if (!m) return false;
    aplicarCors(req, res, origens);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return true;
    }
    const recusar = (status, corpo) => {
      req.resume(); // descarta o corpo que não vamos usar
      responder(res, status, corpo);
      return true;
    };
    const id = m[1];
    const fim = !!m[2];
    if (!UUID.test(id)) return recusar(400, { erro: "id inválido" });
    try {
      await verificar(req.headers["x-google-id-token"]);
      const linha = await banco.linha(id);
      if (!linha || linha.origem !== "arquivo") return recusar(404, { erro: "Transcrição não encontrada (foi cancelada?)" });
      if (linha.status !== "enviando") return recusar(409, { erro: "Este arquivo já foi enviado", status: linha.status });
      await mkdir(join(pasta, "uploads"), { recursive: true });
      const arquivo = caminhoUpload(pasta, id);
      const recebido = await tamanhoAtual(arquivo);

      if (req.method === "POST" && !fim) return recusar(200, { recebido });

      if (req.method === "PUT" && !fim) {
        const offset = Number(url.searchParams.get("offset"));
        if (offset !== recebido) return recusar(409, { erro: "Parte fora de ordem", recebido });
        const tamanho = Number(req.headers["content-length"]);
        if (!(tamanho > 0)) return recusar(411, { erro: "Parte sem tamanho" });
        if (tamanho > PARTE_MAX) return recusar(413, { erro: "Parte grande demais" });
        if (linha.tamanho != null && recebido + tamanho > Number(linha.tamanho)) return recusar(400, { erro: "Passa do tamanho do arquivo" });
        await pipeline(req, createWriteStream(arquivo, { flags: "a" }));
        responder(res, 200, { recebido: await tamanhoAtual(arquivo) });
        return true;
      }

      if (req.method === "POST" && fim) {
        if (linha.tamanho != null && recebido !== Number(linha.tamanho)) return recusar(409, { erro: "Arquivo incompleto", recebido });
        // Entra no fim da fila na hora em que terminou de chegar
        await banco.atualizar(id, { status: "aguardando", posicao: Date.now() }, ["enviando"]);
        return recusar(200, { ok: true });
      }

      return recusar(405, { erro: "Método não permitido" });
    } catch (e) {
      if (e instanceof AcessoNegado) return recusar(401, { erro: e.message });
      console.error(JSON.stringify({ evento: "upload.erro", id, erro: String(e?.message || e) }));
      return recusar(500, { erro: "Erro ao receber o arquivo" });
    }
  };
}
