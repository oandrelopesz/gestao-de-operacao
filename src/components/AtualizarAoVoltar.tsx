import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { AUSENCIA_MINIMA_MS, decidirAoVoltar, versaoDoHtml } from "@/lib/versaoApp";

const ehCelular = () =>
  matchMedia("(pointer: coarse)").matches ||
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const janelaAberta = () => !!document.querySelector("[role=dialog], [role=alertdialog]");

async function versaoPublicada(): Promise<string | null> {
  try {
    const r = await fetch("/", { cache: "no-store" });
    return r.ok ? versaoDoHtml(await r.text()) : null;
  } catch {
    return null;
  }
}

/**
 * Ao voltar para o sistema depois de um tempo fora (app do iPhone em segundo plano, aba escondida):
 * versão nova publicada → recarrega o app no celular (ou avisa no computador / com janela aberta);
 * mesma versão → no celular, recarrega os dados da tela para trazer o que foi salvo em outro aparelho.
 */
export function AtualizarAoVoltar({ onRecarregarPagina }: { onRecarregarPagina: () => void }) {
  const versaoCarregada = useRef<string | null>(null);
  const escondidoEm = useRef<number | null>(null);
  const avisou = useRef(false);

  useEffect(() => {
    versaoCarregada.current = versaoDoHtml(document.documentElement.outerHTML);
    const aoMudar = async () => {
      if (document.visibilityState === "hidden") {
        escondidoEm.current = Date.now();
        return;
      }
      if (escondidoEm.current === null) return;
      const ausenteMs = Date.now() - escondidoEm.current;
      escondidoEm.current = null;
      if (ausenteMs < AUSENCIA_MINIMA_MS) return;
      const acao = decidirAoVoltar({
        ausenteMs,
        versaoAtual: versaoCarregada.current,
        versaoNova: await versaoPublicada(),
        celular: ehCelular(),
        janelaAberta: janelaAberta(),
      });
      if (acao === "recarregar-app") window.location.reload();
      else if (acao === "recarregar-pagina") onRecarregarPagina();
      else if (acao === "avisar-versao" && !avisou.current) {
        avisou.current = true;
        toast("Nova versão do Gestor Pro", {
          description: "Atualize para ver as novidades.",
          duration: Infinity,
          action: { label: "Atualizar", onClick: () => window.location.reload() },
        });
      }
    };
    document.addEventListener("visibilitychange", aoMudar);
    return () => document.removeEventListener("visibilitychange", aoMudar);
  }, [onRecarregarPagina]);

  return null;
}
