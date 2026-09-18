// Baixa vídeo, imagem ou carrossel de um link. Estratégia: yt-dlp primeiro
// (resolve a maioria das redes e URLs diretas); se ele não reconhecer, gallery-dl,
// que é melhor em post/carrossel de Instagram, Pinterest e X.
import { existsSync } from "node:fs";
import { rodar as rodarReal } from "../exec.js";
import { listarMidias as listarReal } from "../tmp.js";

const REDES_COM_COOKIE = new Set(["instagram", "facebook", "tiktok", "linkedin", "x", "pinterest"]);

/** Caminho do cookies.txt montado pela stack, se existir para essa rede. */
export function cookiesDe(rede, existe) {
  const checar = existe || existsSync;
  if (!REDES_COM_COOKIE.has(rede)) return null;
  const caminho = `/cookies/${rede}.txt`;
  return checar(caminho) ? caminho : null;
}

export async function baixar({ link, rede, dir }, deps = {}) {
  const rodar = deps.rodar || rodarReal;
  const listarMidias = deps.listarMidias || listarReal;
  const cookies = cookiesDe(rede, deps.existeArquivo);

  const erros = [];

  const argsYt = [
    link,
    "--no-playlist",
    "--no-warnings",
    "--retries", "3",
    "--socket-timeout", "30",
    "--merge-output-format", "mp4",
    // Prefere até 1080p (referência de swipe file não precisa de mais e limita o disco da VPS),
    // mas cai para o melhor disponível se o vídeo só existir acima disso.
    "-f", "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b",
    "-o", `${dir}/%(title).120s.%(ext)s`,
    "--restrict-filenames",
  ];
  if (cookies) argsYt.push("--cookies", cookies);

  try {
    await rodar("/usr/local/bin/yt-dlp", argsYt, { cwd: dir, timeout: 13 * 60 * 1000 });
  } catch (e) {
    erros.push(`yt-dlp: ${primeiraLinhaDeErro(e)}`);
  }

  let arquivos = await listarMidias(dir);

  if (arquivos.length === 0) {
    const argsGal = ["--dest", dir, "--retries", "3", "--quiet", link];
    if (cookies) argsGal.splice(0, 0, "--cookies", cookies);
    try {
      await rodar("/usr/local/bin/gallery-dl", argsGal, { cwd: dir, timeout: 13 * 60 * 1000 });
    } catch (e) {
      erros.push(`gallery-dl: ${primeiraLinhaDeErro(e)}`);
    }
    arquivos = await listarMidias(dir);
  }

  if (arquivos.length === 0) {
    const detalhe = erros.length ? ` (${erros.join(" | ")})` : "";
    throw new Error(`O link não baixou nenhum arquivo${detalhe}`);
  }

  return { arquivos, modo: arquivos.length > 1 ? "carrossel" : "unico" };
}

function primeiraLinhaDeErro(e) {
  const texto = (e?.stderr || e?.message || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const erro = texto.find((l) => /^error/i.test(l)) || texto[texto.length - 1] || "sem detalhe";
  return erro.slice(0, 200);
}
