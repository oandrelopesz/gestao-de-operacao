// Colunas do CRM: tipos, colunas iniciais, motivos, faixas e o que cada tipo exige. Sem dependências.
import type { ColunaCrm, LeadCrm, MotivoRemarcacao, TipoColuna } from "./crmTipos.ts";

export const TETO_PADRAO = 7;
export const DURACOES_REUNIAO = [15, 30, 45, 60, 90];

export const TIPOS_COLUNA: { tipo: TipoColuna; rotulo: string; descricao: string }[] = [
  { tipo: "padrao", rotulo: "Padrão", descricao: "Sem exigência." },
  { tipo: "follow_up", rotulo: "Follow-up", descricao: "Conta as tentativas de contato até o limite." },
  { tipo: "reuniao", rotulo: "Reunião marcada", descricao: "Exige data e hora; cria o evento na agenda com Meet." },
  { tipo: "confirmacao", rotulo: "Confirmação de reunião", descricao: "Pontos de contato antes da reunião." },
  { tipo: "remarcacao", rotulo: "Remarcação", descricao: "Pede o motivo; uma nova data move o evento." },
  { tipo: "realizada", rotulo: "Reunião realizada", descricao: "Registra que o lead compareceu." },
  { tipo: "proposta", rotulo: "Proposta", descricao: "Registra o envio e o valor da proposta." },
  { tipo: "follow_up_proposta", rotulo: "Follow-up de proposta", descricao: "Conta as tentativas depois da proposta." },
  { tipo: "ganho", rotulo: "Fechamento (ganho)", descricao: "Exige o valor fechado." },
  { tipo: "perdido", rotulo: "Perdido", descricao: "Exige o motivo da perda." },
  { tipo: "desqualificado", rotulo: "Desqualificado", descricao: "Exige o motivo; fica fora da conversão." },
];

export const TIPOS_FINAIS: TipoColuna[] = ["ganho", "perdido", "desqualificado"];
/** Colunas em que o card mostra os pontos de contato da reunião */
export const TIPOS_COM_PONTOS: TipoColuna[] = ["reuniao", "confirmacao", "remarcacao"];

export const MOTIVOS_PERDA_PADRAO = [
  "Não respondeu após as tentativas",
  "Não compareceu",
  "Sem orçamento agora",
  "Achou caro",
  "Escolheu outra agência ou profissional",
  "Sem prioridade no momento",
  "Não fechou após a proposta",
  "Outro",
];

export const MOTIVOS_DESQUALIFICACAO_PADRAO = [
  "Fora do perfil ou nicho",
  "Faturamento abaixo do mínimo",
  "Sem verba para anúncios",
  "Só queria informação",
  "Contato inválido",
  "Concorrente",
  "Outro",
];

export const MOTIVOS_REMARCACAO: { id: MotivoRemarcacao; rotulo: string }[] = [
  { id: "no_show", rotulo: "Não compareceu (no-show)" },
  { id: "nao_confirmou", rotulo: "Não confirmou" },
  { id: "pediu_remarcar", rotulo: "Pediu para remarcar" },
];

export interface Faixa { id: string; rotulo: string }

export const FAIXAS_FATURAMENTO: Faixa[] = [
  { id: "ate_10k", rotulo: "Até R$ 10 mil" },
  { id: "10k_30k", rotulo: "R$ 10 a 30 mil" },
  { id: "30k_50k", rotulo: "R$ 30 a 50 mil" },
  { id: "50k_100k", rotulo: "R$ 50 a 100 mil" },
  { id: "100k_300k", rotulo: "R$ 100 a 300 mil" },
  { id: "300k_1m", rotulo: "R$ 300 mil a 1 milhão" },
  { id: "acima_1m", rotulo: "Acima de R$ 1 milhão" },
];

export const FAIXAS_INVESTIMENTO: Faixa[] = [
  { id: "nao_investe", rotulo: "Não investe" },
  { id: "ate_1k", rotulo: "Até R$ 1 mil" },
  { id: "1k_3k", rotulo: "R$ 1 a 3 mil" },
  { id: "3k_10k", rotulo: "R$ 3 a 10 mil" },
  { id: "10k_30k", rotulo: "R$ 10 a 30 mil" },
  { id: "acima_30k", rotulo: "Acima de R$ 30 mil" },
];

export function rotuloFaixa(lista: Faixa[], id: string | null | undefined): string {
  return lista.find((f) => f.id === id)?.rotulo ?? "Não informado";
}

export const COLUNAS_PADRAO: ColunaCrm[] = [
  { id: "novo_lead", titulo: "Novo lead", hex: "#64748b", ordem: 0, tipo: "padrao", config: {} },
  { id: "primeiro_contato", titulo: "Primeiro contato", hex: "#3b82f6", ordem: 1, tipo: "padrao", config: {} },
  { id: "follow_up", titulo: "Follow-up", hex: "#06b6d4", ordem: 2, tipo: "follow_up", config: { teto: 7 } },
  { id: "respondeu", titulo: "Respondeu", hex: "#14b8a6", ordem: 3, tipo: "padrao", config: {} },
  { id: "desenvolvendo", titulo: "Desenvolvendo conversa", hex: "#10b981", ordem: 4, tipo: "padrao", config: {} },
  { id: "reuniao_marcada", titulo: "Reunião marcada", hex: "#8b5cf6", ordem: 5, tipo: "reuniao", config: {} },
  { id: "reuniao_confirmada", titulo: "Reunião confirmada", hex: "#6366f1", ordem: 6, tipo: "confirmacao", config: {} },
  { id: "remarcar", titulo: "Remarcar reunião", hex: "#f59e0b", ordem: 7, tipo: "remarcacao", config: {} },
  { id: "reuniao_realizada", titulo: "Reunião realizada", hex: "#a855f7", ordem: 8, tipo: "realizada", config: {} },
  { id: "proposta", titulo: "Proposta enviada para avaliação", hex: "#f97316", ordem: 9, tipo: "proposta", config: {} },
  { id: "follow_up_proposta", titulo: "Follow-up de proposta", hex: "#fb923c", ordem: 10, tipo: "follow_up_proposta", config: { teto: 7 } },
  { id: "fechamento", titulo: "Fechamento", hex: "#16a34a", ordem: 11, tipo: "ganho", config: {} },
  { id: "perdido", titulo: "Lead perdido", hex: "#f43f5e", ordem: 12, tipo: "perdido", config: {} },
  { id: "desqualificado", titulo: "Lead desqualificado", hex: "#71717a", ordem: 13, tipo: "desqualificado", config: {} },
];

export function ordenarColunas(colunas: ColunaCrm[]): ColunaCrm[] {
  return [...colunas].sort((a, b) => a.ordem - b.ordem);
}

/** Onde o lead nasce: a coluna de menor ordem. */
export function colunaInicial(colunas: ColunaCrm[]): ColunaCrm | null {
  return ordenarColunas(colunas)[0] ?? null;
}

export function tetoDa(coluna: Pick<ColunaCrm, "config">): number {
  const t = Number(coluna.config?.teto);
  return Number.isInteger(t) && t >= 1 && t <= 30 ? t : TETO_PADRAO;
}

export function motivosDa(coluna: Pick<ColunaCrm, "tipo" | "config">): string[] {
  const proprios = (coluna.config?.motivos ?? []).map((m) => String(m).trim()).filter(Boolean);
  if (proprios.length) return proprios;
  if (coluna.tipo === "perdido") return MOTIVOS_PERDA_PADRAO;
  if (coluna.tipo === "desqualificado") return MOTIVOS_DESQUALIFICACAO_PADRAO;
  return [];
}

export type Exigencia = "nenhuma" | "reuniao" | "remarcacao" | "proposta" | "ganho" | "motivo";

/** O que a janela precisa perguntar antes de mover o lead para uma coluna deste tipo. */
export function exigenciaDe(tipo: TipoColuna, lead: Pick<LeadCrm, "reuniao_em">): Exigencia {
  switch (tipo) {
    case "reuniao":
      return "reuniao";
    case "confirmacao":
      return lead.reuniao_em ? "nenhuma" : "reuniao";
    case "remarcacao":
      return "remarcacao";
    case "proposta":
      return "proposta";
    case "ganho":
      return "ganho";
    case "perdido":
    case "desqualificado":
      return "motivo";
    default:
      return "nenhuma";
  }
}

/** Mover vários de uma vez: "sim" (sem pergunta), "motivo" (um motivo para todos) ou "nao". */
export function emMassa(tipo: TipoColuna): "sim" | "motivo" | "nao" {
  if (tipo === "perdido" || tipo === "desqualificado") return "motivo";
  if (tipo === "reuniao" || tipo === "confirmacao" || tipo === "remarcacao" || tipo === "ganho") return "nao";
  return "sim";
}

export function rotuloTipo(tipo: TipoColuna): string {
  return TIPOS_COLUNA.find((t) => t.tipo === tipo)?.rotulo ?? tipo;
}

export function validarColunas(colunas: ColunaCrm[]): string | null {
  if (colunas.length === 0) return "Precisa sobrar ao menos uma coluna.";
  for (const c of colunas) {
    if (!c.titulo.trim()) return "Toda coluna precisa de um nome.";
    if (!/^#[0-9a-fA-F]{6}$/.test(c.hex)) return `Cor inválida em "${c.titulo}".`;
    if (!TIPOS_COLUNA.some((t) => t.tipo === c.tipo)) return `Tipo inválido em "${c.titulo}".`;
  }
  return null;
}

export function emailValido(email: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email ?? "").trim());
}
