// Contas do Dashboard do CRM (spec §10). Toda média vem com o tamanho da amostra. Sem dependências.
import type { ColunaCrm, EventoCrm, LeadCrm, TipoColuna } from "./crmTipos.ts";
import { FAIXAS_FATURAMENTO, ordenarColunas, rotuloFaixa, TIPOS_FINAIS } from "./crmColunas.ts";
import { ORDEM_PERIODOS, ROTULO_PERIODO, type PeriodoCall } from "./crmPontos.ts";
import { DIAS_SEMANA, HORA_MS } from "./crmFormato.ts";

export interface Amostra {
  valor: number | null;
  n: number;
}

export function media(valores: number[]): Amostra {
  return valores.length ? { valor: valores.reduce((a, b) => a + b, 0) / valores.length, n: valores.length } : { valor: null, n: 0 };
}

const horasEntre = (a: string | null | undefined, b: string | null | undefined): number | null => {
  if (!a || !b) return null;
  const h = (new Date(b).getTime() - new Date(a).getTime()) / HORA_MS;
  return Number.isFinite(h) ? Math.max(0, h) : null;
};

const soNumeros = (v: (number | null)[]) => v.filter((x): x is number => x !== null);

function tipoPor(colunas: ColunaCrm[]) {
  const m = new Map(colunas.map((c) => [c.id, c.tipo]));
  return (l: LeadCrm): TipoColuna | null => (l.coluna_id ? m.get(l.coluna_id) ?? null : null);
}

const razao = (a: number, b: number) => (b > 0 ? a / b : null);

export interface Numeros {
  leads: number;
  reunioesMarcadas: number;
  reunioesRealizadas: number;
  comparecimento: number | null;
  propostas: number;
  fechamentos: number;
  receita: number;
  ticketMedio: number | null;
  conversao: number | null;
  desqualificados: number;
}

export function calcularNumeros(leads: LeadCrm[], colunas: ColunaCrm[]): Numeros {
  const tipo = tipoPor(colunas);
  const realizadas = leads.filter((l) => l.compareceu).length;
  const faltaramSemComparecer = leads.filter((l) => (l.no_shows ?? 0) > 0 && !l.compareceu).length;
  const ganhos = leads.filter((l) => tipo(l) === "ganho");
  const receita = ganhos.reduce((s, l) => s + (Number(l.valor_fechamento) || 0), 0);
  const desqualificados = leads.filter((l) => tipo(l) === "desqualificado").length;
  return {
    leads: leads.length,
    reunioesMarcadas: leads.filter((l) => l.primeira_reuniao_marcada_em).length,
    reunioesRealizadas: realizadas,
    comparecimento: razao(realizadas, realizadas + faltaramSemComparecer),
    propostas: leads.filter((l) => l.proposta_enviada_em).length,
    fechamentos: ganhos.length,
    receita,
    ticketMedio: razao(receita, ganhos.length),
    conversao: razao(ganhos.length, leads.length - desqualificados),
    desqualificados,
  };
}

export interface Jornada {
  ateContato: Amostra;
  contatoAteReuniao: Amostra;
  followUpsAteReuniao: Amostra;
  realizadaAteProposta: Amostra;
  contatoAteFechamento: Amostra;
  followUpsAteFechamento: Amostra;
}

/** Tempos em horas; follow-ups em quantidade. */
export function calcularJornada(leads: LeadCrm[]): Jornada {
  const de = (f: (l: LeadCrm) => number | null) => media(soNumeros(leads.map(f)));
  return {
    ateContato: de((l) => horasEntre(l.created_at, l.primeiro_contato_em)),
    contatoAteReuniao: de((l) => horasEntre(l.primeiro_contato_em, l.primeira_reuniao_marcada_em)),
    followUpsAteReuniao: de((l) => (l.primeira_reuniao_marcada_em ? l.follow_ups_ate_reuniao ?? 0 : null)),
    realizadaAteProposta: de((l) => horasEntre(l.primeira_reuniao_realizada_em, l.proposta_enviada_em)),
    contatoAteFechamento: de((l) => (l.fechado_em ? horasEntre(l.primeiro_contato_em ?? l.created_at, l.fechado_em) : null)),
    followUpsAteFechamento: de((l) => (l.fechado_em ? l.follow_ups_ate_fechamento ?? 0 : null)),
  };
}

export interface EtapaFunil {
  id: string;
  rotulo: string;
  qtd: number;
  /** Passagem da etapa anterior para esta */
  taxa: number | null;
}

const ETAPAS_FUNIL: [string, string, (l: LeadCrm) => boolean][] = [
  ["leads", "Leads", () => true],
  ["contatados", "Contatados", (l) => !!l.primeiro_contato_em],
  ["marcadas", "Reunião marcada", (l) => !!l.primeira_reuniao_marcada_em],
  ["realizadas", "Reunião realizada", (l) => !!l.primeira_reuniao_realizada_em || l.compareceu],
  ["propostas", "Proposta", (l) => !!l.proposta_enviada_em],
  ["fechados", "Fechado", (l) => !!l.fechado_em],
];

export function calcularFunil(leads: LeadCrm[]): { etapas: EtapaFunil[]; gargalo: string | null } {
  const etapas: EtapaFunil[] = [];
  for (const [id, rotulo, passou] of ETAPAS_FUNIL) {
    const qtd = leads.filter(passou).length;
    const anterior = etapas[etapas.length - 1];
    etapas.push({ id, rotulo, qtd, taxa: anterior ? razao(qtd, anterior.qtd) : null });
  }
  let gargalo: string | null = null;
  let pior = Infinity;
  for (const e of etapas) {
    if (e.taxa !== null && e.taxa < pior) {
      pior = e.taxa;
      gargalo = e.id;
    }
  }
  return { etapas, gargalo };
}

export function tentativasAteReuniao(leads: LeadCrm[], colunas: ColunaCrm[]) {
  const tipo = tipoPor(colunas);
  const marcaram = leads.filter((l) => l.primeira_reuniao_marcada_em).map((l) => l.follow_ups_ate_reuniao ?? 0);
  const max = Math.max(7, ...marcaram);
  const distribuicao = Array.from({ length: max + 1 }, (_, n) => ({ n, qtd: marcaram.filter((x) => x === n).length }));
  const agora = new Map<number, number>();
  for (const l of leads) if (tipo(l) === "follow_up") agora.set(l.follow_up ?? 0, (agora.get(l.follow_up ?? 0) ?? 0) + 1);
  return {
    distribuicao,
    mediaQuemPrecisou: media(marcaram.filter((x) => x > 0)),
    emFollowUp: [...agora.entries()].sort((a, b) => a[0] - b[0]).map(([n, qtd]) => ({ n, qtd })),
  };
}

export interface LinhaGrupo {
  grupo: string;
  leads: number;
  reunioes: number;
  realizadas: number;
  fechamentos: number;
  receita: number;
  conversao: number | null;
  ticket: number | null;
}

export function porGrupo(leads: LeadCrm[], colunas: ColunaCrm[], chave: (l: LeadCrm) => string): LinhaGrupo[] {
  const tipo = tipoPor(colunas);
  const grupos = new Map<string, LeadCrm[]>();
  for (const l of leads) {
    const g = chave(l);
    grupos.set(g, [...(grupos.get(g) ?? []), l]);
  }
  return [...grupos.entries()]
    .map(([grupo, ls]) => {
      const ganhos = ls.filter((l) => tipo(l) === "ganho");
      const receita = ganhos.reduce((s, l) => s + (Number(l.valor_fechamento) || 0), 0);
      const desq = ls.filter((l) => tipo(l) === "desqualificado").length;
      return {
        grupo,
        leads: ls.length,
        reunioes: ls.filter((l) => l.primeira_reuniao_marcada_em).length,
        realizadas: ls.filter((l) => l.compareceu).length,
        fechamentos: ganhos.length,
        receita,
        conversao: razao(ganhos.length, ls.length - desq),
        ticket: razao(receita, ganhos.length),
      };
    })
    .sort((a, b) => b.leads - a.leads || a.grupo.localeCompare(b.grupo));
}

export const chaveTrafego = (l: LeadCrm) => (l.trafego === "pago" ? "Pago" : "Orgânico");
export const chaveUtmSource = (l: LeadCrm) => l.utm_source?.trim() || "Sem UTM";
export const chaveUtmCampaign = (l: LeadCrm) => l.utm_campaign?.trim() || "Sem UTM";
export const chaveNicho = (l: LeadCrm) => l.nicho?.trim() || "Sem nicho";
export const chaveFaturamento = (l: LeadCrm) => rotuloFaixa(FAIXAS_FATURAMENTO, l.faturamento_faixa);

export function contarMotivos(leads: LeadCrm[], colunas: ColunaCrm[], tipoAlvo: "perdido" | "desqualificado") {
  const tipo = tipoPor(colunas);
  const cont = new Map<string, number>();
  for (const l of leads) {
    if (tipo(l) !== tipoAlvo) continue;
    const m = (tipoAlvo === "perdido" ? l.motivo_perda : l.motivo_desqualificacao)?.trim() || "Motivo não registrado";
    cont.set(m, (cont.get(m) ?? 0) + 1);
  }
  return [...cont.entries()].map(([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd || a.motivo.localeCompare(b.motivo));
}

export function noShowRecuperacao(leads: LeadCrm[]) {
  const faltaram = leads.filter((l) => (l.no_shows ?? 0) > 0);
  const compareceramDepois = faltaram.filter((l) => l.compareceu).length;
  return {
    faltaram: faltaram.length,
    remarcaram: faltaram.filter((l) => (l.remarcacoes ?? 0) > 0).length,
    compareceramDepois,
    taxa: razao(compareceramDepois, faltaram.length),
  };
}

export function depoisDaReuniao(leads: LeadCrm[], colunas: ColunaCrm[]) {
  const tipo = tipoPor(colunas);
  const r = { total: 0, naHora: 0, noFollowUp: 0, naoFechou: 0, emAndamento: 0 };
  for (const l of leads) {
    if (!l.compareceu) continue;
    r.total++;
    const tp = tipo(l);
    if (tp === "ganho") {
      if ((l.follow_ups_ate_fechamento ?? 0) > 0) r.noFollowUp++;
      else r.naHora++;
    } else if (tp === "perdido" || tp === "desqualificado") r.naoFechou++;
    else r.emAndamento++;
  }
  return r;
}

export interface LinhaComparecimento {
  grupo: string;
  realizadas: number;
  faltas: number;
  taxa: number | null;
}

export function comparecimentoPor(eventos: EventoCrm[], chave: "periodo" | "dia_semana" | "pontos"): LinhaComparecimento[] {
  const cont = new Map<number, { grupo: string; realizadas: number; faltas: number }>();
  for (const e of eventos) {
    if (e.tipo !== "reuniao_resultado" || !e.dados?.reuniao_em) continue;
    let ordem: number;
    let grupo: string;
    if (chave === "periodo") {
      const p = e.dados.periodo as PeriodoCall;
      ordem = ORDEM_PERIODOS.indexOf(p);
      if (ordem < 0) continue;
      grupo = ROTULO_PERIODO[p];
    } else if (chave === "dia_semana") {
      const d = Number(e.dados.dia_semana);
      if (!(d >= 0 && d <= 6)) continue;
      ordem = (d + 6) % 7; // segunda primeiro
      grupo = DIAS_SEMANA[d];
    } else {
      const n = Number(e.dados.pontos_feitos);
      if (!(n >= 0)) continue;
      ordem = n;
      grupo = `${n} ${n === 1 ? "ponto" : "pontos"}`;
    }
    const linha = cont.get(ordem) ?? { grupo, realizadas: 0, faltas: 0 };
    if (e.dados.compareceu) linha.realizadas++;
    else linha.faltas++;
    cont.set(ordem, linha);
  }
  return [...cont.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, l]) => ({ ...l, taxa: razao(l.realizadas, l.realizadas + l.faltas) }));
}

export interface TempoColuna {
  colunaId: string;
  titulo: string;
  media: Amostra;
}

export function tempoPorColuna(leads: LeadCrm[], eventos: EventoCrm[], colunas: ColunaCrm[], agora: Date): TempoColuna[] {
  const tipo = tipoPor(colunas);
  const porLead = new Map<string, EventoCrm[]>();
  for (const e of eventos) {
    if (e.tipo !== "mudanca_coluna") continue;
    porLead.set(e.lead_id, [...(porLead.get(e.lead_id) ?? []), e]);
  }
  const duracoes = new Map<string, number[]>();
  const somar = (col: string | null | undefined, h: number | null) => {
    if (!col || h === null) return;
    duracoes.set(col, [...(duracoes.get(col) ?? []), h]);
  };
  for (const l of leads) {
    const evs = (porLead.get(l.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
    let inicio = l.created_at;
    for (const e of evs) {
      somar(e.dados.de as string | null, horasEntre(inicio, e.created_at));
      inicio = e.created_at;
    }
    const tp = tipo(l);
    if (l.coluna_id && tp && !TIPOS_FINAIS.includes(tp)) somar(l.coluna_id, horasEntre(l.coluna_desde ?? inicio, agora.toISOString()));
  }
  return ordenarColunas(colunas)
    .filter((c) => !TIPOS_FINAIS.includes(c.tipo))
    .map((c) => ({ colunaId: c.id, titulo: c.titulo, media: media(duracoes.get(c.id) ?? []) }));
}

export function previsao(leads: LeadCrm[], colunas: ColunaCrm[]) {
  const tipo = tipoPor(colunas);
  const emProposta = leads.filter((l) => tipo(l) === "proposta" || tipo(l) === "follow_up_proposta").length;
  const comDesfecho = leads.filter((l) => {
    const tp = tipo(l);
    return !!l.proposta_enviada_em && !!tp && TIPOS_FINAIS.includes(tp);
  });
  const ganhos = comDesfecho.filter((l) => tipo(l) === "ganho");
  const taxa = razao(ganhos.length, comDesfecho.length);
  const { ticketMedio } = calcularNumeros(leads, colunas);
  return {
    emProposta,
    taxa,
    ticket: ticketMedio,
    valor: taxa !== null && ticketMedio !== null ? emProposta * taxa * ticketMedio : null,
    amostra: comDesfecho.length,
  };
}

export function parados(leads: LeadCrm[], colunas: ColunaCrm[], agora: Date, dias = 7) {
  const limite = agora.getTime() - dias * 24 * HORA_MS;
  return ordenarColunas(colunas)
    .filter((c) => !TIPOS_FINAIS.includes(c.tipo))
    .map((coluna) => ({
      coluna,
      leads: leads.filter((l) => l.coluna_id === coluna.id && new Date(l.coluna_desde ?? l.created_at).getTime() < limite),
    }))
    .filter((g) => g.leads.length > 0);
}
