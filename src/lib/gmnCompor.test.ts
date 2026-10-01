import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarLogo, caixaDaLogo, reduzir } from "../../supabase/functions/gmn/compor.ts";
import type { ImagemRgba } from "../../supabase/functions/gmn/png.ts";

const lisa = (largura: number, altura: number, cor: number[]): ImagemRgba => {
  const dados = new Uint8Array(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) dados.set(cor, i * 4);
  return { largura, altura, dados };
};

test("caixaDaLogo: cabe no limite sem deformar, nunca amplia, margem de 3% no canto escolhido", () => {
  const img = { largura: 1536, altura: 1024 };
  const c = caixaDaLogo(img, { largura: 600, altura: 240 }, "media", "inferior_direito", false);
  assert.deepEqual(c.logo, { x: 1152, y: 843, largura: 338, altura: 135 });
  assert.equal(c.fundo, null);
  const pequena = caixaDaLogo(img, { largura: 50, altura: 20 }, "grande", "superior_esquerdo", false);
  assert.deepEqual(pequena.logo, { x: 46, y: 46, largura: 50, altura: 20 }); // não amplia
  const comFundo = caixaDaLogo(img, { largura: 600, altura: 240 }, "pequena", "superior_direito", true);
  assert.ok(comFundo.fundo && comFundo.fundo.x < comFundo.logo.x && comFundo.fundo.largura > comFundo.logo.largura);
  assert.ok(Math.abs(comFundo.logo.largura / comFundo.logo.altura - 600 / 240) < 0.02); // mesma proporção
});

test("reduzir: média de área; logo menor que a caixa volta igual", () => {
  const src = lisa(4, 4, [200, 100, 50, 255]);
  const r = reduzir(src, 2, 2);
  assert.deepEqual([...r.dados.subarray(0, 4)], [200, 100, 50, 255]);
  assert.equal(reduzir(src, 8, 8), src);
});

test("aplicarLogo: pixel opaco da logo sai idêntico; fora da caixa nada muda; base intacta", () => {
  const base = lisa(300, 200, [10, 20, 30, 255]);
  const logo = lisa(40, 20, [250, 0, 0, 255]);
  logo.dados[3] = 0; // um pixel transparente na logo
  const out = aplicarLogo(base, logo, { tamanho: "grande", posicao: "inferior_esquerdo", fundo: "nenhum" });
  const { logo: cx } = caixaDaLogo(base, logo, "grande", "inferior_esquerdo", false);
  const i = ((cx.y + 5) * 300 + cx.x + 5) * 4;
  assert.deepEqual([...out.dados.subarray(i, i + 4)], [250, 0, 0, 255]);
  const t = (cx.y * 300 + cx.x) * 4; // pixel transparente da logo: fica a base
  assert.deepEqual([...out.dados.subarray(t, t + 4)], [10, 20, 30, 255]);
  assert.deepEqual([...out.dados.subarray(0, 4)], [10, 20, 30, 255]);
  assert.deepEqual([...base.dados.subarray(i, i + 4)], [10, 20, 30, 255]);
});

test("aplicarLogo com fundo claro pinta o retângulo atrás da logo", () => {
  const base = lisa(300, 200, [0, 0, 0, 255]);
  const logo = lisa(40, 20, [250, 0, 0, 255]);
  const out = aplicarLogo(base, logo, { tamanho: "media", posicao: "superior_direito", fundo: "claro" });
  const { fundo } = caixaDaLogo(base, logo, "media", "superior_direito", true);
  const j = ((fundo!.y + Math.floor(fundo!.altura / 2)) * 300 + fundo!.x + 2) * 4;
  assert.ok(out.dados[j] > 200 && out.dados[j + 1] > 200); // claro, com 88% de opacidade sobre preto
});
