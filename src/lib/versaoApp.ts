// O que fazer quando o sistema volta a ficar visível (app do iPhone saindo do segundo plano, aba reaberta):
// garante que o que foi publicado e o que foi salvo em outro aparelho apareça aqui.
// Sem dependências: roda no navegador e no `node --test`.

/** Abaixo disso (troca rápida de app/aba) nada acontece. */
export const AUSENCIA_MINIMA_MS = 60_000;

/** Nome do bundle principal publicado ("main-CG8qXbvs.js"); null no servidor de desenvolvimento. */
export function versaoDoHtml(html: string): string | null {
  return html.match(/\/assets\/(main-[\w-]+\.js)/)?.[1] ?? null;
}

export type AcaoAoVoltar = "nada" | "recarregar-app" | "avisar-versao" | "recarregar-pagina";

export function decidirAoVoltar(s: {
  ausenteMs: number;
  versaoAtual: string | null;
  versaoNova: string | null;
  /** Celular/app instalado (toque ou tela cheia); no computador só avisa, nunca mexe na tela sozinho. */
  celular: boolean;
  /** Janela (dialog) aberta: pode ter formulário pela metade — nunca recarrega. */
  janelaAberta: boolean;
}): AcaoAoVoltar {
  if (s.ausenteMs < AUSENCIA_MINIMA_MS) return "nada";
  const versaoMudou = !!s.versaoAtual && !!s.versaoNova && s.versaoAtual !== s.versaoNova;
  if (versaoMudou) return s.celular && !s.janelaAberta ? "recarregar-app" : "avisar-versao";
  if (s.celular && !s.janelaAberta) return "recarregar-pagina";
  return "nada";
}
