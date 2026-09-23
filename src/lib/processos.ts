// Regras da trilha de passos (Onboarding e Roadmap). Datas são YYYY-MM-DD; passo sem data fica no fim.
export type TipoProcesso = "onboarding" | "roadmap";

export interface PassoLogico {
  id: string;
  data: string | null;
  ordem: number;
  concluido_em: string | null;
}

const porOrdem = (a: PassoLogico, b: PassoLogico) => a.ordem - b.ordem;

export function ordenarPassos<T extends PassoLogico>(p: T[]): T[] {
  return [...p.filter((x) => x.data).sort(porOrdem), ...p.filter((x) => !x.data).sort(porOrdem)];
}

export function renumerar<T extends PassoLogico>(p: T[]): T[] {
  return p.map((x, i) => ({ ...x, ordem: i }));
}

export function progresso(p: PassoLogico[]): number {
  if (!p.length) return 0;
  return Math.round((p.filter((x) => x.concluido_em).length * 100) / p.length);
}

export function previsaoTermino(p: PassoLogico[]): string | null {
  return p.reduce<string | null>((max, x) => (x.data && (!max || x.data > max) ? x.data : max), null);
}

export function proximoPasso(p: PassoLogico[]): string | null {
  return p.find((x) => !x.concluido_em)?.id ?? null;
}

export function ordemValida(p: PassoLogico[]): boolean {
  let semData = false;
  let ultima: string | null = null;
  for (const x of p) {
    if (!x.data) { semData = true; continue; }
    if (semData) return false;
    if (ultima && x.data < ultima) return false;
    ultima = x.data;
  }
  return true;
}

/** Depois de reordenar: quem precisa de data nova (o movido e os que ficaram com datas invertidas em relação a ele). */
export function passosEmConflito(depois: PassoLogico[], movidoId: string): string[] {
  if (ordemValida(depois)) return [];
  const idx = depois.findIndex((x) => x.id === movidoId);
  if (idx < 0) return [];
  const m = depois[idx];
  if (!m.data) return [movidoId];
  const ids = [movidoId];
  depois.forEach((x, i) => {
    if (x.id === movidoId || !x.data) return;
    if ((i < idx && x.data > m.data!) || (i > idx && x.data < m.data!)) ids.push(x.id);
  });
  return ids;
}

export function posicaoParaNovoPasso(p: PassoLogico[], data: string | null): number {
  if (!data) return p.length;
  let pos = 0;
  p.forEach((x, i) => { if (x.data && x.data <= data) pos = i + 1; });
  return pos;
}

export function duracaoDias(inicioISO: string, fimISO: string): number {
  const dia = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((dia(fimISO) - dia(inicioISO)) / 86_400_000);
}
