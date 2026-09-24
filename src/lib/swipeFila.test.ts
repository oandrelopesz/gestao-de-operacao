import { test } from "node:test";
import assert from "node:assert/strict";
import { separarFila, novasPosicoes, moverNaFila, moverVariosNaFila, posicaoNoTopo, podeTentarDeNovo, type JobFila } from "./swipeFila.ts";

const j = (id: string, status: JobFila["status"], posicao: number, created_at = "2026-09-23T10:00:00Z"): JobFila =>
  ({ id, item_id: `i-${id}`, status, posicao, created_at, iniciado_em: null, tipo: "download" });

test("separarFila: em andamento, esperando pela posição (empate pela criação) e pausados; ignora ok/erro", () => {
  const f = separarFila([
    j("c", "aguardando", 5), j("r", "rodando", 1), j("a", "aguardando", 2, "2026-09-23T11:00:00Z"),
    j("b", "aguardando", 2, "2026-09-23T09:00:00Z"), j("p", "pausado", 0), j("ok", "ok", 0), j("e", "erro", 0),
  ]);
  assert.deepEqual(f.rodando.map((x) => x.id), ["r"]);
  assert.deepEqual(f.aguardando.map((x) => x.id), ["b", "a", "c"]);
  assert.deepEqual(f.pausados.map((x) => x.id), ["p"]);
});

test("novasPosicoes: numera a partir de 0 na ordem dada e só devolve quem mudou", () => {
  const atual = [j("a", "aguardando", 0), j("b", "aguardando", 1), j("c", "aguardando", 1726000000000)];
  assert.deepEqual(novasPosicoes(atual, ["c", "a", "b"]), [
    { id: "c", posicao: 0 }, { id: "a", posicao: 1 }, { id: "b", posicao: 2 },
  ]);
  assert.deepEqual(novasPosicoes(atual, ["a", "b", "c"]), [{ id: "c", posicao: 2 }]);
});

test("moverNaFila: sobe, desce e não sai dos limites", () => {
  assert.deepEqual(moverNaFila(["a", "b", "c"], "c", -1), ["a", "c", "b"]);
  assert.deepEqual(moverNaFila(["a", "b", "c"], "a", 1), ["b", "a", "c"]);
  assert.deepEqual(moverNaFila(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
  assert.deepEqual(moverNaFila(["a", "b", "c"], "x", 1), ["a", "b", "c"]);
});

test("posicaoNoTopo: uma antes da menor posição de quem espera; fila vazia dá 0", () => {
  assert.equal(posicaoNoTopo([j("a", "aguardando", 3), j("b", "aguardando", 7)]), 2);
  assert.equal(posicaoNoTopo([]), 0);
});

test("podeTentarDeNovo: só falhou com link", () => {
  assert.equal(podeTentarDeNovo({ status: "falhou", link: "https://x" }), true);
  assert.equal(podeTentarDeNovo({ status: "falhou", link: null }), false);
  assert.equal(podeTentarDeNovo({ status: "pronto", link: "https://x" }), false);
});

test("moverVariosNaFila: selecionados vão juntos para o topo ou o fim, mantendo a ordem entre eles", () => {
  const ids = ["a", "b", "c", "d", "e"];
  assert.deepEqual(moverVariosNaFila(ids, ["d", "b"], "topo"), ["b", "d", "a", "c", "e"]);
  assert.deepEqual(moverVariosNaFila(ids, ["a", "c"], "fim"), ["b", "d", "e", "a", "c"]);
  assert.deepEqual(moverVariosNaFila(ids, ["x"], "topo"), ids);
});
