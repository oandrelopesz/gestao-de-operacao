// O que sai na exportação do CRM: todos os campos de cada lead (mesma lista no CSV, no XLSX e nas fichas do PDF),
// o histórico e o resumo por coluna. Sem dependências (roda no `node --test`).
import type { ColunaCrm, EventoCrm, LeadCrm, TipoEvento } from "./crmTipos.ts";
import {
  colunaInicial, FAIXAS_FATURAMENTO, FAIXAS_INVESTIMENTO, MOTIVOS_REMARCACAO, ordenarColunas, rotuloFaixa, rotuloTipo,
} from "./crmColunas.ts";
import { calcularPontos, periodoDaCall, resumoPontos, ROTULO_PERIODO } from "./crmPontos.ts";
import { urgenciaDoLead } from "./crmUrgencia.ts";
import { formatarTelefone, linkWhatsapp } from "./crmWhatsapp.ts";
import { DIA_MS, HORA_MS, partesSP } from "./crmFormato.ts";
import { textoDoValor, type ColunaPlanilha, type Planilha, type Valor } from "./planilha.ts";

export type EscopoExport =
  | { tipo: "todos" }
  | { tipo: "filtrados" }
  | { tipo: "coluna"; colunaId: string }
  | { tipo: "selecionados"; ids: string[] };

export interface ContextoLead {
  lead: LeadCrm;
  coluna: ColunaCrm | null;
  posicao: number;
  totalColunas: number;
  colunas: ColunaCrm[];
  /** Eventos do lead, do mais antigo para o mais recente */
  eventos: EventoCrm[];
  agora: Date;
  agencias: Map<string, string>;
}

export interface CampoExport extends ColunaPlanilha {
  secao: string;
  valor: (c: ContextoLead) => Valor;
}

export const ROTULO_EVENTO: Record<TipoEvento, string> = {
  criacao: "Cadastro",
  mudanca_coluna: "Mudança de coluna",
  tentativa: "Tentativa",
  ponto_contato: "Ponto de contato",
  reuniao: "Reunião",
  remarcacao: "Remarcação",
  reuniao_resultado: "Resultado da reunião",
  agenda: "Agenda",
  nota: "Nota",
  edicao: "Edição",
  ganho: "Ganho",
  perda: "Perda",
  desqualificacao: "Desqualificação",
  cliente_cadastrado: "Cliente cadastrado",
  em_massa: "Ação em massa",
};

const texto = (s: string | null | undefined): Valor => {
  const t = s === null || s === undefined ? "" : String(s).trim();
  return t ? { t: "texto", v: t } : null;
};
const dataHora = (iso: string | null | undefined): Valor => (iso ? { t: "datahora", v: new Date(iso) } : null);
const inteiro = (n: number | null | undefined): Valor => (n === null || n === undefined ? null : { t: "inteiro", v: n });
const moeda = (n: number | null | undefined): Valor => (n === null || n === undefined ? null : { t: "moeda", v: Number(n) });
const simNao = (b: boolean): Valor => ({ t: "texto", v: b ? "Sim" : "Não" });
const decimal = (n: number | null): Valor => (n === null ? null : { t: "numero", v: n, casas: 1 });
const intervalo = (a: string | null | undefined, b: string | null | undefined, unidade: number): number | null => {
  if (!a || !b) return null;
  const v = (new Date(b).getTime() - new Date(a).getTime()) / unidade;
  return Number.isFinite(v) ? Math.max(0, v) : null;
};

const pontos = (c: ContextoLead) => resumoPontos(calcularPontos(c.lead, c.agora));
const dois = (n: number) => String(n).padStart(2, "0");
const quando = (d: Date) => {
  const p = partesSP(d);
  return `${dois(p.dia)}/${dois(p.mes)}/${p.ano} às ${dois(p.hora)}:${dois(p.minuto)}`;
};

function situacaoEvento(l: LeadCrm): string {
  if (l.evento_status === "erro") return `Não criado: ${l.evento_erro ?? "erro na agenda"}`;
  if (l.evento_google_id) return "Criado na agenda";
  return l.reuniao_em ? "Sem evento" : "";
}

const rotuloRemarcacao = (m: string | null) => MOTIVOS_REMARCACAO.find((x) => x.id === m)?.rotulo ?? m;

/** Todos os campos, na ordem das colunas da planilha e das seções da ficha do PDF. */
export const CAMPOS_EXPORT: CampoExport[] = [
  // Identificação e dados
  { secao: "Dados", titulo: "Nome", largura: 28, valor: (c) => texto(c.lead.nome) },
  { secao: "Dados", titulo: "Empresa", largura: 24, valor: (c) => texto(c.lead.empresa) },
  { secao: "Dados", titulo: "Nicho", largura: 18, valor: (c) => texto(c.lead.nicho) },
  { secao: "Dados", titulo: "Cidade/UF", largura: 18, valor: (c) => texto(c.lead.cidade) },
  { secao: "Dados", titulo: "Telefone", largura: 17, valor: (c) => texto(c.lead.telefone ? formatarTelefone(c.lead.telefone) : null) },
  { secao: "Dados", titulo: "WhatsApp", largura: 30, valor: (c) => texto(linkWhatsapp(c.lead.telefone)) },
  { secao: "Dados", titulo: "E-mail", largura: 28, valor: (c) => texto(c.lead.email) },
  { secao: "Dados", titulo: "Site/LP", largura: 28, valor: (c) => texto(c.lead.site) },
  { secao: "Dados", titulo: "Instagram", largura: 20, valor: (c) => texto(c.lead.instagram) },
  { secao: "Dados", titulo: "Google Meu Negócio", largura: 28, valor: (c) => texto(c.lead.google_meu_negocio) },
  { secao: "Dados", titulo: "Faturamento mensal", largura: 20, valor: (c) => texto(c.lead.faturamento_faixa ? rotuloFaixa(FAIXAS_FATURAMENTO, c.lead.faturamento_faixa) : null) },
  { secao: "Dados", titulo: "Investimento em anúncios", largura: 20, valor: (c) => texto(c.lead.investimento_faixa ? rotuloFaixa(FAIXAS_INVESTIMENTO, c.lead.investimento_faixa) : null) },
  { secao: "Dados", titulo: "Agência de destino", largura: 16, valor: (c) => texto(c.lead.agencia_destino ? c.agencias.get(c.lead.agencia_destino) ?? c.lead.agencia_destino : null) },
  { secao: "Dados", titulo: "Etiqueta", largura: 10, valor: (c) => texto(c.lead.trafego === "pago" ? "Pago" : "Orgânico") },
  { secao: "Dados", titulo: "Descrição", largura: 40, valor: (c) => texto(c.lead.observacoes) },

  // Etapa
  { secao: "Etapa", titulo: "Coluna atual", largura: 22, valor: (c) => texto(c.coluna?.titulo) },
  { secao: "Etapa", titulo: "Tipo da coluna", largura: 20, valor: (c) => texto(c.coluna ? rotuloTipo(c.coluna.tipo) : null) },
  { secao: "Etapa", titulo: "Posição no funil", largura: 12, valor: (c) => texto(c.posicao > 0 ? `${c.posicao} de ${c.totalColunas}` : null) },
  { secao: "Etapa", titulo: "Na coluna desde", largura: 18, valor: (c) => dataHora(c.lead.coluna_desde) },
  { secao: "Etapa", titulo: "Dias na coluna", largura: 10, valor: (c) => { const d = intervalo(c.lead.coluna_desde, c.agora.toISOString(), DIA_MS); return d === null ? null : inteiro(Math.floor(d)); } },
  { secao: "Etapa", titulo: "Urgência atual", largura: 30, valor: (c) => texto(urgenciaDoLead(c.lead, c.colunas, c.agora).texto || "Em dia") },
  { secao: "Etapa", titulo: "Próximo contato", largura: 18, valor: (c) => dataHora(c.lead.proximo_contato_em) },

  // Follow-up
  { secao: "Follow-up", titulo: "Tentativas de follow-up", largura: 12, valor: (c) => inteiro(c.lead.follow_up ?? 0) },
  { secao: "Follow-up", titulo: "Tentativas de follow-up de proposta", largura: 12, valor: (c) => inteiro(c.lead.follow_up_proposta ?? 0) },
  { secao: "Follow-up", titulo: "Follow-ups até marcar a reunião", largura: 12, valor: (c) => inteiro(c.lead.follow_ups_ate_reuniao) },
  { secao: "Follow-up", titulo: "Follow-ups de proposta até fechar", largura: 12, valor: (c) => inteiro(c.lead.follow_ups_ate_fechamento) },

  // Reunião
  { secao: "Reunião", titulo: "Reunião", largura: 18, valor: (c) => dataHora(c.lead.reuniao_em) },
  { secao: "Reunião", titulo: "Duração da reunião (min)", largura: 10, valor: (c) => (c.lead.reuniao_em ? inteiro(c.lead.reuniao_duracao_min ?? 30) : null) },
  { secao: "Reunião", titulo: "Período da call", largura: 14, valor: (c) => texto(c.lead.reuniao_em ? ROTULO_PERIODO[periodoDaCall(new Date(c.lead.reuniao_em))] : null) },
  { secao: "Reunião", titulo: "Reunião marcada em", largura: 18, valor: (c) => dataHora(c.lead.reuniao_marcada_em) },
  { secao: "Reunião", titulo: "Link do Meet", largura: 32, valor: (c) => texto(c.lead.evento_meet_link) },
  { secao: "Reunião", titulo: "Evento na agenda", largura: 22, valor: (c) => texto(situacaoEvento(c.lead)) },
  { secao: "Reunião", titulo: "ID do evento no Google", largura: 26, valor: (c) => texto(c.lead.evento_google_id) },
  { secao: "Reunião", titulo: "Pontos de contato feitos", largura: 10, valor: (c) => (c.lead.reuniao_em ? inteiro(pontos(c).feitos) : null) },
  { secao: "Reunião", titulo: "Pontos de contato aplicáveis", largura: 10, valor: (c) => (c.lead.reuniao_em ? inteiro(pontos(c).aplicaveis) : null) },
  { secao: "Reunião", titulo: "Próximo ponto de contato", largura: 34, valor: (c) => { const p = c.lead.reuniao_em ? pontos(c).proximo : null; return texto(p ? `${p.nome} — ${quando(p.quando)}` : null); } },
  { secao: "Reunião", titulo: "Ponto de contato atrasado", largura: 34, valor: (c) => { const p = c.lead.reuniao_em ? pontos(c).atrasado : null; return texto(p ? `${p.nome} — ${quando(p.quando)}` : null); } },
  { secao: "Reunião", titulo: "Compareceu", largura: 10, valor: (c) => simNao(!!c.lead.compareceu) },
  { secao: "Reunião", titulo: "No-shows", largura: 9, valor: (c) => inteiro(c.lead.no_shows ?? 0) },
  { secao: "Reunião", titulo: "Remarcações", largura: 11, valor: (c) => inteiro(c.lead.remarcacoes ?? 0) },
  { secao: "Reunião", titulo: "Motivo da última remarcação", largura: 22, valor: (c) => texto(rotuloRemarcacao(c.lead.motivo_remarcacao)) },

  // Proposta e fechamento
  { secao: "Proposta e fechamento", titulo: "Valor da proposta", largura: 14, valor: (c) => moeda(c.lead.valor_proposta) },
  { secao: "Proposta e fechamento", titulo: "Valor fechado", largura: 14, valor: (c) => moeda(c.lead.valor_fechamento) },
  { secao: "Proposta e fechamento", titulo: "Motivo da perda", largura: 26, valor: (c) => texto(c.lead.motivo_perda) },
  { secao: "Proposta e fechamento", titulo: "Motivo da desqualificação", largura: 26, valor: (c) => texto(c.lead.motivo_desqualificacao) },
  { secao: "Proposta e fechamento", titulo: "Cliente cadastrado", largura: 10, valor: (c) => simNao(!!c.lead.cliente_id) },
  { secao: "Proposta e fechamento", titulo: "ID do cliente", largura: 36, valor: (c) => texto(c.lead.cliente_id) },

  // Jornada
  { secao: "Jornada", titulo: "Entrada", largura: 18, valor: (c) => dataHora(c.lead.created_at) },
  { secao: "Jornada", titulo: "1º contato", largura: 18, valor: (c) => dataHora(c.lead.primeiro_contato_em) },
  { secao: "Jornada", titulo: "1ª reunião marcada", largura: 18, valor: (c) => dataHora(c.lead.primeira_reuniao_marcada_em) },
  { secao: "Jornada", titulo: "1ª reunião realizada", largura: 18, valor: (c) => dataHora(c.lead.primeira_reuniao_realizada_em) },
  { secao: "Jornada", titulo: "Proposta enviada", largura: 18, valor: (c) => dataHora(c.lead.proposta_enviada_em) },
  { secao: "Jornada", titulo: "Fechado em", largura: 18, valor: (c) => dataHora(c.lead.fechado_em) },
  { secao: "Jornada", titulo: "Perdido em", largura: 18, valor: (c) => dataHora(c.lead.perdido_em) },
  { secao: "Jornada", titulo: "Desqualificado em", largura: 18, valor: (c) => dataHora(c.lead.desqualificado_em) },
  { secao: "Jornada", titulo: "Horas até o 1º contato", largura: 10, valor: (c) => decimal(intervalo(c.lead.created_at, c.lead.primeiro_contato_em, HORA_MS)) },
  { secao: "Jornada", titulo: "Dias do 1º contato até marcar reunião", largura: 10, valor: (c) => decimal(intervalo(c.lead.primeiro_contato_em, c.lead.primeira_reuniao_marcada_em, DIA_MS)) },
  { secao: "Jornada", titulo: "Dias da reunião até a proposta", largura: 10, valor: (c) => decimal(intervalo(c.lead.primeira_reuniao_realizada_em, c.lead.proposta_enviada_em, DIA_MS)) },
  { secao: "Jornada", titulo: "Dias da entrada até fechar", largura: 10, valor: (c) => decimal(intervalo(c.lead.created_at, c.lead.fechado_em, DIA_MS)) },

  // Rastreamento
  { secao: "Rastreamento", titulo: "utm_source", largura: 14, valor: (c) => texto(c.lead.utm_source) },
  { secao: "Rastreamento", titulo: "utm_medium", largura: 14, valor: (c) => texto(c.lead.utm_medium) },
  { secao: "Rastreamento", titulo: "utm_campaign", largura: 18, valor: (c) => texto(c.lead.utm_campaign) },
  { secao: "Rastreamento", titulo: "utm_content", largura: 16, valor: (c) => texto(c.lead.utm_content) },
  { secao: "Rastreamento", titulo: "utm_term", largura: 14, valor: (c) => texto(c.lead.utm_term) },
  { secao: "Rastreamento", titulo: "fbclid", largura: 18, valor: (c) => texto(c.lead.fbclid) },
  { secao: "Rastreamento", titulo: "gclid", largura: 18, valor: (c) => texto(c.lead.gclid) },
  { secao: "Rastreamento", titulo: "Página de entrada", largura: 28, valor: (c) => texto(c.lead.pagina_entrada) },
  { secao: "Rastreamento", titulo: "Referência", largura: 22, valor: (c) => texto(c.lead.referencia) },

  // Atividade (resumo; o histórico completo vai na aba/arquivo de histórico e no PDF)
  { secao: "Atividade", titulo: "Notas", largura: 50, valor: (c) => texto(c.eventos.filter((e) => e.tipo === "nota").map((e) => `${quando(new Date(e.created_at))} — ${e.descricao}`).join(" | ")) },
  { secao: "Atividade", titulo: "Eventos no histórico", largura: 10, valor: (c) => inteiro(c.eventos.length) },
  { secao: "Atividade", titulo: "Última atividade", largura: 18, valor: (c) => dataHora(c.eventos[c.eventos.length - 1]?.created_at) },
  { secao: "Atividade", titulo: "Descrição da última atividade", largura: 40, valor: (c) => texto(c.eventos[c.eventos.length - 1]?.descricao) },

  // Sistema e campos antigos da Prospecção
  { secao: "Sistema", titulo: "Atualizado em", largura: 18, valor: (c) => dataHora(c.lead.updated_at) },
  { secao: "Sistema", titulo: "ID do lead", largura: 36, valor: (c) => texto(c.lead.id) },
  { secao: "Sistema", titulo: "Origem (campo antigo)", largura: 14, valor: (c) => texto((c.lead as { origem?: string | null }).origem) },
  { secao: "Sistema", titulo: "Valor estimado (campo antigo)", largura: 14, valor: (c) => moeda(numeroOuNull((c.lead as { valor_estimado?: unknown }).valor_estimado)) },
];

function numeroOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Coluna do lead (sem coluna = a inicial). */
export function colunaDoLead(lead: LeadCrm, colunas: ColunaCrm[]): ColunaCrm | null {
  return colunas.find((c) => c.id === lead.coluna_id) ?? colunaInicial(colunas);
}

/** Na ordem do funil; dentro da coluna, na ordem do Kanban (e os mais novos primeiro). */
export function ordenarParaExport(leads: LeadCrm[], colunas: ColunaCrm[]): LeadCrm[] {
  const ordem = new Map(ordenarColunas(colunas).map((c, i) => [c.id, i]));
  const pos = (l: LeadCrm) => ordem.get(colunaDoLead(l, colunas)?.id ?? "") ?? 999;
  return [...leads].sort(
    (a, b) => pos(a) - pos(b) || (a.ordem ?? 0) - (b.ordem ?? 0) || b.created_at.localeCompare(a.created_at),
  );
}

export function eventosPorLead(eventos: EventoCrm[]): Map<string, EventoCrm[]> {
  const m = new Map<string, EventoCrm[]>();
  for (const e of [...eventos].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const lista = m.get(e.lead_id);
    if (lista) lista.push(e);
    else m.set(e.lead_id, [e]);
  }
  return m;
}

export function contextoDoLead(
  lead: LeadCrm,
  colunas: ColunaCrm[],
  porLead: Map<string, EventoCrm[]>,
  agora: Date,
  agencias: Map<string, string>,
): ContextoLead {
  const ordenadas = ordenarColunas(colunas);
  const coluna = colunaDoLead(lead, ordenadas);
  return {
    lead,
    coluna,
    posicao: coluna ? ordenadas.findIndex((c) => c.id === coluna.id) + 1 : 0,
    totalColunas: ordenadas.length,
    colunas: ordenadas,
    eventos: porLead.get(lead.id) ?? [],
    agora,
    agencias,
  };
}

/** Uma linha por lead, com todos os campos. Os leads saem na ordem do funil. */
export function montarPlanilhaLeads(
  leads: LeadCrm[],
  colunas: ColunaCrm[],
  eventos: EventoCrm[],
  agora: Date,
  agencias: Map<string, string>,
): { leads: LeadCrm[]; planilha: Planilha } {
  const ordenados = ordenarParaExport(leads, colunas);
  const porLead = eventosPorLead(eventos);
  return {
    leads: ordenados,
    planilha: {
      cabecalho: CAMPOS_EXPORT.map(({ titulo, secao, largura }) => ({ titulo, secao, largura })),
      linhas: ordenados.map((l) => {
        const c = contextoDoLead(l, colunas, porLead, agora, agencias);
        return CAMPOS_EXPORT.map((campo) => campo.valor(c));
      }),
    },
  };
}

/** Todos os eventos dos leads exportados, do mais antigo para o mais recente, agrupados por lead. */
export function montarPlanilhaHistorico(leads: LeadCrm[], eventos: EventoCrm[], colunas: ColunaCrm[]): Planilha {
  const porLead = eventosPorLead(eventos);
  const linhas: Valor[][] = [];
  for (const l of ordenarParaExport(leads, colunas)) {
    const coluna = colunaDoLead(l, colunas);
    for (const e of porLead.get(l.id) ?? []) {
      linhas.push([
        texto(l.nome), texto(l.empresa), texto(coluna?.titulo), dataHora(e.created_at),
        texto(ROTULO_EVENTO[e.tipo] ?? e.tipo), texto(e.descricao),
      ]);
    }
  }
  return {
    cabecalho: [
      { titulo: "Lead", largura: 28 }, { titulo: "Empresa", largura: 22 }, { titulo: "Coluna atual", largura: 22 },
      { titulo: "Data", largura: 18 }, { titulo: "Tipo", largura: 20 }, { titulo: "Descrição", largura: 70 },
    ],
    linhas,
  };
}

/** Quantidade e valores por coluna do funil, com a linha de total. */
export function montarResumo(leads: LeadCrm[], colunas: ColunaCrm[]): Planilha {
  const ordenadas = ordenarColunas(colunas);
  const linhas: Valor[][] = [];
  let total = 0, somaProp = 0, somaFech = 0;
  for (const c of ordenadas) {
    const ls = leads.filter((l) => colunaDoLead(l, ordenadas)?.id === c.id);
    const prop = ls.reduce((s, l) => s + (Number(l.valor_proposta) || 0), 0);
    const fech = ls.reduce((s, l) => s + (Number(l.valor_fechamento) || 0), 0);
    total += ls.length;
    somaProp += prop;
    somaFech += fech;
    linhas.push([texto(c.titulo), texto(rotuloTipo(c.tipo)), inteiro(ls.length), moeda(prop), moeda(fech)]);
  }
  linhas.push([texto("Total"), null, inteiro(total), moeda(somaProp), moeda(somaFech)]);
  return {
    cabecalho: [
      { titulo: "Coluna", largura: 30 }, { titulo: "Tipo", largura: 22 }, { titulo: "Leads", largura: 10 },
      { titulo: "Soma das propostas", largura: 18 }, { titulo: "Soma dos fechamentos", largura: 20 },
    ],
    linhas,
  };
}

export function slug(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "leads";
}

/** crm-leads-{escopo}-{aaaa-mm-dd}.{ext} */
export function nomeArquivo(rotuloEscopo: string, ext: string, agora: Date): string {
  const p = partesSP(agora);
  return `crm-leads-${slug(rotuloEscopo)}-${p.ano}-${dois(p.mes)}-${dois(p.dia)}.${ext}`;
}

/** Texto de um campo para as fichas do PDF (vazio = campo sem valor). */
export function textoCampo(campo: CampoExport, c: ContextoLead): string {
  return textoDoValor(campo.valor(c), "legivel");
}
