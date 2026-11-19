import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, Search, Users as UsersIcon, DollarSign, TrendingUp, Smile,
  MoreVertical, Pencil, Archive, Trash2, LayoutGrid, Table as TableIcon, Calendar, Play, Pause,
  AlertCircle, Settings2, ArchiveRestore, UserMinus, UserRound
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
import { PausaLoteDialog } from "@/components/PausaLoteDialog";
import { supabase } from "@/integrations/supabase/client";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS, loadClientesView, loadClientesArquivados } from "@/lib/data";
import { toast } from "sonner";
import {
  formatBRL, tempoDeCasa, type OperacaoResumo,
  NPS_STATUS_META,
} from "@/lib/clientes";
import { useAgencias, agenciaBadgeStyle, agenciaBorderStyle } from "@/lib/agencias";
import { saveCliente, loadClienteFormValues, setTrafegoAtivo, type ClienteFormInitial } from "@/lib/clientesService";
import { formatMoeda } from "@/lib/moedas";
import { cn } from "@/lib/utils";
import { useBusca } from "@/lib/useBusca";
import { MENSAGEM_NENHUM, normalizarBusca, type ResultadoBusca } from "@/lib/search";
import { MensagemBusca } from "@/components/MensagemBusca";
import { ClientesChurn } from "@/components/clientes/ClientesChurn";
import { ClientesPausados } from "@/components/clientes/ClientesPausados";
import { useAparencia } from "@/lib/aparencia";

/** "Abrir ficha" no menu do cliente: a ficha é do front novo, então só aparece fora da aparência Clássica */
function ItemFicha({ id }: { id: string }) {
  const { aparencia } = useAparencia();
  if (aparencia === "classica") return null;
  return (
    <DropdownMenuItem asChild>
      <Link to="/cliente/$id" params={{ id }}>
        <UserRound size={14} className="mr-2" /> Abrir ficha
      </Link>
    </DropdownMenuItem>
  );
}

type SearchParams = { agencia?: string; view?: "cards" | "tabela"; subAgencia?: string; aba?: "churn" | "pausados" };

export const Route = createFileRoute("/_authenticated/clientes")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    agencia: typeof search.agencia === "string" && search.agencia ? search.agencia : "todos",
    view: search.view === "tabela" ? "tabela" : "cards",
    subAgencia: typeof search.subAgencia === "string" ? search.subAgencia : undefined,
    aba: search.aba === "churn" || search.aba === "pausados" ? search.aba : undefined,
  }),
  component: ClientesPage,
});

interface ClienteView {
  id: string;
  nome: string;
  agencia: string;
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
  /** A view ainda devolve (constante "em_dia"), mas a tela não mostra mais */
  status_pagamento_mes: "em_dia" | "pendente" | "atrasado" | null;
  tipo_verba: "mensal" | "total_periodo";
  verba_total_contratada: number | null;
  data_limite_verba: string | null;
  saldo_ads_summary?: string;
  plataformas_ativas?: string[];
  /** Verba mensal equivalente em BRL somando as operações ativas (0 se o tráfego está desligado) */
  verba_mensal_brl: number | null;
  qtd_operacoes: number | null;
  operacoes: OperacaoResumo[];
  trafego_ativo: boolean;
}

/** Verba mensal em reais que entra nos totais (já convertida pela cotação do dia) */
const verbaMensal = (c: ClienteView) => Number(c.verba_mensal_brl || 0);
const temVerba = (c: ClienteView) => c.trafego_ativo !== false && verbaMensal(c) > 0;

function ClientesPage() {
  const { agencia, view, subAgencia, aba } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { agencias, meta: agenciaMetaOf, label: agenciaLabelOf } = useAgencias();

  const [clientes, setClientes] = useCachedState<ClienteView[]>(CACHE_KEYS.clientesView, []);
  const [loading, setLoading] = useState(!hasCached(CACHE_KEYS.clientesView));
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [operacionalFilter, setOperacionalFilter] = useState<string>("all_active");
  const [showArquivados, setShowArquivados] = useState(false);
  /** Valor atual do controle para quem roda depois (o "Desfazer" do aviso guarda uma versão antiga da tela) */
  const showArquivadosRef = useRef(showArquivados);
  showArquivadosRef.current = showArquivados;
  /** Arquivados ficam numa lista própria, fora do cache dos ativos: resumo, NPS e verba contam só os ativos */
  const [arquivados, setArquivados] = useState<ClienteView[]>([]);
  const [loadingArquivados, setLoadingArquivados] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClienteView | null>(null);
  /** Cadastro completo (cliente + forma de pagamento e verba de cada plataforma) do cliente em edição */
  const [editingValues, setEditingValues] = useState<ClienteFormInitial | null>(null);
  const [saving, setSaving] = useState(false);

  const openEdit = async (cliente: ClienteView) => {
    setEditing(cliente);
    setEditingValues(null);
    setModalOpen(true);
    try {
      setEditingValues(await loadClienteFormValues(cliente.id));
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar cliente");
      setModalOpen(false);
      setEditing(null);
    }
  };

  useEffect(() => { fetchClientes(); }, []);

  const fetchClientes = async () => {
    // Com cache, atualiza em segundo plano sem esconder o conteúdo
    if (!hasCached(CACHE_KEYS.clientesView)) setLoading(true);
    try {
      setClientes((await loadClientesView()) as ClienteView[]);
      setFetchError(null);
    } catch (err: any) {
      console.error("Erro ao carregar clientes:", err);
      setFetchError(err?.message || "Erro inesperado");
      toast.error(`Erro ao carregar clientes: ${err?.message || ""}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchArquivados = async () => {
    setLoadingArquivados(true);
    try {
      setArquivados((await loadClientesArquivados()) as ClienteView[]);
    } catch (err: any) {
      console.error("Erro ao carregar clientes arquivados:", err);
      toast.error("Erro ao carregar arquivados: " + (err?.message || ""));
    } finally {
      setLoadingArquivados(false);
    }
  };

  useEffect(() => { if (showArquivados) fetchArquivados(); }, [showArquivados]);

  /** Arquivar, restaurar e remover mudam as duas listas; os arquivados só são buscados com o controle ligado
   *  (ao ligar, o efeito acima busca). Lê o ref: o "Desfazer" do aviso chega aqui com o estado do clique. */
  const recarregarListas = () => Promise.all([fetchClientes(), showArquivadosRef.current ? fetchArquivados() : undefined]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    clientes.forEach((cli) => { c[cli.agencia] = (c[cli.agencia] || 0) + 1; });
    return c;
  }, [clientes]);

  const baseFiltrada = useMemo(() => {
    // Ativos primeiro, arquivados no fim; os cartões de resumo continuam usando só "clientes"
    // Quem já está nos ativos sai dos arquivados: na recarga em paralelo (restaurar/arquivar) as duas listas
    // podem se cruzar por um instante e o mesmo cliente apareceria duas vezes
    const idsAtivos = new Set(clientes.map((c) => c.id));
    const base = showArquivados ? [...clientes, ...arquivados.filter((c) => !idsAtivos.has(c.id))] : clientes;
    return base
      .filter((c) => agencia === "todos" ? true : c.agencia === agencia)
      .filter((c) => !subAgencia || c.agencia === subAgencia)
      .filter((c) => statusFilter === "all" || c.nps_status === statusFilter)
      .filter((c) => c.status_operacional !== "pausado");
  }, [clientes, arquivados, showArquivados, agencia, subAgencia, statusFilter]);

  // "Ver detalhes" do aviso de fim de contrato escreve "Nome A|Nome B": a busca por texto não faz "ou",
  // então cada nome entre "|" é um cliente exato e o resultado é só esses, na ordem da tela.
  const nomesDoAviso = useMemo(() => {
    if (!search.includes("|")) return null;
    const nomes = new Set(search.split("|").map(normalizarBusca).filter(Boolean));
    // Só "|" digitado (sem nome): vale como busca vazia
    return nomes.size ? nomes : null;
  }, [search]);
  // Busca tolerante no nome (e na agência): os outros filtros e a ordem da tela vêm antes
  const resultadoTexto = useBusca(baseFiltrada, nomesDoAviso ? "" : search, (c) => [c.nome, agenciaLabelOf(c.agencia)], { deps: [agenciaLabelOf] });
  const resultadoBusca = useMemo<ResultadoBusca<ClienteView>>(() => {
    if (!nomesDoAviso) return resultadoTexto;
    const itens = baseFiltrada.filter((c) => nomesDoAviso.has(normalizarBusca(c.nome)));
    return itens.length ? { itens, modo: "exato", mensagem: null } : { itens, modo: "nenhum", mensagem: MENSAGEM_NENHUM };
  }, [nomesDoAviso, baseFiltrada, resultadoTexto]);
  const filtered = resultadoBusca.itens;

  const metrics = useMemo(() => {
    const list = clientes.filter((c) => agencia === "todos" ? true : c.agencia === agencia);
    const ativosList = list.filter((c) => c.status_operacional === "ativo");
    
    const total = list.length;
    const ativos = ativosList.length;
    const churn = list.filter((c) => c.status_operacional === "churn").length;
    
    const verbaTotal = ativosList.reduce((acc, c) => {
      return acc + verbaMensal(c);
    }, 0);
    
    const clientesComVerba = ativosList.filter((c) => temVerba(c)).length;
    const verbaMedia = clientesComVerba > 0 ? verbaTotal / clientesComVerba : 0;
    
    const ancora = ativosList.filter((c) => c.nps_status === "ancora").length;
    const saudavel = ativosList.filter((c) => c.nps_status === "saudavel").length;
    const em_risco = ativosList.filter((c) => c.nps_status === "em_risco").length;
    const critico = ativosList.filter((c) => c.nps_status === "critico").length;
    
    return { total, ativos, churn, verbaTotal, verbaMedia, ancora, saudavel, em_risco, critico };
  }, [clientes, agencia]);

  const agenciaMeta = agencia === "todos"
    ? { id: "todos", label: "Todos", hex: undefined as string | undefined }
    : (agenciaMetaOf(agencia) ?? { id: agencia, label: agencia, hex: undefined as string | undefined });

  const handleSave = async (values: ClientFormValues) => {
    setSaving(true);
    try {
      // Fluxo único de gravação (usado também por Saldo e Prospecção)
      await saveCliente(values, editing?.id ?? null);
      toast.success(editing ? "Cliente atualizado" : "Cliente criado");
      setModalOpen(false);
      setEditing(null);
      fetchClientes();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTrafego = async (c: ClienteView) => {
    const ligar = c.trafego_ativo === false;
    try {
      await setTrafegoAtivo(c.id, ligar);
      toast.success(ligar ? `Tráfego de ${c.nome} ativado: a verba já entra nos totais` : `Tráfego de ${c.nome} pausado`);
      fetchClientes();
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar tráfego");
    }
  };

  const handleArchive = async (id: string) => {
    const { error } = await supabase.from("clientes")
      .update({ arquivado: true } as any).eq("id", id);
    if (error) { toast.error("Erro ao arquivar"); return; }
    toast.success("Cliente arquivado", { duration: 8000, action: { label: "Desfazer", onClick: () => handleRestore(id) } });
    recarregarListas();
  };

  const handleRestore = async (id: string) => {
    const { error } = await supabase.from("clientes")
      .update({ arquivado: false } as any).eq("id", id);
    if (error) { toast.error("Erro ao restaurar"); return; }
    toast.success("Cliente restaurado.");
    recarregarListas();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from("clientes").delete().eq("id", deletingId);
    if (error) toast.error("Erro ao deletar");
    else { toast.success("Cliente deletado"); recarregarListas(); }
    setDeletingId(null);
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pausaLote, setPausaLote] = useState<{ id: string; nome: string } | null>(null);
  const [deletingName, setDeletingName] = useState<string>("");

  const abas = (
    <Tabs value={aba ?? "ativos"} onValueChange={(v) => navigate({ search: v === "churn" || v === "pausados" ? { aba: v } : { agencia: "todos", view: "cards" } })}>
      <TabsList>
        <TabsTrigger value="ativos" className="gap-1.5"><UsersIcon size={14} />Ativos</TabsTrigger>
        <TabsTrigger value="pausados" className="gap-1.5"><span className="h-2 w-2 rounded-full bg-yellow-500" aria-hidden />Pausados</TabsTrigger>
        <TabsTrigger value="churn" className="gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />Em churn</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (aba === "pausados") {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">Clientes Pausados</h1>
          {abas}
        </div>
        <ClientesPausados />
      </div>
    );
  }

  if (aba === "churn") {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">Clientes em Churn</h1>
          {abas}
        </div>
        <ClientesChurn />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes Ativos</h1>
          <p className="text-muted-foreground">Visão por agência, com verba de ads, NPS e demandas de cada cliente.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {abas}
          <Tabs value={view} onValueChange={(v) => navigate({ search: { agencia, view: v as any } })}>
            <TabsList>
              <TabsTrigger value="cards" className="gap-1.5"><LayoutGrid size={14} />Cards</TabsTrigger>
              <TabsTrigger value="tabela" className="gap-1.5"><TableIcon size={14} />Tabela</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button className="gap-2" onClick={() => { setEditing(null); setEditingValues(null); setModalOpen(true); }}>
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
                  <h2 className="numeric text-4xl font-bold tracking-tight text-brand">
                    {formatBRL(clientes.filter(c => c.status_operacional === "ativo").reduce((acc, c) => {
                      return acc + verbaMensal(c);
                    }, 0))}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  {clientes.filter(c => c.status_operacional === "ativo" && temVerba(c)).length} clientes ativos em {new Set(clientes.filter(c => c.status_operacional === "ativo").map(c => c.agencia)).size} agências
                </p>
              </div>

              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {agencias.map(a => {
                  const agAtivos = clientes.filter(c => c.agencia === a.id && c.status_operacional === "ativo");
                  const agVerba = agAtivos.reduce((acc, c) => {
                    return acc + verbaMensal(c);
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
                    const ativosComVerba = clientes.filter(c => c.status_operacional === "ativo" && temVerba(c));
                    if (ativosComVerba.length === 0) return "R$ 0,00";
                    const totalVerba = ativosComVerba.reduce((acc, c) => {
                      return acc + verbaMensal(c);
                    }, 0);
                    return formatBRL(totalVerba / ativosComVerba.length);
                  })()}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Mediana: {(() => {
                    const values = clientes
                      .filter(c => c.status_operacional === "ativo" && temVerba(c))
                      .map(c => {
                        return verbaMensal(c);
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
      <div className="flex items-center gap-2 flex-wrap">
      <Tabs value={agencia} onValueChange={(v) => navigate({ search: { view, agencia: v, subAgencia: undefined } })} className="min-w-0 max-w-full">
        <TabsList>
          <TabsTrigger value="todos" className="gap-2">
            Todos
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{clientes.length}</Badge>
          </TabsTrigger>
          {agencias.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="gap-2">
              {a.label}
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{counts[a.id] || 0}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
        <Link to="/admin"><Settings2 size={14} /> Gerenciar agências</Link>
      </Button>
      </div>

      {/* Banner de fim de campanha próximo */}
      {(() => {
        const agora = new Date();
        const limite90dias = new Date();
        limite90dias.setDate(agora.getDate() + 90);
        
        // Operações com verba total cujo período termina nos próximos 90 dias
        const opFimProxima = (c: ClienteView) => c.operacoes.filter((op) =>
          op.tipo_verba === "total_periodo" && op.data_limite_verba &&
          new Date(op.data_limite_verba) > agora && new Date(op.data_limite_verba) <= limite90dias);
        const clientesFimProximo = clientes.filter(c => c.status_operacional === "ativo" && c.trafego_ativo !== false && opFimProxima(c).length > 0);

        if (clientesFimProximo.length === 0 || (agencia !== "todos" && agencia !== "spike")) return null;

        const impactoTotal = clientesFimProximo.reduce((acc, c) => acc + opFimProxima(c).reduce((a, op) => a + Number(op.verba_mensal_brl || 0), 0), 0);

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
          {agencias.map(a => {
            const agAtivos = clientes.filter(c => c.agencia === a.id && c.status_operacional === "ativo");
            const agVerba = agAtivos.reduce((acc, c) => {
              return acc + verbaMensal(c);
            }, 0);
            const totalVerbaGlobal = clientes.filter(c => c.status_operacional === "ativo").reduce((acc, c) => {
              return acc + verbaMensal(c);
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard 
          icon={<UsersIcon size={16} />} 
          label="Clientes" 
          value={String(metrics.total)} 
          hint={`${metrics.ativos} ativos / ${metrics.churn} em churn (contrato em vigor)`} 
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
              {agencias.map(a => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
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
          <span className="font-medium">Mostrar arquivados</span>
          <Checkbox aria-label="Mostrar arquivados" checked={showArquivados} onCheckedChange={(v) => setShowArquivados(!!v)} />
          {showArquivados && loadingArquivados && <span className="text-muted-foreground">Carregando...</span>}
        </div>
      </div>

      {/* Conteúdo */}
      {!loading && !fetchError && resultadoBusca.modo === "parecidos" && (
        <MensagemBusca resultado={resultadoBusca} className="-mb-3" />
      )}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-56 rounded-lg bg-muted/40 animate-pulse" />)}
        </div>
      ) : fetchError ? (
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
          {resultadoBusca.modo === "nenhum" && baseFiltrada.length > 0 ? (
            <MensagemBusca resultado={resultadoBusca} className="mb-4 text-lg font-semibold text-foreground" />
          ) : (
            <>
              <h3 className="text-lg font-semibold">
                {clientes.length === 0 ? "Nenhum cliente cadastrado ainda" : `Nenhum cliente em ${agencia === "todos" ? "Todos os Clientes" : agenciaMeta.label}`}
              </h3>
              <p className="text-muted-foreground mb-4 text-sm">
                {clientes.length === 0 ? "Cadastre o primeiro cliente — ele aparece automaticamente em Saldo, NPS e Demandas." : "Cadastre o primeiro cliente desta agência ou ajuste os filtros."}
              </p>
            </>
          )}
          <Button className="gap-2" onClick={() => { setEditing(null); setEditingValues(null); setModalOpen(true); }}>
            <Plus size={16} /> Novo cliente
          </Button>
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => (
            <ClienteCard
              key={c.id}
              cliente={c}
              borderColor={agencia === "todos" ? agenciaMetaOf(c.agencia)?.hex : agenciaMeta.hex}
              showAgenciaBadge={agencia === "todos"}
              onEdit={() => openEdit(c)}
              onArchive={() => handleArchive(c.id)}
              onRestore={() => handleRestore(c.id)}
              onDelete={() => { setDeletingId(c.id); setDeletingName(c.nome); }}
              onToggleTrafego={() => handleToggleTrafego(c)}
              onPausaLote={() => setPausaLote({ id: c.id, nome: c.nome })}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                {agencia === "todos" && <TableHead>Agência</TableHead>}
                <TableHead>Nicho</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Verba/mês</TableHead>
                <TableHead>NPS</TableHead>
                <TableHead>Demandas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const nps = NPS_STATUS_META[c.nps_status];
                return (
                  <TableRow 
                    key={c.id}
                    className={cn("group outline-none focus:bg-muted/50", c.arquivado && "opacity-70")}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Delete" || e.key === "Backspace") {
                        setDeletingId(c.id);
                        setDeletingName(c.nome);
                      }
                    }}
                  >
                    <TableCell className="font-medium">
                      {c.nome}
                      {c.arquivado && (
                        <Badge variant="secondary" className="ml-2 bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider">
                          Arquivado
                        </Badge>
                      )}
                    </TableCell>
                    {agencia === "todos" && (
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-bold uppercase" style={agenciaBadgeStyle(agenciaMetaOf(c.agencia)?.hex)}>
                          {agenciaLabelOf(c.agencia)}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">{c.nicho || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{tempoDeCasa(c.data_inicio)}</TableCell>
                    <TableCell>
                      {c.trafego_ativo === false
                        ? <span className="text-muted-foreground text-xs">Sem tráfego</span>
                        : <>{formatBRL(verbaMensal(c))}{(c.qtd_operacoes || 0) > 1 && <span className="text-muted-foreground text-xs"> · {c.qtd_operacoes} operações</span>}</>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={cn("font-normal", nps.classes)}>{nps.label}</Badge></TableCell>
                    <TableCell>{c.demandas_ativas}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[200px]">
                          <ItemFicha id={c.id} />
                          {c.arquivado ? (
                            <DropdownMenuItem onClick={() => handleRestore(c.id)}>
                              <ArchiveRestore size={14} className="mr-2" /> Restaurar
                            </DropdownMenuItem>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={() => openEdit(c)}>
                                <Pencil size={14} className="mr-2" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleTrafego(c)}>
                                {c.trafego_ativo === false ? <><Play size={14} className="mr-2" /> Ativar tráfego</> : <><Pause size={14} className="mr-2" /> Pausar tráfego</>}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setPausaLote({ id: c.id, nome: c.nome })}>
                                <Pause size={14} className="mr-2" /> Pausar/retomar plataformas
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleArchive(c.id)}>
                                <Archive size={14} className="mr-2" /> Arquivar
                              </DropdownMenuItem>
                            </>
                          )}
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

      <Dialog open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) { setEditing(null); setEditingValues(null); } }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            <DialogDescription>Preencha os dados do cliente. O status de NPS vem das avaliações da aba NPS de Clientes.</DialogDescription>
          </DialogHeader>
          {editing && !editingValues ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando cliente...</p>
          ) : (
            <ClientForm
              loading={saving}
              onSubmit={handleSave}
              initialValues={editing && editingValues
                ? editingValues
                : { agencia: agencia === "todos" ? (agencias[0]?.id ?? "") : agencia }}
            />
          )}
        </DialogContent>
      </Dialog>

      <PausaLoteDialog
        clienteId={pausaLote?.id ?? null}
        clienteNome={pausaLote?.nome ?? ""}
        open={!!pausaLote}
        onOpenChange={(o) => { if (!o) setPausaLote(null); }}
        onDone={() => fetchClientes()}
      />

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
        <div className="numeric text-2xl font-semibold">{value}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ClienteCard({
  cliente, borderColor, showAgenciaBadge, onEdit, onArchive, onRestore, onDelete, onToggleTrafego, onPausaLote,
}: {
  cliente: ClienteView;
  borderColor?: string;
  showAgenciaBadge?: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onToggleTrafego: () => void;
  onPausaLote: () => void;
}) {
  const { meta: agenciaMetaOf, label: agenciaLabelOf } = useAgencias();
  const nps = NPS_STATUS_META[cliente.nps_status];
  const obsTrim = cliente.observacoes && cliente.observacoes.length > 110
    ? cliente.observacoes.slice(0, 110) + "…"
    : cliente.observacoes;

  return (
    <Card 
      className={cn("border-l-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default flex flex-col group relative outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2", !borderColor && "border-l-primary", cliente.arquivado && "opacity-75")}
      style={agenciaBorderStyle(borderColor)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Delete" || e.key === "Backspace") onDelete();
      }}
    >
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            <ItemFicha id={cliente.id} />
            {cliente.arquivado ? (
              <DropdownMenuItem onClick={onRestore}>
                <ArchiveRestore size={14} className="mr-2" /> Restaurar
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil size={14} className="mr-2" /> Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onToggleTrafego}>
                  {cliente.trafego_ativo === false ? <><Play size={14} className="mr-2" /> Ativar tráfego</> : <><Pause size={14} className="mr-2" /> Pausar tráfego</>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onPausaLote}>
                  <Pause size={14} className="mr-2" /> Pausar/retomar plataformas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onArchive}>
                  <Archive size={14} className="mr-2" /> Arquivar
                </DropdownMenuItem>
              </>
            )}
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
                <Badge variant="outline" className="text-[9px] h-4 px-1 font-bold uppercase tracking-tight" style={agenciaBadgeStyle(agenciaMetaOf(cliente.agencia)?.hex)}>
                  {agenciaLabelOf(cliente.agencia)}
                </Badge>
              )}
              <CardTitle className="text-base font-semibold truncate">{cliente.nome}</CardTitle>
              {cliente.arquivado && (
                <Badge variant="secondary" className="bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider shrink-0">
                  Arquivado
                </Badge>
              )}
              {cliente.em_onboarding && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100 h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider shrink-0">
                  Onboarding
                </Badge>
              )}
              {cliente.trafego_ativo === false ? (
                <Badge variant="secondary" className="bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider shrink-0">
                  Sem tráfego
                </Badge>
              ) : verbaMensal(cliente) === 0 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider shrink-0">
                  Sem verba
                </Badge>
              )}
              {!cliente.data_inicio && (
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

        <div className={cn("rounded-md bg-muted/40 px-3 py-2", cliente.trafego_ativo === false && "opacity-70")}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Verba de ads / mês{cliente.operacoes.length > 1 && <span> · {cliente.operacoes.length} operações</span>}
            {cliente.operacoes.some((op) => op.moeda !== "BRL") && <span> · em R$</span>}
          </p>
          <p className={cn("text-lg font-bold", cliente.trafego_ativo === false && "line-through text-muted-foreground")}>
            {formatBRL(cliente.trafego_ativo === false
              ? cliente.operacoes.reduce((acc, op) => acc + Number(op.verba_mensal_brl || 0), 0)
              : verbaMensal(cliente))}
          </p>
          {cliente.trafego_ativo === false && (
            <p className="text-[9px] text-muted-foreground mt-0.5">Tráfego desligado: não entra nos totais.</p>
          )}
          {cliente.operacoes.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {cliente.operacoes.map((op) => (
                <li key={op.id} className="text-[10px] text-muted-foreground flex items-baseline justify-between gap-2">
                  <span className="truncate">
                    <span className="font-medium text-foreground/80">{op.nome}</span>
                    {op.plataformas.length > 0 && <span> · {op.plataformas.join(", ")}</span>}
                  </span>
                  <span className="numeric shrink-0">
                    {op.tipo_verba === "total_periodo"
                      ? <>{formatMoeda(op.verba_total_contratada, op.moeda)} até {op.data_limite_verba ? new Date(op.data_limite_verba + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</>
                      : <>{formatMoeda(op.verba_mensal, op.moeda)}/mês</>}
                  </span>
                </li>
              ))}
            </ul>
          )}
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

        {obsTrim && (
          <div className="text-xs text-muted-foreground border-t pt-2 leading-relaxed">{obsTrim}</div>
        )}
      </CardContent>
    </Card>
  );
}
