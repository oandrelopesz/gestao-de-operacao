// Conversão de imagens no navegador: qualquer formato que o navegador abre vira PNG (logo, com transparência) ou JPG
// (foto). Assim a função recebe sempre um formato que ela lê, e o arquivo original pode ter qualquer tamanho.

/** O seletor de arquivo mostra toda imagem (e os formatos que alguns sistemas não marcam como imagem). */
export const ACEITA_IMAGENS = "image/*,.heic,.heif,.avif,.svg,.ico,.bmp,.tif,.tiff,.jfif,.webp";

// Lados máximos da conversão feita aqui no navegador (a logo da função aceita até 2.048 px: LOGO_LADO_MAX em regras.ts).
export const LADO_LOGO_CONVERTIDA = 1024;
export const LADO_FOTO_CONVERTIDA = 2048;
export const FOTO_MAX_BYTES = 5 * 1024 * 1024;

export const NAO_ABRIU =
  "Não foi possível abrir esta imagem neste navegador (formato não suportado ou imagem grande demais). Formatos como HEIC e TIFF só abrem no Safari: salve como PNG ou JPG e envie de novo.";
export const GRANDE_DEMAIS = "A imagem ficou grande demais mesmo reduzida.";

interface Aberta { fonte: CanvasImageSource; largura: number; altura: number; vetor: boolean; fechar: () => void }

// O que pode vir antes do <svg>: declaração XML, comentários (o Illustrator deixa um) e DOCTYPE (com ou sem subconjunto interno).
const PROLOGO_XML = /^\s*(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^\[>]*(?:\[[\s\S]*?\]\s*)?>)/i;

/** O começo do arquivo a partir do `<svg`, sem o prólogo XML; `null` se o arquivo não começa como um SVG (qualquer que seja o tipo informado). */
function raizSvg(inicio: string): string | null {
  let t = inicio;
  for (let m = PROLOGO_XML.exec(t); m; m = PROLOGO_XML.exec(t)) t = t.slice(m[0].length);
  return /^\s*<svg[\s>]/i.test(t) ? t : null;
}

/**
 * Proporção de um SVG que tem `viewBox` mas não declara largura e altura (o navegador chuta 300 px de largura ou devolve 0).
 * Com largura e altura declaradas, ou sem `viewBox`, devolve `null`: vale o tamanho que o navegador informar.
 */
function tamanhoDoSvg(raiz: string): { largura: number; altura: number } | null {
  const atributos = /^\s*<svg\b([^>]*)/i.exec(raiz)?.[1] ?? "";
  const valor = (nome: string): string | null => {
    const m = new RegExp(`\\s${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(atributos);
    return m ? (m[1] ?? m[2] ?? "") : null;
  };
  const medida = (v: string | null) => v !== null && /^\s*(?:\d+\.?\d*|\.\d+)\s*(?:px)?\s*$/i.test(v) && parseFloat(v) > 0;
  if (medida(valor("width")) && medida(valor("height"))) return null;
  const vb = valor("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (!vb || vb.length !== 4 || vb.some((n) => !Number.isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) return null;
  return { largura: vb[2], altura: vb[3] };
}

/** Abre a imagem; qualquer falha (leitura, decodificação, dimensões) vira `NAO_ABRIU`. */
async function abrir(arquivo: Blob): Promise<Aberta> {
  try {
    const inicio = await arquivo.slice(0, 1024).text().catch(() => "");
    const raiz = raizSvg(inicio);
    const vetor = arquivo.type === "image/svg+xml" || raiz !== null;
    if (!vetor) {
      try {
        const bmp = await createImageBitmap(arquivo);
        return { fonte: bmp, largura: bmp.width, altura: bmp.height, vetor, fechar: () => bmp.close() };
      } catch { /* alguns formatos só abrem pelo <img> */ }
    }
    // Para o SVG só o tipo muda (o slice não copia o arquivo): sem tipo, o <img> não o reconhece.
    const url = URL.createObjectURL(vetor ? arquivo.slice(0, arquivo.size, "image/svg+xml") : arquivo);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      // SVG com viewBox e sem tamanho: a proporção vem do viewBox. Sem nada disso, o maior lado sai com o tamanho máximo.
      const proprio = vetor && raiz !== null ? tamanhoDoSvg(raiz) : null;
      const largura = proprio?.largura ?? (img.naturalWidth || (vetor ? LADO_LOGO_CONVERTIDA : 0));
      const altura = proprio?.altura ?? (img.naturalHeight || (vetor ? LADO_LOGO_CONVERTIDA : 0));
      if (!largura || !altura) throw new Error(NAO_ABRIU);
      return { fonte: img, largura, altura, vetor, fechar: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error(NAO_ABRIU);
    }
  } catch {
    throw new Error(NAO_ABRIU);
  }
}

function desenhar(a: Aberta, ladoMax: number, fundoBranco: boolean): HTMLCanvasElement {
  // Nunca amplia imagem de pixels; SVG (vetor) é desenhado já no tamanho máximo.
  const escala = Math.min(a.vetor ? Infinity : 1, ladoMax / Math.max(a.largura, a.altura));
  const largura = Math.max(1, Math.round(a.largura * escala));
  const altura = Math.max(1, Math.round(a.altura * escala));
  const c = document.createElement("canvas");
  c.width = largura;
  c.height = altura;
  try {
    const g = c.getContext("2d");
    if (!g) throw new Error(NAO_ABRIU);
    if (fundoBranco) { g.fillStyle = "#ffffff"; g.fillRect(0, 0, largura, altura); }
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(a.fonte, 0, 0, largura, altura);
    return c;
  } catch (e) {
    liberar(c);
    throw e;
  }
}

/** Devolve a memória do canvas (o Safari limita o total de canvas vivos). */
function liberar(c: HTMLCanvasElement | null) {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

function paraBlob(c: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error(NAO_ABRIU))), tipo, qualidade));
}

/** Logo: PNG com transparência, lado maior até 1.024 px. Qualquer falha vira `NAO_ABRIU` (nunca o texto cru do navegador). */
export async function normalizarLogo(arquivo: Blob): Promise<Blob> {
  const a = await abrir(arquivo);
  let c: HTMLCanvasElement | null = null;
  try {
    c = desenhar(a, LADO_LOGO_CONVERTIDA, false);
    return await paraBlob(c, "image/png");
  } catch {
    throw new Error(NAO_ABRIU);
  } finally {
    liberar(c);
    a.fechar();
  }
}

/** Até 4 tamanhos (cada um com 3 qualidades) até caber nos 5 MB; `null` se nada coube. */
async function codificarFoto(a: Aberta): Promise<Blob | null> {
  let lado = LADO_FOTO_CONVERTIDA;
  for (let i = 0; i < 4; i++) {
    const c = desenhar(a, lado, true);
    try {
      for (const q of [0.9, 0.8, 0.7]) {
        const b = await paraBlob(c, "image/jpeg", q);
        if (b.size <= FOTO_MAX_BYTES) return b;
      }
    } finally {
      liberar(c);
    }
    lado = Math.round(lado * 0.75);
  }
  return null;
}

/**
 * Foto: JPG (fundo branco onde era transparente), lado maior até 2.048 px e até 5 MB (baixa a qualidade se precisar).
 * Qualquer falha vira `NAO_ABRIU`, menos o caso de nada caber nos 5 MB (`GRANDE_DEMAIS`).
 */
export async function normalizarFoto(arquivo: Blob): Promise<Blob> {
  const a = await abrir(arquivo);
  try {
    let b: Blob | null;
    try {
      b = await codificarFoto(a);
    } catch {
      throw new Error(NAO_ABRIU);
    }
    if (!b) throw new Error(GRANDE_DEMAIS);
    return b;
  } finally {
    a.fechar();
  }
}

/** Conteúdo em base64, sem o prefixo `data:...;base64,`. */
export function blobParaBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => { const r = String(leitor.result ?? ""); resolve(r.slice(r.indexOf(",") + 1)); };
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(b);
  });
}
