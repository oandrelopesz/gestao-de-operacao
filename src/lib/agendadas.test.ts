import { test } from "node:test";
import assert from "node:assert/strict";
import { resumoAgendada } from "./agendadas.ts";

test("resumoAgendada conta os dias e diz quando a tarefa desce para o quadro", () => {
  assert.equal(resumoAgendada("2027-01-25", "2026-11-18"), "em 68 dias · desce para o quadro em 23/01");
  assert.equal(resumoAgendada("2026-11-21", "2026-11-18"), "em 3 dias · desce para o quadro amanhã");
});
