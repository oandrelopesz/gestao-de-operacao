import test from "node:test";
import assert from "node:assert/strict";
import { emLotes, esperarOcioso, RESPIRO_MS } from "./aquecimento.ts";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("emLotes: nunca roda mais tarefas ao mesmo tempo que o tamanho do lote, e roda todas na ordem dos lotes", async () => {
  let rodando = 0;
  let pico = 0;
  const ordem: number[] = [];
  const tarefas = Array.from({ length: 7 }, (_, i) => async () => {
    rodando++;
    pico = Math.max(pico, rodando);
    await esperar(5);
    ordem.push(i);
    rodando--;
  });
  let esperas = 0;
  await emLotes(tarefas, 3, async () => { esperas++; });
  assert.equal(pico, 3);
  assert.equal(esperas, 3); // 7 tarefas em lotes de 3 → 3 lotes, uma espera antes de cada
  assert.deepEqual([...ordem].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(ordem.slice(0, 3).every((i) => i < 3) && ordem.slice(3, 6).every((i) => i >= 3 && i < 6));
});

test("emLotes: a falha de uma tarefa (inclusive síncrona) não impede as outras", async () => {
  const feitas: string[] = [];
  await emLotes([
    async () => { throw new Error("tabela ausente"); },
    () => { throw new Error("síncrona"); },
    async () => { feitas.push("ok"); },
  ], 2, async () => {});
  assert.deepEqual(feitas, ["ok"]);
});

test("emLotes: para de começar lotes quando cancelado", async () => {
  const feitas: number[] = [];
  let cancelar = false;
  const tarefas = [0, 1, 2, 3].map((i) => async () => { feitas.push(i); if (i === 1) cancelar = true; });
  await emLotes(tarefas, 2, async () => {}, () => cancelar);
  assert.deepEqual(feitas, [0, 1]);
});

test("esperarOcioso: sem requestIdleCallback (Safari/iPhone), resolve depois de um respiro curto", async () => {
  const t0 = Date.now();
  await esperarOcioso();
  const passou = Date.now() - t0;
  assert.ok(passou >= RESPIRO_MS - 20 && passou < RESPIRO_MS + 500, `levou ${passou} ms`);
});
