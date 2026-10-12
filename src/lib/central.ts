// Dados da Central de arquivos: pastas (clientes), arquivos no R2 (módulo `central`, sem bucket antigo no Supabase).
// Listar, apagar e miniatura usam só o R2; baixar usa a reserva do Supabase, como o resto do sistema.
import { supabase } from "@/integrations/supabase/client";
import { apagarR2, baixarComReserva, enviarR2, listarR2, urlFixa } from "@/lib/r2";
import { caminhoCentral, motivoRecusa, nomeOriginal } from "@/lib/centralRegras";

/** Pastas = clientes do cadastro que não estão arquivados, em ordem alfabética. */
export async function fetchPastas(): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase.from("clientes").select("id, nome").eq("arquivado", false).order("nome");
  if (error) throw error;
  return data ?? [];
}

/** Caminhos de todos os arquivos da Central, relativos ao módulo (`<cliente_id>/<carimbo>-<nome>`). */
export const listarCentral = () => listarR2("central");

/** Envia o arquivo para a pasta do cliente, no formato original (sem conversão). Devolve o caminho gravado. */
export async function enviarCentral(clienteId: string, arquivo: File, onProgresso?: (f: number) => void): Promise<string> {
  const motivo = motivoRecusa(arquivo.name, arquivo.size);
  if (motivo) throw new Error(motivo);
  const caminho = caminhoCentral(clienteId, arquivo.name, new Date());
  await enviarR2("central", caminho, arquivo, arquivo.type || "application/octet-stream", onProgresso);
  return caminho;
}

/** Baixa o arquivo original e salva com o nome que o usuário enviou (bytes iguais, sem conversão). */
export async function baixarCentral(caminho: string): Promise<void> {
  const blob = await baixarComReserva("central", caminho);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeOriginal(caminho);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revogar na hora pode cancelar o download no Safari/Firefox
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Apaga só no R2 (a Central nunca teve arquivo no bucket antigo). */
export const apagarCentral = (caminho: string) => apagarR2("central", [caminho]);

/** Endereço fixo para a miniatura (a função `r2` redireciona para um link assinado). */
export const urlMiniatura = (caminho: string) => urlFixa("central", caminho);
