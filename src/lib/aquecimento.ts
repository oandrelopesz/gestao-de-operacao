// Aquecimento das abas em segundo plano (dados e código): a tela aberta tem prioridade total.
// Tudo aqui roda depois que ela carregou, em lotes pequenos e só com o navegador ocioso — no celular,
// baixar e preparar todas as abas de uma vez disputava o processador e a rede com a tela que estava abrindo.

type ComOcioso = typeof globalThis & {
  requestIdleCallback?: (cb: () => void, opcoes?: { timeout: number }) => number;
};

/** Respiro sem requestIdleCallback (Safari/iPhone): deixa o navegador desenhar e atender toques entre um passo e outro. */
export const RESPIRO_MS = 120;

/** Resolve quando o navegador estiver ocioso (ou em `limiteMs`, o que vier antes). */
export function esperarOcioso(limiteMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    const g = globalThis as ComOcioso;
    if (typeof g.requestIdleCallback === "function") g.requestIdleCallback(() => resolve(), { timeout: limiteMs });
    else setTimeout(resolve, RESPIRO_MS);
  });
}

/** Resolve depois do evento load da página (o código, os estilos e as fontes da tela aberta já chegaram). */
export function depoisDoLoad(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || document.readyState === "complete") return resolve();
    window.addEventListener("load", () => resolve(), { once: true });
  });
}

export const pausa = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Roda as tarefas em lotes de `tamanho` (as de um lote em paralelo), esperando `antes()` antes de cada lote.
 * Falha de uma tarefa não interrompe as outras. Para de começar lotes novos quando `cancelado()`.
 */
export async function emLotes(
  tarefas: (() => Promise<unknown>)[],
  tamanho: number,
  antes: () => Promise<void> = esperarOcioso,
  cancelado: () => boolean = () => false,
): Promise<void> {
  const passo = Math.max(1, Math.floor(tamanho));
  for (let i = 0; i < tarefas.length; i += passo) {
    await antes();
    if (cancelado()) return;
    await Promise.all(tarefas.slice(i, i + passo).map((t) => Promise.resolve().then(t).catch(() => undefined)));
  }
}
