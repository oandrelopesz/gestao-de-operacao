process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { agruparEventos, filtrarLeads, intervaloDo, normalizarBusca, type FiltroCrm } from "./crmPeriodo.ts";
import { leadBase, type EventoCrm } from "./crmTipos.ts";
import { deSP } from "./crmFormato.ts";

const agora = deSP(2026, 9, 26, 15, 0);
const iso = (d: Date | null) => d?.toISOString() ?? null;

test("intervalos dos atalhos em SP", () => {
  const i = (atalho: FiltroCrm["periodo"]["atalho"], extra = {}) => {
    const r = intervaloDo({ atalho, criterio: "entrada", ...extra }, agora);
    return [iso(r.inicio), iso(r.fim)];
  };
  assert.deepEqual(i("hoje"), [deSP(2026, 9, 26).toISOString(), deSP(2026, 9, 27).toISOString()]);
  assert.deepEqual(i("ontem"), [deSP(2026, 9, 25).toISOString(), deSP(2026, 9, 26).toISOString()]);
  assert.deepEqual(i("7d"), [deSP(2026, 9, 20).toISOString(), deSP(2026, 9, 27).toISOString()]);
  assert.deepEqual(i("30d"), [deSP(2026, 8, 28).toISOString(), deSP(2026, 9, 27).toISOString()]);
  assert.deepEqual(i("mes"), [deSP(2026, 9, 1).toISOString(), deSP(2026, 10, 1).toISOString()]);
  assert.deepEqual(i("mes_passado"), [deSP(2026, 8, 1).toISOString(), deSP(2026, 9, 1).toISOString()]);
  assert.deepEqual(i("maximo"), [null, null]);
  assert.deepEqual(i("personalizado", { de: "2026-09-10", ate: "2026-09-12" }), [deSP(2026, 9, 10).toISOString(), deSP(2026, 9, 13).toISOString()]);
});

test("busca ignora acento e maiúscula", () => {
  assert.equal(normalizarBusca("  João Café "), "joao cafe");
});

test("filtrar por entrada, movimentação, tráfego e busca", () => {
  const antigo = leadBase({ id: "a", nome: "Ana Pão", created_at: deSP(2026, 8, 1).toISOString(), trafego: "pago" });
  const novo = leadBase({ id: "b", nome: "Bruno", empresa: "Café Bom", created_at: deSP(2026, 9, 26, 9).toISOString() });
  const ev: EventoCrm = { id: "e", lead_id: "a", tipo: "nota", descricao: "x", dados: {}, created_at: deSP(2026, 9, 26, 10).toISOString() };
  const porLead = agruparEventos([ev]);
  const base: FiltroCrm = { periodo: { atalho: "hoje", criterio: "entrada" }, busca: "", trafego: "todos" };
  assert.deepEqual(filtrarLeads([antigo, novo], porLead, base, agora).map((l) => l.id), ["b"]);
  assert.deepEqual(filtrarLeads([antigo, novo], porLead, { ...base, periodo: { atalho: "hoje", criterio: "movimentacao" } }, agora).map((l) => l.id), ["a"]);
  const max: FiltroCrm = { ...base, periodo: { atalho: "maximo", criterio: "entrada" } };
  assert.deepEqual(filtrarLeads([antigo, novo], porLead, { ...max, trafego: "pago" }, agora).map((l) => l.id), ["a"]);
  assert.deepEqual(filtrarLeads([antigo, novo], porLead, { ...max, busca: "cafe" }, agora).map((l) => l.id), ["b"]);
  assert.deepEqual(filtrarLeads([antigo, novo], porLead, { ...max, busca: "pao" }, agora).map((l) => l.id), ["a"]);
});
