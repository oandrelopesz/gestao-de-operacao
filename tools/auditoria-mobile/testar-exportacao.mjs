// Exportação dos Fluxogramas de ponta a ponta: monta um quadro de teste, exporta cada formato pela janela "Exportar"
// e confere os arquivos com leitores independentes (pdf.js para o PDF; zip para PPTX/DOCX; cabeçalho do PNG).
// ATENÇÃO: apaga o conteúdo do quadro informado. Uso: node testar-exportacao.mjs http://localhost:5190 <id-de-teste> <pasta>
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const require = createRequire(import.meta.url);
const JSZip = require("../../node_modules/jszip");
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

const [BASE, ID, SAIDA] = process.argv.slice(2);
mkdirSync(SAIDA, { recursive: true });
const nav = await chromium.launch({ executablePath: CHROME });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", acceptDownloads: true });
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(String(e).slice(0, 300)));
p.on("console", (m) => { if (m.type() === "error" && !/hydrat|cz-shortcut/i.test(m.text())) erros.push(m.text().slice(0, 300)); });
const espera = (ms) => p.waitForTimeout(ms);
const r = { arquivos: {} };
const vazio = { x: 330, y: 840 };
const GATILHO = ".excalidraw [title=\"Formas extras e cards\"]";
const fecharPainel = async () => { await p.locator(".excalidraw .painel-gestor .sidebar__header__buttons button").last().click(); await espera(300); };
const limpar = async () => { await p.keyboard.press("Escape"); await p.mouse.click(vazio.x, vazio.y); await espera(150); };
const naTela = (x, y) => p.evaluate(([x, y]) => { const s = h.state; return { x: (x + s.scrollX) * s.zoom.value + s.offsetLeft, y: (y + s.scrollY) * s.zoom.value + s.offsetTop }; }, [x, y]);

async function exportar(nome, { formato, escopo, opcoes = [] }) {
  await p.click("button[title=\"Exportar (Ctrl+Shift+E)\"]");
  const d = p.getByRole("dialog");
  await d.waitFor();
  await espera(300);
  await d.getByRole("button", { name: new RegExp(`^${formato}`) }).first().click();
  await d.getByRole("button", { name: escopo }).first().click();
  for (const o of opcoes) await d.getByRole("button", { name: o, exact: true }).first().click();
  await espera(700);
  if (nome === "pdf-tudo") await p.screenshot({ path: `${SAIDA}/janela-exportar.png` });
  const resumo = await d.locator("p.text-xs").first().textContent();
  const [download] = await Promise.all([
    p.waitForEvent("download", { timeout: 90_000 }),
    d.getByRole("button", { name: /^Exportar / }).click(),
  ]);
  const caminho = `${SAIDA}/${nome}-${download.suggestedFilename()}`;
  await download.saveAs(caminho);
  await p.getByRole("dialog").waitFor({ state: "detached", timeout: 30_000 }).catch(() => {});
  await espera(300);
  r.arquivos[nome] = { arquivo: download.suggestedFilename(), resumo };
  return caminho;
}

function png(caminho) {
  const b = readFileSync(caminho);
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20), kb: Math.round(b.length / 1024) };
}

async function pdf(caminho) {
  const dados = new Uint8Array(readFileSync(caminho));
  const bruto = Buffer.from(dados).toString("latin1");
  const doc = await getDocument({ data: dados.slice(), isEvalSupported: false }).promise;
  const pg = await doc.getPage(1);
  const vp = pg.getViewport({ scale: 1 });
  const textos = (await pg.getTextContent()).items.map((i) => i.str).join(" ");
  const ops = await pg.getOperatorList();
  const { OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const conta = (op) => ops.fnArray.filter((f) => f === op).length;
  return {
    paginas: doc.numPages, tamanho: [Math.round(vp.width), Math.round(vp.height)], textos: textos.slice(0, 160),
    nunitoEmbutida: /Nunito/.test(bruto), caminhos: conta(OPS.constructPath), textoVetorial: conta(OPS.showText), imagens: conta(OPS.paintImageXObject),
    kb: Math.round(dados.length / 1024),
  };
}

async function zip(caminho) {
  const z = await JSZip.loadAsync(readFileSync(caminho));
  return Object.keys(z.files).filter((n) => !z.files[n].dir);
}

/** Renderiza a página do PDF no navegador (pdf.js do CDN) em zoom alto e fotografa um recorte. */
async function verPdf(caminho, nome, escala = 3) {
  const pg = await ctx.newPage();
  await pg.setContent("<canvas id=c></canvas>");
  const b64 = readFileSync(caminho).toString("base64");
  const dim = await pg.evaluate(async ([b64, escala]) => {
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const doc = await pdfjs.getDocument({ data: bin }).promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: escala });
    const c = document.getElementById("c");
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    return [vp.width, vp.height];
  }, [b64, escala]);
  await pg.setViewportSize({ width: Math.min(1600, Math.ceil(dim[0])), height: Math.min(1200, Math.ceil(dim[1])) });
  await pg.screenshot({ path: `${SAIDA}/${nome}.png`, fullPage: false });
  await pg.close();
}

try {
  await abrirEstavel(p, `${BASE}/fluxogramas/${ID}`, 8000);
  await p.waitForFunction(() => window.h?.app && document.querySelector(".excalidraw canvas.interactive"), null, { timeout: 60000 });
  await p.evaluate(() => h.app.updateScene({ elements: [] }));
  await espera(500);

  // Quadro de teste: funil, dois cards (um com acento), cone
  await p.click(GATILHO); await espera(400);
  await p.getByTitle("Inserir funil").click(); await espera(250);
  await p.getByRole("tab", { name: "Cards" }).click(); await espera(250);
  await p.getByRole("button", { name: /Card arredondado/ }).click(); await espera(250);
  await p.getByRole("button", { name: /Card de etapa/ }).click(); await espera(250);
  await p.getByRole("tab", { name: "Formas" }).click(); await espera(250);
  await p.getByTitle("Inserir cone").click(); await espera(250);
  await fecharPainel();
  await limpar();
  const card = await p.evaluate(() => { const e = h.elements.find((x) => x.type === "rectangle" && !x.customData?.ancora && !x.isDeleted && x.boundElements?.some((b) => b.type === "text")); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  const pc = await naTela(card.x, card.y);
  await p.mouse.dblclick(pc.x, pc.y); await espera(300);
  await p.keyboard.press("Control+A");
  await p.keyboard.type("Captação — ação");
  await p.keyboard.press("Escape"); await espera(300);
  await limpar();

  // Imagem WebP colada (o PDF só aceita PNG/JPEG: precisa ser convertida)
  await p.mouse.move(1150, 750);
  await p.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 200; c.height = 120; const g = c.getContext("2d");
    g.fillStyle = "#f97316"; g.fillRect(0, 0, 200, 120); g.fillStyle = "#fff"; g.font = "bold 24px sans-serif"; g.fillText("WEBP", 60, 70);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/webp", 0.9));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "t.webp", { type: "image/webp" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await espera(1200);
  await limpar();

  // Duas molduras: uma em volta do funil, outra em volta dos cards (ferramenta F, arrastando)
  const caixas = await p.evaluate(() => {
    const vivos = h.elements.filter((e) => !e.isDeleted);
    const bbox = (els) => ({ x1: Math.min(...els.map((e) => e.x)), y1: Math.min(...els.map((e) => e.y)), x2: Math.max(...els.map((e) => e.x + e.width)), y2: Math.max(...els.map((e) => e.y + e.height)) });
    const ancoras = vivos.filter((e) => e.customData?.ancora);
    const grupoFunil = ancoras.find((a) => ancoras.filter((b) => b.groupIds.at(-1) === a.groupIds.at(-1)).length > 1).groupIds.at(-1);
    const funil = vivos.filter((e) => e.groupIds.includes(grupoFunil));
    const grupoCone = ancoras.find((a) => ancoras.filter((b) => b.groupIds.at(-1) === a.groupIds.at(-1)).length === 1).groupIds.at(-1);
    const direita = vivos.filter((e) => e.groupIds.includes(grupoCone) || e.type === "image");
    return { funil: bbox(funil), direita: bbox(direita) };
  });
  for (const nomeCaixa of ["funil", "direita"]) {
    const c = caixas[nomeCaixa];
    // Começa num canto vazio (arrastar a partir de uma forma a moveria em vez de desenhar a moldura)
    const cantos = [[c.x1 - 30, c.y1 - 30, c.x2 + 30, c.y2 + 30], [c.x2 + 30, c.y2 + 30, c.x1 - 30, c.y1 - 30], [c.x2 + 30, c.y1 - 30, c.x1 - 30, c.y2 + 30], [c.x1 - 30, c.y2 + 30, c.x2 + 30, c.y1 - 30]];
    const livre = await p.evaluate((cs) => cs.find(([x, y]) => !h.elements.some((e) => !e.isDeleted && x >= e.x - 4 && x <= e.x + e.width + 4 && y >= e.y - 4 && y <= e.y + e.height + 4)) ?? cs[0], cantos);
    const a = await naTela(livre[0], livre[1]), b = await naTela(livre[2], livre[3]);
    await p.keyboard.press("f"); await espera(150);
    await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 }); await p.mouse.move(b.x, b.y, { steps: 6 }); await p.mouse.up();
    await espera(300);
    await limpar();
  }
  r.quadro = await p.evaluate(() => { const v = h.elements.filter((e) => !e.isDeleted); return { elementos: v.length, molduras: v.filter((e) => e.type === "frame").length, noQuadro: v.filter((e) => e.frameId).length, imagem: v.filter((e) => e.type === "image").length }; });
  await p.keyboard.press("Shift+1"); await espera(600);
  await p.screenshot({ path: `${SAIDA}/quadro-de-teste.png` });

  // PDF do quadro todo, caber em 1 página, fundo do quadro
  let c = await exportar("pdf-tudo", { formato: "PDF", escopo: "Quadro todo", opcoes: ["A4", "Automática", "Caber em 1 página", "Pequena", "Do quadro"] });
  r.pdfTudo = await pdf(c);
  await verPdf(c, "pdf-tudo-zoom3", 3);
  // PDF por molduras, tamanho real, fundo escuro
  c = await exportar("pdf-molduras-escuro", { formato: "PDF", escopo: /^Molduras/, opcoes: ["Real, em várias", "Escuro"] });
  r.pdfMolduras = await pdf(c);
  await verPdf(c, "pdf-molduras-escuro", 2);
  // PNG 4× do quadro todo e das molduras (zip)
  c = await exportar("png-tudo", { formato: "PNG", escopo: "Quadro todo", opcoes: ["4× (impressão)", "Do quadro"] });
  r.pngTudo = png(c);
  c = await exportar("png-molduras", { formato: "PNG", escopo: /^Molduras/, opcoes: ["2× (tela)", "Transparente"] });
  r.pngMolduras = await zip(c);
  // SVG
  c = await exportar("svg-tudo", { formato: "SVG", escopo: "Quadro todo", opcoes: ["Do quadro"] });
  const svg = readFileSync(c, "utf8");
  r.svg = { kb: Math.round(svg.length / 1024), textos: (svg.match(/<text/g) || []).length, fonteEmbutida: /@font-face/.test(svg), acento: svg.includes("Captação") };
  // PowerPoint por molduras
  c = await exportar("pptx-molduras", { formato: "PowerPoint", escopo: /^Molduras/, opcoes: ["Do quadro"] });
  const pptx = await zip(c);
  r.pptx = { slides: pptx.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, imagens: pptx.filter((n) => n.startsWith("ppt/media/")).length };
  // Word do quadro todo com textos
  c = await exportar("docx-tudo", { formato: "Word", escopo: "Quadro todo" });
  const zdoc = await JSZip.loadAsync(readFileSync(c));
  const xml = await zdoc.file("word/document.xml").async("string");
  r.docx = { imagens: Object.keys(zdoc.files).filter((n) => !zdoc.files[n].dir && n.startsWith("word/media/")).length, titulo: xml.includes("TESTE CLAUDE"), acento: xml.includes("Captação"), etapas: (xml.match(/Etapa \d/g) || []).length };
  // Seleção: só o card com acento, PNG 2×
  await limpar();
  // Posição atual do card (a tela mudou de zoom): clica na borda de cima dele para selecionar
  const cardAgora = await p.evaluate(() => { const e = h.elements.find((x) => x.type === "text" && x.text === "Captação — ação"); const c = h.elements.find((x) => x.id === e.containerId); return { x: c.x + c.width / 2, y: c.y + 4 }; });
  const pcAgora = await naTela(cardAgora.x, cardAgora.y);
  await p.mouse.click(pcAgora.x, pcAgora.y); await espera(250);
  const selecionados = await p.evaluate(() => Object.keys(h.state.selectedElementIds).length);
  c = await exportar("png-selecao", { formato: "PNG", escopo: /^Seleção/, opcoes: ["2× (tela)", "Do quadro"] });
  r.pngSelecao = { ...png(c), selecionados };
} catch (e) {
  r.falha = String(e).slice(0, 500);
  await p.screenshot({ path: `${SAIDA}/falha.png` }).catch(() => {});
}
r.erros = erros;
console.log(JSON.stringify(r, null, 1));
await nav.close();
