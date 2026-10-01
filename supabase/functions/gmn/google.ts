// Token do Google guardado em google_oauth_tokens (Fase 1: linha mais recente = contato@) e leitura do Drive.
// deno-lint-ignore-file no-explicit-any
import { foiPrazo, PRAZO, sinal } from "./prazo.ts";
import { linkDoGoogle, miniaturaGrande, tipoPelaAssinatura } from "./regras.ts";

const LIMITE_MINIATURA_BYTES = 5 * 1024 * 1024;
const AVISO_PASTA = "Não foi possível listar as fotos.";

type Sb = any;

/** Roda uma chamada ao Google; prazo estourado (o da chamada ou o total) vira mensagem em português. */
async function comPrazo<T>(onde: string, f: (s: AbortSignal) => Promise<T>, total?: AbortSignal): Promise<T> {
  try {
    return await f(sinal(PRAZO.google, total));
  } catch (e) {
    if (foiPrazo(e)) throw new Error(`O Google demorou demais para responder (${onde}).`);
    throw e;
  }
}

export async function tokenGoogle(sb: Sb, total?: AbortSignal): Promise<string> {
  const { data: row, error } = await sb
    .from("google_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row?.refresh_token) throw new Error("Google não conectado (Admin → Swipe file).");
  const expira = new Date(row.expires_at).getTime();
  if (row.access_token && !Number.isNaN(expira) && expira - Date.now() > 120_000) return row.access_token;

  // O sinal vale também para a leitura do corpo.
  const d = await comPrazo("token", async (signal) => {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
        refresh_token: row.refresh_token,
        grant_type: "refresh_token",
      }),
      signal,
    });
    // Página de erro em HTML não é JSON; prazo estourado segue para o tratamento de prazo.
    return await r.json().catch((e) => {
      if (foiPrazo(e)) throw e;
      console.error("Google devolveu resposta ilegível ao renovar o token:", e);
      throw new Error("O Google respondeu de forma inesperada ao renovar o token.");
    });
  }, total);
  if (d.error) throw new Error(`Google recusou renovar o token (${d.error}).`);
  const novo = new Date(Date.now() + Number(d.expires_in || 3600) * 1000).toISOString();
  await sb.from("google_oauth_tokens")
    .update({ access_token: d.access_token, expires_at: novo, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  return d.access_token;
}

export interface ImagemDrive {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  description: string;
  thumbnailLink: string | null;
}

/**
 * Toda imagem direto na pasta (sem subpastas), mais novas primeiro (as 200 mais novas: não há paginação); o formato e o
 * tamanho são tratados por quem baixa. Falha do Google vira um aviso fixo em português (o texto dele fica só no log).
 */
export async function imagensDaPasta(token: string, pastaId: string, total?: AbortSignal): Promise<ImagemDrive[]> {
  const q = `'${pastaId.replace(/'/g, "\\'")}' in parents and trashed = false and mimeType contains 'image/'`;
  const params = new URLSearchParams({
    q, fields: "files(id,name,mimeType,size,description,thumbnailLink)", pageSize: "200", orderBy: "createdTime desc",
  });
  params.set("supportsAllDrives", "true");
  params.set("includeItemsFromAllDrives", "true");
  const d = await comPrazo("pasta do Drive", async (signal) => {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal });
    const corpo = await r.json().catch((e) => {
      if (foiPrazo(e)) throw e;
      return {};
    });
    if (!r.ok) {
      console.error("Drive respondeu", r.status, "ao listar a pasta:", String(corpo?.error?.message ?? "").slice(0, 300));
      throw new Error(AVISO_PASTA);
    }
    return corpo;
  }, total);
  return (d.files ?? []).map((f: any): ImagemDrive => ({
    id: f.id, name: f.name ?? "", mimeType: f.mimeType ?? "", size: Number(f.size || 0),
    description: f.description ?? "", thumbnailLink: f.thumbnailLink ?? null,
  }));
}

export async function baixarDoDrive(token: string, id: string, total?: AbortSignal): Promise<Uint8Array> {
  return await comPrazo("foto do Drive", async (signal) => {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!r.ok) throw new Error(`Drive respondeu ${r.status} ao baixar a foto`);
    return new Uint8Array(await r.arrayBuffer());
  }, total);
}

/**
 * Miniatura grande que o Google gera (JPG ou PNG), para formatos como HEIC/WEBP ou arquivos acima de 5 MB. O token só vai
 * para um endereço do próprio Google; o tamanho (Content-Length e bytes lidos) e a assinatura completa são conferidos.
 */
export async function baixarMiniatura(token: string, link: string, total?: AbortSignal): Promise<{ bytes: Uint8Array; tipo: "image/jpeg" | "image/png" }> {
  const url = miniaturaGrande(link);
  if (!linkDoGoogle(url)) throw new Error("o link da miniatura não é do Google");
  return await comPrazo("miniatura do Drive", async (signal) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!r.ok) throw new Error(`Drive respondeu ${r.status} ao baixar a miniatura`);
    if (Number(r.headers.get("content-length")) > LIMITE_MINIATURA_BYTES) throw new Error("miniatura do Drive grande demais");
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > LIMITE_MINIATURA_BYTES) throw new Error("miniatura do Drive grande demais");
    const tipo = tipoPelaAssinatura(bytes);
    if (!tipo) throw new Error("miniatura do Drive não veio em JPG nem PNG");
    return { bytes, tipo };
  }, total);
}
