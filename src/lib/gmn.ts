// Aba Google Meu Negócio: perfis, posts e chamadas à edge function `gmn`.
// O types.ts gerado ainda não conhece as tabelas novas: por isso `as any` nos `.from(...)`.
import { supabase } from "@/integrations/supabase/client";
import { cabecalhosDeAcesso } from "@/lib/googleDrive";
import { normalizarAgenda, normalizarBriefing, type Briefing, type ItemAgenda } from "../../supabase/functions/gmn/regras.ts";

/** Fase 1: nada é publicado no Google; o liga/desliga fica desabilitado até a API ser aprovada. */
export const PUBLICACAO_LIBERADA = false;

/** Fase 1: a aba só funciona no servidor local; no site publicado mostra "Em preparação". Tirar na Fase 2. */
export const ABA_LIBERADA = import.meta.env.DEV;

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
  imagem_origem: "drive" | "google" | "ia" | null;
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
  "cta_tipo, cta_url, drive_pasta_url, usa_ia_imagem, saude, briefing, briefing_salvo_em, created_at";
const CAMPOS_POST = "id, perfil_id, origem, status, tema, palavras_chave, texto, imagem_origem, imagem_url, google_url, erro, created_at";

function comBriefing(p: any): PerfilGmn {
  return { ...p, briefing: normalizarBriefing(p.briefing), agenda: normalizarAgenda(p.agenda) } as PerfilGmn;
}

/** Tabela ainda não criada no banco (migration pendente) vira uma mensagem clara. */
export function traduzErroGmn(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? "");
  if (/gmn_/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return "As tabelas do Google Meu Negócio ainda não existem no banco (migration 20260929120000_gmn.sql).";
  }
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

export async function gerarBriefingIa(perfilId: string, textoDadosInternos: string | null): Promise<Briefing> {
  const d = await chamar<{ briefing: unknown }>({ acao: "briefing", perfil_id: perfilId, texto_dados_internos: textoDadosInternos });
  return normalizarBriefing(d.briefing);
}

export async function gerarPrevia(perfilId: string): Promise<PostGmn> {
  const d = await chamar<{ post: PostGmn }>({ acao: "previa", perfil_id: perfilId });
  return d.post;
}
