import test from "node:test";
import assert from "node:assert/strict";
import { aplicarMenu, moverNoGrupo, alternarOculta, normalizarMenu, MENU_FIXOS, reagrupar, GRUPOS_NOVOS } from "./menuConfig.ts";

test("endereço antigo (/pdfs → /arquivos) mantém ordem e oculta", () => {
  const g = [{ title: "Ferramentas", links: [{ to: "/links" }, { to: "/notas" }, { to: "/arquivos" }] }];
  assert.deepEqual(aplicarMenu(g, { ocultas: [], ordem: { Ferramentas: ["/pdfs", "/links", "/notas"] } })[0].links.map((l) => l.to), ["/arquivos", "/links", "/notas"]);
  assert.deepEqual(aplicarMenu(g, { ocultas: ["/pdfs"], ordem: {} })[0].links.map((l) => l.to), ["/links", "/notas"]);
  assert.deepEqual(normalizarMenu({ ocultas: ["/pdfs", "/arquivos"], ordem: {} }), { ocultas: ["/arquivos"], ordem: {} });
  assert.equal(normalizarMenu(null), null);
});

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

test("aba Prospecção virou CRM: ordem e oculta salvas com /prospeccao continuam valendo", () => {
  const cfg = normalizarMenu({ ocultas: ["/prospeccao"], ordem: { Operação: ["/clientes", "/prospeccao"] } });
  assert.deepEqual(cfg?.ocultas, ["/crm"]);
  assert.deepEqual(cfg?.ordem["Operação"], ["/clientes", "/crm"]);
});

test("reagrupar: grupos novos, oculta respeitada, extra entra e aba fora do mapa cai em Sistema", () => {
  const classicos = [
    { title: "Operação", links: [{ to: "/" }, { to: "/saldo" }] },
    { title: "Comercial", links: [{ to: "/clientes" }, { to: "/crm" }] },
    { title: "Sistema", links: [{ to: "/admin" }, { to: "/aba-nova" }] },
  ];
  const r = reagrupar(classicos, [{ to: "/hoje" }]);
  assert.deepEqual(r.map((g) => g.title), ["Hoje", "Clientes", "Comercial e dinheiro", "Sistema"]);
  assert.deepEqual(r[0].links.map((l) => l.to), ["/hoje", "/"]);
  assert.deepEqual(r[1].links.map((l) => l.to), ["/clientes", "/saldo"]);
  assert.deepEqual(r[3].links.map((l) => l.to), ["/admin", "/aba-nova"]);
  // nenhuma rota repetida entre os grupos novos
  const tos = GRUPOS_NOVOS.flatMap((g) => g.tos);
  assert.equal(new Set(tos).size, tos.length);
});

test("toda aba do NAV_GROUPS tem lugar no menu novo", async () => {
  const { readFileSync } = await import("node:fs");
  const texto = readFileSync(new URL("./nav.tsx", import.meta.url), "utf8");
  const rotas = [...texto.matchAll(/\bto: "(\/[^"]*)"/g)].map((m) => m[1]);
  const novos = new Set(GRUPOS_NOVOS.flatMap((g) => g.tos));
  assert.ok(rotas.length > 20);
  assert.deepEqual(rotas.filter((r) => !novos.has(r)), []);
});
