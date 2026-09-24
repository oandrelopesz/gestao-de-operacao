// Aba Notas: anotações rápidas por tema (tabelas notas e nota_temas).
// O types.ts gerado ainda não conhece as tabelas novas: por isso `as any` nos `.from(...)`.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { NotaBase } from "@/lib/notasTexto";
import type { ApiTemas, Tema } from "@/components/temas/TemasLista";

export interface Nota extends NotaBase { created_at: string }

/** Disparado a cada mudança nos temas, para a aba e o Admin recarregarem. */
export const EVENTO_TEMAS_NOTAS = "notas-temas";

const temas = () => supabase.from("nota_temas" as any) as any;
const notas = () => supabase.from("notas" as any) as any;

function avisarTemas() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_TEMAS_NOTAS));
}

/** Tabela ainda não criada no banco (migration pendente) vira uma mensagem clara. */
export function traduzErroNotas(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? "");
  if (/(nota_temas|notas)/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return "As tabelas da aba Notas ainda não existem no banco (migration 20260924170000_notas.sql).";
  }
  return msg || "Erro ao salvar";
}

export async function fetchTemasNotas(): Promise<Tema[]> {
  const { data, error } = await temas().select("id, nome, hex, ordem").order("ordem").order("created_at");
  if (error) throw error;
  return (data || []) as Tema[];
}

export async function fetchNotas(): Promise<Nota[]> {
  const { data, error } = await notas().select("id, titulo, conteudo, tema_id, created_at, updated_at");
  if (error) throw error;
  return (data || []) as Nota[];
}

type Campos = { titulo: string; conteudo: string; tema_id: string | null };

export async function criarNota(c: Campos): Promise<Nota> {
  const { data, error } = await notas()
    .insert([{ titulo: c.titulo.trim(), conteudo: c.conteudo, tema_id: c.tema_id }])
    .select("id, titulo, conteudo, tema_id, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as Nota;
}

export async function atualizarNota(id: string, c: Campos): Promise<void> {
  const { error } = await notas()
    .update({ titulo: c.titulo.trim(), conteudo: c.conteudo, tema_id: c.tema_id, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Várias notas de uma vez para um tema (ou Sem tema). Não mexe na data de edição. */
export async function moverNotas(ids: string[], tema_id: string | null): Promise<void> {
  if (!ids.length) return;
  const { error } = await notas().update({ tema_id }).in("id", ids);
  if (error) throw error;
}

export async function excluirNotas(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await notas().delete().in("id", ids);
  if (error) throw error;
}

/** Operações de tema usadas pelo gerenciador de temas (aba Notas e Admin). */
export const apiTemasNotas: ApiTemas = {
  evento: EVENTO_TEMAS_NOTAS,
  item: { singular: "nota", plural: "notas", feminino: true },
  exemplo: "Ex.: Ideias de conteúdo",
  traduzErro: traduzErroNotas,
  fetchTemas: fetchTemasNotas,
  async contar() {
    const { data, error } = await notas().select("tema_id");
    if (error) throw error;
    const qtd: Record<string, number> = {};
    (data || []).forEach((x: { tema_id: string | null }) => { if (x.tema_id) qtd[x.tema_id] = (qtd[x.tema_id] || 0) + 1; });
    return qtd;
  },
  async criar(nome, hex) {
    const { data: ultimo, error: erroOrdem } = await temas().select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
    if (erroOrdem) throw erroOrdem;
    const { error } = await temas().insert([{ nome: nome.trim(), hex, ordem: ultimo ? ultimo.ordem + 1 : 0 }]);
    if (error) throw error;
    avisarTemas();
  },
  async atualizar(id, campos) {
    const { error } = await temas().update({ nome: campos.nome.trim(), hex: campos.hex }).eq("id", id);
    if (error) throw error;
    avisarTemas();
  },
  async excluir(id) {
    const { error } = await temas().delete().eq("id", id);
    if (error) throw error;
    avisarTemas();
  },
  async mover(lista, id, delta) {
    const idx = lista.findIndex((t) => t.id === id);
    const alvo = idx + delta;
    if (idx < 0 || alvo < 0 || alvo >= lista.length) return;
    const nova = [...lista];
    [nova[idx], nova[alvo]] = [nova[alvo], nova[idx]];
    const resultados = await Promise.all(nova.map((t, i) => temas().update({ ordem: i }).eq("id", t.id)));
    avisarTemas();
    const falha = resultados.find((r: { error: unknown }) => r.error);
    if (falha?.error) throw falha.error;
  },
};
