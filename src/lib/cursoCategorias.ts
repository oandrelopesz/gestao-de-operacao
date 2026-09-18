import { supabase } from "@/integrations/supabase/client";

export interface CursoCategoriaDef {
  id: string;
  nome: string;
  ordem: number;
  /** Hex da cor (ex.: #8b5cf6). Registros antigos podem ter uma classe Tailwind aqui. */
  cor: string | null;
}

// Mesma paleta das colunas do Kanban, para os badges dos cards de curso
export const CATEGORIA_COLORS = [
  "#8b5cf6", "#3b82f6", "#06b6d4", "#f59e0b", "#10b981", "#f97316", "#f43f5e", "#64748b",
];

// A aba Cursos não exige sessão real: segue o mesmo id interno que o formulário sempre usou
const FALLBACK_USER_ID = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";

export async function getCursoUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || FALLBACK_USER_ID;
}

export function corDaCategoria(cor: string | null | undefined): string {
  return cor && cor.startsWith("#") ? cor : CATEGORIA_COLORS[0];
}

export async function fetchCursoCategorias(): Promise<CursoCategoriaDef[]> {
  const { data, error } = await supabase
    .from("curso_categorias")
    .select("id, nome, ordem, cor")
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data || []) as CursoCategoriaDef[];
}

/**
 * Cria uma categoria no fim da lista. Se já existir uma com o mesmo nome
 * (ignorando maiúsculas), devolve a existente em vez de duplicar.
 */
export async function createCursoCategoria(nome: string, cor?: string): Promise<CursoCategoriaDef> {
  const trimmed = nome.trim();
  const existentes = await fetchCursoCategorias();
  const igual = existentes.find((c) => c.nome.toLowerCase() === trimmed.toLowerCase());
  if (igual) return igual;

  const ordem = existentes.length ? Math.max(...existentes.map((c) => c.ordem)) + 1 : 0;
  const { data, error } = await supabase
    .from("curso_categorias")
    .insert([{
      nome: trimmed,
      user_id: await getCursoUserId(),
      ordem,
      cor: cor || CATEGORIA_COLORS[existentes.length % CATEGORIA_COLORS.length],
    }])
    .select("id, nome, ordem, cor")
    .single();
  if (error) throw error;
  return data as CursoCategoriaDef;
}
