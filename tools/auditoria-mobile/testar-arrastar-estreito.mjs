// Arrastar das Demandas em tela estreita (sem salvar nada: todo arrasto é cancelado com Esc).
// Levar um card até a borda direita tem de rolar o QUADRO, não a página: a página não pode ficar mais larga que a
// janela e a janela não pode rolar para o lado. (Regressão de 30/09/2026: a animação de entrada da página deixava
// um transform que virava referência do card que segue o mouse.)
// Depois segura na borda e volta para a esquerda atravessando as colunas: o arrasto não pode cair nem o React pode
// entrar em laço ("Maximum update depth exceeded"). (Regressão de 30/09/2026: a troca de coluna no onDragOver
// pulava A→B→A no mesmo quadro; acontecia em 7 de 8 tentativas.)
// Com o card colado na borda o quadro rola no máximo uma coluna (~300 px) a cada meio segundo, para dar tempo de
// soltar na coluna certa. (Regressão de 30/09/2026: no site o padrão do dnd-kit rolava ~1.000 px/s, uma coluna a
// cada 300 ms, e o card passava de Standby para Feito antes de dar tempo de soltar.) A velocidade só vale no build de produção (`npx vite build` + `npx vite preview`) ou no site: no
// servidor de desenvolvimento o React é mais lento e a rolagem sai mais devagar do que é de verdade.
// Não usa abrirEstavel: ela desliga as animações, e o defeito vinha justamente da animação de entrada.
import { chromium } from "playwright-core";
import { CHROME } from "./rotas.mjs";

const [BASE = "http://localhost:5188"] = process.argv.slice(2);
const RODADAS = Number(process.env.RODADAS || 2);
const VELOCIDADE_MAX = 600; // px/s
const CARD = "[aria-roledescription=sortable][aria-disabled=false]";
const navegador = await chromium.launch({ executablePath: CHROME });
const falhas = [];

for (let rodada = 1; rodada <= RODADAS; rodada++) {
  for (const largura of [1024, 768]) {
    const ctx = await navegador.newContext({ viewport: { width: largura, height: 800 } });
    const p = await ctx.newPage();
    let laco = false;
    p.on("console", (m) => { if (/Maximum update depth|React error #185/.test(m.text())) laco = true; });
    await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
    await p.waitForSelector(CARD, { timeout: 60_000 });
    await p.waitForTimeout(Number(process.env.ESPERA_MS || 3000));
    const b = await p.locator(CARD).first().boundingBox();
    const x = b.x + b.width / 2, y = b.y + 20;
    await p.mouse.move(x, y);
    await p.mouse.down();
    await p.mouse.move(x + 20, y + 5, { steps: 4 });
    await p.mouse.move(largura - 8, y + 40, { steps: 5 });
    // velocidade da rolagem automática com o card colado na borda (a mais rápida possível)
    const rolagem = () => p.evaluate(() => ({ s: document.querySelector("div.h-full.overflow-x-auto")?.scrollLeft ?? 0, t: performance.now() }));
    await p.waitForTimeout(50);
    const a = await rolagem();
    await p.waitForTimeout(300);
    const z = await rolagem();
    const velocidade = Math.round(((z.s - a.s) / (z.t - a.t)) * 1000);
    await p.waitForTimeout(1150);
    const r = await p.evaluate(() => {
      const quadro = document.querySelector("div.h-full.overflow-x-auto");
      return { scrollX: window.scrollX, larguraPagina: document.scrollingElement.scrollWidth, janela: innerWidth, quadroRolou: quadro ? quadro.scrollLeft : -1 };
    });
    await p.waitForTimeout(1500);
    await p.mouse.move(40, y + 40, { steps: 20 });
    await p.waitForTimeout(3000);
    const aindaArrastando = await p.evaluate(() => !!document.querySelector("[aria-pressed=true]"));
    await p.keyboard.press("Escape");
    await p.mouse.up();
    await ctx.close();
    const nome = `rodada ${rodada}, ${largura}px`;
    console.log(nome, JSON.stringify({ ...r, velocidade, aindaArrastando, laco }));
    if (velocidade > VELOCIDADE_MAX) falhas.push(`${nome}: o quadro rola a ${velocidade} px/s (máximo ${VELOCIDADE_MAX})`);
    if (r.scrollX !== 0) falhas.push(`${nome}: a janela rolou ${r.scrollX} px`);
    if (r.larguraPagina > r.janela) falhas.push(`${nome}: a página esticou para ${r.larguraPagina} px`);
    if (r.quadroRolou <= 0) falhas.push(`${nome}: o quadro não rolou`);
    if (laco) falhas.push(`${nome}: laço do React (Maximum update depth)`);
    else if (!aindaArrastando) falhas.push(`${nome}: o arrasto caiu na volta`);
  }
}

await navegador.close();
console.log(falhas.length ? "FALHOU: " + falhas.join("; ") : "OK: o quadro rola, a página fica parada e o arrasto aguenta ida e volta");
process.exit(falhas.length ? 1 : 0);
