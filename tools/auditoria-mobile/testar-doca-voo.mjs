// Painel e vidro: o card de um grupo da doca não pode pular ao abrir (nascia em cima e descia no fim da animação).
// Mede o topo do card logo após o clique e depois da animação; falha se mudar mais de 2 px.
// Uso: npm run teste -- testar-doca-voo.mjs [base]
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const BASE = process.argv[2] || "http://localhost:5178";
const navegador = await chromium.launch({ executablePath: CHROME });
let falhou = false;
for (const tema of ["light", "dark"]) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(`try{localStorage.setItem("aparencia","painel");localStorage.setItem("theme","${tema}")}catch(e){}`);
  const p = await ctx.newPage();
  await abrirEstavel(p, BASE + "/");
  // abrirEstavel desliga as animações para os prints; aqui a animação é justamente o que se testa
  await p.evaluate(() => document.querySelectorAll("style").forEach((s) => s.textContent.includes("caret-color:transparent!important") && s.remove()));
  // BUG=1 recoloca a animação antiga, para provar que o teste pega o pulo
  if (process.env.BUG === "1") await p.addStyleTag({ content: "@keyframes camada-abre{from{opacity:0;transform:translateY(-50%) translateX(-8px)}to{opacity:1;transform:translateY(-50%)}}" });
  for (const grupo of ["Operação", "Comercial", "Sistema"]) {
    const topos = await p.evaluate(async (g) => {
      document.querySelector(`nav[aria-label="Menu"] button[aria-label="${g}"]`).click();
      const card = () => document.querySelector(".camada-voo");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const cedo = card().getBoundingClientRect().top;
      await new Promise((r) => setTimeout(r, 600));
      const fim = card().getBoundingClientRect().top;
      document.querySelector(`nav[aria-label="Menu"] button[aria-label="${g}"]`).click(); // fecha
      return { cedo, fim };
    }, grupo);
    const pulo = Math.abs(topos.fim - topos.cedo);
    if (pulo > 2) falhou = true;
    console.log(`${tema}  ${grupo}  topo logo após clique ${topos.cedo.toFixed(1)}  após animação ${topos.fim.toFixed(1)}  ${pulo > 2 ? `PULA ${pulo.toFixed(0)}px` : "ok"}`);
  }
  // A janela do Ctrl+K (aberta pela lupa da doca) também não pode deslizar de outro lugar
  const janela = await p.evaluate(async () => {
    document.querySelector('nav[aria-label="Menu"] button[aria-label="Buscar aba"]').click();
    const el = () => document.querySelector('[role="dialog"]');
    while (!el()) await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    const a = el().getBoundingClientRect();
    await new Promise((r) => setTimeout(r, 700));
    const b = el().getBoundingClientRect();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return { dx: Math.abs(b.left - a.left), dy: Math.abs(b.top - a.top) };
  });
  const pulaJanela = Math.max(janela.dx, janela.dy) > 24; // zoom-in-95 mexe uns poucos px; deslize de 48% passa disso
  if (pulaJanela) falhou = true;
  console.log(`${tema}  Ctrl+K  desloca ${janela.dx.toFixed(0)}px na horizontal e ${janela.dy.toFixed(0)}px na vertical  ${pulaJanela ? "DESLIZA" : "ok"}`);
  await ctx.close();
}
await navegador.close();
process.exit(falhou ? 1 : 0);
