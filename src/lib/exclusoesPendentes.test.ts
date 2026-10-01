import test from "node:test";
import assert from "node:assert/strict";
import { criarExclusoesPendentes } from "./exclusoesPendentes.ts";

function adiavel() {
  let resolver!: () => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<void>((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promessa, resolver, rejeitar };
}
const proximoCiclo = () => new Promise<void>((r) => setImmediate(r));

test("esperar resolve na hora quando não há exclusão pendente", async () => {
  const r = criarExclusoesPendentes();
  await r.esperar("quadro/a.png", 10_000);
  assert.equal(r.quantidade(), 0);
});

test("o envio do mesmo caminho só segue depois que a exclusão termina", async () => {
  const r = criarExclusoesPendentes();
  const exclusao = adiavel();
  r.registrar("quadro/a.png", exclusao.promessa);

  let seguiu = false;
  const envio = r.esperar("quadro/a.png", 10_000).then(() => {
    seguiu = true;
  });
  await proximoCiclo();
  assert.equal(seguiu, false, "não pode seguir com a exclusão ainda em andamento");

  exclusao.resolver();
  await envio;
  assert.equal(seguiu, true);
});

test("caminho diferente não espera", async () => {
  const r = criarExclusoesPendentes();
  r.registrar("quadro/a.png", adiavel().promessa);
  let seguiu = false;
  await r.esperar("quadro/b.png", 10_000).then(() => {
    seguiu = true;
  });
  assert.equal(seguiu, true);
});

test("o limite é respeitado quando a exclusão não termina", async () => {
  const r = criarExclusoesPendentes();
  r.registrar("quadro/a.png", adiavel().promessa); // nunca termina
  const inicio = Date.now();
  await r.esperar("quadro/a.png", 40);
  const gasto = Date.now() - inicio;
  assert.ok(gasto >= 30, `esperou só ${gasto} ms`);
  assert.ok(gasto < 2_000, `passou do limite: ${gasto} ms`);
  assert.equal(r.quantidade(), 1, "a exclusão segue registrada: ainda não terminou");
});

test("o registro fica limpo depois que a exclusão termina", async () => {
  const r = criarExclusoesPendentes();
  const exclusao = adiavel();
  r.registrar("quadro/a.png", exclusao.promessa);
  assert.equal(r.quantidade(), 1);
  exclusao.resolver();
  await proximoCiclo();
  assert.equal(r.quantidade(), 0);
});

test("exclusão que falha também libera quem espera e limpa o registro, sem rejeitar", async () => {
  const r = criarExclusoesPendentes();
  const exclusao = adiavel();
  r.registrar("quadro/a.png", exclusao.promessa);
  const espera = r.esperar("quadro/a.png", 10_000);
  exclusao.rejeitar(new Error("falhou"));
  await espera; // se rejeitasse, o teste falharia aqui
  await proximoCiclo();
  assert.equal(r.quantidade(), 0);
});

test("duas exclusões seguidas do mesmo caminho: espera as duas e só limpa depois da última", async () => {
  const r = criarExclusoesPendentes();
  const primeira = adiavel();
  const segunda = adiavel();
  r.registrar("quadro/a.png", primeira.promessa);
  r.registrar("quadro/a.png", segunda.promessa);

  let seguiu = false;
  const espera = r.esperar("quadro/a.png", 10_000).then(() => {
    seguiu = true;
  });
  segunda.resolver();
  await proximoCiclo();
  assert.equal(seguiu, false, "a primeira ainda não terminou");
  assert.equal(r.quantidade(), 1);

  primeira.resolver();
  await espera;
  await proximoCiclo();
  assert.equal(seguiu, true);
  assert.equal(r.quantidade(), 0);
});
