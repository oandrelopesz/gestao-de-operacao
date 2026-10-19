import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const BASE = "http://localhost:5178"; const W = 390;
const nav = await chromium.launch({ executablePath: CHROME });
const ctx = await nav.newContext({ viewport: { width: W, height: 844 }, locale: "pt-BR", isMobile: true, hasTouch: true });
for (const rota of process.argv.slice(2)) {
  const p = await ctx.newPage();
  p.on("response", (r) => { if (r.status() === 404) console.log("  404", r.url().slice(0, 140)); });
  await abrirEstavel(p, BASE + "/" + rota, 5000);
  const r = await p.evaluate((W) => {
    const rolaX = (el) => { for (let q = el.parentElement; q; q = q.parentElement) { const o = getComputedStyle(q).overflowX; if ((o === "auto" || o === "scroll" || o === "hidden") && q !== document.documentElement) return true; } return false; };
    const d = (el) => `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 5).join(".")} «${(el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40)}»`;
    const todos = [...document.querySelectorAll("body *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > W + 2 && getComputedStyle(e).position !== "fixed" && !rolaX(e); });
    return { sw: document.documentElement.scrollWidth, el: todos.filter((e) => !todos.includes(e.parentElement)).slice(0, 8).map((e) => d(e) + " → " + Math.round(e.getBoundingClientRect().right)) };
  }, W);
  console.log(rota, r.sw); r.el.forEach((x) => console.log("   ", x));
  await p.close();
}
await nav.close();
