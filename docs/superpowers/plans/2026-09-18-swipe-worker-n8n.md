# Swipe file fase 3 — worker de download + n8n — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colar um link na aba `/swipe` passa a baixar, renomear e organizar o conteúdo sozinho no Google Drive — vídeo, criativo, post, carrossel, landing page ou site — sem o PC do usuário ligado.

**Architecture:** Um serviço HTTP stateless (`worker/`) roda em container no Docker Swarm da VPS e sabe apenas executar um job: baixar, empacotar e subir no Drive. O n8n é o dono do estado — um workflow agendado lê `swipe_jobs` no Supabase via PostgREST, chama `POST http://swipe_worker:8080/job` pela rede overlay interna, grava o resultado e trata retentativa e aviso de falha. A imagem é construída no GitHub Actions e publicada no GHCR, porque Swarm não aceita `build:` em stack.

**Tech Stack:** Node 22 (ESM, `node:test`, `node:http` — sem framework), yt-dlp, gallery-dl, ffmpeg, wget, single-file-cli, Playwright/Chromium, Docker Swarm, Portainer CE 2.45, n8n 1.x, Supabase PostgREST, Evolution API.

**Spec:** `docs/superpowers/specs/2026-09-18-swipe-worker-n8n-design.md` (e a fase 1–2 em `docs/superpowers/specs/2026-09-18-swipe-file-design.md`)

## Global Constraints

- **Supabase do swipe:** `https://bnpvzguapunsztsdvmrs.supabase.co`. O projeto `ckjvebnhdepcwjqkmnar` é o banco de leads e **não** deve ser tocado.
- **Node 22**, ESM (`"type": "module"`), testes com `node --test`. Node 20 **não serve**: o
  `single-file-cli` usa as globais `WebSocket` e `CloseEvent`, que só existem a partir do Node 22.
- Nenhuma dependência de teste externa.
- **Dependências npm do worker:** somente `playwright-core` e `single-file-cli`. Tudo mais vem do sistema (apt) ou da lib padrão.
- **Rede Docker:** `ALDigitalNet`, overlay, externa. O serviço recebe o alias `swipe_worker` e escuta na porta `8080`. Nunca é publicado no Traefik.
- **Imagem:** `ghcr.io/oandrelopesz/swipe-worker:latest`, pública.
- **Repositório GitHub:** `oandrelopesz/gestao-de-operacao`, branch `main`.
- **Orçamento de tempo:** o worker sempre responde antes de o n8n desistir. Captura de LP tem
  orçamento de 12 min (`ORCAMENTO_MS`), download tem 13 min, e a chamada HTTP do n8n espera
  1800000 ms (30 min). Quem limita o tempo é o worker, nunca o cliente.
- **Limite de nome no Drive:** 180 caracteres antes da extensão; caracteres `\ / : * ? " < > |` viram `-`.
- **Idioma:** código, comentários, mensagens de erro e commits em português, como o resto do repositório.
- **Commits:** terminar a mensagem com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Segredos nunca entram no repositório.** `SWIPE_KEY` e `WORKER_KEY` só existem como variáveis de ambiente da stack no Portainer.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `worker/package.json` | ESM, script `test`, deps `playwright-core` e `single-file-cli` |
| `worker/src/nomes.js` | Sanitização, corte, extensão, nome de card/VSL, nome único |
| `worker/src/drive.js` | Token via `google-token`, criar pasta, upload resumível, criar Docs |
| `worker/src/exec.js` | `rodar()` — execFile com timeout e erro tipado |
| `worker/src/tmp.js` | Pasta temporária por job com limpeza garantida; listar mídias |
| `worker/src/jobs/download.js` | yt-dlp → gallery-dl → classifica único/carrossel |
| `worker/src/jobs/lp.js` | Playwright: single-file, mirror zip, print, VSLs |
| `worker/src/publicar.js` | Pega o resultado de um job e sobe tudo no Drive na estrutura certa |
| `worker/src/config.js` | Lê e valida env no boot |
| `worker/src/server.js` | HTTP, autenticação, concorrência 1, roteamento dos jobs |
| `worker/Dockerfile` | Debian slim + Node 22 + binários + Chromium |
| `.github/workflows/swipe-worker.yml` | Build e push para o GHCR |
| `infra/swipe-worker/stack.yml` | Stack Swarm para o Portainer |
| `infra/swipe-worker/n8n-workflow.json` | Workflow `[SWIPE] Fila de downloads` |
| `src/lib/swipe.ts` | (modificar) `reenfileirarItem()` e nome de card igual ao worker |
| `src/routes/_authenticated/swipe.tsx` | (modificar) botão "Tentar de novo" |

---

### Task 1: Esqueleto do worker e regras de nome

**Files:**
- Create: `worker/package.json`
- Create: `worker/.dockerignore`
- Create: `worker/src/nomes.js`
- Test: `worker/test/nomes.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `sanitizar(nome) -> string`, `limitar(base, extensao?) -> string`, `extensaoDe(caminho) -> string`, `nomeCard(base, indice, extensao) -> string`, `nomeVsl(base, indice) -> string`, `nomeUnico(desejado, existentes: string[]) -> string`, `ehVideo(ext) -> boolean`, `ehImagem(ext) -> boolean`, `mimeDe(ext) -> string`.

- [ ] **Step 1: Criar o `package.json`**

```json
{
  "name": "swipe-worker",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Baixa links do swipe file e sobe no Google Drive",
  "scripts": {
    "test": "node --test",
    "start": "node src/server.js"
  },
  "dependencies": {
    "playwright-core": "1.47.2",
    "single-file-cli": "2.0.73"
  }
}
```

- [ ] **Step 2: Criar o `.dockerignore`**

```
node_modules
test
npm-debug.log
```

- [ ] **Step 3: Escrever o teste que falha**

```js
// worker/test/nomes.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizar, limitar, extensaoDe, nomeCard, nomeVsl, nomeUnico, ehVideo, ehImagem, mimeDe } from "../src/nomes.js";

test("sanitizar troca caracteres proibidos por hífen e colapsa espaços", () => {
  assert.equal(sanitizar('Oferta: "Dr. Fulano" / 2026'), "Oferta- -Dr. Fulano- - 2026");
  assert.equal(sanitizar("  Vídeo   de   anúncio  "), "Vídeo de anúncio");
});

test("limitar corta em 180 caracteres contando a extensão", () => {
  const base = "a".repeat(300);
  const nome = limitar(base, "mp4");
  assert.equal(nome.length, 180);
  assert.ok(nome.endsWith(".mp4"));
});

test("limitar sem extensão devolve só o nome sanitizado", () => {
  assert.equal(limitar("Carrossel - Médico - Dr Fulano"), "Carrossel - Médico - Dr Fulano");
});

test("extensaoDe pega a extensão em minúsculas", () => {
  assert.equal(extensaoDe("/tmp/x/video.MP4"), "mp4");
  assert.equal(extensaoDe("/tmp/x/sem-extensao"), "");
});

test("nomeCard numera com dois dígitos", () => {
  assert.equal(nomeCard("Carrossel - Médico - Dr Fulano", 1, "jpg"), "Carrossel - Médico - Dr Fulano - 01.jpg");
  assert.equal(nomeCard("Carrossel - Médico - Dr Fulano", 12, "png"), "Carrossel - Médico - Dr Fulano - 12.png");
});

test("nomeVsl sempre em mp4", () => {
  assert.equal(nomeVsl("Landing page - Médico - Dr Fulano", 2), "Landing page - Médico - Dr Fulano - VSL 02.mp4");
});

test("nomeUnico acrescenta sufixo quando o nome já existe", () => {
  assert.equal(nomeUnico("video.mp4", []), "video.mp4");
  assert.equal(nomeUnico("video.mp4", ["video.mp4"]), "video (2).mp4");
  assert.equal(nomeUnico("video.mp4", ["video.mp4", "video (2).mp4"]), "video (3).mp4");
  assert.equal(nomeUnico("pasta", ["pasta"]), "pasta (2)");
});

test("classificação por extensão", () => {
  assert.ok(ehVideo("mp4"));
  assert.ok(ehVideo("webm"));
  assert.ok(!ehVideo("jpg"));
  assert.ok(ehImagem("jpeg"));
  assert.ok(!ehImagem("mp4"));
  assert.equal(mimeDe("mp4"), "video/mp4");
  assert.equal(mimeDe("jpg"), "image/jpeg");
  assert.equal(mimeDe("xyz"), "application/octet-stream");
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `cd worker && node --test test/nomes.test.js`
Expected: FAIL — `Cannot find module '../src/nomes.js'`

- [ ] **Step 5: Escrever a implementação**

```js
// worker/src/nomes.js
// Regras de nome do swipe file. O `base` vem pronto do app
// ("Vídeo de anúncio - Médico - Ortopedia - Dr Fulano"); aqui só cuidamos de
// sanitizar, cortar no limite do Drive e numerar cards e VSLs.

const PROIBIDOS = /[\\/:*?"<>|]/g;
const LIMITE = 180;

const VIDEOS = new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v"]);
const IMAGENS = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic"]);
const MIMES = {
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
  avi: "video/x-msvideo", m4v: "video/x-m4v",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", bmp: "image/bmp", heic: "image/heic",
  html: "text/html", zip: "application/zip", pdf: "application/pdf", txt: "text/plain",
};

export function sanitizar(nome) {
  return String(nome).replace(PROIBIDOS, "-").replace(/\s+/g, " ").trim();
}

/** Nome pronto para o Drive: sanitizado e cortado em 180 caracteres com a extensão. */
export function limitar(base, extensao = "") {
  const limpo = sanitizar(base);
  const sufixo = extensao ? `.${extensao}` : "";
  const max = LIMITE - sufixo.length;
  const cortado = limpo.length > max ? limpo.slice(0, max).trim() : limpo;
  return `${cortado}${sufixo}`;
}

export function extensaoDe(caminho) {
  const m = String(caminho).match(/\.([a-z0-9]{1,6})$/i);
  return m ? m[1].toLowerCase() : "";
}

export function nomeCard(base, indice, extensao) {
  return limitar(`${base} - ${String(indice).padStart(2, "0")}`, extensao);
}

export function nomeVsl(base, indice) {
  return limitar(`${base} - VSL ${String(indice).padStart(2, "0")}`, "mp4");
}

/** Evita sobrescrever: "video.mp4" vira "video (2).mp4" se já existir. */
export function nomeUnico(desejado, existentes) {
  const usados = new Set(existentes);
  if (!usados.has(desejado)) return desejado;
  const ext = extensaoDe(desejado);
  const sufixo = ext ? `.${ext}` : "";
  const raiz = ext ? desejado.slice(0, -sufixo.length) : desejado;
  for (let i = 2; i < 1000; i++) {
    const tentativa = `${raiz} (${i})${sufixo}`;
    if (!usados.has(tentativa)) return tentativa;
  }
  return `${raiz} (${Date.now()})${sufixo}`;
}

export const ehVideo = (ext) => VIDEOS.has(String(ext).toLowerCase());
export const ehImagem = (ext) => IMAGENS.has(String(ext).toLowerCase());
export const ehMidia = (ext) => ehVideo(ext) || ehImagem(ext);
export const mimeDe = (ext) => MIMES[String(ext).toLowerCase()] || "application/octet-stream";
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `cd worker && node --test test/nomes.test.js`
Expected: PASS — 8 testes

- [ ] **Step 7: Commit**

```bash
git add worker/package.json worker/.dockerignore worker/src/nomes.js worker/test/nomes.test.js
git commit -m "$(cat <<'EOF'
Swipe worker: esqueleto do serviço e regras de nome no Drive

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Cliente do Google Drive

**Files:**
- Create: `worker/src/drive.js`
- Test: `worker/test/drive.test.js`

**Interfaces:**
- Consumes: `limitar`, `nomeUnico` de `../src/nomes.js`.
- Produces: `criarDrive({ supabaseUrl, swipeKey, fetch? }) -> { garantirPasta, subirArquivo, criarDoc, nomesEm }` e a classe `DriveIndisponivel`.
  - `garantirPasta(nome, paiId) -> { id, name, webViewLink }`
  - `subirArquivo(caminho, { nome, paiId, mime }) -> { id, name, webViewLink, thumbnailLink, size }`
  - `criarDoc(paiId, nome, texto) -> { id, name, webViewLink }`
  - `nomesEm(paiId) -> string[]`

- [ ] **Step 1: Escrever o teste que falha**

```js
// worker/test/drive.test.js
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd worker && node --test test/drive.test.js`
Expected: FAIL — `Cannot find module '../src/drive.js'`

- [ ] **Step 3: Escrever a implementação**

```js
// worker/src/drive.js
// Acesso ao Google Drive usando o access token que a edge function `google-token`
// entrega em troca do header `x-swipe-key`. O worker nunca vê client id/secret.
import { open, stat } from "node:fs/promises";

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const PASTA_MIME = "application/vnd.google-apps.folder";
const DOC_MIME = "application/vnd.google-apps.document";
const CAMPOS = "id,name,mimeType,webViewLink,thumbnailLink,size";
const PEDACO = 8 * 1024 * 1024; // múltiplo de 256 KB exigido pelo Drive

/** Falha de infraestrutura: o n8n reagenda sem consumir tentativa. */
export class DriveIndisponivel extends Error {}

const escapar = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export function criarDrive({ supabaseUrl, swipeKey, fetch: _fetch = fetch }) {
  let cache = null; // { token, validoAte }

  async function token() {
    if (cache && cache.validoAte - Date.now() > 60_000) return cache.token;
    const r = await _fetch(`${supabaseUrl}/functions/v1/google-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-swipe-key": swipeKey },
      body: "{}",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) {
      throw new DriveIndisponivel(data.error || `google-token respondeu ${r.status}`);
    }
    cache = { token: data.access_token, validoAte: new Date(data.expires_at).getTime() || Date.now() + 3000_000 };
    return cache.token;
  }

  async function api(caminho, init = {}, base = DRIVE) {
    const t = await token();
    const r = await _fetch(`${base}${caminho}`, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` },
    });
    if (r.status === 401) {
      cache = null;
      throw new DriveIndisponivel("Token do Google expirou ou foi revogado. Reconecte o Drive no Admin.");
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.error?.message || `Drive respondeu ${r.status}`;
      if (r.status >= 500 || r.status === 429) throw new DriveIndisponivel(msg);
      throw new Error(msg);
    }
    return data;
  }

  async function garantirPasta(nome, paiId) {
    const q = `name='${escapar(nome)}' and mimeType='${PASTA_MIME}' and '${paiId}' in parents and trashed=false`;
    const achou = await api(`/files?q=${encodeURIComponent(q)}&fields=files(${CAMPOS})&pageSize=5`);
    if (achou.files?.length) return achou.files[0];
    return api(`/files?fields=${CAMPOS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nome, mimeType: PASTA_MIME, parents: [paiId] }),
    });
  }

  async function nomesEm(paiId) {
    const q = `'${paiId}' in parents and trashed=false`;
    const r = await api(`/files?q=${encodeURIComponent(q)}&fields=files(name)&pageSize=1000`);
    return (r.files || []).map((f) => f.name);
  }

  async function subirArquivo(caminho, { nome, paiId, mime }) {
    const { size } = await stat(caminho);
    const t = await token();
    const inicio = await _fetch(`${UPLOAD}/files?uploadType=resumable&fields=${CAMPOS}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": mime,
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify({ name: nome, parents: [paiId] }),
    });
    if (!inicio.ok) {
      const txt = await inicio.text().catch(() => "");
      throw new DriveIndisponivel(`Drive recusou iniciar o upload (${inicio.status}): ${txt.slice(0, 200)}`);
    }
    const sessao = inicio.headers.get("location");
    if (!sessao) throw new DriveIndisponivel("Drive não devolveu a URL da sessão de upload");

    const fh = await open(caminho, "r");
    try {
      let enviado = 0;
      while (enviado < size) {
        const tamanho = Math.min(PEDACO, size - enviado);
        const buf = Buffer.alloc(tamanho);
        await fh.read(buf, 0, tamanho, enviado);
        const fim = enviado + tamanho - 1;
        const r = await _fetch(sessao, {
          method: "PUT",
          headers: { "Content-Range": `bytes ${enviado}-${fim}/${size}`, "Content-Length": String(tamanho) },
          body: buf,
        });
        if (r.status === 308) {
          enviado = fim + 1;
          continue;
        }
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new DriveIndisponivel(`Upload falhou (${r.status}): ${txt.slice(0, 200)}`);
        }
        return await r.json();
      }
      throw new DriveIndisponivel("Upload terminou sem resposta final do Drive");
    } finally {
      await fh.close();
    }
  }

  async function criarDoc(paiId, nome, texto) {
    const limite = "swipe" + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name: nome, mimeType: DOC_MIME, parents: [paiId] });
    const corpo =
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${limite}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${texto}\r\n--${limite}--`;
    return api(`/files?uploadType=multipart&fields=${CAMPOS}`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${limite}` },
      body: corpo,
    }, UPLOAD);
  }

  return { garantirPasta, nomesEm, subirArquivo, criarDoc };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd worker && node --test test/drive.test.js`
Expected: PASS — 6 testes

- [ ] **Step 5: Commit**

```bash
git add worker/src/drive.js worker/test/drive.test.js
git commit -m "$(cat <<'EOF'
Swipe worker: cliente do Drive com token da edge function google-token

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Execução de comandos e pasta temporária

**Files:**
- Create: `worker/src/exec.js`
- Create: `worker/src/tmp.js`
- Test: `worker/test/exec.test.js`

**Interfaces:**
- Consumes: `ehMidia`, `extensaoDe` de `../src/nomes.js`.
- Produces:
  - `rodar(cmd, args, { cwd?, timeout?, env? }) -> Promise<{ stdout, stderr }>` e `ComandoFalhou { cmd, code, stderr }`
  - `comPastaTemp(prefixo, fn) -> Promise<qualquer>` — cria, passa o caminho para `fn`, apaga sempre
  - `listarMidias(dir) -> Promise<string[]>` — caminhos absolutos de mídia, ordenados por nome natural

- [ ] **Step 1: Escrever o teste que falha**

```js
// worker/test/exec.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { rodar, ComandoFalhou } from "../src/exec.js";
import { comPastaTemp, listarMidias } from "../src/tmp.js";

test("rodar devolve a saída do comando", async () => {
  const { stdout } = await rodar(process.execPath, ["-e", "process.stdout.write('oi')"]);
  assert.equal(stdout.trim(), "oi");
});

test("rodar lança ComandoFalhou com código e stderr", async () => {
  await assert.rejects(
    () => rodar(process.execPath, ["-e", "process.stderr.write('ruim'); process.exit(3)"]),
    (e) => e instanceof ComandoFalhou && e.code === 3 && e.stderr.includes("ruim"),
  );
});

test("rodar respeita o timeout", async () => {
  await assert.rejects(
    () => rodar(process.execPath, ["-e", "setTimeout(()=>{}, 5000)"], { timeout: 200 }),
    (e) => e instanceof ComandoFalhou && /tempo/i.test(e.message),
  );
});

test("comPastaTemp apaga a pasta mesmo quando dá erro", async () => {
  let criada;
  await assert.rejects(() => comPastaTemp("teste", async (dir) => { criada = dir; throw new Error("ops"); }));
  await assert.rejects(() => readdir(criada));
});

test("listarMidias devolve só mídia, em ordem natural", async () => {
  const achados = await comPastaTemp("teste", async (dir) => {
    await mkdir(join(dir, "sub"));
    await writeFile(join(dir, "10.jpg"), "x");
    await writeFile(join(dir, "2.jpg"), "x");
    await writeFile(join(dir, "nota.txt"), "x");
    await writeFile(join(dir, "sub", "3.jpg"), "x");
    return listarMidias(dir);
  });
  assert.deepEqual(achados.map((c) => c.split(/[\\/]/).pop()), ["2.jpg", "3.jpg", "10.jpg"]);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd worker && node --test test/exec.test.js`
Expected: FAIL — `Cannot find module '../src/exec.js'`

- [ ] **Step 3: Escrever `exec.js`**

```js
// worker/src/exec.js
import { execFile } from "node:child_process";

export class ComandoFalhou extends Error {
  constructor(cmd, code, stderr, mensagem) {
    super(mensagem || `${cmd} terminou com código ${code}`);
    this.name = "ComandoFalhou";
    this.cmd = cmd;
    this.code = code;
    this.stderr = stderr || "";
  }
}

/** execFile com timeout e erro tipado; saída limitada a 10 MB. */
export function rodar(cmd, args, { cwd, timeout = 15 * 60 * 1000, env } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, ...env } }, (erro, stdout, stderr) => {
      if (!erro) return resolve({ stdout: String(stdout), stderr: String(stderr) });
      if (erro.killed || erro.signal === "SIGTERM") {
        return reject(new ComandoFalhou(cmd, erro.code ?? -1, String(stderr), `${cmd} estourou o tempo limite`));
      }
      reject(new ComandoFalhou(cmd, erro.code ?? -1, String(stderr)));
    });
  });
}
```

- [ ] **Step 4: Escrever `tmp.js`**

```js
// worker/src/tmp.js
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ehMidia, extensaoDe } from "./nomes.js";

const RAIZ = process.env.SWIPE_TMP || tmpdir();

/** Cria uma pasta temporária, entrega para `fn` e apaga no fim, com erro ou sem. */
export async function comPastaTemp(prefixo, fn) {
  const dir = await mkdtemp(join(RAIZ, `${prefixo}-`));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Todos os arquivos de mídia abaixo de `dir`, em ordem natural pelo nome. */
export async function listarMidias(dir) {
  const achados = [];
  async function varrer(atual) {
    for (const item of await readdir(atual, { withFileTypes: true })) {
      const caminho = join(atual, item.name);
      if (item.isDirectory()) await varrer(caminho);
      else if (ehMidia(extensaoDe(item.name))) achados.push(caminho);
    }
  }
  await varrer(dir);
  const nome = (c) => c.split(/[\\/]/).pop();
  return achados.sort((a, b) => nome(a).localeCompare(nome(b), "pt-BR", { numeric: true }));
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd worker && node --test test/exec.test.js`
Expected: PASS — 5 testes

- [ ] **Step 6: Commit**

```bash
git add worker/src/exec.js worker/src/tmp.js worker/test/exec.test.js
git commit -m "$(cat <<'EOF'
Swipe worker: execução de comandos com timeout e pasta temporária por job

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Job de download (vídeo, imagem, carrossel)

**Files:**
- Create: `worker/src/jobs/download.js`
- Test: `worker/test/download.test.js`

**Interfaces:**
- Consumes: `rodar`/`ComandoFalhou` de `../exec.js`, `listarMidias` de `../tmp.js`, `ehVideo`/`extensaoDe` de `../nomes.js`.
- Produces: `baixar({ link, rede, dir }, deps?) -> Promise<{ arquivos: string[], modo: "unico"|"carrossel" }>` e `cookiesDe(rede, existe?) -> string|null`.
  - `deps` (para teste): `{ rodar, listarMidias, existeArquivo }`.
  - Lança `Error` comum quando nenhum extrator conseguiu (falha do job, conta tentativa).

- [ ] **Step 1: Escrever o teste que falha**

```js
// worker/test/download.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { baixar, cookiesDe } from "../src/jobs/download.js";
import { ComandoFalhou } from "../src/exec.js";

function deps({ ytdlp, gallery, midias, midiasAposYtdlp = null }) {
  const chamadas = [];
  let vezes = 0;
  return {
    chamadas,
    rodar: async (cmd, args) => {
      chamadas.push({ cmd, args });
      const r = cmd.includes("yt-dlp") ? ytdlp : gallery;
      if (r instanceof Error) throw r;
      return { stdout: "", stderr: "" };
    },
    // `midiasAposYtdlp` é o que a pasta tem na 1ª varredura (logo após o yt-dlp);
    // as varreduras seguintes devolvem `midias`, o estado após o gallery-dl.
    listarMidias: async () => {
      vezes += 1;
      return vezes === 1 && midiasAposYtdlp !== null ? midiasAposYtdlp : midias;
    },
    existeArquivo: () => true,
  };
}

test("vídeo único sai como modo unico", async () => {
  const d = deps({ ytdlp: {}, midias: ["/tmp/j/video.mp4"] });
  const r = await baixar({ link: "https://youtu.be/abc", rede: "youtube", dir: "/tmp/j" }, d);
  assert.deepEqual(r, { arquivos: ["/tmp/j/video.mp4"], modo: "unico" });
  assert.equal(d.chamadas.length, 1);
  assert.ok(d.chamadas[0].cmd.includes("yt-dlp"));
  assert.ok(d.chamadas[0].args.includes("--no-playlist"));
});

test("vários arquivos viram carrossel", async () => {
  const d = deps({ ytdlp: {}, midias: ["/tmp/j/1.jpg", "/tmp/j/2.jpg", "/tmp/j/3.jpg"] });
  const r = await baixar({ link: "https://instagram.com/p/x", rede: "instagram", dir: "/tmp/j" }, d);
  assert.equal(r.modo, "carrossel");
  assert.equal(r.arquivos.length, 3);
});

test("yt-dlp falhando cai para gallery-dl", async () => {
  const d = deps({
    ytdlp: new ComandoFalhou("yt-dlp", 1, "Unsupported URL"),
    gallery: {},
    midiasAposYtdlp: [],
    midias: ["/tmp/j/a.jpg"],
  });
  const r = await baixar({ link: "https://instagram.com/p/x", rede: "instagram", dir: "/tmp/j" }, d);
  assert.equal(r.modo, "unico");
  assert.equal(d.chamadas.length, 2);
  assert.ok(d.chamadas[1].cmd.includes("gallery-dl"));
});

test("yt-dlp que falha mas deixou arquivo NÃO chama gallery-dl", async () => {
  // Falha de pós-processamento depois do download: rodar o gallery-dl por cima duplicaria a mídia
  // e transformaria um vídeo único em "carrossel".
  const d = deps({
    ytdlp: new ComandoFalhou("yt-dlp", 1, "ERROR: postprocessing"),
    gallery: {},
    midias: ["/tmp/j/video.mp4"],
  });
  const r = await baixar({ link: "https://youtu.be/abc", rede: "youtube", dir: "/tmp/j" }, d);
  assert.equal(r.modo, "unico");
  assert.equal(d.chamadas.length, 1, "só o yt-dlp devia ter rodado");
});

test("os dois falhando lança erro com o motivo do yt-dlp", async () => {
  const d = deps({
    ytdlp: new ComandoFalhou("yt-dlp", 1, "ERROR: Video unavailable"),
    gallery: new ComandoFalhou("gallery-dl", 1, "no extractor"),
    midias: [],
  });
  await assert.rejects(
    () => baixar({ link: "https://x.com/y", rede: "outro", dir: "/tmp/j" }, d),
    (e) => /Video unavailable/.test(e.message),
  );
});

test("nenhum arquivo baixado também é erro", async () => {
  const d = deps({ ytdlp: {}, midias: [] });
  await assert.rejects(() => baixar({ link: "https://x.com/y", rede: "outro", dir: "/tmp/j" }, d), /não baixou nenhum arquivo/i);
});

test("cookies entram quando existe arquivo para a rede", async () => {
  assert.equal(cookiesDe("instagram", () => true), "/cookies/instagram.txt");
  assert.equal(cookiesDe("instagram", () => false), null);
  assert.equal(cookiesDe("internet", () => true), null);
});

test("o comando leva --cookies quando a rede tem cookies", async () => {
  const d = deps({ ytdlp: {}, midias: ["/tmp/j/v.mp4"] });
  await baixar({ link: "https://instagram.com/reel/x", rede: "instagram", dir: "/tmp/j" }, d);
  assert.ok(d.chamadas[0].args.includes("--cookies"));
  assert.ok(d.chamadas[0].args.includes("/cookies/instagram.txt"));
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd worker && node --test test/download.test.js`
Expected: FAIL — `Cannot find module '../src/jobs/download.js'`

- [ ] **Step 3: Escrever a implementação**

```js
// worker/src/jobs/download.js
// Baixa vídeo, imagem ou carrossel de um link. Estratégia: yt-dlp primeiro
// (resolve a maioria das redes e URLs diretas); se ele não reconhecer, gallery-dl,
// que é melhor em post/carrossel de Instagram, Pinterest e X.
import { existsSync } from "node:fs";
import { rodar as rodarReal } from "../exec.js";
import { listarMidias as listarReal } from "../tmp.js";

const REDES_COM_COOKIE = new Set(["instagram", "facebook", "tiktok", "linkedin", "x", "pinterest"]);

/** Caminho do cookies.txt montado pela stack, se existir para essa rede. */
export function cookiesDe(rede, existe) {
  const checar = existe || existsSync;
  if (!REDES_COM_COOKIE.has(rede)) return null;
  const caminho = `/cookies/${rede}.txt`;
  return checar(caminho) ? caminho : null;
}

export async function baixar({ link, rede, dir }, deps = {}) {
  const rodar = deps.rodar || rodarReal;
  const listarMidias = deps.listarMidias || listarReal;
  const cookies = cookiesDe(rede, deps.existeArquivo);

  const erros = [];

  const argsYt = [
    link,
    "--no-playlist",
    "--no-warnings",
    "--retries", "3",
    "--socket-timeout", "30",
    "--merge-output-format", "mp4",
    // Prefere até 1080p (referência de swipe file não precisa de mais e limita o disco da VPS),
    // mas cai para o melhor disponível se o vídeo só existir acima disso.
    "-f", "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b",
    "-o", `${dir}/%(title).120s.%(ext)s`,
    "--restrict-filenames",
  ];
  if (cookies) argsYt.push("--cookies", cookies);

  try {
    await rodar("/usr/local/bin/yt-dlp", argsYt, { cwd: dir, timeout: 13 * 60 * 1000 });
  } catch (e) {
    erros.push(`yt-dlp: ${primeiraLinhaDeErro(e)}`);
  }

  let arquivos = await listarMidias(dir);

  if (arquivos.length === 0) {
    const argsGal = ["--dest", dir, "--retries", "3", "--quiet", link];
    if (cookies) argsGal.splice(0, 0, "--cookies", cookies);
    try {
      await rodar("/usr/local/bin/gallery-dl", argsGal, { cwd: dir, timeout: 13 * 60 * 1000 });
    } catch (e) {
      erros.push(`gallery-dl: ${primeiraLinhaDeErro(e)}`);
    }
    arquivos = await listarMidias(dir);
  }

  if (arquivos.length === 0) {
    const detalhe = erros.length ? ` (${erros.join(" | ")})` : "";
    throw new Error(`O link não baixou nenhum arquivo${detalhe}`);
  }

  return { arquivos, modo: arquivos.length > 1 ? "carrossel" : "unico" };
}

function primeiraLinhaDeErro(e) {
  const texto = (e?.stderr || e?.message || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const erro = texto.find((l) => /^error/i.test(l)) || texto[texto.length - 1] || "sem detalhe";
  return erro.slice(0, 200);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd worker && node --test test/download.test.js`
Expected: PASS — 7 testes

- [ ] **Step 5: Commit**

```bash
git add worker/src/jobs/download.js worker/test/download.test.js
git commit -m "$(cat <<'EOF'
Swipe worker: download de vídeo, imagem e carrossel com yt-dlp e gallery-dl

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Job de landing page e site

**Files:**
- Create: `worker/src/jobs/lp.js`
- Test: `worker/test/lp.test.js`

**Interfaces:**
- Consumes: `rodar` de `../exec.js`, `nomeVsl`/`limitar` de `../nomes.js`.
- Produces: `capturar({ link, dir, base }, deps?) -> Promise<{ arquivos: Array<{ caminho, nome, mime }> }>` e `ehUrlDeVideo(url) -> boolean`.
  - `deps` (para teste): `{ rodar, abrirNavegador, existeArquivo, orcamentoMs }`.
  - `abrirNavegador(link) -> { urlsDeVideo: string[], screenshot(caminho): Promise<void>, fechar(): Promise<void> }`
  - **Orçamento:** a captura tem 12 min no total (`ORCAMENTO_MS`). Antes de cada VSL a função
    confere se ainda há tempo; sem tempo, devolve a LP com html/zip/print e para. Isso garante
    que a resposta sai antes do timeout da chamada HTTP do n8n, que é de 30 min.

- [ ] **Step 1: Escrever o teste que falha**

```js
// worker/test/lp.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { capturar, ehUrlDeVideo } from "../src/jobs/lp.js";

test("reconhece URL de vídeo e player conhecido", () => {
  assert.ok(ehUrlDeVideo("https://cdn.site.com/vsl.mp4"));
  assert.ok(ehUrlDeVideo("https://cdn.site.com/stream/master.m3u8?token=1"));
  assert.ok(ehUrlDeVideo("https://scripts.converteai.net/abc/players/xyz/player.js"));
  assert.ok(ehUrlDeVideo("https://player.vimeo.com/video/12345"));
  assert.ok(!ehUrlDeVideo("https://cdn.site.com/estilo.css"));
  assert.ok(!ehUrlDeVideo("https://cdn.site.com/foto.jpg"));
});

function deps({ urlsDeVideo = [], falhas = {} } = {}) {
  const chamadas = [];
  return {
    chamadas,
    rodar: async (cmd, args) => {
      chamadas.push({ cmd, args });
      if (falhas[cmd.split("/").pop()]) throw falhas[cmd.split("/").pop()];
      return { stdout: "", stderr: "" };
    },
    abrirNavegador: async () => ({
      urlsDeVideo,
      screenshot: async () => { chamadas.push({ cmd: "screenshot", args: [] }); },
      fechar: async () => {},
    }),
    existeArquivo: () => true,
  };
}

test("captura gera html, zip e print", async () => {
  const d = deps();
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "Landing page - Médico - Dr X" }, d);
  const nomes = r.arquivos.map((a) => a.nome);
  assert.deepEqual(nomes, [
    "Landing page - Médico - Dr X.html",
    "Landing page - Médico - Dr X - mirror.zip",
    "Landing page - Médico - Dr X - print.png",
  ]);
  assert.ok(d.chamadas.some((c) => c.cmd.includes("single-file")));
  assert.ok(d.chamadas.some((c) => c.cmd.includes("wget")));
  assert.ok(d.chamadas.some((c) => c.cmd.includes("zip")));
  assert.ok(d.chamadas.some((c) => c.cmd === "screenshot"));
});

test("vídeos da página viram arquivos VSL numerados", async () => {
  const d = deps({ urlsDeVideo: ["https://cdn.site.com/a.m3u8", "https://cdn.site.com/b.mp4"] });
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "Site - Nicho - Player" }, d);
  const nomes = r.arquivos.map((a) => a.nome);
  assert.ok(nomes.includes("Site - Nicho - Player - VSL 01.mp4"));
  assert.ok(nomes.includes("Site - Nicho - Player - VSL 02.mp4"));
  assert.equal(d.chamadas.filter((c) => c.cmd.includes("yt-dlp")).length, 2);
});

test("VSL que falha não derruba a captura", async () => {
  const d = deps({ urlsDeVideo: ["https://cdn.site.com/a.m3u8"], falhas: { "yt-dlp": new Error("403") } });
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "Site - N - P" }, d);
  assert.equal(r.arquivos.filter((a) => a.nome.includes("VSL")).length, 0);
  assert.equal(r.arquivos.length, 3);
});

test("single-file falhando derruba o job", async () => {
  const d = deps({ falhas: { "single-file": new Error("chromium morreu") } });
  await assert.rejects(() => capturar({ link: "https://lp.com", dir: "/tmp/j", base: "B" }, d), /chromium morreu/);
});

test("espelho falhando não derruba a captura", async () => {
  const d = deps({ falhas: { zip: new Error("nothing to do") } });
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "LP - N - P" }, d);
  assert.deepEqual(r.arquivos.map((a) => a.nome), ["LP - N - P.html", "LP - N - P - print.png"]);
});

test("VSL que sai sem gravar arquivo não gasta número", async () => {
  let vez = 0;
  const d = deps({ urlsDeVideo: ["https://cdn.site.com/a.mp4", "https://cdn.site.com/b.mp4"] });
  d.existeArquivo = () => { vez += 1; return vez > 1; }; // a 1ª não gravou, a 2ª gravou
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "LP - N - P" }, d);
  const vsls = r.arquivos.filter((a) => a.nome.includes("VSL")).map((a) => a.nome);
  assert.deepEqual(vsls, ["LP - N - P - VSL 01.mp4"], "a VSL que sobrou tem que ser a 01, sem buraco");
});

test("sem orçamento, devolve a LP sem baixar VSL nenhuma", async () => {
  const d = deps({ urlsDeVideo: ["https://cdn.site.com/a.m3u8", "https://cdn.site.com/b.mp4"] });
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "Site - N - P" }, { ...d, orcamentoMs: -1 });
  assert.equal(r.arquivos.filter((a) => a.nome.includes("VSL")).length, 0);
  assert.equal(r.arquivos.length, 3, "html, zip e print continuam sendo entregues");
  assert.equal(d.chamadas.filter((c) => c.cmd.includes("yt-dlp")).length, 0);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd worker && node --test test/lp.test.js`
Expected: FAIL — `Cannot find module '../src/jobs/lp.js'`

- [ ] **Step 3: Escrever a implementação**

```js
// worker/src/jobs/lp.js
// Captura de landing page / site em três formatos, para o usuário fazer o que quiser depois:
//   .html          página single-file (tudo embutido, abre offline)
//   - mirror.zip   espelho com os arquivos separados, para editar
//   - print.png    screenshot de página inteira
// Mais um arquivo por vídeo/VSL encontrado na página.
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { rodar as rodarReal } from "../exec.js";
import { limitar, nomeVsl } from "../nomes.js";

/** Orçamento total de uma captura de LP, com folga sobre o timeout da chamada HTTP do n8n. */
const ORCAMENTO_MS = 12 * 60 * 1000;

const EXT_VIDEO = /\.(mp4|m3u8|webm|mov|mpd)(\?|$)/i;
const PLAYERS = /(converteai\.net|vturb|pandavideo|player\.vimeo\.com|youtube\.com\/embed|youtu\.be|wistia\.(net|com)|vidyard|jwplayer)/i;

export function ehUrlDeVideo(url) {
  const u = String(url);
  if (/\.(css|js|png|jpe?g|gif|svg|woff2?|ico)(\?|$)/i.test(u) && !PLAYERS.test(u)) return false;
  return EXT_VIDEO.test(u) || PLAYERS.test(u);
}

export async function capturar({ link, dir, base }, deps = {}) {
  const rodar = deps.rodar || rodarReal;
  const abrir = deps.abrirNavegador || abrirNavegadorReal;
  const existe = deps.existeArquivo || existsSync;
  // Orçamento total da captura. O n8n corta a chamada HTTP bem depois disso, então a resposta
  // sempre sai daqui antes de ele desistir — senão o job seria retentado com o worker ocupado.
  const prazo = Date.now() + (deps.orcamentoMs ?? ORCAMENTO_MS);

  const arquivos = [];
  const htmlLocal = join(dir, "pagina.html");
  const printLocal = join(dir, "print.png");
  const espelhoDir = join(dir, "espelho");
  const zipLocal = join(dir, "mirror.zip");

  // 1) Navegador: rola a página, espera carregar e coleta as URLs de vídeo da rede
  const pagina = await abrir(link);
  let urlsDeVideo = [];
  try {
    await pagina.screenshot(printLocal);
    urlsDeVideo = [...new Set(pagina.urlsDeVideo)];
  } finally {
    await pagina.fechar();
  }

  // 2) HTML single-file (tudo embutido)
  await rodar("/usr/local/bin/single-file", [
    link, htmlLocal,
    "--browser-executable-path=/usr/bin/chromium",
    "--browser-args=[\"--no-sandbox\",\"--disable-dev-shm-usage\"]",
    "--browser-wait-until=networkidle0",
    "--browser-load-max-time=120000",
  ], { cwd: dir, timeout: 4 * 60 * 1000 });
  arquivos.push({ caminho: htmlLocal, nome: limitar(base, "html"), mime: "text/html" });

  // 3) Espelho completo, zipado. Os dois passos são acessórios: sem espelho a captura continua
  // válida (html + print + VSL), então nenhum deles pode derrubar o job. O `mkdir` existe porque
  // um wget que falha logo na primeira request nunca cria a pasta, e aí o zip falharia no `cwd`.
  await mkdir(espelhoDir, { recursive: true });
  await rodar("/usr/bin/wget", [
    "--mirror", "--convert-links", "--adjust-extension", "--page-requisites", "--no-parent",
    "--level=1", "--timeout=30", "--tries=2", "--no-verbose",
    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "-P", espelhoDir, link,
  ], { cwd: dir, timeout: 3 * 60 * 1000 }).catch(() => {});
  try {
    await rodar("/usr/bin/zip", ["-r", "-q", zipLocal, "."], { cwd: espelhoDir, timeout: 2 * 60 * 1000 });
    arquivos.push({ caminho: zipLocal, nome: limitar(`${base} - mirror`, "zip"), mime: "application/zip" });
  } catch (e) {
    console.warn(JSON.stringify({ evento: "lp.espelho_falhou", link, erro: String(e?.message || e) }));
  }

  // 4) Print
  arquivos.push({ caminho: printLocal, nome: limitar(`${base} - print`, "png"), mime: "image/png" });

  // 5) Cada vídeo/VSL num arquivo separado; falha num vídeo não derruba a captura
  let indice = 0;
  for (const url of urlsDeVideo.slice(0, 3)) {
    // Sem orçamento não vale começar outro vídeo: melhor devolver a LP com o que já temos do que
    // estourar o tempo do n8n e perder a captura inteira numa retentativa.
    if (Date.now() > prazo) {
      console.warn(JSON.stringify({ evento: "lp.orcamento_estourado", link, baixados: indice }));
      break;
    }
    indice += 1;
    const destino = join(dir, `vsl-${indice}.mp4`);
    try {
      await rodar("/usr/local/bin/yt-dlp", [
        url, "--no-playlist", "--no-warnings", "--merge-output-format", "mp4",
        "-f", "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b", "--referer", link, "-o", destino,
      ], { cwd: dir, timeout: 5 * 60 * 1000 });
      if (existe(destino)) {
        arquivos.push({ caminho: destino, nome: nomeVsl(base, indice), mime: "video/mp4" });
      } else {
        indice -= 1; // comando saiu 0 mas não gravou nada: não gasta número
      }
    } catch {
      indice -= 1; // não gasta número com vídeo que falhou
    }
  }

  return { arquivos };
}

/** Playwright de verdade: rola a página inteira e escuta a rede atrás de vídeo. */
async function abrirNavegadorReal(link) {
  const { chromium } = await import("playwright-core");
  const navegador = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  let contexto;
  try {
    contexto = await navegador.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });
    const pagina = await contexto.newPage();
    const urlsDeVideo = [];
    pagina.on("request", (r) => { if (ehUrlDeVideo(r.url())) urlsDeVideo.push(r.url()); });

    await pagina.goto(link, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await pagina.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
    // Rola até o fim para disparar lazy loading e o player da VSL
    await pagina.evaluate(async () => {
      await new Promise((pronto) => {
        let y = 0;
        const passo = setInterval(() => {
          window.scrollBy(0, 600);
          y += 600;
          if (y >= document.body.scrollHeight + 1200) { clearInterval(passo); window.scrollTo(0, 0); pronto(); }
        }, 150);
      });
    }).catch(() => {});
    await pagina.waitForTimeout(4000);

    return {
      urlsDeVideo,
      screenshot: (caminho) => pagina.screenshot({ path: caminho, fullPage: true }),
      fechar: async () => { await contexto.close().catch(() => {}); await navegador.close().catch(() => {}); },
    };
  } catch (e) {
    // Nada foi devolvido, então ninguém vai chamar `fechar`: sem isto o Chromium fica órfão a
    // cada LP que não carrega, e são muitas.
    await contexto?.close().catch(() => {});
    await navegador.close().catch(() => {});
    throw e;
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd worker && node --test test/lp.test.js`
Expected: PASS — 5 testes

- [ ] **Step 5: Commit**

```bash
git add worker/src/jobs/lp.js worker/test/lp.test.js
git commit -m "$(cat <<'EOF'
Swipe worker: captura de LP/site em single-file, espelho zipado, print e VSL

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Publicação no Drive (estrutura de pastas)

**Files:**
- Create: `worker/src/publicar.js`
- Test: `worker/test/publicar.test.js`

**Interfaces:**
- Consumes: `drive` (Task 2), `nomeCard`/`limitar`/`extensaoDe`/`mimeDe`/`nomeUnico` de `./nomes.js`.
- Produces: `publicarDownload(drive, { arquivos, modo, base, paiId }) -> resultado` e `publicarLp(drive, { arquivos, base, paiId }) -> resultado`, onde `resultado` tem `{ drive_file_id, drive_folder_id, drive_web_link, thumbnail_link, mime, tamanho, nome_arquivo }` — exatamente as colunas de `swipe_itens`.

- [ ] **Step 1: Escrever o teste que falha**

```js
// worker/test/publicar.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { publicarDownload, publicarLp } from "../src/publicar.js";

function driveFake() {
  const acoes = [];
  return {
    acoes,
    garantirPasta: async (nome, paiId) => { acoes.push({ tipo: "pasta", nome, paiId }); return { id: `pasta:${nome}`, webViewLink: `https://drive/${nome}` }; },
    nomesEm: async () => [],
    subirArquivo: async (caminho, o) => {
      acoes.push({ tipo: "upload", caminho, nome: o.nome, paiId: o.paiId, mime: o.mime });
      return { id: `file:${o.nome}`, name: o.nome, mimeType: o.mime, webViewLink: `https://drive/${o.nome}`, thumbnailLink: "https://thumb", size: "2048" };
    },
    criarDoc: async () => ({ id: "doc", webViewLink: "https://docs" }),
  };
}

test("vídeo único vai direto na pasta da categoria", async () => {
  const d = driveFake();
  const r = await publicarDownload(d, { arquivos: ["/tmp/j/x.mp4"], modo: "unico", base: "Vídeo de anúncio - Médico - Dr X", paiId: "cat1" });
  assert.equal(d.acoes.length, 1);
  assert.deepEqual(d.acoes[0], { tipo: "upload", caminho: "/tmp/j/x.mp4", nome: "Vídeo de anúncio - Médico - Dr X.mp4", paiId: "cat1", mime: "video/mp4" });
  assert.equal(r.drive_file_id, "file:Vídeo de anúncio - Médico - Dr X.mp4");
  assert.equal(r.drive_folder_id, "cat1");
  assert.equal(r.mime, "video/mp4");
  assert.equal(r.tamanho, 2048);
});

test("carrossel cria pasta e numera os cards com o nome base", async () => {
  const d = driveFake();
  const r = await publicarDownload(d, { arquivos: ["/tmp/j/a.jpg", "/tmp/j/b.jpg"], modo: "carrossel", base: "Carrossel - Médico - Dr X", paiId: "cat1" });
  assert.equal(d.acoes[0].tipo, "pasta");
  assert.equal(d.acoes[0].nome, "Carrossel - Médico - Dr X");
  assert.deepEqual(d.acoes.slice(1).map((a) => a.nome), ["Carrossel - Médico - Dr X - 01.jpg", "Carrossel - Médico - Dr X - 02.jpg"]);
  assert.ok(d.acoes.slice(1).every((a) => a.paiId === "pasta:Carrossel - Médico - Dr X"));
  assert.equal(r.drive_file_id, "pasta:Carrossel - Médico - Dr X");
  assert.equal(r.mime, "application/vnd.google-apps.folder");
  assert.equal(r.tamanho, 4096);
});

test("LP cria pasta e sobe html, zip, print e VSL juntos", async () => {
  const d = driveFake();
  const arquivos = [
    { caminho: "/tmp/j/pagina.html", nome: "LP - N - P.html", mime: "text/html" },
    { caminho: "/tmp/j/mirror.zip", nome: "LP - N - P - mirror.zip", mime: "application/zip" },
    { caminho: "/tmp/j/print.png", nome: "LP - N - P - print.png", mime: "image/png" },
    { caminho: "/tmp/j/vsl-1.mp4", nome: "LP - N - P - VSL 01.mp4", mime: "video/mp4" },
  ];
  const r = await publicarLp(d, { arquivos, base: "LP - N - P", paiId: "cat1" });
  assert.equal(d.acoes[0].nome, "LP - N - P");
  assert.equal(d.acoes.length, 5);
  assert.ok(d.acoes.slice(1).every((a) => a.paiId === "pasta:LP - N - P"));
  assert.equal(r.drive_file_id, "pasta:LP - N - P");
  assert.equal(r.tamanho, 8192);
});

test("nome repetido na pasta ganha sufixo", async () => {
  const d = driveFake();
  d.nomesEm = async () => ["Vídeo - N - P.mp4"];
  await publicarDownload(d, { arquivos: ["/tmp/j/x.mp4"], modo: "unico", base: "Vídeo - N - P", paiId: "cat1" });
  assert.equal(d.acoes[0].nome, "Vídeo - N - P (2).mp4");
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd worker && node --test test/publicar.test.js`
Expected: FAIL — `Cannot find module '../src/publicar.js'`

- [ ] **Step 3: Escrever a implementação**

```js
// worker/src/publicar.js
// Sobe o que os jobs baixaram na estrutura combinada com o usuário e devolve
// exatamente as colunas que o n8n grava em `swipe_itens`.
import { stat } from "node:fs/promises";
import { limitar, nomeCard, extensaoDe, mimeDe, nomeUnico } from "./nomes.js";

const PASTA_MIME = "application/vnd.google-apps.folder";

async function tamanhoDe(caminho) {
  try {
    return (await stat(caminho)).size;
  } catch {
    return 0;
  }
}

function daPasta(pasta, base, tamanho) {
  return {
    drive_file_id: pasta.id,
    drive_folder_id: pasta.id,
    drive_web_link: pasta.webViewLink || null,
    thumbnail_link: null,
    mime: PASTA_MIME,
    tamanho,
    nome_arquivo: base,
  };
}

export async function publicarDownload(drive, { arquivos, modo, base, paiId }) {
  if (modo !== "carrossel" && modo !== "unico") {
    throw new Error(`Modo de publicação desconhecido: ${modo}`);
  }

  if (modo === "carrossel") {
    const pasta = await drive.garantirPasta(limitar(base), paiId);
    // Retry de job reaproveita a pasta: subir de novo o que já está lá deixaria cards duplicados,
    // porque o Drive aceita nomes repetidos. O upload resumível só finaliza arquivo completo,
    // então um nome presente significa um card íntegro.
    const jaTem = new Set(await drive.nomesEm(pasta.id));
    let total = 0;
    for (let i = 0; i < arquivos.length; i++) {
      const caminho = arquivos[i];
      const ext = extensaoDe(caminho) || "jpg";
      const nome = nomeCard(base, i + 1, ext);
      if (jaTem.has(nome)) {
        total += await tamanhoDe(caminho);
        continue;
      }
      const enviado = await drive.subirArquivo(caminho, { nome, paiId: pasta.id, mime: mimeDe(ext) });
      total += Number(enviado.size || 0) || (await tamanhoDe(caminho));
    }
    return daPasta(pasta, base, total);
  }

  const caminho = arquivos[0];
  const ext = extensaoDe(caminho) || "mp4";
  const existentes = await drive.nomesEm(paiId);
  const nome = nomeUnico(limitar(base, ext), existentes);
  const enviado = await drive.subirArquivo(caminho, { nome, paiId, mime: mimeDe(ext) });
  return {
    drive_file_id: enviado.id,
    drive_folder_id: paiId,
    drive_web_link: enviado.webViewLink || null,
    thumbnail_link: enviado.thumbnailLink || null,
    mime: enviado.mimeType || mimeDe(ext),
    tamanho: Number(enviado.size || 0) || (await tamanhoDe(caminho)),
    nome_arquivo: nome.replace(new RegExp(`\\.${ext}$`), ""),
  };
}

export async function publicarLp(drive, { arquivos, base, paiId }) {
  const pasta = await drive.garantirPasta(limitar(base), paiId);
  const jaTem = new Set(await drive.nomesEm(pasta.id));
  let total = 0;
  for (const a of arquivos) {
    if (jaTem.has(a.nome)) {
      total += await tamanhoDe(a.caminho);
      continue;
    }
    const enviado = await drive.subirArquivo(a.caminho, { nome: a.nome, paiId: pasta.id, mime: a.mime });
    total += Number(enviado.size || 0) || (await tamanhoDe(a.caminho));
  }
  return daPasta(pasta, base, total);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd worker && node --test test/publicar.test.js`
Expected: PASS — 4 testes

- [ ] **Step 5: Commit**

```bash
git add worker/src/publicar.js worker/test/publicar.test.js
git commit -m "$(cat <<'EOF'
Swipe worker: publicação no Drive com pasta de carrossel e pasta de LP

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Servidor HTTP do worker

**Files:**
- Create: `worker/src/config.js`
- Create: `worker/src/server.js`
- Test: `worker/test/server.test.js`

**Interfaces:**
- Consumes: tudo das tasks 1–6.
- Produces: `criarServidor({ config, executarJob }) -> http.Server` e `executarJob(corpo, deps) -> { ok, resultado } | { ok, erro, docs }`.
- `config.js` produz `lerConfig(env) -> { porta, workerKey, swipeKey, supabaseUrl, versao }` e lança na falta de variável.

- [ ] **Step 1: Escrever o teste que falha**

```js
// worker/test/server.test.js
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd worker && node --test test/server.test.js`
Expected: FAIL — `Cannot find module '../src/config.js'`

- [ ] **Step 3: Escrever `config.js`**

```js
// worker/src/config.js
export function lerConfig(env = process.env) {
  const obrigatoria = (nome) => {
    const v = env[nome];
    if (!v) throw new Error(`Falta a variável de ambiente ${nome}`);
    return v;
  };
  return {
    porta: Number(env.PORTA || 8080),
    workerKey: obrigatoria("WORKER_KEY"),
    swipeKey: obrigatoria("SWIPE_KEY"),
    supabaseUrl: obrigatoria("SUPABASE_URL").replace(/\/+$/, ""),
    versao: env.VERSAO || "1.0.0",
  };
}
```

- [ ] **Step 4: Escrever `server.js`**

```js
// worker/src/server.js
// HTTP mínimo (node:http, sem framework). Um job por vez: o segundo recebe 409 e o
// n8n tenta de novo no minuto seguinte.
import { createServer } from "node:http";
import { criarDrive as criarDriveReal, DriveIndisponivel } from "./drive.js";
import { comPastaTemp as comPastaTempReal } from "./tmp.js";
import { baixar as baixarReal } from "./jobs/download.js";
import { capturar as capturarReal } from "./jobs/lp.js";
import { publicarDownload as publicarDownloadReal, publicarLp as publicarLpReal } from "./publicar.js";
import { lerConfig } from "./config.js";

export async function executarJob(corpo, deps = {}) {
  const criarDrive = deps.criarDrive || criarDriveReal;
  const comPastaTemp = deps.comPastaTemp || comPastaTempReal;
  const baixar = deps.baixar || baixarReal;
  const capturar = deps.capturar || capturarReal;
  const publicarDownload = deps.publicarDownload || publicarDownloadReal;
  const publicarLp = deps.publicarLp || publicarLpReal;
  const config = deps.config;

  const { tipo, payload, ultima_tentativa: ultima } = corpo;
  const { link, nome_arquivo: base, drive_folder_id: paiId, rede } = payload;
  const drive = criarDrive({ supabaseUrl: config.supabaseUrl, swipeKey: config.swipeKey });

  try {
    const resultado = await comPastaTemp(`job-${corpo.id}`, async (dir) => {
      if (tipo === "lp") {
        const { arquivos } = await capturar({ link, dir, base }, {});
        return publicarLp(drive, { arquivos, base, paiId });
      }
      const { arquivos, modo } = await baixar({ link, rede, dir }, {});
      return publicarDownload(drive, { arquivos, modo, base, paiId });
    });
    return { ok: true, resultado };
  } catch (e) {
    if (e instanceof DriveIndisponivel) throw e; // 503: não conta tentativa
    const erro = String(e?.message || e).slice(0, 500);
    let docs = null;
    if (ultima) {
      const texto = [
        `Link: ${link}`,
        "",
        `Não foi possível baixar automaticamente em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
        `Motivo: ${erro}`,
        "",
        "Baixe manualmente e use o botão \"Enviar arquivo\" no card do swipe file.",
      ].join("\n");
      docs = await drive.criarDoc(paiId, base, texto)
        .then((d) => ({ drive_file_id: d.id, drive_web_link: d.webViewLink || null }))
        .catch(() => null);
    }
    return { ok: false, erro, docs };
  }
}

export function criarServidor({ config, executarJob: executar = executarJob }) {
  let ocupado = false;

  return createServer(async (req, res) => {
    const responder = (status, corpo) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(corpo));
    };

    if (req.url === "/health") return responder(200, { ok: true, busy: ocupado, versao: config.versao });
    if (req.url !== "/job" || req.method !== "POST") return responder(404, { ok: false, erro: "rota desconhecida" });
    if (req.headers["x-worker-key"] !== config.workerKey) return responder(401, { ok: false, erro: "chave inválida" });
    if (ocupado) return responder(409, { ok: false, erro: "ocupado" });

    let corpo;
    try {
      const pedacos = [];
      for await (const p of req) pedacos.push(p);
      corpo = JSON.parse(Buffer.concat(pedacos).toString("utf8") || "{}");
    } catch {
      return responder(400, { ok: false, erro: "corpo inválido" });
    }
    if (!corpo?.payload?.link || !corpo?.payload?.drive_folder_id) {
      return responder(400, { ok: false, erro: "payload precisa de link e drive_folder_id" });
    }

    // Um job por vez. A liberação acontece só no `finally`: soltar `ocupado` por relógio
    // deixaria um segundo job entrar com o primeiro ainda rodando, e os dois disputariam
    // a mesma pasta temporária e o mesmo disco. Quem limita o tempo são os timeouts de cada
    // comando (a captura de LP tem orçamento de 12 min, o download 13).
    ocupado = true;
    try {
      console.log(JSON.stringify({ evento: "job.inicio", id: corpo.id, tipo: corpo.tipo, link: corpo.payload.link }));
      const r = await executar(corpo, { config });
      console.log(JSON.stringify({ evento: "job.fim", id: corpo.id, ok: r.ok, erro: r.erro || null }));
      responder(200, r);
    } catch (e) {
      const infra = e instanceof DriveIndisponivel;
      console.error(JSON.stringify({ evento: "job.erro", id: corpo.id, infra, erro: String(e?.message || e) }));
      responder(infra ? 503 : 500, { ok: false, erro: String(e?.message || e).slice(0, 500) });
    } finally {
      ocupado = false;
    }
  });
}

// Boot: só quando chamado direto (`node src/server.js`), não nos testes.
if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  const config = lerConfig();
  criarServidor({ config }).listen(config.porta, () => {
    console.log(JSON.stringify({ evento: "worker.pronto", porta: config.porta, versao: config.versao }));
  });
}
```

- [ ] **Step 5: Rodar a suíte inteira e confirmar que passa**

Run: `cd worker && npm test`
Expected: PASS — todos os arquivos de teste, 0 falhas

- [ ] **Step 6: Commit**

```bash
git add worker/src/config.js worker/src/server.js worker/test/server.test.js
git commit -m "$(cat <<'EOF'
Swipe worker: servidor HTTP com chave, concorrência 1 e Docs na falha final

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Imagem Docker e publicação no GHCR

**Files:**
- Create: `worker/Dockerfile`
- Create: `.github/workflows/swipe-worker.yml`

**Interfaces:**
- Consumes: `worker/` inteiro.
- Produces: imagem `ghcr.io/oandrelopesz/swipe-worker:latest` com os binários em `/usr/local/bin/yt-dlp`, `/usr/local/bin/gallery-dl`, `/usr/local/bin/single-file`, `/usr/bin/wget`, `/usr/bin/zip`, `/usr/bin/chromium`.

- [ ] **Step 1: Escrever o Dockerfile**

```dockerfile
# worker/Dockerfile
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PORTA=8080 \
    SWIPE_TMP=/dados/tmp

# Binários do sistema: ffmpeg (merge do yt-dlp), wget/zip (espelho), chromium (single-file e Playwright)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget zip unzip python3 python3-pip ffmpeg chromium \
      fonts-liberation fonts-noto-color-emoji libnss3 libatk1.0-0 libatk-bridge2.0-0 \
      libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp e gallery-dl como binários fixos em /usr/local/bin.
# O pip no Debian já instala o console script do gallery-dl em /usr/local/bin; o `if` só cobre o
# caso de ele ir para outro lugar — linkar o caminho nele mesmo criaria um symlink pendurado.
# Os `test -x` no fim falham o build aqui, em vez de o worker descobrir no primeiro job.
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && pip3 install --break-system-packages --no-cache-dir gallery-dl \
 && if [ ! -x /usr/local/bin/gallery-dl ]; then ln -s "$(command -v gallery-dl)" /usr/local/bin/gallery-dl; fi \
 && test -x /usr/local/bin/gallery-dl && test -x /usr/local/bin/yt-dlp

WORKDIR /app
COPY package.json ./
# O npm já cria o shim executável em node_modules/.bin/single-file (o arquivo real do pacote
# chama-se single-file-node.js, então nunca aponte direto para ele).
RUN npm install --omit=dev --no-audit --no-fund \
 && ln -sf /app/node_modules/.bin/single-file /usr/local/bin/single-file \
 && test -x /app/node_modules/.bin/single-file

COPY src ./src
RUN mkdir -p /dados/tmp /cookies && chown -R node:node /dados

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
```

- [ ] **Step 2: Escrever o workflow do GitHub Actions**

```yaml
# .github/workflows/swipe-worker.yml
name: swipe-worker

on:
  push:
    branches: [main]
    paths:
      - "worker/**"
      - ".github/workflows/swipe-worker.yml"
  workflow_dispatch:

jobs:
  testar-e-publicar:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Testes
        working-directory: worker
        run: node --test

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: worker
          push: true
          tags: |
            ghcr.io/oandrelopesz/swipe-worker:latest
            ghcr.io/oandrelopesz/swipe-worker:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 3: Commit e push**

```bash
git add worker/Dockerfile .github/workflows/swipe-worker.yml
git commit -m "$(cat <<'EOF'
Swipe worker: imagem Docker e publicação automática no GHCR

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

- [ ] **Step 4: Confirmar que a imagem foi publicada**

Abrir `https://github.com/oandrelopesz/gestao-de-operacao/actions` no Chrome e esperar o job `testar-e-publicar` ficar verde (leva ~5 min no primeiro build).
Expected: build verde e o pacote aparecendo em `https://github.com/oandrelopesz?tab=packages`.

- [ ] **Step 5: Deixar o pacote público**

Abrir `https://github.com/users/oandrelopesz/packages/container/swipe-worker/settings`, seção "Danger Zone" → "Change visibility" → **Public**.
Expected: o pacote passa a aparecer como `Public`, e o Swarm consegue puxar sem credencial.
(Se o usuário preferir manter privado: criar um PAT com escopo `read:packages` e cadastrar em Portainer → Registries → Add registry → Custom registry `ghcr.io`.)

---

### Task 9: Stack no Portainer e cookies

**Files:**
- Create: `infra/swipe-worker/stack.yml`
- Create: `infra/swipe-worker/README.md`

**Interfaces:**
- Consumes: imagem do GHCR (Task 8).
- Produces: serviço `swipe_swipe_worker` respondendo em `http://swipe_worker:8080` dentro da rede `ALDigitalNet`.

- [ ] **Step 1: Escrever a stack**

```yaml
# infra/swipe-worker/stack.yml
# Stack Swarm do worker do swipe file. Colar em Portainer > Stacks > Add stack (Web editor),
# nome da stack: swipe. As variáveis vão na seção "Environment variables" do Portainer.
version: "3.8"

services:
  swipe_worker:
    image: ghcr.io/oandrelopesz/swipe-worker:latest
    environment:
      PORTA: "8080"
      SUPABASE_URL: "https://bnpvzguapunsztsdvmrs.supabase.co"
      SWIPE_KEY: "${SWIPE_KEY}"
      WORKER_KEY: "${WORKER_KEY}"
      SWIPE_TMP: "/dados/tmp"
      TZ: "America/Sao_Paulo"
    volumes:
      - swipe_tmp:/dados/tmp
    configs:
      - source: swipe_cookies_instagram
        target: /cookies/instagram.txt
        mode: 0444
      - source: swipe_cookies_tiktok
        target: /cookies/tiktok.txt
        mode: 0444
      - source: swipe_cookies_facebook
        target: /cookies/facebook.txt
        mode: 0444
    networks:
      - ALDigitalNet
    deploy:
      mode: replicated
      replicas: 1
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          cpus: "2"
          memory: 3G
      placement:
        constraints:
          - node.role == manager

volumes:
  swipe_tmp:

configs:
  swipe_cookies_instagram:
    external: true
  swipe_cookies_tiktok:
    external: true
  swipe_cookies_facebook:
    external: true

networks:
  ALDigitalNet:
    external: true
```

- [ ] **Step 2: Escrever o README da infra**

````markdown
# Worker do swipe file — infraestrutura

## Ordem de instalação
1. **Cookies** (Portainer → Configs → Add config). Um config por rede, com o conteúdo de um
   `cookies.txt` no formato Netscape exportado pela extensão "Get cookies.txt LOCALLY":
   - `swipe_cookies_instagram`
   - `swipe_cookies_tiktok`
   - `swipe_cookies_facebook`
   Os três precisam existir antes da stack subir. Sem cookie para uma rede, criar o config
   com uma única linha `# sem cookies` — o worker ignora arquivo sem cookie válido.
2. **Stack** (Portainer → Stacks → Add stack → Web editor, nome `swipe`): colar `stack.yml` e
   preencher em *Environment variables*:
   - `SWIPE_KEY` — a mesma do secret `SWIPE_KEY` no Lovable Cloud
   - `WORKER_KEY` — segredo novo, gerar com `openssl rand -base64 24`
3. **Workflow do n8n**: importar `n8n-workflow.json`, conferir as credenciais e publicar.

## Trocar os cookies quando vencerem
Portainer não edita config em uso: criar `swipe_cookies_instagram_v2`, apontar a stack para ele
e dar *Update the stack*. O sintoma de cookie vencido é item `falhou` com erro de login.

## Atualizar a imagem
Push em `worker/` no GitHub → o Actions publica → Portainer → Services → `swipe_swipe_worker`
→ *Update* com *Pull latest image* marcado.
````

- [ ] **Step 3: Commit**

```bash
git add infra/swipe-worker/stack.yml infra/swipe-worker/README.md
git commit -m "$(cat <<'EOF'
Swipe worker: stack Swarm para o Portainer e instruções de instalação

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Gerar a WORKER_KEY e criar os Configs no Portainer**

```bash
openssl rand -base64 24
```
Guardar o valor para os passos seguintes (vai também no n8n). Depois, no Chrome, em
`https://portainer.minuanoai.com.br/#!/1/docker/configs/new`, criar os três configs de cookies.
Expected: os três aparecem em Portainer → Configs.

- [ ] **Step 5: Subir a stack**

Em `https://portainer.minuanoai.com.br/#!/1/docker/stacks/newstack`: nome `swipe`, Web editor com
o conteúdo de `infra/swipe-worker/stack.yml`, variáveis `SWIPE_KEY` e `WORKER_KEY`, *Deploy the stack*.
Expected: serviço `swipe_swipe_worker` com réplica `1/1` em Portainer → Services.

- [ ] **Step 6: Verificar o `/health` de dentro da rede**

No n8n (`https://test.minuanoai.com.br`), criar um workflow descartável com um nó **HTTP Request**
apontando para `http://swipe_worker:8080/health` e clicar em *Execute workflow*.
Expected: `{"ok":true,"busy":false,"versao":"1.0.0"}`. Apagar o workflow de teste depois.

---

### Task 10: Workflow do n8n

**Files:**
- Create: `infra/swipe-worker/n8n-workflow.json`

**Interfaces:**
- Consumes: `http://swipe_worker:8080/job`, PostgREST do Supabase, Evolution API.
- Produces: workflow `[SWIPE] Fila de downloads`, schedule de 1 minuto, ativo.
- Credenciais existentes a reutilizar: `Supabase - Gestão de Operação (anon)` (id `FM9KesEpqvc3xK4e`, header `apikey`) e `Evolution - Andre Lopes API` (id `IxhoWCHuER7BGSFJ`).

- [ ] **Step 1: Escrever o JSON do workflow**

```json
{
  "name": "[SWIPE] Fila de downloads",
  "settings": { "executionOrder": "v1", "timezone": "America/Sao_Paulo" },
  "nodes": [
    {
      "parameters": { "rule": { "interval": [{ "field": "minutes", "minutesInterval": 1 }] } },
      "id": "a1000000-0000-4000-8000-000000000001",
      "name": "A cada minuto",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [-360, 0]
    },
    {
      "parameters": {
        "url": "https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/swipe_jobs",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendQuery": true,
        "queryParameters": { "parameters": [
          { "name": "status", "value": "eq.aguardando" },
          { "name": "select", "value": "id,item_id,tipo,payload,tentativas" },
          { "name": "order", "value": "created_at.asc" },
          { "name": "limit", "value": "1" }
        ] },
        "options": { "response": { "response": { "neverError": true } } }
      },
      "id": "a1000000-0000-4000-8000-000000000002",
      "name": "Buscar job",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [-140, 0],
      "credentials": { "httpHeaderAuth": { "id": "FM9KesEpqvc3xK4e", "name": "Supabase - Gestão de Operação (anon)" } }
    },
    {
      "parameters": {
        "conditions": { "options": { "caseSensitive": true, "version": 2 }, "combinator": "and",
          "conditions": [ { "leftValue": "={{ $json.id }}", "rightValue": "", "operator": { "type": "string", "operation": "exists", "singleValue": true } } ] },
        "options": {}
      },
      "id": "a1000000-0000-4000-8000-000000000003",
      "name": "Tem job?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [80, 0]
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "=https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/swipe_jobs?id=eq.{{ $json.id }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": { "parameters": [ { "name": "Content-Type", "value": "application/json" }, { "name": "Prefer", "value": "return=minimal" } ] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ status: 'rodando', iniciado_em: new Date().toISOString(), tentativas: $json.tentativas + 1 }) }}",
        "options": {}
      },
      "id": "a1000000-0000-4000-8000-000000000004",
      "name": "Marcar rodando",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [300, -100],
      "credentials": { "httpHeaderAuth": { "id": "FM9KesEpqvc3xK4e", "name": "Supabase - Gestão de Operação (anon)" } }
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "=https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/swipe_itens?id=eq.{{ $('Tem job?').item.json.item_id }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": { "parameters": [ { "name": "Content-Type", "value": "application/json" }, { "name": "Prefer", "value": "return=minimal" } ] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ status: 'baixando', erro: null }) }}",
        "options": {}
      },
      "id": "a1000000-0000-4000-8000-000000000005",
      "name": "Item baixando",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [520, -100],
      "credentials": { "httpHeaderAuth": { "id": "FM9KesEpqvc3xK4e", "name": "Supabase - Gestão de Operação (anon)" } }
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://swipe_worker:8080/job",
        "sendHeaders": true,
        "headerParameters": { "parameters": [ { "name": "x-worker-key", "value": "={{ $env.SWIPE_WORKER_KEY }}" }, { "name": "Content-Type", "value": "application/json" } ] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ id: $('Tem job?').item.json.id, tipo: $('Tem job?').item.json.tipo, payload: $('Tem job?').item.json.payload, ultima_tentativa: $('Tem job?').item.json.tentativas + 1 >= 3 }) }}",
        "options": { "timeout": 1800000, "response": { "response": { "neverError": true, "fullResponse": true } } }
      },
      "id": "a1000000-0000-4000-8000-000000000006",
      "name": "Executar no worker",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [740, -100]
    },
    {
      "parameters": {
        "jsCode": "const r = $input.first().json;\nconst job = $('Tem job?').first().json;\nconst corpo = r.body || {};\nconst status = r.statusCode || 0;\nconst tentativas = job.tentativas + 1;\n\n// 409 (ocupado) e 503 (Drive fora) não consomem tentativa: o job volta para a fila\nif (status === 409 || status === 503) {\n  return [{ json: { acao: 'devolver', job_id: job.id, item_id: job.item_id, tentativas: job.tentativas, erro: corpo.erro || `worker respondeu ${status}` } }];\n}\n\nif (corpo.ok === true) {\n  return [{ json: { acao: 'ok', job_id: job.id, item_id: job.item_id, resultado: corpo.resultado } }];\n}\n\nconst erro = corpo.erro || `worker respondeu ${status}`;\nif (tentativas < 3) {\n  return [{ json: { acao: 'devolver', job_id: job.id, item_id: job.item_id, tentativas, erro } }];\n}\nreturn [{ json: { acao: 'falhou', job_id: job.id, item_id: job.item_id, tentativas, erro, docs: corpo.docs || null, link: job.payload.link, nome: job.payload.nome_arquivo } }];"
      },
      "id": "a1000000-0000-4000-8000-000000000007",
      "name": "Decidir",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [960, -100]
    },
    {
      "parameters": {
        "rules": { "values": [
          { "conditions": { "options": { "caseSensitive": true, "version": 2 }, "combinator": "and", "conditions": [ { "leftValue": "={{ $json.acao }}", "rightValue": "ok", "operator": { "type": "string", "operation": "equals" } } ] }, "outputKey": "ok" },
          { "conditions": { "options": { "caseSensitive": true, "version": 2 }, "combinator": "and", "conditions": [ { "leftValue": "={{ $json.acao }}", "rightValue": "devolver", "operator": { "type": "string", "operation": "equals" } } ] }, "outputKey": "devolver" },
          { "conditions": { "options": { "caseSensitive": true, "version": 2 }, "combinator": "and", "conditions": [ { "leftValue": "={{ $json.acao }}", "rightValue": "falhou", "operator": { "type": "string", "operation": "equals" } } ] }, "outputKey": "falhou" }
        ] },
        "options": {}
      },
      "id": "a1000000-0000-4000-8000-000000000008",
      "name": "Rotear",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [1180, -100]
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "=https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/swipe_itens?id=eq.{{ $json.item_id }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": { "parameters": [ { "name": "Content-Type", "value": "application/json" }, { "name": "Prefer", "value": "return=minimal" } ] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify(Object.assign({ status: 'pronto', erro: null }, $json.resultado)) }}",
        "options": {}
      },
      "id": "a1000000-0000-4000-8000-000000000009",
      "name": "Item pronto",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1400, -260],
      "credentials": { "httpHeaderAuth": { "id": "FM9KesEpqvc3xK4e", "name": "Supabase - Gestão de Operação (anon)" } }
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "=https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/swipe_jobs?id=eq.{{ $('Decidir').item.json.job_id }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": { "parameters": [ { "name": "Content-Type", "value": "application/json" }, { "name": "Prefer", "value": "return=minimal" } ] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ status: 'ok', erro: null, concluido_em: new Date().toISOString() }) }}",
        "options": {}
      },
      "id": "a1000000-0000-4000-8000-000000000010",
      "name": "Job ok",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1620, -260],
      "credentials": { "httpHeaderAuth": { "id": "FM9KesEpqvc3xK4e", "name": "Supabase - Gestão de Operação (anon)" } }
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "=https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/swipe_jobs?id=eq.{{ $json.job_id }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": { "parameters": [ { "name": "Content-Type", "value": "application/json" }, { "name": "Prefer", "value": "return=minimal" } ] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ status: 'aguardando', erro: $json.erro, tentativas: $json.tentativas }) }}",
        "options": {}
      },
      "id": "a1000000-0000-4000-8000-000000000011",
      "name": "Devolver para a fila",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1400, -100],
      "credentials": { "httpHeaderAuth": { "id": "FM9KesEpqvc3xK4e", "name": "Supabase - Gestão de Operação (anon)" } }
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "=https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/swipe_itens?id=eq.{{ $json.item_id }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": { "parameters": [ { "name": "Content-Type", "value": "application/json" }, { "name": "Prefer", "value": "return=minimal" } ] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify(Object.assign({ status: 'falhou', erro: $json.erro }, $json.docs ? { drive_file_id: $json.docs.drive_file_id, drive_web_link: $json.docs.drive_web_link } : {})) }}",
        "options": {}
      },
      "id": "a1000000-0000-4000-8000-000000000012",
      "name": "Item falhou",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1400, 60],
      "credentials": { "httpHeaderAuth": { "id": "FM9KesEpqvc3xK4e", "name": "Supabase - Gestão de Operação (anon)" } }
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "=https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/swipe_jobs?id=eq.{{ $('Decidir').item.json.job_id }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": { "parameters": [ { "name": "Content-Type", "value": "application/json" }, { "name": "Prefer", "value": "return=minimal" } ] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ status: 'erro', erro: $('Decidir').item.json.erro, tentativas: $('Decidir').item.json.tentativas, concluido_em: new Date().toISOString() }) }}",
        "options": {}
      },
      "id": "a1000000-0000-4000-8000-000000000013",
      "name": "Job erro",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1620, 60],
      "credentials": { "httpHeaderAuth": { "id": "FM9KesEpqvc3xK4e", "name": "Supabase - Gestão de Operação (anon)" } }
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://evolution.minuanoai.com.br/message/sendText/Andr%C3%A9%20Lopes%20-%20API",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": { "parameters": [ { "name": "Content-Type", "value": "application/json" } ] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ number: '556182636628', linkPreview: false, text: `*Swipe file* — não consegui baixar\\n\\n${$('Decidir').item.json.nome}\\n${$('Decidir').item.json.link}\\n\\nMotivo: ${$('Decidir').item.json.erro}\\n\\nO link foi salvo num Docs na pasta. Use \"Enviar arquivo\" no card.` }) }}",
        "options": {}
      },
      "id": "a1000000-0000-4000-8000-000000000014",
      "name": "Avisar no WhatsApp",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1840, 60],
      "credentials": { "httpHeaderAuth": { "id": "IxhoWCHuER7BGSFJ", "name": "Evolution - Andre Lopes API" } }
    }
  ],
  "connections": {
    "A cada minuto": { "main": [[{ "node": "Buscar job", "type": "main", "index": 0 }]] },
    "Buscar job": { "main": [[{ "node": "Tem job?", "type": "main", "index": 0 }]] },
    "Tem job?": { "main": [[{ "node": "Marcar rodando", "type": "main", "index": 0 }], []] },
    "Marcar rodando": { "main": [[{ "node": "Item baixando", "type": "main", "index": 0 }]] },
    "Item baixando": { "main": [[{ "node": "Executar no worker", "type": "main", "index": 0 }]] },
    "Executar no worker": { "main": [[{ "node": "Decidir", "type": "main", "index": 0 }]] },
    "Decidir": { "main": [[{ "node": "Rotear", "type": "main", "index": 0 }]] },
    "Rotear": { "main": [
      [{ "node": "Item pronto", "type": "main", "index": 0 }],
      [{ "node": "Devolver para a fila", "type": "main", "index": 0 }],
      [{ "node": "Item falhou", "type": "main", "index": 0 }]
    ] },
    "Item pronto": { "main": [[{ "node": "Job ok", "type": "main", "index": 0 }]] },
    "Item falhou": { "main": [[{ "node": "Job erro", "type": "main", "index": 0 }]] },
    "Job erro": { "main": [[{ "node": "Avisar no WhatsApp", "type": "main", "index": 0 }]] }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/swipe-worker/n8n-workflow.json
git commit -m "$(cat <<'EOF'
Swipe worker: workflow do n8n que consome a fila e trata retentativa e falha

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Publicar a `WORKER_KEY` para o n8n**

A expressão `$env.SWIPE_WORKER_KEY` só funciona se a variável existir no container do n8n.
Em Portainer → Stacks → `n8n` → editar, acrescentar em **todos os três** serviços
(`n8n_editor`, `n8n_worker`, `n8n_webhook`), na seção `environment`:

```yaml
      - SWIPE_WORKER_KEY=<a mesma WORKER_KEY da stack swipe>
      - N8N_BLOCK_ENV_ACCESS_IN_NODE=false
```

e dar *Update the stack*.
Expected: os três serviços reiniciam com `1/1`.
(Alternativa, se o usuário preferir não mexer na stack do n8n: substituir `{{ $env.SWIPE_WORKER_KEY }}` pela chave literal no nó "Executar no worker" — fica salva só dentro do n8n.)

- [ ] **Step 4: Importar o workflow no n8n**

Em `https://test.minuanoai.com.br/home/workflows` → *Add workflow* → menu `...` → *Import from File*,
escolher `infra/swipe-worker/n8n-workflow.json`.
Expected: 14 nós aparecem no canvas com as credenciais já preenchidas.

- [ ] **Step 5: Testar com a fila vazia**

Clicar em *Execute workflow*.
Expected: "Buscar job" devolve `[]`, "Tem job?" segue pelo ramo falso e a execução termina sem erro.

- [ ] **Step 6: Ativar**

Clicar no botão **Publish** (o `PATCH active:true` pela API REST não ativa) e dar um nome de versão.
Expected: o workflow aparece como *Active* na lista.

---

### Task 11: Teste de ponta a ponta e ajustes no app

**Files:**
- Modify: `src/lib/swipe.ts:180-190` (nome dos cards no upload manual) e final do arquivo (`reenfileirarItem`)
- Modify: `src/components/swipe/SwipeAddDialog.tsx:181-190` (nome dos cards)
- Modify: `src/routes/_authenticated/swipe.tsx:370-376` (botão "Tentar de novo")

**Interfaces:**
- Consumes: `enfileirarJob`, `atualizarItem` de `@/lib/swipe`.
- Produces: `reenfileirarItem(item: SwipeItem) -> Promise<void>`.

- [ ] **Step 1: Teste de ponta a ponta — vídeo**

No app publicado (`/swipe`), adicionar uma referência só com link: categoria "Vídeo de anúncio",
nicho "Teste", player "Ponta a ponta", link de um vídeo curto do YouTube.
Expected, em até 2 minutos: o card sai de "Na fila" para "Baixando" e depois "No Drive"
(realtime, sem recarregar), e o arquivo `Vídeo de anúncio - Teste - Ponta a ponta.mp4` aparece em
`Swipe File/Teste/Vídeos de anúncio/` no Drive.

- [ ] **Step 2: Teste de ponta a ponta — landing page com VSL**

Adicionar categoria "Landing page", nicho "Teste", player "LP com VSL", link de uma LP com vídeo.
Expected: pasta `Landing page - Teste - LP com VSL/` no Drive contendo `.html`, `- mirror.zip`,
`- print.png` e pelo menos um `- VSL 01.mp4`; o `.html` abre offline com o visual da página.

- [ ] **Step 3: Teste de ponta a ponta — carrossel**

Adicionar categoria "Carrossel", nicho "Teste", player "Carrossel IG", link de um post de
carrossel do Instagram.
Expected: pasta `Carrossel - Teste - Carrossel IG/` com `... - 01.jpg`, `... - 02.jpg`, etc.
Se falhar por bloqueio, o item vira "Falhou · link salvo" com Docs na pasta e chega a mensagem
no WhatsApp — nesse caso, revisar o config de cookies do Instagram (Task 9, passo 1).

- [ ] **Step 4: Alinhar o nome dos cards no upload manual**

Em `src/components/swipe/SwipeAddDialog.tsx`, na parte do carrossel, trocar o nome do card para
o mesmo padrão do worker:

```tsx
            const nome = `${base} - ${String(i + 1).padStart(2, "0")}.${extensaoDe(f)}`;
```

- [ ] **Step 5: Adicionar `reenfileirarItem` em `src/lib/swipe.ts`**

```ts
/** Recoloca um item que falhou na fila do serviço (mesma pasta, mesmo nome). */
export async function reenfileirarItem(item: SwipeItem): Promise<void> {
  if (!item.link || !item.drive_folder_id || !item.nome_arquivo) {
    throw new Error("Esse item não tem link salvo; use \"Enviar arquivo\".");
  }
  const tipo = item.categoria === "landing_page" || item.categoria === "site" ? "lp" : "download";
  await atualizarItem(item.id, { status: "pendente", erro: null });
  await enfileirarJob(item.id, tipo, {
    link: item.link,
    categoria: item.categoria,
    nome_arquivo: item.nome_arquivo,
    drive_folder_id: item.drive_folder_id,
    rede: item.rede,
  });
}
```

- [ ] **Step 6: Adicionar o botão "Tentar de novo" no card**

Em `src/routes/_authenticated/swipe.tsx`, importar `RotateCw` de `lucide-react` e
`reenfileirarItem` de `@/lib/swipe`, e no bloco de botões do card (perto de `onEnviarArquivo`):

```tsx
          {item.status === "falhou" && item.link && (
            <Button
              size="sm" variant="outline" className="gap-1.5" title="Tentar baixar de novo"
              onClick={async () => {
                try {
                  await reenfileirarItem(item);
                  toast.success("Na fila de novo");
                } catch (e) {
                  toast.error(erroAmigavel(e));
                }
              }}
            ><RotateCw size={14} /></Button>
          )}
```

- [ ] **Step 7: Conferir que o app compila**

Run: `npm run build`
Expected: build sem erro de TypeScript.

- [ ] **Step 8: Commit e push**

```bash
git add src/lib/swipe.ts src/components/swipe/SwipeAddDialog.tsx src/routes/_authenticated/swipe.tsx
git commit -m "$(cat <<'EOF'
Swipe file: nome dos cards igual ao do worker e botão para tentar o download de novo

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

- [ ] **Step 9: Limpar os itens de teste**

Remover no app os três itens do nicho "Teste" e apagar a pasta `Swipe File/Teste` no Drive.
Expected: catálogo limpo, fila vazia (`swipe_jobs` sem linhas `aguardando`).

---

## Notas de execução

- **A ordem importa.** Tasks 1–7 são só código e rodam offline. A Task 8 precisa de push no
  GitHub. A 9 e a 10 precisam do Chrome com Portainer e n8n logados. A 11 precisa das duas.
- **A `SWIPE_KEY` já existe** como secret no Lovable Cloud; o usuário precisa copiá-la de
  Mais → Cloud → Secrets para colar na stack. A `WORKER_KEY` é nova, gerada na Task 9.
- **Se o Instagram falhar mesmo com cookies**, o caminho não é insistir no worker: o item já cai
  no fluxo de Docs + "Enviar arquivo", que resolve manualmente em 30 segundos.
- **Espaço em disco:** o volume `swipe_tmp` só guarda arquivo durante o job (`comPastaTemp`
  apaga sempre), mas um vídeo 4K pode ocupar alguns GB no meio do caminho.
