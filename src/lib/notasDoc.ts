// Documento das notas (formato JSON do TipTap/ProseMirror). Regras puras: rodam no navegador e
// no `node --test`. A nota guarda o documento em `doc` e o texto puro em `conteudo` (busca, prévia
// do card e "Copiar").
import { arquivoDaImagemNota } from "./r2Chaves.ts";

export interface NoDoc {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NoDoc[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

/** Notas antigas (só texto): cada linha vira um parágrafo; linha vazia vira parágrafo vazio. */
export function textoParaDoc(texto: string): NoDoc {
  const linhas = (texto || "").replace(/\r\n/g, "\n").split("\n");
  return {
    type: "doc",
    content: linhas.map((l) => (l ? { type: "paragraph", content: [{ type: "text", text: l }] } : { type: "paragraph" })),
  };
}

function visitar(no: NoDoc | null | undefined, fn: (n: NoDoc) => void) {
  if (!no) return;
  fn(no);
  for (const filho of no.content ?? []) visitar(filho, fn);
}

/** Endereços de todas as imagens da nota, na ordem em que aparecem. */
export function imagensDoDoc(doc: NoDoc | null | undefined): string[] {
  const srcs: string[] = [];
  visitar(doc, (n) => {
    if (n.type === "image" && typeof n.attrs?.src === "string" && n.attrs.src) srcs.push(n.attrs.src);
  });
  return srcs;
}

export function primeiraImagem(doc: NoDoc | null | undefined): string | null {
  return imagensDoDoc(doc)[0] ?? null;
}

/**
 * Nome do arquivo de uma imagem que é nossa, no endereço antigo (Storage público do Supabase) ou no novo (função
 * r2). As de fora (coladas de um site) não são nossas e não se apagam: devolve null.
 */
export function caminhoNoBucket(src: string): string | null {
  return arquivoDaImagemNota(src);
}

/** Imagens nossas que estavam no documento antigo e saíram do novo (para apagar do Storage). */
export function imagensRemovidas(antes: NoDoc | null | undefined, depois: NoDoc | null | undefined): string[] {
  const ficam = new Set(imagensDoDoc(depois));
  return [...new Set(imagensDoDoc(antes))]
    .filter((src) => !ficam.has(src))
    .map((src) => caminhoNoBucket(src))
    .filter((c): c is string => !!c);
}

/**
 * Texto puro do documento: blocos separados por quebra de linha, colunas uma depois da outra,
 * imagem não entra. É o que vai para `conteudo`.
 */
export function textoDoDoc(doc: NoDoc | null | undefined): string {
  const blocos: string[] = [];
  const BLOCOS = new Set(["paragraph", "heading", "codeBlock"]);
  const textoDe = (n: NoDoc): string => {
    if (n.type === "text") return n.text ?? "";
    if (n.type === "hardBreak") return "\n";
    return (n.content ?? []).map(textoDe).join("");
  };
  visitar(doc, (n) => {
    if (BLOCOS.has(n.type)) blocos.push(textoDe(n));
  });
  // Tira linhas vazias das pontas e junta vazias repetidas
  return blocos.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Linha em volta da posição `i` do texto de um bloco (quebras de linha = "\n"): [início, fim), sem a quebra.
 * Texto colado costuma virar um parágrafo só com as linhas separadas por quebra; o clique triplo usa isto
 * para pegar a linha, não o parágrafo (que seria a nota inteira).
 */
export function limitesDaLinha(texto: string, i: number): [number, number] {
  const inicio = i > 0 ? texto.lastIndexOf("\n", i - 1) + 1 : 0;
  const fim = texto.indexOf("\n", i);
  return [inicio, fim < 0 ? texto.length : fim];
}

const LETRA = /[\p{L}\p{N}_]/u;

/** Palavra em volta da posição `i`: [início, fim). Fora de palavra devolve um trecho vazio. */
export function limitesDaPalavra(texto: string, i: number): [number, number] {
  let inicio = i;
  let fim = i;
  while (inicio > 0 && LETRA.test(texto[inicio - 1])) inicio--;
  while (fim < texto.length && LETRA.test(texto[fim])) fim++;
  return [inicio, fim];
}

/** Trechos da seleção múltipla: em ordem, os que se sobrepõem ou se encostam viram um, os vazios saem. */
export function juntarTrechos(trechos: [number, number][]): [number, number][] {
  const ordenados = trechos
    .map(([a, b]): [number, number] => (a <= b ? [a, b] : [b, a]))
    .filter(([a, b]) => a < b)
    .sort((x, y) => x[0] - y[0]);
  const juntos: [number, number][] = [];
  for (const [a, b] of ordenados) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else juntos.push([a, b]);
  }
  return juntos;
}

/** Documento sem texto e sem imagem (nota em branco). */
export function docVazio(doc: NoDoc | null | undefined): boolean {
  return !textoDoDoc(doc) && imagensDoDoc(doc).length === 0;
}
