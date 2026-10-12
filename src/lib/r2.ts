// Arquivos do sistema no Cloudflare R2, pela edge function `r2` (spec 2026-09-30-arquivos-r2-design.md).
// Transição de 30 dias (até 30/10/2026): envio só para o R2; leitura no R2 com reserva no bucket antigo do
// Supabase; apagar nos dois lados. Swipe file, Transcritor e Fireflies não usam este módulo.
import { supabase } from "@/integrations/supabase/client";
import { MODULOS_R2, chaveR2, urlFixaR2, urlImagemNota, type ModuloR2 } from "@/lib/r2Chaves";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const CHAVE_PUBLICA = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const FUNCAO = `${SUPABASE_URL}/functions/v1/r2`;

/** O arquivo não está no R2 (a leitura e a cópia caem no Supabase). */
class NaoEstaNoR2 extends Error {}

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(FUNCAO, {
    method: "POST",
    headers: { apikey: CHAVE_PUBLICA, Authorization: `Bearer ${CHAVE_PUBLICA}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const d = await r.json().catch(() => ({}));
  // 404 com { error } é a resposta da função para "não está no R2" (ler, copiar); outro 404 é a função fora do ar.
  if (r.status === 404 && typeof d.error === "string") throw new NaoEstaNoR2(d.error);
  if (!r.ok) throw new Error(d.error || `A função r2 respondeu ${r.status}`);
  return d as T;
}

/** Envia direto do navegador para o R2 (URL assinada de PUT), com progresso. Sobrescreve se já existir. */
export async function enviarR2(
  modulo: ModuloR2,
  caminho: string,
  corpo: Blob,
  tipo: string,
  onProgresso?: (fracao: number) => void,
): Promise<void> {
  const { url } = await chamar<{ url: string }>({ acao: "enviar", chave: chaveR2(modulo, caminho) });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", tipo || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgresso?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(`Falha no envio do arquivo (HTTP ${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Falha de rede ao enviar o arquivo"));
    xhr.send(corpo);
  });
}

/**
 * Baixa do R2. Se não conseguir (arquivo ainda não migrado, ou o R2 fora do ar), tenta o bucket antigo do
 * Supabase; se lá também não houver, devolve o erro mais útil.
 */
export async function baixarComReserva(modulo: ModuloR2, caminho: string): Promise<Blob> {
  try {
    const { url } = await chamar<{ url: string }>({ acao: "ler", chave: chaveR2(modulo, caminho) });
    const r = await fetch(url);
    if (!r.ok) throw new Error(`O R2 respondeu ${r.status} ao baixar o arquivo`);
    return await r.blob();
  } catch (erroR2) {
    // "Ainda não migrado" é esperado; qualquer outra falha do R2 ficaria escondida pela reserva até 30/10
    if (!(erroR2 instanceof NaoEstaNoR2)) console.warn("[r2] leitura caiu na reserva do Supabase:", erroR2);
    const { data, error } = await supabase.storage.from(MODULOS_R2[modulo]).download(caminho);
    if (data && !error) return data;
    throw erroR2 instanceof NaoEstaNoR2 ? (error ?? erroR2) : erroR2;
  }
}

/** Chave no R2, ou null quando o nome não vale como chave (arquivo antigo, que nunca foi para o R2). */
function chaveSeValida(modulo: ModuloR2, caminho: string): string | null {
  try {
    return chaveR2(modulo, caminho);
  } catch {
    return null;
  }
}

/** Apaga nos dois lados (R2 e bucket antigo), em lotes de 1.000. Arquivo ausente em um deles não é erro. */
export async function apagarNosDois(modulo: ModuloR2, caminhos: string[]): Promise<void> {
  for (let i = 0; i < caminhos.length; i += 1000) {
    const lote = caminhos.slice(i, i + 1000);
    const chaves = lote.map((c) => chaveSeValida(modulo, c)).filter((c): c is string => c !== null);
    if (chaves.length) await chamar({ acao: "apagar", chaves });
    const { error } = await supabase.storage.from(MODULOS_R2[modulo]).remove(lote);
    if (error) throw error;
  }
}

/** Copia dentro do R2; se a origem só existir no Supabase, baixa de lá e envia ao R2. */
export async function copiarComReserva(modulo: ModuloR2, de: string, para: string, tipo: string): Promise<void> {
  try {
    await chamar({ acao: "copiar", de: chaveR2(modulo, de), para: chaveR2(modulo, para) });
  } catch (e) {
    if (!(e instanceof NaoEstaNoR2)) throw e;
    const blob = await baixarComReserva(modulo, de);
    await enviarR2(modulo, para, blob, tipo);
  }
}

/** Arquivos de uma pasta do módulo nos dois lados, sem repetir (caminhos relativos ao módulo). */
export async function listarNosDois(modulo: ModuloR2, pasta: string): Promise<string[]> {
  const pastaLimpa = pasta.replace(/\/+$/, "");
  const { chaves } = await chamar<{ chaves: string[] }>({ acao: "listar", prefixo: `${chaveR2(modulo, pastaLimpa)}/` });
  const noR2 = chaves.map((k) => k.slice(modulo.length + 1));
  const { data } = await supabase.storage.from(MODULOS_R2[modulo]).list(pastaLimpa, { limit: 1000 });
  const noSupabase = (data || []).filter((o) => o.id).map((o) => `${pastaLimpa}/${o.name}`);
  return [...new Set([...noR2, ...noSupabase])];
}

/** Arquivos de um módulo só no R2 (sem bucket antigo, como a Central), caminhos relativos ao módulo. */
export async function listarR2(modulo: ModuloR2): Promise<string[]> {
  const { chaves } = await chamar<{ chaves: string[] }>({ acao: "listar", prefixo: `${modulo}/` });
  return chaves.map((k) => k.slice(modulo.length + 1));
}

/** Apaga só no R2, em lotes de 1.000 (caminhos relativos ao módulo). */
export async function apagarR2(modulo: ModuloR2, caminhos: string[]): Promise<void> {
  for (let i = 0; i < caminhos.length; i += 1000) {
    await chamar({ acao: "apagar", chaves: caminhos.slice(i, i + 1000).map((c) => chaveR2(modulo, c)) });
  }
}

/** Endereço fixo de uma imagem de nota (vai dentro do documento da nota). */
export function urlDaImagemNota(arquivo: string): string {
  return urlImagemNota(SUPABASE_URL, arquivo);
}

/** Endereço fixo de um arquivo do módulo (função `r2`). */
export function urlFixa(modulo: ModuloR2, caminho: string): string {
  return urlFixaR2(SUPABASE_URL, modulo, caminho);
}
