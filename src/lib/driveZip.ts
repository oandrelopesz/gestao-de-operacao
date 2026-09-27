// Baixar uma pasta do Drive inteira em .zip, no navegador: percorre a árvore (sem _rascunhos/_teste),
// baixa os originais (Doc → .docx, Planilha → .xlsx) e grava sem recompressão, com a mesma estrutura.
import { Zip, ZipPassThrough } from "fflate";
import { ehPasta, entradaDoZip, nomeSeguro, visivel, type FormatoDownload, type ItemDrive } from "@/lib/dadosInternos";
import { baixarNoFormato, listarPasta } from "@/lib/driveLeitura";

export interface ProgressoZip {
  feitos: number;
  total: number;
  fase: "listando" | "baixando";
}

export interface ResultadoZip {
  blob: Blob;
  /** Caminhos que ficaram de fora depois de 3 tentativas */
  falhas: string[];
  total: number;
}

interface Entrada {
  item: ItemDrive;
  caminho: string;
  formato: FormatoDownload;
}

const cancelado = () => new DOMException("Cancelado", "AbortError");
const ehCancelamento = (e: unknown) => (e as Error)?.name === "AbortError";

async function coletar(pastaId: string, dir: string, usados: Set<string>, saida: Entrada[], sinal: AbortSignal): Promise<void> {
  for (const item of await listarPasta(pastaId)) {
    if (sinal.aborted) throw cancelado();
    if (!visivel(item)) continue;
    if (ehPasta(item)) {
      await coletar(item.id, `${dir}${nomeSeguro(item.name)}/`, usados, saida, sinal);
      continue;
    }
    const e = entradaDoZip(dir, item, usados);
    if (e) saida.push({ item, ...e });
  }
}

async function comTentativas<T>(fn: () => Promise<T>, sinal: AbortSignal, vezes = 3): Promise<T> {
  let erro: unknown;
  for (let i = 0; i < vezes; i++) {
    if (sinal.aborted) throw cancelado();
    try {
      return await fn();
    } catch (e) {
      if (ehCancelamento(e)) throw e;
      erro = e;
    }
  }
  throw erro;
}

export async function zipDaPasta(
  pasta: Pick<ItemDrive, "id" | "name">,
  aoProgredir: (p: ProgressoZip) => void,
  sinal: AbortSignal,
): Promise<ResultadoZip> {
  aoProgredir({ feitos: 0, total: 0, fase: "listando" });
  const entradas: Entrada[] = [];
  await coletar(pasta.id, "", new Set(), entradas, sinal);

  const partes: Uint8Array[] = [];
  let terminar!: () => void;
  let falhar!: (e: unknown) => void;
  const pronto = new Promise<void>((resolve, reject) => { terminar = resolve; falhar = reject; });
  const zip = new Zip((err, chunk, final) => {
    if (err) { falhar(err); return; }
    partes.push(chunk);
    if (final) terminar();
  });

  const falhas: string[] = [];
  let feitos = 0;
  let proxima = 0;
  aoProgredir({ feitos, total: entradas.length, fase: "baixando" });
  // 3 downloads ao mesmo tempo; cada arquivo entra no .zip inteiro (add + push juntos, sem await no meio)
  const trabalhador = async () => {
    while (proxima < entradas.length) {
      const e = entradas[proxima++];
      try {
        const blob = await comTentativas(() => baixarNoFormato(e.item, e.formato, sinal), sinal);
        const dados = new Uint8Array(await blob.arrayBuffer());
        const arquivo = new ZipPassThrough(e.caminho);
        zip.add(arquivo);
        arquivo.push(dados, true);
      } catch (erro) {
        if (ehCancelamento(erro)) throw erro;
        falhas.push(e.caminho);
      }
      aoProgredir({ feitos: ++feitos, total: entradas.length, fase: "baixando" });
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  zip.end();
  await pronto;
  return { blob: new Blob(partes as BlobPart[], { type: "application/zip" }), falhas, total: entradas.length };
}
