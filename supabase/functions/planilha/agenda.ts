// Agenda do Google pelo servidor (spec 2026-10-01-banco-de-leads §6): o mesmo corpo de evento do CRM (crmAgenda.ts),
// com o token da contato@ guardado em google_oauth_tokens e renovado com o refresh token, como em gmn/google.ts.
// deno-lint-ignore-file no-explicit-any
import type { LeadCrm } from "../_shared/crmTipos.ts";
import type { AcaoAgenda } from "../_shared/crmMovimento.ts";
import { corpoConvidar, corpoMoverEvento, corpoNovoEvento, enviaConvite, linkMeetDoEvento } from "../_shared/crmAgenda.ts";
import type { Sb } from "./dados.ts";

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export async function tokenGoogle(sb: Sb): Promise<string> {
  const { data: row, error } = await sb
    .from("google_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row?.refresh_token) throw new Error("Google não conectado (Admin → Google).");
  const expira = new Date(row.expires_at).getTime();
  if (row.access_token && !Number.isNaN(expira) && expira - Date.now() > 120_000) return row.access_token;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) throw new Error(`Google recusou renovar o token (${d.error ?? r.status}).`);
  const novo = new Date(Date.now() + Number(d.expires_in || 3600) * 1000).toISOString();
  await sb.from("google_oauth_tokens")
    .update({ access_token: d.access_token, expires_at: novo, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  return d.access_token;
}

class EventoSumiu extends Error {}

async function gcal(token: string, caminho: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${API}${caminho}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (r.status === 204) return null;
  const d = await r.json().catch(() => ({}));
  if (r.ok) return d;
  if (r.status === 410 && init.method === "DELETE") return null;
  if (r.status === 404 || r.status === 410) throw new EventoSumiu("O evento não existe mais na agenda.");
  throw new Error(d?.error?.message || `Google Agenda respondeu ${r.status}`);
}

const parametros = (enviar: boolean) => `sendUpdates=${enviar ? "all" : "none"}&conferenceDataVersion=1`;

async function criar(token: string, lead: LeadCrm): Promise<Partial<LeadCrm>> {
  const ev = await gcal(token, `?${parametros(enviaConvite(lead))}`, {
    method: "POST",
    body: JSON.stringify(corpoNovoEvento(lead, crypto.randomUUID())),
  });
  return { evento_google_id: ev.id, evento_meet_link: linkMeetDoEvento(ev), evento_status: "ok", evento_erro: null };
}

/**
 * Executa a ação da agenda decidida pelas regras do CRM e devolve o patch do lead. Nunca lança: falha vira
 * `evento_status = 'erro'` (o card do sistema mostra "Evento não criado — Tentar de novo"). Reunião já passada não
 * mexe na agenda.
 */
export async function executarAgendaServidor(
  sb: Sb,
  antes: LeadCrm,
  lead: LeadCrm,
  acao: AcaoAgenda,
  agora: Date,
  emailAntigo: string | null,
): Promise<Partial<LeadCrm>> {
  if (!acao) return {};
  if (acao !== "cancelar" && (!lead.reuniao_em || new Date(lead.reuniao_em).getTime() <= agora.getTime())) return {};
  try {
    const token = await tokenGoogle(sb);
    if (acao === "cancelar") {
      if (!antes.evento_google_id) return {};
      try {
        await gcal(token, `/${encodeURIComponent(antes.evento_google_id)}?sendUpdates=${enviaConvite(antes) ? "all" : "none"}`, { method: "DELETE" });
      } catch (e) {
        if (!(e instanceof EventoSumiu)) throw e;
      }
      return { evento_google_id: null, evento_meet_link: null, evento_status: null, evento_erro: null };
    }
    if (acao === "criar" || !lead.evento_google_id) return await criar(token, lead);
    try {
      const id = encodeURIComponent(lead.evento_google_id);
      const atual = await gcal(token, `/${id}`);
      if (atual?.status === "cancelled") return await criar(token, lead);
      const corpo = acao === "mover"
        ? corpoMoverEvento(lead, atual?.attendees ?? [], emailAntigo)
        : corpoConvidar(lead, atual?.attendees ?? [], emailAntigo);
      const ev = await gcal(token, `/${id}?${parametros(enviaConvite(lead))}`, { method: "PATCH", body: JSON.stringify(corpo) });
      return { evento_meet_link: linkMeetDoEvento(ev) ?? lead.evento_meet_link, evento_status: "ok", evento_erro: null };
    } catch (e) {
      if (e instanceof EventoSumiu) return await criar(token, lead);
      throw e;
    }
  } catch (e: any) {
    return { evento_status: "erro", evento_erro: String(e?.message ?? e) };
  }
}
