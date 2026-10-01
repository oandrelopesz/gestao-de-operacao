// Conclusão de curso (regras puras: rodam no navegador e no `node --test`).
// `concluido_em` é uma data AAAA-MM-DD; vazia = não concluído.

export type FiltroConclusao = "todos" | "nao_concluidos" | "concluidos";

type ComConclusao = { concluido_em?: string | null };

/** Lê o `?situacao=` da URL; qualquer valor desconhecido vira "todos". */
export function lerFiltroConclusao(v: unknown): FiltroConclusao {
  return v === "nao_concluidos" || v === "concluidos" ? v : "todos";
}

export function estaConcluido(c: ComConclusao): boolean {
  return !!c.concluido_em;
}

export function filtrarPorConclusao<T extends ComConclusao>(lista: T[], filtro: FiltroConclusao): T[] {
  if (filtro === "concluidos") return lista.filter((c) => estaConcluido(c));
  if (filtro === "nao_concluidos") return lista.filter((c) => !estaConcluido(c));
  return [...lista]; // sempre uma cópia: quem chama pode ordenar sem mexer na lista original
}

/** Separa nas seções da tela. Concluído vai só para `concluidos`, mesmo que `em_andamento` esteja ligado (dado antigo). */
export function agruparCursos<T extends ComConclusao & { em_andamento: boolean }>(
  lista: T[],
): { emAndamento: T[]; outros: T[]; concluidos: T[] } {
  const emAndamento: T[] = [];
  const outros: T[] = [];
  const concluidos: T[] = [];
  for (const c of lista) {
    if (estaConcluido(c)) concluidos.push(c);
    else if (c.em_andamento) emAndamento.push(c);
    else outros.push(c);
  }
  return { emAndamento, outros, concluidos };
}

/** O que gravar ao marcar/desmarcar. Concluir desliga o "em andamento"; desmarcar não o religa (volta como pausado). */
export function patchConclusao(
  concluir: boolean,
  hoje: string,
): { concluido_em: string; em_andamento: false } | { concluido_em: null } {
  return concluir ? { concluido_em: hoje, em_andamento: false } : { concluido_em: null };
}

/** "Concluído em 01/10/2026". Só o dia conta e não passa por `Date`, para o fuso não deslocá-lo. */
export function rotuloConclusao(concluido_em: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(concluido_em);
  return m ? `Concluído em ${m[3]}/${m[2]}/${m[1]}` : "Concluído";
}

export function contarConclusao<T extends ComConclusao & { em_andamento: boolean }>(
  lista: T[],
): { total: number; emAndamento: number; pausados: number; concluidos: number } {
  const g = agruparCursos(lista);
  return { total: lista.length, emAndamento: g.emAndamento.length, pausados: g.outros.length, concluidos: g.concluidos.length };
}
