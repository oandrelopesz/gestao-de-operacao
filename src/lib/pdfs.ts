import { supabase } from "@/integrations/supabase/client";
import { idsDescendentes, nomeParaDownload, nomeSemExtensao, proximaOrdem, type PdfPasta } from "@/lib/pdfsArvore";

export type { PdfPasta } from "@/lib/pdfsArvore";

export interface PdfArquivo {
  id: string;
  pasta_id: string;
  nome: string;
  arquivo_nome: string;
  /** Autor, empresa ou fonte do PDF */
  player: string | null;
  storage_path: string;
  tamanho: number;
  created_at: string;
}

export interface PdfBiblioteca {
  pastas: PdfPasta[];
  pdfs: PdfArquivo[];
}

export const PDF_BUCKET = "pdfs";
/**
 * Limite padrão por arquivo. O valor em uso vem de app_config.pdf_tamanho_max_mb (Admin → PDFs).
 * O bucket (migration 20260923120000_pdfs.sql) aceita até 50 MB: acima disso, ajuste também o Storage.
 */
export const PDF_TAMANHO_MAX_PADRAO_MB = 50;

export const mbParaBytes = (mb: number) => mb * 1024 * 1024;

const msgLimite = (limiteMb: number) => `Arquivo maior que o limite de ${limiteMb} MB.`;

const RODAR_MIGRATION = "Rode supabase/migrations/20260923120000_pdfs.sql no SQL Editor.";

export function mensagemErroPdf(error: unknown, limiteMb: number = PDF_TAMANHO_MAX_PADRAO_MB): string {
  const msg = (error as { message?: string })?.message || String(error || "Erro desconhecido");
  if (/pdf_pastas|pdfs/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return `As tabelas da aba PDFs ainda não existem. ${RODAR_MIGRATION}`;
  }
  if (/bucket not found/i.test(msg)) return `O armazenamento de PDFs ainda não foi criado. ${RODAR_MIGRATION}`;
  if (/maximum allowed size|too large|413/i.test(msg)) return msgLimite(limiteMb);
  if (/mime type/i.test(msg)) return "Só é possível guardar arquivos PDF.";
  return msg;
}

// ---------------------------------------------------------------- Leitura

export async function fetchPdfBiblioteca(): Promise<PdfBiblioteca> {
  const [pastasRes, pdfsRes] = await Promise.all([
    supabase.from("pdf_pastas").select("id, nome, parent_id, cor, ordem"),
    supabase
      .from("pdfs")
      .select("id, pasta_id, nome, arquivo_nome, player, storage_path, tamanho, created_at")
      .order("created_at", { ascending: false }),
  ]);
  if (pastasRes.error) throw pastasRes.error;
  if (pdfsRes.error) throw pdfsRes.error;
  return { pastas: (pastasRes.data || []) as PdfPasta[], pdfs: (pdfsRes.data || []) as PdfArquivo[] };
}

// ---------------------------------------------------------------- Pastas

export async function criarPasta(
  pastas: PdfPasta[],
  input: { nome: string; parent_id: string | null; cor: string | null },
): Promise<PdfPasta> {
  const { data, error } = await supabase
    .from("pdf_pastas")
    .insert([{ ...input, nome: input.nome.trim(), ordem: proximaOrdem(pastas, input.parent_id) }])
    .select("id, nome, parent_id, cor, ordem")
    .single();
  if (error) throw error;
  return data as PdfPasta;
}

export async function atualizarPasta(
  id: string,
  patch: Partial<Pick<PdfPasta, "nome" | "parent_id" | "cor" | "ordem">>,
): Promise<void> {
  const { error } = await supabase
    .from("pdf_pastas")
    .update(patch.nome !== undefined ? { ...patch, nome: patch.nome.trim() } : patch)
    .eq("id", id);
  if (error) throw error;
}

/** Grava a nova ordem de um grupo de pastas irmãs (a posição na lista vira a ordem). */
export async function reordenarPastas(irmas: PdfPasta[]): Promise<void> {
  const results = await Promise.all(
    irmas.map((p, i) => supabase.from("pdf_pastas").update({ ordem: i }).eq("id", p.id)),
  );
  const falha = results.find((r) => r.error);
  if (falha?.error) throw falha.error;
}

/**
 * Exclui a pasta, as subpastas e os PDFs de todas elas: primeiro os arquivos no Storage,
 * depois a linha (o ON DELETE CASCADE leva subpastas e registros de PDF).
 */
export async function excluirPasta(id: string, biblioteca: PdfBiblioteca): Promise<void> {
  const ids = idsDescendentes(biblioteca.pastas, id);
  const caminhos = biblioteca.pdfs.filter((f) => ids.has(f.pasta_id)).map((f) => f.storage_path);
  await removerDoStorage(caminhos);
  const { error } = await supabase.from("pdf_pastas").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- Arquivos

async function removerDoStorage(caminhos: string[]): Promise<void> {
  // A API remove no máximo 1000 objetos por chamada
  for (let i = 0; i < caminhos.length; i += 1000) {
    const { error } = await supabase.storage.from(PDF_BUCKET).remove(caminhos.slice(i, i + 1000));
    if (error) throw error;
  }
}

function novoCaminho(): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${id}.pdf`;
}

/**
 * Envia o arquivo direto do navegador para o Storage (XHR, para ter progresso)
 * e registra o PDF na pasta. Se o registro falhar, o arquivo enviado é apagado.
 */
export async function enviarPdf(
  arquivo: File,
  pastaId: string,
  meta: { nome?: string; player?: string },
  onProgresso?: (fracao: number) => void,
  limiteMb: number = PDF_TAMANHO_MAX_PADRAO_MB,
): Promise<PdfArquivo> {
  if (arquivo.size > mbParaBytes(limiteMb)) throw new Error(msgLimite(limiteMb));
  const caminho = novoCaminho();

  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token || chave;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${url}/storage/v1/object/${PDF_BUCKET}/${caminho}`);
    xhr.setRequestHeader("apikey", chave);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgresso?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Falha no envio (HTTP ${xhr.status})`;
      try {
        const corpo = JSON.parse(xhr.responseText);
        msg = corpo.message || corpo.error || msg;
      } catch {
        // resposta sem JSON: fica a mensagem com o status
      }
      if (xhr.status === 413) msg = msgLimite(limiteMb);
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Falha de rede ao enviar o arquivo"));
    xhr.send(arquivo);
  });

  const { data, error } = await supabase
    .from("pdfs")
    .insert([{
      pasta_id: pastaId,
      // Sem nome informado, fica o nome do documento original
      nome: meta.nome?.trim() || nomeSemExtensao(arquivo.name).trim() || "Sem nome",
      player: meta.player?.trim() || null,
      arquivo_nome: arquivo.name,
      storage_path: caminho,
      tamanho: arquivo.size,
    }])
    .select("id, pasta_id, nome, arquivo_nome, player, storage_path, tamanho, created_at")
    .single();
  if (error) {
    await supabase.storage.from(PDF_BUCKET).remove([caminho]).catch(() => {});
    throw error;
  }
  return data as PdfArquivo;
}

export async function atualizarPdf(id: string, patch: Partial<Pick<PdfArquivo, "nome" | "pasta_id" | "player">>): Promise<void> {
  const { error } = await supabase
    .from("pdfs")
    .update(patch.nome !== undefined ? { ...patch, nome: patch.nome.trim() } : patch)
    .eq("id", id);
  if (error) throw error;
}

export async function excluirPdf(pdf: PdfArquivo): Promise<void> {
  await removerDoStorage([pdf.storage_path]);
  const { error } = await supabase.from("pdfs").delete().eq("id", pdf.id);
  if (error) throw error;
}

/** Baixa o conteúdo do PDF (o bucket é privado, então passa pela API com a chave do app). */
export async function baixarConteudo(pdf: PdfArquivo): Promise<Blob> {
  const { data, error } = await supabase.storage.from(PDF_BUCKET).download(pdf.storage_path);
  if (error) throw error;
  // Garante o tipo certo para o visualizador do navegador
  return data.type === "application/pdf" ? data : new Blob([data], { type: "application/pdf" });
}

/** Salva o PDF no computador com o nome dado na aba. `blob` evita baixar de novo se já estiver aberto. */
export async function salvarNoComputador(pdf: PdfArquivo, blob?: Blob): Promise<void> {
  const conteudo = blob ?? (await baixarConteudo(pdf));
  const href = URL.createObjectURL(conteudo);
  const a = document.createElement("a");
  a.href = href;
  a.download = nomeParaDownload(pdf.nome);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
