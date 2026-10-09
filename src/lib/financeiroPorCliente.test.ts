import test from "node:test";
import assert from "node:assert/strict";
import { calcularPorCliente, clienteContaNoMes, type ClienteDaAgencia } from "./financeiroPorCliente.ts";

const cli = (id: string, extra: Partial<ClienteDaAgencia> = {}): ClienteDaAgencia => ({
  id, nome: `Cliente ${id}`, arquivado: false, status_operacional: "ativo", churn_efeito_imediato: false, contrato_ate: null, ...extra,
});
const clientes = [cli("a"), cli("b"), cli("c")];
const fixoVar = { modelo: "fixo_variavel" as const, valor_fixo: 1000, valor_por_cliente: 200 };
const soVar = { modelo: "so_variavel" as const, valor_fixo: 1000, valor_por_cliente: 200 };

test("fixo + variável: fixo mais cada cliente", () => {
  const r = calcularPorCliente(fixoVar, clientes, {}, "2026-10");
  assert.equal(r.quantidade, 3);
  assert.equal(r.fixo, 1000);
  assert.equal(r.variavel, 600);
  assert.equal(r.total, 1600);
});

test("só variável ignora o valor fixo guardado", () => {
  const r = calcularPorCliente(soVar, clientes, {}, "2026-10");
  assert.equal(r.fixo, 0);
  assert.equal(r.total, 600);
});

test("valor personalizado de um cliente vence o padrão; null volta ao padrão", () => {
  const r = calcularPorCliente(soVar, clientes, { b: 500, c: null }, "2026-10");
  assert.equal(r.total, 200 + 500 + 200);
  assert.deepEqual(r.clientes.map((c) => c.personalizado), [false, true, false]);
  assert.equal(r.clientes[1].valor, 500);
});

test("override zero é válido (cliente isento)", () => {
  assert.equal(calcularPorCliente(soVar, clientes, { a: 0 }, "2026-10").total, 400);
});

test("churn de efeito imediato sai na hora, mesmo com contrato_ate", () => {
  const lista = [cli("a"), cli("b", { status_operacional: "churn", churn_efeito_imediato: true, contrato_ate: "2026-12-31" })];
  assert.equal(calcularPorCliente(soVar, lista, {}, "2026-10").quantidade, 1);
});

test("churn sem data de contrato sai na hora", () => {
  const lista = [cli("a"), cli("b", { status_operacional: "churn" })];
  assert.equal(calcularPorCliente(soVar, lista, {}, "2026-10").quantidade, 1);
});

test("churn com contrato até a data: conta até o mês dela e depois sai", () => {
  const b = cli("b", { status_operacional: "churn", contrato_ate: "2026-11-15" });
  assert.equal(clienteContaNoMes(b, "2026-10"), true);
  assert.equal(clienteContaNoMes(b, "2026-11"), true);
  assert.equal(clienteContaNoMes(b, "2026-12"), false);
  const r = calcularPorCliente(soVar, [cli("a"), b], {}, "2026-11");
  assert.equal(r.quantidade, 2);
  assert.equal(r.clientes[1].emChurn, true);
  assert.equal(r.clientes[1].contrato_ate, "2026-11-15");
});

test("arquivado não conta", () => {
  assert.equal(calcularPorCliente(soVar, [cli("a"), cli("b", { arquivado: true })], {}, "2026-10").quantidade, 1);
});

test("mês futuro avalia a regra naquele mês", () => {
  const b = cli("b", { status_operacional: "churn", contrato_ate: "2026-10-20" });
  assert.equal(calcularPorCliente(soVar, [cli("a"), b], {}, "2026-10").total, 400);
  assert.equal(calcularPorCliente(soVar, [cli("a"), b], {}, "2027-03").total, 200);
});

test("agência sem clientes: só o fixo (ou zero)", () => {
  assert.equal(calcularPorCliente(fixoVar, [], {}, "2026-10").total, 1000);
  assert.equal(calcularPorCliente(soVar, [], {}, "2026-10").total, 0);
});

test("soma em centavos sem sobra de ponto flutuante", () => {
  const r = calcularPorCliente({ modelo: "so_variavel", valor_fixo: 0, valor_por_cliente: 0.1 }, [cli("a"), cli("b"), cli("c")], {}, "2026-10");
  assert.equal(r.total, 0.3);
});
