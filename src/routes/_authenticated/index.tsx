import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Filter, List, Kanban as KanbanIcon, Search, Building2, MoreVertical, Pencil, Trash2, Repeat, Calendar as CalendarIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { DemandaForm, DemandaFormValues } from "@/components/DemandaForm";
import { KanbanColumn } from "@/components/KanbanColumn";
import { DemandaDrawer } from "@/components/demandas/DemandaDrawer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AGENCIAS, AgenciaId } from "@/lib/clientes";
import {
  DndContext,
  DragOverlay,
  closestCorners,
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
import { KanbanCard } from "@/components/KanbanCard";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { id: "recorrentes", title: "Recorrentes", color: "slate-500", hex: "#64748b" },
  { id: "fazer_hoje", title: "Fazer hoje", color: "red-500", hex: "#ef4444" },
  { id: "fazer_amanha", title: "Fazer amanhã", color: "yellow-500", hex: "#eab308" },
  { id: "fazer_depois_amanha", title: "Fazer depois de amanhã", color: "orange-500", hex: "#f97316" },
  { id: "standby", title: "Standby", color: "blue-500", hex: "#3b82f6" },
  { id: "feito", title: "Feito", color: "green-500", hex: "#22c55e" },
];

export const Route = createFileRoute("/_authenticated/")({
  component: DemandasPage,
});

function DemandasPage() {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState<{ id: string; nome: string; agencia: AgenciaId }[]>([]);
  const [demandas, setDemandas] = useState<any[]>([]);
  const [activeDemanda, setActiveDemanda] = useState<any | null>(null);
  const [editingDemanda, setEditingDemanda] = useState<any | null>(null);
  const [filterCliente, setFilterCliente] = useState<string>("all");
  const [filterAgencia, setFilterAgencia] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string>("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedDemanda, setSelectedDemanda] = useState<any | null>(null);
  const [showCalendar, setShowCalendar] = useState(() => {
    const saved = localStorage.getItem("demandas_calendar_visible");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [calendarMode, setCalendarMode] = useState<"7days" | "30days">("7days");
  const [popoverConfig, setPopoverConfig] = useState<{ id: string; x: number; y: number } | null>(null);

  const toggleCalendar = () => {
    setShowCalendar((prev: boolean) => {
      localStorage.setItem("demandas_calendar_visible", JSON.stringify(!prev));
      return !prev;
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchClientes();
    fetchDemandas();
    catchUpRecorrentes();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "n" && !isModalOpen && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        openNewDemanda("fazer_hoje");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchClientes = async () => {
    const { data, error } = await supabase.from("clientes").select("id, nome, agencia").order("nome");
    if (error) console.error("Erro ao buscar clientes:", error);
    else setClientes((data as any) || []);
  };

  const catchUpRecorrentes = async () => {
    try {
      await supabase.functions.invoke('materializar-recorrentes');
      fetchDemandas();
    } catch (err) {
      console.error("Erro no catch-up de recorrentes:", err);
    }
  };

  const fetchDemandas = async () => {
    const { data, error } = await supabase
      .from("demandas")
      .select("*, clientes(nome, agencia)")
      .order("ordem", { ascending: true })
      .order("created_at", { ascending: false });
    
    if (error) console.error("Erro ao buscar demandas:", error);
    else setDemandas(data || []);
  };

  const openNewDemanda = (status?: string) => {
    setEditingDemanda({ status: status || "fazer_hoje" });
    setIsModalOpen(true);
  };

  const handleCreateOrUpdateDemanda = async (values: DemandaFormValues) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (editingDemanda?.id) {
        // Update
        const { error } = await supabase
          .from("demandas")
          .update({ ...values })
          .eq("id", editingDemanda.id);
        if (error) throw error;
        toast.success("Demanda atualizada!");
      } else {
        // Create
        // Get max order for this column
        const columnDemandas = demandas.filter(d => d.status === values.status);
        const maxOrder = columnDemandas.length > 0 ? Math.max(...columnDemandas.map(d => d.ordem || 0)) : -1;
        
        const { error } = await supabase.from("demandas").insert([{
          ...values,
          user_id: user.id,
          ordem: maxOrder + 1
        }]);
        if (error) throw error;
        toast.success("Demanda criada!");
      }

      setIsModalOpen(false);
      setEditingDemanda(null);
      fetchDemandas();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar demanda");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDemanda = async (id: string, values: any) => {
    try {
      const { error } = await supabase
        .from("demandas")
        .update(values)
        .eq("id", id);
      if (error) throw error;
      
      // Update local state for immediate feedback
      setDemandas((prev: any[]) => prev.map(d => d.id === id ? { ...d, ...values } : d));
      if (selectedDemanda?.id === id) {
        setSelectedDemanda((prev: any) => ({ ...prev, ...values }));
      }
      
      // Silently sync
      fetchDemandas();
    } catch (error: any) {
      toast.error("Erro ao salvar alterações");
    }
  };

  const handleDuplicateDemanda = async (demanda: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { id, created_at, updated_at, clientes, ...rest } = demanda;
      
      const { error } = await supabase.from("demandas").insert([{
        ...rest,
        titulo: `${rest.titulo} (Cópia)`,
        user_id: user.id,
      }]);

      if (error) throw error;
      toast.success("Demanda duplicada!");
      fetchDemandas();
    } catch (error: any) {
      toast.error("Erro ao duplicar demanda");
    }
  };

  const handleOpenDrawer = (demanda: any) => {
    setSelectedDemanda(demanda);
    setIsDrawerOpen(true);
  };

  const handleQuickAdd = async (status: string, titulo: string, event?: React.MouseEvent | React.TouchEvent) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const columnDemandas = demandas.filter(d => d.status === status);
      const maxOrder = columnDemandas.length > 0 ? Math.max(...columnDemandas.map(d => d.ordem || 0)) : -1;

      const isRecorrente = status === "recorrentes";

      const { data, error } = await supabase.from("demandas").insert([{
        titulo,
        status: status as any,
        user_id: user.id,
        cliente_id: null,
        prioridade: "media" as const,
        ordem: maxOrder + 1,
        recorrente: isRecorrente
      }]).select().single();

      if (error) throw error;
      
      // Optimistic update
      setDemandas(prev => [...prev, data]);
      
      if (isRecorrente && event) {
        setPopoverConfig({
          id: data.id,
          x: (event as any).clientX || 200,
          y: (event as any).clientY || 200
        });
      }

      // Silently fetch to sync relationships
      fetchDemandas();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar demanda");
    }
  };

  const handleDeleteDemanda = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from("demandas").delete().eq("id", deletingId);
      if (error) throw error;
      toast.success("Demanda deletada!");
      fetchDemandas();
    } catch (error: any) {
      toast.error(error.message || "Erro ao deletar");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCompleteExecution = async (id: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Registrar no histórico
      const { error: execError } = await supabase
        .from("demanda_execucoes")
        .insert([{ demanda_id: id, data_execucao: today }]);
      
      if (execError) throw execError;

      const demanda = demandas.find(d => d.id === id);
      if (demanda?.recorrente) {
        // Recalcular próxima execução
        const { data: proximaData } = await supabase.rpc('calcular_proxima_execucao', {
            p_tipo: demanda.frequencia_tipo,
            p_dias_semana: demanda.frequencia_dias_semana,
            p_dia_mes: demanda.frequencia_dia_mes,
            p_intervalo_dias: demanda.frequencia_intervalo_dias,
            p_ultima_execucao: today,
            p_data_referencia: today
        });

        const { error: updateError } = await supabase
            .from("demandas")
            .update({ 
                ultima_execucao: today,
                proxima_execucao: proximaData
            })
            .eq("id", id);
        
        if (updateError) throw updateError;
      } else {
        const { error } = await supabase
            .from("demandas")
            .update({ ultima_execucao: today })
            .eq("id", id);
        if (error) throw error;
      }

      toast.success("Execução registrada!");
      fetchDemandas();
    } catch (error: any) {
      toast.error("Erro ao registrar execução");
    }
  };

  const filteredDemandas = useMemo(() => {
    return demandas.filter(d => {
      const matchesCliente = filterCliente === "all" || d.cliente_id === filterCliente;
      const matchesAgencia = filterAgencia === "all" || d.clientes?.agencia === filterAgencia;
      const matchesSearch = d.titulo.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (d.clientes?.nome && d.clientes.nome.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCliente && matchesAgencia && matchesSearch;
    });
  }, [demandas, filterCliente, filterAgencia, searchQuery]);

  // Drag and Drop Logic
  const onDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const demanda = demandas.find((d) => d.id === active.id);
    setActiveDemanda(demanda);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveTask = active.data.current?.type !== "Column";
    const isOverTask = over.data.current?.type !== "Column";

    if (!isActiveTask) return;

    const activeTask = demandas.find(d => d.id === activeId);
    if (!activeTask) return;

    let overStatus = overId as string;
    if (isOverTask) {
      const overTask = demandas.find(d => d.id === overId);
      if (overTask) overStatus = overTask.status;
    }

    if (activeTask.status !== overStatus) {
      setDemandas((prev) => {
        const activeIndex = prev.findIndex((d) => d.id === activeId);
        const overIndex = isOverTask 
          ? prev.findIndex((d) => d.id === overId)
          : prev.length;

        const updated = [...prev];
        updated[activeIndex] = { 
          ...updated[activeIndex], 
          status: overStatus,
          recorrente: overStatus === "recorrentes" ? true : updated[activeIndex].recorrente
        };
        
        return arrayMove(updated, activeIndex, overIndex);
      });
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDemanda(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    const activeTask = demandas.find(d => d.id === activeId);
    if (!activeTask) return;

    let overStatus = overId as string;
    const overTask = demandas.find(d => d.id === overId);
    if (overTask) overStatus = overTask.status;
    else if (!COLUMNS.some(c => c.id === overId)) {
        return;
    }

    const overColumnDemandas = demandas.filter(d => d.status === overStatus);
    const newOrder = overColumnDemandas.length;

    if (activeTask.status === "recorrentes" && overStatus !== "recorrentes") {
      toast.error("Tarefas recorrentes vivem na coluna Recorrentes. Mova a instância gerada hoje em Fazer hoje.");
      return;
    }

    if (activeTask.recorrente && overStatus !== "recorrentes" && activeTask.status === "recorrentes") {
      return;
    }

    try {
      const { error } = await supabase
        .from("demandas")
        .update({ 
          status: overStatus as any,
          ordem: newOrder,
          recorrente: overStatus === "recorrentes" ? true : (activeTask.recorrente && overStatus !== "recorrentes" ? false : activeTask.recorrente)
        })
        .eq("id", String(activeId));
      
      if (error) throw error;
      fetchDemandas();
    } catch (error: any) {
      toast.error("Erro ao sincronizar movimento");
      fetchDemandas();
    }
  };

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Demandas</h1>
        </div>
        
        <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as any)} className="h-8">
            <TabsList className="h-8 p-0.5">
                <TabsTrigger value="kanban" className="gap-1.5 text-xs px-2 h-7">
                <KanbanIcon size={12} />
                Board
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-1.5 text-xs px-2 h-7">
                <List size={12} />
                Lista
                </TabsTrigger>
            </TabsList>
            </Tabs>
            <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => openNewDemanda()}>
                <Plus size={14} />
                Nova
            </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative w-full max-w-[200px]">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            className="pl-7 h-8 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterAgencia} onValueChange={setFilterAgencia}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
                <div className="flex items-center gap-1.5 truncate">
                  <Building2 className="w-3.5 h-3.5" />
                  <SelectValue placeholder="Agência" />
                </div>
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all" className="text-xs">Todas as agências</SelectItem>
                {AGENCIAS.map(a => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">{a.label}</SelectItem>
                ))}
            </SelectContent>
        </Select>

        <Select value={filterCliente} onValueChange={setFilterCliente}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
                <div className="flex items-center gap-1.5 truncate">
                  <Filter className="w-3.5 h-3.5" />
                  <SelectValue placeholder="Cliente" />
                </div>
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all" className="text-xs">Todos os clientes</SelectItem>
                {clientes
                  .filter(c => filterAgencia === "all" || c.agencia === filterAgencia)
                  .map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.nome}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {view === "kanban" ? (
          <div className="h-full overflow-x-auto pb-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
            >
              <div className="flex gap-4 h-full min-w-max pb-4">
                {COLUMNS.map((col) => (
                  <KanbanColumn
                    key={col.id}
                    id={col.id}
                    title={col.title}
                    color={col.color}
                    hex={col.hex}
                    demandas={filteredDemandas.filter((d) => d.status === col.id)}
                    onQuickAdd={handleQuickAdd}
                    onFullAdd={(status) => {
                      setEditingDemanda({ status });
                      setIsModalOpen(true);
                    }}
                    onEdit={handleOpenDrawer}
                    onDelete={(id, name) => {
                      setDeletingId(id);
                      setDeletingName(name);
                    }}
                    onComplete={handleCompleteExecution}
                    onMoveToDone={async (id) => {
                      try {
                        const { error } = await supabase
                          .from("demandas")
                          .update({ status: "feito" as any })
                          .eq("id", id);
                        if (error) throw error;
                        fetchDemandas();
                      } catch (err) {
                        toast.error("Erro ao mover para concluído");
                      }
                    }}
                  />
                ))}
              </div>

              <DragOverlay dropAnimation={{
                  sideEffects: defaultDropAnimationSideEffects({
                    styles: {
                      active: {
                        opacity: "0.5",
                      },
                    },
                  }),
                }}>
                {activeDemanda ? (
                  <KanbanCard
                    demanda={activeDemanda}
                    onEdit={() => {}}
                    onDelete={() => {}}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        ) : (
          <div className="overflow-y-auto h-full border rounded-lg bg-card">
              {/* List view placeholder */}
              {filteredDemandas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground">
                      <List size={40} className="mb-4 opacity-20" />
                      <p>Nenhuma demanda encontrada.</p>
                  </div>
              ) : (
                <div className="divide-y">
                    {filteredDemandas.map(d => (
                        <div key={d.id} className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer" onClick={() => handleOpenDrawer(d)}>
                            <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${d.status === 'feito' ? 'bg-emerald-500' : 'bg-primary'}`} />
                                <div>
                                    <h4 className={`font-medium ${d.status === 'feito' ? 'line-through text-muted-foreground' : ''}`}>
                                        {d.titulo}
                                    </h4>
                                    <p className="text-xs text-muted-foreground">
                                        {d.clientes?.nome} — {AGENCIAS.find(a => a.id === d.clientes?.agencia)?.label} • {COLUMNS.find(c => c.id === d.status)?.title}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDrawer(d);
                                }}>
                                    <Plus className="rotate-45" size={16} />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
              )}
          </div>
        )}
      </div>

      <DemandaDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        demanda={selectedDemanda}
        onUpdate={handleUpdateDemanda}
        onDelete={async (id) => {
          try {
            const { error } = await supabase.from("demandas").delete().eq("id", id);
            if (error) throw error;
            toast.success("Demanda deletada!");
            setIsDrawerOpen(false);
            fetchDemandas();
          } catch (err) {
            toast.error("Erro ao deletar");
          }
        }}
        onDuplicate={handleDuplicateDemanda}
        clientes={clientes}
        columns={COLUMNS}
      />

      <Dialog open={isModalOpen} onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) setEditingDemanda(null);
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingDemanda?.id ? "Editar Demanda" : "Nova Demanda"}</DialogTitle>
            <DialogDescription>
              Preencha os detalhes da tarefa abaixo.
            </DialogDescription>
          </DialogHeader>
          <DemandaForm 
            clientes={clientes} 
            onSubmit={handleCreateOrUpdateDemanda} 
            loading={loading}
            initialValues={editingDemanda}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja remover?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A demanda "{deletingName}" será permanentemente deletada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteDemanda} 
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


