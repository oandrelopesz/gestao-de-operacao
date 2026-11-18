import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { PastaAberta, Pastas } from "@/components/central/Central";

// Central de arquivos: uma pasta por cliente, com subpastas e arquivos no formato original (?cliente=<id>&pasta=a/b abre a pasta).
export const Route = createFileRoute("/_authenticated/central")({
  validateSearch: (s: Record<string, unknown>): { cliente?: string; pasta?: string; aba?: "pausados" | "churn" } => ({
    ...(s.aba === "pausados" || s.aba === "churn" ? { aba: s.aba } : {}),
    ...(typeof s.cliente === "string" && s.cliente ? { cliente: s.cliente } : {}),
    ...(typeof s.cliente === "string" && s.cliente && typeof s.pasta === "string" && s.pasta ? { pasta: s.pasta } : {}),
  }),
  component: CentralPage,
});

function CentralPage() {
  const navigate = useNavigate();
  const { cliente, pasta, aba } = Route.useSearch();
  // A aba (Pausados / Em churn) acompanha a URL, para o "Todas as pastas" voltar para a mesma aba
  const abrir = (id?: string, sub = "") => navigate({ to: "/central", search: { ...(aba ? { aba } : {}), ...(id ? { cliente: id, ...(sub ? { pasta: sub } : {}) } : {}) } });
  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FolderOpen size={24} /> Central de arquivos
      </h1>
      {cliente ? <PastaAberta clienteId={cliente} pasta={pasta ?? ""} onIr={(sub) => abrir(cliente, sub)} onVoltar={() => abrir()} /> : <Pastas onAbrir={abrir} aba={aba ?? "ativos"} onAba={(a) => navigate({ to: "/central", search: a === "ativos" ? {} : { aba: a } })} />}
    </div>
  );
}
