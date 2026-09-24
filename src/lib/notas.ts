// Aba Notas: anotações rápidas por tema (tabelas notas e nota_temas).
// O types.ts gerado ainda não conhece as tabelas novas: por isso `as any` nos `.from(...)`.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { NotaBase } from "@/lib/notasTexto";
import { BUCKET_IMAGENS_NOTAS, caminhoNoBucket, imagensDoDoc, type NoDoc } from "@/lib/notasDoc";
import type { ApiTemas, Tema } from "@/components/temas/TemasLista";

export interface Nota extends NotaBase {
  created_at: string;
  /** Documento formatado (editor); null nas notas antigas, que só têm texto */
  doc: NoDoc | null;
}

/** Disparado a cada mudança nos temas, para a aba e o Admin recarregarem. */
export const EVENTO_TEMAS_NOTAS = "notas-temas";

const temas = () => supabase.from("nota_temas" as any) as any;
const notas = () => supabase.from("notas" as any) as any;

function avisarTemas() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_TEMAS_NOTAS));
}

/** Tabela ainda não criada no banco (migration pendente) vira uma mensagem clara. */
export function traduzErroNotas(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? "");
  if (/(nota_temas|notas)/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return "As tabelas da aba Notas ainda não existem no banco (migration 20260924170000_notas.sql).";
  }
  return msg || "Erro ao salvar";
}

export async function fetchTemasNotas(): Promise<Tema[]> {
  const { data, error } = await temas().select("id, nome, hex, ordem").order("ordem").order("created_at");
  if (error) throw error;
  return (data || []) as Tema[];
}

export async function fetchNotas(): Promise<Nota[]> {
  const { data, error } = await notas().select("id, titulo, conteudo, doc, tema_id, created_at, updated_at");
  if (error) throw error;
  return (data || []) as Nota[];
}

type Campos = { titulo: string; conteudo: string; tema_id: string | null; doc?: NoDoc | null };

export async function criarNota(c: Campos): Promise<Nota> {
  const { data, error } = await notas()
    .insert([{ titulo: c.titulo.trim(), conteudo: c.conteudo, tema_id: c.tema_id, doc: c.doc ?? null }])
    .select("id, titulo, conteudo, doc, tema_id, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as Nota;
}

export async function atualizarNota(id: string, c: Campos): Promise<void> {
  const { error } = await notas()
    .update({ titulo: c.titulo.trim(), conteudo: c.conteudo, tema_id: c.tema_id, ...(c.doc !== undefined ? { doc: c.doc } : {}), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Várias notas de uma vez para um tema (ou Sem tema). Não mexe na data de edição. */
export async function moverNotas(ids: string[], tema_id: string | null): Promise<void> {
  if (!ids.length) return;
  const { error } = await notas().update({ tema_id }).in("id", ids);
  if (error) throw error;
}

/** Apaga as notas e as imagens delas (as que estão no nosso armazenamento). */
export async function excluirNotas(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { data } = await notas().select("doc").in("id", ids);
  const caminhos = ((data || []) as { doc: NoDoc | null }[])
    .flatMap((n) => imagensDoDoc(n.doc))
    .map((src) => caminhoNoBucket(src))
    .filter((c): c is string => !!c);
  const { error } = await notas().delete().in("id", ids);
  if (error) throw error;
  await removerImagensNotas(caminhos);
}

// ---------------------------------------------------------------- Imagens das notas

const LADO_MAXIMO = 1920;

/** Reduz para no máximo 1920 px e converte para WebP (GIF animado e SVG vão como estão). */
async function comprimir(arquivo: File): Promise<{ blob: Blob; ext: string; tipo: string }> {
  const original = { blob: arquivo as Blob, ext: (arquivo.name.split(".").pop() || "png").toLowerCase(), tipo: arquivo.type || "image/png" };
  if (/gif|svg/.test(arquivo.type) || typeof createImageBitmap === "undefined") return original;
  try {
    const bmp = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
    // Se o WebP ficar maior que o original (print pequeno), fica o original
    if (!blob || blob.size >= arquivo.size) return original;
    return { blob, ext: "webp", tipo: "image/webp" };
  } catch {
    return original;
  }
}

/** Sobe a imagem colada/arrastada e devolve o endereço público para o editor. */
export async function enviarImagemNota(arquivo: File): Promise<string> {
  if (!arquivo.type.startsWith("image/")) throw new Error("Só imagens podem entrar na nota");
  const { blob, ext, tipo } = await comprimir(arquivo);
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const caminho = `${id}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_IMAGENS_NOTAS).upload(caminho, blob, { contentType: tipo, upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error("O armazenamento das imagens das notas ainda não existe (migration 20260924210000_notas_editor.sql).");
    throw error;
  }
  return supabase.storage.from(BUCKET_IMAGENS_NOTAS).getPublicUrl(caminho).data.publicUrl;
}

export async function removerImagensNotas(caminhos: string[]): Promise<void> {
  if (!caminhos.length) return;
  await supabase.storage.from(BUCKET_IMAGENS_NOTAS).remove(caminhos).catch(() => {});
}

/** Operações de tema usadas pelo gerenciador de temas (aba Notas e Admin). */
export const apiTemasNotas: ApiTemas = {
  evento: EVENTO_TEMAS_NOTAS,
  item: { singular: "nota", plural: "notas", feminino: true },
  exemplo: "Ex.: Ideias de conteúdo",
  traduzErro: traduzErroNotas,
  fetchTemas: fetchTemasNotas,
  async contar() {
    const { data, error } = await notas().select("tema_id");
    if (error) throw error;
    const qtd: Record<string, number> = {};
    (data || []).forEach((x: { tema_id: string | null }) => { if (x.tema_id) qtd[x.tema_id] = (qtd[x.tema_id] || 0) + 1; });
    return qtd;
  },
  async criar(nome, hex) {
    const { data: ultimo, error: erroOrdem } = await temas().select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
    if (erroOrdem) throw erroOrdem;
    const { error } = await temas().insert([{ nome: nome.trim(), hex, ordem: ultimo ? ultimo.ordem + 1 : 0 }]);
    if (error) throw error;
    avisarTemas();
  },
  async atualizar(id, campos) {
    const { error } = await temas().update({ nome: campos.nome.trim(), hex: campos.hex }).eq("id", id);
    if (error) throw error;
    avisarTemas();
  },
  async excluir(id) {
    const { error } = await temas().delete().eq("id", id);
    if (error) throw error;
    avisarTemas();
  },
  async mover(lista, id, delta) {
    const idx = lista.findIndex((t) => t.id === id);
    const alvo = idx + delta;
    if (idx < 0 || alvo < 0 || alvo >= lista.length) return;
    const nova = [...lista];
    [nova[idx], nova[alvo]] = [nova[alvo], nova[idx]];
    const resultados = await Promise.all(nova.map((t, i) => temas().update({ ordem: i }).eq("id", t.id)));
    avisarTemas();
    const falha = resultados.find((r: { error: unknown }) => r.error);
    if (falha?.error) throw falha.error;
  },
};
