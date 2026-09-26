import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { CrmProvider, useCrm } from "@/components/crm/CrmContexto";
import { CrmTopo, type VisaoCrm } from "@/components/crm/CrmTopo";
import { KanbanCrm } from "@/components/crm/KanbanCrm";
import { FilaDoDia } from "@/components/crm/FilaDoDia";
import { PlanilhaCrm } from "@/components/crm/PlanilhaCrm";
import { DashboardCrm } from "@/components/crm/DashboardCrm";
import { FichaLead } from "@/components/crm/FichaLead";
import { DialogoMovimento } from "@/components/crm/DialogoMovimento";
import { NovoLeadDialog } from "@/components/crm/NovoLeadDialog";
import { ConfigurarColunas } from "@/components/crm/ConfigurarColunas";
import { CadastrarCliente } from "@/components/crm/CadastrarCliente";
import { agruparEventos, filtrarLeads, FILTRO_CRM_PADRAO, type FiltroCrm } from "@/lib/crmPeriodo";

export const Route = createFileRoute("/_authenticated/crm")({
  component: CrmPage,
});

function CrmPage() {
  return (
    <CrmProvider>
      <CrmTela />
    </CrmProvider>
  );
}

function lerLocal<T>(chave: string, padrao: T): T {
  try {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(chave) : null;
    return v ? { ...padrao, ...JSON.parse(v) } : padrao;
  } catch {
    return padrao;
  }
}

function gravarLocal(chave: string, valor: unknown) {
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // navegador sem armazenamento: só não lembra a escolha
  }
}

/** Relógio da tela: urgências e pontos mudam com o tempo */
function useAgora(intervaloMs: number) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return agora;
}

function CrmTela() {
  const { leads, eventos, carregando, erro } = useCrm();
  const [visao, setVisao] = useState<VisaoCrm>(() => lerLocal("crm-visao", { v: "kanban" as VisaoCrm }).v);
  const [filtro, setFiltro] = useState<FiltroCrm>(() => lerLocal("crm-filtro", FILTRO_CRM_PADRAO));
  const [novoLead, setNovoLead] = useState(false);
  const [configColunas, setConfigColunas] = useState(false);
  const agora = useAgora(60_000);

  useEffect(() => gravarLocal("crm-visao", { v: visao }), [visao]);
  useEffect(() => gravarLocal("crm-filtro", filtro), [filtro]);

  const porLead = useMemo(() => agruparEventos(eventos), [eventos]);
  const filtrados = useMemo(() => filtrarLeads(leads, porLead, filtro, agora), [leads, porLead, filtro, agora]);
  const eventosFiltrados = useMemo(() => {
    const ids = new Set(filtrados.map((l) => l.id));
    return eventos.filter((e) => ids.has(e.lead_id));
  }, [eventos, filtrados]);

  return (
    <div className="flex flex-col gap-4 min-h-[calc(100vh-8rem)]">
      <CrmTopo
        visao={visao}
        onVisao={setVisao}
        filtro={filtro}
        onFiltro={setFiltro}
        qtd={filtrados.length}
        onNovoLead={() => setNovoLead(true)}
        onColunas={() => setConfigColunas(true)}
      />
      {erro && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Não foi possível carregar o CRM: {erro}
        </div>
      )}
      {carregando ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="animate-spin" size={18} /> Carregando o CRM…
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          {visao === "fila" && <FilaDoDia leads={filtrados} />}
          {visao === "kanban" && <KanbanCrm leads={filtrados} />}
          {visao === "planilha" && <PlanilhaCrm leads={filtrados} />}
          {visao === "dashboard" && <DashboardCrm leads={filtrados} eventos={eventosFiltrados} />}
        </div>
      )}
      <FichaLead />
      <DialogoMovimento />
      <CadastrarCliente />
      <NovoLeadDialog aberto={novoLead} onFechar={() => setNovoLead(false)} />
      <ConfigurarColunas aberto={configColunas} onFechar={() => setConfigColunas(false)} />
    </div>
  );
}
