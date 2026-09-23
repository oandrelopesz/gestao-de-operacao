import test from "node:test";
import assert from "node:assert/strict";
import { msAteProximaVirada } from "./viradaDia.ts";

test("msAteProximaVirada: espera até 00:01 do dia seguinte (margem para o cron terminar)", () => {
  const agora = new Date(2026, 8, 23, 23, 0, 0); // 23/09 23:00 local
  assert.equal(msAteProximaVirada(agora), 61 * 60 * 1000);
});

test("msAteProximaVirada: logo após a meia-noite ainda aguarda o minuto de margem de hoje", () => {
  const agora = new Date(2026, 8, 24, 0, 0, 30);
  assert.equal(msAteProximaVirada(agora), 30 * 1000);
});
