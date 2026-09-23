import { createRouter, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { routeTree } from "./routeTree.gen";
import { ehCodigoDesatualizado, recarregarUmaVez, instalarRecuperacaoGlobal } from "@/lib/recuperacaoErro";

// Erros de tela: primeiro o app tenta se recuperar sozinho (código de uma versão anterior do site →
// recarrega; outros erros → tenta de novo e, se persistir, recarrega). A tela de erro só aparece se
// nada disso resolver — ver src/lib/recuperacaoErro.ts.
function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    console.error("[GestorPro] erro de tela:", error);
    if (ehCodigoDesatualizado(error)) {
      if (!recarregarUmaVez()) setFalhou(true);
      return;
    }
    const chave = `gestorpro:nova-tentativa:${window.location.pathname}`;
    let ultima = 0;
    try { ultima = Number(window.sessionStorage.getItem(chave) || 0); } catch { /* sem sessionStorage */ }
    if (Date.now() - ultima > 10_000) {
      try { window.sessionStorage.setItem(chave, String(Date.now())); } catch { /* idem */ }
      const t = setTimeout(() => {
        router.invalidate();
        reset();
      }, 400);
      return () => clearTimeout(t);
    }
    if (!recarregarUmaVez()) setFalhou(true);
  }, [error, reset, router]);

  if (!falhou) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-background px-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Carregando…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Não foi possível abrir esta tela</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Recarregue a página. Se continuar acontecendo, avise com o texto abaixo.
        </p>
        {error?.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Recarregar página
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para Demandas
          </a>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  instalarRecuperacaoGlobal();
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
