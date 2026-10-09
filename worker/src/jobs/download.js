// Baixa vídeo, imagem ou carrossel de um link. Estratégia: yt-dlp primeiro
// (resolve a maioria das redes e URLs diretas); se ele não reconhecer, gallery-dl,
// que é melhor em post/carrossel de Instagram, Pinterest e X.
// Carrossel inverte a ordem: o yt-dlp só extrai os VÍDEOS de um post (imagem não é com ele), então
// num carrossel misto ele "dava certo" baixando um card só. O gallery-dl pega todos, na ordem do post.
import { existsSync } from "node:fs";
import { copyFile, chmod, readFile, unlink } from "node:fs/promises";
import { rodar as rodarReal } from "../exec.js";
import { listarMidias as listarReal } from "../tmp.js";
import { extensaoDe, ehImagem, ehVideo } from "../nomes.js";
import { ehAdsLibrary, baixarAnuncio as baixarAnuncioReal } from "./adslibrary.js";
import { ehPostLinkedin, baixarPostLinkedin as baixarPostLinkedinReal, cabecalhoDeCookies } from "./linkedin.js";
import { capturarMidiaDaPagina as capturarMidiaDaPaginaReal } from "./pagina.js";

/** Arquivo de cookies de cada plataforma: bibliotecas de anúncio e Threads usam o login da rede-mãe. */
const ARQUIVO_DE_COOKIES = {
  instagram: "instagram", threads: "instagram",
  facebook: "facebook", meta_ads: "facebook",
  tiktok: "tiktok", tiktok_ads: "tiktok",
  linkedin: "linkedin", x: "x", pinterest: "pinterest", youtube: "youtube",
};

/** Plataformas que nem o yt-dlp nem o gallery-dl conhecem: vão direto para o captador de página. */
const SO_PELA_PAGINA = new Set(["tiktok_ads", "google_ads"]);

/** Caminho do cookies.txt montado pela stack, se existir para essa rede. */
export function cookiesDe(rede, existe) {
  const checar = existe || existsSync;
  const nome = ARQUIVO_DE_COOKIES[rede];
  if (!nome) return null;
  const caminho = `/cookies/${nome}.txt`;
  return checar(caminho) ? caminho : null;
}

export async function baixar({ link, rede, dir, categoria }, deps = {}) {
  const rodar = deps.rodar || rodarReal;
  const listarMidias = deps.listarMidias || listarReal;
  const normalizar = deps.normalizarFormatos || ((arquivos) => normalizarFormatos(arquivos, { rodar }));
  const carrossel = categoria === "carrossel";

  // Anúncio (ou página do anunciante) da Ads Library: nem yt-dlp nem gallery-dl conhecem a página;
  // captura própria, que já escolhe o anúncio pela categoria e devolve os cards na ordem
  if (ehAdsLibrary(link)) {
    const r = await (deps.baixarAnuncio || baixarAnuncioReal)({ link, dir, categoria });
    return carrossel ? { arquivos: await normalizar(r.arquivos), modo: "carrossel" } : r;
  }

  const cookiesOriginal = cookiesDe(rede, deps.existeArquivo);
  // yt-dlp e gallery-dl regravam o arquivo de cookies (o YouTube renova a sessão a cada acesso), e o
  // montado pela stack é só leitura: cada job usa uma cópia gravável na própria pasta temporária.
  let cookies = null;
  if (cookiesOriginal) {
    const copia = `${dir}/.cookies.txt`;
    const copiarCookies = deps.copiarCookies || (async (de, para) => { await copyFile(de, para); await chmod(para, 0o600); });
    cookies = await copiarCookies(cookiesOriginal, copia).then(() => copia).catch(() => cookiesOriginal);
  }

  const erros = [];
  const capturarMidiaDaPagina = deps.capturarMidiaDaPagina || capturarMidiaDaPaginaReal;
  const pelaPagina = async () => {
    try {
      // Player do YouTube embutido na página: usa o login do YouTube (cópia gravável, como acima)
      let cookiesYoutube = rede === "youtube" ? cookies : null;
      const youtubeOriginal = rede === "youtube" ? null : cookiesDe("youtube", deps.existeArquivo);
      if (youtubeOriginal) {
        const copia = `${dir}/.cookies-youtube.txt`;
        const copiarCookies = deps.copiarCookies || (async (de, para) => { await copyFile(de, para); await chmod(para, 0o600); });
        cookiesYoutube = await copiarCookies(youtubeOriginal, copia).then(() => copia).catch(() => youtubeOriginal);
      }
      return await capturarMidiaDaPagina({ link, dir, cookies, cookiesYoutube, somenteVideo: /^video_/.test(categoria || "") }, { rodar, listarMidias });
    } catch (e) {
      if (e?.name === "JobPausado") throw e;
      erros.push(`página: ${String(e?.message || e).slice(0, 200)}`);
      return null;
    }
  };

  // TikTok Ads / Google Ads: nenhuma das ferramentas conhece a página; o captador resolve
  if (SO_PELA_PAGINA.has(rede)) {
    const r = await pelaPagina();
    if (r) return carrossel ? { arquivos: await normalizar(r.arquivos), modo: "carrossel" } : r;
    throw new Error(`O link não baixou nenhum arquivo (${erros.join(" | ")})`);
  }

  // Post do LinkedIn (imagem, carrossel de imagens ou documento): leitor próprio. Sem imagem no post
  // (vídeo), devolve [] e segue para o yt-dlp; o erro (ex.: pediu login) entra na mensagem final.
  if (ehPostLinkedin(link)) {
    const baixarPostLinkedin = deps.baixarPostLinkedin || baixarPostLinkedinReal;
    const lerArquivo = deps.lerArquivo || ((c) => readFile(c, "utf8"));
    try {
      const texto = cookies ? await lerArquivo(cookies).catch(() => "") : "";
      const arquivos = await baixarPostLinkedin({ link, dir, cookies: cabecalhoDeCookies(texto, "linkedin.com") });
      if (arquivos.length) {
        if (carrossel || arquivos.length > 1) return { arquivos: await normalizar(arquivos), modo: "carrossel" };
        return { arquivos, modo: "unico" };
      }
    } catch (e) {
      if (e?.name === "JobPausado") throw e;
      erros.push(`linkedin: ${String(e?.message || e).slice(0, 200)}`);
    }
  }

  const argsYt = [
    link,
    // Carrossel precisa de todos os itens do post; o resto, só o item do link
    ...(carrossel ? [] : ["--no-playlist"]),
    "--no-warnings",
    "--retries", "3",
    "--socket-timeout", "30",
    "--merge-output-format", "mp4",
    // Prefere até 1080p (referência de swipe file não precisa de mais e limita o disco da VPS),
    // mas cai para o melhor disponível se o vídeo só existir acima disso.
    "-f", "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b",
    // No carrossel o número do item vem na frente, para os cards ficarem na ordem do post
    "-o", carrossel ? `${dir}/%(playlist_index)03d_%(id)s.%(ext)s` : `${dir}/%(title).120s.%(ext)s`,
    "--restrict-filenames",
  ];
  if (cookies) argsYt.push("--cookies", cookies);

  const comYtDlp = async () => {
    try {
      await rodar("/usr/local/bin/yt-dlp", argsYt, { cwd: dir, timeout: 13 * 60 * 1000 });
    } catch (e) {
      erros.push(`yt-dlp: ${primeiraLinhaDeErro(e)}`);
    }
    return listarMidias(dir);
  };

  const comGalleryDl = async () => {
    // Carrossel: tudo direto na pasta do job (-D, sem subpastas por usuário) e o nome começando
    // pela posição do card no post ({num}), para a ordem natural dos arquivos ser a do post.
    const argsGal = carrossel
      ? ["-D", dir, "-f", "{num:>03}_{filename}.{extension}", "--retries", "3", "--quiet", link]
      : ["--dest", dir, "--retries", "3", "--quiet", link];
    // cookies-update=false: o gallery-dl tenta regravar o arquivo, que na VPS é config só leitura
    if (cookies) argsGal.splice(0, 0, "--cookies", cookies, "-o", "cookies-update=false");
    try {
      await rodar("/usr/local/bin/gallery-dl", argsGal, { cwd: dir, timeout: 13 * 60 * 1000 });
    } catch (e) {
      erros.push(`gallery-dl: ${primeiraLinhaDeErro(e)}`);
    }
    return listarMidias(dir);
  };

  let arquivos = carrossel ? await comGalleryDl() : await comYtDlp();
  // Instagram que já recusou (resposta vazia, 429, pedido de login): os outros métodos batem no mesmo
  // bloqueio e só gastam ~3 min por tentativa e agravam o limite. Falha logo, com o motivo.
  const bloqueado = rede === "instagram" && arquivos.length === 0 && erros.some((e) => BLOQUEIO_INSTAGRAM.test(e));
  if (arquivos.length === 0 && !bloqueado) arquivos = carrossel ? await comYtDlp() : await comGalleryDl();

  // Última tentativa: abrir a página e pegar o vídeo/imagem principal que ela carrega
  if (arquivos.length === 0 && !bloqueado) {
    const r = await pelaPagina();
    if (r) arquivos = r.arquivos;
  }

  if (arquivos.length === 0) {
    const detalhe = erros.length ? ` (${erros.join(" | ")})` : "";
    throw new Error(`O link não baixou nenhum arquivo${detalhe}`);
  }

  // Carrossel é sempre uma pasta (mesmo com um card só), com cada card em formato padrão
  if (carrossel) return { arquivos: await normalizar(arquivos), modo: "carrossel" };
  return { arquivos, modo: arquivos.length > 1 ? "carrossel" : "unico" };
}

const IMAGEM_OK = new Set(["jpg", "jpeg", "png"]);
const VIDEO_OK = new Set(["mp4", "mov"]);

/**
 * Deixa cada card em JPG/PNG (imagem) ou MP4/MOV (vídeo): webp/heic/bmp viram jpg, gif vira mp4
 * (é animação), webm/mkv/avi/m4v viram mp4. Se a conversão falhar, fica o original — perder o card
 * seria pior que um formato diferente. Mantém a ordem.
 */
export async function normalizarFormatos(arquivos, deps = {}) {
  const rodar = deps.rodar || rodarReal;
  const apagar = deps.apagar || ((c) => unlink(c).catch(() => {}));
  const saida = [];
  for (const caminho of arquivos) {
    const ext = extensaoDe(caminho);
    const semExt = caminho.slice(0, caminho.length - ext.length - 1);
    let destino = null;
    let args = null;
    if (ext === "gif") {
      destino = `${semExt}.mp4`;
      args = ["-y", "-i", caminho, "-movflags", "+faststart", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", destino];
    } else if (ehImagem(ext) && !IMAGEM_OK.has(ext)) {
      destino = `${semExt}.jpg`;
      args = ["-y", "-i", caminho, "-q:v", "2", destino];
    } else if (ehVideo(ext) && !VIDEO_OK.has(ext)) {
      destino = `${semExt}.mp4`;
      args = ["-y", "-i", caminho, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", destino];
    }
    if (!destino) {
      saida.push(caminho);
      continue;
    }
    try {
      await rodar("/usr/bin/ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { timeout: 10 * 60 * 1000 });
      await apagar(caminho);
      saida.push(destino);
    } catch (e) {
      if (e?.name === "JobPausado") throw e;
      saida.push(caminho);
    }
  }
  return saida;
}

const BLOQUEIO_INSTAGRAM = /empty media response|429|too many requests|rate.?limit|login required|checkpoint/i;

function primeiraLinhaDeErro(e) {
  const texto = (e?.stderr || e?.message || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const erro = texto.find((l) => /^error/i.test(l)) || texto[texto.length - 1] || "sem detalhe";
  return erro.slice(0, 200);
}
