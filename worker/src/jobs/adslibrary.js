// Anúncio da Biblioteca de Anúncios do Facebook (facebook.com/ads/library/?id=...).
// Nem o yt-dlp nem o gallery-dl conhecem essa página, mas ela é pública (sem login): o card do
// anúncio traz o vídeo como mp4 direto do fbcdn e o estático como <img>. Abrimos com o Chromium,
// achamos o card pelo id e baixamos o que está nele.
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

/** Largura mínima para uma <img> do card contar como criativo (abaixo disso é avatar/ícone). */
const LARGURA_MINIMA = 200;

export function ehAdsLibrary(link) {
  return idDoAnuncio(link) !== null;
}

export function idDoAnuncio(link) {
  let u;
  try { u = new URL(link); } catch { return null; }
  if (!/(^|\.)facebook\.com$/i.test(u.hostname) || !u.pathname.startsWith("/ads/library")) return null;
  const id = u.searchParams.get("id");
  return id && /^\d+$/.test(id) ? id : null;
}

/**
 * Do que o card mostra, o que vale guardar: se tem vídeo, só os vídeos (as imagens são poster e
 * miniaturas); senão, as imagens grandes, uma vez cada (o Facebook repete a mesma imagem com
 * assinaturas diferentes na query).
 */
export function escolherMidias(midias) {
  const videos = midias.filter((m) => m.tipo === "video" && m.url);
  if (videos.length > 0) return videos.map(({ tipo, url }) => ({ tipo, url }));
  const vistas = new Set();
  const imagens = [];
  for (const m of midias) {
    if (m.tipo !== "imagem" || !m.url || (m.largura || 0) < LARGURA_MINIMA) continue;
    let chave = m.url;
    try { const u = new URL(m.url); chave = u.hostname + u.pathname; } catch { /* fica a URL inteira */ }
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    imagens.push({ tipo: "imagem", url: m.url });
  }
  return imagens;
}

/** Extensão pelo content-type; a URL de vídeo do fbcdn não termina em .mp4, então o <video> manda. */
function extensaoDoTipo(tipo, url, tipoMidia) {
  const t = String(tipo || "").toLowerCase();
  if (t.includes("mp4") || t.includes("video") || (tipoMidia === "video" && !t.startsWith("image/"))) return "mp4";
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  return /\.mp4(\?|$)/i.test(url) ? "mp4" : "jpg";
}

/** Mesmo contrato de `baixar` em download.js: { arquivos, modo }. */
export async function baixarAnuncio({ link, dir }, deps = {}) {
  const abrirAnuncio = deps.abrirAnuncio || abrirAnuncioReal;
  const gravar = deps.gravar || ((caminho, corpo) => writeFile(caminho, corpo));
  const id = idDoAnuncio(link);

  const pagina = await abrirAnuncio(link, id);
  try {
    const escolhidas = escolherMidias(await pagina.midias());
    if (escolhidas.length === 0) {
      throw new Error(`Anúncio não encontrado na Ads Library (id ${id}): o card não apareceu ou não tem mídia — pode ter sido removido`);
    }
    const arquivos = [];
    for (const [i, m] of escolhidas.entries()) {
      const { corpo, tipo } = await pagina.baixar(m.url);
      const caminho = join(dir, `anuncio-${i + 1}.${extensaoDoTipo(tipo, m.url, m.tipo)}`).replace(/\\/g, "/");
      await gravar(caminho, corpo);
      arquivos.push(caminho);
    }
    return { arquivos, modo: arquivos.length > 1 ? "carrossel" : "unico" };
  } finally {
    await pagina.fechar();
  }
}

/**
 * Playwright de verdade. O card do anúncio é o menor ancestral do texto com o id que contém um
 * <video> ou uma <img> grande; a etiqueta ao lado do id muda com o idioma, por isso o número.
 */
async function abrirAnuncioReal(link, id) {
  const { chromium } = await import("playwright-core");
  const navegador = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  let contexto;
  try {
    contexto = await navegador.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "pt-BR",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });
    const pagina = await contexto.newPage();
    await pagina.goto(link, { waitUntil: "domcontentloaded", timeout: 90_000 });

    // Roda no navegador: devolve as mídias do card do anúncio, ou null se o card ainda não apareceu
    const coletar = (idDoAnuncio) => {
      const folha = [...document.querySelectorAll("div,span")].find((e) => e.children.length === 0 && e.textContent.includes(idDoAnuncio));
      if (!folha) return null;
      let card = folha;
      for (let i = 0; i < 12 && card; i++) {
        card = card.parentElement;
        if (card && (card.querySelector("video") || [...card.querySelectorAll("img")].some((im) => im.naturalWidth >= 200))) break;
      }
      if (!card) return null;
      const videos = [...card.querySelectorAll("video")].map((v) => ({ tipo: "video", url: v.currentSrc || v.src || "" }));
      const imagens = [...card.querySelectorAll("img")].map((im) => ({ tipo: "imagem", url: im.src || "", largura: im.naturalWidth }));
      return [...imagens, ...videos];
    };
    await pagina.waitForFunction(coletar, id, { timeout: 60_000, polling: 1000 }).catch(() => {});
    // Dá um tempo para o <video> receber o src e as imagens carregarem de verdade
    await pagina.waitForTimeout(3000);

    return {
      midias: async () => (await pagina.evaluate(coletar, id)) || [],
      baixar: async (url) => {
        const r = await contexto.request.get(url, { timeout: 5 * 60 * 1000 });
        if (!r.ok()) throw new Error(`fbcdn respondeu ${r.status()} ao baixar a mídia`);
        return { corpo: await r.body(), tipo: r.headers()["content-type"] || "" };
      },
      fechar: async () => { await contexto.close().catch(() => {}); await navegador.close().catch(() => {}); },
    };
  } catch (e) {
    await contexto?.close().catch(() => {});
    await navegador.close().catch(() => {});
    throw e;
  }
}
