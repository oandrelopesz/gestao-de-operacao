// Aba Instagram: contas (ig_contas), posts (ig_posts), lugares (ig_locais), mídias no R2 (módulo instagram) e chamadas
// à função instagram.
import { supabase } from "@/integrations/supabase/client";
import { cabecalhosDaSessao } from "@/lib/acessoSessao";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { enviarR2, baixarComReserva } from "@/lib/r2";
import type { Midia, OpcoesPost } from "@/lib/instagramPost";

export type ContaInstagram = Tables<"ig_contas">;
export type PostInstagram = Omit<Tables<"ig_posts">, "midias" | "opcoes"> & { midias: Midia[]; opcoes: OpcoesPost };
export type NovoPost = Omit<TablesInsert<"ig_posts">, "midias" | "opcoes"> & { midias: Midia[]; opcoes?: OpcoesPost };
export type Lugar = { id: string; nome: string; endereco: string | null };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCAO = `${SUPABASE_URL}/functions/v1/instagram`;

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(FUNCAO, { method: "POST", headers: await cabecalhosDaSessao(), body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.erro ?? `A função instagram respondeu ${r.status}.`);
  return j as T;
}

export async function fetchContas(): Promise<ContaInstagram[]> {
  const { data, error } = await supabase.from("ig_contas").select("*").order("ativa", { ascending: false }).order("nome");
  if (error) throw error;
  return data ?? [];
}

export const sincronizarContas = () => chamar<{ contas: number; paginas: number }>({ acao: "sincronizar" });

/** Permissões que cada recurso da aba precisa no META_TOKEN. */
export const PERMISSOES_NECESSARIAS: { permissao: string; para: string }[] = [
  { permissao: "instagram_basic", para: "ler as contas do Instagram" },
  { permissao: "instagram_content_publish", para: "publicar no Instagram" },
  { permissao: "instagram_manage_comments", para: "primeiro comentário e desativar comentários (Instagram)" },
  { permissao: "instagram_manage_contents", para: "excluir post do Instagram" },
  { permissao: "pages_show_list", para: "ler as páginas" },
  { permissao: "pages_read_engagement", para: "ler as páginas e os lugares" },
  { permissao: "pages_manage_posts", para: "publicar e excluir no Facebook" },
  { permissao: "pages_manage_engagement", para: "primeiro comentário no Facebook" },
  { permissao: "pages_read_user_content", para: "primeiro comentário no Facebook (a Meta exige junto com a de cima)" },
  { permissao: "business_management", para: "contas dos parceiros da BM" },
];

/** O que o usuário do sistema pode fazer numa página (nomes do gerenciador de negócios). */
export const TAREFAS_PAGINA: Record<string, string> = {
  MANAGE: "Controle total",
  CREATE_CONTENT: "Conteúdo",
  MODERATE: "Atividade da comunidade",
  MESSAGING: "Mensagens",
  ADVERTISE: "Anúncios",
  ANALYZE: "Insights",
};

export type PaginaTarefas = { id: string; nome: string; tarefas: string[] };

export const conferirPermissoes = () =>
  chamar<{ valido: boolean; permissoes: string[]; paginas?: PaginaTarefas[] }>({ acao: "permissoes" });

export async function alternarOculta(contaId: string, oculta: boolean): Promise<void> {
  const { error } = await supabase.from("ig_contas").update({ oculta }).eq("id", contaId);
  if (error) throw error;
}

/** Últimos 300 posts (os mais novos primeiro). */
export async function fetchPosts(): Promise<PostInstagram[]> {
  const { data, error } = await supabase.from("ig_posts").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as PostInstagram[];
}

/** Pede à função para avançar a fila agora (sem esperar o relógio); erros ficam no próprio post. */
export const avancarFila = () => { chamar({ acao: "passo" }).catch(() => {}); };

const naHora = (iso?: string | null) => !iso || new Date(iso).getTime() <= Date.now() + 60_000;

/** Cria as linhas de um post (uma por rede e, no story, uma por mídia) e chama a fila se for para agora. */
export async function criarPosts(linhas: NovoPost[]): Promise<void> {
  const { error } = await supabase.from("ig_posts").insert(linhas as unknown as TablesInsert<"ig_posts">[]);
  if (error) throw error;
  if (linhas.some((l) => naHora(l.agendado_para))) avancarFila();
}

/**
 * Salva a edição nas linhas agendadas ou com erro (estas voltam para a fila, como um "tentar de novo" já corrigido);
 * devolve quantas mudaram.
 */
export async function salvarEdicao(ids: string[], campos: Partial<NovoPost>): Promise<number> {
  const { data, error } = await supabase.from("ig_posts")
    .update({ ...campos, status: "agendado", erro: null, aviso: null, containers: null, updated_at: new Date().toISOString() } as never)
    .in("id", ids).in("status", ["agendado", "erro"]).select("id");
  if (error) throw error;
  if (naHora(campos.agendado_para)) avancarFila();
  return data?.length ?? 0;
}

/** Só cancela se ainda não começou a ser enviado. */
export async function cancelarPost(id: string): Promise<void> {
  const { data, error } = await supabase.from("ig_posts").update({ status: "cancelado", updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "agendado").select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Este post já começou a ser enviado e não pode mais ser cancelado.");
}

/** Volta um post com erro para a fila (na hora, se o horário já passou). */
export async function tentarDeNovo(post: PostInstagram): Promise<void> {
  const quando = new Date(Math.max(Date.now(), new Date(post.agendado_para).getTime())).toISOString();
  const { data, error } = await supabase.from("ig_posts")
    .update({ status: "agendado", erro: null, aviso: null, containers: null, agendado_para: quando, updated_at: new Date().toISOString() })
    .eq("id", post.id).eq("status", "erro").select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Este post não está mais com erro.");
  if (naHora(quando)) avancarFila();
}

/** Tenta de novo o primeiro comentário que não saiu (o aviso some se der certo). */
export const comentarDeNovo = (id: string) => chamar<{ ok: boolean }>({ acao: "comentar", id });

/** Apaga na rede (Instagram ou Facebook) um post publicado pelo sistema. */
export const excluirPost = (id: string) => chamar<{ ok: boolean }>({ acao: "excluir", id });

/** Tira da lista um post cancelado, com erro ou excluído (não mexe na rede). */
export async function removerPost(id: string): Promise<void> {
  const { error } = await supabase.from("ig_posts").delete().eq("id", id).in("status", ["cancelado", "erro", "excluido"]);
  if (error) throw error;
}

// ------------------------------------------------------------------ lugares

export const buscarLocais = (q: string) => chamar<{ lugares: Lugar[] }>({ acao: "locais", q }).then((r) => r.lugares);
export const conferirLocal = (ref: string) => chamar<{ lugar: Lugar; sem_conferir?: boolean }>({ acao: "local", ref });

export async function fetchLocaisUsados(): Promise<Lugar[]> {
  const { data, error } = await supabase.from("ig_locais").select("id, nome, endereco").order("usado_em", { ascending: false }).limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function lembrarLocal(l: Lugar): Promise<void> {
  await supabase.from("ig_locais").upsert({ id: l.id, nome: l.nome, endereco: l.endereco, usado_em: new Date().toISOString() });
}

// ------------------------------------------------------------------ mídias

/** Envia a mídia ao R2 e devolve a chave `instagram/<uuid>.<ext>`. */
export async function enviarMidia(arquivo: Blob, ext: string, onProgresso?: (fracao: number) => void): Promise<string> {
  const caminho = `${crypto.randomUUID()}.${ext}`;
  await enviarR2("instagram", caminho, arquivo, arquivo.type || "application/octet-stream", onProgresso);
  return `instagram/${caminho}`;
}

/** Baixa uma mídia já enviada (para editar de novo um post agendado). */
export const baixarMidia = (chave: string) => baixarComReserva("instagram", chave.replace(/^instagram\//, ""));

/** Endereço fixo da mídia (a função r2 redireciona para um link assinado novo a cada acesso). */
export const urlDaMidia = (chave: string) => `${SUPABASE_URL}/functions/v1/r2?c=${encodeURIComponent(chave)}`;
