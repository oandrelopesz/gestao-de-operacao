import test from "node:test";
import assert from "node:assert/strict";
import {
  EDICAO_PADRAO, SEM_AJUSTES, aplicarAjustes, combinar, girado, mudaPixels, par, recorte, recorteCentral, tamanhoSaida,
} from "./instagramEdicao.ts";

test("recorteCentral: corta as sobras dos lados ou de cima e baixo", () => {
  assert.deepEqual(recorteCentral(2000, 1000, 1), { x: 500, y: 0, w: 1000, h: 1000 });
  assert.deepEqual(recorteCentral(1000, 2000, 0.8), { x: 0, y: 375, w: 1000, h: 1250 });
});

test("recorte: zoom e centro, sem sair da imagem", () => {
  assert.deepEqual(recorte(1000, 1000, 1, 2, 0.5, 0.5), { x: 250, y: 250, w: 500, h: 500 });
  assert.deepEqual(recorte(1000, 1000, 1, 2, 0, 0), { x: 0, y: 0, w: 500, h: 500 });
  assert.deepEqual(recorte(1000, 1000, 1, 2, 1, 1), { x: 500, y: 500, w: 500, h: 500 });
});

test("girado, tamanhoSaida e par", () => {
  assert.deepEqual(girado(1920, 1080, 90), { w: 1080, h: 1920 });
  assert.deepEqual(girado(1920, 1080, 180), { w: 1920, h: 1080 });
  assert.deepEqual(tamanhoSaida(9 / 16), { w: 1080, h: 1920 });
  assert.deepEqual(tamanhoSaida(1.91), { w: 1080, h: 566 });
  assert.equal(par(565.4), 566);
});

const px = (...v: number[]) => new Uint8ClampedArray(v);

test("aplicarAjustes: sem ajuste não muda; brilho clareia; saturação -100 e P&B deixam cinza", () => {
  const d = px(200, 100, 50, 255);
  aplicarAjustes(d, 1, 1, SEM_AJUSTES);
  assert.deepEqual([...d], [200, 100, 50, 255]);
  const b = px(100, 100, 100, 255);
  aplicarAjustes(b, 1, 1, { ...SEM_AJUSTES, brilho: 50 });
  assert.ok(b[0] > 100 && b[3] === 255);
  const s = px(200, 100, 50, 255);
  aplicarAjustes(s, 1, 1, { ...SEM_AJUSTES, saturacao: -100 });
  assert.ok(Math.abs(s[0] - s[1]) <= 1 && Math.abs(s[1] - s[2]) <= 1);
  const c = px(200, 100, 50, 255);
  aplicarAjustes(c, 1, 1, SEM_AJUSTES, 1);
  assert.ok(Math.abs(c[0] - c[2]) <= 1);
});

test("aplicarAjustes: vinheta escurece o canto e não o centro", () => {
  const d = new Uint8ClampedArray(3 * 3 * 4).fill(200);
  aplicarAjustes(d, 3, 3, { ...SEM_AJUSTES, vinheta: 100 });
  const canto = d[0];
  const centro = d[(1 * 3 + 1) * 4];
  assert.ok(canto < centro && centro === 200);
});

test("combinar: intensidade 0 é o normal; ajustes somam ao filtro", () => {
  assert.deepEqual(combinar("vivido", 0, SEM_AJUSTES).ajustes, SEM_AJUSTES);
  const r = combinar("vivido", 100, { ...SEM_AJUSTES, brilho: 10 });
  assert.ok(r.ajustes.saturacao > 0 && r.ajustes.brilho === 10);
  assert.equal(combinar("pb", 100, SEM_AJUSTES).cinza, 1);
});

test("mudaPixels: só filtro, ajuste ou texto pedem refazer os pixels", () => {
  assert.equal(mudaPixels(EDICAO_PADRAO), false);
  assert.equal(mudaPixels({ ...EDICAO_PADRAO, filtro: "vivido" }), true);
  assert.equal(mudaPixels({ ...EDICAO_PADRAO, textos: [{ texto: "Oi", cor: "#fff", tamanho: 0.08, x: 0.5, y: 0.5 }] }), true);
  assert.equal(mudaPixels({ ...EDICAO_PADRAO, textos: [{ texto: " ", cor: "#fff", tamanho: 0.08, x: 0.5, y: 0.5 }] }), false);
});
