import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { 
  Plus, 
  Filter, 
  Search, 
  Kanban as KanbanIcon, 
  List as ListIcon, 
  TrendingUp, 
  Target, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Calculator,
  ArrowRight,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  closestCenter,
  pointerWithin,
  CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Lead, ProspeccaoCard } from "@/components/prospeccao/ProspeccaoCard";
import { ProspeccaoColumn } from "@/components/prospeccao/ProspeccaoColumn";
import { ProspeccaoDrawer } from "@/components/prospeccao/ProspeccaoDrawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, maskBRLInput, parseBRLInput } from "@/lib/clientes";
import { useAgencias } from "@/lib/agencias";
import { CalendarRange } from "lucide-react";
import { useRef } from "react";
import { saveCliente } from "@/lib/clientesService";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ClientForm, ClientFormValues } from "@/components/ClientForm";
import { DemandaForm, DemandaFormValues } from "@/components/DemandaForm";
import { useDemandaColunas } from "@/lib/demandaColunas";

const COLUMNS = [
  { id: "lead", title: "Lead", color: "slate-500", hex: "#64748b" },
  { id: "contato_feito", title: "Contato feito", color: "blue-500", hex: "#3b82f6" },
  { id: "reuniao_agendada", title: "Reunião agendada", color: "violet-500", hex: "#8b5cf6" },
  { id: "proposta_enviada", title: "Proposta enviada", color: "amber-500", hex: "#f59e0b" },
  { id: "negociacao", title: "Negociação", color: "orange-500", hex: "#f97316" },
  { id: "fechado", title: "Fechado", color: "green-500", hex: "#22c55e" },
  { id: "perdido", title: "Perdido", color: "rose-400", hex: "#fb7185" },
];

export const Route = createFileRoute("/_authenticated/prospeccao")({
  component: ProspeccaoPage,
});

function ProspeccaoPage() {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAgencia, setFilterAgencia] = useState("all");
  const [filterPeriodo, setFilterPeriodo] = useState<string>("all");
  const [filterOrigem, setFilterOrigem] = useState("all");
  const [filterProbabilidade, setFilterProbabilidade] = useState([0, 100]);
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isDemandaModalOpen, setIsDemandaModalOpen] = useState(false);
  const [leadForDemanda, setLeadForDemanda] = useState<Lead | null>(null);
  const [isPerdaModalOpen, setIsPerdaModalOpen] = useState(false);
  const [leadForPerda, setLeadForPerda] = useState<{ id: string, name: string } | null>(null);
  const [motivoPerda, setMotivoPerda] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("prospeccao")
        .select("*")
        .order("ordem", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setLeads((data as any[]) || []);
    } catch (error: any) {
      toast.error("Erro ao buscar leads: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      const matchesSearch = l.nome.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (l.nicho && l.nicho.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesAgencia = filterAgencia === "all" || l.agencia_destino === filterAgencia;
      const matchesOrigem = filterOrigem === "all" || l.origem === filterOrigem;
      const matchesProb = (l.probabilidade || 0) >= filterProbabilidade[0] && (l.probabilidade || 0) <= filterProbabilidade[1];
      const matchesPeriodo = (() => {
        if (filterPeriodo === "all") return true;
        const ref = (l.data_lead || l.created_at || "").slice(0, 10);
        if (!ref) return false;
        if (filterPeriodo === "mes") {
          const now = new Date();
          const inicioMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
          return ref >= inicioMes;
        }
        const dias = Number(filterPeriodo);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - dias);
        return ref >= cutoff.toISOString().slice(0, 10);
      })();
      return matchesSearch && matchesAgencia && matchesOrigem && matchesProb && matchesPeriodo;
    });
  }, [leads, searchQuery, filterAgencia, filterOrigem, filterProbabilidade, filterPeriodo]);

  const metrics = useMemo(() => {
    const activePipeline = leads.filter(l => l.etapa !== 'perdido');
    const pipelineTotal = activePipeline.reduce((acc, curr) => acc + (curr.valor_estimado || 0), 0);
    const pipelinePonderado = activePipeline.reduce((acc, curr) => acc + ((curr.valor_estimado || 0) * (curr.probabilidade || 0) / 100), 0);
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const fechadoMes = leads.filter(l => l.etapa === 'fechado' && l.data_fechamento && l.data_fechamento >= startOfMonth)
                           .reduce((acc, curr) => acc + (curr.valor_estimado || 0), 0);

    const last90Days = new Date();
    last90Days.setDate(last90Days.getDate() - 90);
    const last90DaysStr = last90Days.toISOString();
    
    const relevantLeads = leads.filter(l => (l.etapa === 'fechado' || l.etapa === 'perdido') && l.created_at && l.created_at >= last90DaysStr);
    const fechadosCount = relevantLeads.filter(l => l.etapa === 'fechado').length;
    const totalCount = relevantLeads.length;
    const conversao = totalCount > 0 ? (fechadosCount / totalCount) * 100 : 0;

    return { pipelineTotal, pipelinePonderado, fechadoMes, conversao, activeLeadsCount: activePipeline.length };
  }, [leads]);

  // Detecção de colisão por coluna: primeiro descobre em qual coluna o ponteiro
  // está, depois escolhe o card mais próximo dentro dela. Se a coluna estiver
  // vazia, a própria coluna vira o alvo - assim é possível soltar em colunas sem cards.
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    const overColumn = pointerCollisions.find((c) => COLUMNS.some((col) => col.id === c.id));

    if (overColumn) {
      const columnId = String(overColumn.id);
      const cardsInColumn = args.droppableContainers.filter(
        (container) => container.data.current?.sortable?.containerId === columnId
      );
      if (cardsInColumn.length > 0) {
        const closest = closestCenter({ ...args, droppableContainers: cardsInColumn });
        if (closest.length > 0) return closest;
      }
      return [overColumn];
    }

    return closestCorners(args);
  };

  const onDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveLead(leads.find(l => l.id === active.id) || null);
  };

  // Reordenação otimista durante o arrasto (mesma lógica da aba Demandas)
  const dragOriginEtapa = useRef<string | null>(null);
  const byOrdem = (a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0);

  const isActiveBelowOver = (active: DragOverEvent["active"], over: NonNullable<DragOverEvent["over"]>) => {
    const activeRect = active.rect.current.translated;
    if (!activeRect) return false;
    return activeRect.top + activeRect.height / 2 > over.rect.top + over.rect.height / 2;
  };

  const computeMove = (list: Lead[], activeId: string, overId: string, overIsColumn: boolean, insertAfter: boolean): Lead[] | null => {
    const active = list.find((l) => l.id === activeId);
    if (!active) return null;
    const targetEtapa = overIsColumn ? overId : list.find((l) => l.id === overId)?.etapa;
    if (!targetEtapa) return null;

    const targetList = list.filter((l) => l.etapa === targetEtapa && l.id !== activeId).sort(byOrdem);
    let insertAt = targetList.length;
    if (!overIsColumn) {
      const overIdx = targetList.findIndex((l) => l.id === overId);
      if (overIdx >= 0) insertAt = insertAfter ? overIdx + 1 : overIdx;
    }

    const currentList = list.filter((l) => l.etapa === targetEtapa).sort(byOrdem);
    if (active.etapa === targetEtapa && currentList[insertAt]?.id === activeId) return null;

    targetList.splice(insertAt, 0, { ...active, etapa: targetEtapa });
    const nextOrdem = new Map(targetList.map((l, i) => [l.id, i]));
    return list.map((l) => (nextOrdem.has(l.id) ? { ...l, etapa: targetEtapa, ordem: nextOrdem.get(l.id) } : l));
  };

  const resolveOver = (over: NonNullable<DragOverEvent["over"]>) => {
    const overId = String(over.id);
    return { overId, overIsColumn: COLUMNS.some((c) => c.id === overId) };
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const activeLeadItem = leads.find((l) => l.id === activeId);
    if (!activeLeadItem) return;
    if (dragOriginEtapa.current === null) dragOriginEtapa.current = activeLeadItem.etapa;

    const { overId, overIsColumn } = resolveOver(over);
    const next = computeMove(leads, activeId, overId, overIsColumn, !overIsColumn && isActiveBelowOver(active, over));
    if (next) setLeads(next);
  };

  const persistLeadOrder = async (list: Lead[], etapas: string[]) => {
    const updates = list
      .filter((l) => etapas.includes(l.etapa))
      .map((l) => supabase.from("prospeccao").update({ ordem: l.ordem ?? 0 } as any).eq("id", l.id));
    await Promise.all(updates);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveLead(null);
    const origin = dragOriginEtapa.current;
    dragOriginEtapa.current = null;

    const activeId = String(active.id);
    const activeLeadItem = leads.find((l) => l.id === activeId);
    if (!activeLeadItem) return;

    let finalList = leads;
    if (over && over.id !== active.id) {
      const { overId, overIsColumn } = resolveOver(over);
      const next = computeMove(leads, activeId, overId, overIsColumn, !overIsColumn && isActiveBelowOver(active, over));
      if (next) {
        finalList = next;
        setLeads(next);
      }
    }

    const finalLead = finalList.find((l) => l.id === activeId);
    if (!finalLead) return;
    const overStatus = finalLead.etapa;
    const affected = Array.from(new Set([overStatus, origin].filter(Boolean))) as string[];

    // Ordem das colunas envolvidas é sempre persistida
    await persistLeadOrder(finalList, affected);

    if (overStatus === activeLeadItem.etapa && origin === overStatus) return;

    if (overStatus === 'fechado') {
      await handleMoveToFechado(activeLeadItem);
    } else if (overStatus === 'perdido') {
      setLeadForPerda({ id: activeLeadItem.id, name: activeLeadItem.nome });
      setIsPerdaModalOpen(true);
    } else {
      await syncMovement(activeLeadItem.id, overStatus as any);
    }
  };

  const syncMovement = async (id: string, etapa: string, extraValues: any = {}) => {
    try {
      const { error } = await supabase
        .from("prospeccao")
        .update({ 
            etapa: etapa as any, 
            ...extraValues, 
            updated_at: new Date().toISOString() 
        } as any)
        .eq("id", id);
      if (error) throw error;
      fetchLeads();
    } catch (error: any) {
      toast.error("Erro ao sincronizar movimento");
      fetchLeads();
    }
  };

  const handleMoveToFechado = async (lead: Lead) => {
    const today = new Date().toISOString().slice(0, 10);
    await syncMovement(lead.id, 'fechado', { data_fechamento: today });
    toast.success("Lead fechado! 🥳", {
      action: {
        label: "Cadastrar Cliente",
        onClick: () => handleOpenClientModal(lead)
      }
    });
  };

  const confirmPerda = async () => {
    if (!leadForPerda || !motivoPerda) return;
    const today = new Date().toISOString().slice(0, 10);
    await syncMovement(leadForPerda.id, 'perdido', { data_perda: today, motivo_perda: motivoPerda });
    setIsPerdaModalOpen(false);
    setLeadForPerda(null);
    setMotivoPerda("");
    toast.success("Lead movido para Perdido");
  };

  const handleQuickAdd = async (nome: string, etapa: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';

      const { error } = await supabase.from("prospeccao").insert([{
        nome, etapa: etapa as any, user_id: userId
      }] as any);
      if (error) throw error;
      fetchLeads();
    } catch (error: any) {
      toast.error("Erro ao criar lead: " + error.message);
    }
  };

  const handleUpdateLead = async (id: string, values: Partial<Lead>) => {
    try {
      const { error } = await supabase.from("prospeccao").update(values as any).eq("id", id);
      if (error) throw error;
      setLeads(prev => prev.map(l => l.id === id ? { ...l, ...values } : l));
      if (selectedLead?.id === id) setSelectedLead(prev => prev ? { ...prev, ...values } : null);
    } catch (error: any) {
      toast.error("Erro ao atualizar");
    }
  };

  const handleOpenClientModal = (lead: Lead) => {
    setSelectedLead(lead);
    setIsClientModalOpen(true);
  };

  const handleCreateClient = async (values: ClientFormValues) => {
    try {
      // Mesmo fluxo da aba Clientes: cria o cliente e o registro de saldo junto
      const newClientId = await saveCliente(values, null);

      if (selectedLead) {
        await supabase.from("prospeccao").update({ cliente_id: newClientId } as any).eq("id", selectedLead.id);
        fetchLeads();
      }

      toast.success("Cliente cadastrado e vinculado!");
      setIsClientModalOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao cadastrar cliente");
    }
  };

  const { colunas: demandaColunas } = useDemandaColunas();
  const { agencias } = useAgencias();

  const handleCreateDemanda = (lead: Lead) => {
    setLeadForDemanda(lead);
    setIsDemandaModalOpen(true);
  };

  const submitDemanda = async (values: DemandaFormValues) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';

      // Sanitize values
      const sanitizedValues: any = { ...values };
      if (sanitizedValues.cliente_id === "" || sanitizedValues.cliente_id === "none") {
        sanitizedValues.cliente_id = null;
      }
      if (sanitizedValues.prazo === "") {
        sanitizedValues.prazo = null;
      }
      if (sanitizedValues.frequencia_dia_mes === "") {
        sanitizedValues.frequencia_dia_mes = null;
      }
      if (sanitizedValues.frequencia_intervalo_dias === "" || isNaN(sanitizedValues.frequencia_intervalo_dias)) {
        sanitizedValues.frequencia_intervalo_dias = null;
      }

      const { error } = await supabase.from("demandas").insert([{
        ...sanitizedValues,
        user_id: userId,
        prospeccao_id: leadForDemanda?.id
      }]);
      if (error) throw error;
      toast.success("Demanda de follow-up criada!");
      setIsDemandaModalOpen(false);
    } catch (error: any) {
      toast.error("Erro ao criar demanda");
    }
  };

  const handleOpenDrawer = (lead: Lead) => {
    setSelectedLead(lead);
    setIsDrawerOpen(true);
  };

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Prospecção</h1>
          <p className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider">Pipeline de aquisição de clientes</p>
        </div>
        
        <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as any)} className="h-8">
            <TabsList className="h-8 p-0.5">
                <TabsTrigger value="kanban" className="gap-1.5 text-xs px-2 h-7">
                <KanbanIcon size={12} /> Board
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-1.5 text-xs px-2 h-7">
                <ListIcon size={12} /> Lista
                </TabsTrigger>
            </TabsList>
            </Tabs>
            <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => handleQuickAdd("Novo Lead", "lead")}>
                <Plus size={14} /> Novo lead
            </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-4 shrink-0">
        <Card className="bg-muted/20 border-none shadow-none">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
              <TrendingUp size={12} /> Pipeline Total
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-xl font-bold">{formatBRL(metrics.pipelineTotal)}</div>
            <p className="text-[10px] text-muted-foreground">{metrics.activeLeadsCount} leads ativos</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/20 border-none shadow-none">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
              <Calculator size={12} /> Pipeline Ponderado
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild><Info size={10} className="cursor-help"/></TooltipTrigger>
                  <TooltipContent><p className="text-[10px]">Considera a probabilidade de fechamento de cada lead</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-xl font-bold text-blue-600">{formatBRL(metrics.pipelinePonderado)}</div>
          </CardContent>
        </Card>
        <Card className="bg-muted/20 border-none shadow-none">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-emerald-500" /> Fechado este mês
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-xl font-bold text-emerald-600">{formatBRL(metrics.fechadoMes)}</div>
          </CardContent>
        </Card>
        <Card className="bg-muted/20 border-none shadow-none">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
              <Target size={12} /> Conversão Geral (90d)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-xl font-bold">{metrics.conversao.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Funnel Strip */}
      <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900/50 p-1.5 rounded-lg border overflow-x-auto no-scrollbar shrink-0">
        {COLUMNS.slice(0, 6).map((col, idx) => (
          <div key={col.id} className="flex items-center gap-1 shrink-0">
            <div className={cn(
              "px-3 py-1 rounded-md flex items-center gap-2",
              `bg-${col.color}/10 border border-${col.color}/20`
            )} style={{ borderColor: `${col.hex}33`, backgroundColor: `${col.hex}15` }}>
              <span className="text-[10px] font-bold uppercase tracking-tight" style={{ color: col.hex }}>{col.title}</span>
              <span className="text-[10px] font-bold bg-zinc-200 dark:bg-zinc-800 px-1.5 rounded-full">{leads.filter(l => l.etapa === col.id).length}</span>
            </div>
            {idx < 5 && <ChevronRight size={14} className="text-zinc-400 mx-0.5" />}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input 
            placeholder="Buscar lead ou nicho..." 
            className="pl-9 h-9 text-xs" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterAgencia} onValueChange={setFilterAgencia}>
          <SelectTrigger className="w-[140px] h-9 text-xs">
            <SelectValue placeholder="Agência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Agência</SelectItem>
            {agencias.map(a => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
          <SelectTrigger className="w-[150px] h-9 text-xs">
            <CalendarRange className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo o período</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="mes">Este mês</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Kanban / List Board */}
      <div className="flex-1 min-h-0 overflow-hidden mt-2">
        {view === "kanban" ? (
          <div className="h-full overflow-x-auto pb-4 custom-scrollbar">
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
            >
              <div className="flex gap-4 h-full min-w-max pb-4">
                {COLUMNS.map((col) => (
                  <ProspeccaoColumn
                    key={col.id}
                    id={col.id}
                    title={col.title}
                    color={col.color}
                    hex={col.hex}
                    leads={filteredLeads.filter((l) => l.etapa === col.id).sort(byOrdem)}
                    onEdit={handleOpenDrawer}
                    onDelete={async (id) => {
                      if (confirm("Remover este lead?")) {
                        await supabase.from("prospeccao").delete().eq("id", id);
                        fetchLeads();
                      }
                    }}
                    onDuplicate={async (lead) => {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) return;
                      const { id, created_at, updated_at, ...rest } = lead as any;
                      await supabase.from("prospeccao").insert([{ ...rest, user_id: user.id, nome: `${lead.nome} (Cópia)` }]);
                      fetchLeads();
                    }}
                    onQuickAdd={handleQuickAdd}
                  />
                ))}
              </div>

              <DragOverlay dropAnimation={{
                  duration: 150,
                  sideEffects: defaultDropAnimationSideEffects({
                    styles: { active: { opacity: "0.5" } },
                  }),
                }}>
                {activeLead ? (
                  <ProspeccaoCard lead={activeLead} onEdit={() => {}} onDelete={() => {}} onDuplicate={() => {}} />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        ) : (
          <div className="h-full border rounded-lg bg-card overflow-y-auto">
              <div className="divide-y">
                {filteredLeads.map(l => (
                  <div key={l.id} className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer" onClick={() => handleOpenDrawer(l)}>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLUMNS.find(c => c.id === l.etapa)?.hex }} />
                      <div>
                        <h4 className="font-medium text-sm">{l.nome}</h4>
                        <p className="text-[11px] text-muted-foreground">
                          {l.nicho || 'Sem nicho'} • {formatBRL(l.valor_estimado)} • {COLUMNS.find(c => c.id === l.etapa)?.title}
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                ))}
                {filteredLeads.length === 0 && (
                  <div className="p-20 text-center text-muted-foreground">Nenhum lead encontrado.</div>
                )}
              </div>
          </div>
        )}
      </div>

      <ProspeccaoDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        lead={selectedLead}
        onUpdate={handleUpdateLead}
        onDelete={async (id) => {
          if (confirm("Deletar lead permanentemente?")) {
            await supabase.from("prospeccao").delete().eq("id", id);
            fetchLeads();
            setIsDrawerOpen(false);
          }
        }}
        onDuplicate={async (lead) => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const { id, created_at, updated_at, ...rest } = lead as any;
          await supabase.from("prospeccao").insert([{ ...rest, user_id: user.id, nome: `${lead.nome} (Cópia)` }]);
          fetchLeads();
        }}
        onCreateDemanda={handleCreateDemanda}
        onConvert={handleOpenClientModal}
      />

      {/* Modal Perda */}
      <Dialog open={isPerdaModalOpen} onOpenChange={setIsPerdaModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Mover para Perdido</DialogTitle>
            <DialogDescription>Por que não fechamos com <strong>{leadForPerda?.name}</strong>?</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input 
              placeholder="Ex: Preço alto, Sem tempo..." 
              value={motivoPerda} 
              onChange={e => setMotivoPerda(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsPerdaModalOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmPerda} disabled={!motivoPerda}>Confirmar Perda</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Cliente (para conversão) */}
      <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Converter Lead em Cliente</DialogTitle>
          </DialogHeader>
          <ClientForm 
            initialValues={{
              nome: selectedLead?.nome,
              nicho: selectedLead?.nicho,
              agencia: selectedLead?.agencia_destino as any,
              verba_ads: selectedLead?.valor_estimado || 0,
              data_inicio: new Date().toISOString().slice(0, 10),
            }}
            onSubmit={handleCreateClient}
            loading={loading}
          />
        </DialogContent>
      </Dialog>

      {/* Modal Demanda (para follow-up) */}
      <Dialog open={isDemandaModalOpen} onOpenChange={setIsDemandaModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Agendar Demanda de Follow-up</DialogTitle>
          </DialogHeader>
          <DemandaForm
            clientes={[]} // No drawer we won't select client, it's linked to lead
            columns={demandaColunas}
            initialValues={{
              titulo: `Follow-up: ${leadForDemanda?.nome}`,
              status: 'fazer_amanha',
              prioridade: 'alta'
            }}
            onSubmit={submitDemanda}
            loading={loading}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
