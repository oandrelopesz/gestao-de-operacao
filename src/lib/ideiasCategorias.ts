import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCached, setCached } from "@/lib/pageCache";
import { slugifyColumnId } from "@/lib/demandaColunas";
import { CATEGORIA_CLIENTE, TIPOS_IDEIA } from "@/lib/ideiasTexto";

/** Categoria de ideia (tabela ideia_categorias, editável na aba Ideias e no Admin). */
export interface CategoriaIdeia {
  id: string;
  label: string;
  hex: string;
  ordem: number;
  /** Fixa: não pode ser excluída ('cliente'). */
  sistema: boolean;
}

/** Evento disparado a cada criação/alteração, para as outras telas recarregarem. */
export const EVENTO_CATEGORIAS_IDEIAS = "ideias-categorias";

/** Paleta do seletor de cor (inclui as cores das categorias padrão). */
export const CORES_CATEGORIAS_IDEIAS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#a855f7", "#ec4899", "#64748b",
];

export const CATEGORIAS_IDEIAS_PADRAO: CategoriaIdeia[] = TIPOS_IDEIA.map((t, i) => ({
  ...t,
  ordem: i,
  sistema: t.id === CATEGORIA_CLIENTE,
}));

function avisarAlteracao() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_CATEGORIAS_IDEIAS));
}

/** Lê as categorias sem tratar erro (o Admin mostra o erro). */
export async function fetchCategoriasIdeiasOuErro(): Promise<CategoriaIdeia[]> {
  const { data, error } = await supabase
    .from("ideia_categorias")
    .select("id, label, hex, ordem, sistema")
    .order("ordem")
    .order("created_at");
  if (error) throw error;
  return (data || []) as CategoriaIdeia[];
}

/** Categorias ordenadas; se a tabela falhar (ou vier vazia), volta às 3 padrão. */
export async function fetchCategoriasIdeias(): Promise<CategoriaIdeia[]> {
  try {
    const lista = await fetchCategoriasIdeiasOuErro();
    return lista.length > 0 ? lista : CATEGORIAS_IDEIAS_PADRAO;
  } catch (e) {
    console.error("Erro ao buscar categorias de ideias:", e);
    return CATEGORIAS_IDEIAS_PADRAO;
  }
}

/** Cria uma categoria no fim da lista. */
export async function criarCategoriaIdeia(label: string, hex: string): Promise<CategoriaIdeia> {
  const nome = label.trim();
  const { data: ultimo, error: erroOrdem } = await supabase
    .from("ideia_categorias")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroOrdem) throw erroOrdem;
  const nova: CategoriaIdeia = {
    id: slugifyColumnId(nome),
    label: nome,
    hex,
    ordem: ultimo ? ultimo.ordem + 1 : 0,
    sistema: false,
  };
  const { error } = await supabase.from("ideia_categorias").insert([nova]);
  if (error) throw error;
  avisarAlteracao();
  return nova;
}

export async function atualizarCategoriaIdeia(id: string, campos: { label?: string; hex?: string }): Promise<void> {
  const patch: { label?: string; hex?: string } = {};
  if (campos.label !== undefined) patch.label = campos.label.trim();
  if (campos.hex !== undefined) patch.hex = campos.hex;
  const { error } = await supabase.from("ideia_categorias").update(patch).eq("id", id);
  if (error) throw error;
  avisarAlteracao();
}

/** Exclui uma categoria; o banco move as ideias dela para a primeira categoria restante. */
export async function excluirCategoriaIdeia(id: string): Promise<void> {
  if (id === CATEGORIA_CLIENTE) throw new Error('A categoria "Para cliente" é fixa e não pode ser excluída');
  const { error } = await supabase.from("ideia_categorias").delete().eq("id", id);
  if (error) throw error;
  avisarAlteracao();
}

/** Troca a categoria de posição com a vizinha (delta -1 sobe, +1 desce) e regrava a ordem inteira. */
export async function moverCategoriaIdeia(lista: CategoriaIdeia[], id: string, delta: number): Promise<void> {
  const idx = lista.findIndex((c) => c.id === id);
  const alvo = idx + delta;
  if (idx < 0 || alvo < 0 || alvo >= lista.length) return;
  const reordenadas = [...lista];
  [reordenadas[idx], reordenadas[alvo]] = [reordenadas[alvo], reordenadas[idx]];
  const resultados = await Promise.all(
    reordenadas.map((c, i) => supabase.from("ideia_categorias").update({ ordem: i }).eq("id", c.id)),
  );
  avisarAlteracao();
  const falha = resultados.find((r) => r.error);
  if (falha?.error) throw falha.error;
}

/** Chave do cache em memória (a aba abre já com as categorias da última vez). */
export const CACHE_CATEGORIAS_IDEIAS = "ideias.categorias";

// A aba e o formulário pedem as categorias juntos ao abrir: uma consulta só, dividida entre os dois.
// Depois de uma alteração (evento), cada um busca de novo, como antes.
let buscaEmAndamento: Promise<CategoriaIdeia[]> | null = null;
function buscarCategorias(forcar: boolean): Promise<CategoriaIdeia[]> {
  if (forcar || !buscaEmAndamento) {
    const busca = fetchCategoriasIdeias();
    buscaEmAndamento = busca;
    busca.finally(() => { if (buscaEmAndamento === busca) buscaEmAndamento = null; });
  }
  return buscaEmAndamento;
}

/** Categorias da tabela; recarrega quando outra tela avisa pelo evento "ideias-categorias". */
export function useCategoriasIdeias() {
  const [categorias, setCategorias] = useState<CategoriaIdeia[]>(
    () => getCached<CategoriaIdeia[]>(CACHE_CATEGORIAS_IDEIAS) ?? CATEGORIAS_IDEIAS_PADRAO,
  );

  const recarregar = useCallback(async (forcar = true) => {
    const lista = await buscarCategorias(forcar);
    setCached(CACHE_CATEGORIAS_IDEIAS, lista);
    setCategorias(lista);
  }, []);

  useEffect(() => {
    recarregar(false);
    const ouvir = () => { recarregar(); };
    window.addEventListener(EVENTO_CATEGORIAS_IDEIAS, ouvir);
    return () => window.removeEventListener(EVENTO_CATEGORIAS_IDEIAS, ouvir);
  }, [recarregar]);

  return { categorias, recarregar };
}
