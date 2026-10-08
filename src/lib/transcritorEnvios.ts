// Envios de arquivo do Transcritor fora da página: continuam ao trocar de aba do sistema ou deixar a
// aba do navegador em segundo plano, e a página mostra o progresso de novo quando volta.
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { SemLoginGoogle, enviarArquivo, traduzErroTranscritor } from "@/lib/transcritor";

export interface Envio { progresso: number; erro: string | null; semLogin: boolean; controle: AbortController; arquivo: File }

let envios: Record<string, Envio> = {};
const ouvintes = new Set<() => void>();

const mudar = (fn: (atual: Record<string, Envio>) => Record<string, Envio>) => {
  envios = fn(envios);
  ouvintes.forEach((o) => o());
};
const atualizar = (id: string, campos: Partial<Envio>) =>
  mudar((atual) => (atual[id] ? { ...atual, [id]: { ...atual[id], ...campos } } : atual));
const remover = (ids: string[]) => mudar((atual) => Object.fromEntries(Object.entries(atual).filter(([id]) => !ids.includes(id))));

export const enviosEmAndamento = () => Object.values(envios).some((e) => !e.erro && e.progresso < 1);

/** Envia em segundo plano. O Web Lock segura a aba para o Chrome não congelá-la no meio do envio. */
export function iniciarEnvio(id: string, arquivo: File) {
  const controle = new AbortController();
  mudar((atual) => ({ ...atual, [id]: { progresso: 0, erro: null, semLogin: false, controle, arquivo } }));
  const envio = enviarArquivo(id, arquivo, { signal: controle.signal, onProgresso: (p) => atualizar(id, { progresso: p }) });
  // ponytail: Web Lock só evita o congelamento da aba; fechar a aba ainda perde o envio (o aviso do beforeunload cobre)
  navigator.locks?.request(`transcritor-envio-${id}`, () => envio.catch(() => {})).catch(() => {});
  envio
    .then(() => {
      remover([id]);
      toast.success(`"${arquivo.name}" enviado: está na fila para transcrever`);
    })
    .catch((e) => {
      if (controle.signal.aborted) return;
      const semLogin = e instanceof SemLoginGoogle;
      const msg = traduzErroTranscritor(e);
      atualizar(id, { erro: msg, semLogin });
      if (!semLogin) toast.error(`Envio de "${arquivo.name}" parou: ${msg}`);
    });
}

/** Entrou com o Google: os envios que pararam continuam de onde o servidor estava. */
export function retomarEnviosParados() {
  for (const [id, e] of Object.entries(envios)) if (e.erro) iniciarEnvio(id, e.arquivo);
}

export function cancelarEnvios(ids: string[]) {
  for (const id of ids) envios[id]?.controle.abort();
  remover(ids);
}

export function useEnvios(): Record<string, Envio> {
  return useSyncExternalStore(
    (o) => { ouvintes.add(o); return () => ouvintes.delete(o); },
    () => envios,
    () => envios,
  );
}

// Fechar a aba no meio do envio perde o arquivo: avisa (vale em qualquer página do sistema)
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (enviosEmAndamento()) { e.preventDefault(); e.returnValue = ""; }
  });
}
