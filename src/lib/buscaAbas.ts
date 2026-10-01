// Busca de abas do menu lateral: usa a busca tolerante do sistema (src/lib/search.ts): sem acento e sem maiúscula, com
// erro de digitação, por sinônimo e pelo nome do grupo, e mostra "itens parecidos" quando nada bate por inteiro.
// Sem dependências de tela (roda no `node --test`).

import { buscar, type ResultadoBusca } from "./search.ts";

export interface ItemBusca {
  to: string;
  label: string;
  grupo: string;
  /** Sinônimos e termos relacionados ("prospecção" → CRM) */
  palavras?: string[];
}

/**
 * Abas que batem com a consulta. O nome da aba é o campo principal; sinônimos e o nome do grupo são secundários.
 * Sem texto o menu não lista nada: `itens` vazio e modo "todos" (o menu mostra os grupos normais).
 */
export function buscarAbas<T extends ItemBusca>(itens: readonly T[], consulta: string): ResultadoBusca<T> {
  const resultado = buscar(itens, consulta, (i) => [i.label, ...(i.palavras ?? []), i.grupo]);
  return resultado.modo === "todos" ? { ...resultado, itens: [] } : resultado;
}
