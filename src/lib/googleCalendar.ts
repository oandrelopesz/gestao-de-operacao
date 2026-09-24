/**
 * Google Calendar API v3 no navegador, com o mesmo access token do Drive (edge function `google-token`).
 * Sem cópia no banco: o Google é a fonte da verdade.
 */
import { getAccessToken, invalidarTokenGoogle, statusDoDrive } from "@/lib/googleDrive";
import { removerNulos, type EventoGoogle, type Horario } from "@/lib/agendaEvento";

const API = "https://www.googleapis.com/calendar/v3";
const enc = encodeURIComponent;

/** A conexão do Google ainda não tem a permissão da Agenda (reconectar). */
export class AgendaSemPermissaoError extends Error {}
/** O evento mudou no Google depois de aberto (etag diferente). */
export class AgendaConflitoError extends Error {}

async function gcal<T>(path: string, init: RequestInit = {}, repetir = true): Promise<T> {
  const token = await getAccessToken();
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (r.status === 401 && repetir) {
    invalidarTokenGoogle();
    return gcal<T>(path, init, false);
  }
  if (r.status === 204) return undefined as T;
  const data = await r.json().catch(() => ({}));
  if (r.ok) return data as T;
  // Excluir algo que já não existe: o objetivo foi atingido
  if (r.status === 410 && init.method === "DELETE") return undefined as T;
  const msg: string = data?.error?.message ?? "";
  const motivo: string = data?.error?.errors?.[0]?.reason ?? "";
  if (r.status === 403 && (motivo === "insufficientPermissions" || /insufficient authentication scopes/i.test(msg))) {
    throw new AgendaSemPermissaoError("A conexão com o Google ainda não tem permissão para a Agenda.");
  }
  if (r.status === 403 && (motivo === "accessNotConfigured" || /has not been used|is disabled/i.test(msg))) {
    throw new Error("A API do Google Agenda não está ativada no projeto do Google Cloud.");
  }
  if (r.status === 412) {
    throw new AgendaConflitoError("Este evento foi alterado no Google enquanto você editava. A agenda foi recarregada — tente de novo.");
  }
  throw new Error(msg || `Google Agenda respondeu ${r.status}`);
}

export interface AgendaGoogle {
  id: string;
  summary: string;
  summaryOverride?: string;
  backgroundColor: string;
  foregroundColor: string;
  primary?: boolean;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
}

export function podeEscrever(a: AgendaGoogle): boolean {
  return a.accessRole === "owner" || a.accessRole === "writer";
}

/** Dá para editar este evento daqui? (agenda com escrita e evento seu, ou convidado com permissão) */
export function podeEditarEvento(agenda: AgendaGoogle | undefined, evento: EventoGoogle, calendarId: string): boolean {
  if (!agenda || !podeEscrever(agenda)) return false;
  const org = evento.organizer;
  return !org || !!org.self || org.email === calendarId || !!evento.guestsCanModify;
}

export async function listarAgendas(): Promise<AgendaGoogle[]> {
  const todas: AgendaGoogle[] = [];
  let pagina: string | undefined;
  do {
    const q = new URLSearchParams({ maxResults: "250" });
    if (pagina) q.set("pageToken", pagina);
    const d = await gcal<{ items?: AgendaGoogle[]; nextPageToken?: string }>(`/users/me/calendarList?${q}`);
    todas.push(...(d.items ?? []));
    pagina = d.nextPageToken;
  } while (pagina);
  // Principal primeiro; depois as que dá para escrever; depois por nome
  return todas.sort((a, b) =>
    Number(!!b.primary) - Number(!!a.primary)
    || Number(podeEscrever(b)) - Number(podeEscrever(a))
    || (a.summaryOverride ?? a.summary).localeCompare(b.summaryOverride ?? b.summary, "pt-BR"));
}

/** Ocorrências (séries já expandidas) que tocam o período. */
export async function listarEventos(calendarId: string, inicio: Date, fim: Date): Promise<EventoGoogle[]> {
  const eventos: EventoGoogle[] = [];
  let pagina: string | undefined;
  do {
    const q = new URLSearchParams({
      singleEvents: "true", orderBy: "startTime", maxResults: "2500",
      timeMin: inicio.toISOString(), timeMax: fim.toISOString(),
    });
    if (pagina) q.set("pageToken", pagina);
    const d = await gcal<{ items?: EventoGoogle[]; nextPageToken?: string }>(`/calendars/${enc(calendarId)}/events?${q}`);
    eventos.push(...(d.items ?? []));
    pagina = d.nextPageToken;
  } while (pagina);
  return eventos.filter((e) => e.status !== "cancelled");
}

export function obterEvento(calendarId: string, id: string): Promise<EventoGoogle> {
  return gcal<EventoGoogle>(`/calendars/${enc(calendarId)}/events/${enc(id)}`);
}

const params = (enviar: boolean) => `sendUpdates=${enviar ? "all" : "none"}&conferenceDataVersion=1`;

export function criarEvento(calendarId: string, corpo: EventoGoogle, enviar: boolean): Promise<EventoGoogle> {
  return gcal<EventoGoogle>(`/calendars/${enc(calendarId)}/events?${params(enviar)}`, {
    method: "POST",
    body: JSON.stringify(removerNulos(corpo)),
  });
}

export function atualizarEvento(calendarId: string, id: string, corpo: EventoGoogle, enviar: boolean, etag?: string): Promise<EventoGoogle> {
  return gcal<EventoGoogle>(`/calendars/${enc(calendarId)}/events/${enc(id)}?${params(enviar)}`, {
    method: "PATCH",
    headers: etag ? { "If-Match": etag } : {},
    body: JSON.stringify(corpo),
  });
}

export async function excluirEvento(calendarId: string, id: string, enviar: boolean): Promise<void> {
  await gcal<void>(`/calendars/${enc(calendarId)}/events/${enc(id)}?sendUpdates=${enviar ? "all" : "none"}`, { method: "DELETE" });
}

/** Quantas ocorrências da série vêm antes deste horário (inclui as excluídas: o COUNT conta todas). */
export async function contarOcorrenciasAntes(calendarId: string, mestreId: string, horario: Horario): Promise<number> {
  const limite = horario.dateTime ?? `${horario.date}T00:00:00-03:00`;
  let total = 0;
  let pagina: string | undefined;
  do {
    const q = new URLSearchParams({ timeMax: new Date(limite).toISOString(), showDeleted: "true", maxResults: "2500" });
    if (pagina) q.set("pageToken", pagina);
    const d = await gcal<{ items?: unknown[]; nextPageToken?: string }>(
      `/calendars/${enc(calendarId)}/events/${enc(mestreId)}/instances?${q}`,
    );
    total += d.items?.length ?? 0;
    pagina = d.nextPageToken;
  } while (pagina);
  return total;
}

/** A conexão salva já tem a permissão de eventos da Agenda? */
export async function temPermissaoAgenda(): Promise<boolean> {
  const st = await statusDoDrive(true);
  return (st.scope ?? "").split(/\s+/).includes("https://www.googleapis.com/auth/calendar.events");
}
