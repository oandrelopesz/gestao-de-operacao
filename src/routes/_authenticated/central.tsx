import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { PastaAberta, Pastas } from "@/components/central/Central";

// Central de arquivos: uma pasta por cliente com fotos e logos no formato original (?cliente=<id> abre a pasta).
export const Route = createFileRoute("/_authenticated/central")({
  validateSearch: (s: Record<string, unknown>): { cliente?: string } =>
    typeof s.cliente === "string" && s.cliente ? { cliente: s.cliente } : {},
  component: CentralPage,
});

function CentralPage() {
  const navigate = useNavigate();
  const { cliente } = Route.useSearch();
  const abrir = (id?: string) => navigate({ to: "/central", search: id ? { cliente: id } : {} });
  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FolderOpen size={24} /> Central de arquivos
      </h1>
      {cliente ? <PastaAberta clienteId={cliente} onVoltar={() => abrir()} /> : <Pastas onAbrir={abrir} />}
    </div>
  );
}
