// Exportação dos quadros: PDF vetorial (texto em Nunito embutido), PNG em alta, SVG, PowerPoint e Word — do quadro
// todo, de cada moldura ou da seleção. jsPDF, svg2pdf, pptxgenjs e docx só carregam na hora de exportar.
import { elementsOverlappingBBox, exportToBlob, exportToSvg, getCommonBounds } from "@excalidraw/excalidraw";
import type { ExcalidrawElement, ExcalidrawFrameLikeElement, NonDeleted } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { zipSemCompressao } from "@/lib/exportXlsx";
import {
  corNoEscuro, encaixar, escalaSegura, nomeArquivo, ordenarMolduras, paginasPdf, type AjustePdf, type Orientacao, type Papel,
} from "@/lib/fluxoExport";

export type Formato = "pdf" | "png" | "svg" | "pptx" | "docx";
export type Escopo = "tudo" | "molduras" | "selecao";
export type Fundo = "claro" | "escuro" | "transparente";
export type Margem = "nenhuma" | "pequena" | "media";

export const MARGENS_PT: Record<Margem, number> = { nenhuma: 0, pequena: 18, media: 36 };

export interface OpcoesExportacao {
  formato: Formato;
  escopo: Escopo;
  fundo: Fundo;
  papel: Papel;
  orientacao: Orientacao;
  ajuste: AjustePdf;
  margem: Margem;
  escalaPng: 2 | 4 | 8;
  textosNoWord: boolean;
}

type El = NonDeleted<ExcalidrawElement>;
export interface Parte {
  nome: string;
  elementos: El[];
  moldura: ExcalidrawFrameLikeElement | null;
}

const ehMoldura = (e: El): e is El & ExcalidrawFrameLikeElement => e.type === "frame" || e.type === "magicframe";
const PADDING = 24;
const ESCURO_FUNDO = "#121212";

/** No iPhone o canvas aguenta bem menos pixels que no computador */
function limitesDoNavegador() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? { lado: 4096, area: 16_777_216 } : { lado: 16384, area: 120_000_000 };
}

export function contarEscopo(api: ExcalidrawImperativeAPI): Record<Escopo, number> {
  const els = api.getSceneElements();
  const sel = api.getAppState().selectedElementIds;
  return {
    tudo: els.length,
    molduras: els.filter(ehMoldura).length,
    selecao: els.filter((e) => sel[e.id]).length,
  };
}

/** O que vira página/slide/imagem: o quadro todo, cada moldura (em ordem) ou a seleção. */
export function partesDoEscopo(api: ExcalidrawImperativeAPI, escopo: Escopo, titulo: string): Parte[] {
  const els = api.getSceneElements() as El[];
  if (escopo === "molduras") {
    return ordenarMolduras(els.filter(ehMoldura)).map((m, i) => ({
      nome: m.name?.trim() || `Moldura ${i + 1}`,
      elementos: elementsOverlappingBBox({ elements: els, bounds: m, type: "overlap" }).filter((e: ExcalidrawElement) => !e.frameId || e.frameId === m.id) as El[],
      moldura: m,
    }));
  }
  if (escopo === "selecao") {
    const sel = api.getAppState().selectedElementIds;
    const unica = els.filter((e) => sel[e.id]);
    if (unica.length === 1 && ehMoldura(unica[0])) return partesDoEscopo(api, "molduras", titulo).filter((p) => p.moldura?.id === unica[0].id);
    const elementos = els.filter((e) => sel[e.id] || (e.type === "text" && e.containerId && sel[e.containerId]) || (e.frameId && sel[e.frameId]));
    return [{ nome: titulo, elementos, moldura: null }];
  }
  return [{ nome: titulo, elementos: els, moldura: null }];
}

function estadoDeExportacao(api: ExcalidrawImperativeAPI, fundo: Fundo, comFundo: boolean, recorteDeMoldura = true): Partial<AppState> {
  const a = api.getAppState();
  return {
    exportBackground: comFundo && fundo !== "transparente",
    viewBackgroundColor: a.viewBackgroundColor,
    exportWithDarkMode: fundo === "escuro",
    exportEmbedScene: false,
    // Molduras viram página: sem o contorno e o nome da moldura no resultado
    frameRendering: { enabled: true, clip: recorteDeMoldura, name: false, outline: false },
  };
}

const paddingDa = (p: Parte) => (p.moldura ? 0 : PADDING);

async function pngDa(api: ExcalidrawImperativeAPI, p: Parte, fundo: Fundo, escala: number): Promise<{ blob: Blob; largura: number; altura: number; escala: number }> {
  let usada = escala, largura = 0, altura = 0;
  const limites = limitesDoNavegador();
  const blob = await exportToBlob({
    elements: p.elementos, files: api.getFiles(), exportingFrame: p.moldura, exportPadding: paddingDa(p),
    appState: estadoDeExportacao(api, fundo, true), mimeType: "image/png",
    getDimensions: (w: number, h: number) => {
      usada = escalaSegura(w, h, escala, limites);
      largura = w;
      altura = h;
      return { width: Math.round(w * usada), height: Math.round(h * usada), scale: usada };
    },
  });
  return { blob, largura, altura, escala: usada };
}

async function svgDa(api: ExcalidrawImperativeAPI, p: Parte, fundo: Fundo, comFundo: boolean, escuroNoTema: boolean, recorteDeMoldura = true): Promise<SVGSVGElement> {
  return exportToSvg({
    elements: p.elementos, files: api.getFiles(), exportingFrame: p.moldura, exportPadding: paddingDa(p),
    appState: { ...estadoDeExportacao(api, fundo, comFundo, recorteDeMoldura), exportWithDarkMode: escuroNoTema },
  });
}

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const dataUrl = (b: Blob) => new Promise<string>((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => erro(r.error);
  r.readAsDataURL(b);
});

// ---------------------------------------------------------------- PDF

let nunitoBase64: Promise<string> | null = null;
function carregarNunito(): Promise<string> {
  nunitoBase64 ??= fetch("/fonts/Nunito-Regular.ttf")
    .then((r) => {
      if (!r.ok) throw new Error("Não foi possível carregar a fonte do PDF.");
      return r.arrayBuffer();
    })
    .then((buf) => {
      let bin = "";
      const u8 = new Uint8Array(buf);
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(bin);
    })
    .catch((e) => {
      nunitoBase64 = null;
      throw e;
    });
  return nunitoBase64;
}

/** Fontes do SVG → fontes que existem no PDF (Nunito embutida; demais viram equivalentes do PDF). */
function fontesParaPdf(svg: SVGSVGElement) {
  svg.querySelectorAll("[font-family]").forEach((el) => {
    const f = (el.getAttribute("font-family") || "").toLowerCase();
    const nova = /liberation|helvetica|arial/.test(f) ? "helvetica" : /cascadia|comic shanns|mono|code/.test(f) ? "courier" : "Nunito";
    el.setAttribute("font-family", nova);
  });
}

/** Tema escuro no PDF: o filtro CSS do Excalidraw não existe lá, então as cores são convertidas uma a uma. */
function escurecerSvg(svg: SVGSVGElement) {
  const ATRIBUTOS = ["fill", "stroke", "stop-color", "flood-color", "color"];
  svg.querySelectorAll("*").forEach((el) => {
    if (el.closest("image, pattern, mask")) return;
    for (const a of ATRIBUTOS) {
      const v = el.getAttribute(a);
      if (v) el.setAttribute(a, corNoEscuro(v));
    }
    const estilo = el.getAttribute("style");
    if (estilo) el.setAttribute("style", estilo.replace(/(fill|stroke|color)\s*:\s*([^;]+)/g, (_, p: string, c: string) => `${p}: ${corNoEscuro(c.trim())}`));
  });
}

/** O PDF só aceita PNG e JPEG: outras imagens coladas (WebP, GIF, SVG…) viram PNG antes. */
async function imagensCompativeis(svg: SVGSVGElement) {
  const imagens = [...svg.querySelectorAll("image")];
  await Promise.all(imagens.map(async (img) => {
    const href = img.getAttribute("href") || img.getAttribute("xlink:href") || "";
    if (!href.startsWith("data:") || /^data:image\/(png|jpe?g);/i.test(href)) return;
    const el = new Image();
    el.src = href;
    await el.decode();
    const c = document.createElement("canvas");
    c.width = el.naturalWidth || 1;
    c.height = el.naturalHeight || 1;
    c.getContext("2d")!.drawImage(el, 0, 0);
    img.setAttribute("href", c.toDataURL("image/png"));
    img.removeAttribute("xlink:href");
  }));
}

async function gerarPdf(api: ExcalidrawImperativeAPI, partes: Parte[], o: OpcoesExportacao, aviso: (t: string) => void): Promise<Blob> {
  const [{ jsPDF }, , fonte] = await Promise.all([import("jspdf"), import("svg2pdf.js"), carregarNunito()]);
  const fundoPagina = o.fundo === "transparente" ? null : o.fundo === "escuro" ? corNoEscuro(api.getAppState().viewBackgroundColor) : api.getAppState().viewBackgroundColor;
  let doc: InstanceType<typeof jsPDF> | null = null;
  let total = 0;
  for (const [i, parte] of partes.entries()) {
    aviso(partes.length > 1 ? `Montando a página de "${parte.nome}" (${i + 1} de ${partes.length})…` : "Montando o PDF…");
    // Cores claras + conversão própria (o PDF não aplica o filtro do tema escuro); fundo pintado na página toda.
    // Sem o recorte de moldura do Excalidraw (clip-path com transformação que o svg2pdf aplica errado, sumindo com
    // rótulos e cortando formas): o recorte é feito no próprio PDF, no retângulo do desenho.
    const svg = await svgDa(api, parte, o.fundo, false, false, false);
    if (o.fundo === "escuro") escurecerSvg(svg);
    fontesParaPdf(svg);
    await imagensCompativeis(svg);
    const largura = parseFloat(svg.getAttribute("width") || "0");
    const altura = parseFloat(svg.getAttribute("height") || "0");
    const plano = paginasPdf({ largura, altura }, { papel: o.papel, orientacao: o.orientacao, margem: MARGENS_PT[o.margem], ajuste: o.ajuste });
    const orientacao = plano.largura > plano.altura ? "landscape" : "portrait";
    for (const pagina of plano.paginas) {
      if (!doc) {
        doc = new jsPDF({ unit: "pt", format: [plano.largura, plano.altura], orientation: orientacao, compress: true });
        doc.addFileToVFS("Nunito-Regular.ttf", fonte);
        doc.addFont("Nunito-Regular.ttf", "Nunito", "normal");
        doc.setProperties({ title: parte.nome, creator: "Gestor Pro" });
      } else {
        doc.addPage([plano.largura, plano.altura], orientacao);
      }
      if (fundoPagina) {
        doc.setFillColor(fundoPagina);
        doc.rect(0, 0, plano.largura, plano.altura, "F");
      }
      doc.saveGraphicsState();
      if (pagina.recortar) {
        doc.rect(plano.margem, plano.margem, plano.largura - 2 * plano.margem, plano.altura - 2 * plano.margem, null);
        doc.clip();
        doc.discardPath();
      }
      doc.rect(pagina.x, pagina.y, plano.larguraDesenho, plano.alturaDesenho, null);
      doc.clip();
      doc.discardPath();
      await doc.svg(svg, { x: pagina.x, y: pagina.y, width: plano.larguraDesenho, height: plano.alturaDesenho });
      doc.restoreGraphicsState();
      total += 1;
    }
  }
  if (!doc) throw new Error("Nada para exportar.");
  aviso(`${total} ${total === 1 ? "página pronta" : "páginas prontas"}`);
  return doc.output("blob");
}

// ---------------------------------------------------------------- PowerPoint e Word

async function gerarPpt(api: ExcalidrawImperativeAPI, partes: Parte[], o: OpcoesExportacao, titulo: string, aviso: (t: string) => void): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 16:9, 13,333 × 7,5 pol.
  pres.title = titulo;
  const fundo = o.fundo === "escuro" ? ESCURO_FUNDO : o.fundo === "claro" ? api.getAppState().viewBackgroundColor : "#ffffff";
  const corTitulo = o.fundo === "escuro" ? "E3E3E8" : "1E1E1E";
  for (const [i, parte] of partes.entries()) {
    aviso(`Montando o slide ${i + 1} de ${partes.length}…`);
    const slide = pres.addSlide();
    slide.background = { color: fundo.replace("#", "") };
    slide.addText(parte.nome, { x: 0.5, y: 0.25, w: 12.33, h: 0.6, fontSize: 22, bold: true, color: corTitulo, fontFace: "Calibri" });
    const png = await pngDa(api, parte, o.fundo, 4);
    const area = { x: 0.5, y: 1.0, w: 12.33, h: 6.1 };
    const e = encaixar(png.largura, png.altura, area.w, area.h);
    slide.addImage({ data: await dataUrl(png.blob), x: area.x + e.x, y: area.y + e.y, w: e.largura, h: e.altura });
  }
  return (await pres.write({ outputType: "blob" })) as Blob;
}

/** Textos da parte em ordem de leitura (de cima para baixo, da esquerda para a direita). */
function textosEmOrdem(parte: Parte): string[] {
  return parte.elementos
    .filter((e): e is El & { text: string } => e.type === "text" && !!(e as { text?: string }).text?.trim())
    .sort((a, b) => Math.round(a.y / 20) - Math.round(b.y / 20) || a.x - b.x)
    .map((e) => e.text.trim().replace(/\s*\n\s*/g, " "));
}

async function gerarDocx(api: ExcalidrawImperativeAPI, partes: Parte[], o: OpcoesExportacao, titulo: string, aviso: (t: string) => void): Promise<Blob> {
  const { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } = await import("docx");
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const filhos: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ text: titulo, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Exportado do Gestor Pro em ${hoje}`, color: "777777", size: 18 })], spacing: { after: 240 } }),
  ];
  for (const [i, parte] of partes.entries()) {
    aviso(`Montando a imagem ${i + 1} de ${partes.length}…`);
    if (partes.length > 1) filhos.push(new Paragraph({ text: parte.nome, heading: HeadingLevel.HEADING_1, pageBreakBefore: i > 0 }));
    const png = await pngDa(api, parte, o.fundo === "transparente" ? "claro" : o.fundo, 4);
    // Página A4 com margens de 1 pol.: 6,27 pol. úteis ≈ 602 px (a 96/pol.); altura até ~8,5 pol.
    const e = encaixar(png.largura, png.altura, 602, 816);
    const escala = Math.min(1, e.largura / png.largura);
    filhos.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ type: "png", data: await bytes(png.blob), transformation: { width: Math.round(png.largura * escala), height: Math.round(png.altura * escala) } })],
    }));
    if (o.textosNoWord) {
      const textos = textosEmOrdem(parte);
      if (textos.length) {
        filhos.push(new Paragraph({ text: "Textos do quadro", heading: HeadingLevel.HEADING_2, spacing: { before: 240 } }));
        textos.forEach((t) => filhos.push(new Paragraph({ text: t, bullet: { level: 0 } })));
      }
    }
  }
  const doc = new Document({ creator: "Gestor Pro", title: titulo, sections: [{ children: filhos }] });
  return Packer.toBlob(doc);
}

// ---------------------------------------------------------------- Entrada

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export interface ResultadoExportacao {
  nome: string;
  tamanho: number;
  /** Aviso extra (ex.: PNG reduzido pelo limite do navegador) */
  observacao?: string;
}

/** Gera e baixa o arquivo. `aviso` recebe o andamento para mostrar na tela. */
export async function exportarQuadro(
  api: ExcalidrawImperativeAPI,
  titulo: string,
  o: OpcoesExportacao,
  aviso: (t: string) => void = () => {},
): Promise<ResultadoExportacao> {
  const partes = partesDoEscopo(api, o.escopo, titulo).filter((p) => p.elementos.length > 0);
  if (!partes.length) throw new Error(o.escopo === "selecao" ? "Selecione algo no quadro para exportar." : "O quadro está vazio.");
  await document.fonts.ready;
  let blob: Blob;
  let ext: string = o.formato;
  let observacao: string | undefined;
  if (o.formato === "pdf") {
    blob = await gerarPdf(api, partes, o, aviso);
  } else if (o.formato === "pptx") {
    blob = await gerarPpt(api, partes, o, titulo, aviso);
  } else if (o.formato === "docx") {
    blob = await gerarDocx(api, partes, o, titulo, aviso);
  } else {
    const arquivos: { nome: string; dados: Uint8Array }[] = [];
    for (const [i, parte] of partes.entries()) {
      aviso(partes.length > 1 ? `Gerando ${i + 1} de ${partes.length}…` : "Gerando a imagem…");
      const prefixo = partes.length > 1 ? `${String(i + 1).padStart(2, "0")}-${nomeArquivo(parte.nome, "", new Date()).replace(/^fluxograma-|-\d{4}-\d{2}-\d{2}\.$/g, "")}` : "";
      if (o.formato === "png") {
        const png = await pngDa(api, parte, o.fundo, o.escalaPng);
        if (png.escala < o.escalaPng) observacao = `Reduzido para ${png.escala.toLocaleString("pt-BR")}× pelo limite de tamanho do navegador.`;
        arquivos.push({ nome: `${prefixo || "quadro"}.png`, dados: await bytes(png.blob) });
      } else {
        const svg = await svgDa(api, parte, o.fundo, true, o.fundo === "escuro");
        const texto = new XMLSerializer().serializeToString(svg);
        arquivos.push({ nome: `${prefixo || "quadro"}.svg`, dados: new TextEncoder().encode(texto) });
      }
    }
    if (arquivos.length === 1) {
      blob = new Blob([arquivos[0].dados as BlobPart], { type: o.formato === "png" ? "image/png" : "image/svg+xml" });
    } else {
      blob = new Blob([zipSemCompressao(arquivos) as BlobPart], { type: "application/zip" });
      ext = "zip";
    }
  }
  const nome = nomeArquivo(titulo, ext);
  baixar(blob, nome);
  return { nome, tamanho: blob.size, observacao };
}

/** Tamanho aproximado do que vai sair (para o resumo da janela), sem gerar nada pesado. */
export function medidasDaParte(parte: Parte): { largura: number; altura: number } {
  if (parte.moldura) return { largura: parte.moldura.width, altura: parte.moldura.height };
  const [x1, y1, x2, y2] = getCommonBounds(parte.elementos);
  return { largura: x2 - x1 + 2 * PADDING, altura: y2 - y1 + 2 * PADDING };
}

/** Prévia pequena (PNG) da primeira parte, para a janela de exportação. */
export async function previaDaParte(api: ExcalidrawImperativeAPI, parte: Parte, fundo: Fundo): Promise<string> {
  const blob = await exportToBlob({
    elements: parte.elementos, files: api.getFiles(), exportingFrame: parte.moldura, exportPadding: paddingDa(parte),
    appState: estadoDeExportacao(api, fundo, true), mimeType: "image/png", maxWidthOrHeight: 720,
  });
  return dataUrl(blob);
}

export type { BinaryFiles };
