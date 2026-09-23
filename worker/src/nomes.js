// Regras de nome do swipe file. O `base` vem pronto do app
// ("Vídeo de anúncio - Médico - Ortopedia - Dr Fulano"); aqui só cuidamos de
// sanitizar, cortar no limite do Drive e numerar cards e VSLs.

const PROIBIDOS = /[\\/:*?"<>|]/g;
const LIMITE = 180;

const VIDEOS = new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v"]);
const IMAGENS = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic"]);
const MIMES = {
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
  avi: "video/x-msvideo", m4v: "video/x-m4v",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", bmp: "image/bmp", heic: "image/heic",
  html: "text/html", zip: "application/zip", pdf: "application/pdf", txt: "text/plain",
};

export function sanitizar(nome) {
  return String(nome).replace(PROIBIDOS, "-").replace(/\s+/g, " ").trim();
}

/** Nome pronto para o Drive: sanitizado e cortado em 180 caracteres com a extensão. */
export function limitar(base, extensao = "") {
  const limpo = sanitizar(base);
  const sufixo = extensao ? `.${extensao}` : "";
  const max = LIMITE - sufixo.length;
  const cortado = limpo.length > max ? limpo.slice(0, max).trim() : limpo;
  return `${cortado}${sufixo}`;
}

export function extensaoDe(caminho) {
  const m = String(caminho).match(/\.([a-z0-9]{1,6})$/i);
  return m ? m[1].toLowerCase() : "";
}

/** Card de carrossel dentro da pasta do item: "Card 01.jpg", "Card 02.mp4"... (a pasta já leva o nome base). */
export function nomeCard(indice, extensao) {
  return limitar(`Card ${String(indice).padStart(2, "0")}`, extensao);
}

export function nomeVsl(base, indice) {
  return limitar(`${base} - VSL ${String(indice).padStart(2, "0")}`, "mp4");
}

/** Evita sobrescrever: "video.mp4" vira "video (2).mp4" se já existir. */
export function nomeUnico(desejado, existentes) {
  const usados = new Set(existentes);
  if (!usados.has(desejado)) return desejado;
  const ext = extensaoDe(desejado);
  const sufixo = ext ? `.${ext}` : "";
  const raiz = ext ? desejado.slice(0, -sufixo.length) : desejado;
  for (let i = 2; i < 1000; i++) {
    const tentativa = `${raiz} (${i})${sufixo}`;
    if (!usados.has(tentativa)) return tentativa;
  }
  return `${raiz} (${Date.now()})${sufixo}`;
}

export const ehVideo = (ext) => VIDEOS.has(String(ext).toLowerCase());
export const ehImagem = (ext) => IMAGENS.has(String(ext).toLowerCase());
export const ehMidia = (ext) => ehVideo(ext) || ehImagem(ext);
export const mimeDe = (ext) => MIMES[String(ext).toLowerCase()] || "application/octet-stream";

/**
 * Tira da URL os parâmetros de rastreio (utm_*, fbclid, gclid...). Eles não mudam a página, mas
 * o wget grava cada URL como nome de arquivo: com a query inteira dos UTMs o nome passa de 250
 * caracteres e o Windows não consegue extrair o zip. Devolve a entrada intacta se não for URL.
 */
export function semRastreio(link) {
  let u;
  try { u = new URL(link); } catch { return link; }
  for (const chave of [...u.searchParams.keys()]) {
    if (/^utm_/i.test(chave) || /^(fbclid|gclid|gbraid|wbraid|dclid|ttclid|msclkid|srsltid|mc_cid|mc_eid|igshid)$/i.test(chave)) {
      u.searchParams.delete(chave);
    }
  }
  return u.toString();
}
