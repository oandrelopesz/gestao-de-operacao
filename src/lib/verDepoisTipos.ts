import { createElement, type ReactNode } from "react";
import { Globe, Instagram, LayoutTemplate, Link2, Youtube } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Tipo de link do "Ver depois" (tabela ver_depois_tipos, editável no Admin). */
export interface TipoVerDepois {
  id: string;
  label: string;
  hex: string;
  ordem: number;
}

/** Tipo que recebe os links de um tipo excluído; não pode ser excluído. */
export const TIPO_OUTRO = "outro";

/** Os 6 tipos de sempre: usados se a tabela não puder ser lida. */
export const TIPOS_VER_DEPOIS_PADRAO: TipoVerDepois[] = [
  { id: "youtube", label: "Vídeo do YouTube", hex: "#ef4444", ordem: 0 },
  { id: "reel", label: "Reel", hex: "#ec4899", ordem: 1 },
  { id: "post", label: "Post", hex: "#a855f7", ordem: 2 },
  { id: "lp", label: "Landing page", hex: "#f59e0b", ordem: 3 },
  { id: "site", label: "Site", hex: "#3b82f6", ordem: 4 },
  { id: TIPO_OUTRO, label: "Outro link", hex: "#64748b", ordem: 5 },
];

/** Paleta do seletor de cor no Admin (inclui as cores dos tipos padrão). */
export const VER_DEPOIS_CORES = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#a855f7", "#ec4899", "#64748b",
];

/** Ícone pelo id do tipo; tipos criados no Admin usam o ícone de link. */
export function iconeDoTipo(id: string): ReactNode {
  const icone =
    id === "youtube" ? Youtube
    : id === "reel" || id === "post" ? Instagram
    : id === "lp" ? LayoutTemplate
    : id === "site" ? Globe
    : Link2;
  return createElement(icone, { size: 14 });
}

function slugifyTipoId(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || "tipo";
  return `${base}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function fetchTiposVerDepois(): Promise<TipoVerDepois[]> {
  const { data, error } = await supabase
    .from("ver_depois_tipos")
    .select("id, label, hex, ordem")
    .order("ordem")
    .order("created_at");
  if (error) throw error;
  return (data || []) as TipoVerDepois[];
}

/** Cria (sem id) ou atualiza (com id) um tipo. Tipo novo entra no fim da lista. */
export async function salvarTipoVerDepois(t: { id?: string; label: string; hex: string }): Promise<void> {
  const label = t.label.trim();
  if (t.id) {
    const { error } = await supabase.from("ver_depois_tipos").update({ label, hex: t.hex }).eq("id", t.id);
    if (error) throw error;
    return;
  }
  const { data: ultimo, error: erroOrdem } = await supabase
    .from("ver_depois_tipos")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroOrdem) throw erroOrdem;
  const ordem = ultimo ? ultimo.ordem + 1 : 0;
  const { error } = await supabase.from("ver_depois_tipos").insert([{ id: slugifyTipoId(label), label, hex: t.hex, ordem }]);
  if (error) throw error;
}

/** Exclui um tipo; o banco move os links dele para "Outro link". */
export async function excluirTipoVerDepois(id: string): Promise<void> {
  if (id === TIPO_OUTRO) throw new Error('O tipo "Outro link" não pode ser excluído');
  const { error } = await supabase.from("ver_depois_tipos").delete().eq("id", id);
  if (error) throw error;
}

/** Troca o tipo de posição com o vizinho (delta -1 sobe, +1 desce) e regrava a ordem inteira. */
export async function moverTipoVerDepois(tipos: TipoVerDepois[], id: string, delta: number): Promise<void> {
  const idx = tipos.findIndex((t) => t.id === id);
  const alvo = idx + delta;
  if (idx < 0 || alvo < 0 || alvo >= tipos.length) return;
  const reordenados = [...tipos];
  [reordenados[idx], reordenados[alvo]] = [reordenados[alvo], reordenados[idx]];
  const resultados = await Promise.all(
    reordenados.map((t, i) => supabase.from("ver_depois_tipos").update({ ordem: i }).eq("id", t.id)),
  );
  const falha = resultados.find((r) => r.error);
  if (falha?.error) throw falha.error;
}
