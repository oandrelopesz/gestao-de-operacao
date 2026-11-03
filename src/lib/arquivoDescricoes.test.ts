import { test } from "node:test";
import assert from "node:assert/strict";
import { camposParaSalvar, descricoesDe, lerDescricoes, limparDescricoes, previaDescricao, resumoDescricoes, novaDescricao } from "./arquivoDescricoes.ts";

const d = (titulo: string, texto: string, id = titulo) => ({ id, titulo, texto });

test("lerDescricoes ignora o que não tem a forma certa", () => {
  assert.deepEqual(lerDescricoes(null), []);
  assert.deepEqual(lerDescricoes("x"), []);
  assert.deepEqual(lerDescricoes([1, null, { a: 1 }, { id: "a", titulo: "T", texto: "X" }]), [d("T", "X", "a")]);
  assert.equal(lerDescricoes([{ texto: "só texto" }])[0].titulo, "");
  assert.ok(lerDescricoes([{ texto: "só texto" }])[0].id);
});

test("descricoesDe usa o jsonb e, sem ele, a observação antiga", () => {
  assert.deepEqual(descricoesDe({ descricoes: [d("A", "um", "1")], observacoes: "velho" }), [d("A", "um", "1")]);
  assert.deepEqual(descricoesDe({ descricoes: [], observacoes: " velho " }), [{ id: "observacoes-antigas", titulo: "Observações", texto: "velho" }]);
  assert.deepEqual(descricoesDe({ descricoes: [], observacoes: null }), []);
  assert.deepEqual(descricoesDe({}), []);
});

test("limparDescricoes corta espaços e descarta as vazias, mantendo a ordem", () => {
  const r = limparDescricoes([d(" A ", " x ", "1"), d("", "  ", "2"), d("", "só texto", "3"), d("só nome", "", "4")]);
  assert.deepEqual(r.map((x) => x.id), ["1", "3", "4"]);
  assert.equal(r[0].titulo, "A");
  assert.equal(r[0].texto, "x");
});

test("resumoDescricoes junta nome e texto de todas; null sem nenhuma", () => {
  assert.equal(resumoDescricoes([d("A", "um"), d("B", "dois")]), "A\num\n\nB\ndois");
  assert.equal(resumoDescricoes([d("", "só texto")]), "só texto");
  assert.equal(resumoDescricoes([d("só nome", "")]), "só nome");
  assert.equal(resumoDescricoes([d("", " ")]), null);
  assert.equal(resumoDescricoes([]), null);
});

test("camposParaSalvar devolve a lista limpa e o resumo", () => {
  const r = camposParaSalvar([d("A", "um", "1"), d("", "", "2")]);
  assert.deepEqual(r.descricoes, [d("A", "um", "1")]);
  assert.equal(r.observacoes, "A\num");
  assert.deepEqual(camposParaSalvar([]), { descricoes: [], observacoes: null });
});

test("previaDescricao mostra nome, primeira linha e quantas mais existem", () => {
  assert.equal(previaDescricao([]), "");
  assert.equal(previaDescricao([d("Legenda", "\nlinha 1\nlinha 2")]), "Legenda: linha 1");
  assert.equal(previaDescricao([d("", "texto")]), "texto");
  assert.equal(previaDescricao([d("A", "x"), d("B", "y"), d("C", "z")]), "A: x (+2)");
});

test("novaDescricao gera ids diferentes", () => {
  assert.notEqual(novaDescricao().id, novaDescricao().id);
});
