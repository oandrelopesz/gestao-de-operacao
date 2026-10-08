import test from "node:test";
import assert from "node:assert/strict";
import {
  chaveTermo,
  alinharPalavras,
  aplicarCorrecoes,
  paragrafosParaMarcas,
  textoDeMarcas,
} from "../src/transcritor/termos.js";

// Segmento com tokens (tempo distribuído, sem palavras do Whisper)
const seg = (text, start = 0, end = 10) => alinharPalavras([{ start, end, text }], [])[0];
const textos = (s) => s.tokens.map((x) => x.t);

test("chaveTermo tira acento, pontuação e caixa", () => {
  assert.equal(chaveTermo("Rói,"), "roi");
  assert.equal(chaveTermo("Chat-GPT"), "chat gpt");
  assert.equal(chaveTermo("  cê  tê   erre "), "ce te erre");
  assert.equal(chaveTermo(null), "");
  assert.equal(chaveTermo("!!!"), "");
});

test("alinharPalavras usa os tempos das palavras quando a contagem bate", () => {
  const [s] = alinharPalavras(
    [{ start: 0, end: 2, text: "Olá  pessoal." }],
    [
      { word: "Olá", start: 0, end: 0.5 },
      { word: "pessoal.", start: 0.6, end: 1.2 },
    ],
  );
  assert.deepEqual(s.tokens, [
    { t: "Olá", s: 0, e: 0.5 },
    { t: "pessoal.", s: 0.6, e: 1.2 },
  ]);
  assert.equal(s.text, "Olá pessoal.");
});

test("alinharPalavras distribui o tempo pelo tamanho quando a contagem não bate", () => {
  const [s] = alinharPalavras([{ start: 0, end: 4, text: "ab abcd" }], [{ word: "ab", start: 0, end: 1 }]);
  assert.deepEqual(s.tokens, [
    { t: "ab", s: 0, e: 1.33 },
    { t: "abcd", s: 1.33, e: 4 },
  ]);
  assert.equal(s.text, "ab abcd");
});

test("alinharPalavras separa palavras por meio do tempo e aceita o fim no último segmento", () => {
  const segs = [
    { start: 0, end: 2, text: "a b" },
    { start: 2, end: 4, text: "c" },
  ];
  const r = alinharPalavras(segs, [
    { word: "a", start: 0, end: 0.5 },
    { word: "b", start: 1, end: 1.5 },
    { word: "c", start: 3.9, end: 4.1 }, // meio 4.0: cabe no último segmento (fim incluído)
  ]);
  assert.deepEqual(r[0].tokens, [
    { t: "a", s: 0, e: 0.5 },
    { t: "b", s: 1, e: 1.5 },
  ]);
  assert.deepEqual(r[1].tokens, [{ t: "c", s: 3.9, e: 4.1 }]);
});

test("alinharPalavras deixa tokens vazios em segmento vazio", () => {
  const [s] = alinharPalavras([{ start: 0, end: 1, text: "   " }], []);
  assert.deepEqual(s.tokens, []);
  assert.equal(s.text, "");
});

test("troca de 3 tokens por 1 (cê tê erre → CTR) e recalcula o texto", () => {
  const s = seg("Isso é cê tê erre hoje.", 0, 6);
  const r = aplicarCorrecoes([s], [{ de: "cê tê erre", para: "CTR" }]);
  assert.equal(r.segmentos[0].text, "Isso é CTR hoje.");
  assert.equal(r.trocas, 1);
  assert.equal(r.tokensTrocados, 3);
  const ctr = r.segmentos[0].tokens[2];
  assert.equal(ctr.s, s.tokens[2].s);
  assert.equal(ctr.e, s.tokens[4].e);
});

test("troca de 1 token sem acento e mantém a vírgula (rói, → ROI,)", () => {
  const r = aplicarCorrecoes([seg("Esse rói, bem.")], [{ de: "rói", para: "ROI" }]);
  assert.equal(r.segmentos[0].text, "Esse ROI, bem.");
  assert.equal(r.trocas, 1);
  assert.equal(r.tokensTrocados, 1);
});

test("maiúscula no início da frase quando o token original tem maiúscula", () => {
  const r = aplicarCorrecoes([seg("Roi é bom.")], [{ de: "roi", para: "retorno sobre investimento" }]);
  assert.equal(r.segmentos[0].text, "Retorno sobre investimento é bom.");
  const meio = aplicarCorrecoes([seg("esse roi é bom")], [{ de: "roi", para: "retorno" }]);
  assert.equal(meio.segmentos[0].text, "esse retorno é bom");
});

test("pontuação de fora do termo é mantida ((cê tê erre). → (CTR).)", () => {
  const r = aplicarCorrecoes([seg("Use (cê tê erre).")], [{ de: "cê tê erre", para: "CTR" }]);
  assert.equal(r.segmentos[0].text, "Use (CTR).");
});

test("pares com mais palavras são trocados primeiro", () => {
  const r = aplicarCorrecoes([seg("cê tê erre")], [
    { de: "cê tê", para: "XX" },
    { de: "cê tê erre", para: "CTR" },
  ]);
  assert.equal(r.segmentos[0].text, "CTR");
});

test("par com chave vazia é ignorado", () => {
  const s = seg("Texto qualquer.");
  const r = aplicarCorrecoes([s], [{ de: "  ", para: "X" }, { de: "!!!", para: "Y" }]);
  assert.equal(r.segmentos[0].text, "Texto qualquer.");
  assert.equal(r.trocas, 0);
  assert.equal(r.tokensTrocados, 0);
});

test("a troca não passa de um segmento para o outro", () => {
  const r = aplicarCorrecoes(
    [seg("cê tê", 0, 2), seg("erre", 2, 4)],
    [{ de: "cê tê erre", para: "CTR" }],
  );
  assert.equal(r.trocas, 0);
  assert.equal(r.segmentos[0].text, "cê tê");
  assert.equal(r.segmentos[1].text, "erre");
});

test("texto igual ao original não conta como troca", () => {
  const r = aplicarCorrecoes([seg("ROI bom.")], [{ de: "roi", para: "ROI" }]);
  assert.equal(r.trocas, 0);
  assert.equal(r.tokensTrocados, 0);
  assert.equal(r.segmentos[0].text, "ROI bom.");
});

test("aplicarCorrecoes não altera a entrada", () => {
  const entrada = [seg("Isso é cê tê erre.")];
  const copia = JSON.parse(JSON.stringify(entrada));
  aplicarCorrecoes(entrada, [{ de: "cê tê erre", para: "CTR" }]);
  assert.deepEqual(entrada, copia);
});

test("paragrafosParaMarcas gera { v: 1, p } e pula parágrafo sem palavras", () => {
  const paragrafos = [
    [seg("um dois", 0, 2)],
    [seg("", 2, 3)],
    [seg("três", 3, 4), seg("quatro", 4, 5)],
  ];
  const m = paragrafosParaMarcas(paragrafos);
  assert.equal(m.v, 1);
  assert.equal(m.p.length, 2);
  assert.deepEqual(m.p[1].map((w) => w[0]), ["três", "quatro"]);
  assert.deepEqual(m.p[1][0], ["três", 3, 4]);
});

test("textoDeMarcas junta palavras com espaço e parágrafos com linha em branco", () => {
  const m = {
    v: 1,
    p: [
      [["Olá", 0, 1], ["pessoal", 1, 2]],
      [["Tchau", 3, 4]],
    ],
  };
  assert.equal(textoDeMarcas(m), "Olá pessoal\n\nTchau");
  assert.equal(textoDeMarcas({ v: 1, p: [] }), "");
});

test("aplicarCorrecoes: token só de pontuação não abre a sequência (igual ao app)", () => {
  const seg = [{ start: 0, end: 2, text: "— roi,", tokens: [{ t: "—", s: 0, e: 1 }, { t: "roi,", s: 1, e: 2 }] }];
  const r = aplicarCorrecoes(seg, [{ de: "roi", para: "ROI" }]);
  assert.deepEqual(r.segmentos[0].tokens.map((x) => x.t), ["—", "ROI,"]);
});
