// Auditoria no celular: cada tela em 390x844 e 430x932 (toque), mede rolagem lateral, conteúdo cortado,
// alvos de toque < 40 px e texto < 11 px; abre as janelas "Novo…" e confere se o botão de salvar é alcançável.
import { chromium, webkit } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { ROTAS as TODAS, nomeDaRota, CHROME, abrirEstavel } from "./rotas.mjs";

// ROTAS=/,/financeiro limita a auditoria a essas telas (e às janelas delas)
const FILTRO = process.env.ROTAS ? process.env.ROTAS.split(",") : null;
const ROTAS = FILTRO ? TODAS.filter((r) => FILTRO.includes(r)) : TODAS;

const [BASE = "http://localhost:5188", SAIDA = "saida-auditoria", MOTOR = "chromium"] = process.argv.slice(2);
const TELAS = [{ nome: "iphone-390", width: 390, height: 844 }, { nome: "iphone-430", width: 430, height: 932 }];
// Telas com botão de criar e o texto dele: a janela precisa caber e o salvar precisa ser alcançável
const JANELAS = [["/financeiro", /Nova fonte/], ["/cursos", /Novo curso/], ["/clientes", /Novo cliente/],
  ["/saldo", /Novo registro/], ["/swipe", /Adicionar/], ["/links", /Novo link|Adicionar/], ["/acessos", /Adicionar/]].filter(([r]) => !FILTRO || FILTRO.includes(r));
mkdirSync(SAIDA, { recursive: true });

const navegador = MOTOR === "webkit" ? await webkit.launch() : await chromium.launch({ executablePath: CHROME });
const resultado = [];
for (const tela of TELAS) {
  const contexto = await navegador.newContext({ viewport: { width: tela.width, height: tela.height }, deviceScaleFactor: 2,
    isMobile: MOTOR !== "webkit" ? true : undefined, hasTouch: true, locale: "pt-BR" });
  for (const rota of ROTAS) {
    const pagina = await contexto.newPage();
    if (MOTOR !== "webkit") {
      const cdp = await contexto.newCDPSession(pagina);
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "pointer", value: "coarse" }, { name: "hover", value: "none" },
        { name: "any-pointer", value: "coarse" }, { name: "any-hover", value: "none" }] });
    }
    try {
      await abrirEstavel(pagina, BASE + rota);
      const m = await pagina.evaluate(() => {
        const W = innerWidth;
        const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0"; };
        const rolaX = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth) return true; } return false; };
        const desc = (el) => `${el.tagName.toLowerCase()}.${String(el.className || "").split(/\s+/).slice(0, 3).join(".")} «${(el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30)}»`;
        const raiz = document.querySelector("main") || document.body;
        const todos = [...raiz.querySelectorAll("*")].filter(vis);
        const vazam = todos.filter((el) => el.getBoundingClientRect().right > W + 2 && !rolaX(el));
        const alvoOk = (el) => { const r = el.getBoundingClientRect(); if (r.width >= 40 && r.height >= 40) return true;
          const d = getComputedStyle(el, "::after"); return d.content !== "none" && d.position === "absolute"; };
        const tocaveis = [...document.querySelectorAll("button, a[href], [role=button], [role=checkbox], [role=switch], [role=tab], input:not([type=hidden]), select")].filter(vis);
        const pequenos = tocaveis.filter((el) => !alvoOk(el));
        const miudos = todos.filter((el) => el.childElementCount === 0 && (el.innerText || "").trim() && parseFloat(getComputedStyle(el).fontSize) < 11);
        return {
          ponteiroToque: matchMedia("(pointer: coarse)").matches,
          rolagemLateral: document.documentElement.scrollWidth > W + 2 ? document.documentElement.scrollWidth : 0,
          vazam: vazam.filter((el) => !vazam.includes(el.parentElement)).slice(0, 5).map((el) => `${desc(el)} → ${Math.round(el.getBoundingClientRect().right)}px`),
          tocaveis: tocaveis.length, pequenos: pequenos.length,
          exemplosPequenos: pequenos.slice(0, 5).map((el) => `${desc(el)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`),
          textoMenor11: miudos.length,
          barraInferior: !!document.querySelector("nav[aria-label='Atalhos']"),
        };
      });
      await pagina.screenshot({ path: `${SAIDA}/${tela.nome}-${nomeDaRota(rota)}.png` });
      resultado.push({ tela: tela.nome, rota, ...m });
    } catch (e) {
      resultado.push({ tela: tela.nome, rota, erro: String(e.message || e).slice(0, 200) });
    } finally { await pagina.close(); }
  }
  // Janelas: abre, confere que cabem na tela e que o botão de salvar fica visível depois de rolar
  for (const [rota, texto] of JANELAS) {
    const pagina = await contexto.newPage();
    try {
      await abrirEstavel(pagina, BASE + rota);
      await pagina.getByRole("button", { name: texto }).first().click();
      const dlg = pagina.locator("[role=dialog]").last();
      await dlg.waitFor({ timeout: 10_000 });
      await pagina.waitForTimeout(600);
      const j = await dlg.evaluate((d) => {
        const r = d.getBoundingClientRect();
        d.scrollTop = d.scrollHeight;
        const salvar = [...d.querySelectorAll("button[type=submit], button")].filter((b) => /Salvar|Criar|Adicionar|Registrar|Cadastrar/i.test(b.innerText)).pop();
        const s = salvar?.getBoundingClientRect();
        return { cabe: r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1,
          rolavel: d.scrollHeight <= d.clientHeight + 1 || getComputedStyle(d).overflowY !== "visible",
          salvarVisivel: !!s && s.top >= 0 && s.bottom <= innerHeight && s.height > 0, salvarTexto: salvar?.innerText?.trim() || null };
      });
      await pagina.screenshot({ path: `${SAIDA}/${tela.nome}-janela-${nomeDaRota(rota)}.png` });
      resultado.push({ tela: tela.nome, rota, janela: j });
    } catch (e) {
      resultado.push({ tela: tela.nome, rota, janela: { erro: String(e.message || e).slice(0, 160) } });
    } finally { await pagina.close(); }
  }
  await contexto.close();
}
await navegador.close();
writeFileSync(`${SAIDA}/resultado.json`, JSON.stringify(resultado, null, 2));
for (const r of resultado) {
  if (r.janela) { console.log(`${r.tela} janela ${r.rota.padEnd(12)} ${JSON.stringify(r.janela)}`); continue; }
  console.log(`${r.tela} ${r.rota.padEnd(12)} toque:${r.ponteiroToque ? "s" : "n"} lateral:${r.rolagemLateral ?? "-"} vazam:${r.vazam?.length ?? "-"} peq:${r.pequenos ?? "-"}/${r.tocaveis ?? "-"} <11px:${r.textoMenor11 ?? "-"} barra:${r.barraInferior ? "s" : "n"} ${r.erro || ""}`);
}
