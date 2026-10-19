// Cria uma demanda [TESTE] com 2 clientes, confere o selo "Diversos clientes" no card e a lista ao clicar; apaga a demanda no fim.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const env = Object.fromEntries(readFileSync("../../.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const H = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json", Prefer: "return=representation" };
const api = (path, init) => fetch(env.VITE_SUPABASE_URL + "/rest/v1/" + path, { headers: H, ...init }).then((r) => r.json());
const clientes = await api("clientes?select=id,nome&arquivado=eq.false&limit=2");
console.log("clientes:", clientes.map((c) => c.nome));
const r0 = await api("demandas", { method: "POST", body: JSON.stringify({ user_id: "b34bdae5-7a67-4b63-a46f-8aad43a06c63", titulo: "[TESTE] varios clientes", status: "fazer_hoje", cliente_id: clientes[0].id, clientes_extras: [clientes[1].id] }) }); console.log(JSON.stringify(r0).slice(0,300)); const [d] = r0;
console.log("demanda:", d.id ?? d);
const nav = await chromium.launch({ executablePath: CHROME });
try {
  const L = Number(process.env.LARGURA || 1440);
  const p = await (await nav.newContext({ viewport: { width: L, height: 900 }, isMobile: L < 500, hasTouch: L < 500, colorScheme: process.env.ESCURO ? "dark" : "light" })).newPage();
  await abrirEstavel(p, "http://localhost:5178/", 6000);
  const card = p.locator("div", { hasText: "[TESTE] varios clientes" }).filter({ has: p.locator("button", { hasText: "Diversos clientes" }) }).last();
  const tag = card.locator("button", { hasText: "Diversos clientes" }).first();
  console.log("selo visível:", await tag.isVisible(), "| selos de nome solto no card:", await card.locator("span", { hasText: clientes[0].nome }).count());
  await tag.click(); await p.waitForTimeout(400);
  const lista = await p.locator("[data-radix-popper-content-wrapper]").innerText();
  console.log("lista:", lista.replace(/\n/g, " | "));
  await p.screenshot({ path: (process.env.TEMP || ".") + "/diversos-" + L + (process.env.ESCURO ? "-escuro" : "") + ".png" });
} finally {
  await api("demandas?id=eq." + d.id, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
  await nav.close();
  console.log("demanda de teste apagada");
}
