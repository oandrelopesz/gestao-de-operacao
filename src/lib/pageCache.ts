import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Cache em memória compartilhado entre as abas.
 *
 * Cada página guarda aqui a última lista que carregou; ao voltar para a aba o
 * conteúdo aparece na hora (sem "Carregando...") e a página só atualiza em
 * segundo plano. O cache vive enquanto a aba do navegador estiver aberta.
 */
const store = new Map<string, unknown>();

export function hasCached(key: string): boolean {
  return store.has(key);
}

export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, value);
}

export function clearCache(key?: string): void {
  if (key) store.delete(key);
  else store.clear();
}

/**
 * Substituto direto de useState para a lista principal de uma página:
 * inicia com o valor em cache (se houver) e mantém o cache atualizado a cada set.
 */
export function useCachedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (value) => {
      setState((prev) => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        store.set(key, next);
        return next;
      });
    },
    [key]
  );

  return [state, set];
}
