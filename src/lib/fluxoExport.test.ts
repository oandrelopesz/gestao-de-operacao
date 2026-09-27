import test from "node:test";
import assert from "node:assert/strict";
import { corNoEscuro, encaixar, escalaSegura, nomeArquivo, ordenarMolduras, paginasPdf, PAPEIS } from "./fluxoExport.ts";

test("nome do arquivo: fluxograma-titulo-data, sem acento nem símbolo", () => {
  const d = new Date(2026, 8, 26);
  assert.equal(nomeArquivo("Funil de Captação — Q4!", "pdf", d), "fluxograma-funil-de-captacao-q4-2026-09-26.pdf");
  assert.equal(nomeArquivo("   ", "png", d), "fluxograma-quadro-2026-09-26.png");
});

test("PDF caber em uma página: paisagem automática para desenho largo, centralizado e com margem", () => {
  const r = paginasPdf({ largura: 2000, altura: 1000 }, { papel: "a4", orientacao: "auto", margem: 36, ajuste: "caber" });
  assert.equal(r.largura, PAPEIS.a4.altura); // paisagem
  assert.equal(r.paginas.length, 1);
  const p = r.paginas[0];
  assert.ok(Math.abs(p.x - 36) < 1e-6, "encosta na margem da esquerda");
  assert.ok(p.y > 36, "centralizado na vertical");
  assert.ok(Math.abs(r.larguraDesenho - (r.largura - 72)) < 1e-6);
});

test("PDF caber: desenho pequeno não é ampliado além de 1,5 pt por pixel", () => {
  const r = paginasPdf({ largura: 100, altura: 50 }, { papel: "a4", orientacao: "retrato", margem: 36, ajuste: "caber" });
  assert.equal(r.escala, 1.5);
  assert.equal(r.largura, PAPEIS.a4.largura);
});

test("PDF tamanho real: 1 px = 0,75 pt, dividido em várias páginas com recorte; automático gasta menos folhas", () => {
  const r = paginasPdf({ largura: 3000, altura: 1000 }, { papel: "a4", orientacao: "auto", margem: 36, ajuste: "real" });
  assert.equal(r.escala, 0.75);
  // 2250 × 750 pt: paisagem (769,9 × 523,3 úteis) = 3 × 2 = 6 folhas; retrato (523,3 × 769,9) = 5 × 1 = 5 folhas
  assert.equal(r.largura, PAPEIS.a4.largura);
  assert.equal(r.paginas.length, 5);
  assert.ok(r.paginas.every((p) => p.recortar));
  assert.ok(Math.abs(r.paginas[1].x - (36 - (r.largura - 72))) < 1e-6, "2ª página desloca uma largura útil");
  const paisagem = paginasPdf({ largura: 3000, altura: 1000 }, { papel: "a4", orientacao: "paisagem", margem: 36, ajuste: "real" });
  assert.equal(paisagem.paginas.length, 6);
  assert.ok(Math.abs(paisagem.paginas[3].y - (36 - (paisagem.altura - 72))) < 1e-6, "2ª linha desloca uma altura útil");
});

test("PNG: escala reduz para caber nos limites do navegador", () => {
  assert.equal(escalaSegura(1000, 800, 4), 4);
  assert.equal(escalaSegura(10000, 1000, 4, { lado: 16384, area: 268_000_000 }), 1.63);
  assert.equal(escalaSegura(3000, 3000, 8, { lado: 16384, area: 16_777_216 }), 1.36);
});

test("encaixar imagem numa área (sem distorcer, centralizada)", () => {
  assert.deepEqual(encaixar(1600, 900, 10, 5), { largura: 8.888888888888889, altura: 5, x: 0.5555555555555554, y: 0 });
  assert.deepEqual(encaixar(100, 400, 10, 5), { largura: 1.25, altura: 5, x: 4.375, y: 0 });
});

test("molduras: com nome primeiro (ordem natural), depois pela posição (linha a linha)", () => {
  const m = ordenarMolduras([
    { id: "a", name: null, x: 500, y: 0 },
    { id: "b", name: "10 - Fim", x: 0, y: 0 },
    { id: "c", name: "2 - Meio", x: 0, y: 0 },
    { id: "d", name: null, x: 0, y: 5 },
    { id: "e", name: null, x: 0, y: 900 },
  ]);
  assert.deepEqual(m.map((x) => x.id), ["c", "b", "d", "a", "e"]);
});

test("cores no fundo escuro seguem o filtro do Excalidraw (inverte 93% e gira o matiz 180°)", () => {
  assert.equal(corNoEscuro("#ffffff"), "#121212");
  assert.equal(corNoEscuro("#1e1e1e"), "#d3d3d3");
  assert.equal(corNoEscuro("transparent"), "transparent");
  assert.equal(corNoEscuro("none"), "none");
  assert.equal(corNoEscuro("rgb(255, 255, 255)"), "#121212");
  assert.equal(corNoEscuro("#fff"), "#121212");
  // Azul claro dos cards vira azul escuro (continua azul)
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(corNoEscuro("#a5d8ff").slice(i, i + 2), 16));
  assert.ok(b > r && b > 40 && r < 60, `${corNoEscuro("#a5d8ff")}`);
});

test("PDF tamanho real que cabe em uma folha fica centralizado", () => {
  const r = paginasPdf({ largura: 400, altura: 300 }, { papel: "a4", orientacao: "auto", margem: 36, ajuste: "real" });
  assert.equal(r.paginas.length, 1);
  const p = r.paginas[0];
  assert.ok(Math.abs(p.x - (r.largura - 400 * 0.75) / 2) < 1e-6, `x ${p.x}`);
  assert.ok(Math.abs(p.y - (r.altura - 300 * 0.75) / 2) < 1e-6, `y ${p.y}`);
});
