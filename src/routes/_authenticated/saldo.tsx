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
  History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AGENCIAS, formatBRL } from "@/lib/clientes";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";

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
  { id: "ok", label: "OK", color: "bg-emerald-500" },
  { id: "alerta", label: "Alerta", color: "bg-amber-500" },
  { id: "critico", label: "Crítico", color: "bg-red-500" },
  { id: "zerado", label: "Zerado", color: "bg-gray-500" },
  { id: "cartao", label: "Cartão (sem monitoramento)", color: "bg-blue-400" },
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
  const [recargaModalOpen, setRecargaModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selectedForRecarga, setSelectedForRecarga] = useState<any>(null);
  const [selectedForHistory, setSelectedForHistory] = useState<any>(null);
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
      .select("*, clientes!inner(status_operacional)")
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
        toast.success("Registro atualizado");
      } else {
        const { data: newRecord, error } = await supabase
          .from("saldo_ads")
          .insert([{ ...values, user_id: user.id }])
          .select()
          .single();
        if (error) throw error;
        toast.success("Registro criado");
        // Automatically open first reload modal
        setSelectedForRecarga(newRecord);
        setRecargaModalOpen(true);
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

  const fetchHistory = async (record: any) => {
    setSelectedForHistory(record);
    setHistoryOpen(true);
    const { data, error } = await supabase
      .from("recargas")
      .select("*")
      .eq("saldo_ads_id", record.id)
      .order("data_recarga", { ascending: false });
    
    if (error) {
      toast.error("Erro ao carregar histórico");
    } else {
      setHistoryData(data || []);
    }
  };

  const filteredData = useMemo(() => {
    let result = data.filter(item => {
      const isCartao = item.metodo_pagamento === "cartao";
      const matchesAgencia = filterAgencia === "all" || item.cliente_agencia === filterAgencia;
      const matchesPlataforma = filterPlataforma === "all" || item.plataformas?.includes(filterPlataforma);
      
      let matchesStatus = filterStatus === "all" || item.status_alerta === filterStatus;
      if (filterStatus === "cartao") {
        matchesStatus = isCartao;
      } else if (filterStatus !== "all" && isCartao) {
        // If filtering by status but it's a card (which has its own status), exclude unless it's specifically cartao filter
        matchesStatus = false;
      }

      const matchesSearch = item.cliente_nome?.toLowerCase().includes(searchQuery.toLowerCase());
      const isPausado = item.clientes?.status_operacional === "pausado";
      const matchesPausados = showPausados || !isPausado;
      const matchesCartao = showCartao || !isCartao;

      return matchesAgencia && matchesPlataforma && matchesStatus && matchesSearch && matchesPausados && matchesCartao;
    });

    result.sort((a, b) => {
      // Put card items at the end when sorting by days remaining
      if (sortBy === "dias_restantes") {
        if (a.metodo_pagamento === "cartao" && b.metodo_pagamento !== "cartao") return 1;
        if (a.metodo_pagamento !== "cartao" && b.metodo_pagamento === "cartao") return -1;
        return (a.dias_restantes || 0) - (b.dias_restantes || 0);
      }
      if (sortBy === "nome") return (a.cliente_nome || "").localeCompare(b.cliente_nome || "");
      if (sortBy === "valor") return (b.saldo_atual || 0) - (a.saldo_atual || 0);
      return 0;
    });

    return result;
  }, [data, filterAgencia, filterPlataforma, filterStatus, searchQuery, sortBy, showPausados, showCartao]);

  const metrics = useMemo(() => {
    const monitored = data.filter(i => i.metodo_pagamento !== "cartao");
    const onCartao = data.filter(i => i.metodo_pagamento === "cartao");

    return {
      totalContas: monitored.length,
      saldoTotal: monitored.reduce((acc, curr) => acc + (curr.saldo_atual || 0), 0),
      emAlerta: monitored.filter(i => i.status_alerta === "alerta").length,
      criticos: monitored.filter(i => i.status_alerta === "critico" || i.status_alerta === "zerado").length,
      totalCartao: onCartao.length
    };
  }, [data]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ok": return "border-emerald-500";
      case "alerta": return "border-amber-500";
      case "critico": return "border-red-500";
      case "zerado": return "border-gray-400";
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
          <Button className="gap-2" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus size={16} />
            Novo registro de saldo
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contas Monitoradas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalContas}</div>
            <p className="text-xs text-muted-foreground">Total de registros ativos</p>
          </CardContent>
        </Card>
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Alerta</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.emAlerta}</div>
            <p className="text-xs text-muted-foreground">Saldo dura entre 2 e 4 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Críticos / Zerados</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.criticos}</div>
            <p className="text-xs text-muted-foreground">Saldo dura menos de 1 dia</p>
          </CardContent>
        </Card>
      </div>

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
          <span className="font-medium">Mostrar pausados</span>
          <Checkbox checked={showPausados} onCheckedChange={(v) => setShowPausados(!!v)} />
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[280px] rounded-xl border bg-card animate-pulse" />
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
          filteredData.map((item) => (
            <Card 
              key={item.id} 
              className={cn(
                "group relative border-l-4 transition-all hover:shadow-md cursor-pointer",
                getStatusColor(item.status_alerta),
                item.clientes?.status_operacional === "pausado" && "opacity-70"
              )}
              onClick={() => fetchHistory(item)}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base line-clamp-1">{item.cliente_nome}</CardTitle>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="outline" className={cn(
                        "text-[10px] font-normal uppercase py-0",
                        item.cliente_agencia === "alt" ? "text-amber-600 border-amber-200 bg-amber-50" : "",
                        item.cliente_agencia === "spike" ? "text-purple-600 border-purple-200 bg-purple-50" : ""
                      )}>
                        {AGENCIAS.find(a => a.id === item.cliente_agencia)?.label || item.cliente_agencia}
                      </Badge>
                      {item.clientes?.status_operacional === "pausado" && (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-[10px] uppercase py-0">
                          Pausado
                        </Badge>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[140px]">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditing(item); setModalOpen(true); }}>
                        <Pencil size={14} className="mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive" 
                        onClick={(e) => { e.stopPropagation(); setDeletingId(item.id); }}
                      >
                        <Trash2 size={14} className="mr-2" /> Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex flex-wrap gap-1">
                    {item.plataformas?.map((plat: string) => (
                      <Badge key={plat} className={cn("text-[10px] px-1.5 py-0", PLATAFORMAS.find(p => p.id === plat)?.color)}>
                        {plat}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold tracking-tight text-primary">
                      {formatBRL(item.saldo_atual)}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span>{item.dias_restantes ? Math.floor(item.dias_restantes) : 0} dias restantes</span>
                    <span className="text-muted-foreground">
                      Fim: {item.data_prevista_fim ? new Date(item.data_prevista_fim).toLocaleDateString("pt-BR") : "—"}
                    </span>
                  </div>
                  <Progress 
                    value={Math.min(100, (item.dias_restantes || 0) * 10)} 
                    className="h-2"
                    indicatorClassName={getProgressColor(item.status_alerta)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t">
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Verba Diária</p>
                    <p className="font-semibold">{formatBRL(item.verba_diaria_calc)}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-muted-foreground">Total Investido</p>
                    <p className="font-semibold">{formatBRL(item.total_recarregado)}</p>
                  </div>
                </div>

                <Button 
                  className="w-full h-8 text-xs gap-2" 
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedForRecarga(item);
                    setRecargaModalOpen(true);
                  }}
                >
                  <ArrowUpCircle size={14} />
                  Adicionar recarga
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Modals and Sheets */}
      <Dialog open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Registro" : "Novo Registro de Saldo"}</DialogTitle>
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
              Histórico de Recargas
            </SheetTitle>
            <SheetDescription>
              {selectedForHistory?.cliente_nome} — {selectedForHistory?.plataformas?.join(", ")}
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-8 space-y-6">
            <div className="p-4 rounded-xl bg-muted/50 border space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status Atual</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground">Saldo</p>
                  <p className="text-lg font-bold">{formatBRL(selectedForHistory?.saldo_atual)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Previsão</p>
                  <p className="text-lg font-bold">
                    {selectedForHistory?.dias_restantes ? Math.floor(selectedForHistory.dias_restantes) : 0} dias
                  </p>
                </div>
              </div>
            </div>

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
                          <p className="text-sm font-bold">{formatBRL(recarga.valor)}</p>
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
