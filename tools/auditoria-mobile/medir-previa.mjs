// Mede, por dentro da página, do clique em "Ver" até o <iframe> da prévia existir e até o PDF carregar.
import { chromium } from "playwright-core";
import { CHROME } from "./rotas.mjs";
const [BASE = "http://localhost:5188"] = process.argv.slice(2);
const nav = await chromium.launch({ executablePath: CHROME });
const p = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.route(/supabase\.co/, (r) => (["GET", "HEAD", "OPTIONS"].includes(r.request().method()) || /\/object\/(authenticated\/)?fireflies\//.test(r.request().url()) ? r.continue() : r.abort()));
await p.goto(`${BASE}/fireflies`, { waitUntil: "domcontentloaded" });
await p.waitForSelector("text=Abrir no Fireflies", { timeout: 60_000 });
await p.waitForTimeout(1500);
const medir = () => p.evaluate(async () => {
  const b = [...document.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === "Ver resumo" && !x.disabled);
  b.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 1200)); // tempo de o pré-carregamento terminar
  const t0 = performance.now();
  b.click();
  const tIframe = await new Promise((ok) => { const f = () => (document.querySelector("iframe") ? ok(performance.now() - t0) : requestAnimationFrame(f)); f(); });
  const tLoad = await new Promise((ok) => { const i = document.querySelector("iframe"); i.addEventListener("load", () => ok(performance.now() - t0), { once: true }); setTimeout(() => ok(-1), 8000); });
  return { iframeMs: Math.round(tIframe), pdfCarregadoMs: Math.round(tLoad) };
});
const r1 = await medir();
await p.getByRole("button", { name: "Fechar" }).first().click(); await p.waitForTimeout(800);
const r2 = await medir();
console.log(JSON.stringify({ primeira: r1, segunda: r2 }));
await nav.close();
