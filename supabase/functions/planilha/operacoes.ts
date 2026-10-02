// Operações que a planilha aplica (spec 2026-10-01-banco-de-leads §6): linhas, remoções, lixeira e avisos.
// Puro: testado em src/lib/planilhaOperacoes.test.ts.
import type { ColunaCrm, LeadCrm } from "../_shared/crmTipos.ts";
import type { LeadBanco } from "../_shared/bancoLeads.ts";
import {
  COLUNAS_LIXEIRA,
  corDaLinhaCrm,
  linhaCrm,
  motivosDaEtapa,
  SO_LEITURA,
  type CorLinha,
  type LinhaCrm,
  type OrigemLead,
  type PendenciaCrm,
  type TituloCrm,
} from "../_shared/planilhaCrm.ts";

export const ABA_CRM = "CRM";

export interface OperacaoLinha {
  tipo: "linha";
  /** gid da aba de leads ou "CRM" */
  aba: string;
  id: string;
  /** Valores por chave (abas de leads) ou por título (aba CRM) */
  valores: Record<string, string>;
  /** true: colunas ausentes ficam vazias */
  completa?: boolean;
  /** Linha da planilha onde o registro foi digitado (lead novo criado na aba CRM) */
  linha?: number;
  cor?: CorLinha | null;
  motivos?: string[];
}

export type Operacao =
  | OperacaoLinha
  | { tipo: "remover"; aba: string; id: string }
  | { tipo: "lixeira"; valores: Record<string, string> }
  | { tipo: "aviso"; texto: string };

/** Colunas da aba CRM que dependem de cada campo de `prospeccao` (atualização parcial vinda da fila). */
export const CAMPO_PARA_TITULOS: Record<string, TituloCrm[]> = {
  nome: ["Lead"],
  empresa: ["Empresa"],
  telefone: ["Telefone"],
  email: ["E-mail"],
  instagram: ["Instagram"],
  coluna_id: ["Etapa", "Motivo", "Situação"],
  coluna_desde: ["Na etapa desde"],
  follow_up: ["Tentativas"],
  follow_up_proposta: ["Tentativas da proposta"],
  proximo_contato_em: ["Próximo contato"],
  reuniao_em: ["Reunião (data)", "Reunião (hora)", "Duração (min)", "Situação"],
  reuniao_duracao_min: ["Duração (min)"],
  evento_google_id: ["Situação"],
  evento_meet_link: ["Link do Meet"],
  evento_status: ["Situação"],
  evento_erro: ["Situação"],
  valor_proposta: ["Valor da proposta"],
  valor_fechamento: ["Valor fechado"],
  motivo_perda: ["Motivo"],
  motivo_desqualificacao: ["Motivo"],
  motivo_remarcacao: ["Motivo"],
  trafego: ["Orgânico/Pago"],
  nicho: ["Nicho"],
  cidade: ["Cidade"],
  faturamento_faixa: ["Faturamento"],
  observacoes: ["Observações"],
  created_at: ["Entrou no CRM"],
};

function etapaECor(lead: LeadCrm, colunas: ColunaCrm[], pendencia: PendenciaCrm | null) {
  const tipo = colunas.find((c) => c.id === lead.coluna_id)?.tipo ?? null;
  const etapa = colunas.find((c) => c.id === (pendencia?.etapa_id ?? lead.coluna_id)) ?? null;
  return { cor: corDaLinhaCrm(tipo, !!pendencia), motivos: motivosDaEtapa(etapa) };
}

/** Linha do lead na aba CRM: toda (`campos` ausente) ou só as colunas dos campos que mudaram. */
export function opCrm(
  lead: LeadCrm,
  colunas: ColunaCrm[],
  origem: OrigemLead | null,
  pendencia: PendenciaCrm | null,
  campos?: string[] | null,
): OperacaoLinha {
  const linha = linhaCrm(lead, colunas, origem, pendencia);
  const toda = !campos;
  const titulos = new Set<string>(toda ? Object.keys(linha) : campos!.flatMap((c) => CAMPO_PARA_TITULOS[c] ?? []));
  const op: OperacaoLinha = {
    tipo: "linha",
    aba: ABA_CRM,
    id: lead.id,
    valores: Object.fromEntries(Object.entries(linha).filter(([t]) => titulos.has(t))),
    completa: toda,
  };
  if (toda || campos!.includes("coluna_id")) Object.assign(op, etapaECor(lead, colunas, pendencia));
  return op;
}

/**
 * Linha depois de uma edição feita na própria aba CRM: escreve só o que o sistema mudou, o que precisa voltar e as
 * colunas que o sistema preenche. Assim um valor que ainda espera complemento (data sem hora) não é apagado.
 */
export function opCrmMudancas(
  antes: LinhaCrm,
  lead: LeadCrm,
  colunas: ColunaCrm[],
  origem: OrigemLead | null,
  pendencia: PendenciaCrm | null,
  reverter: string[],
): OperacaoLinha {
  const depois = linhaCrm(lead, colunas, origem, pendencia);
  const valores: Record<string, string> = {};
  for (const [t, v] of Object.entries(depois)) {
    if (v !== (antes[t] ?? "") || reverter.includes(t) || (SO_LEITURA as readonly string[]).includes(t)) valores[t] = v;
  }
  return { tipo: "linha", aba: ABA_CRM, id: lead.id, valores, ...etapaECor(lead, colunas, pendencia) };
}

export function opLixeira(lead: LeadCrm, colunas: ColunaCrm[], origem: OrigemLead | null): Operacao {
  const linha = linhaCrm(lead, colunas, origem, null);
  return { tipo: "lixeira", valores: Object.fromEntries(COLUNAS_LIXEIRA.map((t) => [t, linha[t] ?? ""])) };
}

/** Linha da aba de leads: só as chaves pedidas (as apagadas vão vazias) ou a linha toda. */
export function opLead(lead: LeadBanco, chaves: string[] | null): OperacaoLinha {
  if (!chaves) return { tipo: "linha", aba: lead.aba_id, id: lead.id, valores: { ...lead.dados }, completa: true };
  return { tipo: "linha", aba: lead.aba_id, id: lead.id, valores: Object.fromEntries(chaves.map((k) => [k, lead.dados[k] ?? ""])) };
}

export interface EntradaFila {
  id: number;
  entidade: string;
  registro_id: string;
  op: string;
  campos: string[] | null;
  dados: any;
}

export interface GrupoFila {
  entidade: "lead" | "crm";
  id: string;
  op: "upsert" | "delete";
  campos: string[] | null;
  dados: any;
}

/** Uma entrada por registro: campos somados (null = linha toda) e a exclusão vencendo, na ordem da fila. */
export function agruparFila(entradas: EntradaFila[]): GrupoFila[] {
  const grupos = new Map<string, GrupoFila>();
  for (const e of [...entradas].sort((a, b) => a.id - b.id)) {
    const chave = `${e.entidade}:${e.registro_id}`;
    const atual = grupos.get(chave);
    const op = e.op === "delete" ? "delete" : "upsert";
    if (!atual) {
      grupos.set(chave, { entidade: e.entidade as GrupoFila["entidade"], id: e.registro_id, op, campos: e.campos ?? null, dados: e.dados ?? null });
      continue;
    }
    if (op === "delete") {
      Object.assign(atual, { op, campos: null, dados: e.dados ?? null });
    } else if (atual.op === "delete") {
      Object.assign(atual, { op, campos: null, dados: null });
    } else if (atual.campos && e.campos) {
      atual.campos = [...new Set([...atual.campos, ...e.campos])];
    } else {
      atual.campos = null;
    }
  }
  return [...grupos.values()];
}
