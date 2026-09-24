import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoExpiracao } from "./cursoExpiracao.ts";

const hoje = new Date(2026, 8, 24, 15, 30); // 24/09/2026, meio da tarde

test("sem data: nada a mostrar", () => {
  assert.equal(estadoExpiracao(null, hoje), null);
  assert.equal(estadoExpiracao("", hoje), null);
  assert.equal(estadoExpiracao("lixo", hoje), null);
});

test("cor muda conforme a data chega perto", () => {
  assert.deepEqual(estadoExpiracao("2027-03-12", hoje), { nivel: "ok", dias: 169, rotulo: "Expira em 12/03/2027" });
  assert.deepEqual(estadoExpiracao("2026-11-10", hoje), { nivel: "ok", dias: 47, rotulo: "Expira em 47 dias" });
  assert.equal(estadoExpiracao("2026-10-24", hoje)?.nivel, "atencao"); // 30 dias
  assert.equal(estadoExpiracao("2026-10-01", hoje)?.nivel, "urgente"); // 7 dias
  assert.deepEqual(estadoExpiracao("2026-09-25", hoje), { nivel: "urgente", dias: 1, rotulo: "Expira amanhã" });
});

test("o dia da data ainda vale; expira no dia seguinte", () => {
  assert.deepEqual(estadoExpiracao("2026-09-24", hoje), { nivel: "urgente", dias: 0, rotulo: "Expira hoje" });
  assert.deepEqual(estadoExpiracao("2026-09-23", hoje), { nivel: "expirado", dias: -1, rotulo: "Expirado em 23/09/2026" });
});
