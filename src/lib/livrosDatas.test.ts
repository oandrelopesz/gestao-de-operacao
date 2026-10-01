import test from "node:test";
import assert from "node:assert/strict";
import { hojeBrasilia } from "./entrega.ts";
import { anoDaData, contarLidosNoAno } from "./livrosDatas.ts";

test("anoDaData lê o ano direto da string, sem passar por fuso", () => {
  assert.equal(anoDaData("2026-01-01"), 2026);
  assert.equal(anoDaData("2025-12-31"), 2025);
  assert.equal(anoDaData("2026-12-31"), 2026);
});

test("31/12 às 22h30 de Brasília ainda é 31/12 (e o ano é o mesmo)", () => {
  const hoje = hojeBrasilia(new Date("2026-12-31T22:30:00-03:00"));
  assert.equal(hoje, "2026-12-31");
  assert.equal(anoDaData(hoje), 2026);
});

test("contarLidosNoAno conta o livro concluído em 1º de janeiro no ano certo", () => {
  const livros = [
    { lido: true, data_conclusao: "2026-01-01" },
    { lido: true, data_conclusao: "2025-12-31" },
    { lido: true, data_conclusao: "2026-06-15" },
  ];
  assert.equal(contarLidosNoAno(livros, "2026-03-10"), 2);
  assert.equal(contarLidosNoAno(livros, "2025-12-31"), 1);
});

test("contarLidosNoAno ignora conclusão nula e livro não lido", () => {
  const livros = [
    { lido: true, data_conclusao: null },
    { lido: false, data_conclusao: "2026-02-02" },
    { lido: true, data_conclusao: "2026-02-03" },
  ];
  assert.equal(contarLidosNoAno(livros, "2026-09-30"), 1);
  assert.equal(contarLidosNoAno([], "2026-09-30"), 0);
});
