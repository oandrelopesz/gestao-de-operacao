// Confere o arrastar do quadro de Demandas sem salvar nada (todo arrasto é cancelado com Esc antes de soltar):
// mouse no desktop arrasta como antes; no toque, deslizar NÃO arrasta e segurar ~250 ms arrasta.
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const [BASE = "http://localhost:5188"] = process.argv.slice(2);
const CARD = "[aria-roledescription=sortable][aria-disabled=false]";
const navegador = await chromium.launch({ executablePath: CHROME });
const arrastando = (p) => p.evaluate(() => !!document.querySelector("[aria-roledescription=sortable][aria-pressed=true]"));
const resultado = {};

// 1) Desktop, mouse
{
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await abrirEstavel(p, BASE + "/");
  const b = await p.locator(CARD).first().boundingBox();
  await p.mouse.move(b.x + b.width / 2, b.y + 20);
  await p.mouse.down();
  await p.mouse.move(b.x + b.width / 2 + 12, b.y + 32, { steps: 6 });
  resultado.mouseArrasta = await arrastando(p);
  await p.keyboard.press("Escape");
  await p.mouse.up();
  await ctx.close();
}

// Celular: cada gesto numa página nova, com eventos de toque reais (CDP)
async function gestoNoCelular(gesto) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await abrirEstavel(p, BASE + "/");
  const card = p.locator(CARD).first();
  await card.scrollIntoViewIfNeeded();
  const b = await card.boundingBox();
  const x = b.x + b.width / 2, y = b.y + Math.min(20, b.height / 2);
  const toque = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  await gesto(p, toque, x, y);
  const r = await arrastando(p);
  await p.keyboard.press("Escape");
  await toque("touchEnd", []);
  await ctx.close();
  return r;
}

// 2) deslizar rápido: não pode virar arrasto
resultado.toqueDeslizarArrasta = await gestoNoCelular(async (p, toque, x, y) => {
  await toque("touchStart", [{ x, y }]);
  for (let i = 1; i <= 6; i++) { await toque("touchMove", [{ x, y: y - i * 15 }]); await p.waitForTimeout(16); }
  await p.waitForTimeout(400);
});
// 3) segurar e mover: vira arrasto
resultado.toqueSegurarArrasta = await gestoNoCelular(async (p, toque, x, y) => {
  await toque("touchStart", [{ x, y }]);
  await p.waitForTimeout(500);
  await toque("touchMove", [{ x: x + 10, y: y + 10 }]);
  await p.waitForTimeout(50);
  await toque("touchMove", [{ x: x + 25, y: y + 25 }]);
  await p.waitForTimeout(150);
});
await navegador.close();
console.log(JSON.stringify(resultado));
const ok = resultado.mouseArrasta && !resultado.toqueDeslizarArrasta && resultado.toqueSegurarArrasta;
console.log(ok ? "OK: mouse arrasta, deslizar rola, segurar arrasta" : "FALHOU");
process.exit(ok ? 0 : 1);
