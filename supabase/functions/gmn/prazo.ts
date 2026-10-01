// Prazos das chamadas externas. A edge function é encerrada por volta de 150 s: a execução inteira tem até
// PRAZO_TOTAL_MS e cada chamada o seu prazo, o que vencer antes. Estourando, o post vai para "erro" em vez de ficar
// preso em "gerando".
export const PRAZO_TOTAL_MS = 130_000;
export const PRAZO = { texto: 60_000, imagem: 90_000, google: 20_000, r2: 30_000 } as const;

/** Sinal que aborta no prazo da chamada (`ms`) ou no prazo total (`total`), o que vier primeiro. */
export function sinal(ms: number, total?: AbortSignal): AbortSignal {
  const proprio = AbortSignal.timeout(ms);
  return total ? AbortSignal.any([proprio, total]) : proprio;
}

/** O fetch parou por prazo (ou por abort)? */
export function foiPrazo(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
}
