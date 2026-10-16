import test from "node:test";
import assert from "node:assert/strict";
import { churnDoMes, type ClienteChurn } from "./churn.ts";

const c = (
  agencia: string,
  status: string,
  churn_em: string | null = null,
  arquivado = false,
): ClienteChurn => ({ agencia, status_operacional: status, churn_em, arquivado });

test("churn do mês conta total e por agência, em relação à base de cada um", () => {
  const clientes = [
    c("effect", "ativo"),
    c("effect", "ativo"),
    c("effect", "churn", "2026-10-03"),
    c("spike", "ativo"),
    c("spike", "pausado"),
  ];
  const r = churnDoMes(clientes, "2026-10");
  assert.deepEqual(r.total, { churns: 1, base: 5, pct: 0.2 });
  assert.deepEqual(r.porAgencia.effect, { churns: 1, base: 3, pct: 1 / 3 });
  assert.deepEqual(r.porAgencia.spike, { churns: 0, base: 2, pct: 0 });
});

test("churn sem data (antigo) ou de outro mês fica fora da conta e da base", () => {
  const r = churnDoMes(
    [c("effect", "ativo"), c("effect", "churn"), c("effect", "churn", "2026-09-28")],
    "2026-10",
  );
  assert.deepEqual(r.total, { churns: 0, base: 1, pct: 0 });
});

test("churn no fim do mês conta no mês em que foi marcado, mesmo com contrato no mês seguinte", () => {
  const r = churnDoMes([c("effect", "churn", "2026-10-31"), c("effect", "ativo")], "2026-10");
  assert.equal(r.total.churns, 1);
  assert.equal(churnDoMes([c("effect", "churn", "2026-10-31")], "2026-11").total.churns, 0);
});

test("arquivado sai da base, mas o churn do mês dele continua contando", () => {
  const r = churnDoMes(
    [
      c("effect", "ativo", null, true),
      c("effect", "churn", "2026-10-05", true),
      c("effect", "ativo"),
    ],
    "2026-10",
  );
  assert.deepEqual(r.total, { churns: 1, base: 2, pct: 0.5 });
});

test("sem clientes, % é nulo", () => {
  assert.deepEqual(churnDoMes([], "2026-10").total, { churns: 0, base: 0, pct: null });
});

import { churnEncerrado } from "./churn.ts";

test("churn só sai dos ativos quando valeu: imediato, sem data ou contrato vencido", () => {
  const hoje = "2026-10-15";
  const e = (o: object) => churnEncerrado({ status_operacional: "churn", ...o }, hoje);
  assert.equal(e({ churn_efeito_imediato: true, contrato_ate: "2026-12-01" }), true);
  assert.equal(e({}), true);
  assert.equal(e({ contrato_ate: "2026-10-14" }), true);
  assert.equal(e({ contrato_ate: "2026-10-15" }), false);
  assert.equal(e({ contrato_ate: "2026-11-30" }), false);
  assert.equal(churnEncerrado({ status_operacional: "ativo", churn_efeito_imediato: true }, hoje), false);
});
