// Fluxogramas com mouse de verdade (Chromium automatizado; a aba fica "visível" para a página): painel, inserção sem
// sobrepor, bolinhas de ligação, seta de dois cliques, texto em card e forma, menus, tema escuro, tela cheia e lista.
// ATENÇÃO: apaga o conteúdo do quadro informado. Uso: node testar-fluxogramas.mjs http://localhost:5190 <id-de-quadro-de-teste> <pasta>
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const [BASE, ID, SAIDA] = process.argv.slice(2);
const nav = await chromium.launch({ executablePath: CHROME });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));
p.on("console", (m) => { if (m.type() === "error" && !/hydrat|cz-shortcut/i.test(m.text())) erros.push(m.text().slice(0, 200)); });
const r = {};
const foto = (nome, clip) => p.screenshot({ path: `${SAIDA}/${nome}.png`, ...(clip ? { clip } : {}) });
const espera = (ms) => p.waitForTimeout(ms);
const els = () => p.evaluate(() => h.elements.filter((e) => !e.isDeleted).map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, w: e.width, h: e.height, cont: e.containerId ?? null, text: e.text ?? null, ancora: !!e.customData?.ancora, sb: e.startBinding?.elementId ?? null, eb: e.endBinding?.elementId ?? null, pts: e.points?.length ?? null, grupos: e.groupIds })));
const naTela = (x, y) => p.evaluate(([x, y]) => { const s = h.state; return { x: (x + s.scrollX) * s.zoom.value + s.offsetLeft, y: (y + s.scrollY) * s.zoom.value + s.offsetTop }; }, [x, y]);
const centroNaTela = async (e) => naTela(e.x + e.w / 2, e.y + e.h / 2);
const bolinhas = () => p.locator(".fluxo-conector").evaluateAll((ds) => ds.map((d) => { const b = d.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, label: d.getAttribute("aria-label") }; }));
const GATILHO = ".excalidraw [title=\"Formas extras e cards\"]";
const fecharPainel = async () => { await p.locator(".excalidraw .painel-gestor .sidebar__header__buttons button").last().click(); await p.waitForTimeout(350); };
const vazio = { x: 330, y: 840 };
const limparSelecao = async () => { await p.keyboard.press("Escape"); await p.mouse.click(vazio.x, vazio.y); await espera(200); };

try {
  await abrirEstavel(p, `${BASE}/fluxogramas/${ID}`, 8000);
  await p.waitForFunction(() => window.h?.app && document.querySelector(".excalidraw canvas.interactive"), null, { timeout: 60000 });
  await p.evaluate(() => { h.app.updateScene({ elements: [] }); });
  await espera(800);
  await foto("01-vazio");
  r.fontes = await p.evaluate(async () => { await document.fonts.ready; return { nunito: document.fonts.check("16px Nunito"), manrope: document.fonts.check("14px Manrope"), ui: getComputedStyle(document.querySelector(".excalidraw")).getPropertyValue("--ui-font").slice(0, 30) }; });

  // Painel "Formas"
  await p.click(GATILHO);
  await espera(600);
  const painel = await p.locator(".excalidraw .sidebar").boundingBox();
  await foto("02-painel-formas", painel);
  r.abas = await p.evaluate(() => [...document.querySelectorAll(".painel-gestor [role=tab]")].map((t) => ({ texto: t.textContent, largura: Math.round(t.getBoundingClientRect().width), cortada: t.scrollWidth > t.clientWidth + 1 })));
  await p.getByRole("tab", { name: "Cards" }).click();
  await espera(500);
  await foto("03-painel-cards", painel);
  await p.getByRole("button", { name: /Card arredondado/ }).click();
  await espera(300);
  await p.getByRole("button", { name: /Card arredondado/ }).click();
  await espera(400);
  let lista = await els();
  const cards = lista.filter((e) => e.type === "rectangle" && !e.ancora);
  r.segundoCardSemSobrepor = cards.length === 2 ? { dx: Math.round(cards[1].x - cards[0].x), dy: Math.round(cards[1].y - cards[0].y), sobrepoe: !(cards[1].x >= cards[0].x + cards[0].w || cards[0].x >= cards[1].x + cards[1].w || cards[1].y >= cards[0].y + cards[0].h || cards[0].y >= cards[1].y + cards[1].h) } : cards.length;
  r.cardVisivel = await p.evaluate(([id]) => { const e = h.elements.find((x) => x.id === id); const s = h.state; const direita = (e.x + e.width + s.scrollX) * s.zoom.value + s.offsetLeft; return { direitaDoCard: Math.round(direita), esquerdaDoPainel: Math.round(document.querySelector(".excalidraw .sidebar").getBoundingClientRect().left) }; }, [cards[0].id]);
  await fecharPainel();

  // Afasta o card B
  const [A, B] = cards;
  const bTopo = await naTela(B.x + 20, B.y + 6);
  await p.mouse.move(bTopo.x, bTopo.y); await p.mouse.down(); await p.mouse.move(bTopo.x + 190, bTopo.y + 60, { steps: 8 }); await p.mouse.move(bTopo.x + 380, bTopo.y + 120, { steps: 8 }); await p.mouse.up();
  await espera(300);
  await limparSelecao();
  lista = await els();
  const B2 = lista.find((e) => e.id === B.id);
  r.moveuB = { dx: Math.round(B2.x - B.x), dy: Math.round(B2.y - B.y) };

  // Bolinhas no card A
  const cA = await centroNaTela(A);
  await p.mouse.move(cA.x, cA.y, { steps: 4 });
  await espera(300);
  r.bolinhas = await p.locator(".fluxo-conector").count();
  await foto("04-bolinhas", { x: cA.x - 200, y: cA.y - 120, width: 400, height: 240 });

  // Arrasta da bolinha da direita até o card B
  const dir = (await bolinhas()).find((d) => /direit/.test(d.label));
  const cB = await centroNaTela(B2);
  await p.mouse.move(dir.x, dir.y); await p.mouse.down(); await p.mouse.move(dir.x + 30, dir.y, { steps: 3 }); await p.mouse.move(cB.x, cB.y, { steps: 12 }); await espera(150); await p.mouse.up();
  await espera(500);
  lista = await els();
  const seta1 = lista.filter((e) => e.type === "arrow").at(-1);
  r.setaArrastada = seta1 ? { presaEmA: seta1.sb === A.id, presaEmB: seta1.eb === B.id } : "sem seta";
  r.ferramentaDepois = await p.evaluate(() => h.state.activeTool.type);
  await foto("05-seta-arrastada", { x: cA.x - 160, y: cA.y - 140, width: Math.max(400, cB.x - cA.x + 320), height: 280 });

  // Clique na bolinha de baixo do A
  await limparSelecao();
  await p.mouse.move(cA.x, cA.y, { steps: 3 }); await espera(250);
  const baixo = (await bolinhas()).find((d) => /baixo/.test(d.label));
  await p.mouse.click(baixo.x, baixo.y);
  await espera(500);
  lista = await els();
  const novoCard = lista.filter((e) => e.type === "rectangle" && !e.ancora).find((e) => e.id !== A.id && e.id !== B.id);
  const seta2 = lista.filter((e) => e.type === "arrow").at(-1);
  r.cliqueBolinha = novoCard ? { vaoAbaixo: Math.round(novoCard.y - (A.y + A.h)), mesmoX: Math.round(novoCard.x - A.x), setaPresa: seta2.sb === A.id && seta2.eb === novoCard.id } : "não criou";
  await foto("05b-criado-abaixo", { x: cA.x - 200, y: cA.y - 80, width: 400, height: 380 });
  await limparSelecao();

  // Seta com dois cliques
  await p.keyboard.press("a");
  await espera(150);
  await p.mouse.click(1000, 720); await espera(150);
  await p.mouse.move(1150, 760, { steps: 5 }); await espera(100);
  await p.mouse.click(1150, 760); await espera(400);
  r.setaDoisCliques = await p.evaluate(() => { const s = h.elements.filter((e) => e.type === "arrow" && !e.isDeleted).at(-1); return { emAndamento: !!h.state.multiElement, pontos: s?.points.length, ferramenta: h.state.activeTool.type, comprimento: s ? Math.round(Math.hypot(s.width, s.height)) : 0 }; });
  await p.keyboard.press("a"); await espera(250);
  r.dicaSeta = await p.evaluate(() => document.querySelector(".HintViewer")?.textContent);
  await p.keyboard.press("v"); await espera(150);
  await limparSelecao();

  // Duplo clique no card A
  const cA2 = await centroNaTela(A);
  await p.mouse.dblclick(cA2.x, cA2.y);
  await espera(400);
  r.editorTexto = await p.evaluate(([x, y]) => { const t = document.querySelector(".excalidraw textarea"); if (!t) return "sem textarea"; const b = t.getBoundingClientRect(); return { dx: Math.round(b.x + b.width / 2 - x), dy: Math.round(b.y + b.height / 2 - y), fonte: getComputedStyle(t).fontFamily.slice(0, 20) }; }, [cA2.x, cA2.y]);
  await p.keyboard.type("Captação de leads");
  await foto("06-editando-card", { x: cA2.x - 180, y: cA2.y - 90, width: 360, height: 180 });
  await p.keyboard.press("Escape"); await espera(300);
  r.textoNoCard = await p.evaluate(([id]) => h.elements.find((e) => e.containerId === id && !e.isDeleted)?.text, [A.id]);
  await limparSelecao();

  // Cone e funil pelo painel
  await p.click(GATILHO); await espera(400);
  await p.getByRole("tab", { name: "Formas" }).click(); await espera(300);
  await p.getByTitle("Inserir cone").click(); await espera(300);
  await p.getByTitle("Inserir funil").click(); await espera(300);
  await fecharPainel();
  lista = await els();
  let ancoras = lista.filter((e) => e.ancora);
  const ancoraCone = ancoras[0];
  r.ancoras = ancoras.length;
  r.sobreposicoes = await p.evaluate(() => { const vivos = h.elements.filter((e) => !e.isDeleted && !e.containerId && e.type !== "arrow"); const grupoDe = (e) => e.groupIds.at(-1) ?? e.id; const caixas = new Map(); for (const e of vivos) { const g = grupoDe(e); const c = caixas.get(g) ?? { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }; c.x1 = Math.min(c.x1, e.x); c.y1 = Math.min(c.y1, e.y); c.x2 = Math.max(c.x2, e.x + e.width); c.y2 = Math.max(c.y2, e.y + e.height); caixas.set(g, c); } const l = [...caixas.values()]; let n = 0; for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) { const a = l[i], b = l[j]; if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) n++; } return n; });
  r.rotulosFunil = lista.filter((e) => e.type === "text" && ancoras.some((a) => a.id === e.cont)).map((e) => e.text);
  // afasta o funil
  const f1 = await centroNaTela(ancoras[1]);
  await limparSelecao();
  await p.mouse.move(f1.x, f1.y); await p.mouse.down(); await p.mouse.move(f1.x + 200, f1.y, { steps: 6 }); await p.mouse.move(f1.x + 440, f1.y, { steps: 6 }); await p.mouse.up(); await espera(300);
  await limparSelecao();
  const cc = await centroNaTela(ancoraCone);
  await p.mouse.dblclick(cc.x, cc.y + 20); await espera(400);
  r.editorNoCone = await p.evaluate(() => !!document.querySelector(".excalidraw textarea"));
  await p.keyboard.type("Topo"); await p.keyboard.press("Escape"); await espera(300);
  r.textoNoCone = await p.evaluate(([id]) => h.elements.find((e) => e.containerId === id && !e.isDeleted)?.text, [ancoraCone.id]);
  await limparSelecao();

  // Bolinha da faixa 2 do funil
  lista = await els();
  ancoras = lista.filter((e) => e.ancora);
  const faixa2 = ancoras[2];
  const f2 = await centroNaTela(faixa2);
  await p.mouse.move(f2.x, f2.y, { steps: 4 }); await espera(250);
  const dir3 = (await bolinhas()).find((d) => /direit/.test(d.label));
  if (dir3) { await p.mouse.click(dir3.x, dir3.y); await espera(500); }
  lista = await els();
  const setaFaixa = lista.filter((e) => e.type === "arrow").at(-1);
  r.faixaLigada = setaFaixa?.sb === faixa2.id;
  await limparSelecao();

  await p.keyboard.press("Shift+1"); await espera(700);
  await foto("07-tudo");
  await p.waitForFunction(() => /Salvo às/.test(document.querySelector(".fluxo-editor")?.firstElementChild?.textContent || ""), null, { timeout: 30000 }).catch(() => {});
  r.estado = await p.evaluate(() => document.querySelector(".fluxo-editor")?.firstElementChild?.textContent);

  // Menu, ajuda
  await p.click(".excalidraw .dropdown-menu-button"); await espera(400);
  await foto("08-menu");
  r.menu = await p.evaluate(() => [...document.querySelectorAll(".excalidraw .dropdown-menu-item")].map((i) => i.textContent.trim()).filter(Boolean));
  await p.keyboard.press("Escape"); await espera(200);
  await p.keyboard.press("Shift+?"); await espera(600);
  await foto("09-ajuda");
  await p.keyboard.press("Escape"); await espera(300);

  // Tema escuro
  await p.click("header button[title=\"Modo escuro\"]").catch(() => {});
  await espera(700);
  await foto("10-escuro");
  await p.click(GATILHO); await espera(500);
  const painel2 = await p.locator(".excalidraw .sidebar").boundingBox();
  if (painel2) await foto("11-painel-escuro", painel2);
  await p.click("header button[title=\"Modo claro\"]").catch(() => {});

  await p.click("button[title=\"Tela cheia\"]").catch(() => {});
  await espera(600);
  r.telaCheia = await p.evaluate(() => ({ ativa: !!document.fullscreenElement, altura: Math.round(document.querySelector(".fluxo-editor").getBoundingClientRect().height), tela: innerHeight }));
  await foto("12-tela-cheia");
  await p.keyboard.press("Escape"); await espera(400);
  r.textosEmIngles = await p.evaluate(() => {
    const re = /\b(the|to|and|click|drag|press|hold|shape|canvas|arrow|find|copy|link|select|show)\b/i;
    const achados = new Set();
    const andar = (el) => { for (const n of el.childNodes) { if (n.nodeType === 3) { const t = n.nodeValue.trim(); if (re.test(t)) achados.add(t.slice(0, 80)); } else if (n.nodeType === 1) andar(n); } for (const a of ["title", "aria-label", "placeholder"]) { const v = el.getAttribute?.(a); if (v && re.test(v)) achados.add(`[${a}] ${v.slice(0, 80)}`); } };
    document.querySelectorAll(".excalidraw").forEach(andar);
    return [...achados].slice(0, 30);
  });
  await p.click("a[aria-label=\"Voltar para os quadros\"]"); await espera(4000);
  await foto("13-lista");
} catch (e) {
  r.falha = String(e).slice(0, 400);
  await foto("99-falha").catch(() => {});
}
r.erros = erros;
console.log(JSON.stringify(r, null, 1));
await nav.close();
