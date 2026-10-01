import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useMemo } from "react";
import { Plus, Search, Loader2, Building2, Filter, AlertTriangle, TrendingUp, Users, Target, AlertCircle, MoreVertical, Edit2, Trash2, ClipboardCheck, History, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getScoreCategory, NPS_SCORE_CATEGORIES } from "@/lib/nps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAgencias, agenciaBadgeStyle } from "@/lib/agencias";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NPS_AVALIACOES_QUERY, NPS_CLIENTES_QUERY } from "@/lib/data";
import { NPSForm } from "@/components/NPSForm";
import type { NPSHistoryDrawer as NPSHistoryDrawerTipo } from "@/components/NPSHistoryDrawer";
import { esperarOcioso } from "@/lib/aquecimento";
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
import { useBusca } from "@/lib/useBusca";
import { MensagemBusca } from "@/components/MensagemBusca";

export const Route = createFileRoute("/_authenticated/nps")({
  component: NPSPage,
});

interface ClienteRow {
  id: string;
  nome: string;
  agencia: string;
  status_operacional: string | null;
  em_onboarding: boolean | null;
  nicho: string | null;
}

/** Linha da lista: todo cliente ativo aparece, com ou sem avaliação */
interface NPSRow {
  cliente: ClienteRow;
  ultima: any | null;
  categoria: string; // id de NPS_SCORE_CATEGORIES ou "sem_avaliacao"
}

const CATEGORIA_ORDEM: Record<string, number> = { critico: 0, em_risco: 1, saudavel: 2, ancora: 3, sem_avaliacao: 4 };

// O histórico (gráficos do recharts, a maior parte do código desta aba) fica num pacote à parte: a lista
// abre sem ele e ele é baixado logo depois, com o navegador ocioso — ao abrir o histórico já está pronto.
let historicoCarregado: typeof NPSHistoryDrawerTipo | null = null;
const carregarHistorico = () => import("@/components/NPSHistoryDrawer").then((m) => (historicoCarregado = m.NPSHistoryDrawer));
function useHistoricoNps() {
  const [Historico, setHistorico] = useState(() => historicoCarregado);
  // Chamada no clique: começa o download na hora (ou usa o que já chegou). Se falhar, a promessa rejeita e o
  // próximo clique tenta de novo — nada fica guardado como "falhou".
  const garantir = useCallback(
    () => (historicoCarregado ? Promise.resolve(historicoCarregado) : carregarHistorico()).then((H) => { setHistorico(() => H); }),
    [],
  );
  useEffect(() => {
    if (Historico) return;
    let vivo = true;
    esperarOcioso().then(carregarHistorico).then((H) => { if (vivo) setHistorico(() => H); }).catch(() => {});
    return () => { vivo = false; };
  }, [Historico]);
  return { Historico, garantir };
}

function NPSPage() {
  const queryClient = useQueryClient();
  const { Historico: NPSHistoryDrawer, garantir: garantirHistorico } = useHistoricoNps();
  const { agencias, label: agenciaLabelOf, meta: agenciaMetaOf } = useAgencias();
  const [filterAgencia, setFilterAgencia] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAvaliacao, setEditingAvaliacao] = useState<any>(null);
  const [formClienteId, setFormClienteId] = useState<string | undefined>(undefined);
  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string>("");

  // Histórico: o clique já começa a baixar o código (se ainda não chegou) e a gaveta abre assim que ele vem
  const abrirHistorico = (cliente: ClienteRow) => {
    const alvo = { id: cliente.id, nome: cliente.nome, agencia: cliente.agencia };
    setSelectedCliente(alvo);
    garantirHistorico().catch(() => {
      toast.error("Não foi possível abrir o histórico. Tente de novo.");
      setSelectedCliente((atual: any) => (atual === alvo ? null : atual));
    });
  };

  // Todos os clientes ativos entram na lista, mesmo sem avaliação.
  // Consultas compartilhadas com o pré-aquecimento do app (src/lib/data.ts): a aba abre com os dados na hora.
  const { data: clientesQuery, isLoading: loadingClientes, error: clientesError } = useQuery({ ...NPS_CLIENTES_QUERY, refetchOnMount: "always" });
  const clientes = clientesQuery as ClienteRow[] | undefined;

  const { data: avaliacoes, isLoading: loadingAvaliacoes, error: queryError } = useQuery({ ...NPS_AVALIACOES_QUERY, refetchOnMount: "always" });

  const isLoading = loadingClientes || loadingAvaliacoes;
  const loadError = clientesError || queryError;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["nps-avaliacoes"] });
    queryClient.invalidateQueries({ queryKey: ["clientes-ativos-nps"] });
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nps_avaliacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Avaliação removida");
    },
    onError: (err: any) => {
      toast.error(`Erro ao remover avaliação: ${err.message}`);
    },
  });

  const rows = useMemo<NPSRow[]>(() => {
    if (!clientes) return [];
    return clientes.map((cliente) => {
      // A view já vem ordenada da mais recente para a mais antiga
      const ultima = (avaliacoes || []).find((a: any) => a.cliente_id === cliente.id) || null;
      const categoria = ultima ? getScoreCategory(ultima.score_total ?? 0).id : "sem_avaliacao";
      return { cliente, ultima, categoria };
    });
  }, [clientes, avaliacoes]);

  // Filtros e ordenação da tela, sem o texto da busca (a busca tolerante vem depois, em `resultadoBusca`)
  const baseRows = useMemo(() => {
    const filtered = rows.filter((r) => {
      const matchesAgencia = filterAgencia === "all" || r.cliente.agencia === filterAgencia;
      const matchesCategory = filterCategory === "all" || r.categoria === filterCategory;
      return matchesAgencia && matchesCategory;
    });
    // Crítico → em risco → saudável → âncora → sem avaliação; depois por score crescente
    return [...filtered].sort((a, b) => {
      const ca = CATEGORIA_ORDEM[a.categoria] ?? 99;
      const cb = CATEGORIA_ORDEM[b.categoria] ?? 99;
      if (ca !== cb) return ca - cb;
      if (a.ultima && b.ultima) return (a.ultima.score_total || 0) - (b.ultima.score_total || 0);
      return a.cliente.nome.localeCompare(b.cliente.nome);
    });
  }, [rows, filterAgencia, filterCategory]);

  const resultadoBusca = useBusca(baseRows, searchQuery, (r) => [r.cliente.nome]);
  const filteredRows = resultadoBusca.itens;

  const stats = useMemo(() => {
    const avaliados = filteredRows.filter((r) => r.ultima);
    const semAvaliacao = filteredRows.length - avaliados.length;
    const avgScore = avaliados.length
      ? Math.round(avaliados.reduce((acc, r) => acc + (r.ultima.score_total || 0), 0) / avaliados.length)
      : 0;
    const criticalCount = avaliados.filter((r) => r.categoria === "critico" || r.categoria === "em_risco").length;
    const distribution = NPS_SCORE_CATEGORIES.map((cat) => ({
      ...cat,
      count: avaliados.filter((r) => r.categoria === cat.id).length,
    }));
    return { avaliados: avaliados.length, semAvaliacao, avgScore, criticalCount, distribution };
  }, [filteredRows]);

  const openNewForClient = (clienteId?: string) => {
    setEditingAvaliacao(null);
    setFormClienteId(clienteId);
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {loadError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertCircle className="text-destructive" size={20} />
            <CardTitle className="text-destructive">Erro ao carregar NPS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="text-xs bg-white dark:bg-black/30 p-3 rounded overflow-auto max-h-40">
              {(loadError as any)?.message || JSON.stringify(loadError, null, 2)}
            </pre>
            <Button variant="outline" size="sm" onClick={invalidate}>Tentar novamente</Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NPS Multidimensional</h1>
          <p className="text-muted-foreground">Gestão estratégica de saúde e satisfação da carteira.</p>
        </div>
        <Button className="gap-2" onClick={() => openNewForClient()}>
          <Plus size={16} />
          Nova avaliação
        </Button>
      </div>

      <div className="bg-muted/40 border rounded-lg p-3 flex items-center gap-3 text-sm text-muted-foreground">
        <Info size={16} className="shrink-0" />
        <p>Todos os clientes ativos aparecem aqui. Avalie quando quiser — os critérios são sempre os mesmos: 5 métricas de 0 a 10, score de 0 a 50.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Users size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase opacity-60">Clientes avaliados</p>
              <div className="flex items-baseline gap-1">
                <span className="numeric text-xl font-semibold">{stats.avaliados}</span>
                <span className="text-[10px] font-bold opacity-60">/ {filteredRows.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase opacity-60">Score médio</p>
              <div className="flex items-baseline gap-1">
                <span className="numeric text-xl font-semibold">{stats.avgScore}</span>
                <span className="text-[10px] font-bold opacity-60">/50</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-4 flex flex-col justify-center h-full">
            <p className="text-[10px] font-bold uppercase opacity-60 mb-2">Distribuição</p>
            <div className="flex gap-1 h-3 w-full rounded-full overflow-hidden bg-muted">
              {stats.avaliados > 0 && stats.distribution.map((cat) => (
                <div
                  key={cat.id}
                  className={cn("h-full", cat.color.split(" ")[0])}
                  style={{ width: `${(cat.count / stats.avaliados) * 100}%` }}
                  title={`${cat.label}: ${cat.count}`}
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
              <p className="text-[10px] font-bold uppercase opacity-60">Ação imediata</p>
              <p className="numeric text-xl font-semibold">{stats.criticalCount}</p>
              {stats.semAvaliacao > 0 && (
                <p className="text-[10px] text-muted-foreground">{stats.semAvaliacao} sem avaliação</p>
              )}
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
            {agencias.map((a) => (
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
            {NPS_SCORE_CATEGORIES.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
            ))}
            <SelectItem value="sem_avaliacao">Sem avaliação</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {!isLoading && resultadoBusca.modo === "parecidos" && <MensagemBusca resultado={resultadoBusca} />}
        {isLoading ? (
          <div className="flex justify-center py-20 text-muted-foreground">Carregando...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/30 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Target size={24} className="opacity-20" />
            </div>
            <h3 className="text-lg font-semibold">Nenhum cliente ativo</h3>
            <p className="text-muted-foreground max-w-xs">Cadastre clientes na aba Clientes Ativos — eles aparecem aqui automaticamente.</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/30 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Target size={24} className="opacity-20" />
            </div>
            {resultadoBusca.modo === "nenhum" ? (
              <MensagemBusca resultado={resultadoBusca} className="text-lg font-semibold text-foreground" />
            ) : (
              <h3 className="text-lg font-semibold">Nenhum resultado para os filtros</h3>
            )}
            <p className="text-muted-foreground">Tente ajustar seus critérios de busca, agência ou categoria.</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {filteredRows.map(({ cliente, ultima, categoria }) => {
              const cat = ultima ? getScoreCategory(ultima.score_total ?? 0) : null;
              const isPausado = cliente.status_operacional === "pausado";
              return (
                <div
                  key={cliente.id}
                  className={cn(
                    "flex items-center gap-4 p-3 hover:bg-muted/40 transition-colors cursor-pointer",
                    isPausado && "opacity-70"
                  )}
                  onClick={() => abrirHistorico(cliente)}
                >
                  {cat ? (
                    <div className={cn(
                      "flex flex-col items-center justify-center w-14 h-14 rounded-md font-black text-lg shrink-0",
                      cat.color
                    )}>
                      {ultima.score_total}
                      <span className="text-[9px] font-bold opacity-80">/50</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-14 h-14 rounded-md border border-dashed text-muted-foreground shrink-0">
                      <ClipboardCheck size={18} className="opacity-50" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{cliente.nome}</h3>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase"
                        style={agenciaBadgeStyle(agenciaMetaOf(cliente.agencia)?.hex)}
                      >
                        {agenciaLabelOf(cliente.agencia)}
                      </Badge>
                      {isPausado && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 bg-amber-50">Pausado</Badge>}
                      {cliente.em_onboarding && <Badge className="bg-emerald-500 text-[10px]">Onboarding</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      {cat ? (
                        <>
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", cat.color)}>{cat.label}</span>
                          <span className="truncate">{cat.action}</span>
                        </>
                      ) : (
                        <>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-muted text-muted-foreground">Sem avaliação</span>
                          <span className="truncate">Ainda não avaliado — clique em Avaliar.</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right hidden md:block text-xs text-muted-foreground shrink-0">
                    {ultima?.data_avaliacao ? new Date(ultima.data_avaliacao).toLocaleDateString("pt-BR") : "—"}
                  </div>

                  {!ultima && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 shrink-0"
                      onClick={(e) => { e.stopPropagation(); openNewForClient(cliente.id); }}
                    >
                      <Plus size={14} /> Avaliar
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[190px]">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openNewForClient(cliente.id); }}>
                        <Plus size={14} className="mr-2" /> Nova avaliação
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); abrirHistorico(cliente); }}>
                        <History size={14} className="mr-2" /> Histórico
                      </DropdownMenuItem>
                      {ultima && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingAvaliacao(ultima); setFormClienteId(undefined); setIsFormOpen(true); }}>
                            <Edit2 size={14} className="mr-2" /> Editar última
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeletingId(ultima.id); setDeletingName(cliente.nome); }}
                          >
                            <Trash2 size={14} className="mr-2" /> Remover última
                          </DropdownMenuItem>
                        </>
                      )}
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
          if (!open) { setEditingAvaliacao(null); setFormClienteId(undefined); }
        }}
      >
        {isFormOpen && (
          <NPSForm
            onClose={() => setIsFormOpen(false)}
            onSuccess={invalidate}
            initialData={editingAvaliacao}
            defaultClienteId={formClienteId}
          />
        )}
      </Dialog>

      {selectedCliente && NPSHistoryDrawer && (
        <NPSHistoryDrawer
          cliente={selectedCliente}
          onClose={() => setSelectedCliente(null)}
        />
      )}
      {selectedCliente && !NPSHistoryDrawer && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 inline-flex -translate-x-1/2 items-center rounded-full border bg-background px-4 py-2 text-sm text-muted-foreground shadow-lg">
          <Loader2 size={16} className="mr-2 animate-spin" /> Abrindo o histórico…
        </div>
      )}

      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja remover?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A última avaliação de {deletingName} será permanentemente deletada.
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
