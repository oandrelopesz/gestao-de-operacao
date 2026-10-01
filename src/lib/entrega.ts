/** Data de hoje em Brasília (YYYY-MM-DD), a mesma usada pelo banco (hoje_brt). */
// Criado uma vez: montar um Intl.DateTimeFormat a cada chamada pesava na lista de demandas (uma por card)
let fmtDiaBrasilia: Intl.DateTimeFormat | null = null;
export function hojeBrasilia(agora: Date = new Date()): string {
  fmtDiaBrasilia ??= new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmtDiaBrasilia.format(agora);
}

const DIA_MS = 24 * 60 * 60 * 1000;
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Quantos dias a entrega já passou (0 = em dia ou sem entrega). */
export function diasDeAtraso(prazo: string | null | undefined, hoje: string): number {
  if (!prazo) return 0;
  const d = Math.round((utc(hoje) - utc(prazo)) / DIA_MS);
  return d > 0 ? d : 0;
}

export function formatarDataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
