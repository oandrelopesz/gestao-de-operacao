import { test } from "node:test";
import assert from "node:assert/strict";
import { nomeArquivo, limparNome, separarLinks, nomeLivre } from "./swipeNomes.ts";

test("nomeArquivo: Nome - Player - Tipo - Rede", () => {
  assert.equal(
    nomeArquivo({ nome: "Hook forte", player: "Dr Fulano", tipo: "Vídeo de anúncio", rede: "Instagram" }),
    "Hook forte - Dr Fulano - Vídeo de anúncio - Instagram",
  );
});

test("nomeArquivo: sem nome começa pelo player; espaços sobrando somem", () => {
  assert.equal(nomeArquivo({ nome: "  ", player: " Dr  Fulano ", tipo: "Story", rede: "Instagram" }), "Dr Fulano - Story - Instagram");
  assert.equal(nomeArquivo({ player: "Loja X", tipo: "Landing page", rede: "Internet" }), "Loja X - Landing page - Internet");
});

test("nomeArquivo: caracteres proibidos em arquivo viram hífen (Vídeo orgânico/Reel)", () => {
  assert.equal(
    nomeArquivo({ nome: "A: b?", player: "P", tipo: "Vídeo orgânico/Reel", rede: "TikTok" }),
    "A- b- - P - Vídeo orgânico-Reel - TikTok",
  );
});

test("nomeArquivo: limita o tamanho", () => {
  assert.ok(nomeArquivo({ nome: "x".repeat(300), player: "P", tipo: "T", rede: "R" }).length <= 180);
});

test("limparNome serve para pasta do player", () => {
  assert.equal(limparNome("  Dr. Fulano / Clínica  "), "Dr. Fulano - Clínica");
});

test("separarLinks: um por linha, separados por espaço, sem repetidos e sem lixo", () => {
  const texto = "https://www.instagram.com/reel/A/\nhttps://www.tiktok.com/@x/video/1  https://www.instagram.com/reel/A/\n\n  obrigado!  \nyoutube.com/shorts/abc";
  assert.deepEqual(separarLinks(texto), [
    "https://www.instagram.com/reel/A/",
    "https://www.tiktok.com/@x/video/1",
    "youtube.com/shorts/abc",
  ]);
  assert.deepEqual(separarLinks("   "), []);
  assert.deepEqual(separarLinks("só um texto"), []);
});

test("nomeLivre: repete o nome com (2), (3)... sem perder o que já foi usado", () => {
  const usados = new Set(["Dr Fulano - Landing page - Internet", "Dr Fulano - Landing page - Internet (2)"]);
  assert.equal(nomeLivre("Dr Fulano - Landing page - Internet", usados), "Dr Fulano - Landing page - Internet (3)");
  assert.equal(nomeLivre("Outro - Story - Instagram", usados), "Outro - Story - Instagram");
});
