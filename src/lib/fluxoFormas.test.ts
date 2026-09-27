import test from "node:test";
import assert from "node:assert/strict";
import { FORMAS_EXTRAS, pecasDa, type Peca } from "./fluxoFormas.ts";

const poligonos = (p: Peca[]) => p.filter((x): x is Extract<Peca, { tipo: "poligono" }> => x.tipo === "poligono");
const ancoras = (p: Peca[]) => p.filter((x): x is Extract<Peca, { tipo: "ancora" }> => x.tipo === "ancora");

test("todo polígono é fechado, começa em (0,0) e fica dentro da caixa", () => {
  for (const f of FORMAS_EXTRAS) {
    const x0 = 100, y0 = 50;
    const pecas = pecasDa(f.id, x0, y0);
    assert.ok(pecas.length > 0, f.id);
    for (const p of poligonos(pecas)) {
      assert.deepEqual(p.pontos[0], [0, 0], `${f.id}: 1º ponto`);
      assert.deepEqual(p.pontos[p.pontos.length - 1], [0, 0], `${f.id}: fechado`);
      for (const [px, py] of p.pontos) {
        assert.ok(p.x + px >= x0 - 0.01 && p.x + px <= x0 + f.largura + 0.01, `${f.id}: x fora`);
        assert.ok(p.y + py >= y0 - 0.01 && p.y + py <= y0 + f.altura + 0.01, `${f.id}: y fora`);
      }
    }
  }
});

test("funil: N etapas cada vez mais estreitas, com rótulos", () => {
  const pecas = pecasDa("funil", 0, 0, { largura: 400, altura: 300, etapas: 5, rotulos: ["Atrair", "Captar"] });
  const ps = poligonos(pecas);
  assert.equal(ps.length, 5);
  const larguraTopo = (p: (typeof ps)[number]) => Math.abs(p.pontos[1][0] - p.pontos[0][0]);
  for (let i = 1; i < ps.length; i++) assert.ok(larguraTopo(ps[i]) < larguraTopo(ps[i - 1]));
  // Cada faixa tem a sua âncora (seta presa por faixa) com o rótulo dentro
  assert.deepEqual(ancoras(pecas).map((a) => a.texto), ["Atrair", "Captar", "Etapa 3", "Etapa 4", "Etapa 5"]);
});

test("pirâmide começa em ponta; cone e cilindro têm elipse", () => {
  const pir = poligonos(pecasDa("piramide", 0, 0, { etapas: 3 }));
  assert.equal(pir.length, 3);
  assert.equal(pir[0].pontos.length, 4); // triângulo: 3 pontos + fechamento
  assert.ok(pecasDa("cone", 0, 0).some((p) => p.tipo === "elipse"));
  assert.ok(pecasDa("cilindro", 0, 0).some((p) => p.tipo === "elipse"));
});

test("estrela tem 5 pontas e tamanho próprio respeita as opções", () => {
  const [estrela] = poligonos(pecasDa("estrela", 0, 0, { largura: 200, altura: 200 }));
  assert.equal(estrela.pontos.length, 11);
  const [tri] = poligonos(pecasDa("triangulo", 10, 10, { largura: 80, altura: 60 }));
  const xs = tri.pontos.map(([x]) => tri.x + x);
  assert.equal(Math.max(...xs) - Math.min(...xs), 80);
});

test("âncora da ponta da pirâmide cobre os 2/3 de baixo do triângulo; as outras, a faixa inteira", () => {
  const pecas = pecasDa("piramide", 0, 0, { largura: 300, altura: 300, etapas: 3 });
  const [ponta, meio] = poligonos(pecas);
  const [a0, a1] = ancoras(pecas);
  const altura = (p: typeof ponta) => Math.max(...p.pontos.map(([, y]) => y));
  assert.equal(Math.round(a0.y + a0.altura / 2), Math.round(ponta.y + (altura(ponta) * 2) / 3));
  assert.equal(Math.round(a0.y + a0.altura), Math.round(ponta.y + altura(ponta)));
  assert.equal(Math.round(a1.y), Math.round(meio.y));
  assert.equal(Math.round(a1.altura), Math.round(altura(meio)));
});

test("toda forma tem âncora dentro da caixa, por cima do desenho (depois dos polígonos)", () => {
  for (const f of FORMAS_EXTRAS) {
    const x0 = 40, y0 = 30;
    const pecas = pecasDa(f.id, x0, y0);
    const as = ancoras(pecas);
    assert.ok(as.length >= 1, f.id);
    const ultimoDesenho = Math.max(...pecas.map((p, i) => (p.tipo === "ancora" ? -1 : i)));
    assert.ok(pecas.findIndex((p) => p.tipo === "ancora") > ultimoDesenho, `${f.id}: âncora por cima`);
    for (const a of as) {
      assert.ok(a.x >= x0 - 0.01 && a.y >= y0 - 0.01, `${f.id}: canto`);
      assert.ok(a.x + a.largura <= x0 + f.largura + 0.01 && a.y + a.altura <= y0 + f.altura + 0.01, `${f.id}: tamanho`);
    }
  }
  assert.equal(ancoras(pecasDa("nuvem", 0, 0))[0].forma, "elipse");
  assert.equal(ancoras(pecasDa("hexagono", 0, 0))[0].forma, "retangulo");
});
