import test from "node:test";
import assert from "node:assert/strict";
import { montarTexto, glossarioParaPrompt, glossarioParaHotwords } from "../src/transcritor/texto.js";

const seg = (start, end, text) => ({ start, end, text });

test("montarTexto junta os segmentos em texto corrido, sem quebras soltas", () => {
  const t = montarTexto([seg(0, 2, " Olá, pessoal."), seg(2.1, 4, "  Hoje vamos falar de   ROAS"), seg(4.2, 6, " e CTR.")]);
  assert.equal(t, "Olá, pessoal. Hoje vamos falar de ROAS e CTR.");
});

test("montarTexto abre parágrafo em pausa longa depois de fim de frase", () => {
  const t = montarTexto([seg(0, 2, "Primeira ideia."), seg(4, 6, "Segunda ideia depois de uma pausa."), seg(6.2, 7, "Continua junto.")]);
  assert.equal(t, "Primeira ideia.\n\nSegunda ideia depois de uma pausa. Continua junto.");
});

test("montarTexto não quebra no meio da frase, mesmo com pausa", () => {
  const t = montarTexto([seg(0, 2, "Isso aqui é"), seg(5, 6, "uma frase só.")]);
  assert.equal(t, "Isso aqui é uma frase só.");
});

test("montarTexto quebra textos longos sem pausa a cada ~120 palavras, sempre em fim de frase", () => {
  const frase = "Uma frase com exatamente dez palavras para o teste aqui.";
  const segs = Array.from({ length: 30 }, (_, i) => seg(i, i + 1, frase));
  const paragrafos = montarTexto(segs).split("\n\n");
  assert.ok(paragrafos.length >= 2, "texto de 300 palavras deveria ter parágrafos");
  for (const p of paragrafos) {
    assert.ok(p.endsWith("."), "parágrafo termina em fim de frase");
    assert.ok(p.split(" ").length <= 130);
  }
});

test("montarTexto ignora segmentos vazios e devolve '' sem fala", () => {
  assert.equal(montarTexto([seg(0, 1, "  "), seg(1, 2, "")]), "");
  assert.equal(montarTexto([]), "");
});

test("glossário vira prompt (frase de contexto) e hotwords (lista curta)", () => {
  const termos = ["CTR", "ROAS", "lookalike", " ", "CTR"];
  assert.equal(glossarioParaPrompt(termos), "Termos que podem aparecer: CTR, ROAS, lookalike.");
  assert.equal(glossarioParaHotwords(termos), "CTR ROAS lookalike");
  assert.equal(glossarioParaPrompt([]), undefined);
  const muitos = Array.from({ length: 400 }, (_, i) => `termo${i}`);
  assert.ok(glossarioParaPrompt(muitos).length <= 800, "prompt fica curto para não atrapalhar o modelo");
});
