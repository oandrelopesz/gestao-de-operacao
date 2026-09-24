// Evento do Google Calendar ⇄ formulário da Agenda. Sem dependências (roda no `node --test`).
import {
  deRRule, diferencaDias, identificarPreset, paraRRule, regraDoPreset, somarDias, type Recorrencia,
} from "./recorrencia.ts";

export const FUSO = "America/Sao_Paulo";
export const MAX_LEMBRETES = 5;
/** O Google aceita notificação até 4 semanas antes. */
export const MAX_MINUTOS_LEMBRETE = 40_320;

export type Unidade = "minutos" | "horas" | "dias" | "semanas";
export const FATOR_UNIDADE: Record<Unidade, number> = { minutos: 1, horas: 60, dias: 1440, semanas: 10_080 };

export type MetodoLembrete = "popup" | "email";
/** `unidade` é só da tela (como a pessoa digitou); o Google recebe minutos. */
export interface Lembrete { metodo: MetodoLembrete; minutos: number; unidade?: Unidade }
export const LEMBRETE_PADRAO: Lembrete = { metodo: "popup", minutos: 10 };

export interface Horario { date?: string | null; dateTime?: string | null; timeZone?: string | null }
export interface Participante {
  email: string; responseStatus?: string; self?: boolean; organizer?: boolean; displayName?: string; optional?: boolean;
}
export interface EventoGoogle {
  id?: string;
  etag?: string;
  status?: string;
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: Horario;
  end?: Horario;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: Horario;
  attendees?: Participante[];
  organizer?: { email?: string; self?: boolean };
  guestsCanModify?: boolean;
  hangoutLink?: string;
  conferenceData?: Record<string, unknown> | null;
  reminders?: { useDefault: boolean; overrides?: { method: MetodoLembrete; minutes: number }[] };
}

export interface FormEvento {
  titulo: string;
  calendarId: string;
  diaInteiro: boolean;
  inicioData: string; // YYYY-MM-DD
  inicioHora: string; // HH:mm
  fimData: string; // último dia (inclusivo) no dia inteiro
  fimHora: string;
  recorrencia: Recorrencia | null;
  /** RRULE que o formulário não sabe editar: volta intacta para o Google. */
  regraOriginal: string | null;
  /** EXDATE/RDATE da série, preservadas. */
  outrasLinhas: string[];
  participantes: string[];
  meet: boolean;
  linkMeet: string | null;
  lembretesPadrao: boolean;
  lembretes: Lembrete[];
  descricao: string;
  local: string;
}

const dois = (n: number) => String(n).padStart(2, "0");
/** Date → "YYYY-MM-DD" no fuso do navegador (o sistema é usado em Brasília). */
export function dataLocal(d: Date): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}
export function horaLocal(d: Date): string {
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}
/** Dia (YYYY-MM-DD) de um horário do Google. */
export function dataDe(h: Horario): string {
  return h.date ? h.date : dataLocal(new Date(h.dateTime as string));
}

// Minutos desde 2000-01-01 00:00 (sem fuso: só para somar durações)
function minutosAbs(data: string, hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return diferencaDias("2000-01-01", data) * 1440 + h * 60 + m;
}
function deMinutosAbs(n: number): { data: string; hora: string } {
  const dias = Math.floor(n / 1440);
  const resto = n - dias * 1440;
  return { data: somarDias("2000-01-01", dias), hora: `${dois(Math.floor(resto / 60))}:${dois(resto % 60)}` };
}

export function novoForm(inicio: Date, fim: Date, diaInteiro: boolean, calendarId: string): FormEvento {
  const inicioData = dataLocal(inicio);
  // Na seleção de dia inteiro o FullCalendar entrega o fim exclusivo (dia seguinte)
  const fimData = diaInteiro ? somarDias(dataLocal(fim), -1) : dataLocal(fim);
  return {
    titulo: "",
    calendarId,
    diaInteiro,
    inicioData,
    inicioHora: diaInteiro ? "09:00" : horaLocal(inicio),
    fimData: fimData < inicioData ? inicioData : fimData,
    fimHora: diaInteiro ? "10:00" : horaLocal(fim),
    recorrencia: null,
    regraOriginal: null,
    outrasLinhas: [],
    participantes: [],
    meet: false,
    linkMeet: null,
    lembretesPadrao: false,
    lembretes: [{ ...LEMBRETE_PADRAO }],
    descricao: "",
    local: "",
  };
}

/** `recurrence`: a da série (mestre) quando `ev` é uma ocorrência. */
export function eventoParaForm(ev: EventoGoogle, calendarId: string, recurrence?: string[]): FormEvento {
  const diaInteiro = !!ev.start?.date;
  const ini = diaInteiro ? null : new Date(ev.start?.dateTime as string);
  const fim = diaInteiro ? null : new Date(ev.end?.dateTime as string);
  const linhas = recurrence ?? ev.recurrence ?? [];
  const rrule = linhas.find((l) => /^RRULE:/i.test(l)) ?? null;
  const rec = rrule ? deRRule(rrule) : null;
  const entradas = (ev.conferenceData?.entryPoints ?? []) as { entryPointType: string; uri: string }[];
  const meet = ev.hangoutLink ?? entradas.find((e) => e.entryPointType === "video")?.uri ?? null;
  return {
    titulo: ev.summary ?? "",
    calendarId,
    diaInteiro,
    inicioData: diaInteiro ? (ev.start?.date as string) : dataLocal(ini as Date),
    inicioHora: diaInteiro ? "09:00" : horaLocal(ini as Date),
    fimData: diaInteiro ? somarDias(ev.end?.date as string, -1) : dataLocal(fim as Date),
    fimHora: diaInteiro ? "10:00" : horaLocal(fim as Date),
    recorrencia: rec,
    regraOriginal: rrule && !rec ? rrule : null,
    outrasLinhas: linhas.filter((l) => !/^RRULE:/i.test(l)),
    participantes: (ev.attendees ?? []).filter((a) => !a.self).map((a) => a.email),
    meet: !!meet,
    linkMeet: meet,
    lembretesPadrao: ev.reminders?.useDefault ?? true,
    lembretes: (ev.reminders?.overrides ?? []).map((o) => ({ metodo: o.method, minutos: o.minutes })),
    descricao: ev.description ?? "",
    local: ev.location ?? "",
  };
}

export function linhasRecorrencia(f: FormEvento): string[] {
  const regra = f.recorrencia ? paraRRule(f.recorrencia, f.inicioData, f.diaInteiro) : f.regraOriginal;
  return regra ? [regra, ...f.outrasLinhas] : [];
}

/** Mantém os objetos originais (com a resposta de cada um) e o próprio usuário na lista. */
function participantesDoCorpo(emails: string[], originais: Participante[]): Participante[] {
  const porEmail = new Map(originais.map((a) => [a.email.toLowerCase(), a]));
  const lista = emails.map((e) => porEmail.get(e.toLowerCase()) ?? { email: e });
  const eu = originais.find((a) => a.self);
  if (eu && !lista.some((a) => a.email.toLowerCase() === eu.email.toLowerCase())) lista.push(eu);
  return lista;
}

function novoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Corpo para insert/patch. Os `null` limpam o campo oposto (dia inteiro ⇄ horário) num patch. */
export function formParaEvento(f: FormEvento, original: EventoGoogle | null = null, requestId: string = novoId()): EventoGoogle {
  const corpo: EventoGoogle = {
    summary: f.titulo.trim(),
    description: f.descricao,
    location: f.local.trim(),
    start: f.diaInteiro
      ? { date: f.inicioData, dateTime: null, timeZone: null }
      : { date: null, dateTime: `${f.inicioData}T${f.inicioHora}:00`, timeZone: FUSO },
    end: f.diaInteiro
      ? { date: somarDias(f.fimData, 1), dateTime: null, timeZone: null }
      : { date: null, dateTime: `${f.fimData}T${f.fimHora}:00`, timeZone: FUSO },
    recurrence: linhasRecorrencia(f),
    attendees: participantesDoCorpo(f.participantes, original?.attendees ?? []),
    reminders: f.lembretesPadrao
      ? { useDefault: true }
      : { useDefault: false, overrides: f.lembretes.slice(0, MAX_LEMBRETES).map((l) => ({ method: l.metodo, minutes: l.minutos })) },
  };
  if (f.meet && !f.linkMeet) corpo.conferenceData = { createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } };
  if (!f.meet && f.linkMeet) corpo.conferenceData = null;
  return corpo;
}

/** Muda o início mantendo a duração; repetição de preset (ex.: "toda quinta") acompanha o novo dia. */
export function moverInicio(f: FormEvento, data: string, hora: string): FormEvento {
  let recorrencia = f.recorrencia;
  const preset = identificarPreset(f.recorrencia, f.inicioData);
  if (f.recorrencia && preset !== "personalizado" && preset !== "nao") {
    recorrencia = { ...(regraDoPreset(preset, data) as Recorrencia), fim: f.recorrencia.fim };
  }
  if (f.diaInteiro) {
    const dur = Math.max(0, diferencaDias(f.inicioData, f.fimData));
    return { ...f, recorrencia, inicioData: data, fimData: somarDias(data, dur) };
  }
  const dur = Math.max(0, minutosAbs(f.fimData, f.fimHora) - minutosAbs(f.inicioData, f.inicioHora));
  const fim = deMinutosAbs(minutosAbs(data, hora) + dur);
  return { ...f, recorrencia, inicioData: data, inicioHora: hora, fimData: fim.data, fimHora: fim.hora };
}

/**
 * Evento arrastado/esticado na grade. `fim` vem exclusivo no dia inteiro e `null` quando o
 * FullCalendar não sabe a duração (dia inteiro de 1 dia, ou dia inteiro solto num horário → 1 hora).
 */
export function moverPorArrasto(f: FormEvento, inicio: Date, fim: Date | null, diaInteiro: boolean): FormEvento {
  const g = moverInicio({ ...f, diaInteiro }, dataLocal(inicio), diaInteiro ? f.inicioHora : horaLocal(inicio));
  if (diaInteiro) {
    const ultimo = fim ? somarDias(dataLocal(fim), -1) : g.inicioData;
    return { ...g, fimData: ultimo < g.inicioData ? g.inicioData : ultimo };
  }
  const ate = fim ?? new Date(inicio.getTime() + 60 * 60_000);
  return { ...g, fimData: dataLocal(ate), fimHora: horaLocal(ate) };
}

/** Editar "todos" a partir de uma ocorrência: o deslocamento de dias feito nela vale para o início da série. */
export function ancorarNaSerie(f: FormEvento, inicioSerieISO: string, ocorrenciaISO: string): FormEvento {
  const desloc = diferencaDias(ocorrenciaISO, f.inicioData);
  const dur = diferencaDias(f.inicioData, f.fimData);
  const inicio = somarDias(inicioSerieISO, desloc);
  return { ...f, inicioData: inicio, fimData: somarDias(inicio, dur) };
}

export function temParticipantes(ev: EventoGoogle): boolean {
  return (ev.attendees ?? []).some((a) => !a.self);
}

export function emailValido(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function validarForm(f: FormEvento): string | null {
  if (!f.titulo.trim()) return "Dê um nome ao evento";
  const fimAntes = f.diaInteiro
    ? f.fimData < f.inicioData
    : `${f.fimData}T${f.fimHora}` <= `${f.inicioData}T${f.inicioHora}`;
  if (fimAntes) return "O fim precisa ser depois do início";
  const invalido = f.participantes.find((e) => !emailValido(e));
  if (invalido) return `E-mail inválido: ${invalido}`;
  if (!f.lembretesPadrao && f.lembretes.some((l) => l.minutos < 0 || l.minutos > MAX_MINUTOS_LEMBRETE)) {
    return "Notificação de no máximo 4 semanas antes";
  }
  const r = f.recorrencia;
  if (r) {
    if (!Number.isInteger(r.intervalo) || r.intervalo < 1) return "O intervalo da repetição precisa ser 1 ou mais";
    if (r.fim.tipo === "data" && r.fim.data < f.inicioData) return "A repetição termina antes do início do evento";
    if (r.fim.tipo === "vezes" && (!Number.isInteger(r.fim.n) || r.fim.n < 1)) return "A repetição precisa de pelo menos 1 ocorrência";
  }
  return null;
}

export function paraUnidade(minutos: number): { valor: number; unidade: Unidade } {
  for (const u of ["semanas", "dias", "horas"] as Unidade[]) {
    if (minutos > 0 && minutos % FATOR_UNIDADE[u] === 0) return { valor: minutos / FATOR_UNIDADE[u], unidade: u };
  }
  return { valor: minutos, unidade: "minutos" };
}
export function deUnidade(valor: number, unidade: Unidade): number {
  return Math.round(valor * FATOR_UNIDADE[unidade]);
}

/** Tira `null` (insert não precisa limpar nada). */
export function removerNulos<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map((x) => removerNulos(x)) as T;
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== null).map(([k, v]) => [k, removerNulos(v)]),
    ) as T;
  }
  return obj;
}
