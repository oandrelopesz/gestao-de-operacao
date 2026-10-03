// Editor de mídia, parte com canvas: desenhar a mídia girada e recortada, aplicar filtros e texto, exportar a foto (JPG)
// e o vídeo (MP4 H.264, pela Mediabunny com WebCodecs). As contas puras estão em instagramEdicao.ts (com testes).
import {
  aplicarAjustes, combinar, girado, mudaPixels, par, recorte, type EdicaoMidia, type Retangulo, type Texto,
} from "./instagramEdicao";

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Carregada da CDN só quando o editor exporta um vídeo (sem mexer no package.json/bun.lockb). Versão travada.
const MEDIABUNNY = "https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/+esm";

/** Recorte (na mídia girada) e tamanho de saída para uma edição. `largura`: largura máxima de saída. */
export function geometria(w: number, h: number, e: EdicaoMidia, largura = 1080) {
  const g = girado(w, h, e.rotacao);
  const r = e.proporcao ?? g.w / g.h;
  const rect = recorte(g.w, g.h, r, e.zoom, e.cx, e.cy);
  const lw = par(Math.min(largura, rect.w));
  return { girada: g, r, rect, saida: { w: lw, h: par(lw / r) } };
}

/** Desenha a fonte (w×h) girada, com o recorte `rect` esticado no canvas outW×outH. */
export function desenharGeometria(ctx: Ctx2D, fonte: CanvasImageSource, w: number, h: number, rotacao: number, rect: Retangulo, outW: number, outH: number) {
  ctx.save();
  ctx.scale(outW / rect.w, outH / rect.h);
  ctx.translate(-rect.x, -rect.y);
  if (rotacao === 90) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
  else if (rotacao === 180) { ctx.translate(w, h); ctx.rotate(Math.PI); }
  else if (rotacao === 270) { ctx.translate(0, w); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(fonte, 0, 0, w, h);
  ctx.restore();
}

/** Textos por cima (tamanho proporcional à largura; x e y são o centro, de 0 a 1). */
export function desenharTextos(ctx: Ctx2D, w: number, textosH: number, textos: Texto[]) {
  for (const t of textos) {
    if (!t.texto.trim()) continue;
    const px = Math.max(8, t.tamanho * w);
    const alt = px * 1.2;
    const linhas = t.texto.split("\n");
    ctx.font = `700 ${px}px Inter, "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    linhas.forEach((l, i) => {
      const y = t.y * textosH + (i - (linhas.length - 1) / 2) * alt;
      if (t.fundo) {
        const m = ctx.measureText(l);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(t.x * w - m.width / 2 - px * 0.3, y - alt / 2, m.width + px * 0.6, alt);
      } else {
        ctx.lineWidth = px * 0.1;
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.strokeText(l, t.x * w, y);
      }
      ctx.fillStyle = t.cor;
      ctx.fillText(l, t.x * w, y);
    });
  }
}

/** Filtro, ajustes e texto sobre o que já está no canvas. */
export function acabamento(ctx: Ctx2D, w: number, h: number, e: EdicaoMidia) {
  if (!mudaPixels(e)) return;
  const { ajustes, cinza } = combinar(e.filtro, e.intensidade, e.ajustes);
  if (cinza || Object.values(ajustes).some(Boolean)) {
    const img = ctx.getImageData(0, 0, w, h);
    aplicarAjustes(img.data, w, h, ajustes, cinza);
    ctx.putImageData(img, 0, 0);
  }
  desenharTextos(ctx, w, h, e.textos);
}

/** A edição muda o arquivo? (sem mudança, o original serve). */
export function precisaExportar(tipo: "imagem" | "video", w: number, e: EdicaoMidia, duracao = 0): boolean {
  const geo = e.rotacao !== 0 || e.proporcao != null || e.zoom > 1.001 || mudaPixels(e);
  if (tipo === "imagem") return geo;
  return geo || (e.inicio ?? 0) > 0.05 || (e.fim != null && e.fim < duracao - 0.05) || !!e.semSom || w > 1920;
}

export async function exportarImagem(original: Blob, e: EdicaoMidia): Promise<{ blob: Blob; largura: number; altura: number }> {
  const bmp = await createImageBitmap(original);
  try {
    const { rect, saida } = geometria(bmp.width, bmp.height, e);
    const c = document.createElement("canvas");
    c.width = saida.w;
    c.height = saida.h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high";
    desenharGeometria(ctx, bmp, bmp.width, bmp.height, e.rotacao, rect, saida.w, saida.h);
    acabamento(ctx, saida.w, saida.h, e);
    const blob = await new Promise<Blob>((ok, falha) =>
      c.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível gerar a imagem."))), "image/jpeg", 0.92));
    return { blob, largura: saida.w, altura: saida.h };
  } finally {
    bmp.close();
  }
}

/**
 * Vídeo: trecho, giro, recorte e tamanho na conversão; filtros e texto quadro a quadro. Sai MP4 (H.264) pronto para a
 * internet. `aviso` explica trilha descartada (ex.: áudio que o navegador não converte).
 */
export async function exportarVideo(
  original: Blob, w: number, h: number, duracao: number, e: EdicaoMidia, onProgresso: (fracao: number) => void,
): Promise<{ blob: Blob; largura: number; altura: number; duracao: number; aviso: string | null }> {
  // deno-lint-ignore no-explicit-any
  const mb: any = await import(/* @vite-ignore */ MEDIABUNNY);
  const { rect, saida } = geometria(w, h, e);
  const crop = { left: rect.x - (rect.x % 2), top: rect.y - (rect.y % 2), width: par(rect.w), height: par(rect.h) };
  const inicio = e.inicio ?? 0;
  const fim = e.fim ?? duracao;
  const input = new mb.Input({ source: new mb.BlobSource(original), formats: mb.ALL_FORMATS });
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
  const conversao = await mb.Conversion.init({
    input,
    output,
    ...(inicio > 0.05 || fim < duracao - 0.05 ? { trim: { start: inicio, end: fim } } : {}),
    video: {
      ...(e.rotacao ? { rotate: e.rotacao } : {}),
      crop,
      width: saida.w,
      height: saida.h,
      fit: "fill",
      codec: "avc",
      bitrate: mb.QUALITY_HIGH,
      forceTranscode: true,
      ...(mudaPixels(e) ? {
        processedWidth: saida.w,
        processedHeight: saida.h,
        // deno-lint-ignore no-explicit-any
        process: (amostra: any) => {
          const c = new OffscreenCanvas(saida.w, saida.h);
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          amostra.draw(ctx, 0, 0, saida.w, saida.h);
          acabamento(ctx, saida.w, saida.h, e);
          return c;
        },
      } : {}),
    },
    audio: e.semSom ? { discard: true } : {},
  });
  if (!conversao.isValid) throw new Error("Este vídeo não pode ser convertido neste navegador (use o Chrome atualizado).");
  // deno-lint-ignore no-explicit-any
  const descartadas = (conversao.discardedTracks ?? []).filter((d: any) => d.track?.type === "audio" && !e.semSom);
  conversao.onProgress = (p: number) => onProgresso(p);
  await conversao.execute();
  const blob = new Blob([output.target.buffer], { type: "video/mp4" });
  return {
    blob, largura: saida.w, altura: saida.h, duracao: Math.max(0, fim - inicio),
    aviso: descartadas.length ? "O áudio deste vídeo não pôde ser convertido neste navegador e o vídeo ficou sem som." : null,
  };
}
