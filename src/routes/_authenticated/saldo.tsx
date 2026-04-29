import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { 
  DollarSign, 
  Receipt, 
  Clock, 
  AlertCircle, 
  Plus, 
  Search, 
  Building2, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  Wallet, 
  Calendar, 
  TrendingUp, 
  ArrowUpCircle,
  Filter,
  RefreshCw,
  History,
  Check,
  UserCog,
  LayoutGrid,
  Archive,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { AGENCIAS, formatBRL } from "@/lib/clientes";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SaldoAdsForm, SaldoAdsFormValues } from "@/components/SaldoAdsForm";
import { RecargaForm, RecargaFormValues } from "@/components/RecargaForm";
import { ClientForm, ClientFormValues } from "@/components/ClientForm";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_authenticated/saldo")({
  component: SaldoPage,
});

const PLATAFORMAS = [
  { id: "Meta", label: "Meta", color: "bg-blue-500" },
  { id: "Google", label: "Google", color: "bg-red-500" },
  { id: "Pinterest", label: "Pinterest", color: "bg-rose-500" },
  { id: "X Ads", label: "X Ads", color: "bg-black" },
  { id: "LinkedIn", label: "LinkedIn", color: "bg-blue-700" },
  { id: "TikTok", label: "TikTok", color: "bg-zinc-800" },
  { id: "Taboola", label: "Taboola", color: "bg-blue-400" },
  { id: "Outbrain", label: "Outbrain", color: "bg-orange-500" },
];

const STATUS_ALERTA = [
  { id: "ok", label: "OK", color: "bg-emerald-500", weight: 0 },
  { id: "alerta", label: "Alerta", color: "bg-amber-500", weight: 1 },
  { id: "critico", label: "Crítico", color: "bg-red-500", weight: 2 },
  { id: "zerado", label: "Zerado", color: "bg-gray-500", weight: 3 },
  { id: "cartao", label: "Cartão (sem monitoramento)", color: "bg-blue-400", weight: -1 },
];

function SaldoPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgencia, setFilterAgencia] = useState<string>("all");
  const [filterPlataforma, setFilterPlataforma] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPausados, setShowPausados] = useState(false);
  const [showCartao, setShowCartao] = useState(true);
  const [sortBy, setSortBy] = useState<string>("dias_restantes");
  
  const [modalOpen, setModalOpen] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [recargaModalOpen, setRecargaModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [selectedForRecarga, setSelectedForRecarga] = useState<any>(null);
  const [selectedForHistory, setSelectedForHistory] = useState<any>(null);
  const [historyIsConsolidated, setHistoryIsConsolidated] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);

  useEffect(() => {
    fetchSaldo();
  }, []);

  const fetchSaldo = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("saldo_ads_view")
      .select("*, clientes!inner(status_operacional, verba_ads)")
      .order("dias_restantes", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar saldos de mídia");
      console.error(error);
    } else {
      setData(data || []);
    }
    setLoading(false);
  };

  const handleSave = async (values: SaldoAdsFormValues) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      if (editing) {
        const { error } = await supabase
          .from("saldo_ads")
          .update({ ...values })
          .eq("id", editing.id);
        if (error) throw error;
        
        if (editing.metodo_pagamento !== values.metodo_pagamento) {
          if (values.metodo_pagamento === 'cartao') {
            toast.success("Migrado para Cartão: Monitoramento desativado");
          } else {
            toast.success(`Alterado para ${values.metodo_pagamento.toUpperCase()}: Monitoramento ativado`);
          }
        } else {
          toast.success("Registro atualizado");
        }
      } else {
        const { data: newRecord, error } = await supabase
          .from("saldo_ads")
          .insert([{ ...values, user_id: user.id }])
          .select()
          .single();
        if (error) throw error;
        toast.success("Registro criado");
        // Automatically open first reload modal if not cartao
        if (values.metodo_pagamento !== 'cartao') {
          setSelectedForRecarga(newRecord);
          setRecargaModalOpen(true);
        }
      }
      setModalOpen(false);
      setEditing(null);
      fetchSaldo();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateClient = async (values: ClientFormValues) => {
    if (!editingClient) return;
    setSaving(true);
    try {
      const payload: any = { ...values };
      if (typeof payload.verba_total_contratada === "string") {
        payload.verba_total_contratada = payload.verba_total_contratada === "" ? null : Number(payload.verba_total_contratada);
      }
      if (payload.data_limite_verba === "") {
        payload.data_limite_verba = null;
      }

      const { error } = await supabase
        .from("clientes")
        .update(payload)
        .eq("id", editingClient.id);
      if (error) throw error;
      toast.success("Dados do cliente atualizados");
      setClientModalOpen(false);
      setEditingClient(null);
      fetchSaldo();
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar cliente");
    } finally {
      setSaving(false);
    }
  };

  const handleRecarga = async (values: RecargaFormValues) => {
    if (!selectedForRecarga) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("recargas")
        .insert([{ 
          ...values, 
          saldo_ads_id: selectedForRecarga.id 
        }]);
      if (error) throw error;
      toast.success("Recarga adicionada com sucesso");
      setRecargaModalOpen(false);
      setSelectedForRecarga(null);
      fetchSaldo();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar recarga");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from("saldo_ads").delete().eq("id", deletingId);
      if (error) throw error;
      toast.success("Registro removido");
      fetchSaldo();
    } catch (e: any) {
      toast.error("Erro ao remover registro");
    } finally {
      setDeletingId(null);
    }
  };

  const fetchHistory = async (record: any, consolidated: boolean = false) => {
    setSelectedForHistory(record);
    setHistoryIsConsolidated(consolidated);
    setHistoryOpen(true);
    
    let query = supabase
      .from("recargas")
      .select("*, saldo_ads!inner(plataformas)");
      
    if (consolidated) {
      query = query.eq("saldo_ads.cliente_id", record.cliente_id);
    } else {
      query = query.eq("saldo_ads_id", record.id);
    }
    
    const { data, error } = await query.order("data_recarga", { ascending: false });
    
    if (error) {
      toast.error("Erro ao carregar histórico");
    } else {
      setHistoryData(data || []);
    }
  };

  const groupedData = useMemo(() => {
    const groups: Record<string, any> = {};
    
    data.forEach(item => {
      const clientId = item.cliente_id;
      if (!groups[clientId]) {
        groups[clientId] = {
          cliente_id: clientId,
          cliente_nome: item.cliente_nome,
          cliente_agencia: item.cliente_agencia,
          status_operacional: item.clientes?.status_operacional,
          metodo_pagamento_principal: item.metodo_pagamento,
          plataformas: [],
          saldo_total_consolidado: 0,
          verba_diaria_total: 0,
          pior_status_alerta: "ok",
          data_prevista_fim_proxima: null,
          plataforma_mais_proxima: "",
        };
      }
      
      const group = groups[clientId];
      group.plataformas.push(item);
      
      if (item.metodo_pagamento !== group.metodo_pagamento_principal) {
        group.metodo_pagamento_principal = "misto";
      }
      
      if (item.metodo_pagamento !== "cartao") {
        group.saldo_total_consolidado += (item.saldo_atual_estimado || 0);
        group.verba_diaria_total += (item.verba_diaria_calc || 0);
        
        // Update worst status alert
        const currentWeight = STATUS_ALERTA.find(s => s.id === item.status_alerta)?.weight || 0;
        const worstWeight = STATUS_ALERTA.find(s => s.id === group.pior_status_alerta)?.weight || 0;
        if (currentWeight > worstWeight) {
          group.pior_status_alerta = item.status_alerta;
        }
        
        // Update next end date
        if (item.data_prevista_fim) {
          const currentEnd = new Date(item.data_prevista_fim);
          if (!group.data_prevista_fim_proxima || currentEnd < new Date(group.data_prevista_fim_proxima)) {
            group.data_prevista_fim_proxima = item.data_prevista_fim;
            group.plataforma_mais_proxima = item.plataformas?.[0] || "";
          }
        }
      } else if (group.pior_status_alerta === "ok") {
        group.pior_status_alerta = "cartao";
      }
    });
    
    return Object.values(groups);
  }, [data]);

  const filteredData = useMemo(() => {
    let result = groupedData.filter(group => {
      const matchesAgencia = filterAgencia === "all" || group.cliente_agencia === filterAgencia;
      const matchesSearch = group.cliente_nome?.toLowerCase().includes(searchQuery.toLowerCase());
      const isPausado = group.status_operacional === "pausado";
      const matchesPausados = showPausados || !isPausado;
      
      const hasPlataforma = filterPlataforma === "all" || group.plataformas.some((p: any) => p.plataformas?.includes(filterPlataforma));
      const hasStatus = filterStatus === "all" || group.plataformas.some((p: any) => p.status_alerta === filterStatus);
      const hasCartao = showCartao || group.plataformas.some((p: any) => p.metodo_pagamento !== "cartao");

      return matchesAgencia && matchesSearch && matchesPausados && hasPlataforma && hasStatus && hasCartao;
    });

    result.sort((a, b) => {
      if (sortBy === "dias_restantes") {
        if (!a.data_prevista_fim_proxima) return 1;
        if (!b.data_prevista_fim_proxima) return -1;
        return new Date(a.data_prevista_fim_proxima).getTime() - new Date(b.data_prevista_fim_proxima).getTime();
      }
      if (sortBy === "nome") return (a.cliente_nome || "").localeCompare(b.cliente_nome || "");
      if (sortBy === "valor") return (b.saldo_total_consolidado || 0) - (a.saldo_total_consolidado || 0);
      return 0;
    });

    return result;
  }, [groupedData, filterAgencia, filterPlataforma, filterStatus, searchQuery, sortBy, showPausados, showCartao]);

  const metrics = useMemo(() => {
    const monitored = data.filter(i => i.metodo_pagamento !== "cartao");
    const onCartao = data.filter(i => i.metodo_pagamento === "cartao");
    const uniqueClients = new Set(data.map(i => i.cliente_id)).size;
    
    const criticalClient = [...data]
      .filter(i => i.metodo_pagamento !== "cartao" && i.data_prevista_fim)
      .sort((a, b) => new Date(a.data_prevista_fim).getTime() - new Date(b.data_prevista_fim).getTime())[0];

    return {
      totalContas: data.length,
      uniqueClients,
      saldoTotal: monitored.reduce((acc, curr) => acc + (curr.saldo_atual_estimado || 0), 0),
      emAlerta: monitored.filter(i => i.status_alerta === "alerta").length,
      criticos: monitored.filter(i => i.status_alerta === "critico" || i.status_alerta === "zerado").length,
      totalCartao: onCartao.length,
      criticalClientName: criticalClient?.cliente_nome
    };
  }, [data]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ok": return "border-emerald-500";
      case "alerta": return "border-amber-500";
      case "critico": return "border-red-500";
      case "zerado": return "border-gray-400";
      case "cartao": return "border-blue-300";
      default: return "border-border";
    }
  };

  const getProgressColor = (status: string) => {
    switch (status) {
      case "ok": return "bg-emerald-500";
      case "alerta": return "bg-amber-500";
      case "critico": return "bg-red-500";
      case "zerado": return "bg-gray-400";
      default: return "bg-primary";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitor de Saldo de Mídia</h1>
          <p className="text-muted-foreground">Acompanhe verba e recargas de anúncios em tempo real.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchSaldo} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <TooltipProvider>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Contas Monitoradas</CardTitle>
                  <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.totalContas}</div>
                  <p className="text-xs text-muted-foreground">Registros saldo_ads</p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p>Total de registros individuais por plataforma</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Clientes Únicos</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.uniqueClients}</div>
                  <p className="text-xs text-muted-foreground">Clientes monitorados</p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p>Contagem distinta de clientes na aba Saldo</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Saldo Total</CardTitle>
                  <Wallet className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatBRL(metrics.saldoTotal)}</div>
                  <p className="text-xs text-muted-foreground">Soma de todas as plataformas</p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p>Soma apenas dos registros Pix/Boleto</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Em Alerta / Críticos</CardTitle>
                  <AlertCircle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.criticos + metrics.emAlerta}</div>
                  <p className="text-xs text-muted-foreground">{metrics.criticos} críticos, {metrics.emAlerta} em alerta</p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p>Ignora clientes no cartão</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="bg-red-50/50 border-red-100">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-red-800">Mais Crítico</CardTitle>
                  <ArrowRight className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-base font-bold text-red-700 line-clamp-1">
                    {metrics.criticalClientName || "Nenhum"}
                  </div>
                  <p className="text-xs text-red-600/80">Zera em breve</p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p>Cliente com plataforma que vai zerar primeiro</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
          <Card className="bg-blue-50/50 border-blue-100 py-2">
            <CardContent className="py-0 flex items-center gap-3">
              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">
                {metrics.totalCartao}
              </Badge>
              <span className="text-xs font-medium text-blue-700">clientes no cartão (pagamento direto)</span>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterAgencia} onValueChange={setFilterAgencia}>
          <SelectTrigger className="w-[140px]">
            <Building2 className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Agência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {AGENCIAS.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPlataforma} onValueChange={setFilterPlataforma}>
          <SelectTrigger className="w-[140px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Plataformas</SelectItem>
            {PLATAFORMAS.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px]">
            <AlertCircle className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            {STATUS_ALERTA.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-md border text-xs h-10">
          <span className="font-medium text-muted-foreground">Pausados</span>
          <Checkbox checked={showPausados} onCheckedChange={(v) => setShowPausados(!!v)} />
        </div>
        <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-md border text-xs h-10">
          <span className="font-medium text-muted-foreground">Cartão</span>
          <Checkbox checked={showCartao} onCheckedChange={(v) => setShowCartao(!!v)} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Ordenar por:</span>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dias_restantes">Dias restantes</SelectItem>
              <SelectItem value="nome">Nome do cliente</SelectItem>
              <SelectItem value="valor">Maior saldo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[300px] rounded-xl border bg-card animate-pulse" />
          ))
        ) : filteredData.length === 0 ? (
          <div className="col-span-full h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-muted/30 text-muted-foreground">
            <Wallet size={48} className="mb-4 opacity-20" />
            <p>Nenhum registro encontrado.</p>
            <Button variant="link" onClick={() => { setFilterAgencia("all"); setFilterPlataforma("all"); setFilterStatus("all"); setSearchQuery(""); }}>
              Limpar filtros
            </Button>
          </div>
        ) : (
          filteredData.map((group) => {
            const hasMultiple = group.plataformas.length > 1;
            const isPausado = group.status_operacional === "pausado";
            const mainPlataforma = group.plataformas[0];
            const isCartaoOnly = group.plataformas.every((p: any) => p.metodo_pagamento === "cartao");

            return (
              <Card 
                key={group.cliente_id} 
                className={cn(
                  "group relative border-l-4 transition-all hover:shadow-md flex flex-col",
                  getStatusColor(group.pior_status_alerta),
                  isPausado && "opacity-75"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-bold">{group.cliente_nome}</CardTitle>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className={cn(
                          "text-[10px] font-semibold uppercase py-0",
                          group.cliente_agencia === "alt" ? "text-amber-600 border-amber-200 bg-amber-50" : "",
                          group.cliente_agencia === "spike" ? "text-purple-600 border-purple-200 bg-purple-50" : "",
                          group.cliente_agencia === "effect" ? "text-blue-600 border-blue-200 bg-blue-50" : "",
                          group.cliente_agencia === "pessoais" ? "text-emerald-600 border-emerald-200 bg-emerald-50" : ""
                        )}>
                          {AGENCIAS.find(a => a.id === group.cliente_agencia)?.label || group.cliente_agencia}
                        </Badge>
                        {isPausado && (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-[10px] uppercase py-0">
                            Pausado
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px] uppercase py-0">
                          {group.metodo_pagamento_principal === "misto" ? "Misto" : group.metodo_pagamento_principal}
                        </Badge>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                          <MoreVertical size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[200px]">
                        <DropdownMenuItem onClick={() => {
                          setEditingClient({ id: group.cliente_id, nome: group.cliente_nome, agencia: group.cliente_agencia });
                          setClientModalOpen(true);
                        }}>
                          <UserCog size={14} className="mr-2" /> Editar Cliente
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setEditing(null);
                          // We pass the client_id as initial value for the new record
                          setEditing({ cliente_id: group.cliente_id });
                          setModalOpen(true);
                        }}>
                          <Plus size={14} className="mr-2" /> Adicionar Plataforma
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => fetchHistory(group, true)}>
                          <History size={14} className="mr-2" /> Ver Histórico Consolidado
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-amber-600">
                          <Archive size={14} className="mr-2" /> Arquivar Cliente
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive">
                          <Trash2 size={14} className="mr-2" /> Remover Cliente
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                
                <CardContent className="flex-1 space-y-4 pb-4">
                  {/* Bloco Consolidado se houver múltiplas plataformas */}
                  {hasMultiple && (
                    <div className="bg-muted/30 rounded-lg p-3 border space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Saldo Total</p>
                          <p className="text-xl font-bold tracking-tight text-primary">
                            {formatBRL(group.saldo_total_consolidado)}
                          </p>
                        </div>
                        <div className="space-y-0.5 text-right">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Verba Diária Total</p>
                          <p className="text-sm font-bold">
                            {formatBRL(group.verba_diaria_total)}<span className="text-[10px] text-muted-foreground font-normal">/dia</span>
                          </p>
                        </div>
                      </div>
                      
                      {!isCartaoOnly && group.data_prevista_fim_proxima && (
                        <div className="flex items-center justify-between text-[11px] bg-background/50 p-2 rounded border border-dashed">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock size={12} className="text-amber-500" /> Próximo fim previsto:
                          </span>
                          <span className="font-bold text-amber-700">
                            {new Date(group.data_prevista_fim_proxima).toLocaleDateString("pt-BR")} 
                            <span className="ml-1 text-[10px] font-normal opacity-70">({group.plataforma_mais_proxima})</span>
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Lista de Plataformas */}
                  <div className="space-y-2">
                    {group.plataformas.map((plat: any, idx: number) => {
                      const isFilteringThis = filterPlataforma !== "all" && plat.plataformas?.includes(filterPlataforma);
                      const isFilteringOther = filterPlataforma !== "all" && !isFilteringThis;
                      const isCartao = plat.metodo_pagamento === "cartao";
                      
                      return (
                        <div 
                          key={plat.id} 
                          className={cn(
                            "relative group/row rounded-md border p-2.5 transition-all",
                            isFilteringThis ? "bg-primary/5 border-primary/20" : "bg-card",
                            isFilteringOther && "opacity-40 grayscale-[0.2]",
                            !hasMultiple && "border-none p-0 bg-transparent"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {plat.plataformas?.map((p: string) => (
                                <Badge key={p} className={cn("text-[10px] px-1.5 py-0", PLATAFORMAS.find(plt => plt.id === p)?.color)}>
                                  {p}
                                </Badge>
                              ))}
                              {isCartao && <Badge variant="outline" className="text-[9px] h-4 py-0 text-blue-600 border-blue-200">Cartão</Badge>}
                            </div>
                            
                            <div className="flex items-center gap-3">
                              {isCartao ? (
                                <span className="text-xs font-semibold text-blue-600 uppercase">Cartão</span>
                              ) : (
                                <span className="text-sm font-bold">{formatBRL(plat.saldo_atual_estimado)}</span>
                              )}
                              
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <MoreVertical size={12} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[180px]">
                                  <DropdownMenuItem onClick={() => { setEditing(plat); setModalOpen(true); }}>
                                    <Pencil size={12} className="mr-2" /> Editar Registro
                                  </DropdownMenuItem>
                                  {!isCartao && (
                                    <>
                                      <DropdownMenuItem onClick={() => { setSelectedForRecarga(plat); setRecargaModalOpen(true); }}>
                                        <Plus size={12} className="mr-2" /> Adicionar Recarga
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => fetchHistory(plat)}>
                                        <History size={12} className="mr-2" /> Ver Histórico
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive" onClick={() => setDeletingId(plat.id)}>
                                    <Trash2 size={12} className="mr-2" /> Remover Plataforma
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          {!isCartao ? (
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                                <span>{plat.dias_restantes ? Math.floor(plat.dias_restantes) : 0} dias restantes</span>
                                <span>Última: {formatBRL(plat.saldo_total_acumulado > 0 ? plat.saldo_total_acumulado / 5 : 0)} em 12/04</span>
                              </div>
                              <Progress 
                                value={Math.min(100, (plat.dias_restantes || 0) * 10)} 
                                className="h-1.5"
                                indicatorClassName={getProgressColor(plat.status_alerta)}
                              />
                            </div>
                          ) : !hasMultiple && (
                            <div className="h-10 flex items-center justify-center bg-muted/30 rounded-md border border-dashed">
                              <p className="text-[11px] text-muted-foreground italic">Pagamento direto no cartão</p>
                            </div>
                          )}

                          {!hasMultiple && (
                            <div className="grid grid-cols-2 gap-2 text-[11px] pt-3 mt-3 border-t">
                              <div className="space-y-0.5">
                                <p className="text-muted-foreground">Verba Diária</p>
                                <p className="font-semibold">{formatBRL(plat.verba_diaria_calc)}</p>
                              </div>
                              <div className="space-y-0.5 text-right">
                                <p className="text-muted-foreground">{isCartao ? "Verba Mensal" : "Total Investido"}</p>
                                <p className="font-semibold">
                                  {isCartao 
                                    ? formatBRL(plat.clientes?.verba_ads || (plat.verba_diaria_calc * 30)) 
                                    : formatBRL(plat.saldo_total_acumulado)}
                                </p>
                              </div>
                            </div>
                          )}

                          {!isCartao && !hasMultiple && (
                            <Button 
                              className="w-full h-8 text-xs gap-2 mt-4" 
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedForRecarga(plat);
                                setRecargaModalOpen(true);
                              }}
                            >
                              <ArrowUpCircle size={14} />
                              Adicionar recarga
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Modals and Sheets */}
      <Dialog open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar Registro" : "Novo Registro de Saldo"}</DialogTitle>
            <DialogDescription>
              Configure o monitoramento de verba para uma plataforma de anúncios.
            </DialogDescription>
          </DialogHeader>
          <SaldoAdsForm
            loading={saving}
            onSubmit={handleSave}
            initialValues={editing ? {
              cliente_id: editing.cliente_id,
              plataformas: editing.plataformas || [],
              metodo_pagamento: editing.metodo_pagamento,
              verba_diaria: editing.verba_diaria,
              observacoes: editing.observacoes,
            } : {}}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={clientModalOpen} onOpenChange={(o) => { setClientModalOpen(o); if (!o) setEditingClient(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>
              Atualize as informações cadastrais do cliente.
            </DialogDescription>
          </DialogHeader>
          <ClientForm
            loading={saving}
            onSubmit={handleUpdateClient}
            initialValues={editingClient}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={recargaModalOpen} onOpenChange={(o) => { setRecargaModalOpen(o); if (!o) setSelectedForRecarga(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Adicionar Recarga</DialogTitle>
            <DialogDescription>
              Lance um novo aporte de verba para <strong>{selectedForRecarga?.cliente_nome}</strong>.
            </DialogDescription>
          </DialogHeader>
          <RecargaForm
            loading={saving}
            defaultMetodo={selectedForRecarga?.metodo_pagamento}
            onSubmit={handleRecarga}
          />
        </DialogContent>
      </Dialog>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {historyIsConsolidated ? "Histórico Consolidado" : "Histórico de Recargas"}
            </SheetTitle>
            <SheetDescription>
              {selectedForHistory?.cliente_nome} {historyIsConsolidated ? "— Todas plataformas" : `— ${selectedForHistory?.plataformas?.join(", ")}`}
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-8 space-y-6">
            {!historyIsConsolidated && (
              <div className="p-4 rounded-xl bg-muted/50 border space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status Atual</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedForHistory?.metodo_pagamento === 'cartao' ? 'Método' : 'Saldo'}
                    </p>
                    <p className="text-lg font-bold">
                      {selectedForHistory?.metodo_pagamento === 'cartao' 
                        ? 'Cartão' 
                        : formatBRL(selectedForHistory?.saldo_atual)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedForHistory?.metodo_pagamento === 'cartao' ? 'Monitoramento' : 'Previsão'}
                    </p>
                    <p className="text-lg font-bold">
                      {selectedForHistory?.metodo_pagamento === 'cartao' 
                        ? 'Desativado' 
                        : `${selectedForHistory?.dias_restantes ? Math.floor(selectedForHistory.dias_restantes) : 0} dias`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {selectedForHistory?.metodo_pagamento === 'cartao' && historyData.length > 0 && (
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-700">
                Cliente migrou para cartão. Histórico de recargas anteriores arquivado apenas para referência.
              </div>
            )}

            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Todas as Recargas</h4>
              {historyData.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma recarga registrada.</p>
              ) : (
                <div className="relative space-y-4 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-px before:bg-border">
                  {historyData.map((recarga, i) => (
                    <div key={recarga.id} className="relative pl-8">
                      <div className="absolute left-0 top-1 h-7 w-7 rounded-full bg-background border flex items-center justify-center">
                        <TrendingUp size={14} className="text-emerald-500" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold">{formatBRL(recarga.valor)}</p>
                            {historyIsConsolidated && recarga.saldo_ads?.plataformas?.map((p: string) => (
                              <Badge key={p} variant="outline" className="text-[9px] h-4 py-0">{p}</Badge>
                            ))}
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {new Date(recarga.data_recarga).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">
                          {recarga.metodo_pagamento?.replace("_", " ")}
                        </p>
                        {recarga.observacoes && (
                          <p className="text-[10px] bg-muted/50 p-1.5 rounded italic">"{recarga.observacoes}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja remover?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá o monitoramento desta conta de mídia e todo seu histórico de recargas.
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
