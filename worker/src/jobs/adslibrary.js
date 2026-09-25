// Anúncio da Biblioteca de Anúncios do Facebook (facebook.com/ads/library/...).
// Nem o yt-dlp nem o gallery-dl conhecem essa página, mas ela é pública (sem login): o HTML embute um
// JSON com cada anúncio (formato, cards, vídeos e imagens em alta) e o card renderizado traz o vídeo
// como mp4 do fbcdn e o estático como <img>. Abrimos com o Chromium e baixamos o criativo inteiro.
// Dois links servem: o do anúncio (?id=) e o da página do anunciante (?view_all_page_id=), que lista
// vários anúncios — aí vale o primeiro da lista no formato da categoria do item (carrossel, vídeo...).
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { registrar } from "../parada.js";

/** Largura mínima para uma <img> do card contar como criativo (abaixo disso é avatar/ícone). */
const LARGURA_MINIMA = 200;

/** Como o usuário acha o link de um anúncio só: cada card da Ads Library mostra o número. */
const COMO_COLAR = 'cole o link do anúncio: facebook.com/ads/library/?id= seguido da "Identificação da biblioteca" que aparece no card';

function urlDaAdsLibrary(link) {
  let u;
  try { u = new URL(link); } catch { return null; }
  if (!/(^|\.)facebook\.com$/i.test(u.hostname) || !u.pathname.startsWith("/ads/library")) return null;
  return u;
}

const numero = (valor) => (valor && /^\d+$/.test(valor) ? valor : null);

export function ehAdsLibrary(link) {
  return urlDaAdsLibrary(link) !== null;
}

export function idDoAnuncio(link) {
  return numero(urlDaAdsLibrary(link)?.searchParams.get("id"));
}

/** Página do anunciante ("Ver todos os anúncios"): lista os anúncios dele, sem apontar um. */
export function idDaPagina(link) {
  return numero(urlDaAdsLibrary(link)?.searchParams.get("view_all_page_id"));
}

/** Texto do objeto JSON que abre em `ini` (chaves balanceadas, respeitando strings), ou null. */
function objetoEm(texto, ini) {
  if (texto[ini] !== "{") return null;
  let profundidade = 0;
  let emString = false;
  for (let i = ini; i < texto.length; i++) {
    const c = texto[i];
    if (emString) {
      if (c === "\\") i++;
      else if (c === '"') emString = false;
    } else if (c === '"') emString = true;
    else if (c === "{") profundidade++;
    else if (c === "}" && --profundidade === 0) return texto.slice(ini, i + 1);
  }
  return null;
}

const unicas = (urls) => [...new Set(urls.filter(Boolean))];

/**
 * O criativo em ALTA de um anúncio, a partir do `snapshot` do JSON: original da imagem e HD do vídeo
 * (o SD só se não houver HD), que são o arquivo cheio — a <img>/<video> renderizada é só o tamanho de
 * exibição. Carrossel (e DCO) tem `cards`: um arquivo por card, na ordem, vídeo se o card for vídeo e
 * imagem se for imagem. Sem cards: os vídeos (em `images` costuma vir o poster) ou, não havendo, as imagens.
 */
export function midiasDoSnapshot(snapshot) {
  const video = (o) => o?.video_hd_url || o?.video_sd_url || null;
  const imagem = (o) => o?.original_image_url || o?.resized_image_url || null;
  const cards = [];
  for (const c of snapshot.cards || []) {
    if (video(c)) cards.push({ tipo: "video", url: video(c) });
    else if (imagem(c)) cards.push({ tipo: "imagem", url: imagem(c) });
  }
  if (cards.length > 0) return cards;
  const videos = unicas((snapshot.videos || []).map(video));
  if (videos.length > 0) return videos.map((url) => ({ tipo: "video", url }));
  return unicas((snapshot.images || []).map(imagem)).map((url) => ({ tipo: "imagem", url }));
}

/**
 * Os anúncios que a página embute, na ordem em que aparecem (cada um uma vez):
 * [{ id, formato: "CAROUSEL"|"VIDEO"|"IMAGE"|..., cards, midias }]. Cada anúncio é
 * "ad_archive_id":"<id>" seguido, antes do próximo, de "snapshot":{...}; as URLs vêm com \/.
 */
export function anunciosDoHtml(html) {
  const marcas = [...html.matchAll(/"ad_archive_id":"(\d+)"/g)];
  const anuncios = [];
  const vistos = new Set();
  for (const [k, marca] of marcas.entries()) {
    const id = marca[1];
    if (vistos.has(id)) continue;
    const fim = k + 1 < marcas.length ? marcas[k + 1].index : html.length;
    const chave = html.indexOf('"snapshot":', marca.index);
    if (chave < 0 || chave >= fim) continue;
    let snapshot;
    try { snapshot = JSON.parse(objetoEm(html, chave + '"snapshot":'.length)); } catch { continue; }
    if (!snapshot) continue;
    vistos.add(id);
    anuncios.push({
      id,
      formato: String(snapshot.display_format || ""),
      cards: (snapshot.cards || []).length,
      midias: midiasDoSnapshot(snapshot),
    });
  }
  return anuncios;
}

/** Mídias em alta do anúncio `id` no JSON da página; [] se ele não estiver lá (aí vale o DOM). */
export function midiasDoHtml(html, id) {
  return anunciosDoHtml(html).find((a) => a.id === id)?.midias || [];
}

const temVideo = (a) => a.midias.some((m) => m.tipo === "video");
const REGRAS_VIDEO = [(a) => a.formato === "VIDEO", (a) => a.cards < 2 && temVideo(a)];
const REGRAS_ESTATICO = [(a) => a.formato === "IMAGE", (a) => a.cards < 2 && !temVideo(a)];

/** Na página do anunciante, qual anúncio a categoria pede: o formato certo primeiro, depois o parecido. */
const PREFERENCIA = {
  carrossel: { nome: "carrossel", regras: [(a) => a.formato === "CAROUSEL", (a) => a.cards >= 2] },
  video_anuncio: { nome: "de vídeo", regras: REGRAS_VIDEO },
  video_organico: { nome: "de vídeo", regras: REGRAS_VIDEO },
  anuncio_estatico: { nome: "estático (imagem)", regras: REGRAS_ESTATICO },
  post_estatico: { nome: "estático (imagem)", regras: REGRAS_ESTATICO },
};

/** O primeiro anúncio da página (ordem da lista) que combina com a categoria, ou null. */
export function anuncioDaCategoria(anuncios, categoria) {
  const comMidia = anuncios.filter((a) => a.midias.length > 0);
  for (const regra of PREFERENCIA[categoria]?.regras || [() => true]) {
    const achado = comMidia.find(regra);
    if (achado) return achado;
  }
  return null;
}

/**
 * Fallback do DOM (JSON ausente), do que o card mostra, o que vale guardar: se tem vídeo, só os
 * vídeos (as imagens são poster e miniaturas); senão, as imagens grandes, uma vez cada (o Facebook
 * repete a mesma imagem com assinaturas diferentes na query).
 */
export function escolherMidias(midias) {
  const videos = midias.filter((m) => m.tipo === "video" && m.url);
  if (videos.length > 0) {
    // hd e sd do mesmo vídeo aparecem como URLs diferentes na mesma pasta: fica um por pasta (o 1º = hd)
    const vistas = new Set();
    const escolhidos = [];
    for (const v of videos) {
      let chave = v.url;
      try { const u = new URL(v.url); chave = u.hostname + u.pathname.replace(/\/[^/]*$/, ""); } catch { /* fica a URL */ }
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      escolhidos.push({ tipo: "video", url: v.url });
    }
    return escolhidos;
  }
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

/** Qual criativo baixar: o anúncio do id, ou o da página do anunciante que a categoria pede. */
async function escolherDaPagina(pagina, alvo, categoria) {
  const anuncios = anunciosDoHtml(await pagina.html());
  if (alvo.id) {
    const doJson = anuncios.find((a) => a.id === alvo.id)?.midias || [];
    const escolhidas = doJson.length > 0 ? doJson : escolherMidias(await pagina.midiasDoDom());
    if (escolhidas.length === 0) {
      throw new Error(`Anúncio não encontrado na Ads Library (id ${alvo.id}): o card não apareceu ou não tem mídia — pode ter sido removido`);
    }
    return escolhidas;
  }
  if (anuncios.length === 0) {
    throw new Error(`A página do anunciante na Ads Library não trouxe nenhum anúncio (pode estar sem anúncio ativo); ${COMO_COLAR}`);
  }
  const anuncio = anuncioDaCategoria(anuncios, categoria);
  if (!anuncio) {
    const n = anuncios.length;
    throw new Error(`A página do anunciante tem ${n} anúncio${n === 1 ? "" : "s"} na Ads Library e nenhum é ${PREFERENCIA[categoria].nome}; ${COMO_COLAR}`);
  }
  return anuncio.midias;
}

/** Mesmo contrato de `baixar` em download.js: { arquivos, modo }. Categoria carrossel é sempre pasta. */
export async function baixarAnuncio({ link, dir, categoria }, deps = {}) {
  const abrirAnuncio = deps.abrirAnuncio || abrirAnuncioReal;
  const gravar = deps.gravar || ((caminho, corpo) => writeFile(caminho, corpo));
  const id = idDoAnuncio(link);
  const paginaId = id ? null : idDaPagina(link);
  if (!id && !paginaId) throw new Error(`Link da Ads Library sem anúncio (busca ou filtro); ${COMO_COLAR}`);
  const alvo = id ? { id } : { pagina: paginaId };

  const pagina = await abrirAnuncio(link, alvo);
  try {
    const escolhidas = await escolherDaPagina(pagina, alvo, categoria);
    const arquivos = [];
    for (const [i, m] of escolhidas.entries()) {
      const { corpo, tipo } = await pagina.baixar(m.url);
      const caminho = join(dir, `anuncio-${i + 1}.${extensaoDoTipo(tipo, m.url, m.tipo)}`).replace(/\\/g, "/");
      await gravar(caminho, corpo);
      arquivos.push(caminho);
    }
    return { arquivos, modo: categoria === "carrossel" || arquivos.length > 1 ? "carrossel" : "unico" };
  } finally {
    await pagina.fechar();
  }
}

/**
 * Playwright de verdade. Anúncio do id: o card é o menor ancestral do texto com o id que contém um
 * <video> ou uma <img> grande (a etiqueta ao lado do id muda com o idioma, por isso o número).
 * Página do anunciante: basta o JSON dos anúncios ter chegado.
 */
async function abrirAnuncioReal(link, alvo) {
  const { chromium } = await import("playwright-core");
  const navegador = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  // Pausa pedida pelo usuário fecha o navegador; o registro sai sozinho quando ele fecha
  const soltarNavegador = registrar(() => navegador.close());
  navegador.on("disconnected", soltarNavegador);
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
    if (alvo.id) {
      await pagina.waitForFunction(coletar, alvo.id, { timeout: 60_000, polling: 1000 }).catch(() => {});
      // Dá um tempo para o <video> receber o src e as imagens carregarem de verdade
      await pagina.waitForTimeout(3000);
    } else {
      const temAnuncios = () => [...document.scripts].some((s) => s.textContent.includes('"ad_archive_id"'));
      await pagina.waitForFunction(temAnuncios, null, { timeout: 60_000, polling: 1000 }).catch(() => {});
    }

    return {
      html: () => pagina.content(),
      midiasDoDom: async () => (alvo.id && (await pagina.evaluate(coletar, alvo.id))) || [],
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
