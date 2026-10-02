import test from "node:test";
import assert from "node:assert/strict";
import { hojeBrasilia, diasDeAtraso, formatarDataCurta, siglaDoDia } from "./entrega.ts";

test("hojeBrasilia usa o fuso de São Paulo", () => {
  // 02:00 UTC do dia 24 ainda é dia 23 em Brasília (UTC-3)
  assert.equal(hojeBrasilia(new Date("2026-09-24T02:00:00Z")), "2026-09-23");
  assert.equal(hojeBrasilia(new Date("2026-09-24T03:30:00Z")), "2026-09-24");
});

test("diasDeAtraso", () => {
  assert.equal(diasDeAtraso("2026-09-20", "2026-09-23"), 3);
  assert.equal(diasDeAtraso("2026-09-23", "2026-09-23"), 0);
  assert.equal(diasDeAtraso("2026-09-25", "2026-09-23"), 0);
  assert.equal(diasDeAtraso(null, "2026-09-23"), 0);
});

test("formatarDataCurta", () => {
  assert.equal(formatarDataCurta("2026-09-05"), "05/09");
});

test("siglaDoDia: dia da semana da data (sem depender do fuso de quem roda)", () => {
  assert.equal(siglaDoDia("2026-10-01"), "QUI");
  assert.equal(siglaDoDia("2026-10-03"), "SÁB");
  assert.equal(siglaDoDia("2026-10-04"), "DOM");
  assert.equal(siglaDoDia("2027-01-01"), "SEX");
});

test("hojeBrasilia às 21h30 de Brasília (00h30 UTC do dia seguinte) ainda é o dia de Brasília", () => {
  assert.equal(hojeBrasilia(new Date("2026-10-02T00:30:00Z")), "2026-10-01");
});
