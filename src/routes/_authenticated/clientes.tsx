import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Plus, Search, Users as UsersIcon, DollarSign, TrendingUp, Smile,
  MoreVertical, Pencil, Archive, Trash2, LayoutGrid, Table as TableIcon, Calendar,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClientForm, ClientFormValues } from "@/components/ClientForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AGENCIAS, AgenciaId, formatBRL, tempoDeCasa,
  NPS_STATUS_META, PAGAMENTO_META,
} from "@/lib/clientes";
import { cn } from "@/lib/utils";

type SearchParams = { agencia?: AgenciaId; view?: "cards" | "tabela"; subAgencia?: string };

export const Route = createFileRoute("/_authenticated/clientes")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    agencia: (["effect", "spike", "alt", "pessoais", "todos"].includes(search.agencia as string)
      ? (search.agencia as AgenciaId)
      : "todos"),
    view: search.view === "tabela" ? "tabela" : "cards",
    subAgencia: typeof search.subAgencia === "string" ? search.subAgencia : undefined,
  }),
  component: ClientesPage,
});

interface ClienteView {
  id: string;
  nome: string;
  agencia: AgenciaId;
  nicho: string | null;
  data_inicio: string;
  verba_ads: number;
  observacoes: string | null;
  arquivado: boolean;
  em_onboarding: boolean;
  status_operacional: "ativo" | "pausado" | "churn";
  ultima_nps_score: number | null;
  ultima_nps_data: string | null;
  nps_status: "ancora" | "saudavel" | "em_risco" | "critico" | "sem_avaliacao";
  demandas_ativas: number;
  status_pagamento_mes: "em_dia" | "pendente" | "atrasado" | null;
  tipo_verba: "mensal" | "total_periodo";
  verba_total_contratada: number | null;
  data_limite_verba: string | null;
  saldo_ads_summary?: string;
  plataformas_ativas?: string[];
}

function ClientesPage() {
  const { agencia, view, subAgencia } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [clientes, setClientes] = useState<ClienteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [operacionalFilter, setOperacionalFilter] = useState<string>("all_active");
  const [showPausados, setShowPausados] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClienteView | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchClientes(); }, []);

  const fetchClientes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("clientes_view" as any)
        .select("*")
        .eq("arquivado", false)
        .order("nome");
      
      if (error) {
        console.error("Erro detalhado fetchClientes:", error);
        toast.error(`Erro ao carregar clientes: ${error.message}`);
        return;
      }

      // Fetch platform summary for each client
      const { data: saldos, error: saldosError } = await supabase
        .from("saldo_ads_view")
        .select("cliente_id, plataformas, verba_diaria_calc");
      
      if (saldosError) {
        console.warn("Erro ao buscar saldos para enriquecimento:", saldosError);
      }
      
      const enrichedData = (data as any[] || []).map(cli => {
        const cliSaldos = (saldos || []).filter(s => s.cliente_id === cli.id);
        const summary = cliSaldos.map(s => {
          const platNames = s.plataformas && s.plataformas.length > 0 ? s.plataformas.join(", ") : "Outras";
          // We use verba_diaria_calc for consistent calculation
          const verba = (s.verba_diaria_calc || 0) * 30;
          return `${platNames} ${formatBRL(verba)}`;
        }).join(" / ");
        const allPlats = cliSaldos.flatMap(s => s.plataformas || []);
        const uniquePlats = Array.from(new Set(allPlats));
        return { ...cli, saldo_ads_summary: summary, plataformas_ativas: uniquePlats };
      });
      
      setClientes(enrichedData);
    } catch (err: any) {
      console.error("Erro inesperado em fetchClientes:", err);
      toast.error("Ocorreu um erro inesperado ao carregar a lista de clientes.");
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { effect: 0, spike: 0, alt: 0, pessoais: 0 };
    clientes.forEach((cli) => { c[cli.agencia] = (c[cli.agencia] || 0) + 1; });
    return c;
  }, [clientes]);

  const filtered = useMemo(() => {
    return clientes
      .filter((c) => agencia === "todos" ? true : c.agencia === agencia)
      .filter((c) => !subAgencia || c.agencia === subAgencia)
      .filter((c) => statusFilter === "all" || c.nps_status === statusFilter)
      .filter((c) => showPausados || c.status_operacional === "ativo")
      .filter((c) => !search || c.nome.toLowerCase().includes(search.toLowerCase()));
  }, [clientes, agencia, subAgencia, statusFilter, search, showPausados]);

  const metrics = useMemo(() => {
    const list = clientes.filter((c) => agencia === "todos" ? true : c.agencia === agencia);
    const ativosList = list.filter((c) => c.status_operacional === "ativo");
    
    const total = list.length;
    const ativos = ativosList.length;
    const pausados = list.filter((c) => c.status_operacional === "pausado").length;
    const churn = list.filter((c) => c.status_operacional === "churn").length;
    
    const verbaTotal = ativosList.reduce((acc, c) => {
      if (c.tipo_verba === "total_periodo" && c.verba_total_contratada !== null && c.data_inicio && c.data_limite_verba) {
        const inicio = new Date(c.data_inicio);
        const fim = new Date(c.data_limite_verba);
        const dias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
        return acc + ((Number(c.verba_total_contratada) / dias) * 30);
      }
      return acc + Number(c.verba_ads || 0);
    }, 0);
    
    const clientesComVerba = ativosList.filter((c) => (Number(c.verba_ads || 0) > 0 || Number(c.verba_total_contratada || 0) > 0)).length;
    const verbaMedia = clientesComVerba > 0 ? verbaTotal / clientesComVerba : 0;
    
    const ancora = ativosList.filter((c) => c.nps_status === "ancora").length;
    const saudavel = ativosList.filter((c) => c.nps_status === "saudavel").length;
    const em_risco = ativosList.filter((c) => c.nps_status === "em_risco").length;
    const critico = ativosList.filter((c) => c.nps_status === "critico").length;
    
    return { total, ativos, pausados, churn, verbaTotal, verbaMedia, ancora, saudavel, em_risco, critico };
  }, [clientes, agencia]);

  const agenciaMeta = agencia === "todos" 
    ? { id: "todos", label: "Todos", border: "border-l-primary" }
    : AGENCIAS.find((a) => a.id === agencia)!;

  const handleSave = async (values: ClientFormValues) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      if (editing) {
        const { error } = await supabase.from("clientes")
          .update({ ...values } as any).eq("id", editing.id);
        if (error) throw error;
        toast.success("Cliente atualizado");
      } else {
        const { error } = await supabase.from("clientes").insert([{
          ...values,
          user_id: user.id,
        }] as any);
        if (error) throw error;
        toast.success("Cliente criado");
      }
      setModalOpen(false);
      setEditing(null);
      fetchClientes();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: string) => {
    const { error } = await supabase.from("clientes")
      .update({ arquivado: true } as any).eq("id", id);
    if (error) toast.error("Erro ao arquivar");
    else { toast.success("Cliente arquivado"); fetchClientes(); }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from("clientes").delete().eq("id", deletingId);
    if (error) toast.error("Erro ao deletar");
    else { toast.success("Cliente deletado"); fetchClientes(); }
    setDeletingId(null);
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string>("");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes Ativos</h1>
          <p className="text-muted-foreground">Visão por agência, com NPS e financeiro consolidados.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => navigate({ search: { agencia, view: v as any } })}>
            <TabsList>
              <TabsTrigger value="cards" className="gap-1.5"><LayoutGrid size={14} />Cards</TabsTrigger>
              <TabsTrigger value="tabela" className="gap-1.5"><TableIcon size={14} />Tabela</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button className="gap-2" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus size={16} /> Novo cliente
          </Button>
        </div>
      </div>

      {/* Card global de investimento */}
      <div className="space-y-4">
        <Card className="bg-gradient-to-br from-primary/5 via-primary/10 to-transparent border-primary/20 shadow-sm overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-3 text-primary/10 group-hover:text-primary/20 transition-colors">
            <DollarSign size={80} strokeWidth={1} />
          </div>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Investimento total gerenciado/mês</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertCircle size={14} className="text-muted-foreground/60 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-[11px]">Considera clientes ativos com verba definida. Clientes com verba contratada por período são convertidos para equivalente mensal (verba_diaria × 30).</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-4xl font-extrabold tracking-tight text-primary">
                    {formatBRL(clientes.filter(c => c.status_operacional === "ativo").reduce((acc, c) => {
                      if (c.tipo_verba === "total_periodo" && c.verba_total_contratada !== null && c.data_inicio && c.data_limite_verba) {
                        const inicio = new Date(c.data_inicio);
                        const fim = new Date(c.data_limite_verba);
                        const dias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
                        return acc + ((Number(c.verba_total_contratada) / dias) * 30);
                      }
                      return acc + Number(c.verba_ads || 0);
                    }, 0))}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  {clientes.filter(c => c.status_operacional === "ativo" && (Number(c.verba_ads || 0) > 0 || Number(c.verba_total_contratada || 0) > 0)).length} clientes ativos em {new Set(clientes.filter(c => c.status_operacional === "ativo").map(c => c.agencia)).size} agências
                </p>
              </div>

              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {AGENCIAS.map(a => {
                  const agAtivos = clientes.filter(c => c.agencia === a.id && c.status_operacional === "ativo");
                  const agVerba = agAtivos.reduce((acc, c) => {
                    if (c.tipo_verba === "total_periodo" && c.verba_total_contratada !== null && c.data_inicio && c.data_limite_verba) {
                      const inicio = new Date(c.data_inicio);
                      const fim = new Date(c.data_limite_verba);
                      const dias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
                      return acc + ((Number(c.verba_total_contratada) / dias) * 30);
                    }
                    return acc + Number(c.verba_ads || 0);
                  }, 0);
                  return (
                    <button 
                      key={a.id} 
                      onClick={() => navigate({ search: { view, agencia: a.id } })}
                      className="text-left p-2 rounded-lg bg-background/50 border border-border/50 hover:bg-background/80 hover:border-primary/30 transition-all group/mini"
                    >
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase group-hover/mini:text-primary transition-colors">{a.label}</p>
                      <p className="text-sm font-bold">{formatBRL(agVerba)}</p>
                    </button>
                  );
                })}
              </div>

              <div className="border-l pl-6 hidden lg:block min-w-[180px]">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Verba média / cliente</p>
                <p className="text-xl font-bold">
                  {(() => {
                    const ativosComVerba = clientes.filter(c => c.status_operacional === "ativo" && (Number(c.verba_ads || 0) > 0 || Number(c.verba_total_contratada || 0) > 0));
                    if (ativosComVerba.length === 0) return "R$ 0,00";
                    const totalVerba = ativosComVerba.reduce((acc, c) => {
                      if (c.tipo_verba === "total_periodo" && c.verba_total_contratada !== null && c.data_inicio && c.data_limite_verba) {
                        const inicio = new Date(c.data_inicio);
                        const fim = new Date(c.data_limite_verba);
                        const dias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
                        return acc + ((Number(c.verba_total_contratada) / dias) * 30);
                      }
                      return acc + Number(c.verba_ads || 0);
                    }, 0);
                    return formatBRL(totalVerba / ativosComVerba.length);
                  })()}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Mediana: {(() => {
                    const values = clientes
                      .filter(c => c.status_operacional === "ativo" && (Number(c.verba_ads || 0) > 0 || Number(c.verba_total_contratada || 0) > 0))
                      .map(c => {
                        if (c.tipo_verba === "total_periodo" && c.verba_total_contratada !== null && c.data_inicio && c.data_limite_verba) {
                          const inicio = new Date(c.data_inicio);
                          const fim = new Date(c.data_limite_verba);
                          const dias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
                          return (Number(c.verba_total_contratada) / dias) * 30;
                        }
                        return Number(c.verba_ads || 0);
                      })
                      .sort((a, b) => a - b);
                    if (values.length === 0) return "R$ 0,00";
                    const mid = Math.floor(values.length / 2);
                    const median = values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
                    return formatBRL(median);
                  })()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sub-tabs por agência */}
      <Tabs value={agencia} onValueChange={(v) => navigate({ search: { view, agencia: v as AgenciaId, subAgencia: undefined } })}>
        <TabsList>
          <TabsTrigger value="todos" className="gap-2">
            Todos
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{clientes.length}</Badge>
          </TabsTrigger>
          {AGENCIAS.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="gap-2">
              {a.label}
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{counts[a.id] || 0}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Banner de fim de campanha próximo */}
      {(() => {
        const agora = new Date();
        const limite90dias = new Date();
        limite90dias.setDate(agora.getDate() + 90);
        
        const clientesFimProximo = clientes.filter(c => 
          c.status_operacional === "ativo" && 
          c.data_limite_verba && 
          new Date(c.data_limite_verba) > agora && 
          new Date(c.data_limite_verba) <= limite90dias
        );

        if (clientesFimProximo.length === 0 || (agencia !== "todos" && agencia !== "spike")) return null;

        const impactoTotal = clientesFimProximo.reduce((acc, c) => {
          if (c.verba_total_contratada && c.data_inicio && c.data_limite_verba) {
            const inicio = new Date(c.data_inicio);
            const fim = new Date(c.data_limite_verba);
            const dias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
            return acc + ((Number(c.verba_total_contratada) / dias) * 30);
          }
          return acc + Number(c.verba_ads || 0);
        }, 0);

        return (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 bg-amber-100 p-1.5 rounded-full text-amber-600">
                <AlertCircle size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-amber-900">⚠️ Campanhas com fim previsto nos próximos 90 dias</h4>
                <p className="text-sm text-amber-800/80">
                  {clientesFimProximo.length} {clientesFimProximo.length === 1 ? 'cliente vai' : 'clientes vão'} encerrar contratos em breve ({clientesFimProximo.map(c => c.nome).join(", ")}).
                </p>
                <p className="text-xs text-amber-700 font-medium mt-1">Impacto previsto: redução de {formatBRL(impactoTotal)}/mês na verba gerenciada</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-white hover:bg-amber-100 border-amber-200 text-amber-800 shrink-0"
              onClick={() => setSearch(clientesFimProximo.map(c => c.nome).join("|"))}
            >
              Ver detalhes
            </Button>
          </div>
        );
      })()}

      {/* Breakdown por agência (mini-cards) */}
      {agencia === "todos" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {AGENCIAS.map(a => {
            const agAtivos = clientes.filter(c => c.agencia === a.id && c.status_operacional === "ativo");
            const agVerba = agAtivos.reduce((acc, c) => {
              if (c.tipo_verba === "total_periodo" && c.verba_total_contratada !== null && c.data_inicio && c.data_limite_verba) {
                const inicio = new Date(c.data_inicio);
                const fim = new Date(c.data_limite_verba);
                const dias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
                return acc + ((Number(c.verba_total_contratada) / dias) * 30);
              }
              return acc + Number(c.verba_ads || 0);
            }, 0);
            const totalVerbaGlobal = clientes.filter(c => c.status_operacional === "ativo").reduce((acc, c) => {
              if (c.tipo_verba === "total_periodo" && c.verba_total_contratada !== null && c.data_inicio && c.data_limite_verba) {
                const inicio = new Date(c.data_inicio);
                const fim = new Date(c.data_limite_verba);
                const dias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
                return acc + ((Number(c.verba_total_contratada) / dias) * 30);
              }
              return acc + Number(c.verba_ads || 0);
            }, 0);
            const percent = totalVerbaGlobal > 0 ? (agVerba / totalVerbaGlobal) * 100 : 0;
            
            return (
              <button 
                key={a.id} 
                onClick={() => navigate({ search: { view, agencia: a.id } })}
                className="text-left p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-all group/breakdown"
              >
                <div className="flex justify-between items-start mb-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider group-hover/breakdown:text-primary">{a.label}</p>
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">{counts[a.id] || 0}</Badge>
                </div>
                <p className="text-sm font-bold">{formatBRL(agVerba)}</p>
                <p className="text-[9px] text-muted-foreground">{percent.toFixed(1)}% do total gerenciado</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Métricas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard 
          icon={<UsersIcon size={16} />} 
          label="Clientes" 
          value={String(metrics.total)} 
          hint={`${metrics.ativos} ativos / ${metrics.pausados} pausados / ${metrics.churn} churn`} 
        />
        <MetricCard 
          icon={<DollarSign size={16} />} 
          label="Verba total / mês" 
          value={formatBRL(metrics.verbaTotal)} 
          hint="Considera apenas clientes ativos" 
        />
        <MetricCard 
          icon={<TrendingUp size={16} />} 
          label="Verba média / cliente" 
          value={formatBRL(metrics.verbaMedia)} 
          hint="Considera apenas clientes ativos" 
        />
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Distribuição NPS</CardTitle>
            <Smile size={16} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="text-emerald-900 font-bold text-lg" title="Âncora">{metrics.ancora}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-emerald-500 font-bold text-lg" title="Saudável">{metrics.saudavel}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-amber-500 font-bold text-lg" title="Em risco">{metrics.em_risco}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-red-500 font-bold text-lg" title="Crítico">{metrics.critico}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-center">Âncora / Saudável / Risco / Crítico</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {agencia === "todos" && (
          <Select value={subAgencia || "all"} onValueChange={(v) => navigate({ search: { view, agencia, subAgencia: v === "all" ? undefined : v } })}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar por agência" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as agências</SelectItem>
              {AGENCIAS.map(a => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status NPS</SelectItem>
            <SelectItem value="ancora">Âncoras</SelectItem>
            <SelectItem value="saudavel">Saudáveis</SelectItem>
            <SelectItem value="em_risco">Em risco</SelectItem>
            <SelectItem value="critico">Críticos</SelectItem>
            <SelectItem value="sem_avaliacao">Sem avaliação</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-md border text-xs">
          <span className="font-medium">Mostrar pausados</span>
          <Checkbox checked={showPausados} onCheckedChange={(v) => setShowPausados(!!v)} />
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-56 rounded-lg bg-muted/40 animate-pulse" />)}
        </div>
      ) : clientes.length === 0 ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertCircle className="text-destructive" size={20} />
            <CardTitle className="text-destructive">Erro ao carregar dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-destructive/80">
              Não foi possível conectar ao banco de dados ou a view está indisponível. Verifique sua conexão e tente novamente.
            </p>
            <Button variant="outline" size="sm" onClick={fetchClientes} className="border-destructive/30 text-destructive hover:bg-destructive/10">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/20">
          <UsersIcon size={36} className="text-muted-foreground mb-3 opacity-50" />
          <h3 className="text-lg font-semibold">Nenhum cliente em {agencia === "todos" ? "Todos os Clientes" : agenciaMeta.label}</h3>
          <p className="text-muted-foreground mb-4 text-sm">Cadastre o primeiro cliente desta agência ou ajuste os filtros.</p>
          <Button className="gap-2" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus size={16} /> Novo cliente
          </Button>
        </div>
      ) : view === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => (
            <ClienteCard
              key={c.id}
              cliente={c}
              borderClass={agencia === "todos" ? (AGENCIAS.find(a => a.id === c.agencia)?.border || "border-l-primary") : agenciaMeta.border}
              showAgenciaBadge={agencia === "todos"}
              onEdit={() => { setEditing(c); setModalOpen(true); }}
              onArchive={() => handleArchive(c.id)}
              onDelete={() => { setDeletingId(c.id); setDeletingName(c.nome); }}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Nicho</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Verba/mês</TableHead>
                <TableHead>NPS</TableHead>
                <TableHead>Demandas</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const nps = NPS_STATUS_META[c.nps_status];
                const pag = c.status_pagamento_mes ? PAGAMENTO_META[c.status_pagamento_mes] : null;
                return (
                  <TableRow 
                    key={c.id}
                    className="group outline-none focus:bg-muted/50"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Delete" || e.key === "Backspace") {
                        setDeletingId(c.id);
                        setDeletingName(c.nome);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{c.nicho || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{tempoDeCasa(c.data_inicio)}</TableCell>
                    <TableCell>{formatBRL(c.verba_ads)}</TableCell>
                    <TableCell><Badge variant="outline" className={cn("font-normal", nps.classes)}>{nps.label}</Badge></TableCell>
                    <TableCell>{c.demandas_ativas}</TableCell>
                    <TableCell>{pag ? <Badge variant="outline" className={cn("font-normal", pag.classes)}>{pag.label}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[140px]">
                          <DropdownMenuItem onClick={() => { setEditing(c); setModalOpen(true); }}>
                            <Pencil size={14} className="mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleArchive(c.id)}>
                            <Archive size={14} className="mr-2" /> Arquivar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive" 
                            onClick={() => { setDeletingId(c.id); setDeletingName(c.nome); }}
                          >
                            <Trash2 size={14} className="mr-2" /> Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            <DialogDescription>Preencha os dados do cliente. O status é calculado a partir do NPS.</DialogDescription>
          </DialogHeader>
          <ClientForm
            loading={saving}
            onSubmit={handleSave}
            initialValues={editing ? {
              nome: editing.nome,
              agencia: editing.agencia as any,
              nicho: editing.nicho || "",
              data_inicio: editing.data_inicio,
              verba_ads: Number(editing.verba_ads || 0),
              observacoes: editing.observacoes || "",
              em_onboarding: editing.em_onboarding || false,
              status_operacional: editing.status_operacional || "ativo",
              tipo_verba: editing.tipo_verba || "mensal",
              verba_total_contratada: editing.verba_total_contratada || 0,
              data_limite_verba: editing.data_limite_verba || "",
            } : { agencia: agencia === "todos" ? "effect" : agencia } as any}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja remover {deletingName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O cliente e todos os seus registros vinculados serão permanentemente deletados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MetricCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ClienteCard({
  cliente, borderClass, showAgenciaBadge, onEdit, onArchive, onDelete,
}: {
  cliente: ClienteView;
  borderClass: string;
  showAgenciaBadge?: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const nps = NPS_STATUS_META[cliente.nps_status];
  const pag = cliente.status_pagamento_mes ? PAGAMENTO_META[cliente.status_pagamento_mes] : null;
  const obsTrim = cliente.observacoes && cliente.observacoes.length > 110
    ? cliente.observacoes.slice(0, 110) + "…"
    : cliente.observacoes;

  return (
    <Card 
      className={cn("border-l-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default flex flex-col group relative outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2", borderClass)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Delete" || e.key === "Backspace") onDelete();
      }}
    >
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[140px]">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil size={14} className="mr-2" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onArchive}>
              <Archive size={14} className="mr-2" /> Arquivar
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="text-destructive focus:text-destructive" 
              onClick={onDelete}
            >
              <Trash2 size={14} className="mr-2" /> Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 pr-6">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {showAgenciaBadge && (
                <Badge variant="outline" className={cn("text-[9px] h-4 px-1 font-bold uppercase tracking-tight", 
                  cliente.agencia === 'effect' && "border-blue-500 text-blue-500 bg-blue-500/5",
                  cliente.agencia === 'spike' && "border-violet-500 text-violet-500 bg-violet-500/5",
                  cliente.agencia === 'alt' && "border-amber-500 text-amber-500 bg-amber-500/5",
                  cliente.agencia === 'pessoais' && "border-emerald-500 text-emerald-500 bg-emerald-500/5",
                )}>
                  {AGENCIAS.find(a => a.id === cliente.agencia)?.label}
                </Badge>
              )}
              <CardTitle className="text-base font-semibold truncate">{cliente.nome}</CardTitle>
              {cliente.em_onboarding && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100 h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider shrink-0">
                  Onboarding
                </Badge>
              )}
              {Number(cliente.verba_ads || 0) === 0 && cliente.tipo_verba === "mensal" && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider shrink-0">
                  Sem verba
                </Badge>
              )}
              {(!cliente.data_inicio || (cliente.tipo_verba === "mensal" && !cliente.verba_ads)) && (
                <Badge variant="secondary" className="bg-red-100 text-red-700 hover:bg-red-100 h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider shrink-0">
                  Dados incompletos
                </Badge>
              )}
            </div>
            {cliente.nicho && <p className="text-xs text-muted-foreground mt-0.5 truncate">{cliente.nicho}</p>}
          </div>
          <Badge variant="outline" className={cn("font-normal text-[10px] shrink-0", nps.classes)}>
            <span className={cn("w-1.5 h-1.5 rounded-full mr-1", nps.dot)} />
            {nps.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1"><Calendar size={11} />{tempoDeCasa(cliente.data_inicio)}</span>
          <span className="text-muted-foreground">desde {new Date(cliente.data_inicio).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</span>
        </div>

        <div className="rounded-md bg-muted/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {cliente.tipo_verba === "total_periodo" ? "Verba Total Contratada" : "Verba de ads / mês"}
          </p>
          <p className="text-lg font-bold">
            {cliente.tipo_verba === "total_periodo" 
              ? formatBRL(cliente.verba_total_contratada || 0) 
              : formatBRL(cliente.verba_ads)}
          </p>
          {cliente.plataformas_ativas && cliente.plataformas_ativas.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2 mb-1">
              {cliente.plataformas_ativas.map(plat => (
                <Badge key={plat} variant="outline" className="text-[9px] h-4 px-1.5 font-normal">
                  {plat}
                </Badge>
              ))}
            </div>
          )}
          {cliente.saldo_ads_summary && (
            <p className="text-[10px] text-muted-foreground mt-1 font-medium border-t pt-1 italic">
              {cliente.saldo_ads_summary}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Última NPS</p>
            <p className="font-medium">
              {cliente.ultima_nps_score !== null
                ? <>Score {cliente.ultima_nps_score}/50 <span className="text-muted-foreground font-normal">· {cliente.ultima_nps_data ? new Date(cliente.ultima_nps_data).toLocaleDateString("pt-BR") : ""}</span></>
                : <span className="text-muted-foreground">—</span>}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Demandas ativas</p>
            <p className="font-medium">{cliente.demandas_ativas}</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pagamento do mês</p>
          {pag ? (
            <Badge variant="outline" className={cn("font-normal", pag.classes)}>{pag.label}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Sem registro</span>
          )}
        </div>

        {obsTrim && (
          <div className="text-xs text-muted-foreground border-t pt-2 leading-relaxed">{obsTrim}</div>
        )}
      </CardContent>
    </Card>
  );
}
