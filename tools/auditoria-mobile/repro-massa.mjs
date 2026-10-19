// Seleção em massa: 2 demandas [TESTE], barra Cliente, marca 2 clientes pelo nome, confere o banco (apaga no fim).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const env = Object.fromEntries(readFileSync("../../.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const H = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json", Prefer: "return=representation" };
const api = (path, init) => fetch(env.VITE_SUPABASE_URL + "/rest/v1/" + path, { headers: H, ...init }).then((r) => r.text()).then((t) => (t ? JSON.parse(t) : null));
const uid = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";
await api("demandas", { method: "POST", body: JSON.stringify([1, 2].map((n) => ({ user_id: uid, titulo: "[TESTE] massa " + n, status: "fazer_hoje" }))) });
const nav = await chromium.launch({ executablePath: CHROME });
try {
  const p = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await abrirEstavel(p, process.argv[2] || "http://localhost:5178/", 6000);
  await p.getByRole("button", { name: "Selecionar", exact: true }).first().click();
  for (const n of [1, 2]) await p.locator("div.group", { hasText: "[TESTE] massa " + n }).last().click();
  await p.getByRole("button", { name: "Cliente", exact: true }).click();
  const cl = await api("clientes?select=nome&limit=2&order=nome");
  for (const c of cl) {
    await p.locator("[data-radix-popper-content-wrapper] input").fill(c.nome);
    await p.locator("[data-radix-popper-content-wrapper] [cmdk-item]", { hasText: c.nome }).first().click();
    await p.waitForTimeout(1200);
  }
  console.log("banco:", JSON.stringify(await api("demandas?titulo=like.[TESTE] massa*&select=titulo,cliente_id,clientes_extras")));
} finally {
  await api("demandas?titulo=like.[TESTE] massa*", { method: "DELETE" }).catch(() => {});
  await nav.close();
}
