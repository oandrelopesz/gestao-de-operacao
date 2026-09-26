// O que acontece ao mover um lead: patch, eventos do histórico e a ação da agenda (spec §4). Sem dependências.
import type { ColunaCrm, LeadCrm, MotivoRemarcacao, NovoEvento } from "./crmTipos.ts";
import { emailValido, exigenciaDe, MOTIVOS_REMARCACAO } from "./crmColunas.ts";
import { entrarEmFollowUp } from "./crmTentativas.ts";
import { calcularPontos, periodoDaCall, reiniciarPontos, resumoPontos } from "./crmPontos.ts";
import { formatarDataHora, formatarReais, partesSP } from "./crmFormato.ts";

export interface DadosReuniao {
  em: string;
  duracaoMin: number;
  /** undefined = não mexe no e-mail do lead; null/"" = apaga */
  email?: string | null;
}

export interface DadosJanela {
  reuniao?: DadosReuniao;
  remarcacao?: { motivo: MotivoRemarcacao; nova?: DadosReuniao | null };
  valorProposta?: number | null;
  valorFechamento?: number;
  motivo?: string;
}

export type AcaoAgenda = "criar" | "mover" | "convidar" | "cancelar" | null;

export interface PlanoMovimento {
  patch: Partial<LeadCrm>;
  eventos: NovoEvento[];
  agenda: AcaoAgenda;
}

export function validarReuniao(r?: DadosReuniao | null): string | null {
  if (!r || !r.em || Number.isNaN(new Date(r.em).getTime())) return "Informe a data e a hora da reunião.";
  if (!(r.duracaoMin >= 5 && r.duracaoMin <= 480)) return "Duração inválida.";
  if (r.email && !emailValido(r.email)) return "E-mail inválido.";
  return null;
}

export function validarMovimento(lead: Pick<LeadCrm, "reuniao_em">, destino: ColunaCrm, dados: DadosJanela): string | null {
  switch (exigenciaDe(destino.tipo, lead)) {
    case "reuniao":
      return validarReuniao(dados.reuniao);
    case "remarcacao": {
      const r = dados.remarcacao;
      if (!r) return "Escolha o que aconteceu.";
      if (r.motivo === "pediu_remarcar" && !r.nova) return "Informe a nova data e hora.";
      return r.nova ? validarReuniao(r.nova) : null;
    }
    case "ganho":
      return dados.valorFechamento && dados.valorFechamento > 0 ? null : "Informe o valor fechado (maior que zero).";
    case "motivo":
      return dados.motivo?.trim() ? null : "Escolha o motivo.";
    case "proposta":
      return dados.valorProposta != null && dados.valorProposta < 0 ? "Valor inválido." : null;
    default:
      return null;
  }
}

const mesmoInstante = (a: string | null, b: string | null) =>
  !!a && !!b && new Date(a).getTime() === new Date(b).getTime();

/** Reunião nova ou alterada: campos, marcos, pontos e o que fazer na agenda. */
export function planejarReuniao(lead: LeadCrm, r: DadosReuniao, agora: Date): PlanoMovimento {
  const agoraIso = agora.toISOString();
  const emIso = new Date(r.em).toISOString();
  const mudouData = !mesmoInstante(lead.reuniao_em, emIso);
  const mudouDuracao = (lead.reuniao_duracao_min ?? 30) !== r.duracaoMin;
  const emailNovo = r.email === undefined ? lead.email : r.email?.trim() || null;
  const mudouEmail = (emailNovo ?? null) !== (lead.email ?? null);

  const patch: Partial<LeadCrm> = { reuniao_em: emIso, reuniao_duracao_min: r.duracaoMin };
  if (mudouEmail) patch.email = emailNovo;
  if (mudouData) {
    patch.reuniao_marcada_em = agoraIso;
    patch.pontos_contato = reiniciarPontos(emIso, agora);
  }
  if (!lead.primeira_reuniao_marcada_em) {
    patch.primeira_reuniao_marcada_em = agoraIso;
    patch.follow_ups_ate_reuniao = lead.follow_up ?? 0;
  }

  const eventos: NovoEvento[] = [];
  if (mudouData || mudouDuracao) {
    const verbo = lead.reuniao_em && mudouData ? "Reunião movida para" : "Reunião marcada para";
    eventos.push({
      tipo: "reuniao",
      descricao: `${verbo} ${formatarDataHora(emIso)} (${r.duracaoMin} min)`,
      dados: { em: emIso, duracao_min: r.duracaoMin, anterior: lead.reuniao_em },
    });
  }

  let agenda: AcaoAgenda = null;
  if (!lead.evento_google_id) agenda = "criar";
  else if (mudouData || mudouDuracao) agenda = "mover";
  else if (mudouEmail) agenda = "convidar";
  return { patch, eventos, agenda };
}

function resultadoReuniao(lead: LeadCrm, compareceu: boolean, agora: Date): NovoEvento {
  const em = lead.reuniao_em;
  if (!em) {
    return { tipo: "reuniao_resultado", descricao: compareceu ? "Compareceu à reunião" : "Não compareceu à reunião", dados: { compareceu, reuniao_em: null } };
  }
  const inicio = new Date(em);
  const r = resumoPontos(calcularPontos(lead, agora));
  return {
    tipo: "reuniao_resultado",
    descricao: `${compareceu ? "Compareceu" : "Não compareceu"} à reunião de ${formatarDataHora(em)}`,
    dados: {
      compareceu,
      reuniao_em: em,
      periodo: periodoDaCall(inicio),
      dia_semana: partesSP(inicio).diaSemana,
      pontos_feitos: r.feitos,
      pontos_aplicaveis: r.aplicaveis,
    },
  };
}

/** Reunião saiu do lead: sem evento criado, some também o aviso de erro da agenda. */
function semReuniao(lead: LeadCrm, patch: Partial<LeadCrm>) {
  patch.reuniao_em = null;
  patch.pontos_contato = {};
  if (!lead.evento_google_id) {
    patch.evento_status = null;
    patch.evento_erro = null;
  }
}

const rotuloRemarcacao = (m: MotivoRemarcacao) => MOTIVOS_REMARCACAO.find((x) => x.id === m)?.rotulo ?? m;

/** Plano completo de um movimento de coluna. Assume `validarMovimento` já conferido. */
export function planejarMovimento(
  lead: LeadCrm,
  origem: ColunaCrm | null,
  destino: ColunaCrm,
  dados: DadosJanela,
  agora: Date,
): PlanoMovimento {
  const agoraIso = agora.toISOString();
  let patch: Partial<LeadCrm> = { coluna_id: destino.id, coluna_desde: agoraIso };
  const eventos: NovoEvento[] = [{
    tipo: "mudanca_coluna",
    descricao: `${origem?.titulo ?? "—"} → ${destino.titulo}`,
    dados: { de: origem?.id ?? null, para: destino.id, tipo: destino.tipo },
  }];
  let agenda: AcaoAgenda = null;
  const encerra = destino.tipo === "perdido" || destino.tipo === "desqualificado";
  if (!lead.primeiro_contato_em && !encerra) patch.primeiro_contato_em = agoraIso;

  const atual = (): LeadCrm => ({ ...lead, ...patch });
  const juntar = (p: PlanoMovimento) => {
    patch = { ...patch, ...p.patch };
    eventos.push(...p.eventos);
    if (p.agenda) agenda = p.agenda;
  };

  switch (destino.tipo) {
    case "follow_up":
    case "follow_up_proposta": {
      const r = entrarEmFollowUp(atual(), destino, agora);
      if (r) juntar({ patch: r.patch, eventos: r.eventos, agenda: null });
      break;
    }
    case "reuniao":
      if (dados.reuniao) juntar(planejarReuniao(atual(), dados.reuniao, agora));
      break;
    case "confirmacao":
      if (!lead.reuniao_em && dados.reuniao) juntar(planejarReuniao(atual(), dados.reuniao, agora));
      break;
    case "remarcacao": {
      const r = dados.remarcacao;
      if (!r) break;
      patch.motivo_remarcacao = r.motivo;
      eventos.push({ tipo: "remarcacao", descricao: `Remarcação: ${rotuloRemarcacao(r.motivo)}`, dados: { motivo: r.motivo } });
      if (r.motivo === "no_show") {
        patch.no_shows = (lead.no_shows ?? 0) + 1;
        eventos.push(resultadoReuniao(lead, false, agora));
        if (!r.nova) semReuniao(lead, patch);
      }
      if (r.nova) {
        patch.remarcacoes = (lead.remarcacoes ?? 0) + 1;
        juntar(planejarReuniao(atual(), r.nova, agora));
      }
      break;
    }
    case "realizada":
      patch.compareceu = true;
      if (!lead.primeira_reuniao_realizada_em) patch.primeira_reuniao_realizada_em = agoraIso;
      if (lead.reuniao_em) eventos.push(resultadoReuniao(lead, true, agora));
      break;
    case "proposta":
      if (dados.valorProposta != null) patch.valor_proposta = dados.valorProposta;
      if (!lead.proposta_enviada_em) patch.proposta_enviada_em = agoraIso;
      break;
    case "ganho": {
      const valor = dados.valorFechamento ?? 0;
      patch.valor_fechamento = valor;
      if (!lead.fechado_em) {
        patch.fechado_em = agoraIso;
        patch.follow_ups_ate_fechamento = lead.follow_up_proposta ?? 0;
      }
      eventos.push({ tipo: "ganho", descricao: `Fechado: ${formatarReais(valor)}`, dados: { valor } });
      break;
    }
    case "perdido":
    case "desqualificado": {
      const motivo = (dados.motivo ?? "").trim();
      if (destino.tipo === "perdido") {
        patch.motivo_perda = motivo;
        patch.perdido_em = agoraIso;
        eventos.push({ tipo: "perda", descricao: `Perdido: ${motivo}`, dados: { motivo } });
      } else {
        patch.motivo_desqualificacao = motivo;
        patch.desqualificado_em = agoraIso;
        eventos.push({ tipo: "desqualificacao", descricao: `Desqualificado: ${motivo}`, dados: { motivo } });
      }
      if (lead.reuniao_em && new Date(lead.reuniao_em).getTime() > agora.getTime()) {
        semReuniao(lead, patch);
        if (lead.evento_google_id) agenda = "cancelar";
      }
      break;
    }
    default:
      break;
  }
  return { patch, eventos, agenda };
}
