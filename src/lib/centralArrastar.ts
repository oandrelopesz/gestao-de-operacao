// Lê o que foi solto na tela ou escolhido no seletor de pasta: arquivos soltos e pastas inteiras (com subpastas).
// Cada item sai com a pasta dele relativa ao que foi solto ("" = solto direto), pronta para `enviarCentral`.
import { ehLixo } from "@/lib/centralRegras";

export interface ArquivoComPasta {
  file: File;
  pasta: string;
}

/** Seletor de pasta (`webkitdirectory`): o caminho relativo vem em `webkitRelativePath` ("Pasta/sub/arq.png"). */
export function dosArquivosDaPasta(files: File[]): ArquivoComPasta[] {
  return files
    .filter((f) => !ehLixo(f.name))
    .map((file) => {
      const rel = file.webkitRelativePath || "";
      const i = rel.lastIndexOf("/");
      return { file, pasta: i < 0 ? "" : rel.slice(0, i) };
    });
}

const lerEntrada = (dir: FileSystemDirectoryEntry) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => {
    const leitor = dir.createReader();
    const todas: FileSystemEntry[] = [];
    // readEntries devolve em lotes (até 100 no Chrome): repete até vir vazio
    const proxima = () =>
      leitor.readEntries((lote) => {
        if (!lote.length) return resolve(todas);
        todas.push(...lote);
        proxima();
      }, reject);
    proxima();
  });

async function percorrer(entrada: FileSystemEntry, pasta: string, saida: ArquivoComPasta[]): Promise<void> {
  if (entrada.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entrada as FileSystemFileEntry).file(resolve, reject));
    if (!ehLixo(file.name)) saida.push({ file, pasta });
    return;
  }
  const dentro = pasta ? `${pasta}/${entrada.name}` : entrada.name;
  for (const filha of await lerEntrada(entrada as FileSystemDirectoryEntry)) await percorrer(filha, dentro, saida);
}

/** Soltar na tela: aceita arquivos e pastas. Chamar direto no `onDrop` (a lista some depois do primeiro await). */
export async function doArrastar(dt: DataTransfer): Promise<ArquivoComPasta[]> {
  const entradas = Array.from(dt.items ?? [])
    .filter((i) => i.kind === "file")
    .map((i) => ({ entrada: i.webkitGetAsEntry?.() ?? null, file: i.getAsFile() }));
  const saida: ArquivoComPasta[] = [];
  for (const { entrada, file } of entradas) {
    if (entrada) await percorrer(entrada, "", saida);
    else if (file && !ehLixo(file.name)) saida.push({ file, pasta: "" });
  }
  return saida;
}
