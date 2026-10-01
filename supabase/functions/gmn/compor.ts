// Aplica a logo do cliente sobre a imagem (RGBA), sem a IA tocar na logo: só redução proporcional (média de área) e
// mistura pelo alfa. Funções puras (sem Deno/Node), testáveis com node --test.
import type { ImagemRgba } from "./png.ts";
import type { FundoLogo, PosicaoLogo, TamanhoLogo } from "./regras.ts";

/** Fração máxima da largura e da altura da imagem que a logo pode ocupar. */
export const LIMITE_LOGO: Record<TamanhoLogo, { largura: number; altura: number }> = {
  pequena: { largura: 0.16, altura: 0.14 },
  media: { largura: 0.22, altura: 0.18 },
  grande: { largura: 0.3, altura: 0.24 },
};

export interface Caixa { x: number; y: number; largura: number; altura: number }

/**
 * Onde a logo entra: cabe no limite do tamanho escolhido sem deformar (mesma proporção) e nunca é ampliada; margem de 3%
 * da largura da imagem até a borda (mais o respiro do fundo, quando houver).
 */
export function caixaDaLogo(
  img: { largura: number; altura: number }, logo: { largura: number; altura: number },
  tamanho: TamanhoLogo, posicao: PosicaoLogo, comFundo: boolean,
): { logo: Caixa; fundo: Caixa | null } {
  const lim = LIMITE_LOGO[tamanho];
  const escala = Math.min(1, (img.largura * lim.largura) / logo.largura, (img.altura * lim.altura) / logo.altura);
  const largura = Math.max(1, Math.round(logo.largura * escala));
  const altura = Math.max(1, Math.round(logo.altura * escala));
  const respiro = comFundo ? Math.round(img.largura * 0.012) : 0;
  const margem = Math.round(img.largura * 0.03);
  const direita = posicao.endsWith("direito");
  const baixo = posicao.startsWith("inferior");
  const x = direita ? img.largura - margem - respiro - largura : margem + respiro;
  const y = baixo ? img.altura - margem - respiro - altura : margem + respiro;
  return {
    logo: { x, y, largura, altura },
    fundo: comFundo ? { x: x - respiro, y: y - respiro, largura: largura + 2 * respiro, altura: altura + 2 * respiro } : null,
  };
}

/** Redução proporcional por média de área (com alfa pré-multiplicado, para a borda não escurecer). Nunca amplia. */
export function reduzir(src: ImagemRgba, largura: number, altura: number): ImagemRgba {
  if (largura >= src.largura && altura >= src.altura) return src;
  const out = new Uint8Array(largura * altura * 4);
  const ex = src.largura / largura, ey = src.altura / altura;
  for (let y = 0; y < altura; y++) {
    const y0 = y * ey, y1 = y0 + ey;
    for (let x = 0; x < largura; x++) {
      const x0 = x * ex, x1 = x0 + ex;
      let r = 0, g = 0, b = 0, a = 0, peso = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1) && sy < src.altura; sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1) && sx < src.largura; sx++) {
          const w = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0));
          const i = (sy * src.largura + sx) * 4;
          const al = src.dados[i + 3] * w;
          r += src.dados[i] * al; g += src.dados[i + 1] * al; b += src.dados[i + 2] * al; a += al; peso += w;
        }
      }
      const j = (y * largura + x) * 4;
      if (a > 0) { out[j] = Math.round(r / a); out[j + 1] = Math.round(g / a); out[j + 2] = Math.round(b / a); }
      out[j + 3] = Math.round(a / peso);
    }
  }
  return { largura, altura, dados: out };
}

function misturar(dst: Uint8Array, i: number, r: number, g: number, b: number, a: number) {
  if (a <= 0) return;
  if (a >= 255) { dst[i] = r; dst[i + 1] = g; dst[i + 2] = b; dst[i + 3] = 255; return; }
  const t = a / 255;
  dst[i] = Math.round(r * t + dst[i] * (1 - t));
  dst[i + 1] = Math.round(g * t + dst[i + 1] * (1 - t));
  dst[i + 2] = Math.round(b * t + dst[i + 2] * (1 - t));
  dst[i + 3] = 255;
}

/** Retângulo de cantos arredondados, cor sólida com opacidade (o fundo atrás da logo). */
function pintarFundo(img: ImagemRgba, c: Caixa, cor: [number, number, number], opacidade: number) {
  const raio = Math.round(Math.min(c.largura, c.altura) * 0.18);
  for (let y = Math.max(0, c.y); y < Math.min(img.altura, c.y + c.altura); y++) {
    for (let x = Math.max(0, c.x); x < Math.min(img.largura, c.x + c.largura); x++) {
      const dx = Math.max(c.x + raio - x - 0.5, 0, x + 0.5 - (c.x + c.largura - raio));
      const dy = Math.max(c.y + raio - y - 0.5, 0, y + 0.5 - (c.y + c.altura - raio));
      if (dx * dx + dy * dy > raio * raio) continue;
      misturar(img.dados, (y * img.largura + x) * 4, cor[0], cor[1], cor[2], Math.round(255 * opacidade));
    }
  }
}

/** Aplica a logo (em uma cópia da imagem) e devolve a imagem nova. A logo só é reduzida; cores e formas ficam iguais. */
export function aplicarLogo(
  base: ImagemRgba, logo: ImagemRgba, o: { tamanho: TamanhoLogo; posicao: PosicaoLogo; fundo: FundoLogo },
): ImagemRgba {
  const img: ImagemRgba = { largura: base.largura, altura: base.altura, dados: new Uint8Array(base.dados) };
  const { logo: cx, fundo } = caixaDaLogo(img, logo, o.tamanho, o.posicao, o.fundo !== "nenhum");
  if (fundo) pintarFundo(img, fundo, o.fundo === "claro" ? [255, 255, 255] : [17, 17, 17], 0.88);
  const l = reduzir(logo, cx.largura, cx.altura);
  for (let y = 0; y < l.altura; y++) {
    for (let x = 0; x < l.largura; x++) {
      const s = (y * l.largura + x) * 4;
      misturar(img.dados, ((cx.y + y) * img.largura + (cx.x + x)) * 4, l.dados[s], l.dados[s + 1], l.dados[s + 2], l.dados[s + 3]);
    }
  }
  return img;
}
