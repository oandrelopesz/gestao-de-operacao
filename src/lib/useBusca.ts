import { useMemo } from "react";
import {
  buscarNoIndice,
  indexarBusca,
  palavrasDaBusca,
  type CamposBusca,
  type OpcoesBusca,
  type ResultadoBusca,
} from "./search.ts";

/**
 * Busca tolerante (sem acento, com erro de digitação, "parecidos") numa lista, no lugar do `.filter` das telas.
 * A lista é indexada uma vez por mudança de `itens` (ou de `deps`) e cada letra digitada só consulta o índice.
 *
 * - `itens`: precisa manter a mesma referência enquanto a lista não mudar (venha do useQuery/useState, ou de um useMemo).
 * - `campos`: o 1º é o campo principal (título/nome); os demais, secundários. Pode ser uma arrow nova a cada render:
 *   o índice só é refeito quando `itens`, `deps` ou a presença de busca mudam (sem busca, nada é indexado).
 * - `opcoes.deps`: para quando os campos dependem de outro estado (por exemplo, um mapa de nomes de cliente que chega
 *   depois). Mesmo tamanho a cada render.
 * - `opcoes.manterOrdem`: só filtra, sem reordenar (Kanban).
 *
 * Mostre `resultado.mensagem` com o componente `MensagemBusca` (src/components/MensagemBusca.tsx).
 */
export function useBusca<T>(
  itens: readonly T[],
  consulta: string,
  campos: CamposBusca<T>,
  opcoes?: OpcoesBusca & { deps?: readonly unknown[] },
): ResultadoBusca<T> {
  const manterOrdem = opcoes?.manterOrdem;
  // Sem palavras na busca não há o que indexar: a lista vale inteira (e mudar a lista, como no arrasto do Kanban, sai barato).
  const temBusca = palavrasDaBusca(consulta).length > 0;
  const indice = useMemo(
    () => (temBusca ? indexarBusca(itens, campos) : null),
    // `campos` fica de fora de propósito: costuma ser uma arrow nova a cada render; o que ele lê de outro estado vai em `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [temBusca, itens, ...(opcoes?.deps ?? [])],
  );
  return useMemo<ResultadoBusca<T>>(
    () => (indice ? buscarNoIndice(indice, consulta, { manterOrdem }) : { itens: itens.slice(), modo: "todos", mensagem: null }),
    [indice, consulta, manterOrdem, itens],
  );
}
