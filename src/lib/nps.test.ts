import test from "node:test";
import assert from "node:assert/strict";
import { categoriaDoScore, getScoreCategory, NPS_SCORE_CATEGORIES } from "./nps.ts";

test("categoriaDoScore: limites das faixas 40/30/20", () => {
  assert.equal(categoriaDoScore(50), "ancora");
  assert.equal(categoriaDoScore(40), "ancora");
  assert.equal(categoriaDoScore(39), "saudavel");
  assert.equal(categoriaDoScore(30), "saudavel");
  assert.equal(categoriaDoScore(29), "em_risco");
  assert.equal(categoriaDoScore(20), "em_risco");
  assert.equal(categoriaDoScore(19), "critico");
  assert.equal(categoriaDoScore(0), "critico");
});

test("categoriaDoScore: sem nota é sem_avaliacao", () => {
  assert.equal(categoriaDoScore(null), "sem_avaliacao");
  assert.equal(categoriaDoScore(undefined), "sem_avaliacao");
});

test("categoriaDoScore: nota 43 é âncora (antes a view dizia saudável com 45/35/25)", () => {
  assert.equal(categoriaDoScore(43), "ancora");
});

test("getScoreCategory usa a mesma escala e devolve o mesmo que antes", () => {
  for (let score = 0; score <= 50; score++) {
    const categoria = getScoreCategory(score);
    assert.equal(categoria.id, categoriaDoScore(score), `nota ${score}`);
    assert.ok(score >= categoria.min && score <= categoria.max, `nota ${score} dentro da faixa de ${categoria.id}`);
  }
  assert.equal(getScoreCategory(40), NPS_SCORE_CATEGORIES[0]);
  assert.equal(getScoreCategory(0), NPS_SCORE_CATEGORIES[3]);
});
