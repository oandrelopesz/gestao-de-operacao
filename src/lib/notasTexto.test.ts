import { test } from "node:test";
import assert from "node:assert/strict";
import { SEM_TEMA, TODOS, contarPorTema, filtrarNotas, previaSemTitulo, tituloOuPrimeiraLinha } from "./notasTexto.ts";

const n = (id: string, titulo: string, conteudo: string, tema_id: string | null, updated_at: string) => ({ id, titulo, conteudo, tema_id, updated_at });
const notas = [
  n("1", "Ideia de criativo", "gancho com ROAS", "a", "2026-09-20T10:00:00Z"),
  n("2", "Reunião", "falar da verba", null, "2026-09-24T10:00:00Z"),
  n("3", "Promoção", "Black Friday", "b", "2026-09-22T10:00:00Z"),
];

test("filtrarNotas: todos, mais recente primeiro", () => {
  assert.deepEqual(filtrarNotas(notas, TODOS, "").map((x) => x.id), ["2", "3", "1"]);
});

test("filtrarNotas: por tema e sem tema", () => {
  assert.deepEqual(filtrarNotas(notas, "a", "").map((x) => x.id), ["1"]);
  assert.deepEqual(filtrarNotas(notas, SEM_TEMA, "").map((x) => x.id), ["2"]);
});

test("filtrarNotas: busca no título e no texto, sem acento", () => {
  assert.deepEqual(filtrarNotas(notas, TODOS, "reuniao").map((x) => x.id), ["2"]);
  assert.deepEqual(filtrarNotas(notas, TODOS, "roas").map((x) => x.id), ["1"]);
  assert.deepEqual(filtrarNotas(notas, TODOS, "promocao").map((x) => x.id), ["3"]);
});

test("contarPorTema", () => {
  assert.deepEqual(contarPorTema(notas), { [TODOS]: 3, a: 1, b: 1, [SEM_TEMA]: 1 });
});

test("tituloOuPrimeiraLinha", () => {
  assert.equal(tituloOuPrimeiraLinha("  Título ", "x"), "Título");
  assert.equal(tituloOuPrimeiraLinha("", "\n\n  primeira linha \nsegunda"), "primeira linha");
  assert.equal(tituloOuPrimeiraLinha("", "a".repeat(100)).length, 80);
  assert.equal(tituloOuPrimeiraLinha("", ""), "");
});

test("previaSemTitulo: não repete a primeira linha igual ao título", () => {
  assert.equal(previaSemTitulo("Ideia", "Ideia\nsegunda"), "segunda");
  assert.equal(previaSemTitulo("Ideia", "\n  Ideia \n\nsegunda\n"), "segunda");
  assert.equal(previaSemTitulo("Outro", "Ideia\nsegunda"), "Ideia\nsegunda");
  assert.equal(previaSemTitulo("Ideia", "Ideia"), "");
});
