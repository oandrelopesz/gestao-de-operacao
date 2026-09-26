process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { serialExcel, textoDoValor, type Valor } from "./planilha.ts";

const d = new Date("2026-09-26T17:30:00.000Z"); // 14:30 em São Paulo

test("textoDoValor no CSV e no modo legível", () => {
  const casos: [Valor, string, string][] = [
    [null, "", ""],
    [{ t: "texto", v: "Ana" }, "Ana", "Ana"],
    [{ t: "inteiro", v: 3 }, "3", "3"],
    [{ t: "numero", v: 2.25, casas: 1 }, "2,3", "2,3"],
    [{ t: "moeda", v: 1500 }, "1500,00", "R$ 1.500,00"],
    [{ t: "data", v: d }, "26/09/2026", "26/09/2026"],
    [{ t: "datahora", v: d }, "26/09/2026 14:30", "26/09/2026 às 14:30"],
  ];
  for (const [v, csv, legivel] of casos) {
    assert.equal(textoDoValor(v, "csv"), csv);
    assert.equal(textoDoValor(v, "legivel"), legivel);
  }
});

test("serialExcel usa a hora de São Paulo", () => {
  // 26/09/2026 = 46291 no Excel; 14:30 = 0,6041666…
  assert.equal(serialExcel(d).toFixed(6), (46291 + 14.5 / 24).toFixed(6));
});
