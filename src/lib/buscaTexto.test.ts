import test from "node:test";
import assert from "node:assert/strict";
import { combinaBusca, normalizarBusca, pontuarBusca } from "./buscaTexto.ts";

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
