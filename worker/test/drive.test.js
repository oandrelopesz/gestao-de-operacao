import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarDrive, DriveIndisponivel } from "../src/drive.js";

/** fetch de mentira: devolve as respostas da fila e guarda as chamadas */
function fakeFetch(respostas) {
  const chamadas = [];
  const fn = async (url, init = {}) => {
    chamadas.push({ url: String(url), init });
    const proxima = respostas.shift();
    if (!proxima) throw new Error(`fetch inesperado: ${url}`);
    return {
      ok: proxima.status < 400,
      status: proxima.status,
      headers: new Map(Object.entries(proxima.headers || {})),
      json: async () => proxima.body ?? {},
      text: async () => JSON.stringify(proxima.body ?? {}),
    };
  };
  fn.chamadas = chamadas;
  return fn;
}

const TOKEN_OK = { status: 200, body: { access_token: "tok123", expires_at: new Date(Date.now() + 3600e3).toISOString() } };

test("garantirPasta reaproveita a pasta existente", async () => {
  const f = fakeFetch([TOKEN_OK, { status: 200, body: { files: [{ id: "p1", name: "Carrossel X", webViewLink: "https://drive/p1" }] } }]);
  const drive = criarDrive({ supabaseUrl: "https://sb.test", swipeKey: "k", fetch: f });
  const pasta = await drive.garantirPasta("Carrossel X", "pai1");
  assert.equal(pasta.id, "p1");
  assert.match(f.chamadas[0].url, /\/functions\/v1\/google-token$/);
  assert.equal(f.chamadas[0].init.headers["x-swipe-key"], "k");
  assert.match(f.chamadas[1].url, /files\?q=/);
});

test("garantirPasta cria quando não existe", async () => {
  const f = fakeFetch([
    TOKEN_OK,
    { status: 200, body: { files: [] } },
    { status: 200, body: { id: "novo", name: "Carrossel X", webViewLink: "https://drive/novo" } },
  ]);
  const drive = criarDrive({ supabaseUrl: "https://sb.test", swipeKey: "k", fetch: f });
  const pasta = await drive.garantirPasta("Carrossel X", "pai1");
  assert.equal(pasta.id, "novo");
  assert.equal(f.chamadas[2].init.method, "POST");
});

test("token só é pedido uma vez enquanto vale", async () => {
  const f = fakeFetch([TOKEN_OK, { status: 200, body: { files: [{ id: "p1" }] } }, { status: 200, body: { files: [{ id: "p2" }] } }]);
  const drive = criarDrive({ supabaseUrl: "https://sb.test", swipeKey: "k", fetch: f });
  await drive.garantirPasta("A", "pai");
  await drive.garantirPasta("B", "pai");
  assert.equal(f.chamadas.filter((c) => c.url.includes("google-token")).length, 1);
});

test("google-token fora do ar vira DriveIndisponivel", async () => {
  const f = fakeFetch([{ status: 503, body: { error: "Google Drive não conectado" } }]);
  const drive = criarDrive({ supabaseUrl: "https://sb.test", swipeKey: "k", fetch: f });
  await assert.rejects(() => drive.garantirPasta("A", "pai"), DriveIndisponivel);
});

test("subirArquivo faz upload resumível e devolve os metadados", async () => {
  const dir = await mkdtemp(join(tmpdir(), "swipe-"));
  const caminho = join(dir, "v.mp4");
  await writeFile(caminho, Buffer.alloc(1024, 7));
  const f = fakeFetch([
    TOKEN_OK,
    { status: 200, headers: { location: "https://upload.sessao/1" } },
    { status: 200, body: { id: "f1", name: "v.mp4", mimeType: "video/mp4", webViewLink: "https://drive/f1", size: "1024" } },
  ]);
  const drive = criarDrive({ supabaseUrl: "https://sb.test", swipeKey: "k", fetch: f });
  const arq = await drive.subirArquivo(caminho, { nome: "Vídeo - X.mp4", paiId: "pai1", mime: "video/mp4" });
  assert.equal(arq.id, "f1");
  assert.equal(f.chamadas[1].init.headers["X-Upload-Content-Type"], "video/mp4");
  assert.match(f.chamadas[2].init.headers["Content-Range"], /^bytes 0-1023\/1024$/);
  await rm(dir, { recursive: true, force: true });
});

test("criarDoc manda multipart com o mime do Google Docs", async () => {
  const f = fakeFetch([TOKEN_OK, { status: 200, body: { id: "d1", webViewLink: "https://docs/d1" } }]);
  const drive = criarDrive({ supabaseUrl: "https://sb.test", swipeKey: "k", fetch: f });
  const doc = await drive.criarDoc("pai1", "Oferta - X", "https://site.com\n\nMotivo: bloqueado");
  assert.equal(doc.id, "d1");
  assert.match(f.chamadas[1].init.body, /vnd\.google-apps\.document/);
  assert.match(f.chamadas[1].init.body, /Motivo: bloqueado/);
});

test("token vencido é renovado", async () => {
  const tokenVencido = { status: 200, body: { access_token: "tok_vencido", expires_at: new Date(Date.now() - 3600e3).toISOString() } };
  const tokenNovo = { status: 200, body: { access_token: "tok_novo", expires_at: new Date(Date.now() + 3600e3).toISOString() } };
  const f = fakeFetch([
    tokenVencido,
    { status: 200, body: { files: [{ id: "p1" }] } },
    tokenNovo,
    { status: 200, body: { files: [{ id: "p2" }] } },
  ]);
  const drive = criarDrive({ supabaseUrl: "https://sb.test", swipeKey: "k", fetch: f });
  await drive.garantirPasta("A", "pai");
  await drive.garantirPasta("B", "pai");
  const tokenCalls = f.chamadas.filter((c) => c.url.includes("google-token"));
  assert.equal(tokenCalls.length, 2, "deve pedir token duas vezes quando o primeiro venceu");
});

test("403 do google-token continua sendo DriveIndisponivel", async () => {
  // 403 (chave errada) ou 409 (Drive desconectado) são erros de configuração que afetam
  // TODOS os jobs. Se consumissem tentativa, cada item da fila viraria "falhou" com um Docs
  // inútil. Tratados como DriveIndisponivel, os jobs ficam na fila e andam sozinhos quando
  // a chave/conexão for corrigida.
  const f = fakeFetch([{ status: 403, body: { error: "Chave inválida" } }]);
  const drive = criarDrive({ supabaseUrl: "https://sb.test", swipeKey: "k", fetch: f });
  await assert.rejects(() => drive.garantirPasta("A", "pai"), DriveIndisponivel);
});

test("erro 404 no upload vira Error comum, não DriveIndisponivel", async () => {
  const dir = await mkdtemp(join(tmpdir(), "swipe-"));
  const caminho = join(dir, "v.mp4");
  await writeFile(caminho, Buffer.alloc(100, 7));
  const f = fakeFetch([
    TOKEN_OK,
    { status: 404, body: { error: { message: "Pasta pai não encontrada" } } },
  ]);
  const drive = criarDrive({ supabaseUrl: "https://sb.test", swipeKey: "k", fetch: f });
  await assert.rejects(() => drive.subirArquivo(caminho, { nome: "v.mp4", paiId: "pai1", mime: "video/mp4" }), (err) => {
    return !(err instanceof DriveIndisponivel);
  });
  await rm(dir, { recursive: true, force: true });
});

test("falha de rede vira DriveIndisponivel", async () => {
  const fetchComFalha = async () => {
    throw new Error("ECONNREFUSED");
  };
  const drive = criarDrive({ supabaseUrl: "https://sb.test", swipeKey: "k", fetch: fetchComFalha });
  await assert.rejects(() => drive.garantirPasta("A", "pai"), DriveIndisponivel);
});

test("arquivo de 0 byte vira Error comum", async () => {
  const dir = await mkdtemp(join(tmpdir(), "swipe-"));
  const caminho = join(dir, "empty.mp4");
  await writeFile(caminho, Buffer.alloc(0));
  const f = fakeFetch([TOKEN_OK]);
  const drive = criarDrive({ supabaseUrl: "https://sb.test", swipeKey: "k", fetch: f });
  await assert.rejects(
    () => drive.subirArquivo(caminho, { nome: "empty.mp4", paiId: "pai1", mime: "video/mp4" }),
    { message: "O arquivo baixado está vazio (0 bytes)" }
  );
  await rm(dir, { recursive: true, force: true });
});
