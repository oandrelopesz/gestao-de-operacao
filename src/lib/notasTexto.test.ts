import { test } from "node:test";
import assert from "node:assert/strict";
import { SEM_TEMA, TODOS, contarPorTema, filtrarNotas, previaSemTitulo, tituloOuPrimeiraLinha } from "./notasTexto.ts";
import { MENSAGEM_NENHUM, MENSAGEM_PARECIDOS } from "./search.ts";

const n = (id: string, titulo: string, conteudo: string, tema_id: string | null, updated_at: string) => ({ id, titulo, conteudo, tema_id, updated_at });
const notas = [
  n("1", "Ideia de criativo", "gancho com ROAS", "a", "2026-09-20T10:00:00Z"),
  n("2", "Reunião", "falar da verba", null, "2026-09-24T10:00:00Z"),
  n("3", "Promoção", "Black Friday", "b", "2026-09-22T10:00:00Z"),
];

test("filtrarNotas: todos, mais recente primeiro", () => {
  const r = filtrarNotas(notas, TODOS, "");
  assert.deepEqual(r.itens.map((x) => x.id), ["2", "3", "1"]);
  assert.equal(r.modo, "todos");
  assert.equal(r.mensagem, null);
});

test("filtrarNotas: por tema e sem tema", () => {
  assert.deepEqual(filtrarNotas(notas, "a", "").itens.map((x) => x.id), ["1"]);
  assert.deepEqual(filtrarNotas(notas, SEM_TEMA, "").itens.map((x) => x.id), ["2"]);
});

test("filtrarNotas: busca no título e no texto, sem acento", () => {
  assert.deepEqual(filtrarNotas(notas, TODOS, "reuniao").itens.map((x) => x.id), ["2"]);
  assert.deepEqual(filtrarNotas(notas, TODOS, "roas").itens.map((x) => x.id), ["1"]);
  assert.deepEqual(filtrarNotas(notas, TODOS, "promocao").itens.map((x) => x.id), ["3"]);
  assert.deepEqual(filtrarNotas(notas, TODOS, "REUNIÃO").itens.map((x) => x.id), ["2"]);
});

test("filtrarNotas: aceita erro de digitação", () => {
  assert.deepEqual(filtrarNotas(notas, TODOS, "reunioa").itens.map((x) => x.id), ["2"]); // letras vizinhas trocadas
  assert.deepEqual(filtrarNotas(notas, TODOS, "blak friday").itens.map((x) => x.id), ["3"]); // letra a menos
  assert.deepEqual(filtrarNotas(notas, TODOS, "criatvo").itens.map((x) => x.id), ["1"]); // letra a menos no título
  assert.equal(filtrarNotas(notas, TODOS, "blak friday").modo, "exato");
});

test("filtrarNotas: parecidos e nenhum trazem a mensagem", () => {
  const parecidos = filtrarNotas(notas, TODOS, "promocao zebra");
  assert.equal(parecidos.modo, "parecidos");
  assert.equal(parecidos.mensagem, MENSAGEM_PARECIDOS);
  assert.deepEqual(parecidos.itens.map((x) => x.id), ["3"]);
  const nenhum = filtrarNotas(notas, TODOS, "zebra");
  assert.equal(nenhum.modo, "nenhum");
  assert.equal(nenhum.mensagem, MENSAGEM_NENHUM);
  assert.deepEqual(nenhum.itens, []);
});

test("filtrarNotas: o tema vale antes da busca; no empate a mais recente vem primeiro, título antes do texto", () => {
  assert.equal(filtrarNotas(notas, "a", "promocao").modo, "nenhum");
  const com = [
    n("v1", "Outra coisa", "a verba do mês", "a", "2026-09-26T10:00:00Z"), // só no texto, mais recente
    n("v2", "Verba mensal", "x", "a", "2026-09-10T10:00:00Z"), // no título, mais antiga
    n("v3", "Planejar verba", "y", "a", "2026-09-20T10:00:00Z"), // no título, mais recente que a v2
  ];
  assert.deepEqual(filtrarNotas(com, TODOS, "verba").itens.map((x) => x.id), ["v3", "v2", "v1"]);
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
