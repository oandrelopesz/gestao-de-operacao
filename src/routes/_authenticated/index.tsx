import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Filter, List, Kanban as KanbanIcon, Search, Building2, MoreVertical, Pencil, Trash2 } from "lucide-react";
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
  { id: "fazer_hoje", title: "Fazer hoje" },
  { id: "fazer_amanha", title: "Fazer amanhã" },
  { id: "fazer_depois_amanha", title: "Fazer depois de amanhã" },
  { id: "standby", title: "Standby" },
  { id: "feito", title: "Feito" },
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

  const fetchDemandas = async () => {
    const { data, error } = await supabase
      .from("demandas")
      .select("*, clientes(nome, agencia)")
      .order("ordem", { ascending: true });
    
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

  const handleQuickAdd = async (status: string, titulo: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // We need at least one client for the quick add because of the form schema, 
      // but in a real app we might make client_id optional or have a default.
      // For now, let's use the first client if available.
      if (clientes.length === 0) {
        toast.error("Cadastre um cliente primeiro para usar o adicionar rápido.");
        return;
      }

      const columnDemandas = demandas.filter(d => d.status === status);
      const maxOrder = columnDemandas.length > 0 ? Math.max(...columnDemandas.map(d => d.ordem || 0)) : -1;

      const { error } = await supabase.from("demandas").insert([{
        titulo,
        status: status as any,
        user_id: user.id,
        cliente_id: clientes[0].id,
        prioridade: "media" as const,
        ordem: maxOrder + 1
      }]);

      if (error) throw error;
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

    // Implemented logic to handle dropping over a column or another task
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
        updated[activeIndex] = { ...updated[activeIndex], status: overStatus };
        
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

    if (activeId === overId) {
      // Potentially no change, but we should sync order if moved within same column
      // fetchDemandas() will fix it if something went wrong
    }

    // Sync with database
    // Simplified sync: update status and order for all relevant items
    // In a production app, we would only update changed items
    const activeTask = demandas.find(d => d.id === activeId);
    if (!activeTask) return;

    let overStatus = overId as string;
    const overTask = demandas.find(d => d.id === overId);
    if (overTask) overStatus = overTask.status;
    else if (!COLUMNS.some(c => c.id === overId)) {
        // If not a column ID and not a task, something is wrong
        return;
    }

    try {
      // Re-order locally first for responsiveness
      const oldIndex = demandas.findIndex(d => d.id === activeId);
      const newIndex = demandas.findIndex(d => d.id === overId);
      
      const newDemandas = arrayMove([...demandas], oldIndex, newIndex === -1 ? oldIndex : newIndex);
      
      // Update the moved task
      const { error } = await supabase
        .from("demandas")
        .update({ 
          status: overStatus as any,
        })
        .eq("id", String(activeId));
      
      if (error) throw error;
      
      // Better way: Update status and then refresh to get correct orders from DB
      fetchDemandas();
    } catch (error: any) {
      toast.error("Erro ao sincronizar movimento");
      fetchDemandas();
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Demandas</h1>
          <p className="text-muted-foreground">Arraste e solte para organizar suas prioridades.</p>
        </div>
        
        <div className="flex items-center gap-3">
            <Tabs value={view} onValueChange={(v) => setView(v as any)}>
            <TabsList>
                <TabsTrigger value="kanban" className="gap-2">
                <KanbanIcon size={14} />
                Kanban
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-2">
                <List size={14} />
                Lista
                </TabsTrigger>
            </TabsList>
            </Tabs>
            <Button className="gap-2" onClick={() => openNewDemanda()}>
                <Plus size={16} />
                Nova demanda
            </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 shrink-0">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título ou cliente..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterAgencia} onValueChange={setFilterAgencia}>
            <SelectTrigger className="w-[180px]">
                <Building2 className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filtrar por agência" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Todas as agências</SelectItem>
                {AGENCIAS.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                ))}
            </SelectContent>
        </Select>

        <Select value={filterCliente} onValueChange={setFilterCliente}>
            <SelectTrigger className="w-[200px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filtrar por cliente" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clientes
                  .filter(c => filterAgencia === "all" || c.agencia === filterAgencia)
                  .map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} — {AGENCIAS.find(a => a.id === c.agencia)?.label}
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
                    demandas={filteredDemandas.filter((d) => d.status === col.id)}
                    onQuickAdd={handleQuickAdd}
                    onFullAdd={(status) => {
                      setEditingDemanda({ status });
                      setIsModalOpen(true);
                    }}
                    onEdit={(demanda) => {
                      setEditingDemanda(demanda);
                      setIsModalOpen(true);
                    }}
                    onDelete={(id, name) => {
                      setDeletingId(id);
                      setDeletingName(name);
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
                        <div key={d.id} className="p-4 flex items-center justify-between hover:bg-muted/50">
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
                                <Button variant="ghost" size="icon" onClick={() => {
                                    setEditingDemanda(d);
                                    setIsModalOpen(true);
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


