import { supabase } from "@/integrations/supabase/client";
import { getUserId } from "@/lib/clientesService";
import { montarDescricaoDemanda, type TipoIdeia } from "@/lib/ideiasTexto";

export interface Ideia {
  id: string;
  tipo: TipoIdeia;
  titulo: string;
  descricao: string | null;
  links: string[];
  agencia: string | null;
  cliente_id: string | null;
  demanda_id: string | null;
  /** null = aberta */
  concluida_em: string | null;
  /** manual = botão da aba; demanda = a demanda ligada foi para Feito */
  concluida_por: "manual" | "demanda" | null;
  created_at: string;
  updated_at: string;
}

export type IdeiaInput = Pick<Ideia, "tipo" | "titulo" | "descricao" | "links" | "agencia" | "cliente_id">;

const ERRO_TABELA = "A tabela ideias ainda não existe. Rode supabase/migrations/20260921120000_ideias.sql no SQL Editor.";

export function mensagemErro(error: { message: string }): string {
  return /ideias/i.test(error.message) && /schema cache|does not exist|not find/i.test(error.message)
    ? ERRO_TABELA
    : error.message;
}

export async function fetchIdeias(): Promise<Ideia[]> {
  const { data, error } = await supabase.from("ideias").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Ideia[];
}

export async function salvarIdeia(input: IdeiaInput, id?: string): Promise<void> {
  const { error } = id
    ? await supabase.from("ideias").update(input).eq("id", id)
    : await supabase.from("ideias").insert([input]);
  if (error) throw error;
}

/** Conclui (ou reabre) a ideia pelo botão da aba. */
export async function marcarConcluida(id: string, concluida: boolean): Promise<void> {
  const { error } = await supabase
    .from("ideias")
    .update(concluida ? { concluida_em: new Date().toISOString(), concluida_por: "manual" } : { concluida_em: null, concluida_por: null })
    .eq("id", id);
  if (error) throw error;
}

export async function excluirIdeia(id: string): Promise<void> {
  const { error } = await supabase.from("ideias").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Cria a demanda na coluna escolhida — título, descrição + links e cliente copiados da ideia,
 * no fim da coluna, como o "quick add" do Kanban — e grava demanda_id na ideia.
 * Se o vínculo demanda_id falhar, a demanda não é desfeita (ela já existe no Kanban).
 */
export async function enviarIdeiaParaDemandas(ideia: Ideia, colunaId: string): Promise<string> {
  const userId = await getUserId();

  const { data: ultima, error: erroOrdem } = await supabase
    .from("demandas")
    .select("ordem")
    .eq("status", colunaId)
    .order("ordem", { ascending: false })
    .limit(1);
  if (erroOrdem) throw erroOrdem;
  const ordem = ultima && ultima.length > 0 ? (ultima[0].ordem || 0) + 1 : 0;

  const { data, error } = await supabase
    .from("demandas")
    .insert([{
      titulo: ideia.titulo,
      descricao: montarDescricaoDemanda(ideia),
      cliente_id: ideia.tipo === "cliente" ? ideia.cliente_id : null,
      status: colunaId,
      prioridade: "media",
      user_id: userId,
      ordem,
      recorrente: colunaId === "recorrentes",
    }])
    .select("id")
    .single();
  if (error) throw error;

  const { error: erroVinculo } = await supabase.from("ideias").update({ demanda_id: data.id }).eq("id", ideia.id);
  if (erroVinculo) console.warn("Demanda criada, mas não foi possível vincular à ideia:", erroVinculo);
  return data.id;
}
