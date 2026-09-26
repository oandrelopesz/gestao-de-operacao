// Urgência do card e blocos da Fila do dia. Sem dependências.
import type { ColunaCrm, LeadCrm } from "./crmTipos.ts";
import { colunaInicial, TIPOS_COM_PONTOS, TIPOS_FINAIS } from "./crmColunas.ts";
import { calcularPontos, resumoPontos } from "./crmPontos.ts";
import { formatarDataHora, formatarHora, HORA_MS, mesmoDiaSP } from "./crmFormato.ts";

export type Urgencia = "sem_contato" | "contato_vencido" | "reuniao_proxima" | "em_dia";

export interface InfoUrgencia {
  tipo: Urgencia;
  texto: string;
}

const tipoDaColuna = (colunas: ColunaCrm[], id: string | null) => colunas.find((c) => c.id === id)?.tipo ?? null;

export function urgenciaDoLead(lead: LeadCrm, colunas: ColunaCrm[], agora: Date): InfoUrgencia {
  const tipo = tipoDaColuna(colunas, lead.coluna_id);
  if (tipo && TIPOS_FINAIS.includes(tipo)) return { tipo: "em_dia", texto: "" };
  const inicial = colunaInicial(colunas);
  const naInicial = !lead.coluna_id || lead.coluna_id === inicial?.id;
  if (naInicial && (lead.follow_up ?? 0) === 0 && agora.getTime() - new Date(lead.created_at).getTime() >= 24 * HORA_MS) {
    return { tipo: "sem_contato", texto: "Sem contato há mais de 24 h" };
  }
  if (lead.proximo_contato_em && new Date(lead.proximo_contato_em).getTime() <= agora.getTime()) {
    return { tipo: "contato_vencido", texto: `Contato vencido (${formatarDataHora(lead.proximo_contato_em)})` };
  }
  if (lead.reuniao_em) {
    const falta = new Date(lead.reuniao_em).getTime() - agora.getTime();
    if (falta > 0 && falta <= 24 * HORA_MS) return { tipo: "reuniao_proxima", texto: `Reunião em menos de 24 h (${formatarDataHora(lead.reuniao_em)})` };
  }
  return { tipo: "em_dia", texto: "" };
}

export type BlocoFila = "atrasados" | "pontos_atrasados" | "novos" | "hoje" | "reunioes_hoje" | "reunioes_amanha";

export interface ItemFila {
  lead: LeadCrm;
  motivo: string;
  /** Para ordenar dentro do bloco */
  chave: number;
}

export interface GrupoFila {
  bloco: BlocoFila;
  titulo: string;
  itens: ItemFila[];
}

const TITULOS: Record<BlocoFila, string> = {
  atrasados: "Contatos atrasados",
  pontos_atrasados: "Pontos de contato atrasados",
  novos: "Novos sem contato",
  hoje: "Para hoje",
  reunioes_hoje: "Reuniões de hoje",
  reunioes_amanha: "Reuniões de amanhã",
};
const ORDEM: BlocoFila[] = ["atrasados", "pontos_atrasados", "novos", "hoje", "reunioes_hoje", "reunioes_amanha"];

export function montarFila(leads: LeadCrm[], colunas: ColunaCrm[], agora: Date): GrupoFila[] {
  const grupos = new Map<BlocoFila, ItemFila[]>(ORDEM.map((b) => [b, []]));
  const inicial = colunaInicial(colunas);
  const amanha = new Date(agora.getTime() + 24 * HORA_MS);
  const t = (iso: string) => new Date(iso).getTime();

  for (const lead of leads) {
    const tipo = tipoDaColuna(colunas, lead.coluna_id);
    if (tipo && TIPOS_FINAIS.includes(tipo)) continue;
    const add = (b: BlocoFila, motivo: string, chave: number) => grupos.get(b)!.push({ lead, motivo, chave });

    if (lead.proximo_contato_em && t(lead.proximo_contato_em) <= agora.getTime()) {
      add("atrasados", `Contato era para ${formatarDataHora(lead.proximo_contato_em)}`, t(lead.proximo_contato_em));
      continue;
    }
    if (lead.reuniao_em && tipo && TIPOS_COM_PONTOS.includes(tipo)) {
      const r = resumoPontos(calcularPontos(lead, agora));
      if (r.atrasado) {
        add("pontos_atrasados", `Atrasado: ${r.atrasado.nome}, ${formatarDataHora(r.atrasado.quando)}`, r.atrasado.quando.getTime());
        continue;
      }
    }
    if ((!lead.coluna_id || lead.coluna_id === inicial?.id) && (lead.follow_up ?? 0) === 0) {
      add("novos", `Entrou em ${formatarDataHora(lead.created_at)}`, t(lead.created_at));
      continue;
    }
    if (lead.proximo_contato_em && mesmoDiaSP(new Date(lead.proximo_contato_em), agora)) {
      add("hoje", `Contato hoje às ${formatarHora(lead.proximo_contato_em)}`, t(lead.proximo_contato_em));
      continue;
    }
    if (lead.reuniao_em && t(lead.reuniao_em) >= agora.getTime() - 2 * HORA_MS) {
      if (mesmoDiaSP(new Date(lead.reuniao_em), agora)) {
        add("reunioes_hoje", `Reunião hoje às ${formatarHora(lead.reuniao_em)}`, t(lead.reuniao_em));
        continue;
      }
      if (mesmoDiaSP(new Date(lead.reuniao_em), amanha)) {
        add("reunioes_amanha", `Reunião amanhã às ${formatarHora(lead.reuniao_em)}`, t(lead.reuniao_em));
      }
    }
  }

  return ORDEM.map((bloco) => ({
    bloco,
    titulo: TITULOS[bloco],
    itens: grupos.get(bloco)!.sort((a, b) => a.chave - b.chave),
  }));
}
