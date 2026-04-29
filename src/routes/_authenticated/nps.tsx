import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus, Search, Building2, Filter, AlertTriangle, TrendingUp, Users, Target, AlertCircle, Calendar, MoreVertical, Edit2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getScoreCategory } from "@/lib/nps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AGENCIAS } from "@/lib/clientes";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NPSCard } from "@/components/NPSCard";
import { NPSForm } from "@/components/NPSForm";
import { NPSHistoryDrawer } from "@/components/NPSHistoryDrawer";
import { Dialog } from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { NPS_SCORE_CATEGORIES, isFridayToday, getDiasAteProximaSexta, getProximaSextaFormatada } from "@/lib/nps";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_authenticated/nps")({
  component: NPSPage,
});

function NPSPage() {
  const queryClient = useQueryClient();
  const [filterAgencia, setFilterAgencia] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAvaliacao, setEditingAvaliacao] = useState<any>(null);
  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string>("");

  const isFriday = isFridayToday();
  const nextFriday = getProximaSextaFormatada();
  const daysUntilFriday = getDiasAteProximaSexta();

  const { data: avaliacoes, isLoading, error: queryError } = useQuery({
    queryKey: ["nps-avaliacoes"],
    queryFn: async () => {
      console.log("Fetching NPS avaliacoes...");
      const { data, error } = await supabase
        .from("nps_avaliacoes_view")
        .select("*")
        .order("data_avaliacao", { ascending: false });

      if (error) {
        console.error("NPS error:", error);
        throw error;
      }

      return data || [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nps_avaliacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nps-avaliacoes"] });
      toast.success("Avaliação removida");
    },
    onError: (err: any) => {
      toast.error(`Erro ao remover avaliação: ${err.message}`);
      console.error(err);
    },
  });

  const filteredData = useMemo(() => {
    if (!avaliacoes) return [];
    const filtered = avaliacoes.filter(item => {
      const matchesAgencia = filterAgencia === "all" || item.cliente_agencia === filterAgencia;
      const matchesCategory = filterCategory === "all" || item.categoria === filterCategory;
      const matchesSearch = item.cliente_nome?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesAgencia && matchesSearch && matchesCategory;
    });
    // Ordena por categoria: crítico → em risco → saudável → âncora; secundariamente por score crescente
    const categoriaOrdem: Record<string, number> = { critico: 0, em_risco: 1, saudavel: 2, ancora: 3 };
    return [...filtered].sort((a, b) => {
      const ca = categoriaOrdem[a.categoria as string] ?? 99;
      const cb = categoriaOrdem[b.categoria as string] ?? 99;
      if (ca !== cb) return ca - cb;
      return (a.score_total || 0) - (b.score_total || 0);
    });
  }, [avaliacoes, filterAgencia, filterCategory, searchQuery]);

  const stats = useMemo(() => {
    if (!filteredData.length) return { avgScore: 0, criticalCount: 0, total: 0, distribution: [] };
    const total = filteredData.length;
    const avgScore = Math.round(filteredData.reduce((acc, curr) => acc + (curr.score_total || 0), 0) / total);
    const criticalCount = filteredData.filter(i => i.categoria === "critico" || i.categoria === "em_risco").length;
    
    const distribution = NPS_SCORE_CATEGORIES.map(cat => ({
      ...cat,
      count: filteredData.filter(i => i.categoria === cat.id).length
    }));

    return { avgScore, criticalCount, total, distribution };
  }, [filteredData]);

  return (
    <div className="space-y-6">
      {isFriday ? (
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg flex items-center gap-3 text-emerald-700 dark:text-emerald-400 text-sm font-medium animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Calendar size={18} />
          </div>
          <p>✓ Janela de avaliação aberta. Preencha o NPS dos clientes hoje.</p>
        </div>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex items-center gap-3 text-amber-700 dark:text-amber-400 text-sm font-medium">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} />
          </div>
          <p>⚠️ Modo somente visualização. Próxima janela de avaliação: sexta-feira {nextFriday} (em {daysUntilFriday} {daysUntilFriday === 1 ? 'dia' : 'dias'}).</p>
        </div>
      )}

      {queryError && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center gap-2">
              <AlertCircle size={20} />
              Erro ao carregar NPS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="text-xs bg-white dark:bg-black/30 p-3 rounded overflow-auto max-h-40">
              {JSON.stringify(queryError, null, 2)}
            </pre>
            <Button variant="destructive" onClick={() => queryClient.invalidateQueries({ queryKey: ["nps-avaliacoes"] })}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NPS Multidimensional</h1>
          <p className="text-muted-foreground">Gestão estratégica de saúde e satisfação da carteira.</p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="inline-block">
                <Button 
                  className={cn("gap-2 relative", !isFriday && "opacity-60 cursor-not-allowed")} 
                  onClick={() => isFriday && setIsFormOpen(true)}
                  disabled={!isFriday}
                >
                  <Plus size={16} />
                  Nova avaliação
                  {isFriday && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                  )}
                </Button>
              </div>
            </TooltipTrigger>
            {!isFriday && (
              <TooltipContent>
                <p>Avaliações NPS só podem ser registradas às sextas-feiras.</p>
                <p className="text-xs opacity-70">Próxima janela: {nextFriday} (em {daysUntilFriday} dias).</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Users size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase opacity-60">Clientes Avaliados</p>
              <p className="text-xl font-black">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase opacity-60">Score Médio</p>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black">{stats.avgScore}</span>
                <span className="text-[10px] font-bold opacity-60">/50</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-4 flex flex-col justify-center h-full">
            <p className="text-[10px] font-bold uppercase opacity-60 mb-2">Distribuição</p>
            <div className="flex gap-1 h-3 w-full rounded-full overflow-hidden bg-muted">
              {stats.distribution?.map((cat) => (
                <div 
                  key={cat.id} 
                  className={cn("h-full", cat.color.split(' ')[0])} 
                  style={{ width: `${(cat.count / stats.total) * 100}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-600">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase opacity-60">Ação Imediata</p>
              <p className="text-xl font-black">{stats.criticalCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4">
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
          <SelectTrigger className="w-[180px]">
            <Building2 className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Agência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as agências</SelectItem>
            {AGENCIAS.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[180px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {NPS_SCORE_CATEGORIES.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-20">Carregando...</div>
        ) : avaliacoes === undefined || (avaliacoes.length === 0 && !isLoading) ? (
          <div className="space-y-4">
            {queryError ? (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardHeader className="flex flex-row items-center gap-2">
                  <AlertCircle className="text-destructive" size={20} />
                  <CardTitle className="text-destructive">Erro ao carregar NPS</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-destructive/80">
                    Falha na comunicação com a view de avaliações NPS.
                  </p>
                  {queryError instanceof Error && (
                    <pre className="p-2 bg-black/5 rounded text-[10px] font-mono text-destructive/70 overflow-auto max-h-32">
                      {queryError.message}
                    </pre>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["nps-avaliacoes"] })} className="border-destructive/30 text-destructive hover:bg-destructive/10">
                      Tentar novamente
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="border-muted-foreground/30 text-muted-foreground">
                      Recarregar página
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/30 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Target size={24} className="opacity-20" />
                </div>
                <h3 className="text-lg font-semibold">Nenhuma avaliação encontrada</h3>
                <p className="text-muted-foreground max-w-xs">Use filtros diferentes ou registre uma nova avaliação de saúde para este cliente.</p>
                <Button variant="outline" className="mt-4" onClick={() => setIsFormOpen(true)}>
                  Criar primeira avaliação
                </Button>
              </div>
            )}
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/30 text-center">
             <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Target size={24} className="opacity-20" />
            </div>
            <h3 className="text-lg font-semibold">Nenhum resultado para os filtros</h3>
            <p className="text-muted-foreground">Tente ajustar seus critérios de busca ou agência.</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {filteredData.map((item) => {
              const cat = getScoreCategory(item.score_total ?? 0);
              const isPausado = item.cliente_status_operacional === "pausado";
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-4 p-3 hover:bg-muted/40 transition-colors cursor-pointer",
                    isPausado && "opacity-70"
                  )}
                  onClick={() => setSelectedCliente({ id: item.cliente_id, nome: item.cliente_nome, agencia: item.cliente_agencia })}
                >
                  <div className={cn(
                    "flex flex-col items-center justify-center w-14 h-14 rounded-md font-black text-lg shrink-0",
                    cat.color
                  )}>
                    {item.score_total}
                    <span className="text-[9px] font-bold opacity-80">/50</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{item.cliente_nome}</h3>
                      <Badge variant="outline" className="text-[10px] uppercase">{item.cliente_agencia}</Badge>
                      {isPausado && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 bg-amber-50">Pausado</Badge>}
                      {item.cliente_em_onboarding && <Badge className="bg-emerald-500 text-[10px]">Onboarding</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                        cat.color
                      )}>{cat.label}</span>
                      <span className="truncate">{cat.action}</span>
                    </div>
                  </div>

                  <div className="text-right hidden md:block text-xs text-muted-foreground shrink-0">
                    {item.data_avaliacao ? new Date(item.data_avaliacao).toLocaleDateString("pt-BR") : "—"}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[140px]">
                      <DropdownMenuItem
                        disabled={!isFriday}
                        onClick={(e) => { e.stopPropagation(); if (isFriday) { setEditingAvaliacao(item); setIsFormOpen(true); } }}
                      >
                        <Edit2 size={14} className="mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!isFriday}
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => { e.stopPropagation(); if (isFriday) { setDeletingId(item.id); setDeletingName(item.cliente_nome || "esta avaliação"); } }}
                      >
                        <Trash2 size={14} className="mr-2" /> Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog 
        open={isFormOpen} 
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingAvaliacao(null);
        }}
      >
        <NPSForm 
          onClose={() => setIsFormOpen(false)} 
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["nps-avaliacoes"] })} 
          initialData={editingAvaliacao}
        />
      </Dialog>

      {selectedCliente && (
        <NPSHistoryDrawer 
          cliente={selectedCliente} 
          onClose={() => setSelectedCliente(null)} 
        />
      )}

      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja remover?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A avaliação de {deletingName} será permanentemente deletada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deletingId) deleteMutation.mutate(deletingId);
                setDeletingId(null);
              }} 
              className="bg-destructive hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
