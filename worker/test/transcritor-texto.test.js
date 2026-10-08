import test from "node:test";
import assert from "node:assert/strict";
import { montarTexto, glossarioParaPrompt, glossarioParaHotwords, prepararSegmentos, agruparParagrafos } from "../src/transcritor/texto.js";

const seg = (start, end, text) => ({ start, end, text });
const FRASE = "Conversa em português sobre marketing digital, tráfego pago, IA, empreendedorismo, vendas e finanças.";

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

test("glossário vira prompt (frase de assunto + termos) e hotwords (lista curta)", () => {
  const termos = ["CTR", "ROAS", "lookalike", " ", "CTR"];
  assert.equal(glossarioParaPrompt(termos), `${FRASE} Termos: CTR, ROAS, lookalike.`);
  assert.equal(glossarioParaHotwords(termos), "CTR ROAS lookalike");
  assert.equal(glossarioParaPrompt([]), FRASE, "sem termos devolve só a frase de assunto");
  const muitos = Array.from({ length: 400 }, (_, i) => `termo${i}`);
  const longo = glossarioParaPrompt(muitos);
  assert.ok(longo.length <= 400, "prompt respeita o limite de 400 caracteres");
  assert.ok(longo.startsWith(`${FRASE} Termos: termo0, termo1`));
  assert.ok(longo.endsWith("."));
});

test("prepararSegmentos tira alucinação e laço, limpa o texto e some com segmento vazio", () => {
  const laco = "Com isso você segmenta. ";
  const saida = prepararSegmentos([
    { start: 0, end: 2, text: " Thank you. ", no_speech_prob: 0.9 },
    { start: 2, end: 4, text: "Primeira  ideia." },
    { start: 4, end: 6, text: laco + laco + laco.trim() },
    { start: 6, end: 7, text: "   " },
    { start: 7, end: 9, text: "Fim." },
  ]);
  // segmento vazio some e o anterior "cobre" o tempo dele (fim vai de 6 para 7)
  assert.deepEqual(
    saida.map((s) => [s.start, s.end, s.text]),
    [
      [2, 4, "Primeira ideia."],
      [4, 7, "Com isso você segmenta."],
      [7, 9, "Fim."],
    ]
  );
});

test("agruparParagrafos devolve parágrafos de segmentos, pulando segmento sem texto", () => {
  const segs = [seg(0, 2, "Primeira ideia."), seg(4, 6, "Segunda ideia depois de uma pausa."), seg(6.2, 7, "   "), seg(7, 8, "Continua junto.")];
  const paragrafos = agruparParagrafos(segs);
  assert.equal(paragrafos.length, 2);
  assert.deepEqual(paragrafos[0], [segs[0]]);
  assert.deepEqual(paragrafos[1], [segs[1], segs[3]]);
  assert.deepEqual(agruparParagrafos([]), []);
  assert.deepEqual(agruparParagrafos([seg(0, 1, " ")]), []);
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

test("montarTexto descarta as frases que o Whisper inventa em trecho sem fala", () => {
  const semFala = (text) => ({ start: 0, end: 30, text, no_speech_prob: 0.8 });
  assert.equal(montarTexto([semFala(" Thank you.")]), "");
  assert.equal(montarTexto([semFala("Obrigado."), semFala("Legendas pela comunidade Amara.org")]), "");
  // com fala de verdade (no_speech_prob baixo) a mesma frase fica
  assert.equal(montarTexto([{ start: 0, end: 2, text: "Obrigado.", no_speech_prob: 0.05 }]), "Obrigado.");
  // frase comum em trecho duvidoso fica (só as típicas de alucinação saem)
  assert.equal(montarTexto([semFala("Vamos revisar o ROAS.")]), "Vamos revisar o ROAS.");
});
