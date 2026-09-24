// Regras puras da aba Transcritor (sem dependências de Supabase nem alias "@/": roda no `node --test`).
import { detectarRede, redeLabel } from "./swipeRedes.ts";

export type StatusTranscricao = "enviando" | "aguardando" | "baixando" | "transcrevendo" | "pronta" | "falhou" | "pausada";
export type OrdemProntas = "recentes" | "az" | "za";

export const VALIDADE_PADRAO = 3;
export const VALIDADE_MAX = 15;

/** Plataforma do link (mesmos ids do swipe file, que o worker usa para escolher os cookies). */
export function plataformaDoLink(link: string): string {
  const r = detectarRede(link);
  return !r || r === "internet" ? "outro" : r;
}

const EXT_AUDIO = ["mp3", "m4a", "wav", "ogg", "oga", "opus", "aac", "flac", "wma", "amr", "aiff", "aif", "caf", "weba"];
const EXT_VIDEO = ["mp4", "mov", "mkv", "webm", "avi", "m4v", "3gp", "mpeg", "mpg", "wmv", "flv", "ts", "mts"];

export function extensao(nome: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(nome.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Áudio ou vídeo que dá para transcrever (pela extensão ou, sem ela, pelo tipo). `null` = não serve. */
export function tipoDeArquivo(nome: string, mime: string): "audio" | "video" | null {
  const ext = extensao(nome);
  if (EXT_AUDIO.includes(ext)) return "audio";
  if (EXT_VIDEO.includes(ext)) return "video";
  if (!ext || !/\./.test(nome)) {
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
  }
  return null;
}

const dois = (n: number) => String(n).padStart(2, "0");
function dataHora(iso: string): { data: string; hora: string } {
  const d = new Date(iso);
  return { data: `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`, hora: `${dois(d.getHours())}:${dois(d.getMinutes())}` };
}

export function nomeExibido(t: { nome: string | null; created_at: string }): string {
  const nome = t.nome?.trim();
  if (nome) return nome;
  const { data, hora } = dataHora(t.created_at);
  return `Sem nome · ${data} ${hora}`;
}

function diaLocal(d: Date): number {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
}

/** "expira hoje às 18:30" / "expira amanhã às 09:00" / "expira em 3 dias (27/09)". */
export function rotuloValidade(expiraEm: string | null, agora: Date = new Date()): string {
  if (!expiraEm) return "";
  const fim = new Date(expiraEm);
  const dias = Math.round((new Date(fim.getFullYear(), fim.getMonth(), fim.getDate()).getTime() - new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime()) / 86_400_000);
  const { data, hora } = dataHora(expiraEm);
  if (dias <= 0 || diaLocal(fim) === diaLocal(agora)) return `expira hoje às ${hora}`;
  if (dias === 1) return `expira amanhã às ${hora}`;
  return `expira em ${dias} dias (${data})`;
}

/** Nova data de expiração: `dias` (1–15) a partir de agora. */
export function expiraEmDias(dias: number, agora: Date = new Date()): string {
  if (!Number.isInteger(dias) || dias < 1 || dias > VALIDADE_MAX) throw new Error(`Validade deve ser de 1 a ${VALIDADE_MAX} dias`);
  return new Date(agora.getTime() + dias * 86_400_000).toISOString();
}

export function ordenarProntas<T extends { nome: string | null; created_at: string }>(lista: T[], modo: OrdemProntas): T[] {
  const copia = [...lista];
  if (modo === "recentes") return copia.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const r = copia.sort((a, b) => nomeExibido(a).localeCompare(nomeExibido(b), "pt-BR", { sensitivity: "base" }));
  return modo === "za" ? r.reverse() : r;
}

const IDIOMAS: Record<string, string> = {
  pt: "Português", en: "Inglês", es: "Espanhol", fr: "Francês", it: "Italiano", de: "Alemão", ja: "Japonês", zh: "Chinês",
};

/** Código do Whisper ("pt") → nome para mostrar ("Português"). */
export function nomeIdioma(codigo: string | null | undefined): string {
  if (!codigo) return "";
  return IDIOMAS[codigo.toLowerCase()] ?? codigo.toUpperCase();
}

export function formatarDuracao(seg: number | null | undefined): string {
  if (seg == null || !Number.isFinite(seg)) return "";
  const s = Math.round(seg);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h ${dois(m)}min`;
  if (m) return `${m}min ${dois(r)}s`;
  return `${r}s`;
}

export function rotuloPlataforma(t: { origem: string; plataforma: string | null; arquivo_nome?: string | null }): string {
  if (t.origem === "arquivo") {
    const ext = extensao(t.arquivo_nome ?? "").toUpperCase();
    const tipo = t.plataforma === "video" ? "Vídeo" : "Áudio";
    return ext ? `${tipo} · ${ext}` : tipo;
  }
  return t.plataforma && t.plataforma !== "outro" ? redeLabel(t.plataforma).replace(/ \(.*\)$/, "") : "Link";
}

const EM_ANDAMENTO: string[] = ["enviando", "baixando", "transcrevendo"];

/** Separa a lista em: em andamento, fila (por posição), pausadas e concluídas (prontas e falhas). */
export function separarTranscricoes<T extends { status: string; posicao: number; created_at: string }>(lista: T[]) {
  const porPosicao = (a: T, b: T) => a.posicao - b.posicao || a.created_at.localeCompare(b.created_at);
  return {
    andamento: lista.filter((t) => EM_ANDAMENTO.includes(t.status)).sort((a, b) => EM_ANDAMENTO.indexOf(a.status) - EM_ANDAMENTO.indexOf(b.status)),
    aguardando: lista.filter((t) => t.status === "aguardando").sort(porPosicao),
    pausadas: lista.filter((t) => t.status === "pausada").sort(porPosicao),
    concluidas: lista.filter((t) => t.status === "pronta" || t.status === "falhou"),
  };
}
