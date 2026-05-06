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
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
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
import { formatBRL, parseBRLInput, maskBRLInput } from "@/lib/clientes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Route = createFileRoute("/_authenticated/financeiro")({
  component: FinanceiroPage,
});

type FinanceiroView = {
  fonte_id: string;
  user_id: string;
  nome: string;
  tipo: 'agencia' | 'cliente_pessoal';
  valor_mensal: number;
  dia_recebimento: number;
  ativo: boolean;
  observacoes: string | null;
  mes_atual: string;
  recebimento_id: string | null;
  recebido_mes_atual: boolean;
  data_confirmacao: string | null;
  valor_recebido: number | null;
  status_mes: 'recebido' | 'atrasado' | 'pendente' | 'a_vencer';
};

function FinanceiroPage() {
  const [data, setData] = useState<FinanceiroView[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFonte, setEditingFonte] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedFonteHistory, setSelectedFonteHistory] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);

  const fetchFinanceiro = async () => {
    setLoading(true);
    try {
      const { data: viewData, error } = await supabase
        .from("financeiro_view" as any)
        .select("*")
        .order("nome");

      if (error) throw error;
      setData((viewData as any[]) || []);
    } catch (error: any) {
      toast.error("Erro ao carregar financeiro: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceiro();
  }, []);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesTipo = filterTipo === "all" || item.tipo === filterTipo;
      const matchesStatus = filterStatus === "all" || item.status_mes === filterStatus;
      const matchesSearch = item.nome.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTipo && matchesStatus && matchesSearch;
    });
  }, [data, filterTipo, filterStatus, searchQuery]);

  const metrics = useMemo(() => {
    const totalPrevisto = data.reduce((acc, curr) => acc + (curr.valor_mensal || 0), 0);
    const totalRecebido = data.reduce((acc, curr) => acc + (curr.recebido_mes_atual ? (curr.valor_recebido || curr.valor_mensal) : 0), 0);
    const totalEmAberto = data.filter(i => !i.recebido_mes_atual).reduce((acc, curr) => acc + curr.valor_mensal, 0);
    const totalAtrasado = data.filter(i => i.status_mes === 'atrasado').reduce((acc, curr) => acc + curr.valor_mensal, 0);

    return {
      totalPrevisto,
      totalRecebido,
      totalEmAberto,
      totalAtrasado,
      fontesAtivas: data.length,
      fontesConfirmadas: data.filter(i => i.recebido_mes_atual).length,
      fontesPendentes: data.filter(i => !i.recebido_mes_atual).length,
      fontesAtrasadas: data.filter(i => i.status_mes === 'atrasado').length
    };
  }, [data]);

  const toggleRecebido = async (item: FinanceiroView) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';
      // if (!user) return; // Removido para permitir acesso sem login

      const now = new Date();
      const mesRefStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

      if (item.recebimento_id) {
        // Alterna o estado
        const { error } = await supabase
          .from("financeiro_recebimentos")
          .update({
            recebido: !item.recebido_mes_atual,
            data_confirmacao: !item.recebido_mes_atual ? new Date().toISOString() : null,
            valor_recebido: !item.recebido_mes_atual ? item.valor_mensal : null,
          })
          .eq("id", item.recebimento_id);
        if (error) throw error;
      } else {
        // Cria novo registro
        const { error } = await supabase
          .from("financeiro_recebimentos")
          .insert({
            user_id: userId,
            fonte_id: item.fonte_id,
            mes_referencia: mesRefStr,
            recebido: true,
            data_confirmacao: new Date().toISOString(),
            valor_recebido: item.valor_mensal,
          });
        if (error) throw error;
      }
      
      toast.success(item.recebido_mes_atual ? "Status alterado para pendente" : "Marcar como recebido!");
      fetchFinanceiro();
    } catch (error: any) {
      toast.error("Erro ao atualizar recebimento: " + error.message);
    }
  };

  const handleSaveFonte = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    const values = {
      nome: formData.get("nome") as string,
      tipo: formData.get("tipo") as string,
      valor_mensal: parseBRLInput(formData.get("valor_mensal") as string),
      dia_recebimento: parseInt(formData.get("dia_recebimento") as string),
      ativo: formData.get("ativo") === "on",
      observacoes: formData.get("observacoes") as string,
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';
      // if (!user) throw new Error("Usuário não autenticado");

      if (editingFonte) {
        const { error } = await supabase
          .from("financeiro_fontes")
          .update(values)
          .eq("id", editingFonte.fonte_id);
        if (error) throw error;
        toast.success("Fonte atualizada com sucesso");
      } else {
        const { error } = await supabase
          .from("financeiro_fontes")
          .insert([{ ...values, user_id: userId }]);
        if (error) throw error;
        toast.success("Fonte criada com sucesso");
      }
      setModalOpen(false);
      setEditingFonte(null);
      fetchFinanceiro();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
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
        .limit(12);
      if (error) throw error;
      setHistoryData(history || []);
    } catch (error: any) {
      console.error("Erro ao carregar histórico:", error);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'recebido': return { label: "Recebido", color: "bg-emerald-500", text: "text-emerald-500", border: "border-emerald-200", bg: "bg-emerald-50/50" };
      case 'atrasado': return { label: "Atrasado", color: "bg-red-500", text: "text-red-500", border: "border-red-200", bg: "bg-red-50/50" };
      case 'pendente': return { label: "Pendente", color: "bg-amber-500", text: "text-amber-500", border: "border-amber-200", bg: "bg-amber-50/50" };
      default: return { label: "A vencer", color: "bg-zinc-400", text: "text-zinc-500", border: "border-zinc-200", bg: "bg-zinc-50/50" };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground">Receita pessoal mensal</p>
        </div>
        <Button onClick={() => { setEditingFonte(null); setModalOpen(true); }}>
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
            <div className="text-2xl font-bold">{formatBRL(metrics.totalPrevisto)}</div>
            <p className="text-xs text-muted-foreground">{metrics.fontesAtivas} fontes ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Já Recebido</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{formatBRL(metrics.totalRecebido)}</div>
            <p className="text-xs text-muted-foreground">{metrics.fontesConfirmadas} de {metrics.fontesAtivas} confirmadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Aberto</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatBRL(metrics.totalEmAberto)}</div>
            <p className="text-xs text-muted-foreground">{metrics.fontesPendentes} fontes pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atrasado</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", metrics.totalAtrasado > 0 ? "text-red-600" : "text-muted-foreground")}>
              {formatBRL(metrics.totalAtrasado)}
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
            const status = getStatusInfo(fonte.status_mes);
            return (
              <Card 
                key={fonte.fonte_id} 
                className={cn(
                  "group relative transition-all hover:shadow-md cursor-pointer border-l-4",
                  status.border,
                  fonte.recebido_mes_atual && "bg-emerald-50/30 dark:bg-emerald-950/10"
                )}
                onClick={() => openHistory(fonte)}
              >
                <CardHeader className="p-4 pb-2 space-y-0">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold truncate">{fonte.nome}</CardTitle>
                        <Badge variant="outline" className={cn(
                          "text-[9px] py-0 px-1.5 h-4",
                          fonte.tipo === 'agencia' ? "text-blue-600 border-blue-200 bg-blue-50" : "text-emerald-600 border-emerald-200 bg-emerald-50"
                        )}>
                          {fonte.tipo === 'agencia' ? 'Agência' : 'Pessoal'}
                        </Badge>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px]">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingFonte(fonte); setModalOpen(true); }}>
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
                      <span>Todo dia {fonte.dia_recebimento}</span>
                      <Badge variant="outline" className={cn("text-[9px] font-bold", status.text, status.border)}>
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                  <Separator />
                  <div className="pt-1">
                    <Button 
                      variant={fonte.recebido_mes_atual ? "outline" : "default"}
                      size="sm"
                      className={cn(
                        "w-full h-9 text-xs font-bold transition-all",
                        fonte.recebido_mes_atual ? "border-emerald-200 text-emerald-600 bg-emerald-50/50" : ""
                      )}
                      onClick={(e) => { e.stopPropagation(); toggleRecebido(fonte); }}
                    >
                      {fonte.recebido_mes_atual ? (
                        <><CheckCircle2 className="mr-2 h-4 w-4" /> Recebido em {new Date(fonte.data_confirmacao!).toLocaleDateString('pt-BR')}</>
                      ) : (
                        "Marcar como recebido"
                      )}
                    </Button>
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
                const status = getStatusInfo(fonte.status_mes);
                return (
                  <tr 
                    key={fonte.fonte_id} 
                    className={cn(
                      "border-b transition-colors hover:bg-muted/30 cursor-pointer",
                      fonte.recebido_mes_atual && "bg-emerald-50/30 dark:bg-emerald-950/10"
                    )}
                    onClick={() => openHistory(fonte)}
                  >
                    <td className="py-3 px-4 font-medium">{fonte.nome}</td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className={cn(
                        "text-[10px] py-0 px-2 h-4",
                        fonte.tipo === 'agencia' ? "text-blue-600 border-blue-200 bg-blue-50" : "text-emerald-600 border-emerald-200 bg-emerald-50"
                      )}>
                        {fonte.tipo === 'agencia' ? 'Agência' : 'Pessoal'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-bold">{formatBRL(fonte.valor_mensal)}</td>
                    <td className="py-3 px-4 text-center">{fonte.dia_recebimento}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <div className={cn("h-1.5 w-1.5 rounded-full", status.color)} />
                        <span className={cn("text-xs font-medium", status.text)}>{status.label}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleRecebido(fonte); }}
                        className={cn(
                          "inline-flex items-center justify-center rounded-md h-6 w-6 border transition-all",
                          fonte.recebido_mes_atual ? "bg-emerald-500 border-emerald-500 text-white" : "border-zinc-300 hover:border-emerald-500"
                        )}
                      >
                        {fonte.recebido_mes_atual && <CheckCircle2 size={12} />}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditingFonte(fonte); setModalOpen(true); }}>
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
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSaveFonte}>
            <DialogHeader>
              <DialogTitle>{editingFonte ? "Editar Fonte" : "Nova Fonte de Receita"}</DialogTitle>
              <DialogDescription>
                Configure os detalhes da sua fonte de faturamento pessoal.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="nome">Nome da Fonte</Label>
                <Input id="nome" name="nome" placeholder="Ex: Agência Effect, Cliente João..." defaultValue={editingFonte?.nome} required />
              </div>
              <div className="grid gap-2">
                <Label>Tipo de Fonte</Label>
                <RadioGroup name="tipo" defaultValue={editingFonte?.tipo || "agencia"} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="agencia" id="agencia" />
                    <Label htmlFor="agencia" className="font-normal cursor-pointer">Agência</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="cliente_pessoal" id="cliente_pessoal" />
                    <Label htmlFor="cliente_pessoal" className="font-normal cursor-pointer">Cliente Pessoal</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="valor_mensal">Valor Mensal</Label>
                  <Input 
                    id="valor_mensal" 
                    name="valor_mensal" 
                    placeholder="R$ 0,00" 
                    defaultValue={editingFonte ? maskBRLInput(editingFonte.valor_mensal.toString()) : ""} 
                    onChange={(e) => e.target.value = maskBRLInput(e.target.value)}
                    required 
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="dia_recebimento">Dia do Recebimento</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info size={12} className="text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[200px]">
                          <p className="text-xs">Se o dia for 30 ou 31 e o mês não tiver, considera o último dia do mês.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input 
                    id="dia_recebimento" 
                    name="dia_recebimento" 
                    type="number" 
                    min="1" 
                    max="31" 
                    defaultValue={editingFonte?.dia_recebimento || 1} 
                    required 
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2 py-2">
                <Switch id="ativo" name="ativo" defaultChecked={editingFonte ? editingFonte.ativo : true} />
                <Label htmlFor="ativo">Fonte ativa para faturamento</Label>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="observacoes">Observações (Opcional)</Label>
                <Textarea id="observacoes" name="observacoes" placeholder="Notas sobre o contrato, forma de pagamento..." defaultValue={editingFonte?.observacoes || ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : editingFonte ? "Salvar Alterações" : "Criar Fonte"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Histórico e Detalhes - Sheet */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={cn(
                "text-[9px] uppercase tracking-tighter",
                selectedFonteHistory?.tipo === 'agencia' ? "text-blue-600 border-blue-200" : "text-emerald-600 border-emerald-200"
              )}>
                {selectedFonteHistory?.tipo === 'agencia' ? 'Agência' : 'Pessoal'}
              </Badge>
              {selectedFonteHistory?.status_mes === 'recebido' && (
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
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Dia Recebimento</p>
                <p className="text-xl font-bold">Todo dia {selectedFonteHistory?.dia_recebimento}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <History className="h-4 w-4" /> Histórico (Últimos 12 meses)
                </h4>
              </div>

              {historyData.length === 0 ? (
                <div className="text-center py-10 border rounded-xl bg-muted/20">
                  <p className="text-sm text-muted-foreground">Nenhum recebimento registrado ainda.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyData.map((rec) => (
                    <div key={rec.id} className="flex items-center justify-between p-3 border rounded-lg bg-card shadow-sm">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold capitalize">
                          {new Date(rec.mes_referencia).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {rec.recebido ? `Recebido em ${new Date(rec.data_confirmacao).toLocaleDateString('pt-BR')}` : 'Não recebido'}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-emerald-600">{formatBRL(rec.valor_recebido)}</div>
                        <Badge variant="outline" className="text-[9px] h-4 py-0 border-emerald-200 text-emerald-600 bg-emerald-50">Confirmado</Badge>
                      </div>
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
              <Button className="w-full" variant="outline" onClick={() => { setHistoryOpen(false); setEditingFonte(selectedFonteHistory); setModalOpen(true); }}>
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
