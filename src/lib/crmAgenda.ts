// Evento do Google Agenda de uma reunião do CRM (spec §7). Sem dependências: o envio fica em crmDados.ts.
import type { LeadCrm, TipoColuna } from "./crmTipos.ts";
import type { AcaoAgenda } from "./crmMovimento.ts";
import { emailValido, TIPOS_FINAIS } from "./crmColunas.ts";

export const FUSO_CRM = "America/Sao_Paulo";
export const LEMBRETES_MINUTOS = [60, 30, 10];
/** O lead vê o evento: nada interno do CRM entra aqui. */
export const DESCRICAO_REUNIAO = "Reunião com André Lopes — Estrategista digital.\nO link do Google Meet está neste convite.";

export function tituloReuniao(lead: Pick<LeadCrm, "nome" | "empresa">): string {
  const empresa = lead.empresa?.trim();
  return `Reunião — ${lead.nome.trim()}${empresa ? ` (${empresa})` : ""} · André Lopes`;
}

type LeadAgenda = Pick<LeadCrm, "id" | "nome" | "empresa" | "email" | "reuniao_em" | "reuniao_duracao_min">;

export interface CorpoEventoCrm {
  summary?: string;
  description?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  attendees?: { email: string }[];
  conferenceData?: { createRequest: { requestId: string; conferenceSolutionKey: { type: "hangoutsMeet" } } };
  reminders?: { useDefault: boolean; overrides: { method: "popup"; minutes: number }[] };
  extendedProperties?: { private: Record<string, string> };
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function convidadosDo(lead: Pick<LeadCrm, "email">): { email: string }[] {
  const e = norm(lead.email);
  return e && emailValido(e) ? [{ email: e }] : [];
}

export function enviaConvite(lead: Pick<LeadCrm, "email">): boolean {
  return convidadosDo(lead).length > 0;
}

function horario(lead: LeadAgenda) {
  if (!lead.reuniao_em) throw new Error("Lead sem reunião marcada");
  const inicio = new Date(lead.reuniao_em);
  const fim = new Date(inicio.getTime() + (lead.reuniao_duracao_min ?? 30) * 60_000);
  return {
    start: { dateTime: inicio.toISOString(), timeZone: FUSO_CRM },
    end: { dateTime: fim.toISOString(), timeZone: FUSO_CRM },
  };
}

export function corpoNovoEvento(lead: LeadAgenda, requestId: string): CorpoEventoCrm {
  const attendees = convidadosDo(lead);
  return {
    summary: tituloReuniao(lead),
    description: DESCRICAO_REUNIAO,
    ...horario(lead),
    ...(attendees.length ? { attendees } : {}),
    conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
    reminders: { useDefault: false, overrides: LEMBRETES_MINUTOS.map((minutes) => ({ method: "popup" as const, minutes })) },
    extendedProperties: { private: { crm_lead_id: lead.id } },
  };
}

/** Convidados do evento: mantém os outros, troca o e-mail antigo do lead pelo atual, sem repetir. */
export function mesclarConvidados(
  emailNovo: string | null,
  atuais: { email?: string; self?: boolean }[],
  emailAntigo: string | null,
): { email: string }[] {
  const antigo = norm(emailAntigo);
  const novo = norm(emailNovo);
  const lista = atuais
    .filter((a) => a.email && !a.self && norm(a.email) !== antigo && norm(a.email) !== novo)
    .map((a) => ({ email: norm(a.email) }));
  if (novo && emailValido(novo)) lista.push({ email: novo });
  return lista;
}

export function corpoMoverEvento(lead: LeadAgenda, atuais: { email?: string; self?: boolean }[], emailAntigo: string | null): CorpoEventoCrm {
  return { summary: tituloReuniao(lead), ...horario(lead), attendees: mesclarConvidados(lead.email, atuais, emailAntigo) };
}

export function corpoConvidar(lead: LeadAgenda, atuais: { email?: string; self?: boolean }[], emailAntigo: string | null): CorpoEventoCrm {
  return { attendees: mesclarConvidados(lead.email, atuais, emailAntigo) };
}

export function linkMeetDoEvento(ev: {
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] } | null;
}): string | null {
  const ehMeet = (u?: string) => typeof u === "string" && /^https:\/\/meet\.google\.com\//i.test(u);
  if (ehMeet(ev.hangoutLink)) return ev.hangoutLink!;
  const video = (ev.conferenceData?.entryPoints ?? []).find((p) => p.entryPointType === "video" && ehMeet(p.uri));
  return video?.uri ?? null;
}

/** O que o botão "tentar de novo" deve refazer, pelo estado atual do lead. */
export function acaoPendente(lead: Pick<LeadCrm, "reuniao_em" | "evento_google_id">, tipoColuna: TipoColuna): AcaoAgenda {
  if (lead.reuniao_em) return lead.evento_google_id ? "mover" : "criar";
  if (lead.evento_google_id && TIPOS_FINAIS.includes(tipoColuna)) return "cancelar";
  return null;
}
