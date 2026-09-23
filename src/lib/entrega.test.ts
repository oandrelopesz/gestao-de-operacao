import test from "node:test";
import assert from "node:assert/strict";
import { hojeBrasilia, diasDeAtraso, formatarDataCurta } from "./entrega.ts";

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
