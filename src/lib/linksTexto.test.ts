import test from "node:test";
import assert from "node:assert/strict";
import { normalizarUrl, dominio, filtrarLinks, contarPorTema, SEM_TEMA, TODOS } from "./linksTexto.ts";

const links = [
  { id: "1", nome: "Meta Ads Library", url: "https://www.facebook.com/ads/library", tema_id: "a" },
  { id: "2", nome: "ChatGPT", url: "https://chat.openai.com", tema_id: "b" },
  { id: "3", nome: "anotações", url: "https://notion.so/x", tema_id: null },
  { id: "4", nome: "Canva", url: "https://canva.com", tema_id: "a" },
];

test("normalizarUrl completa o https e recusa o que não é link", () => {
  assert.equal(normalizarUrl("  canva.com/design "), "https://canva.com/design");
  assert.equal(normalizarUrl("http://site.com"), "http://site.com");
  assert.equal(normalizarUrl("https://a.b/c?d=1"), "https://a.b/c?d=1");
  assert.equal(normalizarUrl(""), null);
  assert.equal(normalizarUrl("não é link"), null);
  assert.equal(normalizarUrl("semponto"), null);
});

test("dominio tira o www", () => {
  assert.equal(dominio("https://www.facebook.com/ads/library"), "facebook.com");
  assert.equal(dominio("https://chat.openai.com"), "chat.openai.com");
  assert.equal(dominio("lixo"), "");
});

test("filtrarLinks por tema, sem tema e busca (nome ou link), em ordem alfabética", () => {
  assert.deepEqual(filtrarLinks(links, TODOS, "").map((l) => l.id), ["3", "4", "2", "1"]);
  assert.deepEqual(filtrarLinks(links, "a", "").map((l) => l.id), ["4", "1"]);
  assert.deepEqual(filtrarLinks(links, SEM_TEMA, "").map((l) => l.id), ["3"]);
  assert.deepEqual(filtrarLinks(links, TODOS, "openai").map((l) => l.id), ["2"]);
  assert.deepEqual(filtrarLinks(links, TODOS, "ANOTACOES").map((l) => l.id), ["3"]);
});

test("contarPorTema", () => {
  assert.deepEqual(contarPorTema(links), { a: 2, b: 1, [SEM_TEMA]: 1, [TODOS]: 4 });
});
