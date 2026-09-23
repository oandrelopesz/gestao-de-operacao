/**
 * Plataformas do swipe file (sem Supabase nem alias "@/", para `node --test`).
 * Os ids precisam bater com o CHECK de swipe_itens.rede (migration 20260923150000_swipe_redes.sql)
 * e com o mapa de cookies do worker (worker/src/jobs/download.js).
 */

export type SwipeRede =
  | "instagram" | "facebook" | "meta_ads" | "tiktok" | "tiktok_ads" | "youtube" | "google_ads"
  | "linkedin" | "x" | "threads" | "kwai" | "pinterest" | "internet" | "outro";

export const REDES: { id: SwipeRede; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook (orgânico)" },
  { id: "meta_ads", label: "Meta Ads (Biblioteca de Anúncios)" },
  { id: "tiktok", label: "TikTok orgânico" },
  { id: "tiktok_ads", label: "TikTok Ads" },
  { id: "youtube", label: "YouTube" },
  { id: "google_ads", label: "Google Ads (Central de Transparência)" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X (Twitter)" },
  { id: "threads", label: "Threads" },
  { id: "kwai", label: "Kwai" },
  { id: "pinterest", label: "Pinterest" },
  { id: "internet", label: "Internet (site / LP)" },
  { id: "outro", label: "Outro" },
];

const LABEL_CURTO: Partial<Record<SwipeRede, string>> = {
  meta_ads: "Meta Ads",
  tiktok_ads: "TikTok Ads",
  google_ads: "Google Ads",
  facebook: "Facebook",
  tiktok: "TikTok",
};

/** Nome curto para badges e filtros. */
export function redeLabel(id: string): string {
  return LABEL_CURTO[id as SwipeRede] || REDES.find((r) => r.id === id)?.label || id;
}

/** Plataforma pelo link (o usuário pode trocar no formulário). Biblioteca de anúncios antes do orgânico. */
export function detectarRede(link: string): SwipeRede | null {
  const texto = link.trim();
  if (!texto) return null;
  let host = "";
  let caminho = "";
  try {
    const u = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
    host = u.hostname.toLowerCase();
    caminho = u.pathname.toLowerCase();
  } catch {
    return "internet";
  }
  const de = (dominio: string) => host === dominio || host.endsWith(`.${dominio}`);

  if (de("facebook.com") && caminho.startsWith("/ads/library")) return "meta_ads";
  if (de("facebook.com") || de("fb.watch")) return "facebook";
  if (host === "ads.tiktok.com" || host === "library.tiktok.com") return "tiktok_ads";
  if (de("tiktok.com")) return "tiktok";
  if (host === "adstransparency.google.com") return "google_ads";
  if (de("instagram.com")) return "instagram";
  if (de("youtube.com") || de("youtu.be")) return "youtube";
  if (de("linkedin.com")) return "linkedin";
  if (de("x.com") || de("twitter.com")) return "x";
  if (de("threads.net") || de("threads.com")) return "threads";
  if (de("kwai.com") || de("kw.ai")) return "kwai";
  if (/(^|\.)pinterest\.[a-z.]+$/.test(host) || de("pin.it")) return "pinterest";
  return "internet";
}
