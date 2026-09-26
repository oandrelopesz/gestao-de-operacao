// Gerador de PDF mínimo, sem biblioteca: páginas A4, Helvetica e Helvetica-Bold (fontes padrão do PDF, com
// WinAnsi — cobre todos os acentos do português), texto, retângulos e linhas. Sem dependências.

export type Cor = [number, number, number];

// Larguras (em milésimos do tamanho da fonte) dos caracteres 32–126, das métricas oficiais (AFM) da Helvetica.
const NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const NEGRITO = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
  611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
const ESPECIAIS: Record<string, number> = {
  "—": 1000, "–": 556, "…": 1000, "•": 350, "“": 333, "”": 333, "‘": 222,
  "’": 222, "ª": 370, "º": 365, "°": 400, "€": 556, "·": 278, "×": 584, " ": 278,
};

// Unicode → byte do WinAnsiEncoding (cp1252) fora da faixa ASCII/Latin-1
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const TROCAS: Record<string, string> = { "→": "->", "←": "<-", "\t": " ", "\r": "" };

/** Texto → bytes WinAnsi; o que não existe na fonte vira equivalente simples ou "?". */
export function paraWinAnsi(s: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of s) {
    const troca = TROCAS[ch];
    if (troca !== undefined) {
      for (const c of troca) bytes.push(c.charCodeAt(0));
      continue;
    }
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) bytes.push(cp);
    else if (CP1252[cp] !== undefined) bytes.push(CP1252[cp]);
    else {
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      bytes.push(base.length === 1 && base.charCodeAt(0) >= 0x20 && base.charCodeAt(0) <= 0x7e ? base.charCodeAt(0) : 0x3f);
    }
  }
  return Uint8Array.from(bytes);
}

function larguraChar(ch: string, negrito: boolean): number {
  const tabela = negrito ? NEGRITO : NORMAL;
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return tabela[c - 32];
  if (ESPECIAIS[ch] !== undefined) return ESPECIAIS[ch];
  const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (base.length === 1 && base.charCodeAt(0) >= 32 && base.charCodeAt(0) <= 126) return tabela[base.charCodeAt(0) - 32];
  return 556;
}

/** Largura em pontos do texto já convertido para o que a fonte mostra. */
export function larguraTexto(s: string, tamanho: number, negrito: boolean): number {
  const visivel = Array.from(paraWinAnsi(s), (b) => String.fromCharCode(b >= 0x80 && b <= 0x9f ? 0x2014 : b)).join("");
  let soma = 0;
  for (const ch of visivel) soma += larguraChar(ch, negrito);
  return (soma * tamanho) / 1000;
}

/** Quebra em linhas que cabem na largura (respeita \n; palavra maior que a linha é cortada). */
export function quebrarTexto(s: string, largura: number, tamanho: number, negrito: boolean): string[] {
  const saida: string[] = [];
  for (const paragrafo of s.split("\n")) {
    const palavras = paragrafo.split(/ +/);
    let linha = "";
    for (let palavra of palavras) {
      while (larguraTexto(palavra, tamanho, negrito) > largura) {
        if (linha) {
          saida.push(linha);
          linha = "";
        }
        let n = palavra.length;
        while (n > 1 && larguraTexto(palavra.slice(0, n), tamanho, negrito) > largura) n--;
        saida.push(palavra.slice(0, n));
        palavra = palavra.slice(n);
      }
      const tentativa = linha ? `${linha} ${palavra}` : palavra;
      if (larguraTexto(tentativa, tamanho, negrito) <= largura) linha = tentativa;
      else {
        saida.push(linha);
        linha = palavra;
      }
    }
    saida.push(linha);
  }
  return saida;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const cor = (c: Cor) => c.map((v) => num(Math.min(1, Math.max(0, v)))).join(" ");
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0").toUpperCase()).join("");

/** Documento A4 retrato. Coordenadas a partir do canto superior esquerdo (y cresce para baixo). */
export class DocumentoPdf {
  readonly largura = 595.28;
  readonly altura = 841.89;
  private paginas: string[][] = [];

  get totalPaginas(): number {
    return this.paginas.length;
  }

  novaPagina(): number {
    this.paginas.push([]);
    return this.paginas.length - 1;
  }

  private ops(pagina?: number): string[] {
    if (!this.paginas.length) this.novaPagina();
    return this.paginas[pagina ?? this.paginas.length - 1];
  }

  /** `y` é a linha de base do texto. */
  texto(x: number, y: number, s: string, tamanho: number, opc: { negrito?: boolean; cor?: Cor } = {}, pagina?: number): void {
    if (!s) return;
    this.ops(pagina).push(
      `BT /${opc.negrito ? "F2" : "F1"} ${num(tamanho)} Tf ${cor(opc.cor ?? [0.1, 0.1, 0.12])} rg ${num(x)} ${num(this.altura - y)} Td <${hex(paraWinAnsi(s))}> Tj ET`,
    );
  }

  retangulo(x: number, y: number, w: number, h: number, c: Cor, pagina?: number): void {
    this.ops(pagina).push(`${cor(c)} rg ${num(x)} ${num(this.altura - y - h)} ${num(w)} ${num(h)} re f`);
  }

  linha(x1: number, y1: number, x2: number, y2: number, c: Cor, espessura: number, pagina?: number): void {
    this.ops(pagina).push(`${cor(c)} RG ${num(espessura)} w ${num(x1)} ${num(this.altura - y1)} m ${num(x2)} ${num(this.altura - y2)} l S`);
  }

  gerar(titulo: string): Uint8Array {
    if (!this.paginas.length) this.novaPagina();
    const objetos: string[] = [];
    const nPag = this.paginas.length;
    const primeiroPag = 6;
    const kids = Array.from({ length: nPag }, (_, i) => `${primeiroPag + i * 2} 0 R`).join(" ");
    objetos.push(`<< /Type /Catalog /Pages 2 0 R >>`);
    objetos.push(`<< /Type /Pages /Kids [${kids}] /Count ${nPag} >>`);
    objetos.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
    objetos.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
    const tituloUtf16 = Array.from(titulo, (ch) => ch.charCodeAt(0).toString(16).padStart(4, "0")).join("").toUpperCase();
    objetos.push(`<< /Title <FEFF${tituloUtf16}> /Producer (Gestor Pro) >>`);
    for (let i = 0; i < nPag; i++) {
      const conteudo = this.paginas[i].join("\n");
      objetos.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.largura)} ${num(this.altura)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${primeiroPag + i * 2 + 1} 0 R >>`,
      );
      objetos.push(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
    }
    // Tudo em ASCII: o tamanho em caracteres é o tamanho em bytes
    let saida = "%PDF-1.4\n%âãÏÓ\n";
    const offsets: number[] = [];
    objetos.forEach((o, i) => {
      offsets.push(saida.length);
      saida += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = saida.length;
    saida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) saida += `${String(off).padStart(10, "0")} 00000 n \n`;
    saida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Uint8Array.from(saida, (ch) => ch.charCodeAt(0));
  }
}
