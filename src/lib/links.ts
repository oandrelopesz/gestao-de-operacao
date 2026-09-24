// Aba Links: links nomeados por tema (tabelas links e link_temas).
// O types.ts gerado ainda não conhece as tabelas novas: por isso `as any` nos `.from(...)`.
import { supabase } from "@/integrations/supabase/client";
import type { LinkBase } from "@/lib/linksTexto";

export interface TemaLink { id: string; nome: string; hex: string; ordem: number }
export interface Link extends LinkBase { created_at: string }

/** Disparado a cada mudança nos temas, para a aba e o Admin recarregarem. */
export const EVENTO_TEMAS_LINKS = "links-temas";

export const CORES_TEMAS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#a855f7", "#ec4899", "#64748b",
];

const temas = () => supabase.from("link_temas" as any) as any;
const links = () => supabase.from("links" as any) as any;

function avisarTemas() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_TEMAS_LINKS));
}

/** Tabela ainda não criada no banco (migration pendente) vira uma mensagem clara. */
export function traduzErroLinks(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? "");
  if (/(link_temas|links)/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return "As tabelas da aba Links ainda não existem no banco (migration 20260924150000_links.sql).";
  }
  return msg || "Erro ao salvar";
}

export async function fetchTemas(): Promise<TemaLink[]> {
  const { data, error } = await temas().select("id, nome, hex, ordem").order("ordem").order("created_at");
  if (error) throw error;
  return (data || []) as TemaLink[];
}

export async function fetchLinks(): Promise<Link[]> {
  const { data, error } = await links().select("id, nome, url, tema_id, created_at");
  if (error) throw error;
  return (data || []) as Link[];
}

export async function criarLink(l: { nome: string; url: string; tema_id: string | null }): Promise<void> {
  const { error } = await links().insert([{ nome: l.nome.trim(), url: l.url, tema_id: l.tema_id }]);
  if (error) throw error;
}

export async function atualizarLink(id: string, l: { nome: string; url: string; tema_id: string | null }): Promise<void> {
  const { error } = await links().update({ nome: l.nome.trim(), url: l.url, tema_id: l.tema_id }).eq("id", id);
  if (error) throw error;
}

/** Vários links de uma vez para um tema (ou Sem tema). */
export async function moverLinks(ids: string[], tema_id: string | null): Promise<void> {
  if (!ids.length) return;
  const { error } = await links().update({ tema_id }).in("id", ids);
  if (error) throw error;
}

export async function excluirLinks(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await links().delete().in("id", ids);
  if (error) throw error;
}

export async function criarTema(nome: string, hex: string): Promise<TemaLink> {
  const { data: ultimo, error: erroOrdem } = await temas().select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
  if (erroOrdem) throw erroOrdem;
  const { data, error } = await temas()
    .insert([{ nome: nome.trim(), hex, ordem: ultimo ? ultimo.ordem + 1 : 0 }])
    .select("id, nome, hex, ordem")
    .single();
  if (error) throw error;
  avisarTemas();
  return data as TemaLink;
}

export async function atualizarTema(id: string, campos: { nome: string; hex: string }): Promise<void> {
  const { error } = await temas().update({ nome: campos.nome.trim(), hex: campos.hex }).eq("id", id);
  if (error) throw error;
  avisarTemas();
}

/** Exclui o tema; o banco deixa os links dele sem tema (ON DELETE SET NULL). */
export async function excluirTema(id: string): Promise<void> {
  const { error } = await temas().delete().eq("id", id);
  if (error) throw error;
  avisarTemas();
}

/** Troca o tema de posição com o vizinho (-1 sobe, +1 desce) e regrava a ordem inteira. */
export async function moverTema(lista: TemaLink[], id: string, delta: -1 | 1): Promise<void> {
  const idx = lista.findIndex((t) => t.id === id);
  const alvo = idx + delta;
  if (idx < 0 || alvo < 0 || alvo >= lista.length) return;
  const nova = [...lista];
  [nova[idx], nova[alvo]] = [nova[alvo], nova[idx]];
  const resultados = await Promise.all(nova.map((t, i) => temas().update({ ordem: i }).eq("id", t.id)));
  avisarTemas();
  const falha = resultados.find((r: { error: unknown }) => r.error);
  if (falha?.error) throw falha.error;
}
