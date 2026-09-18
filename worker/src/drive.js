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
