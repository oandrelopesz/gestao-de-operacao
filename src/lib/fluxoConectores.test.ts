import test from "node:test";
import assert from "node:assert/strict";
import { contem, ladoOposto, pontoDoLado, posicaoAoLado } from "./fluxoConectores.ts";

const perto = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
};

test("pontos de conexão no meio de cada lado, afastados para fora", () => {
  const c = { x: 100, y: 50, width: 200, height: 100 };
  perto(pontoDoLado(c, "cima"), { x: 200, y: 50 });
  perto(pontoDoLado(c, "direita", 10), { x: 310, y: 100 });
  perto(pontoDoLado(c, "baixo", 10), { x: 200, y: 160 });
  perto(pontoDoLado(c, "esquerda"), { x: 100, y: 100 });
});

test("forma girada 90°: o ponto 'direita' vai para baixo do centro", () => {
  const c = { x: 0, y: 0, width: 200, height: 100, angle: Math.PI / 2 };
  perto(pontoDoLado(c, "direita"), { x: 100, y: 150 });
});

test("contem respeita a margem e o giro", () => {
  const c = { x: 0, y: 0, width: 100, height: 40 };
  assert.ok(contem(c, { x: 50, y: 20 }));
  assert.ok(!contem(c, { x: 50, y: 55 }));
  assert.ok(contem(c, { x: 50, y: 55 }, 20));
  const girada = { ...c, angle: Math.PI / 2 };
  assert.ok(contem(girada, { x: 50, y: -25 }));
});

test("cópia ao lado fica centrada no eixo e anda se o lugar estiver ocupado", () => {
  const origem = { x: 0, y: 0, width: 200, height: 100 };
  assert.deepEqual(posicaoAoLado(origem, 200, 100, "direita", []), { x: 280, y: 0 });
  assert.deepEqual(posicaoAoLado(origem, 100, 60, "baixo", []), { x: 50, y: 180 });
  const ocupada = { x: 280, y: 0, width: 200, height: 100 };
  const pos = posicaoAoLado(origem, 200, 100, "direita", [ocupada]);
  assert.equal(pos.y, 0);
  assert.ok(pos.x >= 280 + 200, `andou para a direita: ${pos.x}`);
  assert.equal(ladoOposto("direita"), "esquerda");
  assert.equal(ladoOposto("cima"), "baixo");
});

test("lugarLivre: centro vazio fica no centro; ocupado, vai para o espaço livre mais perto", async () => {
  const { lugarLivre } = await import("./fluxoConectores.ts");
  assert.deepEqual(lugarLivre({ x: 500, y: 300 }, 200, 100, []), { x: 400, y: 250 });
  const ocupada = { x: 380, y: 230, width: 240, height: 140 };
  const pos = lugarLivre({ x: 500, y: 300 }, 200, 100, [ocupada]);
  const caixa = { ...pos, width: 200, height: 100 };
  const sobrepoe = caixa.x < ocupada.x + ocupada.width + 24 && caixa.x + caixa.width + 24 > ocupada.x &&
    caixa.y < ocupada.y + ocupada.height + 24 && caixa.y + caixa.height + 24 > ocupada.y;
  assert.ok(!sobrepoe, JSON.stringify(pos));
  // O mais perto possível: não anda mais que a soma das metades + margem em nenhum eixo
  assert.ok(Math.abs(pos.x + 100 - 500) <= 260 && Math.abs(pos.y + 50 - 300) <= 160, JSON.stringify(pos));
});

test("ladoDeFrente: o lado do destino voltado para a origem; ladoPerto encaixa só perto da bolinha", async () => {
  const { ladoDeFrente, ladoPerto } = await import("./fluxoConectores.ts");
  const destino = { x: 400, y: 0, width: 200, height: 100 };
  assert.equal(ladoDeFrente({ x: 0, y: 0, width: 200, height: 100 }, destino), "esquerda");
  assert.equal(ladoDeFrente({ x: 400, y: 400, width: 200, height: 100 }, destino), "baixo");
  assert.equal(ladoDeFrente({ x: 420, y: -300, width: 100, height: 60 }, destino), "cima");
  assert.equal(ladoPerto(destino, { x: 605, y: 52 }, 20), "direita");
  assert.equal(ladoPerto(destino, { x: 500, y: 50 }, 20), null);
});
