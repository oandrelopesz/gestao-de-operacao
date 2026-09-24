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
  // frases diferentes (a mesma repetida 30 vezes seria um laço do Whisper e sairia uma vez só)
  const segs = Array.from({ length: 30 }, (_, i) => seg(i, i + 1, `Frase número ${i} com exatamente dez palavras para o teste.`));
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

test("montarTexto tira o laço do Whisper (mesma frase ou bloco repetido 3+ vezes seguidas)", () => {
  const laco = "Então você pode segmentar por interesses, idade e etc. Com isso você consegue atingir o seu público correto.";
  const t = montarTexto([
    seg(0, 5, "O principal ponto positivo é que você consegue segmentar os seus anúncios."),
    seg(5, 10, laco),
    seg(10, 15, laco),
    seg(15, 20, " " + laco + " "),
    seg(20, 25, "O lado negativo é que você precisa pagar por isso."),
  ]);
  assert.equal(t, "O principal ponto positivo é que você consegue segmentar os seus anúncios. " + laco + " O lado negativo é que você precisa pagar por isso.");
});

test("montarTexto tira o laço dentro de um mesmo segmento", () => {
  const t = montarTexto([seg(0, 30, "Com isso você consegue segmentar. Com isso você consegue segmentar. Com isso você consegue segmentar. Com isso você consegue segmentar. Fim.")]);
  assert.equal(t, "Com isso você consegue segmentar. Fim.");
});

test("montarTexto mantém repetições naturais (duas vezes) e frases curtas iguais separadas", () => {
  const t = montarTexto([seg(0, 2, "De forma bem resumida, de forma bem resumida."), seg(2, 3, "Sim."), seg(3, 4, "Não."), seg(4, 5, "Sim."), seg(5, 6, "Não.")]);
  assert.equal(t, "De forma bem resumida, de forma bem resumida. Sim. Não. Sim. Não.");
});
