import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lerFiltroConclusao,
  estaConcluido,
  filtrarPorConclusao,
  agruparCursos,
  patchConclusao,
  rotuloConclusao,
  contarConclusao,
} from "./cursoConclusao.ts";

const c = (id: string, em_andamento: boolean, concluido_em?: string | null) => ({ id, em_andamento, concluido_em });

test("lerFiltroConclusao aceita só os três valores; o resto vira todos", () => {
  assert.equal(lerFiltroConclusao("todos"), "todos");
  assert.equal(lerFiltroConclusao("nao_concluidos"), "nao_concluidos");
  assert.equal(lerFiltroConclusao("concluidos"), "concluidos");
  assert.equal(lerFiltroConclusao("lixo"), "todos");
  assert.equal(lerFiltroConclusao(""), "todos");
  assert.equal(lerFiltroConclusao(undefined), "todos");
  assert.equal(lerFiltroConclusao(null), "todos");
  assert.equal(lerFiltroConclusao(42), "todos");
  assert.equal(lerFiltroConclusao(["concluidos"]), "todos");
});

test("estaConcluido: data preenchida é concluído; vazio, nulo ou ausente não", () => {
  assert.equal(estaConcluido({ concluido_em: "2026-10-01" }), true);
  assert.equal(estaConcluido({ concluido_em: null }), false);
  assert.equal(estaConcluido({ concluido_em: "" }), false);
  assert.equal(estaConcluido({}), false);
});

test("filtrarPorConclusao respeita o filtro e a ordem de entrada", () => {
  const lista = [c("a", true), c("b", false, "2026-09-30"), c("c", false), c("d", false, "2026-10-01")];
  assert.deepEqual(filtrarPorConclusao(lista, "todos").map((x) => x.id), ["a", "b", "c", "d"]);
  assert.deepEqual(filtrarPorConclusao(lista, "nao_concluidos").map((x) => x.id), ["a", "c"]);
  assert.deepEqual(filtrarPorConclusao(lista, "concluidos").map((x) => x.id), ["b", "d"]);
  assert.deepEqual(filtrarPorConclusao([], "concluidos"), []);
  // "todos" devolve uma cópia, não a própria lista
  assert.notEqual(filtrarPorConclusao(lista, "todos"), lista);
});

test("agruparCursos: concluído vai só para concluidos, mesmo com em_andamento verdadeiro", () => {
  const lista = [
    c("a", true),
    c("b", false, "2026-09-30"),
    c("c", false),
    c("d", true, "2026-10-01"), // dado antigo incoerente
    c("e", true),
  ];
  const g = agruparCursos(lista);
  assert.deepEqual(g.emAndamento.map((x) => x.id), ["a", "e"]);
  assert.deepEqual(g.outros.map((x) => x.id), ["c"]);
  assert.deepEqual(g.concluidos.map((x) => x.id), ["b", "d"]);
  assert.deepEqual(agruparCursos([]), { emAndamento: [], outros: [], concluidos: [] });
});

test("patchConclusao: concluir grava a data e desliga o em andamento; desmarcar só limpa a data", () => {
  assert.deepEqual(patchConclusao(true, "2026-10-01"), { concluido_em: "2026-10-01", em_andamento: false });
  assert.deepEqual(patchConclusao(false, "2026-10-01"), { concluido_em: null });
});

test("rotuloConclusao formata AAAA-MM-DD sem deslocar o dia", () => {
  assert.equal(rotuloConclusao("2026-10-01"), "Concluído em 01/10/2026");
  assert.equal(rotuloConclusao("2027-01-31"), "Concluído em 31/01/2027");
  assert.equal(rotuloConclusao("2026-03-08"), "Concluído em 08/03/2026");
  // vindo do banco como timestamp, só o dia conta
  assert.equal(rotuloConclusao("2026-10-01T00:00:00+00:00"), "Concluído em 01/10/2026");
  // valor fora do formato não quebra a tela
  assert.equal(rotuloConclusao("lixo"), "Concluído");
});

test("contarConclusao: em andamento e pausados contam só os não concluídos", () => {
  const lista = [c("a", true), c("b", true, "2026-10-01"), c("c", false), c("d", false, "2026-09-01"), c("e", true)];
  assert.deepEqual(contarConclusao(lista), { total: 5, emAndamento: 2, pausados: 1, concluidos: 2 });
  assert.deepEqual(contarConclusao([]), { total: 0, emAndamento: 0, pausados: 0, concluidos: 0 });
});
