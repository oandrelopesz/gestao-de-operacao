import { useEffect, useRef } from "react";
import { renderBotaoGoogle } from "@/lib/googleAuth";

/**
 * Botão oficial "Entrar com Google". Ao escolher a conta, chama `onEntrou` — a partir daí o app
 * consegue o token do Drive em qualquer navegador, sem a chave.
 */
export function BotaoGoogleLogin({ clientId, onEntrou }: { clientId: string; onEntrou: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !clientId) return;
    renderBotaoGoogle(clientId, ref.current, () => onEntrou());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);
  return <div ref={ref} className="inline-block" />;
}
