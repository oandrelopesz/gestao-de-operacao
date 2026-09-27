// Regras puras da exportação dos quadros: nome do arquivo, páginas do PDF, escala segura do PNG, encaixe de imagem em
// slide/página, ordem das molduras e as cores do tema escuro (mesmo filtro do Excalidraw). Sem dependências.

export type Papel = "a4" | "a3" | "carta";
export type Orientacao = "auto" | "retrato" | "paisagem";
export type AjustePdf = "caber" | "real";

/** Tamanhos em pontos (1/72 pol.), em retrato. */
export const PAPEIS: Record<Papel, { rotulo: string; largura: number; altura: number }> = {
  a4: { rotulo: "A4", largura: 595.28, altura: 841.89 },
  a3: { rotulo: "A3", largura: 841.89, altura: 1190.55 },
  carta: { rotulo: "Carta", largura: 612, altura: 792 },
};

/** 1 px da tela (96 por polegada) em pontos */
const PT_POR_PX = 0.75;
/** Desenho pequeno não é ampliado além disso no "caber em uma página" */
const AMPLIACAO_MAXIMA = 1.5;

export function nomeArquivo(titulo: string, ext: string, data = new Date()): string {
  const slug = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "quadro";
  const dia = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
  return `fluxograma-${slug}-${dia}.${ext}`;
}

export interface PaginaPdf {
  /** Onde fica o canto do desenho nesta página (pt); nas páginas seguintes do tamanho real, fica negativo */
  x: number;
  y: number;
  /** Recortar na área útil (tamanho real em várias páginas) */
  recortar: boolean;
}

export interface PlanoPdf {
  largura: number;
  altura: number;
  margem: number;
  /** pt por px do desenho */
  escala: number;
  larguraDesenho: number;
  alturaDesenho: number;
  paginas: PaginaPdf[];
}

function tamanhoDaFolha(papel: Papel, paisagem: boolean) {
  const p = PAPEIS[papel];
  return paisagem ? { largura: p.altura, altura: p.largura } : { largura: p.largura, altura: p.altura };
}

function planoReal(conteudo: { largura: number; altura: number }, papel: Papel, paisagem: boolean, margem: number): PlanoPdf {
  const folha = tamanhoDaFolha(papel, paisagem);
  const uw = folha.largura - 2 * margem;
  const uh = folha.altura - 2 * margem;
  const w = conteudo.largura * PT_POR_PX;
  const h = conteudo.altura * PT_POR_PX;
  const colunas = Math.max(1, Math.ceil(w / uw - 1e-9));
  const linhas = Math.max(1, Math.ceil(h / uh - 1e-9));
  if (colunas === 1 && linhas === 1) {
    // Coube numa folha: centralizado, como no "caber"
    return { ...folha, margem, escala: PT_POR_PX, larguraDesenho: w, alturaDesenho: h, paginas: [{ x: margem + (uw - w) / 2, y: margem + (uh - h) / 2, recortar: true }] };
  }
  const paginas: PaginaPdf[] = [];
  for (let l = 0; l < linhas; l++) {
    for (let c = 0; c < colunas; c++) paginas.push({ x: margem - c * uw, y: margem - l * uh, recortar: true });
  }
  return { ...folha, margem, escala: PT_POR_PX, larguraDesenho: w, alturaDesenho: h, paginas };
}

/** Folha, escala e páginas para um desenho de `largura` × `altura` px. */
export function paginasPdf(
  conteudo: { largura: number; altura: number },
  o: { papel: Papel; orientacao: Orientacao; margem: number; ajuste: AjustePdf },
): PlanoPdf {
  const largo = conteudo.largura > conteudo.altura;
  if (o.ajuste === "real") {
    if (o.orientacao !== "auto") return planoReal(conteudo, o.papel, o.orientacao === "paisagem", o.margem);
    // Automático: a orientação que gasta menos folhas (empate: a que segue o formato do desenho)
    const retrato = planoReal(conteudo, o.papel, false, o.margem);
    const paisagem = planoReal(conteudo, o.papel, true, o.margem);
    if (retrato.paginas.length !== paisagem.paginas.length) return retrato.paginas.length < paisagem.paginas.length ? retrato : paisagem;
    return largo ? paisagem : retrato;
  }
  const paisagem = o.orientacao === "auto" ? largo : o.orientacao === "paisagem";
  const folha = tamanhoDaFolha(o.papel, paisagem);
  const uw = folha.largura - 2 * o.margem;
  const uh = folha.altura - 2 * o.margem;
  const escala = Math.min(uw / conteudo.largura, uh / conteudo.altura, AMPLIACAO_MAXIMA);
  const w = conteudo.largura * escala;
  const h = conteudo.altura * escala;
  return {
    ...folha, margem: o.margem, escala, larguraDesenho: w, alturaDesenho: h,
    paginas: [{ x: o.margem + (uw - w) / 2, y: o.margem + (uh - h) / 2, recortar: false }],
  };
}

/**
 * Maior escala ≤ `pedida` que cabe nos limites de canvas do navegador (lado e área em px). Os padrões valem para
 * Chrome/Edge/Firefox; o Safari do iPhone aguenta bem menos (use `area: 16_777_216`).
 */
export function escalaSegura(largura: number, altura: number, pedida: number, limites = { lado: 16384, area: 120_000_000 }): number {
  const s = Math.min(pedida, limites.lado / largura, limites.lado / altura, Math.sqrt(limites.area / (largura * altura)));
  return Math.max(0.1, Math.floor(s * 100) / 100);
}

/** Imagem dentro de uma área, sem distorcer, centralizada (mesma unidade da área). */
export function encaixar(largura: number, altura: number, areaL: number, areaA: number): { largura: number; altura: number; x: number; y: number } {
  const e = Math.min(areaL / largura, areaA / altura);
  const l = largura * e, a = altura * e;
  return { largura: l, altura: a, x: (areaL - l) / 2, y: (areaA - a) / 2 };
}

/** Com nome primeiro (ordem natural: "2" antes de "10"), depois sem nome pela posição, linha a linha. */
export function ordenarMolduras<T extends { name?: string | null; x: number; y: number }>(molduras: T[]): T[] {
  const nomeadas = molduras.filter((m) => m.name?.trim()).sort((a, b) =>
    a.name!.localeCompare(b.name!, "pt-BR", { numeric: true, sensitivity: "base" }));
  const soltas = molduras.filter((m) => !m.name?.trim()).sort((a, b) => a.y - b.y);
  const TOLERANCIA_LINHA = 80;
  let linha = 0, inicio = soltas[0]?.y ?? 0;
  const comLinha = soltas.map((m) => {
    if (m.y - inicio > TOLERANCIA_LINHA) { linha += 1; inicio = m.y; }
    return { m, linha };
  });
  comLinha.sort((a, b) => a.linha - b.linha || a.m.x - b.m.x);
  return [...nomeadas, ...comLinha.map((c) => c.m)];
}

// ---------------------------------------------------------------- Tema escuro

function paraRgb(cor: string): [number, number, number] | null {
  const c = cor.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(c);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(c);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

const HUE_180 = [
  [-0.574, 1.43, 0.144],
  [0.426, 0.43, 0.144],
  [0.426, 1.43, -0.856],
];

/**
 * A cor como o Excalidraw mostra no tema escuro (filtro CSS invert(93%) + hue-rotate(180deg)). Serve para o PDF, onde
 * filtro CSS não existe. Cores que não são #rgb/#rrggbb/rgb() (none, transparent, url(...)) voltam como vieram.
 */
export function corNoEscuro(cor: string): string {
  const rgb = paraRgb(cor);
  if (!rgb) return cor;
  const inv = rgb.map((v) => 0.93 - 0.86 * (v / 255));
  const saida = HUE_180.map((linha) => linha.reduce((s, k, i) => s + k * inv[i], 0));
  return `#${saida.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}
