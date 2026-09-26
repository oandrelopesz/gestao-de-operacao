// Período (atalhos em SP), critério (entrada × movimentação), busca e etiqueta. Sem dependências.
import type { EventoCrm, LeadCrm, Trafego } from "./crmTipos.ts";
import { deSP, diaSPAs, partesSP } from "./crmFormato.ts";

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

export function normalizarBusca(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
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

export function filtrarLeads(leads: LeadCrm[], eventosPorLead: Map<string, EventoCrm[]>, f: FiltroCrm, agora: Date): LeadCrm[] {
  const i = intervaloDo(f.periodo, agora);
  const semLimite = !i.inicio && !i.fim;
  const termo = normalizarBusca(f.busca);
  const termoDigitos = f.busca.replace(/\D/g, "");
  return leads.filter((l) => {
    if (f.trafego !== "todos" && l.trafego !== f.trafego) return false;
    if (!semLimite) {
      const ok = f.periodo.criterio === "entrada"
        ? dentro(l.created_at, i)
        : (eventosPorLead.get(l.id) ?? []).some((e) => dentro(e.created_at, i));
      if (!ok) return false;
    }
    if (termo) {
      const texto = normalizarBusca([l.nome, l.empresa, l.nicho, l.email, l.cidade].filter(Boolean).join(" "));
      const noTelefone = termoDigitos.length >= 4 && (l.telefone ?? "").replace(/\D/g, "").includes(termoDigitos);
      if (!texto.includes(termo) && !noTelefone) return false;
    }
    return true;
  });
}
