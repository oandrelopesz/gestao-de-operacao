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

/** Documento sem texto e sem imagem (nota em branco). */
export function docVazio(doc: NoDoc | null | undefined): boolean {
  return !textoDoDoc(doc) && imagensDoDoc(doc).length === 0;
}
