// Regras puras da aba Fireflies (sem Supabase nem alias "@/": roda no `node --test`).
// As reuniões chegam importadas pelo worker da VPS em `fireflies_reunioes`; a aba só grava a intenção de
// renomear (`titulo_pendente`) ou excluir (`excluir = true`) e o worker aplica no Fireflies em ~1 minuto.
// Datas e horários são sempre os de Brasília, qualquer que seja o fuso do aparelho.
import { buscar, type ResultadoBusca } from "./search.ts";

export type StatusReuniao = "importando" | "pronto" | "erro";
/** O que o card mostra: o status do worker mais os pedidos da aba ainda não aplicados. */
export type Situacao = "importando" | "renomeando" | "excluindo" | "erro" | "pronto";
export type TipoArquivo = "transcricao" | "resumo";
export type FormatoArquivo = "pdf" | "docx";
export type ChaveArquivo = `${TipoArquivo}_${FormatoArquivo}`;
/** Caminhos dentro do bucket privado `fireflies` (ex.: "<id>/transcricao.pdf"). */
export type ArquivosReuniao = Partial<Record<ChaveArquivo, string>>;

export interface ReuniaoFireflies {
  /** id da transcrição no Fireflies */
  id: string;
  titulo: string;
  /** Nome pedido na aba, ainda não aplicado no Fireflies */
  titulo_pendente: string | null;
  /** Exclusão pedida na aba, ainda não aplicada no Fireflies */
  excluir: boolean;
  /** Início da reunião */
  data_hora: string | null;
  duracao_min: number | null;
  participantes: string[];
  organizador: string | null;
  link_meet: string | null;
  link_fireflies: string | null;
  arquivos: ArquivosReuniao;
  status: StatusReuniao;
  erro: string | null;
  created_at: string;
  updated_at: string;
}

export const FIREFLIES_BUCKET = "fireflies";
export const FUSO = "America/Sao_Paulo";

export const CAMPOS_REUNIAO =
  "id, titulo, titulo_pendente, excluir, data_hora, duracao_min, participantes, organizador, link_meet, link_fireflies, arquivos, status, erro, created_at, updated_at";

export const ROTULO_TIPO: Record<TipoArquivo, string> = { transcricao: "Transcrição", resumo: "Resumo" };

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  importando: "Importando…",
  renomeando: "Renomeando…",
  excluindo: "Excluindo…",
  erro: "Erro na importação",
  pronto: "",
};

export const CONTENT_TYPE: Record<FormatoArquivo, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const CHAVES_ARQUIVO: ChaveArquivo[] = ["transcricao_pdf", "transcricao_docx", "resumo_pdf", "resumo_docx"];
const STATUS_VALIDOS: StatusReuniao[] = ["importando", "pronto", "erro"];

// ---------------------------------------------------------------- Linha do banco

const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);

function arquivosDe(v: unknown): ArquivosReuniao {
  let obj = v;
  if (typeof obj === "string") {
    try { obj = JSON.parse(obj); } catch { return {}; }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const saida: ArquivosReuniao = {};
  for (const chave of CHAVES_ARQUIVO) {
    const caminho = (obj as Record<string, unknown>)[chave];
    if (typeof caminho === "string" && caminho.trim()) saida[chave] = caminho.trim();
  }
  return saida;
}

function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Converte a linha crua do Supabase no formato da aba, tolerando colunas vazias ou em formato inesperado. */
export function normalizarReuniao(linha: Record<string, unknown>): ReuniaoFireflies {
  const pendente = texto(linha.titulo_pendente);
  const status = texto(linha.status) as StatusReuniao | null;
  return {
    id: String(linha.id ?? ""),
    titulo: texto(linha.titulo) ?? "",
    titulo_pendente: pendente && pendente.trim() ? pendente : null,
    excluir: linha.excluir === true,
    data_hora: texto(linha.data_hora),
    duracao_min: numeroOuNulo(linha.duracao_min),
    participantes: Array.isArray(linha.participantes) ? linha.participantes.filter((p): p is string => typeof p === "string") : [],
    organizador: texto(linha.organizador),
    link_meet: texto(linha.link_meet),
    link_fireflies: texto(linha.link_fireflies),
    arquivos: arquivosDe(linha.arquivos),
    status: status && STATUS_VALIDOS.includes(status) ? status : "pronto",
    erro: texto(linha.erro),
    created_at: texto(linha.created_at) ?? "",
    updated_at: texto(linha.updated_at) ?? "",
  };
}

// ---------------------------------------------------------------- Nome e situação

/** O nome pedido na aba aparece na hora, antes de o worker confirmar no Fireflies. */
export function tituloExibido(r: Pick<ReuniaoFireflies, "titulo" | "titulo_pendente">): string {
  return r.titulo_pendente?.trim() || r.titulo.trim() || "Sem título";
}

/** Exclusão pedida vence tudo; depois o status do worker (importando/erro); depois o renomear pendente. */
export function situacao(r: Pick<ReuniaoFireflies, "excluir" | "status" | "titulo_pendente">): Situacao {
  if (r.excluir) return "excluindo";
  if (r.status === "importando") return "importando";
  if (r.status === "erro") return "erro";
  if (r.titulo_pendente?.trim()) return "renomeando";
  return "pronto";
}

/** Há algo que o worker ainda vai mudar: a aba se atualiza sozinha enquanto isso. */
export function precisaAtualizar(lista: ReuniaoFireflies[]): boolean {
  return lista.some((r) => {
    const s = situacao(r);
    return s === "importando" || s === "renomeando" || s === "excluindo";
  });
}

/**
 * De quanto em quanto tempo a aba confere o banco: renomear/excluir o usuário acabou de pedir e espera ver em
 * segundos (o worker aplica na hora pelo `URL_APLICAR_AGORA`); importação leva minutos. Nada pendente = não confere.
 */
export function intervaloAtualizacao(lista: ReuniaoFireflies[]): number | null {
  let importando = false;
  for (const r of lista) {
    const s = situacao(r);
    if (s === "renomeando" || s === "excluindo") return 3_000;
    if (s === "importando") importando = true;
  }
  return importando ? 15_000 : null;
}

/** Webhook do n8n que manda o worker aplicar agora os renomear/excluir pedidos (sem esperar o cron de 1 min). */
export const URL_APLICAR_AGORA = "https://prod.minuanoai.com.br/webhook/fireflies-pendencias";

export function linkFireflies(r: Pick<ReuniaoFireflies, "id" | "link_fireflies">): string {
  return r.link_fireflies?.trim() || `https://app.fireflies.ai/view/${encodeURIComponent(r.id)}`;
}

// ---------------------------------------------------------------- Datas (Brasília)

const formatoBrasilia = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

interface Partes { dia: string; mes: string; ano: string; hora: string; minuto: string }

function partesBrasilia(data: Date): Partes | null {
  if (Number.isNaN(data.getTime())) return null;
  const p: Record<string, string> = {};
  for (const x of formatoBrasilia.formatToParts(data)) p[x.type] = x.value;
  return { dia: p.day, mes: p.month, ano: p.year, hora: p.hour === "24" ? "00" : p.hour, minuto: p.minute };
}

const partesDoIso = (iso: string | null): Partes | null => (iso ? partesBrasilia(new Date(iso)) : null);

/** "25/09/2026" */
export function dataCurta(iso: string | null): string {
  const p = partesDoIso(iso);
  return p ? `${p.dia}/${p.mes}/${p.ano}` : "";
}

/** "14:00–14:45" (fim = início + duração); sem duração, só o início. */
export function horario(iso: string | null, duracaoMin: number | null): string {
  if (!iso) return "";
  const inicio = new Date(iso);
  const p = partesBrasilia(inicio);
  if (!p) return "";
  const ini = `${p.hora}:${p.minuto}`;
  const minutos = duracaoMin != null && Number.isFinite(duracaoMin) ? Math.round(duracaoMin) : 0;
  if (minutos <= 0) return ini;
  const f = partesBrasilia(new Date(inicio.getTime() + minutos * 60_000));
  return f ? `${ini}–${f.hora}:${f.minuto}` : ini;
}

/** "45 min", "1 h", "1 h 20 min" */
export function duracaoTexto(min: number | null): string {
  if (min == null || !Number.isFinite(min) || min <= 0) return "";
  const total = Math.round(min);
  if (total < 1) return "< 1 min";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ---------------------------------------------------------------- Arquivos

export function caminhoArquivo(r: Pick<ReuniaoFireflies, "arquivos">, tipo: TipoArquivo, formato: FormatoArquivo): string | null {
  return r.arquivos[`${tipo}_${formato}`] ?? null;
}

/**
 * Chave do arquivo no cache da sessão: o caminho no bucket não muda quando o worker gera os arquivos de novo
 * (renomear), mas o `updated_at` da linha muda — assim a prévia nunca mostra o arquivo antigo.
 */
export function chaveArquivo(r: Pick<ReuniaoFireflies, "arquivos" | "updated_at">, tipo: TipoArquivo, formato: FormatoArquivo): string | null {
  const caminho = caminhoArquivo(r, tipo, formato);
  return caminho ? `${caminho}|${r.updated_at}` : null;
}

/** Dá para ver/baixar: o arquivo existe, a importação terminou e a reunião não está sendo excluída. */
export function arquivoDisponivel(r: ReuniaoFireflies, tipo: TipoArquivo, formato: FormatoArquivo): boolean {
  return !!caminhoArquivo(r, tipo, formato) && r.status === "pronto" && !r.excluir;
}

/** Nome seguro para arquivo no Windows, Mac e iPhone (sem / \ : * ? " < > |). */
function nomeSeguro(s: string): string {
  const limpo = s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/(\S):(\s)/g, "$1 -$2")
    .replace(/:/g, "-")
    .replace(/"/g, "'")
    .replace(/[\\/|]/g, "-")
    .replace(/[*?<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .replace(/^[.\s]+|[.\s]+$/g, "");
  return limpo;
}

/** "Reunião de alinhamento — 25-09-2026 14-00 — Transcrição.pdf" */
export function nomeArquivo(r: ReuniaoFireflies, tipo: TipoArquivo, formato: FormatoArquivo): string {
  const titulo = nomeSeguro(tituloExibido(r)) || "Reunião";
  const p = partesDoIso(r.data_hora);
  const quando = p ? ` — ${p.dia}-${p.mes}-${p.ano} ${p.hora}-${p.minuto}` : "";
  return `${titulo}${quando} — ${ROTULO_TIPO[tipo]}.${formato}`;
}

// ---------------------------------------------------------------- Lista

/**
 * Busca tolerante (sem acento, sem maiúscula, com erro de digitação) no título exibido e depois no título do Fireflies
 * e nos participantes. Sem todas as palavras, mostra as reuniões parecidas (o resultado diz qual foi o caso); os mais
 * parecidos primeiro e, no empate, a ordem da lista.
 */
export function filtrar(lista: ReuniaoFireflies[], busca: string): ResultadoBusca<ReuniaoFireflies> {
  return buscar(lista, busca, (r) => [tituloExibido(r), r.titulo, ...r.participantes]);
}

const tempo = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Mais recente primeiro; sem data vão para o fim (entre elas, a importada por último primeiro). */
export function ordenar(lista: ReuniaoFireflies[]): ReuniaoFireflies[] {
  return [...lista].sort((a, b) => {
    const ta = tempo(a.data_hora);
    const tb = tempo(b.data_hora);
    if (ta !== tb) {
      if (ta === null) return 1;
      if (tb === null) return -1;
      return tb - ta;
    }
    return (tempo(b.created_at) ?? 0) - (tempo(a.created_at) ?? 0);
  });
}

/** Os primeiros participantes (sem repetidos nem vazios) e quantos ficam no "+N". */
export function resumoParticipantes(lista: string[], max = 3): { visiveis: string[]; resto: number } {
  const vistos = new Set<string>();
  const unicos: string[] = [];
  for (const p of lista) {
    const nome = p.trim();
    const chave = nome.toLowerCase();
    if (!nome || vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push(nome);
  }
  return { visiveis: unicos.slice(0, max), resto: Math.max(0, unicos.length - max) };
}

// ---------------------------------------------------------------- Erros

export function mensagemErroFireflies(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message || (e == null ? "" : String(e));
  if (!msg) return "Erro desconhecido";
  if (/fireflies/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return "A aba Fireflies ainda não está pronta no banco (falta a tabela fireflies_reunioes). Assim que ela for criada, as reuniões aparecem aqui.";
  }
  if (/bucket not found/i.test(msg)) return "O armazenamento dos arquivos do Fireflies (bucket \"fireflies\") ainda não foi criado.";
  if (/object not found|not_found/i.test(msg)) return "Arquivo não encontrado no armazenamento. Ele pode estar sendo gerado de novo: atualize em instantes.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Sem conexão com o servidor. Tente de novo em instantes.";
  if (msg === "{}") return "Não foi possível baixar o arquivo do armazenamento.";
  return msg;
}
