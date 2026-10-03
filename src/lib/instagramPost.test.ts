import test from "node:test";
import assert from "node:assert/strict";
import { conferirPost, contarHashtags, limparUsuarios, tipoDoPost } from "./instagramPost.ts";

const img = (largura: number, altura: number) => ({ chave: "k", tipo: "imagem" as const, largura, altura });
const vid = (largura: number, altura: number, duracao: number) => ({ chave: "k", tipo: "video" as const, largura, altura, duracao });
const agora = new Date("2026-10-03T12:00:00Z");
const conf = (e: Partial<Parameters<typeof conferirPost>[0]>) => conferirPost({ midias: [], legenda: "", agendarPara: null, ...e }, agora);

test("tipoDoPost sai das mídias e do formato", () => {
  assert.equal(tipoDoPost([]), null);
  assert.equal(tipoDoPost([img(1080, 1350)]), "foto");
  assert.equal(tipoDoPost([vid(1080, 1920, 10)]), "reels");
  assert.equal(tipoDoPost([img(1080, 1080), vid(1080, 1080, 10)]), "carrossel");
  assert.equal(tipoDoPost([img(1080, 1920)], "story"), "story");
});

test("contarHashtags conta só as palavras com #", () => {
  assert.equal(contarHashtags("#a texto #b_2 e#c ##"), 2);
});

test("limparUsuarios tira @, espaços, repetidos e vazios", () => {
  assert.deepEqual(limparUsuarios(" @ana, bia  @ana ,,"), ["ana", "bia"]);
});

test("conferirPost no feed: proporção, quantidade, legenda, reels e horário", () => {
  assert.deepEqual(conf({ midias: [img(1080, 1350)], legenda: "ok" }), { erros: [], avisos: [] });
  assert.match(conf({ midias: [img(1080, 1920)] }).erros[0], /proporção 0,56:1/);
  assert.match(conf({ midias: Array(11).fill(img(1080, 1080)) }).erros[0], /até 10/);
  assert.match(conf({ midias: [img(1080, 1080)], legenda: "x".repeat(2201) }).erros[0], /2201/);
  assert.match(conf({ midias: [img(1080, 1080)], legenda: Array(31).fill("#a").join(" ") }).erros[0], /31 hashtags/);
  assert.match(conf({ midias: [vid(1080, 1080, 10)] }).avisos[0], /9:16/);
  assert.match(conf({ midias: [vid(1080, 1920, 2)] }).erros[0], /3 segundos/);
  assert.match(conf({ midias: [img(1080, 1080)], agendarPara: new Date("2026-10-03T12:00:30Z") }).erros[0], /futuro/);
  assert.match(conf({}).erros[0], /Adicione/);
});

test("conferirPost no story: proporção livre com aviso, vídeo até 60 s, só Instagram", () => {
  assert.deepEqual(conf({ formato: "story", midias: [img(1080, 1920)] }), { erros: [], avisos: [] });
  assert.match(conf({ formato: "story", midias: [img(1080, 1080)] }).avisos[0], /9:16/);
  assert.match(conf({ formato: "story", midias: [vid(1080, 1920, 61)] }).erros[0], /60 segundos/);
  assert.match(conf({ formato: "story", midias: [img(1080, 1920)], facebook: true }).erros[0], /Facebook/);
});

test("conferirPost: redes, Facebook sem vídeo em álbum, colaboradores e comentário", () => {
  assert.match(conf({ midias: [img(1080, 1080)], instagram: false }).erros[0], /pelo menos uma rede/);
  assert.match(conf({ midias: [img(1080, 1080), vid(1080, 1080, 10)], facebook: true }).erros[0], /só fotos/);
  assert.deepEqual(conf({ midias: [img(1080, 1080), img(1080, 1080)], facebook: true }).erros, []);
  assert.match(conf({ midias: [img(1080, 1080)], colaboradores: ["a", "b", "c", "d"] }).erros[0], /até 3/);
  assert.match(conf({ midias: [img(1080, 1080)], primeiroComentario: "y".repeat(2201) }).erros[0], /comentário/);
});
