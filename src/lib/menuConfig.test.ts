import test from "node:test";
import assert from "node:assert/strict";
import { aplicarMenu, moverNoGrupo, alternarOculta, MENU_FIXOS } from "./menuConfig.ts";

const grupos = [
  { title: "Operação", links: [{ to: "/" }, { to: "/onboarding" }, { to: "/roadmap" }, { to: "/ideias" }] },
  { title: "Sistema", links: [{ to: "/admin" }] },
];

test("sem config, menu igual ao padrão", () => {
  assert.deepEqual(aplicarMenu(grupos, null), grupos);
});

test("oculta abas, mas nunca Demandas e Admin; grupo vazio some", () => {
  const r = aplicarMenu(grupos, { ocultas: ["/roadmap", "/", "/admin"], ordem: {} });
  assert.deepEqual(r[0].links.map((l) => l.to), ["/", "/onboarding", "/ideias"]);
  assert.deepEqual(r[1].links.map((l) => l.to), ["/admin"]);
  assert.deepEqual(MENU_FIXOS, ["/", "/admin"]);
  const soOcultaveis = [{ title: "X", links: [{ to: "/ideias" }] }];
  assert.deepEqual(aplicarMenu(soOcultaveis, { ocultas: ["/ideias"], ordem: {} }), []);
});

test("ordem por grupo; abas novas (fora da ordem salva) vão para o fim", () => {
  const r = aplicarMenu(grupos, { ocultas: [], ordem: { "Operação": ["/ideias", "/"] } });
  assert.deepEqual(r[0].links.map((l) => l.to), ["/ideias", "/", "/onboarding", "/roadmap"]);
});

test("moverNoGrupo e alternarOculta", () => {
  const tos = ["/", "/onboarding", "/roadmap"];
  const c1 = moverNoGrupo({ ocultas: [], ordem: {} }, "Operação", tos, "/roadmap", -1);
  assert.deepEqual(c1.ordem["Operação"], ["/", "/roadmap", "/onboarding"]);
  assert.deepEqual(moverNoGrupo(c1, "Operação", c1.ordem["Operação"], "/", -1).ordem["Operação"], ["/", "/roadmap", "/onboarding"]);
  const c2 = alternarOculta({ ocultas: [], ordem: {} }, "/ideias");
  assert.deepEqual(c2.ocultas, ["/ideias"]);
  assert.deepEqual(alternarOculta(c2, "/ideias").ocultas, []);
  assert.deepEqual(alternarOculta(c2, "/admin").ocultas, ["/ideias"]);
});
