// PNG sem biblioteca: lê e grava PNG de 8 bits por canal (RGB ou RGBA, sem entrelaçamento), com a compressão nativa
// (DecompressionStream/CompressionStream "deflate", que existem no Deno e no Node 18+). Serve para aplicar a logo sobre a
// imagem da IA sem mudar um pixel da logo.

export interface ImagemRgba { largura: number; altura: number; dados: Uint8Array } // RGBA, 4 bytes por pixel

const ASSINATURA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function transformar(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const saida = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(saida).arrayBuffer());
}

function u32(b: Uint8Array, i: number): number {
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(partes: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of partes) for (let i = 0; i < p.length; i++) c = TABELA_CRC[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Lado máximo (largura ou altura) que `lerPng` aceita quando o chamador não informa outro. */
export const LADO_MAX_PADRAO = 4096;

const PEDACO_ENTRADA = 8 * 1024;

/**
 * Descomprime só até `esperado` bytes e cancela o resto do fluxo: um arquivo pequeno que descomprime para centenas de MB
 * (bomba de deflate) não chega a ocupar memória além do tamanho que o IHDR declara. Fluxo mais curto que isso lança erro.
 */
async function inflarAte(bytes: Uint8Array, esperado: number): Promise<Uint8Array> {
  // Entrada em pedaços de 8 KB, entregues sob demanda: o descompressor nunca recebe o arquivo inteiro de uma vez, então
  // o teto vale mesmo num runtime que infla cada pedaço de entrada por inteiro.
  let pos = 0;
  const entrada = new ReadableStream<BufferSource>({
    pull(c) {
      if (pos >= bytes.length) {
        c.close();
        return;
      }
      c.enqueue(bytes.slice(pos, pos + PEDACO_ENTRADA));
      pos += PEDACO_ENTRADA;
    },
  }, { highWaterMark: 0 });
  const leitor = entrada.pipeThrough(new DecompressionStream("deflate")).getReader();
  const out = new Uint8Array(esperado);
  let n = 0;
  try {
    while (n < esperado) {
      const { done, value } = await leitor.read();
      if (done) break;
      const parte = value.subarray(0, esperado - n);
      out.set(parte, n);
      n += parte.length;
    }
  } finally {
    await leitor.cancel().catch(() => {});
  }
  if (n < esperado) throw new Error("PNG corrompido");
  return out;
}

/**
 * Lê um PNG de 8 bits, RGB (tipo 2) ou RGBA (tipo 6), sem entrelaçamento. Outro formato lança erro. O IHDR só vale como
 * primeiro bloco e uma vez; lado maior que `ladoMax` é recusado antes de descomprimir; a descompressão para no tamanho
 * declarado (ver `inflarAte`). Deflate corrompido pode lançar erro do próprio stream: quem chama precisa de try/catch.
 */
export async function lerPng(bytes: Uint8Array, ladoMax = LADO_MAX_PADRAO): Promise<ImagemRgba> {
  if (!ASSINATURA.every((v, i) => bytes[i] === v)) throw new Error("não é PNG");
  let largura = 0, altura = 0, tipo = -1;
  const idat: Uint8Array[] = [];
  for (let i = 8; i + 8 <= bytes.length;) {
    const tam = u32(bytes, i);
    const nome = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const ini = i + 8;
    if (nome === "IHDR") {
      if (i !== 8 || tam !== 13 || largura) throw new Error("PNG inválido");
      largura = u32(bytes, ini);
      altura = u32(bytes, ini + 4);
      const prof = bytes[ini + 8];
      tipo = bytes[ini + 9];
      const entrelacado = bytes[ini + 12];
      if (prof !== 8 || (tipo !== 2 && tipo !== 6) || entrelacado !== 0) throw new Error("PNG em formato não suportado");
      if (largura > ladoMax || altura > ladoMax) throw new Error("PNG grande demais");
    } else if (nome === "IDAT") {
      idat.push(bytes.subarray(ini, ini + tam));
    } else if (nome === "IEND") break;
    i = ini + tam + 4;
  }
  if (!largura || !altura || !idat.length) throw new Error("PNG incompleto");
  const comprimido = new Uint8Array(idat.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of idat) { comprimido.set(p, o); o += p.length; }
  const bpp = tipo === 6 ? 4 : 3;
  const linha = largura * bpp;
  const cru = await inflarAte(comprimido, altura * (linha + 1));
  const px = new Uint8Array(altura * linha);
  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (linha + 1)];
    const src = y * (linha + 1) + 1;
    const dst = y * linha;
    const ant = dst - linha;
    for (let x = 0; x < linha; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0;
      const b = y > 0 ? px[ant + x] : 0;
      const c = y > 0 && x >= bpp ? px[ant + x - bpp] : 0;
      let v = cru[src + x];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) v += paeth(a, b, c);
      else if (filtro !== 0) throw new Error("PNG com filtro inválido");
      px[dst + x] = v & 0xff;
    }
  }
  if (bpp === 4) return { largura, altura, dados: px };
  const rgba = new Uint8Array(largura * altura * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    rgba[j] = px[i]; rgba[j + 1] = px[i + 1]; rgba[j + 2] = px[i + 2]; rgba[j + 3] = 255;
  }
  return { largura, altura, dados: rgba };
}

function bloco(nome: string, dados: Uint8Array): Uint8Array {
  const n = new TextEncoder().encode(nome);
  const out = new Uint8Array(12 + dados.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, dados.length);
  out.set(n, 4);
  out.set(dados, 8);
  v.setUint32(8 + dados.length, crc32([n, dados]));
  return out;
}

/**
 * Grava PNG de 8 bits. Sem transparência (todo alfa 255) sai RGB, menor. Cada linha usa o filtro com a menor soma
 * absoluta (heurística padrão), o que deixa a foto bem menor que sem filtro.
 */
export async function gravarPng(img: ImagemRgba): Promise<Uint8Array> {
  const { largura, altura, dados } = img;
  let opaca = true;
  for (let i = 3; i < dados.length; i += 4) if (dados[i] !== 255) { opaca = false; break; }
  const bpp = opaca ? 3 : 4;
  const linha = largura * bpp;
  const px = new Uint8Array(altura * linha);
  if (opaca) {
    for (let i = 0, j = 0; i < dados.length; i += 4, j += 3) { px[j] = dados[i]; px[j + 1] = dados[i + 1]; px[j + 2] = dados[i + 2]; }
  } else px.set(dados);
  const cru = new Uint8Array(altura * (linha + 1));
  const cand = Array.from({ length: 5 }, () => new Uint8Array(linha));
  for (let y = 0; y < altura; y++) {
    const atual = y * linha;
    const ant = atual - linha;
    let melhor = 0, menor = Infinity;
    for (let f = 0; f < 5; f++) {
      const c = cand[f];
      let soma = 0;
      for (let x = 0; x < linha; x++) {
        const v = px[atual + x];
        const a = x >= bpp ? px[atual + x - bpp] : 0;
        const b = y > 0 ? px[ant + x] : 0;
        const cc = y > 0 && x >= bpp ? px[ant + x - bpp] : 0;
        const r = f === 0 ? v : f === 1 ? v - a : f === 2 ? v - b : f === 3 ? v - ((a + b) >> 1) : v - paeth(a, b, cc);
        c[x] = r & 0xff;
        soma += c[x] < 128 ? c[x] : 256 - c[x];
        if (soma >= menor) break;
      }
      if (soma < menor) { menor = soma; melhor = f; }
    }
    // recalcula a linha escolhida inteira (a soma pode ter parado no meio)
    const c = cand[melhor];
    for (let x = 0; x < linha; x++) {
      const v = px[atual + x];
      const a = x >= bpp ? px[atual + x - bpp] : 0;
      const b = y > 0 ? px[ant + x] : 0;
      const cc = y > 0 && x >= bpp ? px[ant + x - bpp] : 0;
      const r = melhor === 0 ? v : melhor === 1 ? v - a : melhor === 2 ? v - b : melhor === 3 ? v - ((a + b) >> 1) : v - paeth(a, b, cc);
      c[x] = r & 0xff;
    }
    cru[y * (linha + 1)] = melhor;
    cru.set(c, y * (linha + 1) + 1);
  }
  const comprimido = await transformar(cru, new CompressionStream("deflate"));
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, largura);
  v.setUint32(4, altura);
  ihdr[8] = 8;
  ihdr[9] = opaca ? 2 : 6;
  const partes = [new Uint8Array(ASSINATURA), bloco("IHDR", ihdr), bloco("IDAT", comprimido), bloco("IEND", new Uint8Array(0))];
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
