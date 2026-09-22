import { supabase } from "@/integrations/supabase/client";
import { ensureFolder, getSwipeKey, trashFile, type DriveFile } from "@/lib/googleDrive";

export type SwipeCategoria =
  | "oferta" | "video_organico" | "video_anuncio" | "anuncio_estatico"
  | "post_estatico" | "carrossel" | "landing_page" | "site";

export type SwipeRede = "instagram" | "facebook" | "youtube" | "tiktok" | "linkedin" | "x" | "pinterest" | "internet" | "outro";

export type SwipeStatus = "pendente" | "baixando" | "pronto" | "falhou" | "manual";

/** Nome da pasta (plural) e prefixo do arquivo (singular) de cada categoria */
export const CATEGORIAS: { id: SwipeCategoria; pasta: string; singular: string; hex: string }[] = [
  { id: "oferta", pasta: "Ofertas", singular: "Oferta", hex: "#f59e0b" },
  { id: "video_organico", pasta: "Vídeos orgânicos", singular: "Vídeo orgânico", hex: "#10b981" },
  { id: "video_anuncio", pasta: "Vídeos de anúncio", singular: "Vídeo de anúncio", hex: "#ef4444" },
  { id: "anuncio_estatico", pasta: "Anúncios estáticos", singular: "Anúncio estático", hex: "#f97316" },
  { id: "post_estatico", pasta: "Posts estáticos", singular: "Post estático", hex: "#a855f7" },
  { id: "carrossel", pasta: "Carrosséis", singular: "Carrossel", hex: "#ec4899" },
  { id: "landing_page", pasta: "Landing pages", singular: "Landing page", hex: "#3b82f6" },
  { id: "site", pasta: "Sites", singular: "Site", hex: "#06b6d4" },
];

export const REDES: { id: SwipeRede; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X (Twitter)" },
  { id: "pinterest", label: "Pinterest" },
  { id: "internet", label: "Internet (site / LP)" },
  { id: "outro", label: "Outro" },
];

export const STATUS_META: Record<SwipeStatus, { label: string; hex: string }> = {
  pendente: { label: "Na fila", hex: "#64748b" },
  baixando: { label: "Baixando", hex: "#3b82f6" },
  pronto: { label: "No Drive", hex: "#10b981" },
  falhou: { label: "Falhou · link salvo", hex: "#ef4444" },
  manual: { label: "Enviar arquivo", hex: "#f59e0b" },
};

export const categoriaMeta = (id: string) => CATEGORIAS.find((c) => c.id === id) || CATEGORIAS[0];
export const redeLabel = (id: string) => REDES.find((r) => r.id === id)?.label || id;

export interface SwipeNicho {
  id: string;
  nome: string;
  nome_normalizado: string;
  pai_id: string | null;
  drive_folder_id: string | null;
  drive_folder_link: string | null;
  ordem: number;
}

export interface SwipeItem {
  id: string;
  categoria: SwipeCategoria;
  nicho_id: string;
  subnicho_id: string | null;
  rede: SwipeRede;
  link: string | null;
  player: string;
  nota: string | null;
  tags: string[];
  nome_arquivo: string | null;
  drive_file_id: string | null;
  drive_folder_id: string | null;
  drive_web_link: string | null;
  thumbnail_link: string | null;
  mime: string | null;
  tamanho: number | null;
  status: SwipeStatus;
  erro: string | null;
  created_at: string;
  updated_at: string;
}

export interface SwipeConfig {
  root_folder_id: string | null;
  root_folder_link: string | null;
  conta_google: string | null;
  conectado_em: string | null;
}

// ---------------------------------------------------------------- Nomes

export function normalizarNome(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= m; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[n];
}

/**
 * Procura um nicho igual (ignorando acento/maiúsculas) ou parecido (erro de digitação).
 * Devolve `exato` quando é o mesmo nome, `parecido` quando vale confirmar com o usuário.
 */
export function encontrarNicho(nome: string, candidatos: SwipeNicho[]): { exato?: SwipeNicho; parecido?: SwipeNicho } {
  const alvo = normalizarNome(nome);
  if (!alvo) return {};
  const exato = candidatos.find((c) => c.nome_normalizado === alvo);
  if (exato) return { exato };
  let melhor: SwipeNicho | undefined;
  let melhorDist = Infinity;
  for (const c of candidatos) {
    const d = levenshtein(alvo, c.nome_normalizado);
    const limite = alvo.length <= 4 ? 1 : alvo.length <= 8 ? 2 : 3;
    if (d <= limite && d < melhorDist) {
      melhor = c;
      melhorDist = d;
    }
  }
  return { parecido: melhor };
}

/** Nome do arquivo no Drive: "Vídeo de anúncio - Médico - Ortopedia - Dr Fulano" */
export function nomeArquivo(categoria: SwipeCategoria, nicho: string, subnicho: string | null | undefined, player: string): string {
  const partes = [categoriaMeta(categoria).singular, nicho.trim(), subnicho?.trim() || "", player.trim()].filter(Boolean);
  return partes.join(" - ").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").slice(0, 180);
}

export function extensaoDe(file: File): string {
  const m = file.name.match(/\.([a-z0-9]{1,6})$/i);
  if (m) return m[1].toLowerCase();
  const byMime: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "application/pdf": "pdf", "text/html": "html" };
  return byMime[file.type] || "bin";
}

// ---------------------------------------------------------------- Dados

export async function fetchSwipeConfig(): Promise<SwipeConfig> {
  const { data, error } = await supabase.from("swipe_config").select("root_folder_id, root_folder_link, conta_google, conectado_em").eq("id", 1).maybeSingle();
  if (error) throw error;
  return (data as SwipeConfig) || { root_folder_id: null, root_folder_link: null, conta_google: null, conectado_em: null };
}

export async function saveSwipeConfig(patch: Partial<SwipeConfig>): Promise<void> {
  const { error } = await supabase.from("swipe_config").upsert({ id: 1, ...patch }, { onConflict: "id" });
  if (error) throw error;
}

export async function fetchNichos(): Promise<SwipeNicho[]> {
  const { data, error } = await supabase.from("swipe_nichos").select("*").order("ordem").order("nome");
  if (error) throw error;
  return (data || []) as SwipeNicho[];
}

export async function fetchItens(): Promise<SwipeItem[]> {
  const { data, error } = await supabase.from("swipe_itens").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as SwipeItem[];
}

export function temChave(): boolean {
  return !!getSwipeKey();
}

/**
 * Garante nicho (e subnicho) no banco e as pastas correspondentes no Drive.
 * Estrutura: Swipe File / Nicho / [Subnicho] / Categoria.
 */
export async function garantirPastas(opts: {
  rootFolderId: string;
  nicho: { id?: string; nome: string };
  subnicho?: { id?: string; nome: string } | null;
  categoria: SwipeCategoria;
  nichosAtuais: SwipeNicho[];
}): Promise<{ nicho: SwipeNicho; subnicho: SwipeNicho | null; categoriaFolder: DriveFile }> {
  const nicho = await garantirNicho(opts.nicho, null, opts.rootFolderId, opts.nichosAtuais);
  let subnicho: SwipeNicho | null = null;
  if (opts.subnicho && opts.subnicho.nome.trim()) {
    subnicho = await garantirNicho(opts.subnicho, nicho.id, nicho.drive_folder_id!, opts.nichosAtuais);
  }
  const paiFolder = (subnicho ?? nicho).drive_folder_id!;
  const categoriaFolder = await ensureFolder(categoriaMeta(opts.categoria).pasta, paiFolder);
  return { nicho, subnicho, categoriaFolder };
}

async function garantirNicho(
  ref: { id?: string; nome: string },
  paiId: string | null,
  paiFolderId: string,
  atuais: SwipeNicho[],
): Promise<SwipeNicho> {
  const nome = ref.nome.trim();
  let nicho = ref.id ? atuais.find((n) => n.id === ref.id) : undefined;
  if (!nicho) {
    const normalizado = normalizarNome(nome);
    nicho = atuais.find((n) => n.pai_id === paiId && n.nome_normalizado === normalizado);
  }
  if (!nicho) {
    const folder = await ensureFolder(nome, paiFolderId);
    const { data, error } = await supabase
      .from("swipe_nichos")
      .insert([{ nome, nome_normalizado: normalizarNome(nome), pai_id: paiId, drive_folder_id: folder.id, drive_folder_link: folder.webViewLink || null }])
      .select("*")
      .single();
    if (error) throw error;
    return data as SwipeNicho;
  }
  if (!nicho.drive_folder_id) {
    const folder = await ensureFolder(nicho.nome, paiFolderId);
    const { error } = await supabase.from("swipe_nichos").update({ drive_folder_id: folder.id, drive_folder_link: folder.webViewLink || null }).eq("id", nicho.id);
    if (error) throw error;
    nicho = { ...nicho, drive_folder_id: folder.id, drive_folder_link: folder.webViewLink || null };
  }
  return nicho;
}

export async function criarItem(input: Omit<Partial<SwipeItem>, "id" | "created_at" | "updated_at"> & {
  categoria: SwipeCategoria; nicho_id: string; player: string; rede: SwipeRede; status: SwipeStatus;
}): Promise<SwipeItem> {
  const { data, error } = await supabase.from("swipe_itens").insert([input]).select("*").single();
  if (error) throw error;
  return data as SwipeItem;
}

export async function atualizarItem(id: string, patch: Partial<SwipeItem>): Promise<void> {
  const { error } = await supabase.from("swipe_itens").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * Remove o item do catálogo e manda o arquivo dele para a Lixeira do Drive, para não deixar arquivo
 * morto. Só o `drive_file_id` vai para a Lixeira: em item de arquivo único ele é o próprio arquivo,
 * e em carrossel/LP ele é a pasta dedicada do item (leva o conteúdo junto). O `drive_folder_id` de um
 * item de arquivo único é a pasta compartilhada da categoria — nunca é apagado. Se a Lixeira falhar,
 * a linha do banco não é apagada (nada de órfão): dá para tentar de novo.
 */
export async function excluirItem(item: Pick<SwipeItem, "id" | "drive_file_id">): Promise<void> {
  if (item.drive_file_id) {
    await trashFile(item.drive_file_id);
  }
  const { error } = await supabase.from("swipe_itens").delete().eq("id", item.id);
  if (error) throw error;
}

export async function enfileirarJob(itemId: string, tipo: "download" | "lp", payload: Record<string, string | number | boolean | null>): Promise<void> {
  const { error } = await supabase.from("swipe_jobs").insert([{ item_id: itemId, tipo, payload }]);
  if (error) throw error;
}

export function erroAmigavel(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/schema cache|does not exist|not find the table/i.test(msg) && /swipe/i.test(msg)) {
    return "As tabelas do swipe file ainda não existem. Rode supabase/migrations/20260918120000_swipe_file.sql no SQL Editor.";
  }
  return msg;
}
