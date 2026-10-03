// Aba Instagram: contas (ig_contas), posts (ig_posts), mídias no R2 (módulo instagram) e chamadas à função instagram.
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { enviarR2 } from "@/lib/r2";
import type { Midia } from "@/lib/instagramPost";

export type ContaInstagram = Tables<"ig_contas">;
export type PostInstagram = Omit<Tables<"ig_posts">, "midias"> & { midias: Midia[] };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCAO = `${SUPABASE_URL}/functions/v1/instagram`;

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(FUNCAO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
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

export async function alternarOculta(contaId: string, oculta: boolean): Promise<void> {
  const { error } = await supabase.from("ig_contas").update({ oculta }).eq("id", contaId);
  if (error) throw error;
}

/** Últimos 200 posts (os mais novos primeiro). */
export async function fetchPosts(): Promise<PostInstagram[]> {
  const { data, error } = await supabase.from("ig_posts").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as PostInstagram[];
}

/** Pede à função para avançar a fila agora (sem esperar o relógio); erros ficam no próprio post. */
export const avancarFila = () => { chamar({ acao: "passo" }).catch(() => {}); };

export async function criarPost(novo: Omit<TablesInsert<"ig_posts">, "midias"> & { midias: Midia[] }): Promise<void> {
  const { error } = await supabase.from("ig_posts").insert(novo as TablesInsert<"ig_posts">);
  if (error) throw error;
  if (!novo.agendado_para || new Date(novo.agendado_para).getTime() <= Date.now() + 60_000) avancarFila();
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
    .update({ status: "agendado", erro: null, containers: null, agendado_para: quando, updated_at: new Date().toISOString() })
    .eq("id", post.id).eq("status", "erro").select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Este post não está mais com erro.");
  if (new Date(quando).getTime() <= Date.now() + 60_000) avancarFila();
}

/** Envia a mídia (já em JPG, se for imagem) ao R2 e devolve a chave `instagram/<uuid>.<ext>`. */
export async function enviarMidia(arquivo: Blob, ext: string, onProgresso?: (fracao: number) => void): Promise<string> {
  const caminho = `${crypto.randomUUID()}.${ext}`;
  await enviarR2("instagram", caminho, arquivo, arquivo.type || "application/octet-stream", onProgresso);
  return `instagram/${caminho}`;
}

/** Endereço fixo da mídia (a função r2 redireciona para um link assinado novo a cada acesso). */
export const urlDaMidia = (chave: string) => `${SUPABASE_URL}/functions/v1/r2?c=${encodeURIComponent(chave)}`;
