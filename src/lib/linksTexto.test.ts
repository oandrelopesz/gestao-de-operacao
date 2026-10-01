import test from "node:test";
import assert from "node:assert/strict";
import { normalizarUrl, dominio, filtrarLinks, contarPorTema, SEM_TEMA, TODOS } from "./linksTexto.ts";
import { MENSAGEM_NENHUM, MENSAGEM_PARECIDOS } from "./search.ts";

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
  const ids = (filtro: string, busca: string) => filtrarLinks(links, filtro, busca).itens.map((l) => l.id);
  assert.deepEqual(ids(TODOS, ""), ["3", "4", "2", "1"]);
  assert.deepEqual(ids("a", ""), ["4", "1"]);
  assert.deepEqual(ids(SEM_TEMA, ""), ["3"]);
  assert.deepEqual(ids(TODOS, "openai"), ["2"]);
  assert.deepEqual(ids(TODOS, "ANOTACOES"), ["3"]);
  const semBusca = filtrarLinks(links, TODOS, "");
  assert.equal(semBusca.modo, "todos");
  assert.equal(semBusca.mensagem, null);
});

test("filtrarLinks: acha sem acento e com erro de digitação", () => {
  const ids = (busca: string) => filtrarLinks(links, TODOS, busca).itens.map((l) => l.id);
  assert.deepEqual(ids("anotacoes"), ["3"]);
  assert.deepEqual(ids("anotações"), ["3"]);
  assert.deepEqual(ids("chatgtp"), ["2"]); // letras vizinhas trocadas
  assert.deepEqual(ids("cnva"), ["4"]); // letra a menos
  assert.deepEqual(ids("meta adds library"), ["1"]); // letra a mais, várias palavras
  assert.equal(filtrarLinks(links, TODOS, "chatgtp").modo, "exato");
});

test("filtrarLinks: parecidos e nenhum trazem a mensagem", () => {
  const parecidos = filtrarLinks(links, TODOS, "canva zebra");
  assert.equal(parecidos.modo, "parecidos");
  assert.equal(parecidos.mensagem, MENSAGEM_PARECIDOS);
  assert.deepEqual(parecidos.itens.map((l) => l.id), ["4"]);
  const nenhum = filtrarLinks(links, TODOS, "zebra");
  assert.equal(nenhum.modo, "nenhum");
  assert.equal(nenhum.mensagem, MENSAGEM_NENHUM);
  assert.deepEqual(nenhum.itens, []);
});

test("filtrarLinks: o tema vale antes da busca e, no empate, a ordem alfabética continua", () => {
  assert.equal(filtrarLinks(links, "a", "chatgpt").modo, "nenhum");
  assert.deepEqual(filtrarLinks(links, "b", "chatgpt").itens.map((l) => l.id), ["2"]);
  // "com" está no link de três itens (campo secundário, mesma relevância): vêm em ordem alfabética
  assert.deepEqual(filtrarLinks(links, TODOS, "com").itens.map((l) => l.id), ["4", "2", "1"]);
});

test("contarPorTema", () => {
  assert.deepEqual(contarPorTema(links), { a: 2, b: 1, [SEM_TEMA]: 1, [TODOS]: 4 });
});
