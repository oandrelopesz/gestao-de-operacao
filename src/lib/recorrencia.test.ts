import test from "node:test";
import assert from "node:assert/strict";
import {
  paraRRule, deRRule, regraDoPreset, identificarPreset, rotuloPreset, descrever, encerrarAntesDe,
  posicaoNoMes, somarDias, diferencaDias, type Recorrencia,
} from "./recorrencia.ts";

// 24/09/2026 é quinta-feira (4ª quinta do mês); 30/09/2026 é a 5ª quarta (a última)
const QUI = "2026-09-24";

test("presets viram as RRULEs do Google", () => {
  assert.equal(paraRRule(regraDoPreset("diario", QUI)!, QUI, false), "RRULE:FREQ=DAILY");
  assert.equal(paraRRule(regraDoPreset("semanal", QUI)!, QUI, false), "RRULE:FREQ=WEEKLY;BYDAY=TH");
  assert.equal(paraRRule(regraDoPreset("mensal_dia", QUI)!, QUI, false), "RRULE:FREQ=MONTHLY;BYMONTHDAY=24");
  assert.equal(paraRRule(regraDoPreset("mensal_pos", QUI)!, QUI, false), "RRULE:FREQ=MONTHLY;BYDAY=4TH");
  assert.equal(paraRRule(regraDoPreset("anual", QUI)!, QUI, false), "RRULE:FREQ=YEARLY");
  assert.equal(paraRRule(regraDoPreset("uteis", QUI)!, QUI, false), "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
  assert.equal(regraDoPreset("nao", QUI), null);
});

test("5ª ocorrência do dia no mês vira 'última' (-1)", () => {
  assert.equal(posicaoNoMes("2026-09-30"), -1);
  assert.equal(paraRRule(regraDoPreset("mensal_pos", "2026-09-30")!, "2026-09-30", false), "RRULE:FREQ=MONTHLY;BYDAY=-1WE");
});

test("personalizado: intervalo, dias ordenados e fim", () => {
  const r: Recorrencia = { freq: "WEEKLY", intervalo: 2, diasSemana: ["FR", "MO"], mensal: "dia", fim: { tipo: "vezes", n: 10 } };
  assert.equal(paraRRule(r, QUI, false), "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=10");
});

test("UNTIL: dia inteiro usa data; com horário usa o fim do dia de Brasília em UTC", () => {
  const r: Recorrencia = { freq: "DAILY", intervalo: 1, diasSemana: [], mensal: "dia", fim: { tipo: "data", data: "2026-10-31" } };
  assert.equal(paraRRule(r, QUI, true), "RRULE:FREQ=DAILY;UNTIL=20261031");
  assert.equal(paraRRule(r, QUI, false), "RRULE:FREQ=DAILY;UNTIL=20261101T025959Z");
});

test("deRRule lê o que paraRRule escreve (ida e volta)", () => {
  const casos: Recorrencia[] = [
    { freq: "WEEKLY", intervalo: 2, diasSemana: ["MO", "FR"], mensal: "dia", fim: { tipo: "vezes", n: 10 } },
    { freq: "MONTHLY", intervalo: 1, diasSemana: [], mensal: "posicao", fim: { tipo: "nunca" } },
    { freq: "DAILY", intervalo: 3, diasSemana: [], mensal: "dia", fim: { tipo: "data", data: "2026-10-31" } },
  ];
  for (const r of casos) for (const diaInteiro of [true, false]) assert.deepEqual(deRRule(paraRRule(r, QUI, diaInteiro)), r);
});

test("deRRule: UNTIL em UTC de madrugada é o dia anterior em Brasília", () => {
  assert.deepEqual(deRRule("RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261030T025959Z")?.fim, { tipo: "data", data: "2026-10-29" });
  assert.deepEqual(deRRule("RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261030T150000Z")?.fim, { tipo: "data", data: "2026-10-30" });
});

test("deRRule: dias úteis gravados como DAILY viram WEEKLY", () => {
  assert.deepEqual(deRRule("RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"), regraDoPreset("uteis", QUI));
});

test("deRRule recusa o que o formulário não edita", () => {
  assert.equal(deRRule("RRULE:FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=-1"), null);
  assert.equal(deRRule("RRULE:FREQ=YEARLY;BYMONTH=3,9"), null);
  assert.equal(deRRule("RRULE:FREQ=HOURLY"), null);
  assert.equal(deRRule("RRULE:FREQ=DAILY;INTERVAL=2;BYDAY=MO,WE"), null);
  assert.equal(deRRule("EXDATE:20260101"), null);
});

test("identificarPreset", () => {
  assert.equal(identificarPreset(null, QUI), "nao");
  assert.equal(identificarPreset(deRRule("RRULE:FREQ=WEEKLY;BYDAY=TH"), QUI), "semanal");
  assert.equal(identificarPreset(deRRule("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"), QUI), "uteis");
  assert.equal(identificarPreset(deRRule("RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=5"), QUI), "personalizado");
});

test("rótulos em português", () => {
  assert.equal(rotuloPreset("semanal", QUI), "Semanal: cada quinta-feira");
  assert.equal(rotuloPreset("mensal_pos", QUI), "Mensal: na quarta quinta-feira");
  assert.equal(rotuloPreset("mensal_pos", "2026-09-26"), "Mensal: no quarto sábado");
  assert.equal(rotuloPreset("anual", QUI), "Anual: em 24 de setembro");
});

test("descrever", () => {
  assert.equal(descrever(deRRule("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=10")!, QUI), "A cada 2 semanas: seg, sex · 10 vezes");
  assert.equal(descrever(deRRule("RRULE:FREQ=MONTHLY;BYMONTHDAY=24;UNTIL=20261231")!, QUI), "Mensal no dia 24 · até 31/12/2026");
  assert.equal(descrever(regraDoPreset("uteis", QUI)!, QUI), "Todos os dias úteis");
});

test("encerrarAntesDe troca COUNT/UNTIL pelo dia anterior à ocorrência", () => {
  assert.equal(encerrarAntesDe("RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=10", "2026-10-08", false), "RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261008T025959Z");
  assert.equal(encerrarAntesDe("RRULE:FREQ=DAILY;UNTIL=20261231", "2026-10-08", true), "RRULE:FREQ=DAILY;UNTIL=20261007");
});

test("datas", () => {
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(diferencaDias("2026-09-24", "2026-10-01"), 7);
});
