import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularTaxa, lerTaxa, limparTaxa, taxaParaCampo, valorParaCopiar } from "./taxas.ts";

test("acrescentar por fora: valor × (1 + taxa)", () => {
  const r = calcularTaxa(1000, 13.15, "acrescentar", "fora")!;
  assert.equal(r.resultado, 1131.5);
  assert.equal(r.taxaEmReais, 131.5);
  assert.match(r.formula, /× \(1 \+ 13,15%\)/);
});

test("acrescentar por dentro: valor ÷ (1 − taxa), o que sobra depois da taxa é o valor", () => {
  const r = calcularTaxa(1000, 10, "acrescentar", "dentro")!;
  assert.equal(r.resultado, 1111.11);
  assert.equal(r.taxaEmReais, 111.11);
  assert.ok(Math.abs(r.resultado * 0.9 - 1000) < 0.01);
});

test("descontar é a conta inversa do acrescentar, nos dois métodos", () => {
  for (const metodo of ["fora", "dentro"] as const) {
    const ida = calcularTaxa(2500, 13.15, "acrescentar", metodo)!.resultado;
    const volta = calcularTaxa(ida, 13.15, "descontar", metodo)!.resultado;
    assert.ok(Math.abs(volta - 2500) <= 0.01, `${metodo}: ${volta}`);
  }
  assert.equal(calcularTaxa(1131.5, 13.15, "descontar", "fora")!.resultado, 1000);
  assert.equal(calcularTaxa(1000, 10, "descontar", "dentro")!.resultado, 900);
});

test("arredonda no centavo sem ruído de ponto flutuante", () => {
  assert.equal(calcularTaxa(100, 13, "acrescentar", "fora")!.resultado, 113); // 100 * 1.13 = 113.00000000000001
  assert.equal(calcularTaxa(0.01, 50, "acrescentar", "fora")!.resultado, 0.02); // 0,015 sobe para 0,02
});

test("taxa zero devolve o mesmo valor", () => {
  const r = calcularTaxa(500, 0, "acrescentar", "fora")!;
  assert.equal(r.resultado, 500);
  assert.equal(r.taxaEmReais, 0);
});

test("conta impossível devolve null", () => {
  assert.equal(calcularTaxa(0, 10, "acrescentar", "fora"), null);
  assert.equal(calcularTaxa(-5, 10, "acrescentar", "fora"), null);
  assert.equal(calcularTaxa(100, 100, "acrescentar", "dentro"), null);
  assert.equal(calcularTaxa(100, -1, "acrescentar", "fora"), null);
  assert.equal(calcularTaxa(100, Number.NaN, "acrescentar", "fora"), null);
});

test("lerTaxa aceita vírgula e ponto; lixo vira 0", () => {
  assert.equal(lerTaxa("13,15"), 13.15);
  assert.equal(lerTaxa("13.15"), 13.15);
  assert.equal(lerTaxa("13,"), 13);
  assert.equal(lerTaxa(""), 0);
  assert.equal(lerTaxa(","), 0);
});

test("limparTaxa: só dígitos e uma vírgula, 2 inteiros e 4 decimais", () => {
  assert.equal(limparTaxa("13.15"), "13,15");
  assert.equal(limparTaxa("13,15,9"), "13,159");
  assert.equal(limparTaxa("abc1x3%"), "13");
  assert.equal(limparTaxa("123"), "12");
  assert.equal(limparTaxa("1,23456"), "1,2345");
  assert.equal(limparTaxa(",5"), ",5");
});

test("taxaParaCampo e valorParaCopiar", () => {
  assert.equal(taxaParaCampo(13.15), "13,15");
  assert.equal(taxaParaCampo(8), "8");
  assert.equal(valorParaCopiar(1131.5), "1131,50");
  assert.equal(valorParaCopiar(1234567.8), "1234567,80");
});
