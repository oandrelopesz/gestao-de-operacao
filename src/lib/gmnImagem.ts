// Conversão de imagens no navegador: qualquer formato que o navegador abre vira PNG (logo, com transparência) ou JPG
// (foto). Assim a função recebe sempre um formato que ela lê, e o arquivo original pode ter qualquer tamanho.

/** O seletor de arquivo mostra toda imagem (e os formatos que alguns sistemas não marcam como imagem). */
export const ACEITA_IMAGENS = "image/*,.heic,.heif,.avif,.svg,.ico,.bmp,.tif,.tiff,.jfif,.webp";

// Lados máximos da conversão feita aqui no navegador (a logo da função aceita até 2.048 px: LOGO_LADO_MAX em regras.ts).
export const LADO_LOGO_CONVERTIDA = 1024;
export const LADO_FOTO_CONVERTIDA = 2048;
export const FOTO_MAX_BYTES = 5 * 1024 * 1024;

export const NAO_ABRIU =
  "Não foi possível abrir esta imagem neste navegador. Formatos como HEIC e TIFF só abrem no Safari: salve como PNG ou JPG e envie de novo.";

interface Aberta { fonte: CanvasImageSource; largura: number; altura: number; vetor: boolean; fechar: () => void }

async function abrir(arquivo: Blob): Promise<Aberta> {
  const inicio = await arquivo.slice(0, 256).text().catch(() => "");
  const vetor = arquivo.type === "image/svg+xml" || /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(inicio);
  if (!vetor) {
    try {
      const bmp = await createImageBitmap(arquivo);
      return { fonte: bmp, largura: bmp.width, altura: bmp.height, vetor, fechar: () => bmp.close() };
    } catch { /* alguns formatos só abrem pelo <img> */ }
  }
  const url = URL.createObjectURL(vetor ? new Blob([await arquivo.arrayBuffer()], { type: "image/svg+xml" }) : arquivo);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const largura = img.naturalWidth || (vetor ? LADO_LOGO_CONVERTIDA : 0);
    const altura = img.naturalHeight || (vetor ? LADO_LOGO_CONVERTIDA : 0);
    if (!largura || !altura) throw new Error(NAO_ABRIU);
    return { fonte: img, largura, altura, vetor, fechar: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
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
  const g = c.getContext("2d");
  if (!g) throw new Error(NAO_ABRIU);
  if (fundoBranco) { g.fillStyle = "#ffffff"; g.fillRect(0, 0, largura, altura); }
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(a.fonte, 0, 0, largura, altura);
  return c;
}

function paraBlob(c: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error(NAO_ABRIU))), tipo, qualidade));
}

/** Logo: PNG com transparência, lado maior até 1.024 px. */
export async function normalizarLogo(arquivo: Blob): Promise<Blob> {
  const a = await abrir(arquivo);
  try {
    return await paraBlob(desenhar(a, LADO_LOGO_CONVERTIDA, false), "image/png");
  } finally {
    a.fechar();
  }
}

/** Foto: JPG (fundo branco onde era transparente), lado maior até 2.048 px e até 5 MB (baixa a qualidade se precisar). */
export async function normalizarFoto(arquivo: Blob): Promise<Blob> {
  const a = await abrir(arquivo);
  try {
    let lado = LADO_FOTO_CONVERTIDA;
    for (let i = 0; i < 4; i++) {
      const c = desenhar(a, lado, true);
      for (const q of [0.9, 0.8, 0.7]) {
        const b = await paraBlob(c, "image/jpeg", q);
        if (b.size <= FOTO_MAX_BYTES) return b;
      }
      lado = Math.round(lado * 0.75);
    }
    throw new Error("A imagem ficou grande demais mesmo reduzida.");
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
