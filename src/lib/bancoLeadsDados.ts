// Banco de leads no front: leitura e gravação no banco. A planilha recebe cada mudança pelo Apps Script
// (gatilhos do banco → fila → Web App). Spec docs/superpowers/specs/2026-10-01-banco-de-leads-design.md §8.2.
import { supabase } from "@/integrations/supabase/client";
import type { AbaBanco, LeadBanco } from "@/lib/bancoLeads";

// Tabelas novas ainda não estão em types.ts
const db = supabase as any;
const PAGINA = 1000;
const CAMPOS = "id, aba_id, posicao, dados, lead_crm_id, updated_at";

export interface StatusPlanilha {
  planilha_id: string | null;
  ultima_conferencia_em: string | null;
  ok: boolean | null;
  erro: string | null;
  conectada: boolean;
}

export async function carregarAbasBanco(): Promise<AbaBanco[]> {
  const { data, error } = await db.from("banco_leads_abas").select("*").eq("ativa", true).order("ordem");
  if (error) throw error;
  return (data ?? []) as AbaBanco[];
}

/** Todos os leads (de 1000 em 1000, limite do PostgREST). */
export async function carregarLeadsBanco(): Promise<LeadBanco[]> {
  const out: LeadBanco[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await db.from("banco_leads").select(CAMPOS).order("aba_id").order("posicao").order("id").range(de, de + PAGINA - 1);
    if (error) throw error;
    out.push(...((data ?? []) as LeadBanco[]));
    if (!data || data.length < PAGINA) return out;
  }
}

export async function statusPlanilha(): Promise<StatusPlanilha | null> {
  const { data, error } = await db.rpc("planilha_status");
  if (error) throw error;
  return (data ?? null) as StatusPlanilha | null;
}

/** Um campo por vez (sem sobrescrever o resto da linha); vazio apaga o campo. */
export async function definirCampoBanco(id: string, chave: string, valor: string): Promise<void> {
  const { error } = await db.rpc("banco_leads_definir", { p_id: id, p_chave: chave, p_valor: valor });
  if (error) throw error;
}

/** Liga a linha ao lead do CRM e grava "Primeira mensagem enviada" na mesma gravação. */
export async function ligarAoCrm(id: string, crmId: string | null, chave: string | null, valor: string): Promise<void> {
  const { error } = await db.rpc("banco_leads_ligar", { p_id: id, p_crm: crmId, p_chave: chave, p_valor: valor });
  if (error) throw error;
}

export async function criarLeadBanco(abaId: string, dados: Record<string, string>, posicao: number): Promise<LeadBanco> {
  const { data, error } = await db.from("banco_leads").insert({ aba_id: abaId, posicao, dados, na_planilha: false }).select(CAMPOS).single();
  if (error) throw error;
  return data as LeadBanco;
}

export async function excluirLeadsBanco(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 150) {
    const { error } = await db.from("banco_leads").delete().in("id", ids.slice(i, i + 150));
    if (error) throw error;
  }
}
