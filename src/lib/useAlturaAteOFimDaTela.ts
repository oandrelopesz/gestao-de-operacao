import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Altura máxima para uma caixa com rolagem terminar no fim da tela (tabelas largas: a barra de rolagem lateral fica
 * sempre à vista, sem rolar a página até embaixo). `topo` é a posição da caixa na página (não na tela), `folga` o
 * espaço que precisa sobrar embaixo (padding dos contêineres, barra do celular). Nunca menos que `minimo`.
 */
export function alturaAteOFimDaTela({ topo, tela, folga, minimo }: { topo: number; tela: number; folga: number; minimo: number }): number {
  return Math.max(minimo, Math.floor(tela - topo - folga));
}

/** Soma o espaço embaixo da caixa: padding e borda inferiores de cada contêiner até o body. */
function folgaAbaixo(el: HTMLElement): number {
  let soma = 0;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    soma += (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
  }
  return soma;
}

/**
 * Mede onde a caixa começa e devolve a altura máxima para ela acabar no fim da tela (`null` antes da 1ª medida).
 * Mede de novo quando a janela muda de tamanho ou quando algo acima da caixa cresce ou encolhe (filtros que quebram
 * linha, avisos). A nova medida espera um instante (setTimeout, não rAF, que para com a aba em segundo plano) para não
 * disparar o aviso de laço do ResizeObserver.
 */
export function useAlturaAteOFimDaTela(ref: RefObject<HTMLElement | null>, minimo = 320): number | null {
  const [altura, setAltura] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const topo = el.getBoundingClientRect().top + window.scrollY;
      setAltura(alturaAteOFimDaTela({ topo, tela: window.innerHeight, folga: folgaAbaixo(el) + 4, minimo }));
    };
    let espera = 0;
    const medirDepois = () => {
      window.clearTimeout(espera);
      espera = window.setTimeout(medir, 50);
    };
    medir();
    window.addEventListener("resize", medirDepois);
    // A entrada da página desliza 8 px (page-enter): medir de novo quando ela acaba
    document.addEventListener("animationend", medirDepois);
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medirDepois);
    observador?.observe(document.body);
    return () => {
      window.clearTimeout(espera);
      window.removeEventListener("resize", medirDepois);
      document.removeEventListener("animationend", medirDepois);
      observador?.disconnect();
    };
  }, [ref, minimo]);
  return altura;
}
