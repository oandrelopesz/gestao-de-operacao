// Regras puras da aba Links (sem dependências: roda no navegador e no `node --test`).

export interface LinkBase { id: string; nome: string; url: string; tema_id: string | null }

/** Filtros especiais da aba (além do id de cada tema). */
export const TODOS = "__todos__";
export const SEM_TEMA = "__sem_tema__";

/** Link digitado → URL completa (põe https:// quando falta). `null` = não parece um link. */
export function normalizarUrl(texto: string): string | null {
  const t = texto.trim();
  if (!t || /\s/.test(t)) return null;
  const comEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(comEsquema);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    return comEsquema;
  } catch {
    return null;
  }
}

export function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Links do filtro (tema, Sem tema ou Todos) que batem com a busca, em ordem alfabética. */
export function filtrarLinks<T extends LinkBase>(links: T[], filtro: string, busca: string): T[] {
  const q = semAcento(busca.trim());
  return links
    .filter((l) => filtro === TODOS || (filtro === SEM_TEMA ? !l.tema_id : l.tema_id === filtro))
    .filter((l) => !q || semAcento(l.nome).includes(q) || semAcento(l.url).includes(q))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
}

/** Quantos links por tema (e em Sem tema / Todos), para os filtros. */
export function contarPorTema(links: LinkBase[]): Record<string, number> {
  const r: Record<string, number> = { [TODOS]: links.length };
  for (const l of links) {
    const k = l.tema_id ?? SEM_TEMA;
    r[k] = (r[k] ?? 0) + 1;
  }
  return r;
}
