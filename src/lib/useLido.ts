import { useEffect, useState } from "react";
import { getCached } from "@/lib/pageCache";

/**
 * Só leitura, para as telas que juntam dados de várias abas (Hoje, ficha do cliente): abre com o cache da aba
 * (`chave`) e depois traz o atual pelo carregador. Nunca grava no cache, para não mudar o comportamento das abas.
 * Falha mantém o que já tinha e liga `erro`.
 */
export function useLido<T>(chave: string | null, carregar: () => Promise<T>, deps: unknown[] = []) {
  const [v, setV] = useState<T | undefined>(() => (chave ? getCached<T>(chave) : undefined));
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let vivo = true;
    setErro(false);
    carregar()
      .then((d) => vivo && setV(d))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { v, erro };
}
