// Período (atalhos em SP), critério (entrada × movimentação), busca e etiqueta. Sem dependências.
import type { EventoCrm, LeadCrm, Trafego } from "./crmTipos.ts";
import { deSP, diaSPAs, partesSP } from "./crmFormato.ts";
import { buscar, type OpcoesBusca, type ResultadoBusca } from "./search.ts";

export type AtalhoPeriodo = "hoje" | "ontem" | "7d" | "30d" | "mes" | "mes_passado" | "maximo" | "personalizado";
export type CriterioPeriodo = "entrada" | "movimentacao";

export interface FiltroPeriodo {
  atalho: AtalhoPeriodo;
  /** aaaa-mm-dd (personalizado) */
  de?: string | null;
  ate?: string | null;
  criterio: CriterioPeriodo;
}

export interface FiltroCrm {
  periodo: FiltroPeriodo;
  busca: string;
  trafego: "todos" | Trafego;
}

export const ATALHOS_PERIODO: { id: AtalhoPeriodo; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "ontem", rotulo: "Ontem" },
  { id: "7d", rotulo: "Últimos 7 dias" },
  { id: "30d", rotulo: "Últimos 30 dias" },
  { id: "mes", rotulo: "Este mês" },
  { id: "mes_passado", rotulo: "Mês passado" },
  { id: "maximo", rotulo: "Período máximo" },
  { id: "personalizado", rotulo: "Personalizado" },
];

export const FILTRO_CRM_PADRAO: FiltroCrm = {
  periodo: { atalho: "maximo", criterio: "entrada" },
  busca: "",
  trafego: "todos",
};

export interface Intervalo {
  inicio: Date | null;
  fim: Date | null;
}

const doCampo = (s: string | null | undefined, somaDias = 0): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  return m ? deSP(Number(m[1]), Number(m[2]), Number(m[3]) + somaDias) : null;
};

export function intervaloDo(f: FiltroPeriodo, agora: Date): Intervalo {
  const p = partesSP(agora);
  switch (f.atalho) {
    case "hoje":
      return { inicio: diaSPAs(agora, 0, 0), fim: diaSPAs(agora, 1, 0) };
    case "ontem":
      return { inicio: diaSPAs(agora, -1, 0), fim: diaSPAs(agora, 0, 0) };
    case "7d":
      return { inicio: diaSPAs(agora, -6, 0), fim: diaSPAs(agora, 1, 0) };
    case "30d":
      return { inicio: diaSPAs(agora, -29, 0), fim: diaSPAs(agora, 1, 0) };
    case "mes":
      return { inicio: deSP(p.ano, p.mes, 1), fim: deSP(p.ano, p.mes + 1, 1) };
    case "mes_passado":
      return { inicio: deSP(p.ano, p.mes - 1, 1), fim: deSP(p.ano, p.mes, 1) };
    case "personalizado":
      return { inicio: doCampo(f.de), fim: doCampo(f.ate, 1) };
    default:
      return { inicio: null, fim: null };
  }
}

export function dentro(iso: string | null | undefined, i: Intervalo): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return (!i.inicio || t >= i.inicio.getTime()) && (!i.fim || t < i.fim.getTime());
}

export function agruparEventos(eventos: EventoCrm[]): Map<string, EventoCrm[]> {
  const m = new Map<string, EventoCrm[]>();
  for (const e of eventos) {
    const lista = m.get(e.lead_id);
    if (lista) lista.push(e);
    else m.set(e.lead_id, [e]);
  }
  return m;
}

/** Telefone digitado a partir de 4 dígitos: o lead entra se o telefone dele (só os dígitos) contém esses dígitos. */
const DIGITOS_TELEFONE = 4;

/**
 * Leads que passam pelo tráfego e pelo período e batem com a busca. Tráfego e período valem antes; a busca é tolerante
 * (sem acento, com erro de digitação) no nome e depois na empresa, no nicho, no e-mail e na cidade. Com 4 dígitos ou
 * mais na busca, quem tem esses dígitos no telefone entra como se tivesse batido todas as palavras (resultado
 * "exato", na frente). Com `manterOrdem` (Kanban) só filtra: os leads seguem a ordem de `leads`.
 */
export function filtrarLeads(
  leads: LeadCrm[],
  eventosPorLead: Map<string, EventoCrm[]>,
  f: FiltroCrm,
  agora: Date,
  opcoes?: OpcoesBusca,
): ResultadoBusca<LeadCrm> {
  const i = intervaloDo(f.periodo, agora);
  const semLimite = !i.inicio && !i.fim;
  const base = leads.filter((l) => {
    if (f.trafego !== "todos" && l.trafego !== f.trafego) return false;
    if (semLimite) return true;
    return f.periodo.criterio === "entrada"
      ? dentro(l.created_at, i)
      : (eventosPorLead.get(l.id) ?? []).some((e) => dentro(e.created_at, i));
  });
  const resultado = buscar(base, f.busca, (l) => [l.nome, l.empresa, l.nicho, l.email, l.cidade], opcoes);

  const digitos = f.busca.replace(/\D/g, "");
  if (digitos.length < DIGITOS_TELEFONE) return resultado;
  const porTelefone = base.filter((l) => (l.telefone ?? "").replace(/\D/g, "").includes(digitos));
  if (porTelefone.length === 0) return resultado;

  // Quem bateu pelo telefone vale como "bateu tudo"; os que só bateram parte das palavras ("parecidos") ficam de fora.
  const doTexto = resultado.modo === "exato" ? resultado.itens : [];
  let itens: LeadCrm[];
  if (opcoes?.manterOrdem) {
    const entram = new Set<LeadCrm>([...porTelefone, ...doTexto]);
    itens = base.filter((l) => entram.has(l));
  } else {
    const jaTem = new Set<LeadCrm>(porTelefone);
    itens = [...porTelefone, ...doTexto.filter((l) => !jaTem.has(l))];
  }
  return { itens, modo: "exato", mensagem: null };
}
