// Captura de landing page / site em três formatos, para o usuário fazer o que quiser depois:
//   .html          página single-file (tudo embutido, abre offline)
//   - mirror.zip   espelho com os arquivos separados, para editar
//   - print.png    screenshot de página inteira
// Mais um arquivo por vídeo/VSL encontrado na página.
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { rodar as rodarReal } from "../exec.js";
import { limitar, nomeVsl } from "../nomes.js";

/** Orçamento total de uma captura de LP, com folga sobre o timeout da chamada HTTP do n8n. */
const ORCAMENTO_MS = 12 * 60 * 1000;

const EXT_VIDEO = /\.(mp4|m3u8|webm|mov|mpd)(\?|$)/i;
const PLAYERS = /(converteai\.net|vturb|pandavideo|player\.vimeo\.com|youtube\.com\/embed|youtu\.be|wistia\.(net|com)|vidyard|jwplayer)/i;

export function ehUrlDeVideo(url) {
  const u = String(url);
  if (/\.(css|js|png|jpe?g|gif|svg|woff2?|ico)(\?|$)/i.test(u) && !PLAYERS.test(u)) return false;
  return EXT_VIDEO.test(u) || PLAYERS.test(u);
}

export async function capturar({ link, dir, base }, deps = {}) {
  const rodar = deps.rodar || rodarReal;
  const abrir = deps.abrirNavegador || abrirNavegadorReal;
  const existe = deps.existeArquivo || existsSync;
  // Orçamento total da captura. O n8n corta a chamada HTTP bem depois disso, então a resposta
  // sempre sai daqui antes de ele desistir — senão o job seria retentado com o worker ocupado.
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
    "--browser-wait-until=networkidle0",
    "--browser-load-max-time=120000",
  ], { cwd: dir, timeout: 4 * 60 * 1000 });
  arquivos.push({ caminho: htmlLocal, nome: limitar(base, "html"), mime: "text/html" });

  // 3) Espelho completo, zipado. Os dois passos são acessórios: sem espelho a captura continua
  // válida (html + print + VSL), então nenhum deles pode derrubar o job.
  await mkdir(espelhoDir, { recursive: true });
  await rodar("/usr/bin/wget", [
    "--mirror", "--convert-links", "--adjust-extension", "--page-requisites", "--no-parent",
    "--level=1", "--timeout=30", "--tries=2", "--no-verbose",
    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "-P", espelhoDir, link,
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
  for (const url of urlsDeVideo.slice(0, 3)) {
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
      if (existe(destino)) {
        arquivos.push({ caminho: destino, nome: nomeVsl(base, indice), mime: "video/mp4" });
      } else {
        indice -= 1; // comando saiu 0 mas não gravou nada: não gasta número
      }
    } catch {
      indice -= 1; // não gasta número com vídeo que falhou
    }
  }

  return { arquivos };
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
    await pagina.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
    // Rola até o fim para disparar lazy loading e o player da VSL
    await pagina.evaluate(async () => {
      await new Promise((pronto) => {
        let y = 0;
        const passo = setInterval(() => {
          window.scrollBy(0, 600);
          y += 600;
          if (y >= document.body.scrollHeight + 1200) { clearInterval(passo); window.scrollTo(0, 0); pronto(); }
        }, 150);
      });
    }).catch(() => {});
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
