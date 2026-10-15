// Gerador de UTM: UTM guardadas por cliente (tabela utms).
// O types.ts gerado ainda não conhece a tabela nova: por isso `as any` no `.from(...)`.
import { supabase } from "@/integrations/supabase/client";
import { nomeDaUtm, type ResultadoUtm } from "@/lib/utm";
import { normalizarUrl } from "@/lib/linksTexto";

export interface NovaUtm {
  cliente_id: string;
  canal: string | null;
  nome: string;
  url_base: string;
  url_final: string;
  parametros: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  origem: "gerada" | "manual";
}
export interface UtmGuardada extends NovaUtm { id: string; created_at: string }

const utms = () => supabase.from("utms" as any) as any;

/** Tabela ainda não criada no banco (migration pendente) vira uma mensagem clara. */
export function traduzErroUtm(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? "");
  if (/utms/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return "A tabela de UTMs ainda não existe no banco (migration 20261015120000_utms.sql).";
  }
  return msg || "Erro ao salvar";
}

export async function fetchUtms(): Promise<UtmGuardada[]> {
  const { data, error } = await utms().select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as UtmGuardada[];
}

/** Guarda (ou atualiza, se o mesmo cliente já tem esse link final). */
export async function guardarUtms(lista: NovaUtm[]): Promise<void> {
  if (!lista.length) return;
  const { error } = await utms().upsert(lista, { onConflict: "cliente_id,url_final" });
  if (error) throw error;
}

export async function excluirUtms(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await utms().delete().in("id", ids);
  if (error) throw error;
}

/** Resultado do gerador → linha da tabela. `null` quando falta o link de destino (nada a guardar). */
export function novaDeResultado(r: ResultadoUtm, clienteId: string, urlBase: string): NovaUtm | null {
  if (r.erros.length || !r.linkCompleto) return null;
  return {
    cliente_id: clienteId,
    canal: r.canalId,
    nome: nomeDaUtm(r.canalNome, r.campos.utm_campaign),
    url_base: normalizarUrl(urlBase) ?? urlBase,
    url_final: r.linkCompleto,
    parametros: r.parametros,
    utm_source: r.campos.utm_source,
    utm_medium: r.campos.utm_medium,
    utm_campaign: r.campos.utm_campaign,
    utm_content: r.campos.utm_content,
    utm_term: r.campos.utm_term,
    origem: "gerada",
  };
}
