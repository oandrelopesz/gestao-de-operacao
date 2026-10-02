// Leitura e gravação no banco para a função `planilha`. O cliente usa a service role e o cabeçalho
// x-origem: planilha (os gatilhos não devolvem à planilha o que veio dela).
// deno-lint-ignore-file no-explicit-any
import type { ColunaCrm, LeadCrm, NovoEvento } from "../_shared/crmTipos.ts";
import { ordenarColunas } from "../_shared/crmColunas.ts";
import { valorDoPapel, type AbaBanco, type LeadBanco } from "../_shared/bancoLeads.ts";
import type { OrigemLead, PendenciaCrm } from "../_shared/planilhaCrm.ts";

export type Sb = any;
/** Usuário padrão do app (o sistema roda sem login): `user_id` obrigatório de `prospeccao`. */
export const USUARIO_PADRAO = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";
const PAGINA = 1000;
const LOTE_IDS = 150;
const CAMPOS_BANCO = "id, aba_id, posicao, dados, lead_crm_id, hash, na_planilha";

function erro(onde: string, e: any): never {
  throw new Error(`${onde}: ${e?.message ?? e}`);
}

export function lotes<T>(itens: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += n) out.push(itens.slice(i, i + n));
  return out;
}

/** Todas as linhas de uma consulta, de 1000 em 1000 (limite do PostgREST). */
async function tudo(onde: string, consulta: (de: number, ate: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) erro(onde, error);
    out.push(...(data ?? []));
    if (!data || data.length < PAGINA) return out;
  }
}

export async function config(sb: Sb): Promise<any | null> {
  const { data, error } = await sb.from("planilha_config").select("*").eq("id", "principal").maybeSingle();
  if (error) erro("configuração", error);
  return data ?? null;
}

export async function colunasCrm(sb: Sb): Promise<ColunaCrm[]> {
  const { data, error } = await sb.from("crm_colunas").select("*").order("ordem");
  if (error) erro("colunas do CRM", error);
  return ordenarColunas((data ?? []).map((c: any) => ({ ...c, config: c.config ?? {} })));
}

export async function abas(sb: Sb): Promise<AbaBanco[]> {
  const { data, error } = await sb.from("banco_leads_abas").select("*").order("ordem");
  if (error) erro("abas", error);
  return data ?? [];
}

export async function mapaAbas(sb: Sb): Promise<Map<string, AbaBanco>> {
  return new Map((await abas(sb)).map((a) => [a.id, a]));
}

export async function leadsBanco(
  sb: Sb,
  f: { ids?: string[]; crmIds?: string[]; abaId?: string; campos?: string } = {},
): Promise<LeadBanco[]> {
  const campos = f.campos ?? CAMPOS_BANCO;
  if (f.ids || f.crmIds) {
    const coluna = f.ids ? "id" : "lead_crm_id";
    const out: LeadBanco[] = [];
    for (const lote of lotes((f.ids ?? f.crmIds)!, LOTE_IDS)) {
      out.push(...(await tudo("leads", (de, ate) => sb.from("banco_leads").select(campos).in(coluna, lote).order("id").range(de, ate))));
    }
    return out;
  }
  return tudo("leads", (de, ate) => {
    let q = sb.from("banco_leads").select(campos).order("id");
    if (f.abaId) q = q.eq("aba_id", f.abaId);
    return q.range(de, ate);
  });
}

export async function gravarLeads(
  sb: Sb,
  linhas: { id: string; aba_id: string; posicao: number; dados: Record<string, string>; na_planilha: boolean }[],
): Promise<void> {
  for (const lote of lotes(linhas, 300)) {
    const { error } = await sb.from("banco_leads").upsert(lote, { onConflict: "id" });
    if (error) erro("gravar leads", error);
  }
}

export async function excluirLeadsBanco(sb: Sb, ids: string[]): Promise<void> {
  for (const lote of lotes(ids, LOTE_IDS)) {
    const { error } = await sb.from("banco_leads").delete().in("id", lote);
    if (error) erro("excluir leads", error);
  }
}

export async function definirCampoBanco(sb: Sb, id: string, chave: string, valor: string): Promise<void> {
  const { error } = await sb.rpc("banco_leads_definir", { p_id: id, p_chave: chave, p_valor: valor });
  if (error) erro("gravar campo", error);
}

export async function ligarBanco(sb: Sb, id: string, crmId: string | null): Promise<void> {
  const { error } = await sb.from("banco_leads").update({ lead_crm_id: crmId }).eq("id", id);
  if (error) erro("ligar lead", error);
}

export async function leadsCrm(sb: Sb, ids?: string[]): Promise<LeadCrm[]> {
  if (!ids) return tudo("leads do CRM", (de, ate) => sb.from("prospeccao").select("*").order("created_at").order("id").range(de, ate));
  const out: LeadCrm[] = [];
  for (const lote of lotes(ids, LOTE_IDS)) {
    out.push(...(await tudo("leads do CRM", (de, ate) => sb.from("prospeccao").select("*").in("id", lote).order("id").range(de, ate))));
  }
  return out;
}

export async function leadCrm(sb: Sb, id: string): Promise<LeadCrm | null> {
  const { data, error } = await sb.from("prospeccao").select("*").eq("id", id).maybeSingle();
  if (error) erro("lead do CRM", error);
  return data ?? null;
}

export async function inserirLead(sb: Sb, campos: Partial<LeadCrm>): Promise<LeadCrm> {
  const linha = Object.fromEntries(Object.entries({ user_id: USUARIO_PADRAO, ordem: 0, ...campos }).filter(([, v]) => v !== undefined));
  const { data, error } = await sb.from("prospeccao").insert(linha).select("*").single();
  if (error) erro("criar lead no CRM", error);
  return data;
}

export async function atualizarLead(sb: Sb, id: string, patch: Partial<LeadCrm>): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const { error } = await sb.from("prospeccao").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) erro("atualizar lead", error);
}

export async function excluirLeadCrm(sb: Sb, id: string): Promise<void> {
  const { error } = await sb.from("prospeccao").delete().eq("id", id);
  if (error) erro("tirar do CRM", error);
}

/** Histórico do lead. `em` vira a data do evento (migração); o sufixo marca o que veio da planilha. */
export async function gravarEventos(
  sb: Sb,
  leadId: string,
  eventos: (NovoEvento & { em?: string })[],
  sufixo = " (pela planilha)",
): Promise<void> {
  if (eventos.length === 0) return;
  const linhas = eventos.map((e) => ({
    lead_id: leadId,
    tipo: e.tipo,
    descricao: `${e.descricao}${sufixo}`,
    dados: e.dados ?? {},
    ...(e.em ? { created_at: e.em } : {}),
  }));
  const { error } = await sb.from("crm_eventos").insert(linhas);
  if (error) erro("histórico", error);
}

export async function pendencias(sb: Sb, ids?: string[]): Promise<Map<string, PendenciaCrm>> {
  const linhas: any[] = [];
  if (!ids) linhas.push(...(await tudo("pendências", (de, ate) => sb.from("planilha_pendencias").select("*").order("lead_id").range(de, ate))));
  else {
    for (const lote of lotes(ids, LOTE_IDS)) {
      linhas.push(...(await tudo("pendências", (de, ate) => sb.from("planilha_pendencias").select("*").in("lead_id", lote).order("lead_id").range(de, ate))));
    }
  }
  return new Map(linhas.map((p) => [p.lead_id, { etapa_id: p.etapa_desejada, falta: p.falta }]));
}

export async function gravarPendencia(sb: Sb, leadId: string, p: PendenciaCrm): Promise<void> {
  const { error } = await sb.from("planilha_pendencias")
    .upsert({ lead_id: leadId, etapa_desejada: p.etapa_id, falta: p.falta, criado_em: new Date().toISOString() });
  if (error) erro("pendência", error);
}

export async function apagarPendencia(sb: Sb, leadId: string): Promise<void> {
  const { error } = await sb.from("planilha_pendencias").delete().eq("lead_id", leadId);
  if (error) erro("pendência", error);
}

export function origemDe(lead: Pick<LeadBanco, "dados">, aba: AbaBanco): OrigemLead {
  return { abaNome: aba.nome, faturamentoTexto: valorDoPapel(lead, aba, "faturamento") || null };
}

/** Aba de origem (e texto de faturamento) de cada lead do CRM ligado a uma linha da planilha. */
export async function origens(sb: Sb, crmIds: string[], abas: Map<string, AbaBanco>): Promise<Map<string, OrigemLead>> {
  const out = new Map<string, OrigemLead>();
  if (crmIds.length === 0) return out;
  for (const b of await leadsBanco(sb, { crmIds })) {
    const aba = abas.get(b.aba_id);
    if (aba && b.lead_crm_id && !out.has(b.lead_crm_id)) out.set(b.lead_crm_id, origemDe(b, aba));
  }
  return out;
}
