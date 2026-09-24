process.env.TZ = "America/Sao_Paulo";
import test from "node:test";
import assert from "node:assert/strict";
import {
  plataformaDoLink, tipoDeArquivo, nomeExibido, rotuloValidade, ordenarProntas, formatarDuracao, rotuloPlataforma,
  separarTranscricoes, expiraEmDias,
} from "./transcritorTexto.ts";

test("plataformaDoLink usa as mesmas redes do swipe (e 'outro' para o resto)", () => {
  assert.equal(plataformaDoLink("https://www.instagram.com/reel/abc/"), "instagram");
  assert.equal(plataformaDoLink("https://vm.tiktok.com/xyz"), "tiktok");
  assert.equal(plataformaDoLink("https://www.facebook.com/ads/library/?id=123"), "meta_ads");
  assert.equal(plataformaDoLink("https://youtu.be/abc"), "youtube");
  assert.equal(plataformaDoLink("https://site-qualquer.com/video.mp4"), "outro");
});

test("tipoDeArquivo aceita áudio e vídeo pela extensão ou pelo tipo", () => {
  assert.equal(tipoDeArquivo("reuniao.MP3", ""), "audio");
  assert.equal(tipoDeArquivo("gravacao.m4a", ""), "audio");
  assert.equal(tipoDeArquivo("aula.mov", ""), "video");
  assert.equal(tipoDeArquivo("sem-extensao", "video/mp4"), "video");
  assert.equal(tipoDeArquivo("nota.ogg", "audio/ogg"), "audio");
  assert.equal(tipoDeArquivo("planilha.xlsx", "application/vnd.ms-excel"), null);
  assert.equal(tipoDeArquivo("foto.jpg", "image/jpeg"), null);
});

test("nomeExibido: nome ou 'Sem nome · data'", () => {
  assert.equal(nomeExibido({ nome: "  Aula 1 ", created_at: "2026-09-24T17:32:00Z" }), "Aula 1");
  assert.equal(nomeExibido({ nome: null, created_at: "2026-09-24T17:32:00Z" }), "Sem nome · 24/09 14:32");
});

test("rotuloValidade", () => {
  const agora = new Date("2026-09-24T12:00:00-03:00");
  assert.equal(rotuloValidade("2026-09-24T18:30:00-03:00", agora), "expira hoje às 18:30");
  assert.equal(rotuloValidade("2026-09-25T09:00:00-03:00", agora), "expira amanhã às 09:00");
  assert.equal(rotuloValidade("2026-09-27T12:00:00-03:00", agora), "expira em 3 dias (27/09)");
  assert.equal(rotuloValidade(null, agora), "");
});

test("expiraEmDias soma a partir de agora", () => {
  const agora = new Date("2026-09-24T12:00:00Z");
  assert.equal(expiraEmDias(15, agora), "2026-10-09T12:00:00.000Z");
  assert.throws(() => expiraEmDias(0, agora));
  assert.throws(() => expiraEmDias(16, agora));
});

test("ordenarProntas: recentes, A→Z e Z→A (sem nome vai pelo rótulo)", () => {
  const lista = [
    { id: "1", nome: "beta", created_at: "2026-09-20T10:00:00Z" },
    { id: "2", nome: "Álbum", created_at: "2026-09-22T10:00:00Z" },
    { id: "3", nome: null, created_at: "2026-09-23T10:00:00Z" },
  ];
  assert.deepEqual(ordenarProntas(lista, "recentes").map((t) => t.id), ["3", "2", "1"]);
  assert.deepEqual(ordenarProntas(lista, "az").map((t) => t.id), ["2", "1", "3"]);
  assert.deepEqual(ordenarProntas(lista, "za").map((t) => t.id), ["3", "1", "2"]);
});

test("formatarDuracao", () => {
  assert.equal(formatarDuracao(45), "45s");
  assert.equal(formatarDuracao(200), "3min 20s");
  assert.equal(formatarDuracao(3720), "1h 02min");
  assert.equal(formatarDuracao(null), "");
});

test("rotuloPlataforma", () => {
  assert.equal(rotuloPlataforma({ origem: "link", plataforma: "instagram" }), "Instagram");
  assert.equal(rotuloPlataforma({ origem: "arquivo", plataforma: "video", arquivo_nome: "aula.mov" }), "Vídeo · MOV");
  assert.equal(rotuloPlataforma({ origem: "arquivo", plataforma: "audio", arquivo_nome: "x.mp3" }), "Áudio · MP3");
});

test("separarTranscricoes: fila (em andamento, aguardando por posição, pausadas) e concluídas", () => {
  const t = (id: string, status: string, posicao = 0) => ({ id, status, posicao, created_at: "2026-09-24T10:00:00Z" });
  const r = separarTranscricoes([t("a", "pronta"), t("b", "aguardando", 5), t("c", "transcrevendo"), t("d", "aguardando", 2), t("e", "pausada"), t("f", "falhou"), t("g", "enviando")]);
  assert.deepEqual(r.andamento.map((x) => x.id), ["g", "c"]);
  assert.deepEqual(r.aguardando.map((x) => x.id), ["d", "b"]);
  assert.deepEqual(r.pausadas.map((x) => x.id), ["e"]);
  assert.deepEqual(r.concluidas.map((x) => x.id).sort(), ["a", "f"]);
});
