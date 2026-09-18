import { useEffect } from "react";

/**
 * Rede de segurança para os diálogos (Radix): eles só desmontam quando a animação de saída
 * termina, e o Chrome congela animações em abas em segundo plano. Se um diálogo fechar com a
 * aba escondida, o overlay e o `pointer-events: none` do body ficam presos e o sistema "trava".
 * 1. Marca <html data-hidden> enquanto a aba está escondida: o CSS desliga as animações e o
 *    Radix desmonta na hora.
 * 2. Ao voltar para a aba, se não houver diálogo aberto e o body ainda estiver bloqueado, libera.
 */
export function DialogSafety() {
  useEffect(() => {
    const sync = () => {
      document.documentElement.toggleAttribute("data-hidden", document.hidden);
      if (!document.hidden) {
        window.setTimeout(() => {
          const aberto = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
          if (!aberto && document.body.style.pointerEvents === "none") {
            document.body.style.pointerEvents = "";
          }
        }, 400);
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return null;
}
