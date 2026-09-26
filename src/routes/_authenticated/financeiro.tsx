import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  LayoutGrid, 
  List as ListIcon, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp,
  DollarSign,
  ArrowRight,
  History,
  Info,
  Building2,
  User as UserIcon,
  XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS, loadFinanceiro } from "@/lib/data";
import { formatBRL } from "@/lib/clientes";
import { hojeBrasilia } from "@/lib/entrega";
import {
  situacaoDoMes,
  resumoDoMes,
  descreverDias,
  agruparHistorico,
  infoDoStatus,
  type ParcelaDoMes,
} from "@/lib/financeiro";
import { ParcelasDoMes } from "@/components/financeiro/ParcelasDoMes";
import { TipoBadge } from "@/components/financeiro/TipoBadge";
import { FonteDialog, type FinanceiroView } from "@/components/financeiro/FonteDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/financeiro")({
  component: FinanceiroPage,
});

function FinanceiroPage() {
  const [data, setData] = useCachedState<FinanceiroView[]>(CACHE_KEYS.financeiro, []);
  const [loading, setLoading] = useState(!hasCached(CACHE_KEYS.financeiro));
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFonte, setEditingFonte] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedFonteHistory, setSelectedFonteHistory] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);

  const fetchFinanceiro = async () => {
    if (!hasCached(CACHE_KEYS.financeiro)) setLoading(true);
    try {
      setData((await loadFinanceiro()) as FinanceiroView[]);
    } catch (error: any) {
      toast.error("Erro ao carregar financeiro: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceiro();
  }, []);

  // Situação do mês de cada fonte, parcela por parcela, no dia de hoje em Brasília (o mesmo do banco)
  const hoje = hojeBrasilia();
  const situacoes = useMemo(() => new Map(data.map((f) => [f.fonte_id, situacaoDoMes(f, hoje)])), [data, hoje]);
  const situacaoDe = (fonte: FinanceiroView) => situacoes.get(fonte.fonte_id) ?? situacaoDoMes(fonte, hoje);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesTipo = filterTipo === "all" || item.tipo === filterTipo;
      const matchesStatus = filterStatus === "all" || situacoes.get(item.fonte_id)?.status === filterStatus;
      const matchesSearch = item.nome.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTipo && matchesStatus && matchesSearch;
    });
  }, [data, situacoes, filterTipo, filterStatus, searchQuery]);

  const metrics = useMemo(() => resumoDoMes(data, hoje), [data, hoje]);

  const toggleParcela = async (fonte: FinanceiroView, parcela: ParcelaDoMes) => {
    const recebida = parcela.status === "recebido";
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';
      // if (!user) return; // Removido para permitir acesso sem login

      if (parcela.recebimento) {
        // Alterna o estado
        const { error } = await supabase
          .from("financeiro_recebimentos")
          .update({
            recebido: !recebida,
            data_confirmacao: !recebida ? new Date().toISOString() : null,
            valor_recebido: !recebida ? parcela.valor : null,
          })
          .eq("id", parcela.recebimento.id);
        if (error) throw error;
      } else {
        // Cria o registro da parcela no mês (o mês é o da view, em Brasília)
        const { error } = await supabase
          .from("financeiro_recebimentos")
          .insert({
            user_id: userId,
            fonte_id: fonte.fonte_id,
            mes_referencia: fonte.mes_atual,
            parcela: parcela.numero,
            recebido: true,
            data_confirmacao: new Date().toISOString(),
            valor_recebido: parcela.valor,
          });
        if (error) throw error;
      }

      const qual = parcela.total > 1 ? `Parcela ${parcela.numero}/${parcela.total}` : "Pagamento";
      toast.success(recebida ? `${qual} voltou para pendente` : `${qual} marcado como recebido`);
      fetchFinanceiro();
    } catch (error: any) {
      toast.error("Erro ao atualizar recebimento: " + error.message);
    }
  };

  // O FonteDialog prepara o formulário ao abrir (a partir da fonte em edição, ou vazio para uma nova)
  const abrirFormulario = (fonte: FinanceiroView | null) => {
    setEditingFonte(fonte);
    setModalOpen(true);
  };

  const handleDeleteFonte = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from("financeiro_fontes").delete().eq("id", deletingId);
      if (error) throw error;
      toast.success("Fonte removida com sucesso");
      fetchFinanceiro();
    } catch (error: any) {
      toast.error("Erro ao remover: " + error.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleAtivo = async (fonte: FinanceiroView) => {
    try {
      const { error } = await supabase
        .from("financeiro_fontes")
        .update({ ativo: !fonte.ativo })
        .eq("id", fonte.fonte_id);
      if (error) throw error;
      toast.success(fonte.ativo ? "Fonte desativada" : "Fonte ativada");
      fetchFinanceiro();
    } catch (error: any) {
      toast.error("Erro ao alterar status: " + error.message);
    }
  };

  const openHistory = async (fonte: FinanceiroView) => {
    setSelectedFonteHistory(fonte);
    setHistoryOpen(true);
    try {
      const { data: history, error } = await supabase
        .from("financeiro_recebimentos")
        .select("*")
        .eq("fonte_id", fonte.fonte_id)
        .order("mes_referencia", { ascending: false })
        .limit(72); // 12 meses de até 6 parcelas
      if (error) throw error;
      setHistoryData(history || []);
    } catch (error: any) {
      console.error("Erro ao carregar histórico:", error);
    }
  };

  const historicoPorMes = useMemo(() => agruparHistorico(historyData), [historyData]);
  const situacaoHistorico = selectedFonteHistory ? situacaoDe(selectedFonteHistory) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground">Receita pessoal mensal</p>
        </div>
        <Button onClick={() => abrirFormulario(null)}>
          <Plus className="mr-2 h-4 w-4" /> Nova fonte
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Previsto no Mês</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(metrics.previsto)}</div>
            <p className="text-xs text-muted-foreground">{metrics.fontes} fontes ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Já Recebido</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{formatBRL(metrics.recebido)}</div>
            <p className="text-xs text-muted-foreground">{metrics.fontesRecebidas} de {metrics.fontes} confirmadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Aberto</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatBRL(metrics.emAberto)}</div>
            <p className="text-xs text-muted-foreground">{metrics.fontesEmAberto} fontes pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atrasado</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", metrics.atrasado > 0 ? "text-red-600" : "text-muted-foreground")}>
              {formatBRL(metrics.atrasado)}
            </div>
            <p className="text-xs text-muted-foreground">{metrics.fontesAtrasadas} fontes em atraso</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar fonte..." 
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[180px]">
            <Building2 className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Tipos</SelectItem>
            <SelectItem value="agencia">Agências</SelectItem>
            <SelectItem value="cliente_pessoal">Clientes Pessoais</SelectItem>
            <SelectItem value="freelancer">Freelancers</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="a_vencer">A vencer</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="recebido">Recebido</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex border rounded-md p-1">
          <Button 
            variant={viewMode === "cards" ? "secondary" : "ghost"} 
            size="icon" 
            className="h-8 w-8"
            onClick={() => setViewMode("cards")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button 
            variant={viewMode === "list" ? "secondary" : "ghost"} 
            size="icon" 
            className="h-8 w-8"
            onClick={() => setViewMode("list")}
          >
            <ListIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : filteredData.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted/30">
          <DollarSign size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-muted-foreground font-medium">Nenhuma fonte financeira encontrada.</p>
          <Button variant="link" onClick={() => { setSearchQuery(""); setFilterTipo("all"); setFilterStatus("all"); }}>
            Limpar filtros
          </Button>
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredData.map((fonte) => {
            const situacao = situacaoDe(fonte);
            const status = infoDoStatus(situacao.status);
            const unica = situacao.parcelas[0];
            return (
              <Card
                key={fonte.fonte_id}
                className={cn(
                  "group relative transition-all hover:shadow-md cursor-pointer border-l-4",
                  status.border,
                  situacao.status === "recebido" && "bg-emerald-50/30 dark:bg-emerald-950/10"
                )}
                onClick={() => openHistory(fonte)}
              >
                <CardHeader className="p-4 pb-2 space-y-0">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold truncate">{fonte.nome}</CardTitle>
                        <TipoBadge tipo={fonte.tipo} agenciaId={fonte.agencia_id} className="text-[9px] py-0 px-1.5 h-4" />
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity">
                          <MoreVertical size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px]">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); abrirFormulario(fonte); }}>
                          <Pencil size={12} className="mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleAtivo(fonte); }}>
                          {fonte.ativo ? (
                            <><XCircle size={12} className="mr-2" /> Desativar</>
                          ) : (
                            <><CheckCircle2 size={12} className="mr-2" /> Ativar</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive" 
                          onClick={(e) => { e.stopPropagation(); setDeletingId(fonte.fonte_id); }}
                        >
                          <Trash2 size={12} className="mr-2" /> Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <div className="space-y-1">
                    <div className="text-xl font-bold">{formatBRL(fonte.valor_mensal)}</div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {situacao.fracionado
                          ? `${situacao.parcelas.length} parcelas · ${descreverDias(situacao.parcelas)}`
                          : `Todo dia ${fonte.dia_recebimento}`}
                      </span>
                      <Badge variant="outline" className={cn("text-[9px] font-bold", status.text, status.border)}>
                        {status.label}
                        {situacao.fracionado && situacao.status !== "recebido" && ` · ${situacao.recebidas}/${situacao.parcelas.length}`}
                      </Badge>
                    </div>
                  </div>
                  <Separator />
                  <div className="pt-1">
                    {situacao.fracionado ? (
                      <ParcelasDoMes parcelas={situacao.parcelas} onAlternar={(p) => toggleParcela(fonte, p)} />
                    ) : (
                      <Button
                        variant={unica.status === "recebido" ? "outline" : "default"}
                        size="sm"
                        className={cn(
                          "w-full h-9 text-xs font-bold transition-all",
                          unica.status === "recebido" ? "border-emerald-200 text-emerald-600 bg-emerald-50/50" : ""
                        )}
                        onClick={(e) => { e.stopPropagation(); toggleParcela(fonte, unica); }}
                      >
                        {unica.status === "recebido" ? (
                          <><CheckCircle2 className="mr-2 h-4 w-4" /> Recebido{unica.recebimento?.data_confirmacao ? ` em ${new Date(unica.recebimento.data_confirmacao).toLocaleDateString('pt-BR')}` : ""}</>
                        ) : (
                          "Marcar como recebido"
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left py-3 px-4 font-semibold">Nome</th>
                <th className="text-left py-3 px-4 font-semibold">Tipo</th>
                <th className="text-left py-3 px-4 font-semibold">Valor</th>
                <th className="text-left py-3 px-4 font-semibold text-center">Dia</th>
                <th className="text-left py-3 px-4 font-semibold">Status</th>
                <th className="text-center py-3 px-4 font-semibold">Ação</th>
                <th className="text-right py-3 px-4 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((fonte) => {
                const situacao = situacaoDe(fonte);
                const status = infoDoStatus(situacao.status);
                return (
                  <tr
                    key={fonte.fonte_id}
                    className={cn(
                      "border-b transition-colors hover:bg-muted/30 cursor-pointer",
                      situacao.status === "recebido" && "bg-emerald-50/30 dark:bg-emerald-950/10"
                    )}
                    onClick={() => openHistory(fonte)}
                  >
                    <td className="py-3 px-4 font-medium">{fonte.nome}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1">
                        <TipoBadge tipo={fonte.tipo} agenciaId={fonte.agencia_id} className="text-[10px] py-0 px-2 h-4" />
                      </div>
                    </td>
                    <td className="py-3 px-4 font-bold">{formatBRL(fonte.valor_mensal)}</td>
                    <td className="py-3 px-4 text-center">{situacao.parcelas.map((p) => p.dia).join(" · ")}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <div className={cn("h-1.5 w-1.5 rounded-full", status.color)} />
                        <span className={cn("text-xs font-medium", status.text)}>
                          {status.label}
                          {situacao.fracionado && situacao.status !== "recebido" && ` · ${situacao.recebidas}/${situacao.parcelas.length}`}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        {situacao.parcelas.map((p) => {
                          const recebida = p.status === "recebido";
                          return (
                            <button
                              key={p.numero}
                              title={situacao.fracionado ? `Parcela ${p.numero}/${p.total} · dia ${p.dia} · ${formatBRL(p.valor)}` : undefined}
                              onClick={(e) => { e.stopPropagation(); toggleParcela(fonte, p); }}
                              className={cn(
                                "inline-flex items-center justify-center rounded-md h-6 min-w-[1.5rem] px-1 border text-[10px] font-bold transition-all",
                                recebida ? "bg-emerald-500 border-emerald-500 text-white" : "border-zinc-300 hover:border-emerald-500"
                              )}
                            >
                              {recebida ? <CheckCircle2 size={12} /> : situacao.fracionado ? p.dia : null}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); abrirFormulario(fonte); }}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingId(fonte.fonte_id); }}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Modal Criar/Editar Fonte */}
      <FonteDialog
        aberto={modalOpen}
        fonte={editingFonte}
        onFechar={() => { setModalOpen(false); setEditingFonte(null); }}
        onSalvo={fetchFinanceiro}
      />

      {/* Histórico e Detalhes - Sheet */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center gap-2 mb-2">
              {selectedFonteHistory && (
                <TipoBadge tipo={selectedFonteHistory.tipo} agenciaId={selectedFonteHistory.agencia_id} className="text-[9px] uppercase tracking-tighter" />
              )}
              {situacaoHistorico?.status === 'recebido' && (
                <Badge className="bg-emerald-500 text-[9px] h-4">✓ Recebido</Badge>
              )}
            </div>
            <SheetTitle className="text-xl font-bold">{selectedFonteHistory?.nome}</SheetTitle>
            <SheetDescription>
              Histórico de faturamento e detalhes do contrato
            </SheetDescription>
          </SheetHeader>

          <div className="mt-8 space-y-8 pb-8">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-muted/50 border space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Valor Mensal</p>
                <p className="text-xl font-bold">{formatBRL(selectedFonteHistory?.valor_mensal)}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/50 border space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                  {situacaoHistorico?.fracionado ? `Em ${situacaoHistorico.parcelas.length} parcelas` : "Dia Recebimento"}
                </p>
                <p className="text-xl font-bold">
                  {situacaoHistorico?.fracionado ? descreverDias(situacaoHistorico.parcelas) : `Todo dia ${selectedFonteHistory?.dia_recebimento}`}
                </p>
              </div>
            </div>

            {situacaoHistorico?.fracionado && (
              <div className="space-y-1.5">
                {situacaoHistorico.parcelas.map((p) => (
                  <div key={p.numero} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{p.numero}ª parcela · dia {p.dia}</span>
                    <span className="font-bold">{formatBRL(p.valor)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <History className="h-4 w-4" /> Histórico (Últimos 12 meses)
                </h4>
              </div>

              {historicoPorMes.length === 0 ? (
                <div className="text-center py-10 border rounded-xl bg-muted/20">
                  <p className="text-sm text-muted-foreground">Nenhum recebimento registrado ainda.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historicoPorMes.map((mes) => (
                    <div key={mes.mes} className="p-3 border rounded-lg bg-card shadow-sm space-y-2">
                      <span className="text-sm font-bold capitalize">{mes.nome}</span>
                      {mes.itens.map((rec) => (
                        <div key={rec.id} className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">
                            {mes.itens.length > 1 || (rec.parcela ?? 1) > 1 ? `${rec.parcela ?? 1}ª parcela · ` : ""}
                            {rec.recebido
                              ? `Recebido${rec.data_confirmacao ? ` em ${new Date(rec.data_confirmacao).toLocaleDateString('pt-BR')}` : ""}`
                              : 'Não recebido'}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-bold", rec.recebido ? "text-emerald-600" : "text-muted-foreground")}>
                              {rec.valor_recebido != null ? formatBRL(rec.valor_recebido) : "—"}
                            </span>
                            {rec.recebido ? (
                              <Badge variant="outline" className="text-[9px] h-4 py-0 border-emerald-200 text-emerald-600 bg-emerald-50">Confirmado</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] h-4 py-0 text-muted-foreground">Pendente</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedFonteHistory?.observacoes && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Info className="h-4 w-4" /> Observações
                </h4>
                <div className="p-4 rounded-xl bg-muted/30 border text-xs leading-relaxed italic text-muted-foreground">
                  {selectedFonteHistory.observacoes}
                </div>
              </div>
            )}
            
            <div className="pt-4">
              <Button className="w-full" variant="outline" onClick={() => { setHistoryOpen(false); abrirFormulario(selectedFonteHistory); }}>
                <Pencil size={14} className="mr-2" /> Editar Configurações da Fonte
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* AlertDialog Remover */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fonte financeira?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os recebimentos históricos de <strong>{data.find(f => f.fonte_id === deletingId)?.nome}</strong> serão deletados permanentemente. Esta ação não pode ser desfeita.
              <br/><br/>
              <em>Dica: Você pode apenas desativar a fonte para manter o histórico mas removê-la dos cálculos mensais.</em>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button 
              variant="outline" 
              onClick={() => {
                if (deletingId) {
                  const f = data.find(it => it.fonte_id === deletingId);
                  if (f) handleToggleAtivo(f);
                }
                setDeletingId(null);
              }}
            >
              Apenas desativar
            </Button>
            <AlertDialogAction onClick={handleDeleteFonte} className="bg-destructive hover:bg-destructive/90">
              Remover permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
