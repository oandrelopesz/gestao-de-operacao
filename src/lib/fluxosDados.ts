// Aba Fluxogramas: quadros (tabela fluxos), temas (fluxo_temas) e imagens coladas (bucket privado "fluxogramas").
// O types.ts gerado ainda não conhece as tabelas novas: por isso `as any` nos `.from(...)`.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { extensaoDoMime, lerCena, type ArquivoSalvo, type CenaSalva } from "@/lib/fluxoCena";
import type { ApiTemas, Tema } from "@/components/temas/TemasLista";

export const BUCKET_FLUXOS = "fluxogramas";
/** Disparado a cada mudança nos temas, para a aba e o Admin recarregarem. */
export const EVENTO_TEMAS_FLUXOS = "fluxos-temas";

export interface FluxoResumo {
  id: string;
  titulo: string;
  tema_id: string | null;
  miniatura: string | null;
  textos: string;
  modelo: string | null;
  created_at: string;
  updated_at: string;
}

export interface Fluxo extends FluxoResumo {
  cena: CenaSalva;
}

const COLUNAS_RESUMO = "id, titulo, tema_id, miniatura, textos, modelo, created_at, updated_at";

const temas = () => supabase.from("fluxo_temas" as any) as any;
const fluxos = () => supabase.from("fluxos" as any) as any;
const bucket = () => supabase.storage.from(BUCKET_FLUXOS);

function avisarTemas() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_TEMAS_FLUXOS));
}

function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Tabela ou bucket ainda não criados (migration pendente) viram uma mensagem clara. */
export function traduzErroFluxos(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? "");
  if (/(fluxo_temas|fluxos|fluxo_vinculos)/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return "As tabelas da aba Fluxogramas ainda não existem no banco (migration 20260926210000_fluxogramas.sql).";
  }
  if (/bucket not found/i.test(msg)) return "O armazenamento das imagens dos quadros ainda não existe (migration 20260926210000_fluxogramas.sql).";
  return msg || "Erro ao salvar";
}

// ---------------------------------------------------------------- Quadros

export async function listarFluxos(): Promise<FluxoResumo[]> {
  const { data, error } = await fluxos().select(COLUNAS_RESUMO).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []) as FluxoResumo[];
}

export async function carregarFluxo(id: string): Promise<Fluxo> {
  const { data, error } = await fluxos().select(`${COLUNAS_RESUMO}, cena`).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Quadro não encontrado (pode ter sido excluído).");
  return { ...(data as FluxoResumo), cena: lerCena((data as { cena: unknown }).cena) };
}

export async function criarFluxo(c: { titulo: string; tema_id: string | null; cena?: CenaSalva; modelo?: string | null }): Promise<Fluxo> {
  const { data, error } = await fluxos()
    .insert([{
      titulo: c.titulo.trim() || "Sem título",
      tema_id: c.tema_id,
      cena: c.cena ?? { elements: [], appState: {}, arquivos: {} },
      modelo: c.modelo ?? null,
    }])
    .select(`${COLUNAS_RESUMO}, cena`)
    .single();
  if (error) throw error;
  return { ...(data as FluxoResumo), cena: lerCena((data as { cena: unknown }).cena) };
}

export type ResultadoSalvar = { updated_at: string } | { conflito: true };

/**
 * Grava a cena. Antes confere se o quadro não foi salvo por outro aparelho depois da versão que este tem
 * (`updatedAtConhecido`); se foi, devolve `{ conflito: true }` sem gravar. `forcar` grava por cima mesmo assim.
 */
export async function salvarFluxo(
  id: string,
  dados: { cena: CenaSalva; textos: string; miniatura?: string | null },
  updatedAtConhecido: string,
  forcar = false,
): Promise<ResultadoSalvar> {
  if (!forcar) {
    const { data, error } = await fluxos().select("updated_at").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Quadro não encontrado (pode ter sido excluído em outro aparelho).");
    if (Date.parse(data.updated_at) !== Date.parse(updatedAtConhecido)) return { conflito: true };
  }
  const { data, error } = await fluxos()
    .update({
      cena: dados.cena,
      textos: dados.textos,
      ...(dados.miniatura !== undefined ? { miniatura: dados.miniatura } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("updated_at")
    .single();
  if (error) throw error;
  return { updated_at: data.updated_at as string };
}

/** Nome e tema não mexem na data de edição (não conta como mudança do desenho). */
export async function renomearFluxo(id: string, titulo: string): Promise<void> {
  const { error } = await fluxos().update({ titulo: titulo.trim() || "Sem título" }).eq("id", id);
  if (error) throw error;
}

export async function moverFluxo(id: string, tema_id: string | null): Promise<void> {
  const { error } = await fluxos().update({ tema_id }).eq("id", id);
  if (error) throw error;
}

/** Cópia do quadro com as imagens copiadas para a pasta do novo quadro. */
export async function duplicarFluxo(id: string): Promise<Fluxo> {
  const original = await carregarFluxo(id);
  const idNovo = novoId();
  const arquivos: Record<string, ArquivoSalvo> = {};
  for (const [fileId, a] of Object.entries(original.cena.arquivos)) {
    const destino = `${idNovo}/${a.caminho.split("/").pop()}`;
    const { error } = await bucket().copy(a.caminho, destino);
    if (error) throw error;
    arquivos[fileId] = { caminho: destino, mimeType: a.mimeType };
  }
  const { data, error } = await fluxos()
    .insert([{
      id: idNovo,
      titulo: `${original.titulo} (cópia)`,
      tema_id: original.tema_id,
      cena: { ...original.cena, arquivos },
      textos: original.textos,
      miniatura: original.miniatura,
      modelo: original.modelo,
    }])
    .select(`${COLUNAS_RESUMO}, cena`)
    .single();
  if (error) {
    await apagarImagens(Object.values(arquivos).map((a) => a.caminho));
    throw error;
  }
  return { ...(data as FluxoResumo), cena: lerCena((data as { cena: unknown }).cena) };
}

/** Apaga o quadro e a pasta dele no armazenamento (inclusive imagens soltas que ficaram por lá). */
export async function excluirFluxo(id: string): Promise<void> {
  const { error } = await fluxos().delete().eq("id", id);
  if (error) throw error;
  const { data } = await bucket().list(id, { limit: 1000 });
  await apagarImagens((data || []).map((o) => `${id}/${o.name}`));
}

// ---------------------------------------------------------------- Imagens

/** Sobe a imagem colada no quadro (dataURL que o Excalidraw guarda) para `<fluxoId>/<fileId>.<ext>`. */
export async function subirImagem(fluxoId: string, fileId: string, dataURL: string, mimeType: string): Promise<ArquivoSalvo> {
  const blob = await (await fetch(dataURL)).blob();
  const caminho = `${fluxoId}/${fileId}.${extensaoDoMime(mimeType)}`;
  const { error } = await bucket().upload(caminho, blob, { contentType: mimeType, upsert: true });
  if (error) throw error;
  return { caminho, mimeType };
}

function paraDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

/** Baixa as imagens do quadro para entregar ao Excalidraw; a falha de uma não impede as outras. */
export async function baixarImagens(arquivos: Record<string, ArquivoSalvo>): Promise<{ id: string; dataURL: string; mimeType: string }[]> {
  const resultados = await Promise.allSettled(
    Object.entries(arquivos).map(async ([id, a]) => {
      const { data, error } = await bucket().download(a.caminho);
      if (error || !data) throw error ?? new Error("Imagem não encontrada");
      return { id, dataURL: await paraDataURL(data), mimeType: a.mimeType };
    }),
  );
  return resultados.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

export async function apagarImagens(caminhos: string[]): Promise<void> {
  if (!caminhos.length) return;
  await bucket().remove(caminhos).catch(() => {});
}

// ---------------------------------------------------------------- Temas

export async function fetchTemasFluxo(): Promise<Tema[]> {
  const { data, error } = await temas().select("id, nome, hex, ordem").order("ordem").order("created_at");
  if (error) throw error;
  return (data || []) as Tema[];
}

/** Operações de tema usadas pelo gerenciador de temas (aba Fluxogramas). */
export const apiTemasFluxo: ApiTemas = {
  evento: EVENTO_TEMAS_FLUXOS,
  item: { singular: "quadro", plural: "quadros" },
  exemplo: "Ex.: Funis de clientes",
  traduzErro: traduzErroFluxos,
  fetchTemas: fetchTemasFluxo,
  async contar() {
    const { data, error } = await fluxos().select("tema_id");
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
