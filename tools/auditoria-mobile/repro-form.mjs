// Diálogo "Nova demanda": marca 2 clientes pelo nome, salva e confere o banco (apaga a [TESTE] no fim).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const env = Object.fromEntries(readFileSync("../../.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const H = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };
const api = (path, init) => fetch(env.VITE_SUPABASE_URL + "/rest/v1/" + path, { headers: H, ...init }).then((r) => r.text()).then((t) => (t ? JSON.parse(t) : null));
const url = process.argv[2] || "http://localhost:5178/";
const nav = await chromium.launch({ executablePath: CHROME });
try {
  const p = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await abrirEstavel(p, url, 6000);
  await p.getByRole("button", { name: "Nova", exact: true }).click();
  await p.waitForTimeout(800);
  await p.getByPlaceholder("O que precisa ser feito?").fill("[TESTE] form multi");
  await p.getByRole("dialog").getByRole("button", { name: /Sem cliente/ }).click();
  const cl = await api("clientes?select=nome&limit=2&order=nome");
  for (const c of cl) {
    await p.locator("[data-radix-popper-content-wrapper] input").fill(c.nome);
    await p.locator("[data-radix-popper-content-wrapper] [cmdk-item]", { hasText: c.nome }).first().click();
    await p.waitForTimeout(400);
  }
  console.log("rodapé:", await p.locator("[data-radix-popper-content-wrapper]").innerText().then((t) => t.split("\n").slice(-2).join(" ")));
  await p.locator("[data-radix-popper-content-wrapper] button", { hasText: "Pronto" }).click();
  console.log("botão:", await p.getByRole("dialog").getByRole("button").filter({ hasText: "+" }).innerText());
  await p.getByRole("dialog").getByRole("button", { name: /Criar|Salvar/ }).click();
  await p.waitForTimeout(2000);
  console.log("banco:", JSON.stringify(await api("demandas?titulo=eq.[TESTE] form multi&select=cliente_id,clientes_extras")));
} finally {
  await api("demandas?titulo=eq.[TESTE] form multi", { method: "DELETE" }).catch(() => {});
  await nav.close();
}
