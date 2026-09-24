import test from "node:test";
import assert from "node:assert/strict";
import {
  ordenarPassos, ordenarPassosCronologico, ordemAlterada, renumerar, progresso, previsaoTermino, proximoPasso, ordemValida, passosEmConflito,
  posicaoParaNovoPasso, duracaoDias,
} from "./processos.ts";

const p = (id: string, data: string | null, ordem: number, feito = false) => ({ id, data, ordem, concluido_em: feito ? "2026-09-20T10:00:00Z" : null });

test("ordenarPassos: com data na ordem manual, sem data no fim", () => {
  const r = ordenarPassos([p("s1", null, 0), p("a", "2026-09-25", 3), p("b", "2026-09-26", 1), p("s2", null, 2)]);
  assert.deepEqual(r.map((x) => x.id), ["b", "a", "s1", "s2"]);
});

test("renumerar", () => {
  assert.deepEqual(renumerar([p("a", null, 5), p("b", null, 9)]).map((x) => x.ordem), [0, 1]);
});

test("progresso e previsão", () => {
  const ps = [p("a", "2026-09-25", 0, true), p("b", "2026-10-02", 1), p("c", null, 2)];
  assert.equal(progresso(ps), 33);
  assert.equal(progresso([]), 0);
  assert.equal(previsaoTermino(ps), "2026-10-02");
  assert.equal(previsaoTermino([p("c", null, 0)]), null);
  assert.equal(proximoPasso(ps), "b");
  assert.equal(proximoPasso([p("a", null, 0, true)]), null);
});

test("ordemValida: datas não decrescentes e sem data só no fim", () => {
  assert.equal(ordemValida([p("a", "2026-09-25", 0), p("b", "2026-09-25", 1), p("c", null, 2)]), true);
  assert.equal(ordemValida([p("a", "2026-09-26", 0), p("b", "2026-09-25", 1)]), false);
  assert.equal(ordemValida([p("c", null, 0), p("a", "2026-09-25", 1)]), false);
});

test("passosEmConflito: movido + os que ele ultrapassou com datas invertidas", () => {
  // LP (amanhã) e Campanhas (sexta): arrastei Campanhas para antes da LP
  const depois = [p("camp", "2026-09-26", 0), p("lp", "2026-09-24", 1), p("rel", "2026-09-30", 2)];
  assert.deepEqual(passosEmConflito(depois, "camp").sort(), ["camp", "lp"]);
  assert.deepEqual(passosEmConflito([p("a", "2026-09-24", 0), p("b", "2026-09-26", 1)], "b"), []);
  // passo sem data arrastado para antes de passos datados: só ele precisa de data
  assert.deepEqual(passosEmConflito([p("s", null, 0), p("a", "2026-09-24", 1)], "s"), ["s"]);
});

test("posicaoParaNovoPasso: sem data no fim; com data depois dos que têm data <= ela", () => {
  const ps = [p("a", "2026-09-24", 0), p("b", "2026-09-28", 1), p("s", null, 2)];
  assert.equal(posicaoParaNovoPasso(ps, null), 3);
  assert.equal(posicaoParaNovoPasso(ps, "2026-09-25"), 1);
  assert.equal(posicaoParaNovoPasso(ps, "2026-09-30"), 2);
  assert.equal(posicaoParaNovoPasso(ps, "2026-09-01"), 0);
});

test("duracaoDias", () => {
  assert.equal(duracaoDias("2026-09-01T12:00:00Z", "2026-09-11T09:00:00Z"), 10);
});

test("ordenarPassosCronologico: datas fora da ordem manual vão para a posição da data", () => {
  const r = ordenarPassosCronologico([
    p("s1", null, 0), p("a", "2026-09-30", 1), p("b", "2026-09-25", 2), p("c", "2026-09-27", 3), p("s2", null, 4),
  ]);
  assert.deepEqual(r.map((x) => x.id), ["b", "c", "a", "s1", "s2"]);
});

test("ordenarPassosCronologico: empate de data pela ordem; sem data no fim pela ordem", () => {
  const r = ordenarPassosCronologico([p("x", "2026-09-25", 5), p("y", "2026-09-25", 1), p("s2", null, 9), p("s1", null, 2)]);
  assert.deepEqual(r.map((x) => x.id), ["y", "x", "s1", "s2"]);
});

test("ordemAlterada: só envia quem mudou de ordem ou de data", () => {
  const atual = [p("a", "2026-09-25", 0), p("b", "2026-09-26", 1), p("c", null, 2)];
  assert.deepEqual(ordemAlterada(atual, atual), []);
  const nova = [p("b", "2026-09-26", 0), p("a", "2026-09-25", 1), p("c", "2026-09-30", 2)];
  assert.deepEqual(ordemAlterada(atual, nova), [
    { id: "b", ordem: 0 }, { id: "a", ordem: 1 }, { id: "c", ordem: 2, data: "2026-09-30" },
  ]);
});
