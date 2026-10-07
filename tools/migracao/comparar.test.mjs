import { test } from "node:test";
import assert from "node:assert/strict";
import { compararCatalogos, compararHashes } from "./comparar.mjs";

const cat = (extra = {}) => ({
  tabelas: [{ chave: "public.clientes", def: "rls=true" }],
  funcoes: [{ chave: "public.f(integer)", def: "BEGIN RETURN 1; END" }],
  ...extra,
});

test("catálogos iguais não têm diferença", () => {
  assert.deepEqual(compararCatalogos(cat(), cat()), { faltando: [], sobrando: [], diferentes: [] });
});

test("objeto só no antigo falta no novo; só no novo sobra", () => {
  const antigo = cat({ views: [{ chave: "public.v1", def: "select 1" }] });
  const novo = cat({ views: [{ chave: "public.v2", def: "select 2" }] });
  assert.deepEqual(compararCatalogos(antigo, novo), { faltando: ["views:public.v1"], sobrando: ["views:public.v2"], diferentes: [] });
});

test("mesma chave com definição diferente", () => {
  const novo = cat({ funcoes: [{ chave: "public.f(integer)", def: "BEGIN RETURN 2; END" }] });
  assert.deepEqual(compararCatalogos(cat(), novo).diferentes, ["funcoes:public.f(integer)"]);
});

test("categoria ausente de um lado conta os itens como faltando ou sobrando", () => {
  const antigo = cat({ gatilhos: [{ chave: "public.t.trg", def: "x" }] });
  assert.deepEqual(compararCatalogos(antigo, cat()).faltando, ["gatilhos:public.t.trg"]);
  assert.deepEqual(compararCatalogos(cat(), antigo).sobrando, ["gatilhos:public.t.trg"]);
});

test("hashes iguais não têm divergência", () => {
  const h = [{ tabela: "clientes", linhas: 10, hash: "abc" }];
  assert.deepEqual(compararHashes(h, h), []);
});

test("hashes: contagem, conteúdo e tabela ausente aparecem, uma linha por tabela", () => {
  const antigo = [{ tabela: "a", linhas: 3, hash: "x" }, { tabela: "b", linhas: 1, hash: "y" }, { tabela: "c", linhas: 0, hash: null }];
  const novo = [{ tabela: "a", linhas: 2, hash: "z" }, { tabela: "b", linhas: 1, hash: "w" }, { tabela: "d", linhas: 0, hash: null }];
  assert.deepEqual(compararHashes(antigo, novo), [
    "a: linhas 3 -> 2",
    "b: conteúdo diferente (mesmas 1 linhas)",
    "c: falta no novo",
    "d: sobra no novo",
  ]);
});
