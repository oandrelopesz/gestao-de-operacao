// Aba CRM da planilha como espelho editável do CRM do sistema (spec 2026-10-01-banco-de-leads §5.2 a §5.5 e §9).
// Monta a linha de cada lead, lê o que foi editado e decide o que fazer com as regras do próprio CRM.
// Sem dependências além das libs puras do CRM (roda no `node --test` e no Deno).
import type { ColunaCrm, LeadCrm, MotivoRemarcacao, NovoEvento, TipoColuna } from "./crmTipos.ts";
import {
  emailValido,
  exigenciaDe,
  FAIXAS_FATURAMENTO,
  MOTIVOS_REMARCACAO,
  motivosDa,
  ordenarColunas,
  rotuloFaixa,
  type Exigencia,
} from "./crmColunas.ts";
import { deSP, formatarData, formatarHora, formatarReais, partesSP } from "./crmFormato.ts";
import {
  planejarMovimento,
  planejarReuniao,
  validarMovimento,
  type AcaoAgenda,
  type DadosJanela,
  type DadosReuniao,
} from "./crmMovimento.ts";
import { registrarTentativa } from "./crmTentativas.ts";
import { reiniciarPontos } from "./crmPontos.ts";
import { faixaDoFaturamento, normalizar, TITULO_ID } from "./bancoLeads.ts";

export const COLUNAS_PLANILHA_CRM = [
  "Lead", "Empresa", "Telefone", "E-mail", "Instagram", "Aba de origem", "Etapa", "Na etapa desde", "Tentativas",
  "Tentativas da proposta", "Próximo contato", "Reunião (data)", "Reunião (hora)", "Duração (min)", "Link do Meet",
  "Situação", "Valor da proposta", "Valor fechado", "Motivo", "Orgânico/Pago", "Nicho", "Cidade", "Faturamento",
  "Observações", "Entrou no CRM", "ID (sistema)",
] as const;
export type TituloCrm = (typeof COLUNAS_PLANILHA_CRM)[number];

/** Colunas que o sistema preenche: editar na planilha não muda nada (a célula volta). */
export const SO_LEITURA: readonly TituloCrm[] = [
  "Aba de origem", "Na etapa desde", "Link do Meet", "Situação", "Entrou no CRM", "ID (sistema)",
];

/** Colunas da "CRM - lixeira": as mesmas, sem o ID. */
export const COLUNAS_LIXEIRA: TituloCrm[] = COLUNAS_PLANILHA_CRM.filter((t) => t !== "ID (sistema)");

/** Valores de uma linha por título de coluna. */
export type LinhaCrm = Record<string, string>;

export interface OrigemLead {
  abaNome: string;
  faturamentoTexto: string | null;
}

export interface PendenciaCrm {
  etapa_id: string;
  falta: string;
}

export const MOTIVO_MIGRACAO = "Outro: registrado no CRM antigo da planilha";

const dois = (n: number) => String(n).padStart(2, "0");

/** "01/10/2026 14:30" (fuso de São Paulo); vazio sem data. */
export function dataHoraPlanilha(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = partesSP(new Date(iso));
  return `${dois(p.dia)}/${dois(p.mes)}/${p.ano} ${dois(p.hora)}:${dois(p.minuto)}`;
}

const reais = (v: number | null | undefined) => (v == null ? "" : formatarReais(v));

export function rotuloRemarcacao(id: string | null | undefined): string {
  return MOTIVOS_REMARCACAO.find((m) => m.id === id)?.rotulo ?? (id ?? "");
}

export function motivoRemarcacaoDoTexto(t: string | null | undefined): MotivoRemarcacao | null {
  const s = normalizar(t);
  if (!s) return null;
  if (s.startsWith("nao compareceu") || s.includes("no-show") || s.includes("no show")) return "no_show";
  if (s.startsWith("nao confirmou")) return "nao_confirmou";
  if (s.startsWith("pediu")) return "pediu_remarcar";
  return null;
}

/** Motivos oferecidos na coluna Motivo para a etapa (lista vazia = etapa sem motivo). */
export function motivosDaEtapa(coluna: Pick<ColunaCrm, "tipo" | "config"> | null | undefined): string[] {
  if (!coluna) return [];
  if (coluna.tipo === "remarcacao") return MOTIVOS_REMARCACAO.map((m) => m.rotulo);
  return motivosDa(coluna);
}

function motivoDoLead(lead: LeadCrm, tipo: TipoColuna | null): string {
  if (tipo === "perdido") return lead.motivo_perda ?? "";
  if (tipo === "desqualificado") return lead.motivo_desqualificacao ?? "";
  if (tipo === "remarcacao") return rotuloRemarcacao(lead.motivo_remarcacao);
  return "";
}

function situacao(lead: LeadCrm, colunas: ColunaCrm[], pendencia: PendenciaCrm | null): string {
  if (pendencia) {
    const atual = colunas.find((c) => c.id === lead.coluna_id)?.titulo ?? "nenhuma etapa";
    return `Falta preencher: ${pendencia.falta}; no sistema o lead continua em ${atual}`;
  }
  if (lead.evento_status === "erro") return `Evento não criado: ${lead.evento_erro ?? "erro desconhecido"}`;
  if (lead.evento_status === "ok" && lead.evento_google_id && lead.reuniao_em) return "Evento criado";
  return "";
}

/** Texto de cada célula da linha do lead na aba CRM. */
export function linhaCrm(lead: LeadCrm, colunas: ColunaCrm[], origem: OrigemLead | null, pendencia: PendenciaCrm | null): LinhaCrm {
  const coluna = colunas.find((c) => c.id === lead.coluna_id) ?? null;
  const desejada = pendencia ? colunas.find((c) => c.id === pendencia.etapa_id) ?? null : null;
  const reuniao = lead.reuniao_em;
  return {
    "Lead": lead.nome ?? "",
    "Empresa": lead.empresa ?? "",
    "Telefone": lead.telefone ?? "",
    "E-mail": lead.email ?? "",
    "Instagram": lead.instagram ?? "",
    "Aba de origem": origem?.abaNome ?? "Sistema",
    "Etapa": (desejada ?? coluna)?.titulo ?? "",
    "Na etapa desde": dataHoraPlanilha(lead.coluna_desde),
    "Tentativas": String(lead.follow_up ?? 0),
    "Tentativas da proposta": String(lead.follow_up_proposta ?? 0),
    "Próximo contato": dataHoraPlanilha(lead.proximo_contato_em),
    "Reunião (data)": reuniao ? formatarData(reuniao) : "",
    "Reunião (hora)": reuniao ? formatarHora(reuniao) : "",
    "Duração (min)": reuniao ? String(lead.reuniao_duracao_min ?? 30) : "",
    "Link do Meet": lead.evento_meet_link ?? "",
    "Situação": situacao(lead, colunas, pendencia),
    "Valor da proposta": reais(lead.valor_proposta),
    "Valor fechado": reais(lead.valor_fechamento),
    "Motivo": motivoDoLead(lead, coluna?.tipo ?? null),
    "Orgânico/Pago": lead.trafego === "pago" ? "Pago" : "Orgânico",
    "Nicho": lead.nicho ?? "",
    "Cidade": lead.cidade ?? "",
    "Faturamento": origem?.faturamentoTexto || (lead.faturamento_faixa ? rotuloFaixa(FAIXAS_FATURAMENTO, lead.faturamento_faixa) : ""),
    "Observações": lead.observacoes ?? "",
    "Entrou no CRM": lead.created_at ? formatarData(lead.created_at) : "",
    [TITULO_ID]: lead.id,
  };
}

export interface CorLinha {
  fundo: string;
  texto: string;
}

const VERDE: CorLinha = { fundo: "#d9ead3", texto: "#274e13" };
const VERMELHO: CorLinha = { fundo: "#f4cccc", texto: "#990000" };
const AMARELO: CorLinha = { fundo: "#fff2cc", texto: "#7f6000" };
const AMBAR: CorLinha = { fundo: "#fce5cd", texto: "#783f04" };

/** Cor da linha na aba CRM (as mesmas da planilha antiga, mais âmbar para "falta preencher"). */
export function corDaLinhaCrm(tipo: TipoColuna | null, pendente: boolean): CorLinha | null {
  if (pendente) return AMBAR;
  if (tipo === "ganho") return VERDE;
  if (tipo === "perdido" || tipo === "desqualificado") return VERMELHO;
  if (tipo === "reuniao" || tipo === "confirmacao" || tipo === "remarcacao") return AMARELO;
  return null;
}

export function lerData(t: string | null | undefined): { ano: number; mes: number; dia: number } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(t ?? "").trim());
  if (!m) return null;
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mes = Number(m[2]);
  const dia = Number(m[1]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { ano, mes, dia };
}

export function lerHora(t: string | null | undefined): { hora: number; minuto: number } | null {
  const m = /^(\d{1,2})(?::(\d{2})(?::\d{2})?|h(\d{2})?)?$/.exec(String(t ?? "").trim().toLowerCase());
  if (!m) return null;
  const hora = Number(m[1]);
  const minuto = Number(m[2] ?? m[3] ?? 0);
  if (hora > 23 || minuto > 59) return null;
  return { hora, minuto };
}

export function isoDeDataHora(data: string, hora: string): string | null {
  const d = lerData(data);
  const h = lerHora(hora);
  if (!d || !h) return null;
  return deSP(d.ano, d.mes, d.dia, h.hora, h.minuto).toISOString();
}

/** "dd/mm/aaaa hh:mm" (ou só a data, às 10:00). */
export function lerDataHora(t: string | null | undefined): string | null {
  const m = /^(\S+)(?:\s+(\S+))?$/.exec(String(t ?? "").trim());
  if (!m) return null;
  return isoDeDataHora(m[1], m[2] ?? "10:00");
}

/** "R$ 1.500,00", "1500", "1.500" → número; vazio → null; ilegível → undefined. */
export function lerReais(t: string | null | undefined): number | null | undefined {
  let s = String(t ?? "").replace(/R\$/i, "").replace(/\s/g, "");
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+(,\d{1,2})?$/.test(s)) s = s.replace(",", ".");
  else if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return undefined;
  const v = Number(s);
  return Number.isFinite(v) ? v : undefined;
}

/** "3" → 3; vazio → null; ilegível → undefined. */
export function lerInteiro(t: string | null | undefined): number | null | undefined {
  const s = String(t ?? "").trim();
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : undefined;
}

export interface Interpretacao {
  patch: Partial<LeadCrm>;
  eventos: NovoEvento[];
  agenda: AcaoAgenda;
  /** E-mail antes da edição (para trocar o convidado no evento) */
  emailAntigo: string | null;
  /** Pendência nova, "apagar" a que havia, ou null (nada muda) */
  pendencia: PendenciaCrm | "apagar" | null;
  /** Colunas que voltam ao valor do sistema */
  reverter: string[];
  avisos: string[];
  /** Texto novo de Faturamento (a edge function decide onde gravar) */
  faturamento?: string;
}

const CAMPOS_TEXTO: [TituloCrm, "empresa" | "telefone" | "instagram" | "nicho" | "cidade" | "observacoes"][] = [
  ["Empresa", "empresa"],
  ["Telefone", "telefone"],
  ["Instagram", "instagram"],
  ["Nicho", "nicho"],
  ["Cidade", "cidade"],
  ["Observações", "observacoes"],
];

function faltaDe(exig: Exigencia, dados: DadosJanela): string {
  switch (exig) {
    case "reuniao":
      return "data e hora da reunião";
    case "remarcacao":
      return dados.remarcacao ? "a nova data e hora da reunião" : "o motivo (Não compareceu, Não confirmou ou Pediu para remarcar)";
    case "ganho":
      return "o valor fechado";
    case "motivo":
      return "o motivo";
    case "proposta":
      return "um valor de proposta válido";
    default:
      return "os dados da etapa";
  }
}

const mesmoInstante = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && new Date(a).getTime() === new Date(b).getTime();

/**
 * O que fazer com a linha editada na aba CRM (spec §5.4). `linha` traz todas as colunas como estão na planilha;
 * compara com a linha que o sistema escreveria e aplica as regras do CRM na ordem: campos simples, etapa,
 * reunião, tentativas, motivo e convite.
 */
export function interpretarLinhaCrm(
  lead: LeadCrm,
  colunas: ColunaCrm[],
  linha: LinhaCrm,
  origem: OrigemLead | null,
  pendencia: PendenciaCrm | null,
  agora: Date,
): Interpretacao {
  const ord = ordenarColunas(colunas);
  const atual = linhaCrm(lead, ord, origem, pendencia);
  const txt = (t: string) => String(linha[t] ?? "").trim();
  const mudou = (t: string) => t in linha && txt(t) !== String(atual[t] ?? "").trim();
  const r: Interpretacao = {
    patch: {}, eventos: [], agenda: null, emailAntigo: lead.email ?? null, pendencia: null, reverter: [], avisos: [],
  };
  let trabalho: LeadCrm = { ...lead };
  const aplicar = (patch: Partial<LeadCrm>, eventos: NovoEvento[], agenda?: AcaoAgenda) => {
    Object.assign(r.patch, patch);
    trabalho = { ...trabalho, ...patch };
    r.eventos.push(...eventos);
    if (agenda) r.agenda = agenda;
  };
  const voltar = (t: string, aviso?: string) => {
    if (!r.reverter.includes(t)) r.reverter.push(t);
    if (aviso && !r.avisos.includes(aviso)) r.avisos.push(aviso);
  };

  for (const t of SO_LEITURA) if (mudou(t)) voltar(t);

  // 1. Campos simples
  const simples: Partial<LeadCrm> = {};
  const editados: string[] = [];
  if (mudou("Lead")) {
    if (txt("Lead")) {
      simples.nome = txt("Lead");
      editados.push("Nome");
    } else voltar("Lead", "O nome do lead não pode ficar vazio.");
  }
  for (const [t, campo] of CAMPOS_TEXTO) {
    if (!mudou(t)) continue;
    simples[campo] = txt(t) || null;
    editados.push(t);
  }
  let emailMudou = false;
  if (mudou("E-mail")) {
    const e = txt("E-mail");
    if (e && !emailValido(e)) voltar("E-mail", "E-mail inválido.");
    else {
      simples.email = e || null;
      editados.push("E-mail");
      emailMudou = true;
    }
  }
  if (mudou("Orgânico/Pago")) {
    const v = normalizar(txt("Orgânico/Pago"));
    if (v === "pago" || v === "organico" || v === "") {
      simples.trafego = v === "pago" ? "pago" : "organico";
      editados.push("Orgânico/Pago");
    } else voltar("Orgânico/Pago", "Use Orgânico ou Pago.");
  }
  if (mudou("Próximo contato")) {
    const t = txt("Próximo contato");
    const iso = t ? lerDataHora(t) : null;
    if (t && !iso) voltar("Próximo contato", "Próximo contato: use dd/mm/aaaa hh:mm.");
    else {
      simples.proximo_contato_em = iso;
      editados.push("Próximo contato");
    }
  }
  for (const [t, campo] of [["Valor da proposta", "valor_proposta"], ["Valor fechado", "valor_fechamento"]] as const) {
    if (!mudou(t)) continue;
    const v = lerReais(txt(t));
    if (v === undefined) voltar(t, `${t}: use um valor como 1.500,00.`);
    else {
      simples[campo] = v;
      editados.push(t);
    }
  }
  if (mudou("Faturamento")) r.faturamento = txt("Faturamento");
  if (editados.length) {
    aplicar(simples, [{ tipo: "edicao", descricao: `Editado: ${editados.join(", ")}`, dados: { campos: editados } }]);
  }

  // 2. Reunião escrita na linha
  const dataTxt = txt("Reunião (data)");
  const horaTxt = txt("Reunião (hora)");
  const durTxt = txt("Duração (min)");
  const reuniaoMudou = mudou("Reunião (data)") || mudou("Reunião (hora)") || mudou("Duração (min)");
  let duracao = lead.reuniao_duracao_min ?? 30;
  if (durTxt) {
    const d = lerInteiro(durTxt);
    if (d == null || d < 5 || d > 480) {
      if (mudou("Duração (min)")) voltar("Duração (min)", "Duração: minutos entre 5 e 480.");
    } else duracao = d;
  }
  const emLinha = dataTxt && horaTxt ? isoDeDataHora(dataTxt, horaTxt) : null;
  if (dataTxt && horaTxt && !emLinha && reuniaoMudou) {
    voltar("Reunião (data)");
    voltar("Reunião (hora)", "Reunião: data dd/mm/aaaa e hora hh:mm.");
  }
  const reuniaoDaLinha: DadosReuniao | null = emLinha ? { em: emLinha, duracaoMin: duracao } : null;

  // 3. Etapa
  const origemCol = ord.find((c) => c.id === lead.coluna_id) ?? null;
  const tituloEtapa = txt("Etapa");
  const destino = ord.find((c) => normalizar(c.titulo) === normalizar(tituloEtapa)) ?? null;
  let movimentou = false;
  if (!destino) {
    if (mudou("Etapa")) {
      voltar("Etapa", tituloEtapa ? `A etapa "${tituloEtapa}" não existe: escolha uma da lista.` : "A etapa não pode ficar vazia.");
    }
    if (pendencia && mudou("Etapa")) r.pendencia = "apagar";
  } else if (destino.id !== lead.coluna_id) {
    const exig = exigenciaDe(destino.tipo, trabalho);
    const dados: DadosJanela = {};
    if (exig === "reuniao" && reuniaoDaLinha) dados.reuniao = reuniaoDaLinha;
    if (exig === "remarcacao") {
      const motivo = motivoRemarcacaoDoTexto(txt("Motivo"));
      if (motivo) {
        const nova = reuniaoDaLinha && !mesmoInstante(reuniaoDaLinha.em, trabalho.reuniao_em) ? reuniaoDaLinha : null;
        dados.remarcacao = { motivo, nova };
      }
    }
    if (exig === "proposta") {
      const v = lerReais(txt("Valor da proposta"));
      if (v !== undefined) dados.valorProposta = v;
    }
    if (exig === "ganho") {
      const v = lerReais(txt("Valor fechado"));
      if (v) dados.valorFechamento = v;
    }
    if (exig === "motivo" && txt("Motivo")) dados.motivo = txt("Motivo");
    const erro = validarMovimento(trabalho, destino, dados);
    if (erro) r.pendencia = { etapa_id: destino.id, falta: faltaDe(exig, dados) };
    else {
      const plano = planejarMovimento(trabalho, origemCol, destino, dados, agora);
      aplicar(plano.patch, plano.eventos, plano.agenda);
      movimentou = true;
      if (pendencia) r.pendencia = "apagar";
    }
  } else if (pendencia) r.pendencia = "apagar";
  const pendente = r.pendencia !== null && r.pendencia !== "apagar";

  // 4. Reunião mudada sem trocar de etapa (como o campo de reunião da ficha)
  if (!movimentou && !pendente && reuniaoMudou) {
    if (reuniaoDaLinha) {
      const diferente = !mesmoInstante(reuniaoDaLinha.em, trabalho.reuniao_em)
        || reuniaoDaLinha.duracaoMin !== (trabalho.reuniao_duracao_min ?? 30);
      if (diferente) {
        const p = planejarReuniao(trabalho, reuniaoDaLinha, agora);
        aplicar(p.patch, p.eventos, p.agenda);
      }
    } else if (!dataTxt && !horaTxt && trabalho.reuniao_em) {
      voltar("Reunião (data)");
      voltar("Reunião (hora)", "Para desmarcar a reunião, mude a Etapa (Remarcar reunião, Lead perdido…).");
    }
    // Só a data ou só a hora: espera a outra.
  }

  // 5. Tentativas (só aumentam, na etapa certa)
  const contadores = [
    ["Tentativas", "follow_up", "follow_up", "de follow-up"],
    ["Tentativas da proposta", "follow_up_proposta", "follow_up_proposta", "de follow-up de proposta"],
  ] as const;
  for (const [t, campo, tipo, nomeTipo] of contadores) {
    if (!mudou(t)) continue;
    const n = lerInteiro(txt(t));
    const coluna = ord.find((c) => c.id === trabalho.coluna_id) ?? null;
    const feitas = trabalho[campo] ?? 0;
    if (n == null) {
      voltar(t, `${t}: use um número.`);
      continue;
    }
    if (!coluna || coluna.tipo !== tipo) {
      voltar(t, `${t} só contam quando a etapa é ${nomeTipo}.`);
      continue;
    }
    if (n < feitas) {
      voltar(t, `${t} só aumentam pela planilha; para corrigir, use o sistema.`);
      continue;
    }
    for (let i = feitas; i < n; i++) {
      const res = registrarTentativa(trabalho, coluna, agora);
      if (typeof res === "string") {
        voltar(t, res);
        break;
      }
      aplicar(res.patch, res.eventos);
    }
  }

  // 6. Motivo sem trocar de etapa
  if (!movimentou && !pendente && mudou("Motivo") && destino && destino.id === lead.coluna_id) {
    const tipo = origemCol?.tipo;
    const m = txt("Motivo");
    const evento = (descricao: string): NovoEvento[] => [{ tipo: "edicao", descricao, dados: { campos: ["Motivo"] } }];
    const remarcacao = motivoRemarcacaoDoTexto(m);
    if ((tipo === "perdido" || tipo === "desqualificado") && !m) voltar("Motivo", "O motivo não pode ficar vazio.");
    else if (tipo === "perdido") aplicar({ motivo_perda: m }, evento(`Motivo da perda: ${m}`));
    else if (tipo === "desqualificado") aplicar({ motivo_desqualificacao: m }, evento(`Motivo da desqualificação: ${m}`));
    else if (tipo === "remarcacao" && remarcacao) aplicar({ motivo_remarcacao: remarcacao }, evento(`Motivo da remarcação: ${rotuloRemarcacao(remarcacao)}`));
    else voltar("Motivo", "O Motivo só vale nas etapas Lead perdido, Lead desqualificado e Remarcar reunião: escolha a Etapa primeiro.");
  }

  // 7. E-mail novo com reunião futura: convite para o e-mail novo
  if (
    emailMudou && !r.agenda && trabalho.evento_google_id && trabalho.reuniao_em
    && new Date(trabalho.reuniao_em).getTime() > agora.getTime()
  ) r.agenda = "convidar";

  return r;
}

export interface EventoMigrado extends NovoEvento {
  /** Quando aconteceu (vai para `created_at` do histórico) */
  em: string;
}

export interface Migracao {
  campos: Partial<LeadCrm>;
  eventos: EventoMigrado[];
}

/** Lead da aba CRM antiga (colunas Sim/Não) → lead do CRM do sistema (spec §9). */
export function migrarLinhaAntiga(l: Record<string, string>, colunas: ColunaCrm[], agora: Date): Migracao | null {
  const v = (t: string) => String(l[t] ?? "").trim();
  const nome = v("Lead") || v("Empresa");
  if (!nome) return null;
  const sim = (t: string) => normalizar(v(t)) === "sim";
  const ord = ordenarColunas(colunas);
  const col = (id: string) => ord.find((c) => c.id === id) ?? null;
  const agoraIso = agora.toISOString();
  const as10h = (t: string) => {
    const d = lerData(t);
    return d ? deSP(d.ano, d.mes, d.dia, 10, 0).toISOString() : null;
  };
  const entrada = as10h(v("Data 1ª mensagem")) ?? agoraIso;
  let fups = 0;
  for (let n = 1; n <= 7; n++) if (sim(`Follow Up ${n}`)) fups = n;

  const extra: Partial<LeadCrm> = {};
  let coluna: ColunaCrm | null;
  if (sim("Lead Fechado")) {
    coluna = col("fechamento");
    extra.fechado_em = agoraIso;
    extra.follow_ups_ate_fechamento = 0;
  } else if (sim("Lead Perdido")) {
    coluna = col("perdido");
    extra.motivo_perda = MOTIVO_MIGRACAO;
    extra.perdido_em = agoraIso;
  } else if (sim("Reunião Agendada")) {
    coluna = col("reuniao_marcada");
    const d = lerData(v("Data da reunião"));
    const h = lerHora(v("Hora da reunião")) ?? { hora: 10, minuto: 0 };
    if (d) {
      const em = deSP(d.ano, d.mes, d.dia, h.hora, h.minuto).toISOString();
      Object.assign(extra, {
        reuniao_em: em,
        reuniao_duracao_min: 30,
        reuniao_marcada_em: agoraIso,
        primeira_reuniao_marcada_em: agoraIso,
        follow_ups_ate_reuniao: fups,
        pontos_contato: reiniciarPontos(em, agora),
      });
    }
  } else if (sim("Desenvolvendo conversa")) coluna = col("desenvolvendo");
  else if (sim("Lead respondeu")) coluna = col("respondeu");
  else if (fups > 0) coluna = col("follow_up");
  else coluna = col("primeiro_contato");
  coluna ??= ord[0] ?? null;
  if (!coluna) return null;

  const eventos: EventoMigrado[] = [{
    tipo: "criacao",
    descricao: `Importado do CRM antigo da planilha (${coluna.titulo})`,
    dados: { origem: "crm_antigo" },
    em: entrada,
  }];
  for (let n = 1; n <= 7; n++) {
    if (!sim(`Follow Up ${n}`)) continue;
    eventos.push({
      tipo: "tentativa",
      descricao: `${n}ª tentativa de follow-up`,
      dados: { n, escopo: "prospeccao" },
      em: as10h(v(`Data FUP ${n}`)) ?? entrada,
    });
  }

  return {
    campos: {
      nome,
      empresa: v("Empresa") || null,
      telefone: v("Telefone") || null,
      instagram: v("Instagram") || null,
      nicho: v("Nicho") || null,
      observacoes: v("Observações") || null,
      faturamento_faixa: faixaDoFaturamento(v("Faturamento mensal")),
      trafego: "organico",
      coluna_id: coluna.id,
      coluna_desde: entrada,
      primeiro_contato_em: entrada,
      created_at: entrada,
      follow_up: fups,
      ...extra,
    },
    eventos,
  };
}
