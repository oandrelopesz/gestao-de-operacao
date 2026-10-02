// Tentativas de follow-up (prospecção e proposta): teto por coluna, cadência do próximo contato. Sem dependências.
import type { ColunaCrm, LeadCrm, NovoEvento, TipoColuna } from "./crmTipos.ts";
import { tetoDa } from "./crmColunas.ts";
import { diaSPAs } from "./crmFormato.ts";

/** Dias até o próximo contato depois da tentativa N (índice N-1), sempre às 10h. */
export const CADENCIA_DIAS = [1, 2, 2, 3, 3, 4];

export type EscopoTentativa = "prospeccao" | "proposta";

export function escopoDoTipo(tipo: TipoColuna): EscopoTentativa | null {
  if (tipo === "follow_up") return "prospeccao";
  if (tipo === "follow_up_proposta") return "proposta";
  return null;
}

export function ordinal(n: number): string {
  return `${n}ª`;
}

export function proximoContatoApos(n: number, agora: Date): string | null {
  const dias = CADENCIA_DIAS[n - 1];
  return dias === undefined ? null : diaSPAs(agora, dias, 10, 0).toISOString();
}

const feitasNo = (lead: LeadCrm, escopo: EscopoTentativa) =>
  (escopo === "prospeccao" ? lead.follow_up : lead.follow_up_proposta) ?? 0;

const nomeEscopo = (escopo: EscopoTentativa) => (escopo === "prospeccao" ? "follow-up" : "follow-up de proposta");

export interface ResultadoTentativa {
  patch: Partial<LeadCrm>;
  eventos: NovoEvento[];
}

/** Próxima tentativa do escopo da coluna. Devolve a mensagem de erro quando não dá. */
export function registrarTentativa(lead: LeadCrm, coluna: ColunaCrm, agora: Date): ResultadoTentativa | string {
  const escopo = escopoDoTipo(coluna.tipo);
  if (!escopo) return "Esta coluna não conta tentativas.";
  const teto = tetoDa(coluna);
  const atual = feitasNo(lead, escopo);
  if (atual >= teto) return `As ${teto} tentativas acabaram.`;
  const n = atual + 1;
  const patch: Partial<LeadCrm> = escopo === "prospeccao" ? { follow_up: n } : { follow_up_proposta: n };
  patch.proximo_contato_em = n >= teto ? null : proximoContatoApos(n, agora);
  if (!lead.primeiro_contato_em) patch.primeiro_contato_em = agora.toISOString();
  return {
    patch,
    eventos: [{ tipo: "tentativa", descricao: `${ordinal(n)} tentativa de ${nomeEscopo(escopo)}`, dados: { n, escopo } }],
  };
}

/** Entrar numa coluna de follow-up conta a 1ª tentativa se o contador ainda está em zero. */
export function entrarEmFollowUp(lead: LeadCrm, coluna: ColunaCrm, agora: Date): ResultadoTentativa | null {
  const escopo = escopoDoTipo(coluna.tipo);
  if (!escopo || feitasNo(lead, escopo) > 0) return null;
  const r = registrarTentativa(lead, coluna, agora);
  if (typeof r === "string") return null;
  r.eventos[0] = {
    ...r.eventos[0],
    descricao: `${r.eventos[0].descricao} (ao entrar na coluna)`,
    dados: { ...r.eventos[0].dados, ao_entrar: true },
  };
  return r;
}

export interface InfoTentativas {
  escopo: EscopoTentativa;
  feitas: number;
  teto: number;
  noLimite: boolean;
  rotuloBotao: string;
}

export function infoTentativas(lead: LeadCrm, coluna: ColunaCrm): InfoTentativas | null {
  const escopo = escopoDoTipo(coluna.tipo);
  if (!escopo) return null;
  const feitas = feitasNo(lead, escopo);
  const teto = tetoDa(coluna);
  const noLimite = feitas >= teto;
  return { escopo, feitas, teto, noLimite, rotuloBotao: noLimite ? "Limite atingido" : `Registrar ${ordinal(feitas + 1)} tentativa` };
}

/** Fora da coluna de follow-up: "Respondeu na 3ª tentativa de follow-up" / "Parou na 5ª ...". */
export function textoCongelado(lead: LeadCrm, tipoAtual: TipoColuna): string | null {
  if (escopoDoTipo(tipoAtual)) return null;
  const n = lead.follow_up ?? 0;
  if (n <= 0) return null;
  const parou = tipoAtual === "perdido" || tipoAtual === "desqualificado";
  return `${parou ? "Parou" : "Respondeu"} na ${ordinal(n)} tentativa de follow-up`;
}
