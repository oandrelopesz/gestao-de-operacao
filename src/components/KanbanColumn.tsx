import React, { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard } from "./KanbanCard";
import { Button } from "@/components/ui/button";
import { Plus, Maximize2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Demanda {
  id: string;
  titulo: string;
  descricao?: string;
  status: string;
  prioridade: "baixa" | "media" | "alta" | "urgente";
  prazo?: string;
  cliente_id: string;
  clientes?: { nome: string };
}

interface KanbanColumnProps {
  id: string;
  title: string;
  demandas: Demanda[];
  onQuickAdd: (status: string, title: string) => Promise<void>;
  onFullAdd: (status: string) => void;
  onEdit: (demanda: Demanda) => void;
  onDelete: (id: string, name: string) => void;
}

export function KanbanColumn({
  id,
  title,
  demandas,
  onQuickAdd,
  onFullAdd,
  onEdit,
  onDelete,
}: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id });
  const [isAdding, setIsAdding] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const handleQuickAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!quickTitle.trim()) return;
    
    setLoading(true);
    try {
      await onQuickAdd(id, quickTitle);
      setQuickTitle("");
      setIsAdding(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      "flex flex-col w-[280px] shrink-0 rounded-lg p-2 max-h-full",
      id === "recorrentes" ? "bg-primary/5 border-l-2 border-primary" : "bg-muted/30"
    )}>
      <div className="flex items-center justify-between px-2 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{title}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
            {demandas.length}
          </span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-[150px] px-1"
      >
        <SortableContext
          items={demandas.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          {demandas.map((demanda) => (
            <KanbanCard
              key={demanda.id}
              demanda={demanda}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          {demandas.length === 0 && !isAdding && (
            <div className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-xs text-muted-foreground bg-muted/10 italic">
              Nenhuma tarefa por aqui
            </div>
          )}
        </SortableContext>

        {isAdding && (
          <div className="bg-card border rounded-md p-2 mb-3 shadow-sm animate-in fade-in zoom-in duration-200">
            <form onSubmit={handleQuickAdd} className="space-y-2">
              <Input
                autoFocus
                placeholder="Título da tarefa..."
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setIsAdding(false);
                }}
                className="text-sm h-8"
                disabled={loading}
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" type="submit" disabled={loading}>
                    <Check size={14} className="text-emerald-500" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-6 w-6" 
                    onClick={() => setIsAdding(false)}
                    type="button"
                  >
                    <Plus className="rotate-45" size={14} />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground"
                  onClick={() => {
                    onFullAdd(id);
                    setIsAdding(false);
                  }}
                  type="button"
                >
                  <Maximize2 size={10} />
                  Expandir
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        className="mt-2 w-full justify-start text-muted-foreground hover:text-foreground h-9 font-normal text-xs gap-2"
        onClick={() => setIsAdding(true)}
      >
        <Plus size={14} />
        Adicionar tarefa
      </Button>
    </div>
  );
}
