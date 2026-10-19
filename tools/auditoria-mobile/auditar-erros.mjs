// Varredura rápida: erros de console, exceções, respostas 4xx/5xx e rolagem lateral em cada tela (desktop e celular).
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const BASE = process.argv[2] || "http://localhost:5178";
const ROTAS = ["/", "/agenda", "/onboarding", "/roadmap", "/ideias", "/acessos", "/saldo", "/nps", "/clientes", "/churn", "/crm", "/dados-internos",
  "/financeiro", "/cursos", "/livros", "/habilidades", "/ver-depois", "/transcritor", "/swipe", "/links", "/notas", "/arquivos", "/fluxogramas",
  "/dashboard", "/admin", "/conteudo", "/fireflies", "/gmn", "/instagram", "/utm", "/central"];
const nav = await chromium.launch({ executablePath: CHROME });
for (const [nome, w, h] of [["desktop", 1440, 900], ["celular", 390, 844]]) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, locale: "pt-BR" });
  for (const rota of ROTAS) {
    const p = await ctx.newPage(); const erros = [];
    p.on("console", (m) => { if (m.type() === "error") erros.push("console: " + m.text().slice(0, 160)); });
    p.on("pageerror", (e) => erros.push("EXCEÇÃO: " + String(e.message).slice(0, 160)));
    p.on("response", (r) => { if (r.status() >= 400 && !/favicon|\.map/.test(r.url())) erros.push(`HTTP ${r.status()} ${r.url().replace(/\?.*/, "").slice(0, 110)}`); });
    try {
      await abrirEstavel(p, BASE + rota, 5000);
      const info = await p.evaluate(() => ({ url: location.pathname, rolaX: document.documentElement.scrollWidth - innerWidth, texto: (document.querySelector("main")?.innerText || document.body.innerText).trim().slice(0, 60).replace(/\s+/g, " ") }));
      console.log(`[${nome}] ${rota} → ${info.url} rolaX=${info.rolaX} «${info.texto}»`);
    } catch (e) { console.log(`[${nome}] ${rota} FALHOU ${String(e.message).slice(0, 100)}`); }
    for (const e of [...new Set(erros)].slice(0, 6)) console.log("     " + e);
    await p.close();
  }
  await ctx.close();
}
await nav.close();
