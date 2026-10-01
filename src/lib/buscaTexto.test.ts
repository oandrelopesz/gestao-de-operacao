import test from "node:test";
import assert from "node:assert/strict";
import { combinaBusca, filtroCmdk, normalizarBusca, pontuarBusca } from "./buscaTexto.ts";

test("normalizarBusca tira acento, maiúscula e espaço sobrando", () => {
  assert.equal(normalizarBusca("  João  da Conceição "), "joao da conceicao");
  assert.equal(normalizarBusca("ÁÉÍÓÚ àèìòù âêôã ç ü"), "aeiou aeiou aeoa c u");
});

test("normalizarBusca troca pontuação por espaço e aceita vazio", () => {
  assert.equal(normalizarBusca("Dr. D'Ávila-Silva"), "dr d avila silva");
  assert.equal(normalizarBusca(""), "");
  assert.equal(normalizarBusca(null), "");
  assert.equal(normalizarBusca(undefined), "");
});

test("normalizarBusca entende acento já decomposto (NFD) e não apaga letra de outro alfabeto", () => {
  assert.equal(normalizarBusca("João"), "joao");
  assert.equal(normalizarBusca("Москва 24"), "москва 24");
});

test("combinaBusca: joao acha João, sem acento e sem maiúscula", () => {
  assert.equal(combinaBusca("João Silva", "joao"), true);
  assert.equal(combinaBusca("joao silva", "JOÃO"), true);
  assert.equal(combinaBusca("Conceição Pereira", "conceicao"), true);
  assert.equal(combinaBusca("Conceicao Pereira", "conceição"), true);
});

test("combinaBusca: acha no meio do nome e em qualquer ordem das palavras", () => {
  assert.equal(combinaBusca("Clínica Dr. João Silva", "silva"), true);
  assert.equal(combinaBusca("Clínica Dr. João Silva", "silva joao"), true);
  assert.equal(combinaBusca("Clínica Dr. João Silva", "lin"), true);
});

test("combinaBusca: não acha o que não tem no texto", () => {
  assert.equal(combinaBusca("João Silva", "maria"), false);
  assert.equal(combinaBusca("João Silva", "joao maria"), false);
  assert.equal(combinaBusca("", "joao"), false);
  assert.equal(combinaBusca(null, "joao"), false);
});

test("combinaBusca: termo vazio ou só espaço combina com tudo", () => {
  assert.equal(combinaBusca("João Silva", ""), true);
  assert.equal(combinaBusca("João Silva", "   "), true);
  assert.equal(combinaBusca("João Silva", null), true);
  assert.equal(combinaBusca("", ""), true);
});

test("combinaBusca: busca também no nome da agência quando o texto traz os dois", () => {
  assert.equal(combinaBusca("Padaria Central Evoluir", "evoluir"), true);
  assert.equal(combinaBusca("Padaria Central Evoluir", "central evoluir"), true);
  assert.equal(combinaBusca("Padaria Central Evoluir", "zeta"), false);
});

test("pontuarBusca: começa pelo termo > palavra que começa pelo termo > trecho solto", () => {
  const inicio = pontuarBusca("João Silva", "joa");
  const palavra = pontuarBusca("Clínica João", "joa");
  const trecho = pontuarBusca("Banjoa", "joa");
  assert.equal(inicio, 1);
  assert.equal(palavra, 0.75);
  assert.equal(trecho, 0.5);
  assert.ok(inicio > palavra && palavra > trecho && trecho > 0);
  assert.equal(pontuarBusca("João Silva", "xyz"), 0);
  assert.equal(pontuarBusca("João Silva", ""), 1);
});

test("filtroCmdk: joao acha João pelas keywords, sem acento e sem maiúscula", () => {
  assert.ok(filtroCmdk("c:11111111-aaaa", "joao", ["João Silva"]) > 0);
  assert.ok(filtroCmdk("c:11111111-aaaa", "JOÃO SIL", ["João Silva"]) > 0);
  assert.equal(filtroCmdk("c:11111111-aaaa", "maria", ["João Silva"]), 0);
});

test("filtroCmdk: o value (que carrega o id) nunca entra na busca", () => {
  assert.equal(filtroCmdk("c:3f9a12e0-0000-4000-8000-000000000000", "3f9", ["Ana Paula"]), 0);
  assert.equal(filtroCmdk("c:3f9a12e0-0000-4000-8000-000000000000", "a12e", ["Ana Paula", "Evoluir"]), 0);
  assert.equal(filtroCmdk("João Silva", "joao", []), 0);
  assert.equal(filtroCmdk("João Silva", "joao"), 0);
});

test("filtroCmdk: só a agência combina com nota menor que a do nome", () => {
  const pelaAgencia = filtroCmdk("c:1", "evoluir", ["Ana Paula", "Evoluir"]);
  const peloNome = filtroCmdk("c:1", "ana", ["Ana Paula", "Evoluir"]);
  assert.equal(pelaAgencia, 0.25);
  assert.equal(peloNome, 1);
  assert.ok(pelaAgencia > 0 && pelaAgencia < peloNome);
  // nome e agência juntos, em qualquer ordem
  assert.equal(filtroCmdk("c:1", "paula evoluir", ["Ana Paula", "Evoluir"]), 0.25);
  // sem agência cadastrada, termo que não está no nome não combina
  assert.equal(filtroCmdk("c:1", "evoluir", ["Ana Paula"]), 0);
});

test("filtroCmdk: itens especiais (Pessoal, Sem cliente) casam pelo rótulo", () => {
  assert.ok(filtroCmdk("x:pessoal", "pess", ["Pessoal"]) > 0);
  assert.ok(filtroCmdk("__vazio__", "SEM", ["Sem cliente"]) > 0);
  assert.equal(filtroCmdk("__vazio__", "pessoal", ["Sem cliente"]), 0);
});
