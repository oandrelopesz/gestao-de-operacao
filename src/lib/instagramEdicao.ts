// Editor de mídia da aba Instagram, parte pura (sem canvas): recorte, proporções, filtros prontos e ajustes nos pixels.
// O mesmo cálculo vale para a prévia, a foto exportada e cada quadro do vídeo (EditorMidia.tsx e instagramEditor.ts).

export type Rotacao = 0 | 90 | 180 | 270;
export interface Retangulo { x: number; y: number; w: number; h: number }

export const PROPORCOES: { rotulo: string; r: number | null }[] = [
  { rotulo: "Original", r: null },
  { rotulo: "1:1", r: 1 },
  { rotulo: "4:5", r: 0.8 },
  { rotulo: "1,91:1", r: 1.91 },
  { rotulo: "9:16", r: 9 / 16 },
];

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Tamanho da fonte depois de girar. */
export const girado = (w: number, h: number, rot: Rotacao) => (rot % 180 === 0 ? { w, h } : { w: h, h: w });

/** Recorte centralizado de proporção `r` (largura/altura) numa fonte w×h. */
export function recorteCentral(w: number, h: number, r: number): Retangulo {
  if (w / h > r) {
    const cw = Math.round(h * r);
    return { x: Math.round((w - cw) / 2), y: 0, w: cw, h };
  }
  const ch = Math.round(w / r);
  return { x: 0, y: Math.round((h - ch) / 2), w, h: ch };
}

/** Recorte com zoom (1 = o maior possível) e centro (cx, cy de 0 a 1), sem sair da fonte. */
export function recorte(w: number, h: number, r: number, zoom: number, cx: number, cy: number): Retangulo {
  const base = recorteCentral(w, h, r);
  const cw = base.w / Math.max(1, zoom);
  const ch = base.h / Math.max(1, zoom);
  return {
    x: Math.round(limitar(cx * w - cw / 2, 0, w - cw)),
    y: Math.round(limitar(cy * h - ch / 2, 0, h - ch)),
    w: Math.round(cw),
    h: Math.round(ch),
  };
}

/** Número par mais próximo (o H.264 exige largura e altura pares). */
export const par = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Tamanho de saída: 1080 de largura (padrão do Instagram), altura pela proporção. */
export const tamanhoSaida = (r: number, largura = 1080) => ({ w: largura, h: par(largura / r) });

// ------------------------------------------------------------------ cor

export interface Ajustes {
  brilho: number; // -100 a 100
  contraste: number;
  saturacao: number;
  calor: number;
  realces: number;
  sombras: number;
  esmaecer: number; // 0 a 100
  vinheta: number; // 0 a 100
}

export const SEM_AJUSTES: Ajustes = { brilho: 0, contraste: 0, saturacao: 0, calor: 0, realces: 0, sombras: 0, esmaecer: 0, vinheta: 0 };

export const NOMES_AJUSTES: { chave: keyof Ajustes; nome: string; min: number }[] = [
  { chave: "brilho", nome: "Brilho", min: -100 },
  { chave: "contraste", nome: "Contraste", min: -100 },
  { chave: "saturacao", nome: "Saturação", min: -100 },
  { chave: "calor", nome: "Calor", min: -100 },
  { chave: "realces", nome: "Realces", min: -100 },
  { chave: "sombras", nome: "Sombras", min: -100 },
  { chave: "esmaecer", nome: "Esmaecer", min: 0 },
  { chave: "vinheta", nome: "Vinheta", min: 0 },
];

/** Filtros prontos: um conjunto de ajustes (e P&B), aplicado na intensidade escolhida. */
export const FILTROS: { id: string; nome: string; ajustes: Partial<Ajustes>; cinza?: number }[] = [
  { id: "normal", nome: "Normal", ajustes: {} },
  { id: "vivido", nome: "Vívido", ajustes: { contraste: 20, saturacao: 30, calor: -5 } },
  { id: "claro", nome: "Claro", ajustes: { brilho: 15, saturacao: -10, sombras: 20 } },
  { id: "suave", nome: "Suave", ajustes: { brilho: 5, contraste: -20, esmaecer: 25 } },
  { id: "quente", nome: "Quente", ajustes: { calor: 35, saturacao: 10 } },
  { id: "frio", nome: "Frio", ajustes: { calor: -35, brilho: 5 } },
  { id: "retro", nome: "Retrô", ajustes: { brilho: 10, contraste: -15, saturacao: -25, calor: 20, esmaecer: 20 } },
  { id: "cremoso", nome: "Cremoso", ajustes: { contraste: -10, saturacao: -15, calor: 12, esmaecer: 12 } },
  { id: "dramatico", nome: "Dramático", ajustes: { contraste: 35, saturacao: -10, sombras: -20, vinheta: 40 } },
  { id: "desbotado", nome: "Desbotado", ajustes: { saturacao: -40, esmaecer: 30, brilho: 5 } },
  { id: "pb", nome: "P&B", ajustes: { contraste: 15 }, cinza: 1 },
  { id: "noir", nome: "Noir", ajustes: { contraste: 40, sombras: -25, vinheta: 30 }, cinza: 1 },
];

/** Ajustes finais = filtro na intensidade (0 a 100) + ajustes manuais. */
export function combinar(filtroId: string, intensidade: number, manuais: Ajustes): { ajustes: Ajustes; cinza: number } {
  const f = FILTROS.find((x) => x.id === filtroId) ?? FILTROS[0];
  const k = limitar(intensidade, 0, 100) / 100;
  const ajustes = { ...manuais };
  for (const [chave, v] of Object.entries(f.ajustes) as [keyof Ajustes, number][]) ajustes[chave] = limitar(manuais[chave] + v * k, -100, 100);
  return { ajustes, cinza: (f.cinza ?? 0) * k };
}

/** Aplica os ajustes nos pixels RGBA (no lugar). `cinza` de 0 a 1 (P&B). */
export function aplicarAjustes(d: Uint8ClampedArray, w: number, h: number, a: Ajustes, cinza = 0): void {
  const nada = cinza === 0 && Object.values(a).every((v) => v === 0);
  if (nada) return;
  const brilho = a.brilho / 100 * 0.35;
  const contraste = 1 + a.contraste / 100;
  const sat = 1 + a.saturacao / 100;
  const calor = a.calor / 100 * 0.12;
  const realces = a.realces / 100 * 0.3;
  const sombras = a.sombras / 100 * 0.3;
  const esm = a.esmaecer / 100 * 0.25;
  const vin = a.vinheta / 100 * 0.75;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const raio2 = cx * cx + cy * cy || 1;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      let r = d[i] / 255;
      let g = d[i + 1] / 255;
      let b = d[i + 2] / 255;
      r += brilho; g += brilho; b += brilho;
      r = (r - 0.5) * contraste + 0.5; g = (g - 0.5) * contraste + 0.5; b = (b - 0.5) * contraste + 0.5;
      let lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const s = sat * (1 - cinza);
      r = lum + (r - lum) * s; g = lum + (g - lum) * s; b = lum + (b - lum) * s;
      r += calor; b -= calor;
      lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const tom = lum > 0.5 ? realces * (lum - 0.5) * 2 : sombras * (0.5 - lum) * 2;
      r += tom; g += tom; b += tom;
      if (esm) { r = r * (1 - esm) + esm * 0.6; g = g * (1 - esm) + esm * 0.6; b = b * (1 - esm) + esm * 0.6; }
      if (vin) {
        const dx = x - cx;
        const dy = y - cy;
        const f = 1 - vin * Math.max(0, (dx * dx + dy * dy) / raio2 - 0.15);
        r *= f; g *= f; b *= f;
      }
      d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255; // o Uint8ClampedArray já limita de 0 a 255
    }
  }
}

// ------------------------------------------------------------------ edição de uma mídia

/** Texto por cima: tamanho em fração da largura; x e y (de 0 a 1) são o centro do texto. */
export interface Texto { texto: string; cor: string; tamanho: number; x: number; y: number; fundo?: boolean }

export interface EdicaoMidia {
  proporcao: number | null; // null = a da mídia (girada)
  zoom: number;
  cx: number;
  cy: number;
  rotacao: Rotacao;
  filtro: string;
  intensidade: number;
  ajustes: Ajustes;
  textos: Texto[];
  inicio?: number; // vídeo, em segundos
  fim?: number;
  semSom?: boolean;
}

export const EDICAO_PADRAO: EdicaoMidia = {
  proporcao: null, zoom: 1, cx: 0.5, cy: 0.5, rotacao: 0, filtro: "normal", intensidade: 100, ajustes: SEM_AJUSTES, textos: [],
};

/** Filtro, ajuste ou texto exigem refazer os pixels (no vídeo, processar quadro a quadro). */
export function mudaPixels(e: EdicaoMidia): boolean {
  return (e.filtro !== "normal" && e.intensidade > 0) || Object.values(e.ajustes).some((v) => v !== 0) || e.textos.some((t) => t.texto.trim());
}
