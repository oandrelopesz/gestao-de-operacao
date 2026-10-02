// Os 5 pontos de contato antes da reunião. Horários variam pelo período da call (spec §6). Sem dependências.
import type { LeadCrm, PontosContatoEstado } from "./crmTipos.ts";
import { diaSPAs, partesSP } from "./crmFormato.ts";

export type PeriodoCall = "manha" | "inicio_tarde" | "fim_dia" | "noite";
export const ORDEM_PERIODOS: PeriodoCall[] = ["manha", "inicio_tarde", "fim_dia", "noite"];
export const ROTULO_PERIODO: Record<PeriodoCall, string> = {
  manha: "Manhã",
  inicio_tarde: "Início da tarde",
  fim_dia: "Fim do dia",
  noite: "Noite",
};
export const NOMES_PONTOS = [
  "Aquecimento (3 dias antes)",
  "Confirmação na véspera",
  "Lembrete do dia",
  "Pré-call",
  "Link do Meet",
];

export function periodoDaCall(inicio: Date): PeriodoCall {
  const h = partesSP(inicio).hora;
  if (h < 12) return "manha";
  if (h < 15) return "inicio_tarde";
  if (h < 18) return "fim_dia";
  return "noite";
}

/** Horário dos pontos 1 e 2 (D-3 e D-1) em cada período */
const BASE: Record<PeriodoCall, [number, number]> = {
  manha: [10, 0],
  inicio_tarde: [11, 0],
  fim_dia: [15, 0],
  noite: [18, 30],
};
const MIN = 60_000;

/** Os 5 horários para uma reunião que começa em `inicio`. */
export function horariosDosPontos(inicio: Date): Date[] {
  const periodo = periodoDaCall(inicio);
  const [h, m] = BASE[periodo];
  const t = inicio.getTime();
  const p1 = diaSPAs(inicio, -3, h, m);
  const p2 = diaSPAs(inicio, -1, h, m);
  const p3 =
    periodo === "manha" ? diaSPAs(inicio, -1, 19, 0)
    : periodo === "inicio_tarde" ? diaSPAs(inicio, 0, 8, 30)
    : periodo === "fim_dia" ? diaSPAs(inicio, 0, 9, 0)
    : diaSPAs(inicio, 0, 12, 0);
  let p4: Date;
  if (periodo === "manha") {
    const umaHoraAntes = Math.max(t - 60 * MIN, diaSPAs(inicio, 0, 7, 30).getTime());
    p4 = new Date(Math.min(umaHoraAntes, t - 20 * MIN));
  } else {
    p4 = new Date(t - 120 * MIN);
  }
  const p5 = new Date(t - 10 * MIN);
  return [p1, p2, p3, p4, p5];
}

export type EstadoPonto = "feito" | "nao_se_aplica" | "atrasado" | "pendente";

export interface PontoCalculado {
  n: number;
  nome: string;
  quando: Date;
  estado: EstadoPonto;
  feitoEm: string | null;
}

type LeadPontos = Pick<LeadCrm, "reuniao_em" | "reuniao_marcada_em" | "pontos_contato">;

const mesmoInstante = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

/** Feitos só valem para a reunião atual (`ref` = reuniao_em). */
function estadoAtual(lead: LeadPontos): PontosContatoEstado {
  const e = lead.pontos_contato ?? {};
  if (!lead.reuniao_em) return {};
  if (e.ref && !mesmoInstante(e.ref, lead.reuniao_em)) return { marcada_em: lead.reuniao_marcada_em ?? undefined };
  return e;
}

export function calcularPontos(lead: LeadPontos, agora: Date): PontoCalculado[] {
  if (!lead.reuniao_em) return [];
  const estado = estadoAtual(lead);
  const marcadaIso = estado.marcada_em ?? lead.reuniao_marcada_em;
  const marcada = marcadaIso ? new Date(marcadaIso).getTime() : null;
  const feitos = estado.feitos ?? {};
  return horariosDosPontos(new Date(lead.reuniao_em)).map((quando, i) => {
    const n = i + 1;
    const feitoEm = feitos[String(n)] ?? null;
    let e: EstadoPonto;
    if (feitoEm) e = "feito";
    else if (marcada !== null && quando.getTime() < marcada) e = "nao_se_aplica";
    else if (quando.getTime() <= agora.getTime()) e = "atrasado";
    else e = "pendente";
    return { n, nome: NOMES_PONTOS[i], quando, estado: e, feitoEm };
  });
}

export interface ResumoPontos {
  feitos: number;
  aplicaveis: number;
  proximo: PontoCalculado | null;
  /** O atrasado mais recente */
  atrasado: PontoCalculado | null;
}

export function resumoPontos(pontos: PontoCalculado[]): ResumoPontos {
  const atrasados = pontos.filter((p) => p.estado === "atrasado");
  return {
    feitos: pontos.filter((p) => p.estado === "feito").length,
    aplicaveis: pontos.filter((p) => p.estado !== "nao_se_aplica").length,
    proximo: pontos.find((p) => p.estado === "pendente") ?? null,
    atrasado: atrasados.length ? atrasados[atrasados.length - 1] : null,
  };
}

/** Reunião nova ou com data nova: pontos recomeçam. */
export function reiniciarPontos(reuniaoEm: string, agora: Date): PontosContatoEstado {
  return { ref: new Date(reuniaoEm).toISOString(), marcada_em: agora.toISOString(), feitos: {} };
}

export function marcarPonto(lead: LeadPontos, n: number, feito: boolean, agora: Date): PontosContatoEstado {
  if (!lead.reuniao_em) throw new Error("Lead sem reunião marcada");
  const atual = estadoAtual(lead);
  const base: PontosContatoEstado = {
    ref: new Date(lead.reuniao_em).toISOString(),
    marcada_em: atual.marcada_em ?? lead.reuniao_marcada_em ?? agora.toISOString(),
    feitos: { ...(atual.feitos ?? {}) },
  };
  if (feito) base.feitos![String(n)] = agora.toISOString();
  else delete base.feitos![String(n)];
  return base;
}
