import { supabase } from "@/integrations/supabase/client";
import { ordenarPassos, posicaoParaNovoPasso, progresso, renumerar, type PassoLogico, type TipoProcesso } from "@/lib/processos";

// As tabelas novas (processos, processo_passos, processo_templates, processo_template_passos) têm FK
// reais no banco, mas o types.ts gerado não registra os Relationships delas — o embed via select
// ("passos:processo_passos(*)") deixa o TS confuso. Por isso `as any` nos `.from(...)` dessas tabelas.

export interface TemplatePasso { titulo: string; observacoes: string | null }
export interface Template { id: string; tipo: TipoProcesso; nome: string; passos: (TemplatePasso & { id: string; ordem: number })[]; created_at: string }
export interface Passo { id: string; processo_id: string; titulo: string; observacoes: string | null; data: string | null; ordem: number; concluido_em: string | null }
export interface ClienteResumo { id: string; nome: string; agencia: string | null; em_onboarding: boolean | null; trafego_ativo: boolean | null; onboarding_desde: string | null }
export interface RoadmapLigado { id: string; nome: string; status: string; passo_onboarding_id: string; progresso: number }
export interface Processo {
  id: string; tipo: TipoProcesso; cliente_id: string; nome: string; template_id: string | null;
  status: "ativo" | "concluido" | "encerrado"; iniciado_em: string; concluido_em: string | null;
  prazo_final: string | null; passo_onboarding_id: string | null;
  passos: Passo[]; // já ordenados (ordenarPassos)
  cliente: ClienteResumo;
}

const TEMPLATE_SELECT = "id, tipo, nome, created_at, passos:processo_template_passos(id, titulo, observacoes, ordem)";

async function fetchTemplateComPassos(id: string): Promise<Template> {
  const { data, error } = await (supabase.from("processo_templates") as any)
    .select(TEMPLATE_SELECT)
    .eq("id", id)
    .order("ordem", { foreignTable: "processo_template_passos", ascending: true })
    .single();
  if (error) throw error;
  return { ...data, tipo: data.tipo as TipoProcesso, passos: (data.passos || []) as Template["passos"] };
}

// ---------------------------------------------------------------- Templates

export async function fetchTemplates(tipo: TipoProcesso): Promise<Template[]> {
  const { data, error } = await (supabase.from("processo_templates") as any)
    .select(TEMPLATE_SELECT)
    .eq("tipo", tipo)
    .order("nome", { ascending: true })
    .order("ordem", { foreignTable: "processo_template_passos", ascending: true });
  if (error) throw error;
  return ((data || []) as any[]).map((t) => ({ ...t, tipo: t.tipo as TipoProcesso, passos: (t.passos || []) as Template["passos"] }));
}

export async function salvarTemplate(t: { id?: string; tipo: TipoProcesso; nome: string; passos: TemplatePasso[] }): Promise<string> {
  let templateId: string;
  if (t.id) {
    const { error } = await (supabase.from("processo_templates") as any).update({ tipo: t.tipo, nome: t.nome }).eq("id", t.id);
    if (error) throw error;
    templateId = t.id;
    const { error: erroDelete } = await (supabase.from("processo_template_passos") as any).delete().eq("template_id", templateId);
    if (erroDelete) throw erroDelete;
  } else {
    const { data, error } = await (supabase.from("processo_templates") as any)
      .insert([{ tipo: t.tipo, nome: t.nome }])
      .select("id")
      .single();
    if (error) throw error;
    templateId = data.id;
  }
  if (t.passos.length) {
    const { error: erroPassos } = await (supabase.from("processo_template_passos") as any).insert(
      t.passos.map((p, idx) => ({ template_id: templateId, titulo: p.titulo, observacoes: p.observacoes, ordem: idx })),
    );
    if (erroPassos) throw erroPassos;
  }
  return templateId;
}

export async function renomearTemplate(id: string, nome: string): Promise<void> {
  const { error } = await (supabase.from("processo_templates") as any).update({ nome }).eq("id", id);
  if (error) throw error;
}

export async function duplicarTemplate(id: string): Promise<string> {
  const original = await fetchTemplateComPassos(id);
  const { data, error } = await (supabase.from("processo_templates") as any)
    .insert([{ tipo: original.tipo, nome: `${original.nome} (cópia)` }])
    .select("id")
    .single();
  if (error) throw error;
  const novoId = data.id as string;
  if (original.passos.length) {
    const { error: erroPassos } = await (supabase.from("processo_template_passos") as any).insert(
      original.passos.map((p) => ({ template_id: novoId, titulo: p.titulo, observacoes: p.observacoes, ordem: p.ordem })),
    );
    if (erroPassos) throw erroPassos;
  }
  return novoId;
}

export async function excluirTemplate(id: string): Promise<void> {
  const { error: erroPassos } = await (supabase.from("processo_template_passos") as any).delete().eq("template_id", id);
  if (erroPassos) throw erroPassos;
  const { error } = await (supabase.from("processo_templates") as any).delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- Processos

const PROCESSO_SELECT = "*, passos:processo_passos(*), cliente:clientes(id, nome, agencia, em_onboarding, trafego_ativo, onboarding_desde)";

export async function fetchProcessos(tipo: TipoProcesso, situacao: "ativos" | "historico"): Promise<Processo[]> {
  let query = (supabase.from("processos") as any).select(PROCESSO_SELECT).eq("tipo", tipo);
  query = situacao === "ativos"
    ? query.eq("status", "ativo")
    : query.in("status", ["concluido", "encerrado"]).order("concluido_em", { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return ((data || []) as any[]).map((p) => ({
    ...p,
    tipo: p.tipo as TipoProcesso,
    status: p.status as Processo["status"],
    passos: ordenarPassos((p.passos || []) as Passo[]),
    cliente: p.cliente as ClienteResumo,
  })) as Processo[];
}

export async function fetchRoadmapsLigados(passoIds: string[]): Promise<RoadmapLigado[]> {
  if (!passoIds.length) return [];
  const { data, error } = await (supabase.from("processos") as any)
    .select("id, nome, status, passo_onboarding_id, passos:processo_passos(id, data, ordem, concluido_em)")
    .eq("tipo", "roadmap")
    .in("passo_onboarding_id", passoIds);
  if (error) throw error;
  return ((data || []) as any[]).map((p) => ({
    id: p.id,
    nome: p.nome,
    status: p.status as string,
    passo_onboarding_id: p.passo_onboarding_id as string,
    progresso: progresso((p.passos || []) as PassoLogico[]),
  }));
}

export async function fetchClientesEmOnboarding(): Promise<ClienteResumo[]> {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome, agencia, em_onboarding, trafego_ativo, onboarding_desde")
    .eq("em_onboarding", true)
    .eq("arquivado", false)
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data || []) as ClienteResumo[];
}

export async function fetchClientesAtivos(): Promise<ClienteResumo[]> {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome, agencia, em_onboarding, trafego_ativo, onboarding_desde")
    .eq("arquivado", false)
    .eq("status_operacional", "ativo")
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data || []) as ClienteResumo[];
}

export async function criarProcesso(i: {
  tipo: TipoProcesso; cliente_id: string; nome: string; template_id?: string | null;
  prazo_final?: string | null; passo_onboarding_id?: string | null; iniciado_em?: string | null;
}): Promise<string> {
  const { data, error } = await (supabase.from("processos") as any)
    .insert([{
      tipo: i.tipo,
      cliente_id: i.cliente_id,
      nome: i.nome,
      template_id: i.template_id ?? null,
      prazo_final: i.prazo_final ?? null,
      passo_onboarding_id: i.passo_onboarding_id ?? null,
      iniciado_em: i.iniciado_em ?? new Date().toISOString(),
    }])
    .select("id")
    .single();
  if (error) throw error;
  const processoId = data.id as string;

  if (i.template_id) {
    const template = await fetchTemplateComPassos(i.template_id);
    if (template.passos.length) {
      const { error: erroPassos } = await (supabase.from("processo_passos") as any).insert(
        template.passos.map((p) => ({ processo_id: processoId, titulo: p.titulo, observacoes: p.observacoes, data: null, ordem: p.ordem })),
      );
      if (erroPassos) throw erroPassos;
    }
  }
  return processoId;
}

export async function aplicarTemplate(processoId: string, templateId: string, modo: "substituir" | "acrescentar"): Promise<void> {
  const template = await fetchTemplateComPassos(templateId);

  if (modo === "substituir") {
    const { error: erroDelete } = await (supabase.from("processo_passos") as any).delete().eq("processo_id", processoId);
    if (erroDelete) throw erroDelete;
    if (template.passos.length) {
      const { error } = await (supabase.from("processo_passos") as any).insert(
        template.passos.map((p, idx) => ({ processo_id: processoId, titulo: p.titulo, observacoes: p.observacoes, data: null, ordem: idx })),
      );
      if (error) throw error;
    }
  } else {
    const { data: existentes, error: erroExistentes } = await (supabase.from("processo_passos") as any)
      .select("id, ordem")
      .eq("processo_id", processoId);
    if (erroExistentes) throw erroExistentes;
    // Base = maior ordem persistida + 1 (não a contagem: excluirPasso pode deixar buracos)
    const base = Math.max(-1, ...((existentes || []) as { ordem: number }[]).map((p) => p.ordem)) + 1;
    if (template.passos.length) {
      const { error } = await (supabase.from("processo_passos") as any).insert(
        template.passos.map((p, idx) => ({ processo_id: processoId, titulo: p.titulo, observacoes: p.observacoes, data: null, ordem: base + idx })),
      );
      if (error) throw error;
    }
  }

  const { error: erroUpdate } = await (supabase.from("processos") as any)
    .update({ template_id: templateId, nome: template.nome })
    .eq("id", processoId);
  if (erroUpdate) throw erroUpdate;
}

export async function salvarComoTemplate(processo: Processo, nome: string): Promise<string> {
  const ordenados = renumerar(ordenarPassos(processo.passos));
  const { data, error } = await (supabase.from("processo_templates") as any)
    .insert([{ tipo: processo.tipo, nome }])
    .select("id")
    .single();
  if (error) throw error;
  const templateId = data.id as string;
  if (ordenados.length) {
    const { error: erroPassos } = await (supabase.from("processo_template_passos") as any).insert(
      ordenados.map((p) => ({ template_id: templateId, titulo: p.titulo, observacoes: p.observacoes, ordem: p.ordem })),
    );
    if (erroPassos) throw erroPassos;
  }
  await atualizarProcesso(processo.id, { template_id: templateId, nome });
  return templateId;
}

export async function atualizarProcesso(
  id: string,
  patch: { nome?: string; prazo_final?: string | null; passo_onboarding_id?: string | null; template_id?: string | null },
): Promise<void> {
  const { error } = await (supabase.from("processos") as any).update(patch).eq("id", id);
  if (error) throw error;
}

export async function encerrarProcesso(id: string): Promise<void> {
  const { error } = await (supabase.from("processos") as any)
    .update({ status: "encerrado", concluido_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ------------------------------------------------------------------ Passos

export async function adicionarPasso(processo: Processo, i: { titulo: string; data?: string | null; observacoes?: string | null }): Promise<void> {
  const ordenados = renumerar(ordenarPassos(processo.passos));
  const pos = posicaoParaNovoPasso(ordenados, i.data ?? null);
  const afetados = ordenados.slice(pos).map((p, idx) => ({ id: p.id, ordem: pos + idx + 1, data: p.data }));
  if (afetados.length) await salvarOrdem(afetados);

  const { error } = await (supabase.from("processo_passos") as any).insert([{
    processo_id: processo.id,
    titulo: i.titulo,
    observacoes: i.observacoes ?? null,
    data: i.data ?? null,
    ordem: pos,
  }]);
  if (error) throw error;
}

export async function atualizarPasso(id: string, patch: { titulo?: string; observacoes?: string | null; data?: string | null }): Promise<void> {
  const { error } = await (supabase.from("processo_passos") as any).update(patch).eq("id", id);
  if (error) throw error;
}

export async function alternarConclusaoPasso(id: string, concluir: boolean): Promise<void> {
  const { error } = await (supabase.from("processo_passos") as any)
    .update({ concluido_em: concluir ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function excluirPasso(id: string): Promise<void> {
  const { data: passo, error: erroPasso } = await (supabase.from("processo_passos") as any)
    .select("processo_id")
    .eq("id", id)
    .single();
  if (erroPasso) throw erroPasso;

  const { error } = await (supabase.from("processo_passos") as any).delete().eq("id", id);
  if (error) throw error;

  // Sem isso, exclusões acumulam buracos no `ordem` (aplicarTemplate/adicionarPasso dependem dele)
  const { data: restantes, error: erroRestantes } = await (supabase.from("processo_passos") as any)
    .select("id, data, ordem, concluido_em")
    .eq("processo_id", passo.processo_id);
  if (erroRestantes) throw erroRestantes;
  const renumerados = renumerar(ordenarPassos((restantes || []) as PassoLogico[]));
  if (renumerados.length) await salvarOrdem(renumerados);
}

export async function salvarOrdem(passos: { id: string; ordem: number; data?: string | null }[]): Promise<void> {
  const results = await Promise.all(passos.map((p) => {
    const patch: Record<string, unknown> = { ordem: p.ordem };
    if (p.data !== undefined) patch.data = p.data;
    return (supabase.from("processo_passos") as any).update(patch).eq("id", p.id);
  }));
  const falha = results.find((r) => r.error);
  if (falha?.error) throw falha.error;
}

export async function concluirOnboarding(processo: Processo, ativarTrafego: boolean): Promise<void> {
  const { error: erroProcesso } = await (supabase.from("processos") as any)
    .update({ status: "concluido", concluido_em: new Date().toISOString() })
    .eq("id", processo.id);
  if (erroProcesso) throw erroProcesso;

  const patchCliente: Record<string, unknown> = { em_onboarding: false };
  if (ativarTrafego) patchCliente.trafego_ativo = true;
  const { error: erroCliente } = await supabase.from("clientes").update(patchCliente as any).eq("id", processo.cliente_id);
  if (erroCliente) throw erroCliente;
}

// ------------------------------------------------------------------- Verba

export interface VerbaPrincipal { operacaoId: string | null; moeda: string; plataforma: string | null; valor: number; plataformasConfiguradas: string[] }

interface PlataformaVerbaConfig { verba: number; metodo_pagamento?: string }

function parsePlataformasConfigVerba(raw: unknown): Record<string, PlataformaVerbaConfig> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, PlataformaVerbaConfig> = {};
  Object.entries(raw as Record<string, any>).forEach(([nome, cfg]) => {
    if (!cfg || typeof cfg !== "object") return;
    out[nome] = { verba: Number(cfg.verba || 0), metodo_pagamento: cfg.metodo_pagamento };
  });
  return out;
}

async function fetchOperacaoPrincipal(clienteId: string): Promise<{ id: string; moeda: string; plataformas_config: Record<string, PlataformaVerbaConfig> } | null> {
  const { data, error } = await supabase
    .from("operacoes")
    .select("id, moeda, plataformas_config")
    .eq("cliente_id", clienteId)
    .eq("ativa", true)
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, moeda: data.moeda || "BRL", plataformas_config: parsePlataformasConfigVerba(data.plataformas_config) };
}

export async function fetchVerbaPrincipal(clienteId: string): Promise<VerbaPrincipal> {
  const operacao = await fetchOperacaoPrincipal(clienteId);
  if (!operacao) return { operacaoId: null, moeda: "BRL", plataforma: null, valor: 0, plataformasConfiguradas: [] };
  const plataformasConfiguradas = Object.keys(operacao.plataformas_config);
  const plataforma = plataformasConfiguradas[0] ?? null;
  const valor = plataforma ? (operacao.plataformas_config[plataforma]?.verba ?? 0) : 0;
  return { operacaoId: operacao.id, moeda: operacao.moeda, plataforma, valor, plataformasConfiguradas };
}

export async function salvarVerbaPrincipal(clienteId: string, plataforma: string, valor: number): Promise<void> {
  const operacao = await fetchOperacaoPrincipal(clienteId);
  if (!operacao) {
    const { error } = await supabase.from("operacoes").insert([{
      cliente_id: clienteId,
      nome: "Principal",
      moeda: "BRL",
      tipo_verba: "mensal",
      ordem: 0,
      ativa: true,
      plataformas_config: { [plataforma]: { verba: valor, metodo_pagamento: "pix" } },
      verba_ads: valor,
    } as any]);
    if (error) throw error;
    return;
  }

  const config = { ...operacao.plataformas_config };
  config[plataforma] = { verba: valor, metodo_pagamento: config[plataforma]?.metodo_pagamento ?? "pix" };
  const verbaAds = Object.values(config).reduce((acc, c) => acc + (c.verba || 0), 0);
  const { error } = await supabase
    .from("operacoes")
    .update({ plataformas_config: config as any, tipo_verba: "mensal", verba_ads: verbaAds })
    .eq("id", operacao.id);
  if (error) throw error;
}
