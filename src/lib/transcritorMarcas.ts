// Marcas do Transcritor: palavras com tempo, agrupadas em parágrafos.
// A regra de troca é a mesma do worker (worker/src/transcritor/termos.js).

// [texto, início, fim] em segundos
export type Palavra = [string, number, number];
export type Marcas = { v: 1; p: Palavra[][] };

const PONTUACAO_INICIO = /^[^\p{L}\p{N}]+/u;
const PONTUACAO_FIM = /[^\p{L}\p{N}]+$/u;

// Chave para comparar termos: sem acento, minúscula, só letras e números separados por espaço
export function chaveTermo(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function textoDeMarcas(m: Marcas): string {
  return m.p.map((par) => par.map((w) => w[0]).join(" ")).join("\n\n");
}

// Acha, a partir de i, o menor j cujas chaves não vazias unidas por espaço dão o alvo
function acharSequencia(palavras: Palavra[], i: number, alvo: string): number {
  if (!chaveTermo(palavras[i][0])) return -1;
  let juntos = "";
  for (let j = i; j < palavras.length; j++) {
    const k = chaveTermo(palavras[j][0]);
    if (!k) continue;
    juntos = juntos ? `${juntos} ${k}` : k;
    if (juntos === alvo) return j;
    // juntos só cresce: se já passou do tamanho do alvo, não casa mais
    if (juntos.length >= alvo.length) return -1;
  }
  return -1;
}

// Troca dentro de um parágrafo; devolve uma cópia (não mexe na entrada)
function trocarNoParagrafo(
  par: Palavra[],
  alvo: string,
  para: string,
): { par: Palavra[]; trocas: number } {
  const res: Palavra[] = par.map((w) => [w[0], w[1], w[2]]);
  let trocas = 0;
  let i = 0;
  while (i < res.length) {
    const j = acharSequencia(res, i, alvo);
    if (j < 0) {
      i++;
      continue;
    }
    const original = res.slice(i, j + 1).map((w) => w[0]).join(" ");
    const inicio = res[i][0].match(PONTUACAO_INICIO)?.[0] ?? "";
    const fim = res[j][0].match(PONTUACAO_FIM)?.[0] ?? "";
    const primeiraLetra = res[i][0].replace(PONTUACAO_INICIO, "");
    // início de frase em maiúscula: o termo novo também começa com maiúscula
    let base = para;
    if (/^\p{Ll}/u.test(base) && /^\p{Lu}/u.test(primeiraLetra)) {
      base = base.charAt(0).toUpperCase() + base.slice(1);
    }
    const novo = inicio + base + fim;
    if (novo === original) {
      // texto igual ao original: não é troca, segue a busca no próximo token
      i++;
      continue;
    }
    res.splice(i, j - i + 1, [novo, res[i][1], res[j][2]]);
    trocas++;
    i++; // continua depois do token novo
  }
  return { par: res, trocas };
}

export function aplicarCorrecaoNasMarcas(
  m: Marcas,
  de: string,
  para: string,
): { marcas: Marcas; trocas: number } {
  const alvo = chaveTermo(de);
  const trocaVazia = para.trim() === "";
  let trocas = 0;
  const p = m.p.map((par) => {
    if (!alvo || trocaVazia) return par.map((w): Palavra => [w[0], w[1], w[2]]);
    const r = trocarNoParagrafo(par, alvo, para.trim());
    trocas += r.trocas;
    return r.par;
  });
  return { marcas: { v: 1, p }, trocas };
}

// Inícios de todas as palavras, em ordem de leitura
export function iniciosDasPalavras(m: Marcas): number[] {
  return m.p.flat().map((w) => w[1]);
}

// Último índice com início <= tempo (busca binária); -1 se nenhum
export function indicePalavra(inicios: number[], tempo: number): number {
  let lo = 0;
  let hi = inicios.length - 1;
  let achado = -1;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if (inicios[meio] <= tempo) {
      achado = meio;
      lo = meio + 1;
    } else {
      hi = meio - 1;
    }
  }
  return achado;
}
