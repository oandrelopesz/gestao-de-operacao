import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Filter, List, Kanban as KanbanIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/")({
  component: DemandasPage,
});

function DemandasPage() {
  const [view, setView] = useState<"kanban" | "list">("kanban");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Demandas</h1>
          <p className="text-muted-foreground">Gerencie suas tarefas e prazos por cliente.</p>
        </div>
        <Button className="gap-2">
          <Plus size={16} />
          Nova demanda
        </Button>
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
        <Button variant="outline" className="gap-2">
          <Plus size={16} />
          Criar Demanda
        </Button>
      </div>
    </div>
  );
}
