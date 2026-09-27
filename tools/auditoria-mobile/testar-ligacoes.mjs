// Conectores com mouse de verdade (local, com window.h). Mede se cada ponta fica EXATAMENTE na bolinha escolhida —
// ao criar, durante e depois de mover — e se a curva que o Excalidraw desenha corta alguma forma. Testa: clique sem
// arrastar (nada), ímã da bolinha, melhor lado ao soltar no meio da forma, seta desenhada com a ferramenta (vira
// conector), alças das pontas (soltar, Esc, religar, desfazer), cotovelo e a borda real da faixa do funil.
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
const els = () => p.evaluate(() => h.elements.filter((e) => !e.isDeleted).map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, w: e.width, h: e.height, ancora: !!e.customData?.ancora, conector: e.customData?.conector ?? null, elbowed: !!e.elbowed, sb: e.startBinding?.elementId ?? null, eb: e.endBinding?.elementId ?? null, pts: e.points?.map((q) => [q[0], q[1]]) ?? null })));
const limpar = async () => { await p.keyboard.press("Escape"); await p.mouse.click(330, 860); await espera(200); };
const bolinhas = () => p.locator(".fluxo-conector").evaluateAll((ds) => ds.map((d) => { const b = d.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, l: d.getAttribute("aria-label") }; }));
const bolinha = async (el, re) => {
  const c = await naTela(el.x + el.w / 2, el.y + el.h / 2);
  await p.mouse.move(c.x, c.y, { steps: 4 }); await espera(250);
  return (await bolinhas()).find((d) => re.test(d.l));
};
const meioDoLado = (e, lado) => ({ direita: [e.x + e.w, e.y + e.h / 2], esquerda: [e.x, e.y + e.h / 2], cima: [e.x + e.w / 2, e.y], baixo: [e.x + e.w / 2, e.y + e.h] })[lado];
const pontas = (s) => ({ ini: [s.x + s.pts[0][0], s.y + s.pts[0][1]], fim: [s.x + s.pts.at(-1)[0], s.y + s.pts.at(-1)[1]] });
const distancia = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) * 10) / 10;
const geo = await import("../../src/lib/fluxoConectores.ts");
/** Quantos pontos da curva desenhada caem dentro das formas (deve ser 0) */
const corta = (s, ...formas) => {
  const pts = s.pts.map((q) => ({ x: s.x + q[0], y: s.y + q[1] }));
  const amostras = pts.length < 3 ? pts : geo.trechosDaCurva(pts).flatMap(([a, b, c, d]) => Array.from({ length: 12 }, (_, k) => { const t = (k + 1) / 12, u = 1 - t; return { x: u*u*u*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t*t*t*d.x, y: u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y }; }));
  return formas.reduce((n, f) => n + amostras.filter((q) => geo.contem({ x: f.x, y: f.y, width: f.w, height: f.h }, q, -1)).length, 0);
};
const meioDaSeta = (s) => { const q = s.pts[Math.floor(s.pts.length / 2)]; return [s.x + q[0], s.y + q[1]]; };
const alca = async (re) => { const b = await p.locator(".fluxo-ponta").evaluateAll((ds) => ds.map((d) => { const r = d.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, l: d.getAttribute("aria-label") }; })); return b.find((d) => re.test(d.l)); };
const opacidade = (id) => p.evaluate((id) => h.elements.find((e) => e.id === id)?.opacity, id);

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
  await p.click(".excalidraw [title=\"Formas extras e cards\"]"); await espera(300);
  await p.getByRole("tab", { name: "Cards" }).click();
  await p.getByRole("button", { name: /Card arredondado/ }).click(); await espera(200);
  await p.getByRole("button", { name: /Card quadrado/ }).click(); await espera(200);
  await p.locator(".excalidraw .painel-gestor .sidebar__header__buttons button").last().click(); await espera(300);
  await limpar();
  let lista = await els();
  const [A, B] = lista.filter((e) => e.type === "rectangle");
  const bt = await naTela(B.x + B.w / 2, B.y + B.h / 2);
  await p.mouse.move(bt.x, bt.y); await p.mouse.down(); await p.mouse.move(bt.x + 200, bt.y + 40, { steps: 8 }); await p.mouse.move(bt.x + 420, bt.y + 80, { steps: 8 }); await p.mouse.up();
  await limpar();
  const B2 = (await els()).find((e) => e.id === B.id);

  // 1) Clique sem arrastar: nada
  let dot = await bolinha(A, /direit/);
  const antes = (await els()).length;
  await p.mouse.move(dot.x, dot.y, { steps: 3 }); await p.mouse.down(); await p.mouse.up(); await espera(400);
  r.cliqueNaoCria = (await els()).length === antes;
  await limpar();

  // 2) Arrasta de A (direita) e solta perto da bolinha de CIMA de B: encaixa em cima, ponta exatamente lá
  dot = await bolinha(A, /direit/);
  const alvoCima = await naTela(B2.x + B2.w / 2 + 10, B2.y + 12);
  await p.mouse.move(dot.x, dot.y, { steps: 3 }); await p.mouse.down();
  await p.mouse.move(dot.x + 40, dot.y, { steps: 5 }); await p.mouse.move(alvoCima.x, alvoCima.y, { steps: 15 }); await espera(150);
  r.previa = { curva: await p.locator("path.fluxo-previa-linha").count(), destaque: await p.locator(".fluxo-previa-alvo").count(), encaixeAtivo: await p.locator(".fluxo-encaixe-ativo").count() };
  await p.screenshot({ path: `${SAIDA}/01-arrastando.png` });
  await p.mouse.up(); await espera(500);
  lista = await els();
  let seta = lista.filter((e) => e.type === "arrow").at(-1);
  let pt = pontas(seta);
  r.criado = { conector: seta.conector, inicioNaBolinha: distancia(pt.ini, meioDoLado(A, "direita")), fimNaBolinha: distancia(pt.fim, meioDoLado(B2, "cima")), semAmarracaoExcalidraw: !seta.sb && !seta.eb, pontosDentroDasFormas: corta(seta, A, B2) };
  await p.screenshot({ path: `${SAIDA}/02-ligado.png` });
  await limpar();

  // 2b) Solta no MEIO de B (longe das bolinhas): vai para o lado que dá a ligação mais limpa; depois desfaz
  dot = await bolinha(A, /direit/);
  const meioB = await naTela(B2.x + B2.w / 2, B2.y + B2.h / 2);
  await p.mouse.move(dot.x, dot.y, { steps: 3 }); await p.mouse.down();
  await p.mouse.move(dot.x + 40, dot.y, { steps: 5 }); await p.mouse.move(meioB.x, meioB.y, { steps: 15 }); await espera(150);
  const ladoNaPrevia = await p.locator(".fluxo-encaixe").evaluateAll((ds) => ds.findIndex((d) => d.classList.contains("fluxo-encaixe-ativo")));
  await p.mouse.up(); await espera(500);
  const auto = (await els()).filter((e) => e.type === "arrow").at(-1);
  r.meioDaForma = { lado: auto.conector?.para?.lado, previaMostrouOLado: ladoNaPrevia >= 0, naBolinha: auto.conector?.para?.lado ? distancia(pontas(auto).fim, meioDoLado(B2, auto.conector.para.lado)) : null, pontosDentroDasFormas: corta(auto, A, B2) };
  await p.keyboard.press("Control+z"); await espera(400);
  r.meioDaForma.desfez = !(await els()).some((e) => e.id === auto.id);
  await limpar();

  // 3) Move A 160 px para baixo: no meio do arraste e no fim, as pontas continuam cravadas nas bolinhas
  const at = await naTela(A.x + A.w / 2, A.y + A.h / 2);
  await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x, at.y + 80, { steps: 8 });
  await espera(120);
  const meio = await els();
  const Amid = meio.find((e) => e.id === A.id), smid = meio.find((e) => e.id === seta.id);
  r.duranteArraste = distancia(pontas(smid).ini, meioDoLado(Amid, "direita"));
  await p.mouse.move(at.x, at.y + 160, { steps: 8 }); await p.mouse.up();
  await espera(300);
  lista = await els();
  const A3 = lista.find((e) => e.id === A.id);
  seta = lista.find((e) => e.id === seta.id);
  pt = pontas(seta);
  r.depoisDeMover = { inicio: distancia(pt.ini, meioDoLado(A3, "direita")), fim: distancia(pt.fim, meioDoLado(B2, "cima")), pontosDentroDasFormas: corta(seta, A3, B2) };
  await p.screenshot({ path: `${SAIDA}/03-movido.png` });
  await limpar();

  // 4) Seta desenhada com a ferramenta (A) do meio de A até o meio de B: vira conector nas bolinhas mais perto
  const ca = await naTela(A3.x + A3.w - 20, A3.y + A3.h / 2), cb = await naTela(B2.x + 20, B2.y + B2.h / 2);
  await p.keyboard.press("a"); await espera(150);
  await p.mouse.move(ca.x, ca.y); await p.mouse.down(); await p.mouse.move((ca.x + cb.x) / 2, ca.y, { steps: 6 }); await p.mouse.move(cb.x, cb.y, { steps: 8 }); await p.mouse.up();
  await espera(500);
  lista = await els();
  const desenhada = lista.filter((e) => e.type === "arrow").at(-1);
  r.desenhadaComFerramenta = { conector: desenhada.conector && `${desenhada.conector.de.lado}→${desenhada.conector.para.lado}`, fimNaBolinha: desenhada.conector?.para?.lado ? distancia(pontas(desenhada).fim, meioDoLado(B2, desenhada.conector.para.lado)) : null };
  // Liga os mesmos lados que o conector religado no passo 5 e ficaria por cima dele: sai do quadro
  await p.evaluate((id) => h.app.updateScene({ elements: h.elements.map((e) => (e.id === id ? { ...e, isDeleted: true } : e)) }), desenhada.id);
  await limpar();

  // 5) Seleciona o conector (2): sem os pontos do Excalidraw, com as nossas alças. Arrasta a ponta final (a seta some e
  //    a prévia mostra a nova) e Esc no meio devolve; solta no vazio: ponta solta; arrasta de volta para B: religa;
  //    desfazer volta à ponta solta, refazer religa
  seta = (await els()).find((e) => e.id === seta.id);
  const meioSeta = await naTela(...meioDaSeta(seta));
  await p.mouse.click(meioSeta.x, meioSeta.y); await espera(300);
  r.selecao = { alcas: await p.locator(".fluxo-ponta").count(), pontosDoExcalidraw: await p.evaluate(() => h.state.selectedLinearElement?.elementId ?? null), selecionada: await p.evaluate(() => Object.keys(h.state.selectedElementIds)) };
  await p.screenshot({ path: `${SAIDA}/05-selecionado.png` });
  let fimTela = await alca(/ponta da seta/);
  const conectorAntes = JSON.stringify(seta.conector);
  await p.mouse.move(fimTela.x, fimTela.y); await p.mouse.down(); await p.mouse.move(fimTela.x + 60, fimTela.y + 40, { steps: 6 }); await espera(150);
  r.esc = { escondidaDuranteArraste: (await opacidade(seta.id)) === 0, previa: await p.locator("path.fluxo-previa-linha").count() };
  await p.keyboard.press("Escape"); await espera(100); await p.mouse.up(); await espera(400);
  seta = (await els()).find((e) => e.id === seta.id);
  r.esc.voltouComoEstava = JSON.stringify(seta.conector) === conectorAntes && (await opacidade(seta.id)) === 100;
  await p.mouse.click(meioSeta.x, meioSeta.y); await espera(300);
  fimTela = await alca(/ponta da seta/);
  await p.mouse.move(fimTela.x, fimTela.y); await p.mouse.down(); await p.mouse.move(fimTela.x + 120, fimTela.y + 60, { steps: 8 }); await p.mouse.move(fimTela.x + 220, fimTela.y + 120, { steps: 8 }); await p.mouse.up();
  await espera(500);
  seta = (await els()).find((e) => e.id === seta.id);
  r.pontaSolta = !!seta.conector && !("id" in seta.conector.para) && (await opacidade(seta.id)) === 100;
  const meio2 = await naTela(...meioDaSeta(seta));
  await p.mouse.click(meio2.x, meio2.y); await espera(300);
  const soltaTela = await alca(/ponta da seta/);
  const ladoEsq = await naTela(B2.x + 8, B2.y + B2.h / 2);
  await p.mouse.move(soltaTela.x, soltaTela.y); await p.mouse.down(); await p.mouse.move(ladoEsq.x - 40, ladoEsq.y, { steps: 10 }); await p.mouse.move(ladoEsq.x, ladoEsq.y, { steps: 6 }); await p.mouse.up();
  await espera(500);
  seta = (await els()).find((e) => e.id === seta.id);
  r.religou = seta.conector && seta.conector.para.id === B.id ? { lado: seta.conector.para.lado, naBolinha: distancia(pontas(seta).fim, meioDoLado(B2, seta.conector.para.lado)) } : "não religou";
  await limpar();
  await p.keyboard.press("Control+z"); await espera(400);
  const desfeito = (await els()).find((e) => e.id === seta.id);
  await p.keyboard.press("Control+Shift+z"); await espera(400);
  const refeito = (await els()).find((e) => e.id === seta.id);
  r.desfazer = { voltouASoltar: !!desfeito?.conector && !("id" in desfeito.conector.para), refezLigada: refeito?.conector?.para?.id === B.id, opacidade: refeito ? await opacidade(refeito.id) : null };
  seta = refeito ?? seta;
  await limpar();

  // 6) Cotovelo pelo painel do Excalidraw: vira seta em cotovelo nativa presa nos mesmos pontos
  const m2 = await naTela(...meioDaSeta(seta));
  await p.mouse.click(m2.x, m2.y); await espera(250);
  const cotovelo = p.locator(".excalidraw [title=\"Seta em cotovelo\"], .excalidraw [aria-label=\"Seta em cotovelo\"]").first();
  // Vale a seta que o clique selecionou
  const selecionada = await p.evaluate(() => Object.keys(h.state.selectedElementIds)[0]);
  if (await cotovelo.count()) { await cotovelo.click(); await espera(500); }
  const emCotovelo = (await els()).find((e) => e.id === selecionada);
  r.cotovelo = { elbowed: !!emCotovelo?.elbowed, presaNosDois: emCotovelo?.sb === A.id && emCotovelo?.eb === B.id };
  await limpar();

  // 7) Funil: a bolinha da direita da faixa 2 fica na borda inclinada, não na caixa
  await p.click(".excalidraw [title=\"Formas extras e cards\"]"); await espera(300);
  await p.getByRole("tab", { name: "Formas" }).click(); await espera(200);
  await p.getByTitle("Inserir funil").click(); await espera(300);
  await p.locator(".excalidraw .painel-gestor .sidebar__header__buttons button").last().click(); await espera(300);
  await limpar();
  const ancoras = (await els()).filter((e) => e.ancora);
  const faixa = ancoras[1];
  const dotF = await bolinha(faixa, /direit/);
  const bordaCaixa = await naTela(faixa.x + faixa.w, faixa.y + faixa.h / 2);
  r.funil = { bolinhaAntesDaCaixa: Math.round(bordaCaixa.x + 22 - dotF.x) };
  await p.mouse.move(dotF.x, dotF.y); await p.mouse.down(); await p.mouse.move(dotF.x + 80, dotF.y, { steps: 6 }); await p.mouse.move(dotF.x + 180, dotF.y + 30, { steps: 6 }); await p.mouse.up();
  await espera(400);
  const setaF = (await els()).filter((e) => e.type === "arrow").at(-1);
  r.funil.inicioDentroDaCaixa = Math.round(faixa.x + faixa.w - pontas(setaF).ini[0]);
  await p.screenshot({ path: `${SAIDA}/04-funil.png` });
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
