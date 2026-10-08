import test from "node:test";
import assert from "node:assert/strict";
import {
  aplicarCorrecaoNasMarcas,
  chaveTermo,
  indicePalavra,
  iniciosDasPalavras,
  textoDeMarcas,
  type Marcas,
} from "./transcritorMarcas.ts";

const marcas = (...paragrafos: [string, number, number][][]): Marcas => ({ v: 1, p: paragrafos });
const textos = (m: Marcas) => m.p.map((par) => par.map((w) => w[0]));

test("chaveTermo tira acento, pontuação e caixa", () => {
  assert.equal(chaveTermo("Rói,"), "roi");
  assert.equal(chaveTermo("  Cê-Tê  erre "), "ce te erre");
  assert.equal(chaveTermo("!!!"), "");
  assert.equal(chaveTermo(undefined as unknown as string), "");
});

test("troca de 1 token mantém a pontuação e os tempos", () => {
  const m = marcas([["rói,", 0, 0.5], ["hoje", 0.5, 1]]);
  const r = aplicarCorrecaoNasMarcas(m, "rói", "ROI");
  assert.equal(r.trocas, 1);
  assert.deepEqual(r.marcas.p[0], [["ROI,", 0, 0.5], ["hoje", 0.5, 1]]);
});

test("troca de 3 tokens vira 1 token com início do primeiro e fim do último", () => {
  const m = marcas([["cê", 1, 1.2], ["tê", 1.2, 1.4], ["erre,", 1.4, 1.8]]);
  const r = aplicarCorrecaoNasMarcas(m, "cê tê erre", "CTR");
  assert.equal(r.trocas, 1);
  assert.deepEqual(r.marcas.p[0], [["CTR,", 1, 1.8]]);
});

test("acento não impede a troca", () => {
  const r = aplicarCorrecaoNasMarcas(marcas([["ROI", 0, 1]]), "roi", "ROI");
  // mesmo texto: não conta como troca
  assert.equal(r.trocas, 0);
  const r2 = aplicarCorrecaoNasMarcas(marcas([["roi.", 0, 1]]), "Rói", "retorno");
  assert.equal(r2.trocas, 1);
  assert.deepEqual(r2.marcas.p[0], [["retorno.", 0, 1]]);
});

test("maiúscula de início de frase é mantida no termo novo", () => {
  const m = marcas([["Gpt", 0, 0.5], ["gpt", 0.5, 1]]);
  const r = aplicarCorrecaoNasMarcas(m, "gpt", "chatgpt");
  assert.equal(r.trocas, 2);
  assert.deepEqual(textos(r.marcas), [["Chatgpt", "chatgpt"]]);
});

test("pontuação final e inicial são mantidas", () => {
  const r = aplicarCorrecaoNasMarcas(marcas([["(rói).", 0, 1]]), "rói", "ROI");
  assert.deepEqual(r.marcas.p[0], [["(ROI).", 0, 1]]);
});

test("troca todas as ocorrências, em todos os parágrafos", () => {
  const m = marcas([["rói", 0, 1], ["rói", 1, 2]], [["cê", 3, 3.5], ["tê", 3.5, 4]]);
  const r = aplicarCorrecaoNasMarcas(m, "rói", "ROI");
  assert.equal(r.trocas, 2);
  assert.deepEqual(textos(r.marcas), [["ROI", "ROI"], ["cê", "tê"]]);
  const r2 = aplicarCorrecaoNasMarcas(m, "cê tê", "CT");
  assert.equal(r2.trocas, 1, "mesmo parágrafo: casa");
  assert.deepEqual(textos(r2.marcas), [["rói", "rói"], ["CT"]]);
});

test("sequência que atravessa dois parágrafos não casa", () => {
  const m = marcas([["cê", 0, 1]], [["tê", 2, 3]]);
  const r = aplicarCorrecaoNasMarcas(m, "cê tê", "CT");
  assert.equal(r.trocas, 0);
  assert.deepEqual(r.marcas.p, m.p);
});

test("par vazio é ignorado", () => {
  const m = marcas([["oi", 0, 1]]);
  const r = aplicarCorrecaoNasMarcas(m, "!!!", "algo");
  assert.equal(r.trocas, 0);
  assert.equal(textoDeMarcas(r.marcas), textoDeMarcas(m));
});

test("entrada não é mutada", () => {
  const m = marcas([["cê", 1, 1.2], ["tê", 1.2, 1.4], ["erre,", 1.4, 1.8]]);
  const antes = JSON.stringify(m);
  const r = aplicarCorrecaoNasMarcas(m, "cê tê erre", "CTR");
  assert.equal(r.trocas, 1);
  assert.equal(JSON.stringify(m), antes);
  assert.notEqual(r.marcas, m);
});

test("textoDeMarcas junta palavras com espaço e parágrafos com linha em branco", () => {
  const m = marcas([["Oi,", 0, 1], ["tudo", 1, 2]], [["bem?", 3, 4]]);
  assert.equal(textoDeMarcas(m), "Oi, tudo\n\nbem?");
});

test("iniciosDasPalavras na ordem de leitura", () => {
  const m = marcas([["a", 0, 1], ["b", 1, 2]], [["c", 2.5, 3]]);
  assert.deepEqual(iniciosDasPalavras(m), [0, 1, 2.5]);
});

test("indicePalavra: antes, exato, entre, depois e lista vazia", () => {
  const inicios = [0, 1, 2.5, 4];
  assert.equal(indicePalavra(inicios, -1), -1, "antes do primeiro");
  assert.equal(indicePalavra(inicios, 0), 0, "exato no primeiro");
  assert.equal(indicePalavra(inicios, 2.5), 2, "exato no meio");
  assert.equal(indicePalavra(inicios, 2), 1, "entre dois inícios");
  assert.equal(indicePalavra(inicios, 4), 3, "exato no último");
  assert.equal(indicePalavra(inicios, 99), 3, "depois do último");
  assert.equal(indicePalavra([], 1), -1, "sem palavras");
});
