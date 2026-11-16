// Calculadora de taxas: templates guardados (tabela taxas_templates).
// O types.ts gerado ainda não conhece a tabela nova: por isso `as any` no `.from(...)`.
import { supabase } from "@/integrations/supabase/client";
import type { Metodo } from "@/lib/taxas";

export interface TaxaTemplate { id: string; nome: string; taxa: number; metodo: Metodo }

const tabela = () => supabase.from("taxas_templates" as any) as any;

/** Tabela ainda não criada no banco (migration pendente) vira uma mensagem clara. */
export function traduzErroTaxa(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? "");
  if (/taxas_templates/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return "A tabela de templates ainda não existe no banco (migration 20261116120000_taxas_templates.sql).";
  }
  return msg || "Erro ao salvar";
}

export async function fetchTaxas(): Promise<TaxaTemplate[]> {
  const { data, error } = await tabela().select("id, nome, taxa, metodo").order("nome");
  if (error) throw error;
  return ((data || []) as TaxaTemplate[]).map((t) => ({ ...t, taxa: Number(t.taxa) }));
}

/** Cria o template, ou atualiza o que já tem esse nome (sem diferenciar maiúscula de minúscula). */
export async function salvarTaxa(novo: Omit<TaxaTemplate, "id">, existentes: TaxaTemplate[]): Promise<"criado" | "atualizado"> {
  const nome = novo.nome.trim();
  const igual = existentes.find((t) => t.nome.toLowerCase() === nome.toLowerCase());
  const { error } = await tabela().upsert({ nome: igual?.nome ?? nome, taxa: novo.taxa, metodo: novo.metodo }, { onConflict: "nome" });
  if (error) throw error;
  return igual ? "atualizado" : "criado";
}

export async function excluirTaxa(id: string): Promise<void> {
  const { error } = await tabela().delete().eq("id", id);
  if (error) throw error;
}
