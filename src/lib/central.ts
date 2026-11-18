// Dados da Central de arquivos: pastas (clientes), arquivos no R2 (módulo `central`, sem bucket antigo no Supabase).
// Listar, apagar, copiar e miniatura usam só o R2; baixar usa a reserva do Supabase, como o resto do sistema.
import { Zip, ZipPassThrough } from "fflate";
import { churnEncerrado, filtroClienteDisponivel } from "@/lib/churn";
import { supabase } from "@/integrations/supabase/client";
import { apagarR2, baixarComReserva, copiarComReserva, enviarR2, listarR2, urlFixa } from "@/lib/r2";
import { caminhoCentral, entradasDoZip, motivoRecusa, nomeOriginal, renomeado } from "@/lib/centralRegras";

/** Pastas = clientes do cadastro que não estão arquivados, em ordem alfabética. */
export async function fetchPastas(): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase.from("clientes").select("id, nome").eq("arquivado", false).or(filtroClienteDisponivel()).order("nome");
  if (error) throw error;
  return data ?? [];
}

export type GrupoPasta = "ativos" | "pausados" | "churn";

/**
 * Todas as pastas da Central, com o grupo de cada cliente: ativos (inclui churn com contrato em vigor), pausados e churn
 * que já valeu. Churn arquivado também entra, para a pasta não sumir com os arquivos dentro.
 */
export async function fetchPastasTodas(): Promise<{ id: string; nome: string; grupo: GrupoPasta }[]> {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome, arquivado, status_operacional, churn_efeito_imediato, contrato_ate")
    .order("nome");
  if (error) throw error;
  return (data ?? [])
    .map((c: any) => ({
      id: c.id as string,
      nome: c.nome as string,
      arquivado: !!c.arquivado,
      grupo: (c.status_operacional === "pausado" ? "pausados" : churnEncerrado(c) ? "churn" : "ativos") as GrupoPasta,
    }))
    .filter((c) => !c.arquivado || c.grupo === "churn")
    .map(({ id, nome, grupo }) => ({ id, nome, grupo }));
}

/** Caminhos de todos os arquivos da Central, relativos ao módulo (`<cliente_id>/<pastas>/<carimbo>-<nome>`). */
export const listarCentral = () => listarR2("central");

/** Envia o arquivo para a pasta do cliente (e subpasta), no formato original. Devolve o caminho gravado. */
export async function enviarCentral(
  clienteId: string,
  arquivo: File,
  pasta: string,
  onProgresso?: (f: number) => void,
): Promise<string> {
  const motivo = motivoRecusa(arquivo.name, arquivo.size);
  if (motivo) throw new Error(motivo);
  const caminho = caminhoCentral(clienteId, arquivo.name, new Date(), pasta);
  await enviarR2("central", caminho, arquivo, arquivo.type || "application/octet-stream", onProgresso);
  return caminho;
}

function salvarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revogar na hora pode cancelar o download no Safari/Firefox
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Baixa o arquivo original e salva com o nome que o usuário enviou (bytes iguais, sem conversão). */
export async function baixarCentral(caminho: string): Promise<void> {
  salvarBlob(await baixarComReserva("central", caminho), nomeOriginal(caminho));
}

/**
 * Baixa uma pasta (com as subpastas) num .zip, com a mesma estrutura. `caminhos` é a lista da Central; o .zip
 * leva o nome da pasta. Devolve quantos arquivos não vieram.
 */
export async function baixarPastaZip(
  caminhos: string[],
  clienteId: string,
  pasta: string,
  nomeRaiz: string,
): Promise<number> {
  const entradas = entradasDoZip(caminhos, clienteId, pasta, nomeRaiz);
  const partes: Uint8Array[] = [];
  let terminar!: () => void;
  let falhar!: (e: unknown) => void;
  const pronto = new Promise<void>((resolve, reject) => { terminar = resolve; falhar = reject; });
  const zip = new Zip((err, chunk, final) => {
    if (err) { falhar(err); return; }
    partes.push(chunk);
    if (final) terminar();
  });
  let falhas = 0;
  let proxima = 0;
  // 3 downloads ao mesmo tempo; cada arquivo entra no .zip inteiro (add + push juntos, sem await no meio)
  const trabalhador = async () => {
    while (proxima < entradas.length) {
      const e = entradas[proxima++];
      try {
        const dados = new Uint8Array(await (await baixarComReserva("central", e.caminho)).arrayBuffer());
        const arquivo = new ZipPassThrough(e.entrada);
        zip.add(arquivo);
        arquivo.push(dados, true);
      } catch {
        falhas++;
      }
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  zip.end();
  await pronto;
  salvarBlob(new Blob(partes as BlobPart[], { type: "application/zip" }), `${nomeRaiz}.zip`);
  return falhas;
}

/** Muda só o nome (a extensão e o carimbo ficam): copia para o nome novo e apaga o antigo. Devolve o caminho novo. */
export async function renomearCentral(caminho: string, novoNome: string, existentes: string[]): Promise<string> {
  const novo = renomeado(caminho, novoNome);
  if (novo === caminho) return caminho;
  if (existentes.includes(novo)) throw new Error("Já existe um arquivo com esse nome nesta pasta.");
  await copiarComReserva("central", caminho, novo, "application/octet-stream");
  await apagarR2("central", [caminho]);
  return novo;
}

/** Apaga só no R2 (a Central nunca teve arquivo no bucket antigo). */
export const apagarCentral = (caminhos: string[]) => apagarR2("central", caminhos);

/** Endereço fixo para a miniatura (a função `r2` redireciona para um link assinado). */
export const urlMiniatura = (caminho: string) => urlFixa("central", caminho);
