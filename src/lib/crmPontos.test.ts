process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { calcularPontos, horariosDosPontos, marcarPonto, periodoDaCall, reiniciarPontos, resumoPontos } from "./crmPontos.ts";
import { deSP, partesSP } from "./crmFormato.ts";

const fmt = (d: Date) => {
  const p = partesSP(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(p.dia)}/${z(p.mes)} ${z(p.hora)}:${z(p.minuto)}`;
};
const pontos = (inicio: Date) => horariosDosPontos(inicio).map(fmt);

test("período da call pelos limites de horário", () => {
  assert.equal(periodoDaCall(deSP(2026, 10, 1, 11, 59)), "manha");
  assert.equal(periodoDaCall(deSP(2026, 10, 1, 12, 0)), "inicio_tarde");
  assert.equal(periodoDaCall(deSP(2026, 10, 1, 14, 59)), "inicio_tarde");
  assert.equal(periodoDaCall(deSP(2026, 10, 1, 15, 0)), "fim_dia");
  assert.equal(periodoDaCall(deSP(2026, 10, 1, 17, 59)), "fim_dia");
  assert.equal(periodoDaCall(deSP(2026, 10, 1, 18, 0)), "noite");
});

test("manhã (09:00): lembrete do dia vai na noite anterior", () => {
  assert.deepEqual(pontos(deSP(2026, 10, 1, 9, 0)), ["28/09 10:00", "30/09 10:00", "30/09 19:00", "01/10 08:00", "01/10 08:50"]);
});

test("manhã cedo (07:30): pré-call não passa de 20 min antes", () => {
  assert.deepEqual(pontos(deSP(2026, 10, 1, 7, 30)).slice(3), ["01/10 07:10", "01/10 07:20"]);
});

test("início da tarde (13:00)", () => {
  assert.deepEqual(pontos(deSP(2026, 10, 1, 13, 0)), ["28/09 11:00", "30/09 11:00", "01/10 08:30", "01/10 11:00", "01/10 12:50"]);
});

test("fim do dia (16:00)", () => {
  assert.deepEqual(pontos(deSP(2026, 10, 1, 16, 0)), ["28/09 15:00", "30/09 15:00", "01/10 09:00", "01/10 14:00", "01/10 15:50"]);
});

test("noite (19:30)", () => {
  assert.deepEqual(pontos(deSP(2026, 10, 1, 19, 30)), ["28/09 18:30", "30/09 18:30", "01/10 12:00", "01/10 17:30", "01/10 19:20"]);
});

const reuniao = deSP(2026, 10, 1, 13, 0).toISOString();

test("estados: não se aplica, atrasado, feito e pendente", () => {
  const lead = {
    reuniao_em: reuniao,
    reuniao_marcada_em: deSP(2026, 9, 29, 12).toISOString(),
    pontos_contato: { ref: reuniao, marcada_em: deSP(2026, 9, 29, 12).toISOString(), feitos: { "3": deSP(2026, 10, 1, 8, 40).toISOString() } },
  };
  const agora = deSP(2026, 10, 1, 9, 0);
  const lista = calcularPontos(lead, agora);
  assert.deepEqual(lista.map((p) => p.estado), ["nao_se_aplica", "atrasado", "feito", "pendente", "pendente"]);
  const r = resumoPontos(lista);
  assert.equal(r.feitos, 1);
  assert.equal(r.aplicaveis, 4);
  assert.equal(r.proximo?.n, 4);
  assert.equal(r.atrasado?.n, 2);
});

test("sem reunião não há pontos; feitos de outra data não valem", () => {
  assert.deepEqual(calcularPontos({ reuniao_em: null, reuniao_marcada_em: null, pontos_contato: {} }, new Date()), []);
  const outra = deSP(2026, 10, 8, 13).toISOString();
  const lead = { reuniao_em: outra, reuniao_marcada_em: null, pontos_contato: { ref: reuniao, feitos: { "1": reuniao } } };
  assert.equal(calcularPontos(lead, deSP(2026, 9, 1)).filter((p) => p.estado === "feito").length, 0);
});

test("reiniciar e marcar/desmarcar", () => {
  const agora = deSP(2026, 9, 26, 10);
  const est = reiniciarPontos(reuniao, agora);
  assert.deepEqual(est, { ref: reuniao, marcada_em: agora.toISOString(), feitos: {} });
  const lead = { reuniao_em: reuniao, reuniao_marcada_em: agora.toISOString(), pontos_contato: est };
  const marcado = marcarPonto(lead, 2, true, agora);
  assert.equal(marcado.feitos?.["2"], agora.toISOString());
  const desmarcado = marcarPonto({ ...lead, pontos_contato: marcado }, 2, false, agora);
  assert.deepEqual(desmarcado.feitos, {});
});
