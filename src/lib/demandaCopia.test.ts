import test from "node:test";
import assert from "node:assert/strict";
import { montarCopiaDemanda, colunaDaCopia, proximaOrdem } from "./demandaCopia.ts";

const original = {
  id: "d1",
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-21T10:00:00Z",
  clientes: { nome: "Ana Silva", agencia: "AL Digital" },
  titulo: "Subir campanha",
  descricao: "Criar os anúncios",
  status: "fazer_amanha",
  prioridade: "alta",
  prazo: "2026-10-02",
  ordem: 3,
  cliente_id: "c1",
  pessoal: false,
  user_id: "u1",
  dia_semana: null,
  processo_passo_id: null,
  roadmap_id: "r1",
  prospeccao_id: null,
  recorrente: false,
  frequencia_dias_semana: ["seg", "qua"],
};

test("a cópia não leva id, datas de registro nem a relação clientes", () => {
  const copia = montarCopiaDemanda(original, 9);
  assert.ok(!("id" in copia));
  assert.ok(!("created_at" in copia));
  assert.ok(!("updated_at" in copia));
  assert.ok(!("clientes" in copia));
});

test("clientes nulo (demanda sem cliente) também não vai para a cópia", () => {
  const copia = montarCopiaDemanda({ ...original, clientes: null, cliente_id: null }, 1);
  assert.ok(!("clientes" in copia));
});

test("qualquer outro objeto de relação é descartado, mas listas de colunas ficam", () => {
  const copia = montarCopiaDemanda({ ...original, processos: { nome: "x" } }, 1);
  assert.ok(!("processos" in copia));
  assert.deepEqual(copia.frequencia_dias_semana, ["seg", "qua"]);
});

test("o título ganha (Cópia) no fim", () => {
  assert.equal(montarCopiaDemanda(original, 0).titulo, "Subir campanha (Cópia)");
});

test("a coluna única do passo de onboarding fica nula", () => {
  const copia = montarCopiaDemanda({ ...original, processo_passo_id: "p1" }, 0);
  assert.equal(copia.processo_passo_id, null);
});

test("a duplicata da cópia de uma recorrente não fica ligada à recorrente", () => {
  const copia = montarCopiaDemanda({ ...original, recorrente_pai_id: "m1" }, 0);
  assert.equal(copia.recorrente_pai_id, null);
});

test("fora de Feito a cópia fica na mesma coluna e com a mesma entrega", () => {
  const copia = montarCopiaDemanda(original, 0);
  assert.equal(copia.status, "fazer_amanha");
  assert.equal(copia.prazo, "2026-10-02");
});

test("os demais campos são mantidos", () => {
  const copia = montarCopiaDemanda(original, 0);
  assert.equal(copia.descricao, "Criar os anúncios");
  assert.equal(copia.prioridade, "alta");
  assert.equal(copia.cliente_id, "c1");
  assert.equal(copia.roadmap_id, "r1");
  assert.equal(copia.user_id, "u1");
});

test("original em Feito: a cópia vai para o Standby, sem entrega", () => {
  const copia = montarCopiaDemanda({ ...original, status: "feito", prazo: "2026-09-28", dia_semana: 6 }, 0);
  assert.equal(copia.status, "standby");
  assert.equal(copia.prazo, null);
  assert.equal(copia.dia_semana, null);
});

test("a ordem recebida é a da cópia", () => {
  assert.equal(montarCopiaDemanda(original, 12).ordem, 12);
  assert.equal(montarCopiaDemanda({ ...original, ordem: 5 }, 0).ordem, 0);
});

test("não altera o objeto recebido", () => {
  const entrada = { ...original, status: "feito" };
  const antes = JSON.stringify(entrada);
  montarCopiaDemanda(entrada, 4);
  assert.equal(JSON.stringify(entrada), antes);
});

test("colunaDaCopia: Feito vira Standby, as outras ficam", () => {
  assert.equal(colunaDaCopia("feito"), "standby");
  assert.equal(colunaDaCopia("fazer_hoje"), "fazer_hoje");
  assert.equal(colunaDaCopia("recorrentes"), "recorrentes");
});

test("proximaOrdem: maior ordem da coluna + 1; coluna vazia começa em 0", () => {
  const lista = [
    { status: "standby", ordem: 4 },
    { status: "standby", ordem: 9 },
    { status: "fazer_hoje", ordem: 30 },
    { status: "standby", ordem: null },
  ];
  assert.equal(proximaOrdem(lista, "standby"), 10);
  assert.equal(proximaOrdem(lista, "fazer_hoje"), 31);
  assert.equal(proximaOrdem(lista, "feito"), 0);
  assert.equal(proximaOrdem([], "standby"), 0);
});
