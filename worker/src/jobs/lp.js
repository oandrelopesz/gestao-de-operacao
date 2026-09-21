// Captura de landing page / site em três formatos, para o usuário fazer o que quiser depois:
//   .html          página single-file (tudo embutido, abre offline)
//   - mirror.zip   espelho com os arquivos separados, para editar
//   - print.png    screenshot de página inteira
// Mais um arquivo por vídeo/VSL encontrado na página.
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { rodar as rodarReal } from "../exec.js";
import { limitar, nomeVsl, semRastreio } from "../nomes.js";

/** Orçamento total de uma captura de LP, com folga sobre o timeout da chamada HTTP do n8n. */
const ORCAMENTO_MS = 20 * 60 * 1000;

const EXT_VIDEO = /\.(mp4|m3u8|webm|mov|mpd)(\?|$)/i;
const PLAYERS = /(converteai\.net|vturb|pandavideo|player\.vimeo\.com|youtube\.com\/embed|youtu\.be|wistia\.(net|com)|vidyard|jwplayer)/i;

export function ehUrlDeVideo(url) {
  const u = String(url);
  // Script/estilo/imagem nunca é vídeo, nem no domínio do player: o yt-dlp salvaria o .js cru
  // como "VSL". O player, ao rodar, pede as .m3u8/.mp4 de verdade, e essas entram por EXT_VIDEO.
  if (/\.(css|js|mjs|json|png|jpe?g|gif|svg|webp|woff2?|ico|txt)(\?|$)/i.test(u)) return false;
  return EXT_VIDEO.test(u) || PLAYERS.test(u);
}

/**
 * Playlists HLS/DASH na mesma pasta são qualidades do mesmo vídeo (VTurb: main.m3u8 + video_N.m3u8),
 * e o player pede a master antes da rendição. Fica só a primeira URL de cada pasta; o resto passa.
 */
export function umaPlaylistPorPasta(urls) {
  const pastas = new Set();
  return urls.filter((url) => {
    if (!/\.(m3u8|mpd)(\?|$)/i.test(url)) return true;
    let pasta;
    try { const u = new URL(url); pasta = u.origin + u.pathname.slice(0, u.pathname.lastIndexOf("/") + 1); } catch { return true; }
    if (pastas.has(pasta)) return false;
    pastas.add(pasta);
    return true;
  });
}
export async function capturar({ link, dir, base }, deps = {}) {
  const rodar = deps.rodar || rodarReal;
  const abrir = deps.abrirNavegador || abrirNavegadorReal;
  const existe = deps.existeArquivo || existsSync;
  const ehMp4 = deps.ehMp4 || ehMp4Real;
  // Orçamento total da captura (20 min). O n8n corta a chamada HTTP bem depois disso (30 min),
  // então a resposta sempre sai daqui antes de ele desistir — senão o job seria retentado com o
  // worker ocupado.
  const prazo = Date.now() + (deps.orcamentoMs ?? ORCAMENTO_MS);

  const arquivos = [];
  const htmlLocal = join(dir, "pagina.html");
  const printLocal = join(dir, "print.png");
  const espelhoDir = join(dir, "espelho");
  const zipLocal = join(dir, "mirror.zip");

  // 1) Navegador: rola a página, espera carregar e coleta as URLs de vídeo da rede
  const pagina = await abrir(link);
  let urlsDeVideo = [];
  try {
    await pagina.screenshot(printLocal);
    urlsDeVideo = [...new Set(pagina.urlsDeVideo)];
  } finally {
    await pagina.fechar();
  }

  // 2) HTML single-file (tudo embutido)
  await rodar("/usr/local/bin/single-file", [
    link, htmlLocal,
    "--browser-executable-path=/usr/bin/chromium",
    "--browser-args=[\"--no-sandbox\",\"--disable-dev-shm-usage\"]",
    // Página de VSL nunca atinge networkidle0: o player baixa segmentos sem parar. `load` já
    // garante o DOM e os recursos principais, e o `wait-delay` cobre o lazy loading.
    "--browser-wait-until=load",
    "--browser-wait-delay=5000",
    "--browser-load-max-time=90000",
  ], { cwd: dir, timeout: 7 * 60 * 1000 });
  arquivos.push({ caminho: htmlLocal, nome: limitar(base, "html"), mime: "text/html" });

  // 3) Espelho completo, zipado. Os dois passos são acessórios: sem espelho a captura continua
  // válida (html + print + VSL), então nenhum deles pode derrubar o job.
  await mkdir(espelhoDir, { recursive: true });
  await rodar("/usr/bin/wget", [
    "--mirror", "--convert-links", "--adjust-extension", "--page-requisites", "--no-parent",
    "--level=1", "--timeout=30", "--tries=2", "--no-verbose",
    // Nomes gravados no espelho precisam abrir no Windows: sem isto o wget salva "estilo.css?ver=1"
    // e "index.html?utm_source=..|..", e o Explorer recusa o zip inteiro como "pasta inválida".
    "--restrict-file-names=windows",
    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    // Sem os utm_* da URL: senão o wget grava uma cópia da página com a query inteira no nome
    "-P", espelhoDir, semRastreio(link),
  ], { cwd: dir, timeout: 3 * 60 * 1000 }).catch(() => {});
  try {
    await rodar("/usr/bin/zip", ["-r", "-q", zipLocal, "."], { cwd: espelhoDir, timeout: 2 * 60 * 1000 });
    arquivos.push({ caminho: zipLocal, nome: limitar(`${base} - mirror`, "zip"), mime: "application/zip" });
  } catch (e) {
    console.warn(JSON.stringify({ evento: "lp.espelho_falhou", link, erro: String(e?.message || e) }));
  }

  // 4) Print
  arquivos.push({ caminho: printLocal, nome: limitar(`${base} - print`, "png"), mime: "image/png" });

  // 5) Cada vídeo/VSL num arquivo separado; falha num vídeo não derruba a captura
  let indice = 0;
  for (const url of umaPlaylistPorPasta(urlsDeVideo).slice(0, 3)) {
    // Sem orçamento não vale começar outro vídeo: melhor devolver a LP com o que já temos do que
    // estourar o tempo do n8n e perder a captura inteira numa retentativa.
    if (Date.now() > prazo) {
      console.warn(JSON.stringify({ evento: "lp.orcamento_estourado", link, baixados: indice }));
      break;
    }
    indice += 1;
    const destino = join(dir, `vsl-${indice}.mp4`);
    try {
      await rodar("/usr/local/bin/yt-dlp", [
        url, "--no-playlist", "--no-warnings", "--merge-output-format", "mp4",
        "-f", "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b", "--referer", link, "-o", destino,
      ], { cwd: dir, timeout: 5 * 60 * 1000 });
      if (existe(destino) && (await ehMp4(destino))) {
        arquivos.push({ caminho: destino, nome: nomeVsl(base, indice), mime: "video/mp4" });
      } else {
        indice -= 1; // não gravou nada, ou gravou algo que não é MP4: não gasta número
      }
    } catch {
      indice -= 1; // não gasta número com vídeo que falhou
    }
  }

  return { arquivos };
}

/**
 * Interage como um usuário de verdade: move o mouse, aperta uma tecla e rola com a roda até o
 * fim da página, depois volta ao topo. Sites com WP Rocket "Delay JavaScript execution" (e
 * similares) só carregam os scripts — inclusive o player da VSL — depois de mousemove/wheel/
 * tecla; scrollBy via JS dispara só "scroll", que não conta, e a página fica sem vídeo.
 */
export async function interagirComoUsuario(pagina) {
  await pagina.mouse.move(720, 450);
  await pagina.mouse.move(740, 470);
  await pagina.keyboard.press("Shift");
  const alturaDaPagina = () => pagina.evaluate(() => document.documentElement.scrollHeight);
  let altura = await alturaDaPagina();
  let y = 0;
  // Rola até 1200px além do fim conhecido, relendo a altura de tempos em tempos (lazy loading cresce a página)
  while (y < altura + 1200 && y < 200_000) {
    await pagina.mouse.wheel(0, 600);
    y += 600;
    await pagina.waitForTimeout(150);
    if (y % 3000 === 0) altura = await alturaDaPagina();
  }
  await pagina.evaluate(() => window.scrollTo(0, 0));
}
/**
 * Confere pelo cabeçalho que o yt-dlp gravou um MP4 de verdade ("ftyp" nos bytes 4-8). O extrator
 * genérico dele salva qualquer URL direta com o nome pedido — já aconteceu de virar "VSL" um .js.
 */
async function ehMp4Real(caminho) {
  let arquivo;
  try {
    arquivo = await open(caminho, "r");
    const cabecalho = Buffer.alloc(12);
    const { bytesRead } = await arquivo.read(cabecalho, 0, 12, 0);
    return bytesRead >= 8 && cabecalho.subarray(4, 8).toString("latin1") === "ftyp";
  } catch {
    return false;
  } finally {
    await arquivo?.close();
  }
}
/** Playwright de verdade: rola a página inteira e escuta a rede atrás de vídeo. */
async function abrirNavegadorReal(link) {
  const { chromium } = await import("playwright-core");
  const navegador = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  let contexto;
  try {
    contexto = await navegador.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });
    const pagina = await contexto.newPage();
    const urlsDeVideo = [];
    pagina.on("request", (r) => { if (ehUrlDeVideo(r.url())) urlsDeVideo.push(r.url()); });

    await pagina.goto(link, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await pagina.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await interagirComoUsuario(pagina).catch(() => {});
    // A interação destrava scripts adiados (player da VSL inclusive): espera a rede assentar de novo
    await pagina.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await pagina.waitForTimeout(4000);

    return {
      urlsDeVideo,
      screenshot: (caminho) => pagina.screenshot({ path: caminho, fullPage: true }),
      fechar: async () => { await contexto.close().catch(() => {}); await navegador.close().catch(() => {}); },
    };
  } catch (e) {
    // Nada foi devolvido, então ninguém vai chamar `fechar` — limpe aqui ou o processo fica órfão.
    await contexto?.close().catch(() => {});
    await navegador.close().catch(() => {});
    throw e;
  }
}
