import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Aparencia = "classica" | "painel" | "editorial";

const CHAVE = "aparencia";
// "classica" = visual original do sistema (sem bloco no CSS); é o padrão até o André escolher outra
const PADRAO: Aparencia = "classica";

const valida = (v: unknown): v is Aparencia => v === "classica" || v === "painel" || v === "editorial";

// Roda antes do React (junto do script do tema): sem flash na troca de aparência
export const APARENCIA_INIT_SCRIPT = `(function(){try{var a=localStorage.getItem("${CHAVE}");if(a!=="classica"&&a!=="painel"&&a!=="editorial"){a="${PADRAO}"}document.documentElement.setAttribute("data-aparencia",a)}catch(e){document.documentElement.setAttribute("data-aparencia","${PADRAO}")}})();`;

export function applyAparencia(a: Aparencia) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-aparencia", a);
}

// Estado único no próprio <html>: o seletor, a casca e o menu leem o mesmo atributo (o script de init já o preencheu)
function lerAtual(): Aparencia {
  if (typeof document === "undefined") return PADRAO;
  const v = document.documentElement.getAttribute("data-aparencia");
  return valida(v) ? v : PADRAO;
}

function assinar(avisar: () => void) {
  const o = new MutationObserver(avisar);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-aparencia"] });
  return () => o.disconnect();
}

export function useAparencia() {
  const aparencia = useSyncExternalStore(assinar, lerAtual, () => PADRAO);

  // Se a hidratação falhar, o React refaz o <html> e apaga o atributo posto pelo script de init: repõe o salvo
  useEffect(() => {
    if (valida(document.documentElement.getAttribute("data-aparencia"))) return;
    let salva: string | null = null;
    try {
      salva = window.localStorage.getItem(CHAVE);
    } catch {
      // sem armazenamento: fica o padrão
    }
    applyAparencia(valida(salva) ? salva : PADRAO);
  }, []);

  const setAparencia = useCallback((proxima: Aparencia) => {
    applyAparencia(proxima);
    try {
      window.localStorage.setItem(CHAVE, proxima);
    } catch {
      // sem armazenamento: vale só para a sessão
    }
  }, []);

  return { aparencia, setAparencia };
}
