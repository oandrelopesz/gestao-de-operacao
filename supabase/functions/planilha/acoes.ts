// Ações da ponte planilha ⇄ sistema (spec 2026-10-01-banco-de-leads §6). Cada ação recebe o corpo do Apps Script e
// devolve as operações que a planilha aplica.
// deno-lint-ignore-file no-explicit-any
import type { ColunaCrm, LeadCrm } from "../_shared/crmTipos.ts";
import { colunaInicial, emailValido, exigenciaDe, FAIXAS_FATURAMENTO } from "../_shared/crmColunas.ts";
import {
  CAMPOS_COMUNS,
  chaveDoPapel,
  dataIsoDoTexto,
  ehSim,
  ehValido,
  faixaDoFaturamento,
  leadCrmDoBanco,
  montarColunas,
  NAO,
  nomeDoLead,
  normalizar,
  valorDoPapel,
  type AbaBanco,
  type LeadBanco,
  type Papel,
} from "../_shared/bancoLeads.ts";
import { interpretarLinhaCrm, linhaCrm, migrarLinhaAntiga, motivosDaEtapa, type OrigemLead } from "../_shared/planilhaCrm.ts";
import { executarAgendaServidor } from "./agenda.ts";
import * as D from "./dados.ts";
import { ABA_CRM, agruparFila, opCrm, opCrmMudancas, opLead, opLixeira, type Operacao } from "./operacoes.ts";

export interface Contexto {
  sb: D.Sb;
  agora: Date;
}
export type Acao = (ctx: Contexto, corpo: any) => Promise<unknown>;

const lista = (v: unknown): any[] => (Array.isArray(v) ? v : []);

function limparDados(d: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (d && typeof d === "object") {
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      const s = String(v ?? "").trim();
      if (k.trim() && s) out[k.trim()] = s;
    }
  }
  return out;
}

async function configCrm(sb: D.Sb) {
  const colunas = await D.colunasCrm(sb);
  return { etapas: colunas.map((c) => ({ id: c.id, titulo: c.titulo, tipo: c.tipo, motivos: motivosDaEtapa(c) })) };
}

const PAPEIS_DO_CRM: Papel[] = [...CAMPOS_COMUNS, "faturamento"];

/** Chaves da aba de origem que acompanham o lead do CRM (campos em comum e faturamento). */
const chavesComuns = (aba: AbaBanco) => PAPEIS_DO_CRM.map((p) => chaveDoPapel(aba, p)).filter((k): k is string => !!k);

// ---------------------------------------------------------------------------------------------------------- abas
const abas: Acao = async (ctx, corpo) => {
  const recebidas = lista(corpo.abas).map((a) => ({
    id: String(a.id),
    nome: String(a.nome ?? "").trim(),
    ordem: Number(a.ordem) || 0,
    colunas: montarColunas(lista(a.colunas).map((c) => ({ titulo: String(c.titulo ?? ""), oculta: !!c.oculta, indice: Number(c.indice) || 0 }))),
    ativa: true,
    updated_at: ctx.agora.toISOString(),
  }));
  if (recebidas.length) {
    const { error } = await ctx.sb.from("banco_leads_abas").upsert(recebidas, { onConflict: "id" });
    if (error) throw new Error(`abas: ${error.message}`);
  }
  // Aba que sumiu da planilha sai do banco (com os leads); aba que deixou de ser de leads só fica inativa.
  const existentes = new Set(lista(corpo.existentes).map(String));
  const ativas = new Set(recebidas.map((a) => a.id));
  for (const a of await D.abas(ctx.sb)) {
    if (ativas.has(a.id)) continue;
    if (existentes.size > 0 && !existentes.has(a.id)) {
      const { error } = await ctx.sb.from("banco_leads_abas").delete().eq("id", a.id);
      if (error) throw new Error(`abas: ${error.message}`);
    } else if (a.ativa !== false) {
      const { error } = await ctx.sb.from("banco_leads_abas").update({ ativa: false }).eq("id", a.id);
      if (error) throw new Error(`abas: ${error.message}`);
    }
  }
  return { ok: true, crm: await configCrm(ctx.sb) };
};

// ------------------------------------------------------------------------------------------------- entrar e sair
async function entrarNoCrm(ctx: Contexto, lead: LeadBanco, aba: AbaBanco, colunas: ColunaCrm[]): Promise<LeadCrm> {
  const coluna = colunas.find((c) => c.id === "primeiro_contato") ?? colunaInicial(colunas);
  if (!coluna) throw new Error("O CRM não tem colunas.");
  const agora = ctx.agora.toISOString();
  const novo = await D.inserirLead(ctx.sb, {
    ...leadCrmDoBanco(lead, aba),
    coluna_id: coluna.id,
    coluna_desde: agora,
    primeiro_contato_em: agora,
  });
  await D.gravarEventos(ctx.sb, novo.id, [{ tipo: "criacao", descricao: `Entrou no CRM em ${coluna.titulo}, vindo da aba ${aba.nome}` }]);
  await D.ligarBanco(ctx.sb, lead.id, novo.id);
  return novo;
}

async function sairDoCrm(ctx: Contexto, lead: LeadCrm, colunas: ColunaCrm[], origem: OrigemLead | null): Promise<Operacao[]> {
  if (lead.evento_google_id && lead.reuniao_em && new Date(lead.reuniao_em).getTime() > ctx.agora.getTime()) {
    const p = await executarAgendaServidor(ctx.sb, lead, lead, "cancelar", ctx.agora, lead.email);
    if (p.evento_status === "erro") console.warn("Evento não cancelado:", p.evento_erro);
  }
  const ops: Operacao[] = [opLixeira(lead, colunas, origem), { tipo: "remover", aba: ABA_CRM, id: lead.id }];
  await D.excluirLeadCrm(ctx.sb, lead.id);
  return ops;
}

// ---------------------------------------------------------------------------------------------- abas de leads
const leads: Acao = async (ctx, corpo) => {
  const linhas = lista(corpo.linhas).map((l) => ({
    id: String(l.id),
    aba_id: String(l.aba_id),
    posicao: Number(l.posicao) || 0,
    dados: limparDados(l.dados),
  }));
  const ops: Operacao[] = [];
  const avisos: string[] = [];
  if (linhas.length === 0) return { ok: true, operacoes: ops, avisos };

  const abasMap = await D.mapaAbas(ctx.sb);
  const antes = new Map((await D.leadsBanco(ctx.sb, { ids: linhas.map((l) => l.id) })).map((l) => [l.id, l]));
  await D.gravarLeads(ctx.sb, linhas.filter((l) => abasMap.has(l.aba_id)).map((l) => ({ ...l, na_planilha: true })));
  // Carga inicial: só grava (os leads que já estão no CRM antigo entram pela migração)
  if (corpo.carga) return { ok: true, operacoes: ops, avisos };

  let colunas: ColunaCrm[] | null = null;
  const cols = async () => (colunas ??= await D.colunasCrm(ctx.sb));

  for (const l of linhas) {
    const aba = abasMap.get(l.aba_id);
    if (!aba) continue;
    const ant = antes.get(l.id);
    const crmId = ant?.lead_crm_id ?? null;
    const lead: LeadBanco = { ...l, lead_crm_id: crmId };
    const origem = D.origemDe(lead, aba);
    const k1 = chaveDoPapel(aba, "primeira_msg");
    const agoraSim = !!k1 && ehSim(l.dados[k1]);
    const antesSim = !!k1 && !!ant && ehSim(ant.dados[k1]);

    if (agoraSim && !crmId) {
      if (!ehValido(lead, aba)) {
        await D.definirCampoBanco(ctx.sb, l.id, k1!, NAO);
        ops.push({ tipo: "linha", aba: aba.id, id: l.id, valores: { [k1!]: NAO } });
        avisos.push(`${nomeDoLead(lead, aba)}: está como Lead válido = Não, por isso não entrou no CRM.`);
        continue;
      }
      const novo = await entrarNoCrm(ctx, lead, aba, await cols());
      ops.push(opCrm(novo, await cols(), origem, null));
    } else if (!agoraSim && antesSim && crmId) {
      const atual = await D.leadCrm(ctx.sb, crmId);
      if (atual) ops.push(...(await sairDoCrm(ctx, atual, await cols(), origem)));
    } else if (crmId && ant) {
      const kf = chaveDoPapel(aba, "faturamento");
      const fatMudou = !!kf && (ant.dados[kf] ?? "") !== (l.dados[kf] ?? "");
      if (fatMudou) {
        const faixa = faixaDoFaturamento(l.dados[kf!]);
        if (faixa) await D.atualizarLead(ctx.sb, crmId, { faturamento_faixa: faixa });
      }
      const comumMudou = CAMPOS_COMUNS.some((c) => {
        const k = chaveDoPapel(aba, c);
        return !!k && (ant.dados[k] ?? "") !== (l.dados[k] ?? "");
      });
      if (fatMudou || comumMudou) {
        const atual = await D.leadCrm(ctx.sb, crmId);
        const pend = (await D.pendencias(ctx.sb, [crmId])).get(crmId) ?? null;
        if (atual) ops.push(opCrm(atual, await cols(), origem, pend));
      }
    }
  }
  return { ok: true, operacoes: ops, avisos };
};

const excluirLeads: Acao = async (ctx, corpo) => {
  const ids = lista(corpo.ids).map(String);
  if (ids.length === 0) return { ok: true, operacoes: [], avisos: [] };
  const afetados = await D.leadsBanco(ctx.sb, { ids });
  await D.excluirLeadsBanco(ctx.sb, ids);
  const crmIds = afetados.map((l) => l.lead_crm_id).filter((x): x is string => !!x);
  const ops: Operacao[] = [];
  if (crmIds.length) {
    const colunas = await D.colunasCrm(ctx.sb);
    const pend = await D.pendencias(ctx.sb, crmIds);
    // Sem a linha de origem, "Aba de origem" passa a ser "Sistema" (linha toda reescrita)
    for (const l of await D.leadsCrm(ctx.sb, crmIds)) ops.push(opCrm(l, colunas, null, pend.get(l.id) ?? null));
  }
  return { ok: true, operacoes: ops, avisos: [] };
};

// ---------------------------------------------------------------------------------------------------- aba CRM
async function aplicarFaturamento(
  ctx: Contexto,
  banco: LeadBanco | null,
  aba: AbaBanco | null,
  texto: string,
): Promise<{ patch?: Partial<LeadCrm>; op?: Operacao; origem?: OrigemLead; erro?: string }> {
  const kf = aba ? chaveDoPapel(aba, "faturamento") : null;
  if (banco && aba && kf) {
    await D.definirCampoBanco(ctx.sb, banco.id, kf, texto);
    const faixa = faixaDoFaturamento(texto);
    return {
      patch: faixa ? { faturamento_faixa: faixa } : undefined,
      op: { tipo: "linha", aba: aba.id, id: banco.id, valores: { [kf]: texto } },
      origem: { abaNome: aba.nome, faturamentoTexto: texto || null },
    };
  }
  if (!texto) return { patch: { faturamento_faixa: null } };
  const faixa = FAIXAS_FATURAMENTO.find((f) => normalizar(f.rotulo) === normalizar(texto))?.id ?? faixaDoFaturamento(texto);
  if (faixa) return { patch: { faturamento_faixa: faixa } };
  return { erro: `Faturamento: use uma das faixas do CRM (${FAIXAS_FATURAMENTO.map((f) => f.rotulo).join("; ")}).` };
}

async function criarPelaPlanilha(ctx: Contexto, valores: Record<string, string>, colunas: ColunaCrm[], avisos: string[]): Promise<LeadCrm | null> {
  const v = (t: string) => String(valores[t] ?? "").trim();
  const nome = v("Lead");
  if (!nome) return null;
  const inicial = colunaInicial(colunas);
  if (!inicial) throw new Error("O CRM não tem colunas.");
  const destino = colunas.find((c) => normalizar(c.titulo) === normalizar(v("Etapa"))) ?? null;
  let coluna = inicial;
  if (destino && exigenciaDe(destino.tipo, { reuniao_em: null }) === "nenhuma") coluna = destino;
  else if (destino && destino.id !== inicial.id) {
    avisos.push(`${nome}: entrou em ${inicial.titulo}. Mude a Etapa para ${destino.titulo} de novo, preenchendo o que ela pede.`);
  }
  const agora = ctx.agora.toISOString();
  const email = v("E-mail");
  const novo = await D.inserirLead(ctx.sb, {
    nome,
    empresa: v("Empresa") || null,
    telefone: v("Telefone") || null,
    email: email && emailValido(email) ? email : null,
    instagram: v("Instagram") || null,
    nicho: v("Nicho") || null,
    cidade: v("Cidade") || null,
    observacoes: v("Observações") || null,
    trafego: normalizar(v("Orgânico/Pago")) === "pago" ? "pago" : "organico",
    coluna_id: coluna.id,
    coluna_desde: agora,
    primeiro_contato_em: coluna.id !== inicial.id ? agora : null,
  });
  await D.gravarEventos(ctx.sb, novo.id, [{ tipo: "criacao", descricao: `Criado na aba CRM da planilha, em ${coluna.titulo}` }]);
  return novo;
}

const crm: Acao = async (ctx, corpo) => {
  const colunas = await D.colunasCrm(ctx.sb);
  const abasMap = await D.mapaAbas(ctx.sb);
  const ops: Operacao[] = [];
  const avisos: string[] = [];
  for (const l of lista(corpo.linhas)) {
    const valores: Record<string, string> = Object.fromEntries(Object.entries(l.valores ?? {}).map(([k, x]) => [k, String(x ?? "")]));
    if (!l.id) {
      const novo = await criarPelaPlanilha(ctx, valores, colunas, avisos);
      if (novo) ops.push({ ...opCrm(novo, colunas, null, null), linha: Number(l.linha) || undefined });
      continue;
    }
    const lead = await D.leadCrm(ctx.sb, String(l.id));
    if (!lead) {
      ops.push({ tipo: "remover", aba: ABA_CRM, id: String(l.id) });
      continue;
    }
    const banco = (await D.leadsBanco(ctx.sb, { crmIds: [lead.id] }))[0] ?? null;
    const aba = banco ? abasMap.get(banco.aba_id) ?? null : null;
    let origem: OrigemLead | null = banco && aba ? D.origemDe(banco, aba) : null;
    const pend = (await D.pendencias(ctx.sb, [lead.id])).get(lead.id) ?? null;
    const antes = linhaCrm(lead, colunas, origem, pend);
    const it = interpretarLinhaCrm(lead, colunas, valores, origem, pend, ctx.agora);

    if (it.faturamento !== undefined) {
      const fx = await aplicarFaturamento(ctx, banco, aba, it.faturamento);
      if (fx.patch) Object.assign(it.patch, fx.patch);
      if (fx.origem) origem = fx.origem;
      if (fx.op) ops.push(fx.op);
      if (fx.erro) {
        it.reverter.push("Faturamento");
        it.avisos.push(fx.erro);
      }
    }
    let final: LeadCrm = { ...lead, ...it.patch };
    await D.atualizarLead(ctx.sb, lead.id, it.patch);
    await D.gravarEventos(ctx.sb, lead.id, it.eventos);
    if (it.pendencia === "apagar") await D.apagarPendencia(ctx.sb, lead.id);
    else if (it.pendencia) await D.gravarPendencia(ctx.sb, lead.id, it.pendencia);
    if (it.agenda) {
      const p = await executarAgendaServidor(ctx.sb, lead, final, it.agenda, ctx.agora, it.emailAntigo);
      if (Object.keys(p).length) {
        await D.atualizarLead(ctx.sb, lead.id, p);
        final = { ...final, ...p };
      }
      if (p.evento_status === "erro") avisos.push(`${final.nome}: o evento não foi criado na agenda (${p.evento_erro}).`);
    }
    avisos.push(...it.avisos.map((a) => `${final.nome}: ${a}`));
    const pendFinal = it.pendencia === "apagar" ? null : it.pendencia ?? (it.patch.coluna_id ? null : pend);
    ops.push(opCrmMudancas(antes, final, colunas, origem, pendFinal, it.reverter));
    // Campos em comum copiados para a aba de origem pelo gatilho do banco
    if (banco && aba) {
      const b2 = (await D.leadsBanco(ctx.sb, { ids: [banco.id] }))[0];
      if (b2) ops.push(opLead(b2, chavesComuns(aba)));
    }
  }
  return { ok: true, operacoes: ops, avisos };
};

// ------------------------------------------------------------------------------------------------------- fila
const fila: Acao = async (ctx) => {
  const { data, error } = await ctx.sb.from("planilha_fila").select("*").order("id").limit(300);
  if (error) throw new Error(`fila: ${error.message}`);
  const entradas = data ?? [];
  if (entradas.length === 0) return { operacoes: [], fila_ids: [] };
  const grupos = agruparFila(entradas);
  const leadIds = grupos.filter((g) => g.entidade === "lead" && g.op === "upsert").map((g) => g.id);
  const crmIds = grupos.filter((g) => g.entidade === "crm" && g.op === "upsert").map((g) => g.id);
  const abasMap = await D.mapaAbas(ctx.sb);
  const bancos = leadIds.length ? await D.leadsBanco(ctx.sb, { ids: leadIds }) : [];
  const bancoMap = new Map(bancos.map((b) => [b.id, b]));
  // Faturamento mudado na aba de origem também muda a coluna Faturamento da aba CRM
  const crmPorFaturamento = new Set<string>();
  for (const g of grupos) {
    const b = g.entidade === "lead" ? bancoMap.get(g.id) : undefined;
    const aba = b ? abasMap.get(b.aba_id) : undefined;
    const kf = aba ? chaveDoPapel(aba, "faturamento") : null;
    if (b?.lead_crm_id && kf && (!g.campos || g.campos.includes(kf))) crmPorFaturamento.add(b.lead_crm_id);
  }
  const todosCrm = [...new Set([...crmIds, ...crmPorFaturamento])];
  const crms = todosCrm.length ? await D.leadsCrm(ctx.sb, todosCrm) : [];
  const crmMap = new Map(crms.map((c) => [c.id, c]));
  const precisaColunas = todosCrm.length > 0 || grupos.some((g) => g.entidade === "crm");
  const colunas = precisaColunas ? await D.colunasCrm(ctx.sb) : [];
  const origensMap = await D.origens(ctx.sb, todosCrm, abasMap);
  const pend = todosCrm.length ? await D.pendencias(ctx.sb, todosCrm) : new Map();

  const ops: Operacao[] = [];
  for (const g of grupos) {
    if (g.entidade === "lead") {
      if (g.op === "delete") {
        if (g.dados?.aba_id) ops.push({ tipo: "remover", aba: String(g.dados.aba_id), id: g.id });
        continue;
      }
      const b = bancoMap.get(g.id);
      if (b) ops.push(opLead(b, g.campos));
      continue;
    }
    if (g.op === "delete") {
      const snap = (g.dados ?? {}) as LeadCrm & { _aba_origem?: string; _faturamento_origem?: string };
      const origem = snap._aba_origem ? { abaNome: String(snap._aba_origem), faturamentoTexto: snap._faturamento_origem ?? null } : null;
      ops.push(opLixeira({ ...snap, id: g.id }, colunas, origem), { tipo: "remover", aba: ABA_CRM, id: g.id });
      continue;
    }
    const c = crmMap.get(g.id);
    if (c) ops.push(opCrm(c, colunas, origensMap.get(c.id) ?? null, pend.get(c.id) ?? null, g.campos));
  }
  for (const id of crmPorFaturamento) {
    const c = crmMap.get(id);
    if (c && !crmIds.includes(id)) ops.push(opCrm(c, colunas, origensMap.get(id) ?? null, pend.get(id) ?? null, ["faturamento_faixa"]));
  }
  return { operacoes: ops, fila_ids: entradas.map((e: any) => e.id) };
};

const filaOk: Acao = async (ctx, corpo) => {
  const ids = lista(corpo.fila_ids).map(Number).filter(Number.isFinite);
  for (const lote of D.lotes(ids, 200)) {
    const { error } = await ctx.sb.from("planilha_fila").delete().in("id", lote);
    if (error) throw new Error(`fila: ${error.message}`);
  }
  const escritos = lista(corpo.escritos).map(String);
  for (const lote of D.lotes(escritos, 150)) {
    const { error } = await ctx.sb.from("banco_leads").update({ na_planilha: true }).in("id", lote);
    if (error) throw new Error(`fila: ${error.message}`);
  }
  return { ok: true };
};

// ------------------------------------------------------------------------------------------------ conferência
const conferir: Acao = async (ctx) => {
  const { data, error } = await ctx.sb.rpc("planilha_resumo");
  if (error) throw new Error(`resumo: ${error.message}`);
  return { resumo: data };
};

const conferenciaFim: Acao = async (ctx, corpo) => {
  const { error } = await ctx.sb.from("planilha_config").update({
    ultima_conferencia_em: ctx.agora.toISOString(),
    ultima_conferencia_ok: !!corpo.ok,
    ultima_conferencia_erro: corpo.ok ? null : String(corpo.erro ?? "erro desconhecido").slice(0, 500),
  }).eq("id", "principal");
  if (error) throw new Error(error.message);
  return { ok: true };
};

const abaDetalhe: Acao = async (ctx, corpo) => {
  const leads = await D.leadsBanco(ctx.sb, { abaId: String(corpo.aba_id), campos: "id, hash, posicao, na_planilha" });
  return { leads };
};

const linhas: Acao = async (ctx, corpo) => {
  const ops: Operacao[] = [];
  const pedidosLeads = lista(corpo.leads).map(String);
  if (pedidosLeads.length) for (const b of await D.leadsBanco(ctx.sb, { ids: pedidosLeads })) ops.push(opLead(b, null));
  let ids: string[] | undefined;
  let fp: string | null = null;
  const pedidosCrm = lista(corpo.crm).map(String);
  if (corpo.crm_todos || pedidosCrm.length) {
    // A impressão digital vem antes da leitura: mudança no meio do caminho aparece na próxima conferência
    if (corpo.crm_todos) fp = (await ctx.sb.rpc("planilha_resumo")).data?.crm ?? null;
    const leadsCrm = await D.leadsCrm(ctx.sb, corpo.crm_todos ? undefined : pedidosCrm);
    const colunas = await D.colunasCrm(ctx.sb);
    const origensMap = await D.origens(ctx.sb, leadsCrm.map((l) => l.id), await D.mapaAbas(ctx.sb));
    const pend = await D.pendencias(ctx.sb, corpo.crm_todos ? undefined : pedidosCrm);
    for (const l of leadsCrm) ops.push(opCrm(l, colunas, origensMap.get(l.id) ?? null, pend.get(l.id) ?? null));
    ids = leadsCrm.map((l) => l.id);
  }
  return { operacoes: ops, ids, fp };
};

// ------------------------------------------------------------------------------------------- migração única
const importarCrmAntigo: Acao = async (ctx, corpo) => {
  const recebidas: Record<string, string>[] = lista(corpo.linhas);
  const colunas = await D.colunasCrm(ctx.sb);
  const abasMap = await D.mapaAbas(ctx.sb);
  const chave = (tel: string | null | undefined, nome: string | null | undefined, empresa: string | null | undefined) =>
    String(tel ?? "").trim() ? `t:${String(tel).trim()}` : `n:${normalizar(nome)}|${normalizar(empresa)}`;
  const jaNoCrm = new Set((await D.leadsCrm(ctx.sb)).map((l) => chave(l.telefone, l.nome, l.empresa)));
  const porChave = new Map<string, LeadBanco>();
  for (const b of await D.leadsBanco(ctx.sb)) {
    const aba = abasMap.get(b.aba_id);
    if (!aba) continue;
    const k = chave(valorDoPapel(b, aba, "telefone"), valorDoPapel(b, aba, "nome"), valorDoPapel(b, aba, "empresa"));
    const atual = porChave.get(k);
    const marcado = ehSim(valorDoPapel(b, aba, "primeira_msg"));
    if (!atual || (marcado && !ehSim(valorDoPapel(atual, abasMap.get(atual.aba_id), "primeira_msg")))) porChave.set(k, b);
  }
  let criados = 0;
  let ligados = 0;
  let pulados = 0;
  const avisos: string[] = [];
  for (const l of recebidas) {
    const m = migrarLinhaAntiga(l, colunas, ctx.agora);
    if (!m) {
      pulados++;
      continue;
    }
    const k = chave(m.campos.telefone, m.campos.nome, m.campos.empresa);
    if (jaNoCrm.has(k)) {
      pulados++;
      continue;
    }
    const banco = porChave.get(k) ?? null;
    const aba = banco ? abasMap.get(banco.aba_id) ?? null : null;
    const daOrigem: Partial<LeadCrm> = {};
    if (banco && aba) {
      const data = dataIsoDoTexto(valorDoPapel(banco, aba, "data_chegada"));
      if (data) daOrigem.data_lead = data;
      for (const c of ["cidade", "site"] as const) {
        const v = valorDoPapel(banco, aba, c);
        if (v) daOrigem[c] = v;
      }
    }
    const novo = await D.inserirLead(ctx.sb, { ...m.campos, ...daOrigem });
    await D.gravarEventos(ctx.sb, novo.id, m.eventos, "");
    criados++;
    jaNoCrm.add(k);
    if (banco && !banco.lead_crm_id) {
      await D.ligarBanco(ctx.sb, banco.id, novo.id);
      ligados++;
    } else avisos.push(`${m.campos.nome}: não achei a linha de origem (fica como "Sistema").`);
  }
  return { ok: true, criados, ligados, pulados, avisos };
};

export const ACOES: Record<string, Acao> = {
  abas,
  leads,
  excluir_leads: excluirLeads,
  crm,
  fila,
  fila_ok: filaOk,
  conferir,
  conferencia_fim: conferenciaFim,
  aba_detalhe: abaDetalhe,
  linhas,
  importar_crm_antigo: importarCrmAntigo,
};

export { configCrm };
