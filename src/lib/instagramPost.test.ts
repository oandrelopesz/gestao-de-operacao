import test from "node:test";
import assert from "node:assert/strict";
import { conferirPost, contarHashtags, tipoDoPost } from "./instagramPost.ts";

const img = (largura: number, altura: number) => ({ chave: "k", tipo: "imagem" as const, largura, altura });
const vid = (largura: number, altura: number, duracao: number) => ({ chave: "k", tipo: "video" as const, largura, altura, duracao });

test("tipoDoPost sai das mídias", () => {
  assert.equal(tipoDoPost([]), null);
  assert.equal(tipoDoPost([img(1080, 1350)]), "foto");
  assert.equal(tipoDoPost([vid(1080, 1920, 10)]), "reels");
  assert.equal(tipoDoPost([img(1080, 1080), vid(1080, 1080, 10)]), "carrossel");
});

test("contarHashtags conta só as palavras com #", () => {
  assert.equal(contarHashtags("#a texto #b_2 e#c ##"), 2);
});

test("conferirPost: proporção, quantidade, legenda, reels e horário", () => {
  const agora = new Date("2026-10-03T12:00:00Z");
  assert.deepEqual(conferirPost([img(1080, 1350)], "ok", null, agora), { erros: [], avisos: [] });
  assert.match(conferirPost([img(1080, 1920)], "", null, agora).erros[0], /proporção 0,56:1/);
  assert.match(conferirPost(Array(11).fill(img(1080, 1080)), "", null, agora).erros[0], /até 10/);
  assert.match(conferirPost([img(1080, 1080)], "x".repeat(2201), null, agora).erros[0], /2201/);
  assert.match(conferirPost([img(1080, 1080)], Array(31).fill("#a").join(" "), null, agora).erros[0], /31 hashtags/);
  assert.match(conferirPost([vid(1080, 1080, 10)], "", null, agora).avisos[0], /9:16/);
  assert.match(conferirPost([vid(1080, 1920, 2)], "", null, agora).erros[0], /3 segundos/);
  assert.match(conferirPost([img(1080, 1080)], "", new Date("2026-10-03T12:00:30Z"), agora).erros[0], /futuro/);
  assert.match(conferirPost([], "", null, agora).erros[0], /Adicione/);
});
