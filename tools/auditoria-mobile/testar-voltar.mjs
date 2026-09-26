// Simula sair e voltar ao sistema depois de 2 min (relógio adiantado): no celular a tela é remontada para
// buscar dados novos; no computador nada muda na tela.
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const [BASE = "http://localhost:5188", ROTA = "/financeiro"] = process.argv.slice(2);
const navegador = await chromium.launch({ executablePath: CHROME });

async function voltarDepoisDe2Min(celular) {
  const ctx = await navegador.newContext(celular
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  if (celular) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "pointer", value: "coarse" }, { name: "hover", value: "none" }] });
  }
  await abrirEstavel(p, BASE + ROTA);
  const remontou = await p.evaluate(async () => {
    const tela = document.querySelector("main > div.page-enter, main > div[class*='page-enter']");
    tela.dataset.marca = "antes";
    let estado = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => estado });
    estado = "hidden"; document.dispatchEvent(new Event("visibilitychange"));
    const agora = Date.now; Date.now = () => agora() + 120_000;
    estado = "visible"; document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 1500));
    const depois = document.querySelector("main > div[class*='page-enter']");
    return depois?.dataset.marca !== "antes";
  });
  await ctx.close();
  return remontou;
}

const resultado = { celularRemonta: await voltarDepoisDe2Min(true), computadorRemonta: await voltarDepoisDe2Min(false) };
await navegador.close();
console.log(JSON.stringify(resultado));
const ok = resultado.celularRemonta && !resultado.computadorRemonta;
console.log(ok ? "OK: celular atualiza a tela ao voltar; computador fica como está" : "FALHOU");
process.exit(ok ? 0 : 1);
