import test from "node:test";
import assert from "node:assert/strict";
import { sanitizar, limitar, extensaoDe, nomeCard, nomeVsl, nomeUnico, ehVideo, ehImagem, mimeDe, semRastreio } from "../src/nomes.js";

test("sanitizar troca caracteres proibidos por hífen e colapsa espaços", () => {
  assert.equal(sanitizar('Oferta: "Dr. Fulano" / 2026'), "Oferta- -Dr. Fulano- - 2026");
  assert.equal(sanitizar("  Vídeo   de   anúncio  "), "Vídeo de anúncio");
});

test("limitar corta em 180 caracteres contando a extensão", () => {
  const base = "a".repeat(300);
  const nome = limitar(base, "mp4");
  assert.equal(nome.length, 180);
  assert.ok(nome.endsWith(".mp4"));
});

test("limitar sem extensão devolve só o nome sanitizado", () => {
  assert.equal(limitar("Carrossel - Médico - Dr Fulano"), "Carrossel - Médico - Dr Fulano");
});

test("extensaoDe pega a extensão em minúsculas", () => {
  assert.equal(extensaoDe("/tmp/x/video.MP4"), "mp4");
  assert.equal(extensaoDe("/tmp/x/sem-extensao"), "");
});

test("nomeCard: Card 01, Card 02... com a extensão de cada card", () => {
  assert.equal(nomeCard(1, "jpg"), "Card 01.jpg");
  assert.equal(nomeCard(12, "mp4"), "Card 12.mp4");
});

test("nomeVsl sempre em mp4", () => {
  assert.equal(nomeVsl("Landing page - Médico - Dr Fulano", 2), "Landing page - Médico - Dr Fulano - VSL 02.mp4");
});

test("nomeUnico acrescenta sufixo quando o nome já existe", () => {
  assert.equal(nomeUnico("video.mp4", []), "video.mp4");
  assert.equal(nomeUnico("video.mp4", ["video.mp4"]), "video (2).mp4");
  assert.equal(nomeUnico("video.mp4", ["video.mp4", "video (2).mp4"]), "video (3).mp4");
  assert.equal(nomeUnico("pasta", ["pasta"]), "pasta (2)");
});

test("classificação por extensão", () => {
  assert.ok(ehVideo("mp4"));
  assert.ok(ehVideo("webm"));
  assert.ok(!ehVideo("jpg"));
  assert.ok(ehImagem("jpeg"));
  assert.ok(!ehImagem("mp4"));
  assert.equal(mimeDe("mp4"), "video/mp4");
  assert.equal(mimeDe("jpg"), "image/jpeg");
  assert.equal(mimeDe("xyz"), "application/octet-stream");
});

test("semRastreio tira utm_*, fbclid e afins e mantém o resto da URL", () => {
  assert.equal(
    semRastreio("https://site.com/lp/?utm_source=FB&utm_campaign=%5B16%5D%7C123&fbclid=abc&utm_id=9"),
    "https://site.com/lp/",
  );
  assert.equal(semRastreio("https://site.com/lp/?v=2&utm_medium=x&gclid=1"), "https://site.com/lp/?v=2");
  assert.equal(semRastreio("https://site.com/lp/#topo"), "https://site.com/lp/#topo");
  assert.equal(semRastreio("não é url"), "não é url");
});
