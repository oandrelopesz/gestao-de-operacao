// Ligação por bolinha com mouse de verdade (local, com window.h): arrastar até outra forma, clicar sem arrastar,
// mover a origem (a seta acompanha), soltar no vazio, Esc cancela, e pegar uma forma desenhada pelo meio.
// Cria e apaga o quadro "TESTE CLAUDE — ligações". Uso: node testar-ligacoes.mjs http://localhost:5190 <pasta>
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const [BASE, SAIDA] = process.argv.slice(2);
mkdirSync(SAIDA, { recursive: true });
const nav = await chromium.launch({ executablePath: CHROME });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(String(e).slice(0, 300)));
p.on("console", (m) => { if (m.type() === "error" && !/hydrat|cz-shortcut/i.test(m.text())) erros.push(m.text().slice(0, 300)); });
const espera = (ms) => p.waitForTimeout(ms);
const r = {};
const naTela = (x, y) => p.evaluate(([x, y]) => { const s = h.state; return { x: (x + s.scrollX) * s.zoom.value + s.offsetLeft, y: (y + s.scrollY) * s.zoom.value + s.offsetTop }; }, [x, y]);
const els = () => p.evaluate(() => h.elements.filter((e) => !e.isDeleted).map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, w: e.width, h: e.height, sb: e.startBinding?.elementId ?? null, eb: e.endBinding?.elementId ?? null, pts: e.points?.map((q) => [Math.round(q[0]), Math.round(q[1])]) ?? null })));
const limpar = async () => { await p.keyboard.press("Escape"); await p.mouse.click(330, 860); await espera(200); };
const bolinhas = () => p.locator(".fluxo-conector").evaluateAll((ds) => ds.map((d) => { const b = d.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, l: d.getAttribute("aria-label") }; }));
const bolinha = async (el, re) => {
  const c = await naTela(el.x + el.w / 2, el.y + el.h / 2);
  await p.mouse.move(c.x, c.y, { steps: 4 }); await espera(250);
  return (await bolinhas()).find((d) => re.test(d.l));
};

let id = null;
try {
  await abrirEstavel(p, `${BASE}/fluxogramas`, 5000);
  await p.getByRole("button", { name: "Novo quadro" }).first().click();
  const d = p.getByRole("dialog");
  await d.locator("#novo-quadro-nome").fill("TESTE CLAUDE — ligações");
  await d.getByRole("button", { name: /Criar e abrir/ }).click();
  await p.waitForURL(/\/fluxogramas\/[0-9a-f-]{36}/);
  id = p.url().split("/").pop();
  await p.waitForFunction(() => window.h?.app && document.querySelector(".excalidraw canvas.interactive"), null, { timeout: 60000 });
  await espera(800);
  // Dois cards lado a lado (o segundo vai para o espaço livre)
  await p.click(".excalidraw [title=\"Formas extras e cards\"]"); await espera(300);
  await p.getByRole("tab", { name: "Cards" }).click();
  await p.getByRole("button", { name: /Card arredondado/ }).click(); await espera(200);
  await p.getByRole("button", { name: /Card quadrado/ }).click(); await espera(200);
  await p.locator(".excalidraw .painel-gestor .sidebar__header__buttons button").last().click(); await espera(300);
  await limpar();
  let lista = await els();
  const [A, B] = lista.filter((e) => e.type === "rectangle");
  // Afasta B para a direita (400 px)
  const bt = await naTela(B.x + 20, B.y + 8);
  await p.mouse.move(bt.x, bt.y); await p.mouse.down(); await p.mouse.move(bt.x + 200, bt.y + 40, { steps: 8 }); await p.mouse.move(bt.x + 420, bt.y + 80, { steps: 8 }); await p.mouse.up();
  await limpar();
  lista = await els();
  const B2 = lista.find((e) => e.id === B.id);

  // 1) Clicar na bolinha sem arrastar: nada acontece
  let dot = await bolinha(A, /direit/);
  const antes = (await els()).length;
  await p.mouse.move(dot.x, dot.y, { steps: 3 }); await p.mouse.down(); await p.mouse.up(); await espera(400);
  r.cliqueNaoCria = (await els()).length === antes;
  await limpar();

  // 2) Arrastar da bolinha da direita de A até o meio de B: prévia no caminho e seta presa nos dois
  dot = await bolinha(A, /direit/);
  const cB = await naTela(B2.x + B2.w / 2, B2.y + B2.h / 2);
  await p.mouse.move(dot.x, dot.y, { steps: 3 });
  await p.mouse.down();
  await p.mouse.move(dot.x + 40, dot.y + 5, { steps: 5 });
  await p.mouse.move(cB.x, cB.y, { steps: 15 });
  await espera(150);
  r.previa = { linha: await p.locator(".fluxo-previa-linha").count(), destaque: await p.locator(".fluxo-previa-alvo").count() };
  await p.screenshot({ path: `${SAIDA}/01-arrastando.png` });
  await p.mouse.up(); await espera(400);
  lista = await els();
  let seta = lista.filter((e) => e.type === "arrow").at(-1);
  r.ligou = seta ? { presaEmA: seta.sb === A.id, presaEmB: seta.eb === B.id } : "sem seta";
  r.cardsNaoMoveram = (() => { const a2 = lista.find((e) => e.id === A.id); return Math.abs(a2.x - A.x) < 1 && Math.abs(a2.y - A.y) < 1; })();
  await p.screenshot({ path: `${SAIDA}/02-ligado.png` });
  await limpar();

  // 3) Move a origem A 160 px para baixo: a seta acompanha
  const inicioAntes = [seta.x, seta.y];
  const at = await naTela(A.x + 20, A.y + 8);
  await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x, at.y + 80, { steps: 8 }); await p.mouse.move(at.x, at.y + 160, { steps: 8 }); await p.mouse.up();
  await espera(300);
  lista = await els();
  seta = lista.find((e) => e.id === seta.id);
  r.setaAcompanha = { dy: Math.round(seta.y - inicioAntes[1]), aindaPresa: seta.sb === A.id && seta.eb === B.id };
  await p.screenshot({ path: `${SAIDA}/03-movido.png` });
  await limpar();

  // 4) Soltar no vazio: seta até ali, presa só na origem
  const A3 = (await els()).find((e) => e.id === A.id);
  dot = await bolinha(A3, /baixo/);
  await p.mouse.move(dot.x, dot.y, { steps: 3 }); await p.mouse.down(); await p.mouse.move(dot.x, dot.y + 60, { steps: 6 }); await p.mouse.move(dot.x - 30, dot.y + 140, { steps: 6 }); await p.mouse.up();
  await espera(300);
  seta = (await els()).filter((e) => e.type === "arrow").at(-1);
  r.soltouNoVazio = { presaNaOrigem: seta.sb === A.id, fimLivre: seta.eb === null };
  await limpar();

  // 5) Esc no meio do arraste cancela
  const qtd = (await els()).length;
  dot = await bolinha(A3, /esquerd/);
  await p.mouse.move(dot.x, dot.y, { steps: 3 }); await p.mouse.down(); await p.mouse.move(dot.x - 80, dot.y, { steps: 6 });
  await p.keyboard.press("Escape"); await p.mouse.up(); await espera(300);
  r.escCancela = (await els()).length === qtd && (await p.locator(".fluxo-previa-linha").count()) === 0;
  await limpar();

  // 6) Retângulo desenhado com a ferramenta (R): nasce preenchido e é arrastado pelo meio
  await p.keyboard.press("r");
  await p.mouse.move(1000, 650); await p.mouse.down(); await p.mouse.move(1100, 700, { steps: 5 }); await p.mouse.move(1180, 760, { steps: 5 }); await p.mouse.up();
  await espera(200);
  await limpar();
  const ret = (await els()).filter((e) => e.type === "rectangle").at(-1);
  const fundo = await p.evaluate(([id]) => h.elements.find((e) => e.id === id).backgroundColor, [ret.id]);
  const meio = await naTela(ret.x + ret.w / 2, ret.y + ret.h / 2);
  await p.mouse.move(meio.x, meio.y); await p.mouse.down(); await p.mouse.move(meio.x - 60, meio.y - 40, { steps: 8 }); await p.mouse.up();
  await espera(200);
  const ret2 = (await els()).find((e) => e.id === ret.id);
  r.formaDesenhada = { fundo, arrastouPeloMeio: Math.abs(ret2.x - ret.x) > 30 };
} catch (e) {
  r.falha = String(e).slice(0, 500);
  await p.screenshot({ path: `${SAIDA}/99-falha.png` }).catch(() => {});
}
if (id) {
  r.limpeza = await p.evaluate(async (id) => { const { excluirFluxo } = await import("/src/lib/fluxosDados.ts"); await excluirFluxo(id); return "apagado"; }, id).catch((e) => String(e).slice(0, 100));
}
r.erros = erros;
console.log(JSON.stringify(r, null, 1));
await nav.close();
