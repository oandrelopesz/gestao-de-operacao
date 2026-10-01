// Regras puras da aba Notas (sem dependências: roda no navegador e no `node --test`).
import { buscar, type ResultadoBusca } from "./search.ts";

export interface NotaBase { id: string; titulo: string; conteudo: string; tema_id: string | null; updated_at: string }

/** Filtros especiais da aba (além do id de cada tema). */
export const TODOS = "__todos__";
export const SEM_TEMA = "__sem_tema__";

/**
 * Notas do filtro (tema, Sem tema ou Todos) que batem com a busca. O tema vale antes e a ordem "editadas por último
 * primeiro" também: sem busca a lista sai assim e, com busca, as mais parecidas primeiro (no empate, as editadas por
 * último). A busca é tolerante (sem acento, com erro de digitação) no título e depois no texto.
 */
export function filtrarNotas<T extends NotaBase>(notas: T[], filtro: string, busca: string): ResultadoBusca<T> {
  const base = notas
    .filter((n) => filtro === TODOS || (filtro === SEM_TEMA ? !n.tema_id : n.tema_id === filtro))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return buscar(base, busca, (n) => [n.titulo, n.conteudo]);
}

/** Quantas notas por tema (e em Sem tema / Todos), para os filtros. */
export function contarPorTema(notas: Pick<NotaBase, "tema_id">[]): Record<string, number> {
  const r: Record<string, number> = { [TODOS]: notas.length };
  for (const n of notas) {
    const k = n.tema_id ?? SEM_TEMA;
    r[k] = (r[k] ?? 0) + 1;
  }
  return r;
}

/** Título vazio vira a primeira linha do texto (até 80 caracteres). */
export function tituloOuPrimeiraLinha(titulo: string, conteudo: string): string {
  const t = titulo.trim();
  if (t) return t;
  const linha = conteudo.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  return linha.length > 80 ? `${linha.slice(0, 79).trimEnd()}…` : linha;
}

/** Texto do card: sem repetir a primeira linha quando ela é o próprio título. */
export function previaSemTitulo(titulo: string, conteudo: string): string {
  const linhas = conteudo.replace(/\r\n/g, "\n").split("\n");
  const i = linhas.findIndex((l) => l.trim());
  if (i >= 0 && linhas[i].trim() === titulo.trim()) linhas.splice(0, i + 1);
  return linhas.join("\n").trim();
}
