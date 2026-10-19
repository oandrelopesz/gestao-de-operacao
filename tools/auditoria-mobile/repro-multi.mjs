// Reproduz a seleção de vários clientes: cria demanda [TESTE], marca 2 caixas no seletor do card e lê o banco.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const env = Object.fromEntries(readFileSync("../../.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const H = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json", Prefer: "return=representation" };
const api = (path, init) => fetch(env.VITE_SUPABASE_URL + "/rest/v1/" + path, { headers: H, ...init }).then((r) => r.json());
const [d] = await api("demandas", { method: "POST", body: JSON.stringify({ user_id: "b34bdae5-7a67-4b63-a46f-8aad43a06c63", titulo: "[TESTE] multi", status: "fazer_hoje" }) });
console.log("demanda", d.id);
const nav = await chromium.launch({ executablePath: CHROME });
try {
  const p = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  p.on("console", (m) => { if (m.type() === "error" && !/GSI|403|FedCM|identity|accounts list/.test(m.text())) console.log("  console:", m.text().slice(0, 200)); });
  p.on("response", async (r) => { if (r.request().method() === "PATCH") console.log("  PATCH", r.status(), (r.request().postData() || "").slice(0, 160), r.status() >= 400 ? (await r.text()).slice(0, 200) : ""); });
  await abrirEstavel(p, "http://localhost:5178/", 6000);
  const card = p.locator("div.group", { hasText: "[TESTE] multi" }).last();
  await card.hover();
  await card.getByTitle("Atribuir cliente").click();
  await p.waitForTimeout(600);
  const cl = await api("clientes?select=nome,agencia&agencia=not.is.null&limit=200");
  const a = cl[0], b = cl.find((c) => c.agencia !== a.agencia);
  console.log("clientes:", a.nome, a.agencia, "|", b.nome, b.agencia);
  const item = (n) => p.locator("[data-radix-popper-content-wrapper] [cmdk-item]", { hasText: n }).first();
  await p.locator("[data-radix-popper-content-wrapper] input").fill(a.nome); await item(a.nome).click(); await p.waitForTimeout(1000);
  console.log("lista segue aberta:", await p.locator("[data-radix-popper-content-wrapper]").count());
  await p.locator("[data-radix-popper-content-wrapper] input").fill(b.nome); await item(b.nome).click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: process.env.TEMP + "/repro-multi-aberto.png" });
  await p.locator("[data-radix-popper-content-wrapper] button", { hasText: "Pronto" }).click(); await p.waitForTimeout(1500);
  const [r] = await api("demandas?id=eq." + d.id + "&select=cliente_id,clientes_extras,pessoal,agencia_id");
  console.log("banco:", JSON.stringify(r));
  await p.screenshot({ path: process.env.TEMP + "/repro-multi.png" });
} finally {
  await api("demandas?id=eq." + d.id, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
  await nav.close(); console.log("apagada");
}
