// Varre todas as telas nas 3 aparências × claro/escuro: erros de console, estouro lateral, e paridade de controles
// (botões, campos e links dentro da tela) contra a Clássica. Salva um print por combinação.
// Uso: npm run teste -- varrer-aparencias.mjs [base] [saida] [rota,rota]  (desktop 1440; MOBILE=1 usa 390×844)
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { CHROME, ROTAS, abrirEstavel, nomeDaRota } from "./rotas.mjs";

const [BASE = "http://localhost:5178", SAIDA = "prints/aparencias", SO] = process.argv.slice(2);
const rotas = process.env.ROTAS ? process.env.ROTAS.split(",") : SO ? SO.split(",") : ROTAS;
const celular = process.env.MOBILE === "1";
const APARENCIAS = (process.env.APARENCIAS || "classica,painel,editorial").split(",");
mkdirSync(SAIDA, { recursive: true });

const navegador = await chromium.launch({ executablePath: CHROME });
const relatorio = [];

for (const rota of rotas) {
  const base = {};
  for (const aparencia of APARENCIAS) {
    for (const tema of ["light", "dark"]) {
      const ctx = await navegador.newContext(celular ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(`try{localStorage.setItem("aparencia","${aparencia}");localStorage.setItem("theme","${tema}")}catch(e){}`);
      const p = await ctx.newPage();
      const erros = [];
      p.on("pageerror", (e) => erros.push("pageerror: " + e.message.slice(0, 160)));
      p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|WebSocket/.test(m.text())) erros.push("console: " + m.text().slice(0, 160)); });
      await abrirEstavel(p, BASE + rota);
      const m = await p.evaluate(() => {
        // só a tela (sem o menu, que muda de forma de propósito)
        const main = document.querySelector("main > div[class*='page-enter']") ?? document.querySelector("main");
        const conta = (s) => main.querySelectorAll(s).length;
        return {
          aparencia: document.documentElement.dataset.aparencia,
          escuro: document.documentElement.classList.contains("dark"),
          botoes: conta("button"), campos: conta("input,textarea,select"), links: conta("a[href]"),
          estouro: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      const arquivo = `${SAIDA}/${nomeDaRota(rota)}-${aparencia}-${tema}${celular ? "-cel" : ""}.png`;
      await p.screenshot({ path: arquivo });
      await ctx.close();
      const chave = `${m.botoes}/${m.campos}/${m.links}`;
      if (aparencia === APARENCIAS[0] && tema === "light") base.chave = chave;
      relatorio.push({ rota, aparencia, tema, ok: m.aparencia === aparencia && m.escuro === (tema === "dark"), controles: chave, igualBase: chave === base.chave, estouro: m.estouro, erros: erros.length ? erros : undefined });
    }
  }
}
await navegador.close();
const ruins = relatorio.filter((r) => !r.ok || !r.igualBase || r.estouro > 1 || r.erros);
// Uma linha por combinação: rota, aparência, tema, botões/campos/links e alertas
for (const r of relatorio) console.log([r.rota, r.aparencia, r.tema, r.controles, r.ok ? "" : "NAO-APLICOU", r.igualBase ? "" : "DIF", r.estouro > 1 ? `ESTOURO ${r.estouro}px` : "", r.erros ? `${r.erros.length} erros` : ""].filter(Boolean).join("  "));
if (process.env.ERROS === "1") console.log(JSON.stringify(ruins.filter((r) => r.erros), null, 1));
console.log(`${relatorio.length} combinações, ${ruins.length} com alerta`);
