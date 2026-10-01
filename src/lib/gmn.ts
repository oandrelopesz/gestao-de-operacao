// Aba Google Meu Negócio: perfis, posts e chamadas à edge function `gmn`.
// O types.ts gerado ainda não conhece as tabelas novas: por isso `as any` nos `.from(...)`.
import { supabase } from "@/integrations/supabase/client";
import { cabecalhosDeAcesso } from "@/lib/googleDrive";
import { blobParaBase64, normalizarLogo } from "@/lib/gmnImagem";
import {
  normalizarAgenda, normalizarBriefing, normalizarImagensSite, opcoesDaLogo,
  type Briefing, type FundoLogo, type ImagemSite, type ItemAgenda, type PosicaoLogo, type TamanhoLogo,
} from "../../supabase/functions/gmn/regras.ts";

/** Fase 1: nada é publicado no Google; o liga/desliga fica desabilitado até a API ser aprovada. */
export const PUBLICACAO_LIBERADA = false;

/**
 * Aba no site desde 01/10/2026, em modo de teste (pedido do André, para validar o layout com um cliente real): perfis,
 * contexto e prévias funcionam; nada vai para o Google e o liga/desliga segue travado (PUBLICACAO_LIBERADA).
 */
export const ABA_LIBERADA = true;

export type CtaTipo = "LEARN_MORE" | "CALL" | "BOOK";

export interface PerfilGmn {
  id: string;
  location_name: string | null;
  nome: string;
  endereco: string | null;
  categoria: string | null;
  site: string | null;
  telefone: string | null;
  cliente_id: string | null;
  ativo: boolean;
  sem_acesso: boolean;
  agenda: ItemAgenda[];
  cta_tipo: CtaTipo;
  cta_url: string | null;
  drive_pasta_url: string | null;
  usa_ia_imagem: boolean;
  /** Contexto completo do cliente, colado pelo André; vai inteiro para o prompt de cada post. */
  contexto_posts: string | null;
  /** Diretrizes de imagem do cliente; entram no prompt de toda imagem gerada pela IA. */
  contexto_imagens: string | null;
  /** URL pública da logo do cliente (R2). */
  logo_url: string | null;
  logo_posicao: PosicaoLogo;
  logo_tamanho: TamanhoLogo;
  logo_fundo: FundoLogo;
  /** URL do site de onde a logo veio (a caixa "Usar esta logo" aparece marcada nela); null se foi enviada do computador. */
  logo_origem_url: string | null;
  /** Imagens do site marcadas para os posts (gravadas na hora, fora do "Salvar imagens"). */
  imagens_site: ImagemSite[];
  /** Só o André liga: com isso desligado a IA nunca gera pessoas nas imagens. */
  permitir_pessoas_ia: boolean;
  saude: boolean;
  briefing: Briefing;
  briefing_salvo_em: string | null;
  created_at: string;
}

export interface PostGmn {
  id: string;
  perfil_id: string;
  origem: "agenda" | "manual" | "previa";
  status: "agendado" | "gerando" | "gerado" | "publicado" | "erro" | "pulado";
  tema: string | null;
  palavras_chave: string[];
  texto: string | null;
  imagem_origem: "drive" | "google" | "ia" | "site" | null;
  imagem_url: string | null;
  google_url: string | null;
  erro: string | null;
  created_at: string;
}

export interface ClienteOpcao { id: string; nome: string }

const perfis = () => supabase.from("gmn_perfis" as any) as any;
const posts = () => supabase.from("gmn_posts" as any) as any;
const FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmn`;

const CAMPOS_PERFIL =
  "id, location_name, nome, endereco, categoria, site, telefone, cliente_id, ativo, sem_acesso, agenda, " +
  "cta_tipo, cta_url, drive_pasta_url, usa_ia_imagem, contexto_posts, contexto_imagens, logo_url, permitir_pessoas_ia, " +
  "logo_posicao, logo_tamanho, logo_fundo, logo_origem_url, imagens_site, " +
  "saude, briefing, briefing_salvo_em, created_at";
const CAMPOS_POST = "id, perfil_id, origem, status, tema, palavras_chave, texto, imagem_origem, imagem_url, google_url, erro, created_at";

function comBriefing(p: any): PerfilGmn {
  const logo = opcoesDaLogo(p);
  return {
    ...p, briefing: normalizarBriefing(p.briefing), agenda: normalizarAgenda(p.agenda),
    logo_posicao: logo.posicao, logo_tamanho: logo.tamanho, logo_fundo: logo.fundo,
    // Linha sem a chave (mock, consulta antiga) vale como "logo enviada do computador".
    logo_origem_url: typeof p.logo_origem_url === "string" ? p.logo_origem_url : null,
    imagens_site: normalizarImagensSite(p.imagens_site),
  } as PerfilGmn;
}

/** Tabela ou coluna ainda não criada no banco (migration pendente) e falha de rede viram uma mensagem clara. */
export function traduzErroGmn(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? "");
  const faltaNoBanco = /schema cache|does not exist|not find/i.test(msg);
  // As colunas do contexto, da logo e das pessoas nas imagens vieram numa migration própria.
  if (faltaNoBanco && /contexto_posts|contexto_imagens|logo_url|permitir_pessoas_ia/i.test(msg)) {
    return "As colunas novas do Google Meu Negócio (contexto, logo e pessoas nas imagens) ainda não existem no banco (migration 20261001120000_gmn_contexto.sql).";
  }
  // As opções da logo e as imagens do site vieram na migration das imagens.
  if (faltaNoBanco && /logo_posicao|logo_tamanho|logo_fundo|logo_origem_url|imagens_site/i.test(msg)) {
    return "As colunas novas das imagens do Google Meu Negócio (opções da logo e imagens do site) ainda não existem no banco (migration 20261001170000_gmn_imagens.sql).";
  }
  if (/gmn_/i.test(msg) && faltaNoBanco) {
    return "As tabelas do Google Meu Negócio ainda não existem no banco (migration 20260929120000_gmn.sql).";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return "Não foi possível falar com o servidor. Confira a conexão e tente de novo.";
  return msg || "Erro inesperado";
}

export async function fetchPerfis(): Promise<PerfilGmn[]> {
  const { data, error } = await perfis().select(CAMPOS_PERFIL).order("nome");
  if (error) throw error;
  return (data || []).map(comBriefing);
}

export async function fetchClientesOpcoes(): Promise<ClienteOpcao[]> {
  const { data, error } = await supabase.from("clientes").select("id, nome, arquivado").order("nome");
  if (error) throw error;
  return (data || []).filter((c: any) => !c.arquivado).map((c: any) => ({ id: c.id, nome: c.nome }));
}

export async function criarPerfil(nome: string, cliente_id: string | null): Promise<PerfilGmn> {
  const { data, error } = await perfis().insert([{ nome: nome.trim(), cliente_id }]).select(CAMPOS_PERFIL).single();
  if (error) throw error;
  return comBriefing(data);
}

export async function salvarPerfil(id: string, patch: Partial<PerfilGmn>): Promise<void> {
  const { error } = await perfis().update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function salvarBriefing(id: string, b: Briefing): Promise<string> {
  const agora = new Date().toISOString();
  const { error } = await perfis().update({ briefing: normalizarBriefing(b), briefing_salvo_em: agora, updated_at: agora }).eq("id", id);
  if (error) throw error;
  return agora;
}

export async function excluirPerfil(id: string): Promise<void> {
  const { error } = await perfis().delete().eq("id", id);
  if (error) throw error;
}

export async function fetchPosts(perfilId: string): Promise<PostGmn[]> {
  const { data, error } = await posts().select(CAMPOS_POST).eq("perfil_id", perfilId).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []) as PostGmn[];
}

export interface UltimoPost { status: PostGmn["status"]; origem: PostGmn["origem"]; created_at: string; erro: string | null }

/** Último post (inclusive prévia) de cada perfil. */
export async function fetchUltimosPosts(): Promise<Record<string, UltimoPost>> {
  const { data, error } = await posts().select("perfil_id, status, origem, created_at, erro").order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  const ultimos: Record<string, UltimoPost> = {};
  for (const r of (data || []) as (UltimoPost & { perfil_id: string })[]) {
    // a lista vem do mais novo para o mais antigo: o primeiro de cada perfil é o último post
    if (!ultimos[r.perfil_id]) ultimos[r.perfil_id] = { status: r.status, origem: r.origem, created_at: r.created_at, erro: r.erro };
  }
  return ultimos;
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const headers = await cabecalhosDeAcesso();
  const r = await fetch(FUNCAO, { method: "POST", headers, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `A função gmn respondeu ${r.status}`);
  return d as T;
}

/**
 * Pede à função um briefing. Com `contextoPosts`, ela extrai os campos desse texto (o da tela, ainda não salvo);
 * sem ele, usa o contexto salvo do perfil, se houver.
 */
export async function gerarBriefingIa(perfilId: string, textoDadosInternos: string | null, contextoPosts?: string | null): Promise<Briefing> {
  const corpo: Record<string, unknown> = { acao: "briefing", perfil_id: perfilId, texto_dados_internos: textoDadosInternos };
  if (typeof contextoPosts === "string") corpo.contexto_posts = contextoPosts;
  const d = await chamar<{ briefing: unknown }>(corpo);
  return normalizarBriefing(d.briefing);
}

/** `comImagem` falso gera só texto: a função não busca nem gera imagem. */
export async function gerarPrevia(perfilId: string, comImagem = true): Promise<PostGmn> {
  const d = await chamar<{ post: PostGmn }>({ acao: "previa", perfil_id: perfilId, com_imagem: comImagem });
  return d.post;
}

/** Converte a imagem (qualquer formato que o navegador abre) para PNG e grava como a logo do perfil. */
export async function enviarLogo(perfilId: string, arquivo: Blob, origemUrl: string | null = null): Promise<string> {
  const png = await normalizarLogo(arquivo);
  const base64 = await blobParaBase64(png);
  const d = await chamar<{ logo_url: string }>({ acao: "logo", perfil_id: perfilId, tipo: "image/png", base64, origem_url: origemUrl });
  return d.logo_url;
}

/** Tira a logo do perfil (o arquivo antigo pode ficar no armazenamento). */
export async function removerLogo(perfilId: string): Promise<void> {
  await chamar<{ ok: boolean }>({ acao: "remover_logo", perfil_id: perfilId });
}
