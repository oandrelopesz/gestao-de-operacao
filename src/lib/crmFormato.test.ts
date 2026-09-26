process.env.TZ = "Asia/Tokyo"; // as contas não podem depender do fuso da máquina
import test from "node:test";
import assert from "node:assert/strict";
import {
  partesSP, deSP, diaSPAs, mesmoDiaSP, formatarDataHora, formatarDiaCurtoHora, isoDeCampos, camposDeIso,
  formatarDuracao, formatarReais, formatarPct,
} from "./crmFormato.ts";

test("deSP e partesSP: ida e volta em São Paulo (UTC-3)", () => {
  const d = deSP(2026, 9, 26, 14, 30);
  assert.equal(d.toISOString(), "2026-09-26T17:30:00.000Z");
  assert.deepEqual(partesSP(d), { ano: 2026, mes: 9, dia: 26, hora: 14, minuto: 30, diaSemana: 6 });
});

test("diaSPAs atravessa o mês", () => {
  assert.equal(diaSPAs(deSP(2026, 10, 1, 9), -3, 10).toISOString(), deSP(2026, 9, 28, 10).toISOString());
});

test("mesmoDiaSP usa a meia-noite de SP", () => {
  assert.equal(mesmoDiaSP(new Date("2026-09-26T02:00:00Z"), new Date("2026-09-26T04:00:00Z")), false);
  assert.equal(mesmoDiaSP(new Date("2026-09-26T04:00:00Z"), new Date("2026-09-27T02:59:00Z")), true);
});

test("formatações de data", () => {
  assert.equal(formatarDataHora("2026-09-26T17:30:00.000Z"), "26/09 às 14:30");
  assert.equal(formatarDiaCurtoHora(deSP(2026, 9, 30, 11)), "qua 11:00");
});

test("campos de formulário ⇄ ISO", () => {
  const iso = isoDeCampos("2026-09-30", "09:15");
  assert.equal(iso, "2026-09-30T12:15:00.000Z");
  assert.deepEqual(camposDeIso(iso), { data: "2026-09-30", hora: "09:15" });
  assert.equal(isoDeCampos("", "09:00"), null);
  assert.deepEqual(camposDeIso(null), { data: "", hora: "" });
});

test("formatarDuracao, formatarReais e formatarPct", () => {
  assert.equal(formatarDuracao(0.5), "30 min");
  assert.equal(formatarDuracao(3.5), "3,5 h");
  assert.equal(formatarDuracao(72), "3 dias");
  assert.equal(formatarDuracao(null), "—");
  assert.equal(formatarReais(1500), "R$ 1.500,00");
  assert.equal(formatarPct(0.256), "25,6%");
  assert.equal(formatarPct(null), "—");
});
