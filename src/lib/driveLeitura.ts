// Leitura do Drive para a aba Dados internos — só leitura: listar pasta, ler item, baixar o original,
// exportar Docs/Planilhas e salvar no computador. Usa o token do Google do app (googleDrive.ts).
import { driveFetch } from "@/lib/googleDrive";
import { nomeDoDownload, type FormatoDownload, type ItemDrive } from "@/lib/dadosInternos";

const CAMPOS = "id,name,mimeType,createdTime,modifiedTime,size,parents";

/** O token não pode ler o Drive: falta reconectar o Google com o escopo drive.readonly. */
export class DriveEscopoError extends Error {}
/** O Google não converte Docs/Planilhas grandes (limite de 10 MB na exportação). */
export class ExportGrandeError extends Error {}

async function erroDoDrive(r: Response, acao: string): Promise<Error> {
  const data = await r.json().catch(() => ({}));
  const razao = String(data?.error?.errors?.[0]?.reason ?? "");
  const texto = `${razao} ${data?.error?.status ?? ""} ${data?.error?.message ?? ""}`;
  if (razao === "exportSizeLimitExceeded") return new ExportGrandeError("Grande demais para visualizar aqui.");
  if (r.status === 403 && /insufficient|scope/i.test(texto)) {
    return new DriveEscopoError("A conexão com o Google ainda não pode ler o Drive.");
  }
  if (r.status === 404) return new Error("Não encontrado no Drive (pode ter sido apagado).");
  return new Error(data?.error?.message || `Google Drive respondeu ${r.status} ao ${acao}`);
}

/** Filhos de uma pasta (fora da Lixeira), todas as páginas. */
export async function listarPasta(pastaId: string): Promise<ItemDrive[]> {
  const itens: ItemDrive[] = [];
  let pageToken = "";
  do {
    const q = `'${pastaId.replace(/'/g, "\\'")}' in parents and trashed = false`;
    const params = new URLSearchParams({ q, fields: `nextPageToken,files(${CAMPOS})`, pageSize: "1000", orderBy: "createdTime desc" });
    if (pageToken) params.set("pageToken", pageToken);
    const r = await driveFetch(`/files?${params}`);
    if (!r.ok) throw await erroDoDrive(r, "listar a pasta");
    const data = await r.json();
    itens.push(...((data.files ?? []) as ItemDrive[]));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return itens;
}

export async function obterItem(id: string): Promise<ItemDrive> {
  const r = await driveFetch(`/files/${encodeURIComponent(id)}?fields=${CAMPOS}`);
  if (!r.ok) throw await erroDoDrive(r, "abrir o item");
  return r.json();
}

/** Pastas entre a raiz da sub-aba (exclusive) e `pastaId` (inclusive), para a trilha. */
export async function trilhaAte(pastaId: string, raizId: string): Promise<ItemDrive[]> {
  const trilha: ItemDrive[] = [];
  let atual = pastaId;
  for (let i = 0; i < 8 && atual !== raizId; i++) {
    const item = await obterItem(atual);
    trilha.unshift(item);
    const pai = item.parents?.[0];
    if (!pai) break;
    atual = pai;
  }
  return trilha;
}

/** Os mesmos bytes que estão no Drive. */
export async function baixarOriginal(id: string, sinal?: AbortSignal): Promise<Blob> {
  const r = await driveFetch(`/files/${encodeURIComponent(id)}?alt=media`, { signal: sinal });
  if (!r.ok) throw await erroDoDrive(r, "baixar o arquivo");
  return r.blob();
}

/** Doc/Planilha convertido pelo Google (docx, xlsx, pdf, csv). */
export async function exportar(id: string, mime: string, sinal?: AbortSignal): Promise<Blob> {
  const r = await driveFetch(`/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mime)}`, { signal: sinal });
  if (!r.ok) throw await erroDoDrive(r, "converter o arquivo");
  return r.blob();
}

export function baixarNoFormato(item: Pick<ItemDrive, "id">, formato: FormatoDownload, sinal?: AbortSignal): Promise<Blob> {
  return formato.exportMime ? exportar(item.id, formato.exportMime, sinal) : baixarOriginal(item.id, sinal);
}

export function salvarBlob(blob: Blob, nome: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export async function salvarItem(item: Pick<ItemDrive, "id" | "name">, formato: FormatoDownload): Promise<void> {
  salvarBlob(await baixarNoFormato(item, formato), nomeDoDownload(item.name, formato));
}
