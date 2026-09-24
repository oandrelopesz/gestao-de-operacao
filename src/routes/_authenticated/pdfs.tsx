import { createFileRoute, redirect } from "@tanstack/react-router";

// A aba "PDFs" virou "Arquivos": links e favoritos antigos continuam funcionando.
export const Route = createFileRoute("/_authenticated/pdfs")({
  validateSearch: (s: Record<string, unknown>): { pasta?: string } =>
    typeof s.pasta === "string" && s.pasta ? { pasta: s.pasta } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/arquivos", search, replace: true });
  },
});
