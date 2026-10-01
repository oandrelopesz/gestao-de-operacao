// Busca tolerante para as caixas de pesquisa do sistema: ignora acento e maiúscula, ignora palavras vazias do
// português ("de", "da", "para"...), acha trecho de palavra, palavras coladas ("googleads" acha "Google Ads") e aceita
// erro de digitação (letra a mais, a menos, trocada ou duas letras vizinhas invertidas). Função pura, sem React e sem
// bibliotecas: roda no `node --test`. Quem usa em tela é o hook `useBusca` (src/lib/useBusca.ts).
//
// Uso: `buscar(itens, consulta, (item) => [titulo, descricao, ...])`. O 1º campo é o principal (título/nome); os demais
// são secundários. Para listas grandes ou campos longos, `indexarBusca` prepara os itens uma vez e `buscarNoIndice`
// consulta o índice a cada letra digitada.

export const MENSAGEM_PARECIDOS = "Sem resultado exato. Itens parecidos:";
export const MENSAGEM_NENHUM = "Nenhum resultado encontrado.";

/** Palavras que não ajudam a achar nada ("página de vendas" e "página vendas" são a mesma busca). */
export const PALAVRAS_VAZIAS: ReadonlySet<string> = new Set(
  "a o as os e de da do das dos em no na nos nas um uma para pra por com".split(" "),
);

/** Palavras com este tamanho ou mais também são procuradas coladas ("googleads") e pelo começo de palavras maiores. */
const TAMANHO_LONGA = 5;

/** Sem acento, minúsculas, tudo que não é letra ou número vira um espaço só, sem espaço nas pontas. null/undefined -> "". */
export function normalizarBusca(texto: string | null | undefined): string {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Palavras da consulta, sem repetidas (na ordem da 1ª vez) e sem as palavras vazias. Se a consulta só tem palavras
 * vazias ("de da"), ficam todas, para a busca ainda funcionar. Consulta vazia -> [].
 */
export function palavrasDaBusca(consulta: string | null | undefined): string[] {
  const normalizada = normalizarBusca(consulta);
  if (!normalizada) return [];
  const unicas = [...new Set(normalizada.split(" "))];
  const uteis = unicas.filter((p) => !PALAVRAS_VAZIAS.has(p));
  return uteis.length > 0 ? uteis : unicas;
}

/** Erros de digitação aceitos numa palavra da busca com `n` letras: até 3 letras nenhum, de 4 a 7 um, 8 ou mais dois. */
export function errosPermitidos(n: number): number {
  if (n <= 3) return 0;
  return n <= 7 ? 1 : 2;
}

// Linhas da tabela da distância, reaproveitadas entre as chamadas para não alocar a cada comparação (a busca compara
// uma palavra com milhares de palavras de campos longos).
let linhaA = new Int32Array(64);
let linhaB = new Int32Array(64);
let linhaC = new Int32Array(64);

/**
 * Distância de Damerau-Levenshtein restrita (optimal string alignment): inserir, apagar, trocar e inverter duas letras
 * vizinhas custam 1. Com `limite`, pode parar cedo e devolver `limite + 1` quando a distância passa dele (inclusive
 * quando a diferença de tamanho já passa do limite); quando a distância cabe no limite, o valor é exato.
 */
export function distanciaDL(a: string, b: string, limite?: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  const max = limite ?? Infinity;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;

  if (linhaA.length < lb + 1) {
    const tamanho = Math.max(lb + 1, linhaA.length * 2);
    linhaA = new Int32Array(tamanho);
    linhaB = new Int32Array(tamanho);
    linhaC = new Int32Array(tamanho);
  }
  let antepenultima = linhaA; // linha i - 2 (só vale a partir da 3ª linha)
  let anterior = linhaB; // linha i - 1
  let atual = linhaC; // linha i
  for (let j = 0; j <= lb; j++) anterior[j] = j;

  for (let i = 1; i <= la; i++) {
    const ca = a.charCodeAt(i - 1);
    const caAnterior = i > 1 ? a.charCodeAt(i - 2) : -1;
    atual[0] = i;
    let menorDaLinha = i;
    for (let j = 1; j <= lb; j++) {
      const cb = b.charCodeAt(j - 1);
      let v = anterior[j] + 1; // apagar
      const inserir = atual[j - 1] + 1;
      if (inserir < v) v = inserir;
      const trocar = anterior[j - 1] + (ca === cb ? 0 : 1);
      if (trocar < v) v = trocar;
      if (i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && caAnterior === cb) {
        const inverter = antepenultima[j - 2] + 1;
        if (inverter < v) v = inverter;
      }
      atual[j] = v;
      if (v < menorDaLinha) menorDaLinha = v;
    }
    // Nenhuma linha seguinte fica abaixo do menor valor desta: já passou do limite.
    if (menorDaLinha > max) return max + 1;
    const sobra = antepenultima;
    antepenultima = anterior;
    anterior = atual;
    atual = sobra;
  }
  return anterior[lb];
}

/** Função que devolve os campos de um item: o 1º é o campo principal (título/nome); os demais são secundários. null/undefined/"" são ignorados. */
export type CamposBusca<T> = (item: T) => ReadonlyArray<string | null | undefined>;

export type ModoBusca = "todos" | "exato" | "parecidos" | "nenhum";

export interface ResultadoBusca<T> {
  itens: T[];
  /** MENSAGEM_PARECIDOS no modo "parecidos", MENSAGEM_NENHUM no modo "nenhum", null nos outros. */
  mensagem: string | null;
  /** "todos": consulta vazia. "exato": bateram todas as palavras (algumas podem ter batido aproximadas). */
  modo: ModoBusca;
}

export interface OpcoesBusca {
  /** true: só filtra, mantém a ordem original (Kanban). Padrão false: ordena pela relevância. */
  manterOrdem?: boolean;
}

/** Itens preparados por `indexarBusca`. Só o que o chamador pode usar fica à mostra; o resto é interno. */
export interface IndiceBusca<T> {
  readonly itens: readonly T[];
}

interface CampoIndexado {
  principal: boolean;
  texto: string;
  /** `texto` sem espaços, para achar palavras coladas. */
  junto: string;
  /** Palavras únicas de `texto`. */
  palavras: readonly string[];
  /** `mascaraDeLetras` de cada palavra de `palavras`, na mesma posição. */
  mascaras: readonly number[];
}

interface IndiceInterno<T> extends IndiceBusca<T> {
  /** Os campos de cada item, na mesma posição de `itens`. */
  readonly campos: readonly (readonly CampoIndexado[])[];
}

/** Uma letra (ou dígito) por bit: dois símbolos podem cair no mesmo bit, o que só deixa o filtro de `aproxima` mais frouxo. */
function mascaraDeLetras(palavra: string): number {
  let mascara = 0;
  for (let i = 0; i < palavra.length; i++) mascara |= 1 << (palavra.charCodeAt(i) & 31);
  return mascara;
}

function contarBits(n: number): number {
  n -= (n >>> 1) & 0x55555555;
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Normaliza cada campo uma vez e guarda o texto sem espaços e as palavras únicas. Campos vazios saem do índice. */
export function indexarBusca<T>(itens: readonly T[], campos: CamposBusca<T>): IndiceBusca<T> {
  const copia = itens.slice();
  const indexados = copia.map((item) => {
    const lista: CampoIndexado[] = [];
    campos(item).forEach((valor, posicao) => {
      const texto = normalizarBusca(valor);
      if (!texto) return;
      const palavras = [...new Set(texto.split(" "))];
      lista.push({
        principal: posicao === 0,
        texto,
        junto: texto.includes(" ") ? texto.replaceAll(" ", "") : texto,
        palavras,
        mascaras: palavras.map(mascaraDeLetras),
      });
    });
    return lista;
  });
  const indice: IndiceInterno<T> = { itens: copia, campos: indexados };
  return indice;
}

// Categoria de uma palavra da busca dentro de um item (a melhor entre os campos).
const EXATO_PRINCIPAL = 0;
const EXATO_SECUNDARIO = 1;
const APROXIMADO_PRINCIPAL = 2;
const APROXIMADO_SECUNDARIO = 3;
const NAO_BATEU = 4;

/**
 * Alguma palavra do campo fica a até `lim` erros de `p` (inteira, ou só o começo dela se `p` for longa)?
 * Antes de calcular a distância, descarta a palavra que não tem letras de `p` demais: cada erro conserta no máximo uma
 * letra que falta, então se faltam mais de `lim` letras diferentes (e o começo da palavra só tem letras dela) não adianta
 * comparar. É só atalho: não muda o resultado.
 */
function aproxima(
  p: string,
  mascara: number,
  campo: CampoIndexado,
  lim: number,
  longa: boolean,
): boolean {
  const n = p.length;
  const { palavras, mascaras } = campo;
  for (let i = 0; i < palavras.length; i++) {
    if (contarBits(mascara & ~mascaras[i]) > lim) continue;
    const w = palavras[i];
    if (distanciaDL(p, w, lim) <= lim) return true;
    if (longa && w.length > n) {
      // Palavra digitada pela metade, com erro: compara com o começo das palavras maiores.
      if (distanciaDL(p, w.slice(0, n), lim) <= lim) return true;
      if (w.length > n + 1 && distanciaDL(p, w.slice(0, n + 1), lim) <= lim) return true;
    }
  }
  return false;
}

function categoriaDaPalavra(
  p: string,
  mascara: number,
  campos: readonly CampoIndexado[],
  lim: number,
): number {
  const longa = p.length >= TAMANHO_LONGA;
  let melhor = NAO_BATEU;
  for (const campo of campos) {
    // Num campo secundário não dá mais para passar de "exato num secundário".
    if (!campo.principal && melhor <= EXATO_SECUNDARIO) break;
    if (campo.texto.includes(p) || (longa && campo.junto.includes(p))) {
      const categoria = campo.principal ? EXATO_PRINCIPAL : EXATO_SECUNDARIO;
      if (categoria < melhor) melhor = categoria;
      if (melhor === EXATO_PRINCIPAL) break;
      continue;
    }
    const categoria = campo.principal ? APROXIMADO_PRINCIPAL : APROXIMADO_SECUNDARIO;
    if (lim > 0 && categoria < melhor && aproxima(p, mascara, campo, lim, longa))
      melhor = categoria;
  }
  return melhor;
}

interface Pontuacao {
  posicao: number;
  batidas: number;
  aproximadas: number;
  secundarias: number;
}

/**
 * Busca no índice. Cada palavra da consulta precisa aparecer em algum campo do item (como trecho do texto, colada ou
 * com erro de digitação). Devolve os itens que bateram todas as palavras; se não houver nenhum, os que bateram pelo
 * menos metade, com `mensagem`; se também não houver, lista vazia. Ordem: mais palavras batidas, menos aproximadas,
 * menos em campo secundário, ordem original (ou só a ordem original com `manterOrdem`).
 */
export function buscarNoIndice<T>(
  indice: IndiceBusca<T>,
  consulta: string | null | undefined,
  opcoes?: OpcoesBusca,
): ResultadoBusca<T> {
  const { itens, campos } = indice as IndiceInterno<T>;
  const palavras = palavrasDaBusca(consulta);
  const n = palavras.length;
  if (n === 0) return { itens: itens.slice(), modo: "todos", mensagem: null };

  const limites = palavras.map((p) => errosPermitidos(p.length));
  const mascaras = palavras.map(mascaraDeLetras);
  const pontuacoes: Pontuacao[] = [];
  let maisBatidas = 0;
  for (let posicao = 0; posicao < itens.length; posicao++) {
    const camposDoItem = campos[posicao];
    let batidas = 0;
    let aproximadas = 0;
    let secundarias = 0;
    for (let k = 0; k < n; k++) {
      const categoria = categoriaDaPalavra(palavras[k], mascaras[k], camposDoItem, limites[k]);
      if (categoria === NAO_BATEU) continue;
      batidas++;
      if (categoria === APROXIMADO_PRINCIPAL || categoria === APROXIMADO_SECUNDARIO) aproximadas++;
      if (categoria === EXATO_SECUNDARIO || categoria === APROXIMADO_SECUNDARIO) secundarias++;
    }
    if (batidas === 0) continue;
    pontuacoes.push({ posicao, batidas, aproximadas, secundarias });
    if (batidas > maisBatidas) maisBatidas = batidas;
  }

  let modo: ModoBusca;
  let escolhidas: Pontuacao[];
  if (maisBatidas === n) {
    modo = "exato";
    escolhidas = pontuacoes.filter((x) => x.batidas === n);
  } else if (maisBatidas >= 1 && maisBatidas * 2 >= n) {
    modo = "parecidos";
    escolhidas = pontuacoes.filter((x) => x.batidas * 2 >= n);
  } else {
    return { itens: [], modo: "nenhum", mensagem: MENSAGEM_NENHUM };
  }

  if (!opcoes?.manterOrdem) {
    escolhidas.sort(
      (x, y) =>
        y.batidas - x.batidas ||
        x.aproximadas - y.aproximadas ||
        x.secundarias - y.secundarias ||
        x.posicao - y.posicao,
    );
  }
  return {
    itens: escolhidas.map((x) => itens[x.posicao]),
    modo,
    mensagem: modo === "parecidos" ? MENSAGEM_PARECIDOS : null,
  };
}

/** Atalho: `buscarNoIndice(indexarBusca(itens, campos), consulta, opcoes)`. */
export function buscar<T>(
  itens: readonly T[],
  consulta: string | null | undefined,
  campos: CamposBusca<T>,
  opcoes?: OpcoesBusca,
): ResultadoBusca<T> {
  return buscarNoIndice(indexarBusca(itens, campos), consulta, opcoes);
}
