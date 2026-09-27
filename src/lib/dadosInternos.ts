// Aba "Dados internos": os 4 formulários públicos, as pastas deles no Drive e as regras puras da aba
// (nome e data do briefing, selo "Novo", modo de visualização, formatos de download e caminhos do .zip).
// Sem dependências: roda no navegador e no `node --test`.

export type FormularioId = "contrato" | "negocios" | "estrategia" | "catalogo";

export interface Formulario {
  id: FormularioId;
  /** Rótulo da sub-aba */
  aba: string;
  /** Rótulo do botão que copia o link */
  botao: string;
  link: string;
  /** Pasta do Drive onde o formulário grava (raiz da sub-aba) */
  pastaId: string;
  /** Nome da raiz na trilha */
  pastaNome: string;
}

/** Na ordem das sub-abas. */
export const FORMULARIOS: Formulario[] = [
  { id: "contrato", aba: "Dados para contrato", botao: "Contrato", link: "https://contrato.andrelopes.digital/", pastaId: "1YmeAImZbMPZn-ulPNdmPBovEI5spME9w", pastaNome: "Dados de contrato" },
  { id: "negocios", aba: "Briefing – Negócios", botao: "Negócios", link: "https://negocios.andrelopes.digital/", pastaId: "1DhKMgqex14a-RuMof3Jht5Jx7nEQDYuP", pastaNome: "Negócios" },
  { id: "estrategia", aba: "Briefing – Estratégia", botao: "Estratégia", link: "https://estrategia.andrelopes.digital/", pastaId: "1gH_-_h9Al1jSiO2zzPSh9gbwhkpR6ZIZ", pastaNome: "Estratégia" },
  { id: "catalogo", aba: "Catálogos – E-Commerce", botao: "Catálogo", link: "https://catalogo.andrelopes.digital/", pastaId: "1oLF5CdjoFhHotF9JYbykqiumUUy82fKm", pastaNome: "E-Commerce" },
];

/** Ordem dos botões de copiar link no topo da aba. */
export const ORDEM_BOTOES: FormularioId[] = ["contrato", "estrategia", "negocios", "catalogo"];

export function formularioPorId(id: FormularioId): Formulario {
  return FORMULARIOS.find((f) => f.id === id) ?? FORMULARIOS[0];
}

export function ehFormularioId(v: unknown): v is FormularioId {
  return typeof v === "string" && FORMULARIOS.some((f) => f.id === v);
}

export const MIME_PASTA = "application/vnd.google-apps.folder";
export const MIME_DOC = "application/vnd.google-apps.document";
export const MIME_PLANILHA = "application/vnd.google-apps.spreadsheet";
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Pastas de controle do formulário do Catálogo: nunca aparecem na aba nem entram no .zip. */
export const PASTAS_OCULTAS = ["_rascunhos", "_teste"];

export interface ItemDrive {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
  parents?: string[];
}

export interface AvisoFormulario {
  id: string;
  formulario: FormularioId;
  chave: string;
  titulo: string;
  drive_id: string | null;
  recebido_em: string;
  visto_em: string | null;
}

export const ehPasta = (i: Pick<ItemDrive, "mimeType">): boolean => i.mimeType === MIME_PASTA;

export function visivel(i: Pick<ItemDrive, "name" | "mimeType">): boolean {
  return !(ehPasta(i) && PASTAS_OCULTAS.includes(i.name));
}

export function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

const EXT_IMAGEM = ["jpg", "jpeg", "png", "webp", "gif"];
export function ehImagem(i: Pick<ItemDrive, "name" | "mimeType">): boolean {
  return /^image\/(jpeg|png|webp|gif)$/.test(i.mimeType) || EXT_IMAGEM.includes(extensao(i.name));
}

/**
 * Planilhas primeiro (a "Respostas — Dados de contrato" fica fixa no topo), depois pastas (modificação
 * mais recente primeiro: reenvio do catálogo sobe a loja) e por fim arquivos (mais novo primeiro).
 */
export function ordenarItens(itens: ItemDrive[]): ItemDrive[] {
  const grupo = (i: ItemDrive) => (i.mimeType === MIME_PLANILHA ? 0 : ehPasta(i) ? 1 : 2);
  return [...itens].sort((a, b) => {
    const g = grupo(a) - grupo(b);
    if (g) return g;
    const campo = grupo(a) === 1 ? "modifiedTime" : "createdTime";
    return Date.parse(b[campo]) - Date.parse(a[campo]);
  });
}

// ------------------------------------------------------------ nome e data dos briefings

const RE_BRIEFING = /^(.*) - (\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})\.txt$/i;

/** "JAO BOEIRA - 2026-08-25 15-26-20.txt" → título e data (o nome vem no horário de Brasília, UTC−3). */
export function lerNomeBriefing(nome: string): { titulo: string; data: Date | null } {
  const m = RE_BRIEFING.exec(nome.trim());
  if (!m) return { titulo: nome.trim().replace(/\.txt$/i, ""), data: null };
  const [, titulo, a, me, d, h, mi, s] = m;
  return { titulo: titulo.trim(), data: new Date(Date.UTC(+a, +me - 1, +d, +h + 3, +mi, +s)) };
}

const FORMATO_BR = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** "25/08/2026 15:26", sempre no horário de Brasília. */
export function formatarDataHora(d: Date): string {
  const p = Object.fromEntries(FORMATO_BR.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

const ehBriefing = (f: FormularioId) => f === "negocios" || f === "estrategia";

/** Título e data que a lista mostra para um item. */
export function rotuloDoItem(i: ItemDrive, formulario: FormularioId): { titulo: string; data: Date } {
  if (ehBriefing(formulario) && !ehPasta(i) && extensao(i.name) === "txt") {
    const b = lerNomeBriefing(i.name);
    return { titulo: b.titulo, data: b.data ?? new Date(i.createdTime) };
  }
  return { titulo: i.name, data: new Date(ehPasta(i) ? i.modifiedTime : i.createdTime) };
}

// ------------------------------------------------------------ selo "Novo" e contador

/** Sem acento, minúsculo, só letras e números separados por um espaço. */
export function normalizarNome(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const JANELA_ANTES_MS = 15 * 60_000;
const JANELA_DEPOIS_MS = 2 * 60_000;

/**
 * Itens da lista que ganham o selo "Novo": id do item → ids dos avisos não vistos que apontam para ele.
 * Contrato e catálogo apontam pelo id no Drive. Briefings (sem id) pelo nome do .txt criado entre 15 min
 * antes e 2 min depois do aviso; sem nome igual, o .txt mais recente dessa janela.
 */
export function novosNaLista(itens: ItemDrive[], avisos: AvisoFormulario[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  const marcar = (itemId: string, avisoId: string) => mapa.set(itemId, [...(mapa.get(itemId) ?? []), avisoId]);
  for (const a of avisos) {
    if (a.visto_em) continue;
    if (a.drive_id) {
      if (itens.some((i) => i.id === a.drive_id)) marcar(a.drive_id, a.id);
      continue;
    }
    const t = Date.parse(a.recebido_em);
    const naJanela = itens.filter((i) => {
      if (ehPasta(i)) return false;
      const c = Date.parse(i.createdTime);
      return c >= t - JANELA_ANTES_MS && c <= t + JANELA_DEPOIS_MS;
    });
    const alvo = normalizarNome(a.titulo);
    const peloNome = naJanela.filter((i) => normalizarNome(lerNomeBriefing(i.name).titulo) === alvo);
    const candidatos = peloNome.length ? peloNome : naJanela;
    const escolhido = candidatos.reduce<ItemDrive | null>(
      (m, i) => (!m || Date.parse(i.createdTime) > Date.parse(m.createdTime) ? i : m),
      null,
    );
    if (escolhido) marcar(escolhido.id, a.id);
  }
  return mapa;
}

/** Sub-aba que abre quando o endereço não diz qual: a primeira com novidade; senão a última usada. */
export function abaInicial(naoVistos: AvisoFormulario[], ultima: FormularioId | null): FormularioId {
  const comNovidade = FORMULARIOS.find((f) => naoVistos.some((a) => a.formulario === f.id && !a.visto_em));
  return comNovidade?.id ?? ultima ?? FORMULARIOS[0].id;
}

export function contarPorFormulario(avisos: AvisoFormulario[]): Record<FormularioId, number> {
  const c: Record<FormularioId, number> = { contrato: 0, negocios: 0, estrategia: 0, catalogo: 0 };
  for (const a of avisos) if (!a.visto_em && a.formulario in c) c[a.formulario]++;
  return c;
}

// ------------------------------------------------------------ ver e baixar

export type ModoVer = "briefing" | "texto" | "imagem" | "pdf" | "doc" | "planilha" | "nenhum";
const LIMITE_TEXTO = 2 * 1024 * 1024;

export function modoDoItem(i: Pick<ItemDrive, "name" | "mimeType" | "size">, formulario: FormularioId): ModoVer {
  if (i.mimeType === MIME_DOC) return "doc";
  if (i.mimeType === MIME_PLANILHA) return "planilha";
  const ext = extensao(i.name);
  if (i.mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (ehImagem(i)) return "imagem";
  const ehTexto = i.mimeType.startsWith("text/") || ["txt", "md", "csv", "json"].includes(ext);
  if (!ehTexto || Number(i.size ?? 0) > LIMITE_TEXTO) return "nenhum";
  return ehBriefing(formulario) && ext === "txt" ? "briefing" : "texto";
}

export interface FormatoDownload {
  rotulo: string;
  /** null = baixar o original (alt=media) */
  exportMime: string | null;
  /** extensão acrescentada ao nome (Docs e Planilhas não têm) */
  extensao: string | null;
}

/**
 * O primeiro é o padrão (usado no .zip). Arquivos comuns: o original. Docs/Planilhas: o Google converte.
 * Outros tipos do Google (formulário, desenho…): nenhum — só "Abrir no Google".
 */
export function formatosDeDownload(mimeType: string): FormatoDownload[] {
  if (mimeType === MIME_DOC) {
    return [
      { rotulo: "Word (.docx)", exportMime: MIME_DOCX, extensao: "docx" },
      { rotulo: "PDF", exportMime: "application/pdf", extensao: "pdf" },
    ];
  }
  if (mimeType === MIME_PLANILHA) {
    return [
      { rotulo: "Excel (.xlsx)", exportMime: MIME_XLSX, extensao: "xlsx" },
      { rotulo: "CSV", exportMime: "text/csv", extensao: "csv" },
    ];
  }
  if (mimeType.startsWith("application/vnd.google-apps.")) return [];
  return [{ rotulo: "Original", exportMime: null, extensao: null }];
}

/** Nome que o Windows aceita, para arquivo/pasta no computador e no .zip. */
export function nomeSeguro(nome: string): string {
  const limpo = nome.replace(/[\\/:*?"<>|\p{Cc}]/gu, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  return limpo || "sem nome";
}

export function nomeDoDownload(nome: string, formato: FormatoDownload): string {
  return nomeSeguro(formato.extensao ? `${nome}.${formato.extensao}` : nome);
}

const CONTA_GOOGLE = "contato@andrelopes.digital";

/** Link para abrir o item no Google já na conta contato@ (o Chrome do usuário abre por padrão em outra). */
export function linkNoGoogle(i: Pick<ItemDrive, "id" | "mimeType">): string {
  const base =
    i.mimeType === MIME_PASTA ? `https://drive.google.com/drive/folders/${i.id}`
    : i.mimeType === MIME_DOC ? `https://docs.google.com/document/d/${i.id}/edit`
    : i.mimeType === MIME_PLANILHA ? `https://docs.google.com/spreadsheets/d/${i.id}/edit`
    : `https://drive.google.com/file/d/${i.id}/view`;
  return `${base}?authuser=${encodeURIComponent(CONTA_GOOGLE)}`;
}

/** Id do arquivo num link do Google (coluna "Documento" da planilha do contrato). */
export function idDeLinkDoGoogle(url: string): string | null {
  const m = /^https:\/\/(?:docs|drive)\.google\.com\/(?:document|spreadsheets|file)\/d\/([\w-]{10,})/.exec(url.trim());
  return m ? m[1] : null;
}

// ------------------------------------------------------------ .zip e fotos do catálogo

/** Caminho ainda não usado no .zip ("a.jpg" repetido vira "a (2).jpg"; sem diferenciar caixa); registra em `usados`. */
export function caminhoUnico(caminho: string, usados: Set<string>): string {
  if (!usados.has(caminho.toLowerCase())) {
    usados.add(caminho.toLowerCase());
    return caminho;
  }
  const barra = caminho.lastIndexOf("/");
  const dir = caminho.slice(0, barra + 1);
  const arquivo = caminho.slice(barra + 1);
  const ponto = arquivo.lastIndexOf(".");
  const base = ponto > 0 ? arquivo.slice(0, ponto) : arquivo;
  const ext = ponto > 0 ? arquivo.slice(ponto) : "";
  for (let n = 2; ; n++) {
    const outro = `${dir}${base} (${n})${ext}`;
    if (!usados.has(outro.toLowerCase())) {
      usados.add(outro.toLowerCase());
      return outro;
    }
  }
}

/** Entrada do .zip para um arquivo (formato padrão); null = não entra (tipo do Google sem conversão). */
export function entradaDoZip(
  dir: string,
  item: Pick<ItemDrive, "name" | "mimeType">,
  usados: Set<string>,
): { caminho: string; formato: FormatoDownload } | null {
  const formato = formatosDeDownload(item.mimeType)[0];
  if (!formato) return null;
  return { caminho: caminhoUnico(`${dir}${nomeDoDownload(item.name, formato)}`, usados), formato };
}

/** Nome do produto a partir do nome da foto do Catálogo: "Camiseta - 01.jpg" → "Camiseta". */
export function nomeDoProduto(nomeArquivo: string): string {
  return nomeArquivo.replace(/\.[^.]+$/, "").replace(/ - \d{2,}$/, "").trim();
}
