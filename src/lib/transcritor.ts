// Aba Transcritor: fila `transcricoes` (banco) + envio de arquivos direto ao orquestrador na VPS.
// O types.ts gerado ainda não conhece a tabela nova: por isso `as any` no `.from(...)`.
import { supabase } from "@/integrations/supabase/client";
import { idTokenEmCache, loginSilencioso } from "@/lib/googleAuth";
import { statusDoDrive } from "@/lib/googleDrive";
import { getConfig, setConfig } from "@/lib/appConfig";
import { moverVariosNaFila, novasPosicoes } from "@/lib/swipeFila";
import { expiraEmDias, plataformaDoLink, tipoDeArquivo, type StatusTranscricao } from "@/lib/transcritorTexto";
import { type Marcas, chaveTermo, textoDeMarcas } from "@/lib/transcritorMarcas";

/** Orquestrador na VPS (Traefik, sem proxy da Cloudflare para não limitar o tamanho do envio). */
export const URL_TRANSCRITOR = "https://transcritor.minuanoai.com.br";
const PARTE = 8 * 1024 * 1024;
const CAMPOS_LISTA =
  "id, nome, origem, link, arquivo_nome, plataforma, tamanho, status, posicao, progresso, idioma, duracao_seg, erro, tentativas, validade_dias, expira_em, created_at, iniciado_em, concluido_em";

export interface Transcricao {
  id: string;
  nome: string | null;
  origem: "link" | "arquivo";
  link: string | null;
  arquivo_nome: string | null;
  plataforma: string | null;
  tamanho: number | null;
  status: StatusTranscricao;
  posicao: number;
  progresso: number;
  idioma: string | null;
  duracao_seg: number | null;
  erro: string | null;
  tentativas: number;
  validade_dias: number;
  expira_em: string | null;
  created_at: string;
  iniciado_em: string | null;
  concluido_em: string | null;
}

// A tabela ainda não está nos tipos gerados do Supabase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = () => supabase.from("transcricoes" as any) as any;

export function traduzErroTranscritor(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? "");
  if (/transcricoes/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return "A tabela do Transcritor ainda não existe no banco (migration 20260924160000_transcricoes.sql).";
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Sem conexão com o servidor do Transcritor. Tente de novo em instantes.";
  return msg || "Erro no Transcritor";
}

/** Lista sem o texto (o texto é grande: vem sob demanda em `textos`). */
export async function fetchTranscricoes(): Promise<Transcricao[]> {
  const { data, error } = await tabela().select(CAMPOS_LISTA);
  if (error) throw error;
  return (data || []) as Transcricao[];
}

export async function textos(ids: string[]): Promise<{ id: string; nome: string | null; created_at: string; texto: string | null }[]> {
  if (!ids.length) return [];
  const { data, error } = await tabela().select("id, nome, created_at, texto").in("id", ids);
  if (error) throw error;
  return data || [];
}

export async function criarDeLinks(itens: { link: string; nome?: string }[]): Promise<void> {
  const base = Date.now();
  const { error } = await tabela().insert(
    itens.map((i, n) => ({
      origem: "link",
      link: i.link,
      nome: i.nome?.trim() || null,
      plataforma: plataformaDoLink(i.link),
      status: "aguardando",
      posicao: base + n,
    })),
  );
  if (error) throw error;
}

/** Cria a linha "enviando" do arquivo e devolve o id (o envio vem em seguida, com `enviarArquivo`). */
export async function criarDeArquivo(arquivo: File, nome?: string): Promise<string> {
  const tipo = tipoDeArquivo(arquivo.name, arquivo.type);
  if (!tipo) throw new Error(`"${arquivo.name}" não é áudio nem vídeo`);
  const { data, error } = await tabela()
    .insert([{ origem: "arquivo", arquivo_nome: arquivo.name, nome: nome?.trim() || null, plataforma: tipo, tamanho: arquivo.size, status: "enviando" }])
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Sem login do Google na aba: a página mostra o botão e retoma o envio depois. */
export class SemLoginGoogle extends Error {
  constructor() {
    super("Falta entrar com o Google (botão acima da fila)");
  }
}

/** ID token do "Entrar com Google" (o orquestrador só aceita a conta permitida). */
async function idToken(): Promise<string> {
  const emCache = idTokenEmCache();
  if (emCache) return emCache;
  const st = await statusDoDrive();
  const token = st.client_id ? await loginSilencioso(st.client_id) : null;
  if (!token) throw new SemLoginGoogle();
  return token;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envia o arquivo em partes de 8 MB. Se a conexão cair, pergunta ao servidor quanto já chegou e
 * continua dali (até 6 tentativas seguidas). `signal` cancela o envio.
 */
export async function enviarArquivo(
  id: string,
  arquivo: File,
  { onProgresso, signal }: { onProgresso?: (fracao: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  const url = `${URL_TRANSCRITOR}/uploads/${id}`;
  const cabecalhos = async () => ({ "x-google-id-token": await idToken() });
  const pedir = async (caminho: string, init: RequestInit) => {
    const r = await fetch(caminho, { ...init, signal, headers: { ...(init.headers || {}), ...(await cabecalhos()) } });
    const corpo = await r.json().catch(() => ({}));
    return { r, corpo };
  };

  let { r, corpo } = await pedir(url, { method: "POST" });
  if (!r.ok) throw new Error(corpo.erro || `Servidor respondeu ${r.status}`);
  let recebido: number = corpo.recebido ?? 0;
  let falhasSeguidas = 0;
  onProgresso?.(arquivo.size ? recebido / arquivo.size : 0);

  while (recebido < arquivo.size) {
    signal?.throwIfAborted();
    const parte = arquivo.slice(recebido, Math.min(recebido + PARTE, arquivo.size));
    try {
      ({ r, corpo } = await pedir(`${url}?offset=${recebido}`, { method: "PUT", body: parte }));
      if (r.status === 409 && typeof corpo.recebido === "number") {
        recebido = corpo.recebido; // o servidor já tinha parte disso: continua de onde ele está
        continue;
      }
      if (!r.ok) throw new Error(corpo.erro || `Servidor respondeu ${r.status}`);
      recebido = corpo.recebido;
      falhasSeguidas = 0;
      onProgresso?.(recebido / arquivo.size);
    } catch (e) {
      if (signal?.aborted || e instanceof SemLoginGoogle) throw e;
      if (++falhasSeguidas > 6) throw e;
      await espera(Math.min(30_000, 1000 * 2 ** falhasSeguidas));
      const consulta = await pedir(url, { method: "POST" }).catch(() => null);
      if (consulta?.r.ok) recebido = consulta.corpo.recebido ?? recebido;
    }
  }
  ({ r, corpo } = await pedir(`${url}/fim`, { method: "POST" }));
  if (!r.ok) throw new Error(corpo.erro || `Servidor respondeu ${r.status}`);
  onProgresso?.(1);
}

const naFila = ["aguardando", "baixando", "transcrevendo"];

export async function pausar(ids: string[]): Promise<void> {
  const { error } = await tabela().update({ status: "pausada", progresso: 0 }).in("id", ids).in("status", naFila);
  if (error) throw error;
}

/** Volta para o fim da fila (recomeça do zero; o arquivo enviado continua na VPS). */
export async function retomar(ids: string[]): Promise<void> {
  const base = Date.now();
  const resultados = await Promise.all(
    ids.map((id, n) => tabela().update({ status: "aguardando", posicao: base + n, progresso: 0, erro: null }).eq("id", id).eq("status", "pausada")),
  );
  const falha = resultados.find((r: { error: unknown }) => r.error);
  if (falha?.error) throw falha.error;
}

/** Link que falhou volta para a fila (arquivo não: ele já foi apagado da VPS). */
export async function tentarDeNovo(ids: string[]): Promise<void> {
  const { error } = await tabela()
    .update({ status: "aguardando", posicao: Date.now(), tentativas: 0, erro: null, expira_em: null, concluido_em: null, progresso: 0 })
    .in("id", ids)
    .eq("status", "falhou")
    .eq("origem", "link");
  if (error) throw error;
}

/** Cancelar (na fila) e excluir (prontas): apaga de vez. O orquestrador percebe e limpa a VPS. */
export async function excluir(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await tabela().delete().in("id", ids);
  if (error) throw error;
}

export async function renomear(id: string, nome: string): Promise<void> {
  const { error } = await tabela().update({ nome: nome.trim() || null }).eq("id", id);
  if (error) throw error;
}

/** Validade de 1 a 15 dias a partir de agora (renovável quantas vezes quiser). */
export async function definirValidade(ids: string[], dias: number): Promise<void> {
  const { error } = await tabela().update({ validade_dias: dias, expira_em: expiraEmDias(dias) }).in("id", ids);
  if (error) throw error;
}

async function gravarPosicoes(aguardando: Transcricao[], ordemIds: string[]): Promise<void> {
  const mudancas = novasPosicoes(
    aguardando.map((t) => ({ id: t.id, item_id: t.id, posicao: t.posicao, created_at: t.created_at, status: "aguardando" as const, iniciado_em: null, tipo: "download" as const })),
    ordemIds,
  );
  const resultados = await Promise.all(mudancas.map((m) => tabela().update({ posicao: m.posicao }).eq("id", m.id).eq("status", "aguardando")));
  const falha = resultados.find((r: { error: unknown }) => r.error);
  if (falha?.error) throw falha.error;
}

export function reordenar(aguardando: Transcricao[], ordemIds: string[]): Promise<void> {
  return gravarPosicoes(aguardando, ordemIds);
}

export function moverPara(aguardando: Transcricao[], ids: string[], destino: "topo" | "fim"): Promise<void> {
  return gravarPosicoes(aguardando, moverVariosNaFila(aguardando.map((t) => t.id), ids, destino));
}

// ---------------------------------------------------------------- Glossário (Admin)

export const CHAVE_GLOSSARIO = "transcritor_glossario";
export const lerGlossario = () => getConfig<string[]>(CHAVE_GLOSSARIO, []);
export const salvarGlossario = (termos: string[]) => setConfig(CHAVE_GLOSSARIO, [...new Set(termos.map((t) => t.trim()).filter(Boolean))]);

/** Áudio da transcrição (o orquestrador serve com Range; o player usa esta URL). */
export const urlAudio = (id: string) => `${URL_TRANSCRITOR}/audio/${id}.m4a`;

/** Texto e marcas (palavras com tempo) de uma transcrição. */
export async function detalhe(id: string): Promise<{ texto: string | null; marcas: Marcas | null }> {
  const { data, error } = await tabela().select("texto, marcas").eq("id", id).maybeSingle();
  if (error) throw error;
  return data || { texto: null, marcas: null };
}

/** Grava as marcas e o texto que sai delas (o texto fica igual ao que o player mostra). */
export async function salvarMarcas(id: string, marcas: Marcas): Promise<void> {
  const { error } = await tabela().update({ marcas, texto: textoDeMarcas(marcas) }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- Memória de termos

export interface Termo {
  id: string;
  de: string;
  para: string;
  origem: "manual" | "ia";
  vezes: number;
  updated_at: string;
}

// A tabela ainda não está nos tipos gerados do Supabase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabelaTermos = () => supabase.from("transcritor_termos" as any) as any;

/** Mais usados primeiro; empate: o mais recente. */
export async function listarTermos(): Promise<Termo[]> {
  const { data, error } = await tabelaTermos()
    .select("id, de, para, origem, vezes, updated_at")
    .order("vezes", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Termo[];
}

/** Correção feita à mão: vale sempre nas próximas transcrições. */
export async function registrarTermoManual(de: string, para: string): Promise<void> {
  const d = de.trim();
  const p = para.trim();
  if (!d || !p) throw new Error("Preencha como sai e o certo");
  const chave = chaveTermo(d);
  if (!chave) throw new Error("Como sai precisa ter letras ou números");
  const { error } = await supabase.rpc("registrar_termos" as any, { itens: [{ chave, de: d, para: p, origem: "manual" }] });
  if (error) throw error;
}

export async function excluirTermo(id: string): Promise<void> {
  const { error } = await tabelaTermos().delete().eq("id", id);
  if (error) throw error;
}
