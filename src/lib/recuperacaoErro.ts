// Recuperação automática de erros de tela. O caso mais comum: a aba ficou aberta durante uma
// publicação; os arquivos de código antigos deixam de existir (404) e a próxima navegação quebra.
// A solução é recarregar a página uma vez — com trava de tempo para nunca entrar em laço.

export const INTERVALO_MIN_RECARGA_MS = 20_000;
const CHAVE_ULTIMA_RECARGA = "gestorpro:ultima-recarga-automatica";

const PADRAO_CODIGO_DESATUALIZADO =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\w-]+ failed|Unable to preload CSS/i;

/** O erro vem de código de uma versão anterior do site que não existe mais no servidor? */
export function ehCodigoDesatualizado(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const { name, message } = erro as { name?: string; message?: string };
  return PADRAO_CODIGO_DESATUALIZADO.test(`${name ?? ""} ${message ?? ""}`);
}

/**
 * Erro do banco de "coluna/campo que não existe": a aba está com o código de uma versão anterior
 * do site depois de uma mudança no banco. Recarregar traz o código novo.
 */
export function ehEsquemaDesatualizado(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const { code, message } = erro as { code?: string; message?: string };
  return code === "PGRST204" || code === "42703" || /schema cache|column .* does not exist/i.test(message ?? "");
}

export function podeRecarregar(ultimaRecargaMs: number | null, agoraMs: number): boolean {
  return ultimaRecargaMs == null || agoraMs - ultimaRecargaMs > INTERVALO_MIN_RECARGA_MS;
}

/** Recarrega a página, no máximo uma vez a cada 20 s. Devolve false se a trava impediu. */
export function recarregarUmaVez(): boolean {
  if (typeof window === "undefined") return false;
  // Sem internet: recarregar não resolve nada e só troca o erro por uma tela em branco
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  let ultima: number | null = null;
  try {
    const salvo = window.sessionStorage.getItem(CHAVE_ULTIMA_RECARGA);
    ultima = salvo ? Number(salvo) : null;
  } catch {
    // sessionStorage bloqueado: segue sem trava persistente
  }
  const agora = Date.now();
  if (!podeRecarregar(ultima, agora)) return false;
  try {
    window.sessionStorage.setItem(CHAVE_ULTIMA_RECARGA, String(agora));
  } catch {
    // idem
  }
  window.location.reload();
  return true;
}

let instalado = false;

/** Vite avisa quando falha ao pré-carregar um arquivo de código (versão antiga): recarrega antes de quebrar a tela. */
export function instalarRecuperacaoGlobal(): void {
  if (instalado || typeof window === "undefined") return;
  instalado = true;
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    recarregarUmaVez();
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (ehCodigoDesatualizado(e.reason)) {
      e.preventDefault();
      recarregarUmaVez();
    }
  });
}
