process.env.TZ = "America/Sao_Paulo";
import test from "node:test";
import assert from "node:assert/strict";
import {
  novoForm, formParaEvento, eventoParaForm, moverInicio, moverPorArrasto, ancorarNaSerie, validarForm, paraUnidade, deUnidade,
  removerNulos, dataDe, linkMeetNaConta, CONTA_DO_MEET, type EventoGoogle,
} from "./agendaEvento.ts";
import { regraDoPreset } from "./recorrencia.ts";

const BASE = novoForm(new Date(2026, 8, 24, 10, 0), new Date(2026, 8, 24, 11, 0), false, "primary");

test("novoForm: horário vem da seleção, 10 min de notificação", () => {
  assert.equal(BASE.inicioData, "2026-09-24");
  assert.equal(BASE.inicioHora, "10:00");
  assert.equal(BASE.fimHora, "11:00");
  assert.deepEqual(BASE.lembretes, [{ metodo: "popup", minutos: 10 }]);
  assert.equal(BASE.lembretesPadrao, false);
});

test("novoForm dia inteiro: fim exclusivo do FullCalendar vira o último dia", () => {
  const f = novoForm(new Date(2026, 8, 24), new Date(2026, 8, 26), true, "primary");
  assert.equal(f.inicioData, "2026-09-24");
  assert.equal(f.fimData, "2026-09-25");
});

test("formParaEvento: horário com fuso, Meet novo, lembretes, participantes", () => {
  const corpo = formParaEvento({ ...BASE, titulo: "  Call  ", meet: true, participantes: ["a@b.com"] }, null, "req-1");
  assert.equal(corpo.summary, "Call");
  assert.deepEqual(corpo.start, { date: null, dateTime: "2026-09-24T10:00:00", timeZone: "America/Sao_Paulo" });
  assert.deepEqual(corpo.conferenceData, { createRequest: { requestId: "req-1", conferenceSolutionKey: { type: "hangoutsMeet" } } });
  assert.deepEqual(corpo.reminders, { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] });
  assert.deepEqual(corpo.attendees, [{ email: "a@b.com" }]);
  assert.deepEqual(corpo.recurrence, []);
});

test("formParaEvento dia inteiro: end.date exclusivo", () => {
  const corpo = formParaEvento({ ...BASE, diaInteiro: true, fimData: "2026-09-25" });
  assert.deepEqual(corpo.start, { date: "2026-09-24", dateTime: null, timeZone: null });
  assert.deepEqual(corpo.end, { date: "2026-09-26", dateTime: null, timeZone: null });
});

test("Meet: mantém o existente, remove quando desligado", () => {
  assert.equal("conferenceData" in formParaEvento({ ...BASE, meet: true, linkMeet: "https://meet.google.com/x" }), false);
  assert.equal(formParaEvento({ ...BASE, meet: false, linkMeet: "https://meet.google.com/x" }).conferenceData, null);
});

test("eventoParaForm ⇄ formParaEvento preserva respostas dos participantes e a regra", () => {
  const ev: EventoGoogle = {
    id: "e1", summary: "Reunião",
    start: { dateTime: "2026-09-24T10:00:00-03:00" }, end: { dateTime: "2026-09-24T11:30:00-03:00" },
    recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TH", "EXDATE;TZID=America/Sao_Paulo:20261001T100000"],
    attendees: [
      { email: "eu@x.com", self: true, organizer: true, responseStatus: "accepted" },
      { email: "Cliente@Y.com", responseStatus: "accepted" },
    ],
    hangoutLink: "https://meet.google.com/abc",
    reminders: { useDefault: true },
  };
  const f = eventoParaForm(ev, "primary");
  assert.equal(f.fimHora, "11:30");
  assert.deepEqual(f.participantes, ["Cliente@Y.com"]);
  assert.equal(f.recorrencia?.freq, "WEEKLY");
  assert.deepEqual(f.outrasLinhas, ["EXDATE;TZID=America/Sao_Paulo:20261001T100000"]);
  assert.equal(f.meet, true);
  assert.equal(f.linkMeet, "https://meet.google.com/abc");
  assert.equal(f.lembretesPadrao, true);

  const corpo = formParaEvento({ ...f, participantes: ["cliente@y.com", "novo@z.com"] }, ev);
  assert.deepEqual(corpo.attendees, [
    { email: "Cliente@Y.com", responseStatus: "accepted" },
    { email: "novo@z.com" },
    { email: "eu@x.com", self: true, organizer: true, responseStatus: "accepted" },
  ]);
  assert.deepEqual(corpo.recurrence, ["RRULE:FREQ=WEEKLY;BYDAY=TH", "EXDATE;TZID=America/Sao_Paulo:20261001T100000"]);
  assert.deepEqual(corpo.reminders, { useDefault: true });
});

test("regra que o formulário não edita volta intacta", () => {
  const ev: EventoGoogle = { start: { date: "2026-09-24" }, end: { date: "2026-09-25" }, recurrence: ["RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1"] };
  const f = eventoParaForm(ev, "primary");
  assert.equal(f.recorrencia, null);
  assert.equal(f.regraOriginal, "RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1");
  assert.equal(f.fimData, "2026-09-24");
  assert.deepEqual(formParaEvento(f, ev).recurrence, ["RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1"]);
});

test("recorrência da série vem do mestre quando a ocorrência não tem", () => {
  const inst: EventoGoogle = { start: { dateTime: "2026-10-01T10:00:00-03:00" }, end: { dateTime: "2026-10-01T11:00:00-03:00" }, recurringEventId: "m" };
  assert.equal(eventoParaForm(inst, "primary", ["RRULE:FREQ=DAILY"]).recorrencia?.freq, "DAILY");
});

test("moverInicio mantém a duração e o preset semanal acompanha o dia", () => {
  const f = { ...BASE, fimHora: "11:30", recorrencia: regraDoPreset("semanal", "2026-09-24") };
  const g = moverInicio(f, "2026-09-25", "23:00");
  assert.equal(g.fimData, "2026-09-26");
  assert.equal(g.fimHora, "00:30");
  assert.deepEqual(g.recorrencia?.diasSemana, ["FR"]);
});

test("ancorarNaSerie aplica o deslocamento da ocorrência no início da série", () => {
  const f = { ...BASE, inicioData: "2026-10-09", fimData: "2026-10-09" }; // ocorrência de 08/10 movida 1 dia
  const g = ancorarNaSerie(f, "2026-09-24", "2026-10-08");
  assert.equal(g.inicioData, "2026-09-25");
  assert.equal(g.fimData, "2026-09-25");
});

test("moverPorArrasto: horário novo com a duração que a grade entregou", () => {
  const g = moverPorArrasto(BASE, new Date(2026, 8, 25, 14, 0), new Date(2026, 8, 25, 15, 30), false);
  assert.deepEqual([g.inicioData, g.inicioHora, g.fimData, g.fimHora, g.diaInteiro], ["2026-09-25", "14:00", "2026-09-25", "15:30", false]);
});

test("moverPorArrasto: para a faixa de dia inteiro (fim exclusivo) e de volta", () => {
  const g = moverPorArrasto(BASE, new Date(2026, 8, 26), new Date(2026, 8, 28), true);
  assert.deepEqual([g.inicioData, g.fimData, g.diaInteiro], ["2026-09-26", "2026-09-27", true]);
  const h = moverPorArrasto(g, new Date(2026, 8, 26), null, true);
  assert.deepEqual([h.inicioData, h.fimData], ["2026-09-26", "2026-09-26"]);
  // Dia inteiro solto num horário: o FullCalendar manda fim null → 1 hora
  const i = moverPorArrasto(g, new Date(2026, 8, 26, 9, 0), null, false);
  assert.deepEqual([i.inicioHora, i.fimData, i.fimHora, i.diaInteiro], ["09:00", "2026-09-26", "10:00", false]);
});

test("moverPorArrasto: repetição semanal acompanha o novo dia", () => {
  const f = { ...BASE, recorrencia: regraDoPreset("semanal", "2026-09-24") };
  const g = moverPorArrasto(f, new Date(2026, 8, 25, 10, 0), new Date(2026, 8, 25, 11, 0), false);
  assert.deepEqual(g.recorrencia?.diasSemana, ["FR"]);
});

test("validarForm", () => {
  assert.equal(validarForm(BASE), "Dê um nome ao evento");
  const ok = { ...BASE, titulo: "X" };
  assert.equal(validarForm(ok), null);
  assert.equal(validarForm({ ...ok, fimHora: "09:00" }), "O fim precisa ser depois do início");
  assert.equal(validarForm({ ...ok, participantes: ["sem-arroba"] }), "E-mail inválido: sem-arroba");
  assert.equal(validarForm({ ...ok, lembretes: [{ metodo: "popup", minutos: 50_000 }] }), "Notificação de no máximo 4 semanas antes");
  assert.equal(
    validarForm({ ...ok, recorrencia: { freq: "DAILY", intervalo: 1, diasSemana: [], mensal: "dia", fim: { tipo: "data", data: "2026-09-01" } } }),
    "A repetição termina antes do início do evento",
  );
});

test("unidades de notificação", () => {
  assert.deepEqual(paraUnidade(10), { valor: 10, unidade: "minutos" });
  assert.deepEqual(paraUnidade(120), { valor: 2, unidade: "horas" });
  assert.deepEqual(paraUnidade(1440), { valor: 1, unidade: "dias" });
  assert.deepEqual(paraUnidade(20160), { valor: 2, unidade: "semanas" });
  assert.deepEqual(paraUnidade(0), { valor: 0, unidade: "minutos" });
  assert.equal(deUnidade(3, "horas"), 180);
});

test("dataDe e removerNulos", () => {
  assert.equal(dataDe({ date: "2026-09-24" }), "2026-09-24");
  assert.equal(dataDe({ dateTime: "2026-09-25T01:00:00Z" }), "2026-09-24");
  assert.deepEqual(removerNulos({ a: 1, b: null, c: { d: null, e: "x" }, f: [{ g: null, h: 2 }] }), { a: 1, c: { e: "x" }, f: [{ h: 2 }] });
});

test("linkMeetNaConta: o Meet abre na conta da agenda (authuser), sem mexer no resto do link", () => {
  assert.equal(CONTA_DO_MEET, "contato@andrelopes.digital");
  assert.equal(linkMeetNaConta("https://meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij?authuser=contato%40andrelopes.digital");
  // conta já escolhida no link é trocada pela da agenda; outros parâmetros ficam
  assert.equal(
    linkMeetNaConta("https://meet.google.com/abc-defg-hij?authuser=1&hs=122"),
    "https://meet.google.com/abc-defg-hij?authuser=contato%40andrelopes.digital&hs=122",
  );
  // link que não é do Meet (Zoom etc.) e texto inválido ficam como estão
  assert.equal(linkMeetNaConta("https://zoom.us/j/123"), "https://zoom.us/j/123");
  assert.equal(linkMeetNaConta("não é link"), "não é link");
});
