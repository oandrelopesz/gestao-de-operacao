import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Filter, List, Kanban as KanbanIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { DemandaForm, DemandaFormValues } from "@/components/DemandaForm";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/")({
  component: DemandasPage,
});

function DemandasPage() {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    fetchClientes();
  }, []);

  const fetchClientes = async () => {
    const { data, error } = await supabase.from("clientes").select("id, nome").order("nome");
    if (error) {
      console.error("Erro ao buscar clientes:", error);
    } else {
      setClientes(data || []);
    }
  };

  const handleCreateDemanda = async (values: DemandaFormValues) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase.from("demandas").insert([{
        ...values,
        user_id: user.id
      }]);

      if (error) throw error;

      toast.success("Demanda criada com sucesso!");
      setIsModalOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar demanda");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Demandas</h1>
          <p className="text-muted-foreground">Gerencie suas tarefas e prazos por cliente.</p>
        </div>
        
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus size={16} />
              Nova demanda
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Nova Demanda</DialogTitle>
              <DialogDescription>
                Crie uma nova tarefa vinculada a um cliente.
              </DialogDescription>
            </DialogHeader>
            <DemandaForm 
              clientes={clientes} 
              onSubmit={handleCreateDemanda} 
              loading={loading} 
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar por cliente ou título..."
              className="pl-9"
            />
          </div>
        </div>
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
      </div>

      {/* Empty State Placeholder */}
      <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/30">
        <div className="p-4 rounded-full bg-muted mb-4">
          <List size={32} className="text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">Nenhuma demanda encontrada</h3>
        <p className="text-muted-foreground mb-6">Comece criando sua primeira demanda para um cliente.</p>
        <Button variant="outline" className="gap-2" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} />
          Criar Demanda
        </Button>
      </div>
    </div>
  );
}

