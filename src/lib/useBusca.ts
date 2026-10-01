import { useMemo, useRef } from "react";
import {
  buscarNoIndice,
  indexarBusca,
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
 *   o índice usa sempre a mais recente, mas só é refeito quando `itens` ou `deps` mudam.
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
  const camposRef = useRef(campos);
  camposRef.current = campos;
  const manterOrdem = opcoes?.manterOrdem;
  const indice = useMemo(
    () => indexarBusca(itens, (item) => camposRef.current(item)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itens, ...(opcoes?.deps ?? [])],
  );
  return useMemo(
    () => buscarNoIndice(indice, consulta, { manterOrdem }),
    [indice, consulta, manterOrdem],
  );
}
