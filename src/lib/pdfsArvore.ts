/**
 * Regras puras da aba PDFs (árvore de pastas, nomes e busca), sem Supabase nem alias "@/",
 * para rodar em `node --test`.
 */

export interface PdfPasta {
  id: string;
  nome: string;
  /** null = tema na raiz */
  parent_id: string | null;
  /** Hex; só os temas da raiz costumam ter cor, as subpastas herdam */
  cor: string | null;
  ordem: number;
}

export interface PastaNo extends PdfPasta {
  filhos: PastaNo[];
}

export const PASTA_CORES = ["#3b82f6", "#8b5cf6", "#10b981", "#64748b", "#f59e0b", "#06b6d4", "#f97316", "#f43f5e"];

const porOrdemENome = (a: PdfPasta, b: PdfPasta) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR");

/** Árvore ordenada. Uma pasta cujo pai não existe mais vira raiz, para nunca sumir da tela. */
export function montarArvore(pastas: PdfPasta[]): PastaNo[] {
  const nos = new Map<string, PastaNo>(pastas.map((p) => [p.id, { ...p, filhos: [] }]));
  const raizes: PastaNo[] = [];
  for (const no of nos.values()) {
    const pai = no.parent_id ? nos.get(no.parent_id) : undefined;
    if (pai) pai.filhos.push(no);
    else raizes.push(no);
  }
  const ordenar = (lista: PastaNo[]) => {
    lista.sort(porOrdemENome);
    lista.forEach((n) => ordenar(n.filhos));
  };
  ordenar(raizes);
  return raizes;
}

/** Pastas da raiz até `id` (inclusive). Vazio se o id não existir. */
export function caminhoDaPasta(pastas: PdfPasta[], id: string | null): PdfPasta[] {
  const porId = new Map(pastas.map((p) => [p.id, p]));
  const caminho: PdfPasta[] = [];
  const vistos = new Set<string>();
  let atual = id ? porId.get(id) : undefined;
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    caminho.unshift(atual);
    atual = atual.parent_id ? porId.get(atual.parent_id) : undefined;
  }
  return caminho;
}

/** A própria pasta e todas as que estão abaixo dela, em qualquer nível. */
export function idsDescendentes(pastas: PdfPasta[], id: string): Set<string> {
  const ids = new Set<string>([id]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of pastas) {
      if (p.parent_id && ids.has(p.parent_id) && !ids.has(p.id)) {
        ids.add(p.id);
        mudou = true;
      }
    }
  }
  return ids;
}

/** Quantidade de PDFs por pasta: `direto` só nela, `total` incluindo as subpastas. */
export function contarPdfsPorPasta(
  pastas: PdfPasta[],
  pdfs: { pasta_id: string }[],
): Map<string, { direto: number; total: number }> {
  const direto = new Map<string, number>();
  pdfs.forEach((f) => direto.set(f.pasta_id, (direto.get(f.pasta_id) || 0) + 1));
  const resultado = new Map<string, { direto: number; total: number }>();
  for (const p of pastas) {
    let total = 0;
    idsDescendentes(pastas, p.id).forEach((id) => (total += direto.get(id) || 0));
    resultado.set(p.id, { direto: direto.get(p.id) || 0, total });
  }
  return resultado;
}

/** Uma pasta não pode ser movida para dentro dela mesma nem de uma subpasta sua. */
export function podeMoverPasta(pastas: PdfPasta[], id: string, novoPai: string | null): boolean {
  return novoPai === null || !idsDescendentes(pastas, id).has(novoPai);
}

export interface OpcaoPasta {
  id: string;
  nome: string;
  nivel: number;
  caminho: string;
}

/** Lista achatada em ordem de árvore (para selects). `excluir` remove essa pasta e suas subpastas. */
export function opcoesDePasta(pastas: PdfPasta[], excluir?: string): OpcaoPasta[] {
  const fora = excluir ? idsDescendentes(pastas, excluir) : new Set<string>();
  const saida: OpcaoPasta[] = [];
  const visitar = (nos: PastaNo[], nivel: number, prefixo: string) => {
    for (const n of nos) {
      if (fora.has(n.id)) continue;
      const caminho = prefixo ? `${prefixo} / ${n.nome}` : n.nome;
      saida.push({ id: n.id, nome: n.nome, nivel, caminho });
      visitar(n.filhos, nivel + 1, caminho);
    }
  };
  visitar(montarArvore(pastas), 0, "");
  return saida;
}

/** Ordem para uma nova pasta: depois da última irmã. */
export function proximaOrdem(pastas: PdfPasta[], parentId: string | null): number {
  const irmas = pastas.filter((p) => (p.parent_id ?? null) === parentId);
  return irmas.length ? Math.max(...irmas.map((p) => p.ordem)) + 1 : 0;
}

/** PDF pelo tipo ou pela extensão (arquivos arrastados às vezes chegam sem tipo). */
export function ehPdf(arquivo: { name: string; type: string }): boolean {
  return arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name);
}

// ---------------------------------------------------------------- Tipos de arquivo (aba Arquivos)

export type TipoArquivo = "pdf" | "texto" | "planilha" | "apresentacao" | "documento" | "compactado" | "outro";

const EXTENSOES: Record<Exclude<TipoArquivo, "outro">, string[]> = {
  pdf: ["pdf"],
  texto: ["txt", "md", "markdown", "json", "log", "rtf", "xml", "yaml", "yml", "html", "htm"],
  planilha: ["csv", "tsv", "xls", "xlsx", "ods", "numbers"],
  apresentacao: ["ppt", "pptx", "odp", "key"],
  documento: ["doc", "docx", "odt", "pages", "epub"],
  compactado: ["zip", "rar", "7z", "tar", "gz"],
};
const EXT_IMAGEM = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif", "tif", "tiff", "avif", "ico"];
const EXT_VIDEO = ["mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv", "flv", "mpeg", "mpg", "3gp"];

/** Tipos de conteúdo para quando o navegador não informa (arrastar do Windows às vezes vem sem tipo). */
const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf", txt: "text/plain", md: "text/markdown", markdown: "text/markdown", csv: "text/csv",
  json: "application/json", html: "text/html", htm: "text/html", xml: "application/xml", rtf: "application/rtf",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation", epub: "application/epub+zip", zip: "application/zip",
};

/** "Relatório.PDF" → "pdf"; sem extensão → "". */
export function extensaoDe(nome: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(nome.trim());
  return m ? m[1].toLowerCase() : "";
}

export function tipoDoArquivo(nome: string): TipoArquivo {
  const ext = extensaoDe(nome);
  for (const [tipo, lista] of Object.entries(EXTENSOES)) if (lista.includes(ext)) return tipo as TipoArquivo;
  return "outro";
}

/** A aba guarda documentos: imagem e vídeo ficam de fora (pelo tipo ou pela extensão). */
export function arquivoAceito(arquivo: { name: string; type: string }): { ok: true } | { ok: false; motivo: "imagem" | "video" } {
  const ext = extensaoDe(arquivo.name);
  if (arquivo.type.startsWith("image/") || EXT_IMAGEM.includes(ext)) return { ok: false, motivo: "imagem" };
  if (arquivo.type.startsWith("video/") || EXT_VIDEO.includes(ext)) return { ok: false, motivo: "video" };
  return { ok: true };
}

export function contentTypeDe(arquivo: { name: string; type: string }): string {
  return arquivo.type || CONTENT_TYPES[extensaoDe(arquivo.name)] || "application/octet-stream";
}

export function nomeSemExtensao(arquivo: string): string {
  // Só tira quando é uma extensão de verdade ("v1.2 relatório" fica como está)
  return /\.[a-z0-9]{1,8}$/i.test(arquivo.trim()) && !/\s/.test(arquivo.trim().split(".").pop() || "")
    ? arquivo.trim().replace(/\.[a-z0-9]{1,8}$/i, "")
    : arquivo;
}

/**
 * Nome seguro para salvar no computador, com a extensão do arquivo original (`arquivoOriginal`;
 * sem ele, vale .pdf, o formato antigo da aba).
 */
export function nomeParaDownload(nome: string, arquivoOriginal = "arquivo.pdf"): string {
  const limpo = nome.replace(/[\\/:*?"<>|]/g, "-").trim() || "arquivo";
  const ext = extensaoDe(arquivoOriginal);
  if (!ext || extensaoDe(limpo) === ext) return limpo;
  return `${limpo}.${ext}`;
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Busca pelo nome dado, pelo nome original do arquivo ou pelo player. */
export function filtrarPdfs<T extends { nome: string; arquivo_nome: string; player?: string | null }>(pdfs: T[], busca: string): T[] {
  const termo = semAcento(busca.trim());
  if (!termo) return pdfs;
  return pdfs.filter((f) => [f.nome, f.arquivo_nome, f.player || ""].some((c) => semAcento(c).includes(termo)));
}

/** Cor da pasta: a própria ou a do ancestral mais próximo que tiver uma (subpastas herdam do tema). */
export function corDaPasta(pastas: PdfPasta[], id: string | null): string {
  const comCor = caminhoDaPasta(pastas, id).reverse().find((p) => p.cor && p.cor.startsWith("#"));
  return comCor?.cor || PASTA_CORES[3];
}
