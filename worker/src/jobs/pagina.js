// Captador genérico: abre o link no Chromium, escuta a rede e guarda a mídia principal da página.
// Serve para bibliotecas de anúncio que nem o yt-dlp nem o gallery-dl conhecem (TikTok Ads, Google
// Ads Transparency) e como última tentativa para qualquer site. Ordem de preferência:
//   1. mp4 direto (o maior acima de 100 KB — players baixam MP4 minúsculos para testar autoplay);
//   2. HLS/DASH ou embed de player (YouTube, Vimeo...) → yt-dlp resolve na melhor qualidade;
//   3. sem vídeo, a maior imagem acima de 30 KB (abaixo disso é logo, ícone, avatar).
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { registrar } from "../parada.js";
import { rodar as rodarReal } from "../exec.js";
import { listarMidias as listarReal } from "../tmp.js";
import { ehUrlDeVideo, interagirComoUsuario } from "./lp.js";

const MIN_VIDEO = 100 * 1024;
const MIN_IMAGEM = 30 * 1024;
const EXT_DO_TIPO = {
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
};

function extensao(tipo, url) {
  const t = String(tipo || "").split(";")[0].trim().toLowerCase();
  if (EXT_DO_TIPO[t]) return EXT_DO_TIPO[t];
  const m = String(url).match(/\.(mp4|mov|webm|jpe?g|png|webp|gif)(\?|$)/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "bin";
}

/** Decide o que baixar do que a página carregou. null = nada aproveitável. */
export function escolherMidiaDaPagina({ videos, imagens, embeds }, { somenteVideo = false } = {}) {
  const mp4 = videos.filter((v) => (v.tamanho || 0) >= MIN_VIDEO).sort((a, b) => b.tamanho - a.tamanho)[0];
  if (mp4) return { tipo: "arquivo", url: mp4.url, extensao: extensao(mp4.tipo, mp4.url) };
  if (embeds.length) return { tipo: "ytdlp", url: embeds[0] };
  // Categoria de vídeo: uma imagem da página seria a miniatura, não o conteúdo
  if (somenteVideo) return null;
  const img = imagens.filter((i) => (i.tamanho || 0) >= MIN_IMAGEM).sort((a, b) => b.tamanho - a.tamanho)[0];
  if (img) return { tipo: "arquivo", url: img.url, extensao: extensao(img.tipo, img.url) };
  return null;
}

/** Mesmo contrato de `baixar` em download.js: { arquivos, modo }. */
export async function capturarMidiaDaPagina({ link, dir, cookies = null, somenteVideo = false }, deps = {}) {
  const abrirPagina = deps.abrirPagina || abrirPaginaReal;
  const gravar = deps.gravar || ((caminho, corpo) => writeFile(caminho, corpo));
  const baixarComYtDlp = deps.baixarComYtDlp || ((url) => baixarComYtDlpReal(url, dir, cookies, deps));

  const pagina = await abrirPagina(link);
  try {
    const escolha = escolherMidiaDaPagina(pagina.colhido(), { somenteVideo });
    if (!escolha) {
      throw new Error(somenteVideo
        ? "Nenhum vídeo na página (pode exigir login ou ter sido removido)"
        : "Nenhum vídeo ou imagem aproveitável na página (pode exigir login ou ter sido removida)");
    }
    if (escolha.tipo === "ytdlp") {
      const arquivos = await baixarComYtDlp(escolha.url);
      if (!arquivos.length) {
        throw new Error(/youtube\.com|youtu\.be/i.test(escolha.url)
          ? "O vídeo é do YouTube, que bloqueia downloads do servidor. Baixe manualmente e use \"Enviar arquivo\" no card"
          : "A página tem um player de vídeo, mas o yt-dlp não conseguiu baixar");
      }
      return { arquivos, modo: arquivos.length > 1 ? "carrossel" : "unico" };
    }
    const { corpo, tipo } = await pagina.baixar(escolha.url);
    const ext = extensao(tipo, escolha.url);
    const caminho = join(dir, `pagina-1.${ext === "bin" ? escolha.extensao : ext}`).replace(/\\/g, "/");
    await gravar(caminho, corpo);
    return { arquivos: [caminho], modo: "unico" };
  } finally {
    await pagina.fechar();
  }
}

async function baixarComYtDlpReal(url, dir, cookies, deps) {
  const rodar = deps.rodar || rodarReal;
  const listarMidias = deps.listarMidias || listarReal;
  const args = [url, "--no-playlist", "--no-warnings", "--retries", "3", "--merge-output-format", "mp4",
    "-f", "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b", "-o", `${dir}/pagina-%(id)s.%(ext)s`, "--restrict-filenames"];
  if (cookies) args.push("--cookies", cookies);
  await rodar("/usr/local/bin/yt-dlp", args, { cwd: dir, timeout: 13 * 60 * 1000 }).catch(() => {});
  return listarMidias(dir);
}

/** Playwright de verdade: abre, interage (destrava lazy-load e players) e anota o que passou pela rede. */
async function abrirPaginaReal(link) {
  const { chromium } = await import("playwright-core");
  const navegador = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
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
    const videos = [];
    const imagens = [];
    const embeds = [];
    const vistos = new Set();
    pagina.on("response", (r) => {
      const url = r.url();
      if (vistos.has(url) || !/^https?:/.test(url)) return;
      const cabecalhos = r.headers();
      const tipo = String(cabecalhos["content-type"] || "").toLowerCase();
      const tamanho = Number(cabecalhos["content-length"] || 0);
      if (tipo.startsWith("video/") || /\.(mp4|mov|webm)(\?|$)/i.test(url)) {
        vistos.add(url);
        // sem content-length (streaming): conta como grande; o tamanho mínimo existe contra testes de autoplay
        videos.push({ url, tipo, tamanho: tamanho || MIN_VIDEO * 10 });
      } else if (ehUrlDeVideo(url)) {
        vistos.add(url);
        embeds.push(url);
      } else if (tipo.startsWith("image/") && !tipo.includes("svg")) {
        vistos.add(url);
        imagens.push({ url, tipo, tamanho });
      }
    });

    await pagina.goto(link, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await pagina.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await interagirComoUsuario(pagina).catch(() => {});
    // Clica no primeiro player visível: bibliotecas de anúncio só carregam o mp4 ao dar play
    await pagina.locator("video").first().click({ timeout: 3000 }).catch(() => {});
    await pagina.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await pagina.waitForTimeout(5000);

    return {
      colhido: () => ({ videos, imagens, embeds }),
      baixar: async (url) => {
        const r = await contexto.request.get(url, { timeout: 5 * 60 * 1000 });
        if (!r.ok()) throw new Error(`A mídia da página respondeu ${r.status()}`);
        return { corpo: await r.body(), tipo: r.headers()["content-type"] || "" };
      },
      fechar: async () => { await contexto.close().catch(() => {}); await navegador.close().catch(() => {}); },
    };
  } catch (e) {
    // Nada foi devolvido, então ninguém vai chamar `fechar` — limpe aqui ou o processo fica órfão.
    await contexto?.close().catch(() => {});
    await navegador.close().catch(() => {});
    throw e;
  }
}
