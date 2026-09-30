// Arrastar das Demandas em tela estreita (sem salvar nada: todo arrasto é cancelado com Esc).
// Levar um card até a borda direita tem de rolar o QUADRO, não a página: a página não pode ficar mais larga que a
// janela e a janela não pode rolar para o lado. (Regressão de 30/09/2026: a animação de entrada da página deixava
// um transform que virava referência do card que segue o mouse.)
// Não usa abrirEstavel: ela desliga as animações, e o defeito vinha justamente da animação de entrada.
import { chromium } from "playwright-core";
import { CHROME } from "./rotas.mjs";

const [BASE = "http://localhost:5188"] = process.argv.slice(2);
const CARD = "[aria-roledescription=sortable][aria-disabled=false]";
const navegador = await chromium.launch({ executablePath: CHROME });
const falhas = [];

for (const largura of [1024, 768]) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await p.waitForSelector(CARD, { timeout: 60_000 });
  await p.waitForTimeout(Number(process.env.ESPERA_MS || 3000));
  const b = await p.locator(CARD).first().boundingBox();
  const x = b.x + b.width / 2, y = b.y + 20;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + 20, y + 5, { steps: 4 });
  await p.mouse.move(largura - 8, y + 40, { steps: 20 });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const quadro = document.querySelector("div.h-full.overflow-x-auto");
    return { scrollX: window.scrollX, larguraPagina: document.scrollingElement.scrollWidth, janela: innerWidth, quadroRolou: quadro ? quadro.scrollLeft : -1 };
  });
  await p.keyboard.press("Escape");
  await p.mouse.up();
  await ctx.close();
  console.log(largura + "px", JSON.stringify(r));
  if (r.scrollX !== 0) falhas.push(`${largura}px: a janela rolou ${r.scrollX} px`);
  if (r.larguraPagina > r.janela) falhas.push(`${largura}px: a página esticou para ${r.larguraPagina} px`);
  if (r.quadroRolou <= 0) falhas.push(`${largura}px: o quadro não rolou`);
}

await navegador.close();
console.log(falhas.length ? "FALHOU: " + falhas.join("; ") : "OK: o quadro rola e a página fica parada");
process.exit(falhas.length ? 1 : 0);
