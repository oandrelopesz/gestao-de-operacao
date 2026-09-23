/**
 * Regras puras da fila de downloads do swipe file (sem Supabase nem alias "@/"), para `node --test`.
 * O n8n pega o job `aguardando` de menor `posicao` (empate: o mais antigo). Job novo nasce com o
 * instante em ms, então vai para o fim; ao reorganizar, o app numera quem espera a partir de 0.
 */

export type StatusJob = "aguardando" | "rodando" | "ok" | "erro" | "pausado";

export interface JobFila {
  id: string;
  item_id: string;
  status: StatusJob;
  posicao: number;
  created_at: string;
  iniciado_em: string | null;
  tipo: "download" | "lp";
}

const porPosicao = (a: JobFila, b: JobFila) => a.posicao - b.posicao || a.created_at.localeCompare(b.created_at);

export function separarFila<T extends JobFila>(jobs: T[]): { rodando: T[]; aguardando: T[]; pausados: T[] } {
  return {
    rodando: jobs.filter((x) => x.status === "rodando"),
    aguardando: jobs.filter((x) => x.status === "aguardando").sort(porPosicao),
    pausados: jobs.filter((x) => x.status === "pausado").sort(porPosicao),
  };
}

/** Posições 0..n-1 na ordem escolhida; devolve só os jobs cuja posição muda. */
export function novasPosicoes(atuais: JobFila[], ordemIds: string[]): { id: string; posicao: number }[] {
  const porId = new Map(atuais.map((x) => [x.id, x]));
  return ordemIds
    .map((id, posicao) => ({ id, posicao }))
    .filter(({ id, posicao }) => porId.has(id) && porId.get(id)!.posicao !== posicao);
}

export function moverNaFila(ids: string[], id: string, direcao: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const alvo = i + direcao;
  if (i < 0 || alvo < 0 || alvo >= ids.length) return ids;
  const copia = [...ids];
  [copia[i], copia[alvo]] = [copia[alvo], copia[i]];
  return copia;
}

/** Posição para furar a fila: uma antes do primeiro que espera. */
export function posicaoNoTopo(aguardando: JobFila[]): number {
  return aguardando.length ? Math.min(...aguardando.map((x) => x.posicao)) - 1 : 0;
}

/** "Tentar de novo" só faz sentido para item que falhou e tem link para baixar. */
export function podeTentarDeNovo(item: { status: string; link: string | null }): boolean {
  return item.status === "falhou" && !!item.link;
}
