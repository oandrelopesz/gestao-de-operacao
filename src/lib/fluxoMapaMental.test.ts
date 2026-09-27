import test from "node:test";
import assert from "node:assert/strict";
import { corDoRamo, curvaDaLigacao, descendentes, ladoParaNovoFilho, organizar, type NoMapa } from "./fluxoMapaMental.ts";

const no = (id: string, pai: string | null, lado: "dir" | "esq", ordem: number, extra: Partial<NoMapa> = {}): NoMapa => ({
  id, pai, lado, ordem, largura: 180, altura: 50, ...extra,
});

// raiz R; à direita A (com A1, A2) e B; à esquerda C
const mapa: NoMapa[] = [
  no("R", null, "dir", 0, { largura: 240, altura: 64 }),
  no("A", "R", "dir", 0),
  no("B", "R", "dir", 1),
  no("C", "R", "esq", 2),
  no("A1", "A", "dir", 0),
  no("A2", "A", "dir", 1, { altura: 90 }),
];

const caixa = (r: ReturnType<typeof organizar>, n: NoMapa) => ({ ...r.posicoes[n.id], largura: n.largura, altura: n.altura });
const sobrepoe = (a: { x: number; y: number; largura: number; altura: number }, b: typeof a) =>
  a.x < b.x + b.largura && b.x < a.x + a.largura && a.y < b.y + b.altura && b.y < a.y + a.altura;

test("raiz fica onde está; filhos à direita e à esquerda, sem sobrepor", () => {
  const r = organizar(mapa, "R", { x: 0, y: 0 });
  assert.deepEqual(r.posicoes.R, { x: 0, y: 0 });
  assert.ok(r.posicoes.A.x >= 240 + 40, "direita começa depois da raiz");
  assert.ok(r.posicoes.C.x + 180 <= -40, "esquerda termina antes da raiz");
  assert.ok(r.posicoes.A1.x > r.posicoes.A.x + 180, "neto mais à direita que o filho");
  for (let i = 0; i < mapa.length; i++) {
    for (let j = i + 1; j < mapa.length; j++) assert.ok(!sobrepoe(caixa(r, mapa[i]), caixa(r, mapa[j])), `${mapa[i].id} × ${mapa[j].id}`);
  }
});

test("irmãos na ordem de cima para baixo e o pai centrado no seu grupo de filhos", () => {
  const r = organizar(mapa, "R", { x: 0, y: 0 });
  assert.ok(r.posicoes.A.y < r.posicoes.B.y);
  assert.ok(r.posicoes.A1.y < r.posicoes.A2.y);
  const centroA = r.posicoes.A.y + 25;
  const topo = r.posicoes.A1.y, fundo = r.posicoes.A2.y + 90;
  assert.ok(Math.abs(centroA - (topo + fundo) / 2) < 1e-6);
});

test("ramo recolhido não ocupa espaço nem é posicionado", () => {
  const recolhido = mapa.map((n) => (n.id === "A" ? { ...n, recolhido: true } : n));
  const r = organizar(recolhido, "R", { x: 0, y: 0 });
  assert.equal(r.posicoes.A1, undefined);
  const aberto = organizar(mapa, "R", { x: 0, y: 0 });
  assert.ok(r.posicoes.B.y - r.posicoes.A.y < aberto.posicoes.B.y - aberto.posicoes.A.y);
  assert.deepEqual(r.ligacoes.map((l) => l.filho).sort(), ["A", "B", "C"]);
});

test("ligações saem da borda do pai e chegam na borda do filho, do lado certo", () => {
  const r = organizar(mapa, "R", { x: 0, y: 0 });
  const la = r.ligacoes.find((l) => l.filho === "A")!;
  assert.equal(la.de.x, 240);
  assert.equal(la.para.x, r.posicoes.A.x);
  const lc = r.ligacoes.find((l) => l.filho === "C")!;
  assert.equal(lc.de.x, 0);
  assert.equal(lc.para.x, r.posicoes.C.x + 180);
});

test("curva em S com 4 pontos, relativa ao início", () => {
  const pts = curvaDaLigacao({ x: 100, y: 50 }, { x: 300, y: 150 });
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts[3], [200, 100]);
  assert.equal(pts[1][1], 0);
  assert.equal(pts[2][1], 100);
});

test("descendentes, lado equilibrado e cor por ramo", () => {
  assert.deepEqual(descendentes(mapa, "A").sort(), ["A1", "A2"]);
  assert.deepEqual(descendentes(mapa, "R").length, 5);
  assert.equal(ladoParaNovoFilho(mapa, "R"), "esq"); // 2 à direita, 1 à esquerda
  assert.equal(ladoParaNovoFilho(mapa, "A"), "dir"); // herda o lado do pai
  assert.notEqual(corDoRamo(0).traco, corDoRamo(1).traco);
  assert.equal(corDoRamo(0).traco, corDoRamo(8).traco); // paleta dá a volta
});
