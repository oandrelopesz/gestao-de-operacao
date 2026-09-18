/**
 * Google Drive no navegador. O access token vem da edge function `google-token`, protegida pela
 * chave do swipe file (guardada em localStorage). Uploads vão direto do navegador para o Drive
 * (upload resumível, aguenta arquivos grandes e retoma quando cai).
 */
const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const KEY_STORAGE = "swipe_key";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function getSwipeKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function setSwipeKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // storage indisponível: a chave vale só para esta sessão
  }
  tokenCache = null;
}

export interface DriveStatus {
  connected: boolean;
  expires_at: string | null;
  scope: string | null;
  key_configured: boolean;
  client_id: string | null;
  redirect_uri: string | null;
}

export async function driveStatus(): Promise<DriveStatus> {
  const r = await fetch(`${FUNCTIONS_URL}/google-token?action=status`, { headers: { apikey: ANON_KEY } });
  if (!r.ok) throw new Error(`Função google-token indisponível (${r.status})`);
  return r.json();
}

/** URL de autorização do Google; o retorno é a página atual (funciona em qualquer domínio) */
export function oauthUrl(clientId: string, redirectUri: string, userId: string, returnTo: string): string {
  const state = btoa(JSON.stringify({ user_id: userId, return_to: returnTo }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", DRIVE_SCOPE);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

let tokenCache: { token: string; expiresAt: number } | null = null;

export class SwipeKeyError extends Error {}

export async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - Date.now() > 60_000) return tokenCache.token;
  const key = getSwipeKey();
  if (!key) throw new SwipeKeyError("Informe a chave do swipe file (Admin → Google Drive).");
  const r = await fetch(`${FUNCTIONS_URL}/google-token`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json", "x-swipe-key": key },
    body: "{}",
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 403) throw new SwipeKeyError(data.error || "Chave do swipe file inválida");
  if (!r.ok) throw new Error(data.error || `Erro ao obter token (${r.status})`);
  tokenCache = { token: data.access_token, expiresAt: new Date(data.expires_at).getTime() };
  return data.access_token;
}

async function driveFetch(path: string, init: RequestInit = {}, base = DRIVE): Promise<Response> {
  const token = await getAccessToken();
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) {
    tokenCache = null;
    throw new Error("Token do Google expirou ou foi revogado. Reconecte o Drive no Admin.");
  }
  return r;
}

async function driveJson<T = any>(path: string, init: RequestInit = {}, base = DRIVE): Promise<T> {
  const r = await driveFetch(path, init, base);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Google Drive respondeu ${r.status}`);
  return data as T;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
  size?: string;
}

const FILE_FIELDS = "id,name,mimeType,webViewLink,thumbnailLink,size";

function escapeQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Pasta com esse nome dentro de `parentId` (ou na raiz do Drive); cria se não existir */
export async function ensureFolder(name: string, parentId: string | null): Promise<DriveFile> {
  const parent = parentId || "root";
  const q = `name='${escapeQuery(name)}' and mimeType='${FOLDER_MIME}' and '${parent}' in parents and trashed=false`;
  const found = await driveJson<{ files: DriveFile[] }>(`/files?q=${encodeURIComponent(q)}&fields=files(${FILE_FIELDS})&pageSize=5`);
  if (found.files?.length) return found.files[0];
  return driveJson<DriveFile>(`/files?fields=${FILE_FIELDS}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
  });
}

export async function getFile(id: string): Promise<DriveFile> {
  return driveJson<DriveFile>(`/files/${id}?fields=${FILE_FIELDS}`);
}

/** Cria um Google Docs com o texto (via conversão do Drive, sem precisar da API do Docs) */
export async function createGoogleDoc(parentId: string, name: string, texto: string): Promise<DriveFile> {
  const boundary = "swipe" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, mimeType: "application/vnd.google-apps.document", parents: [parentId] });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${texto}\r\n--${boundary}--`;
  return driveJson<DriveFile>(`/files?uploadType=multipart&fields=${FILE_FIELDS}`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  }, UPLOAD);
}

const CHUNK = 8 * 1024 * 1024; // múltiplo de 256 KB, exigido pelo Drive

/** Upload resumível direto do navegador; `onProgress` recebe 0-100 */
export async function uploadFile(
  file: Blob,
  opts: { name: string; parentId: string; mimeType?: string; onProgress?: (pct: number) => void },
): Promise<DriveFile> {
  const token = await getAccessToken();
  const mimeType = opts.mimeType || (file as File).type || "application/octet-stream";
  const start = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=${FILE_FIELDS}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(file.size),
    },
    body: JSON.stringify({ name: opts.name, parents: [opts.parentId] }),
  });
  if (!start.ok) {
    const e = await start.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Não foi possível iniciar o upload (${start.status})`);
  }
  const sessionUrl = start.headers.get("Location");
  if (!sessionUrl) throw new Error("Drive não devolveu a sessão de upload");

  let offset = 0;
  let tentativas = 0;
  while (offset < file.size || file.size === 0) {
    const end = Math.min(offset + CHUNK, file.size);
    const chunk = file.slice(offset, end);
    const result = await putChunk(sessionUrl, chunk, offset, end, file.size, mimeType, (loaded) => {
      opts.onProgress?.(Math.min(99, Math.round(((offset + loaded) / Math.max(1, file.size)) * 100)));
    });
    if (result.done) {
      opts.onProgress?.(100);
      return result.file!;
    }
    if (result.nextOffset !== null) {
      offset = result.nextOffset;
      tentativas = 0;
    } else {
      // Erro transitório: pergunta ao Drive onde parou e continua
      if (++tentativas > 5) throw new Error(result.error || "Upload falhou repetidas vezes");
      await new Promise((r) => setTimeout(r, 1500 * tentativas));
      offset = await queryOffset(sessionUrl, file.size);
    }
    if (file.size === 0) break;
  }
  throw new Error("Upload terminou sem confirmação do Drive");
}

function putChunk(
  sessionUrl: string, chunk: Blob, start: number, end: number, total: number, mimeType: string,
  onLoaded: (loaded: number) => void,
): Promise<{ done: boolean; file?: DriveFile; nextOffset: number | null; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", sessionUrl);
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${end - 1}/${total}`);
    xhr.upload.onprogress = (e) => onLoaded(e.loaded);
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          resolve({ done: true, file: JSON.parse(xhr.responseText), nextOffset: null });
        } catch {
          resolve({ done: true, file: undefined, nextOffset: null });
        }
      } else if (xhr.status === 308) {
        const range = xhr.getResponseHeader("Range");
        const m = range && range.match(/bytes=0-(\d+)/);
        resolve({ done: false, nextOffset: m ? Number(m[1]) + 1 : end });
      } else {
        resolve({ done: false, nextOffset: null, error: `Drive respondeu ${xhr.status}` });
      }
    };
    xhr.onerror = () => resolve({ done: false, nextOffset: null, error: "Falha de rede no upload" });
    xhr.send(chunk);
  });
}

async function queryOffset(sessionUrl: string, total: number): Promise<number> {
  const r = await fetch(sessionUrl, { method: "PUT", headers: { "Content-Range": `bytes */${total}` } });
  if (r.status === 308) {
    const range = r.headers.get("Range");
    const m = range && range.match(/bytes=0-(\d+)/);
    return m ? Number(m[1]) + 1 : 0;
  }
  return 0;
}
