import React, { useState, useRef, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard } from "./KanbanCard";
import { Button } from "@/components/ui/button";
import { Plus, MoreVertical, Pencil, Eraser, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Demanda {
  id: string;
  titulo: string;
  descricao?: string;
  status: string;
  prioridade: string;
  prazo?: string;
  cliente_id: string | null;
  recorrente?: boolean;
  frequencia_tipo?: string;
  frequencia_dias_semana?: string[];
  frequencia_dia_mes?: number;
  frequencia_intervalo_dias?: number;
  ultima_execucao?: string;
  proxima_execucao?: string;
  recorrente_pai_id?: string;
  clientes?: { nome: string; agencia?: string };
}

interface KanbanColumnProps {
  id: string;
  title: string;
  color: string;
  hex: string;
  demandas: Demanda[];
  onQuickAdd: (status: string, title: string, event?: any) => Promise<void>;
  onFullAdd: (status: string) => void;
  onEdit: (demanda: Demanda) => void;
  onDelete: (id: string, name: string) => void;
  onComplete?: (id: string) => void;
  onMoveToDone?: (id: string) => void;
  onRenameColumn?: () => void;
  onClearColumn?: () => void;
  onDeleteColumn?: () => void;
  /** Colunas de sistema (recorrentes, feito) podem ser renomeadas, mas não excluídas */
  isSystem?: boolean;
}

const emptyMessages: Record<string, string> = {
  recorrentes: "Sem tarefas recorrentes",
  fazer_hoje: "Nada pra hoje",
  fazer_amanha: "Vazio",
  fazer_depois_amanha: "Vazio",
  standby: "Sem pendências",
  feito: "Nenhuma tarefa concluída",
};

export function KanbanColumn({
  id,
  title,
  color,
  hex,
  demandas,
  onQuickAdd,
  onFullAdd,
  onEdit,
  onDelete,
  onComplete,
  onMoveToDone,
  onRenameColumn,
  onClearColumn,
  onDeleteColumn,
  isSystem,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [isAdding, setIsAdding] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleQuickAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!quickTitle.trim()) {
      setIsAdding(false);
      return;
    }
    
    setLoading(true);
    try {
      await onQuickAdd(id, quickTitle);
      setQuickTitle("");
      // Keep adding mode active for next task
      if (inputRef.current) inputRef.current.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsAdding(false);
      setQuickTitle("");
    }
  };

  return (
    <div className={cn(
      "flex flex-col w-[280px] shrink-0 rounded-xl p-0 h-full transition-colors border border-border/60",
      "bg-muted/40",
      isOver && "bg-accent/50 border-primary/30"
    )}>
      {/* Top indicator line */}
      <div 
        className="h-[3px] w-full rounded-t-xl mb-0" 
        style={{ backgroundColor: hex }}
      />
      
      <div className="flex items-center justify-between px-3 pt-3 mb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-xs tracking-tight uppercase" style={{ color: hex }}>{title}</h3>
          <span className="text-[10px] text-muted-foreground font-medium px-1.5 py-0.5 rounded-full bg-zinc-200/50 dark:bg-zinc-800/50">
            {demandas.length}
          </span>
        </div>
        {(onRenameColumn || onClearColumn || onDeleteColumn) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mr-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                title="Configurações da coluna"
              >
                <MoreVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[190px] text-xs">
              {onRenameColumn && (
                <DropdownMenuItem onClick={onRenameColumn} className="gap-2 py-1.5">
                  <Pencil size={12} /> Editar nome
                </DropdownMenuItem>
              )}
              {onClearColumn && (
                <DropdownMenuItem
                  onClick={onClearColumn}
                  disabled={demandas.length === 0}
                  className="gap-2 py-1.5"
                >
                  <Eraser size={12} /> Zerar demandas
                </DropdownMenuItem>
              )}
              {onDeleteColumn && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDeleteColumn}
                    disabled={isSystem}
                    title={isSystem ? "Coluna fixa do sistema" : undefined}
                    className="gap-2 py-1.5 text-destructive focus:text-destructive"
                  >
                    <Trash2 size={12} /> Excluir coluna
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-[150px] px-2 py-1 scrollbar-hide"
      >
        <SortableContext
          id={id}
          items={demandas.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          {demandas.map((demanda) => (
            <KanbanCard
              key={demanda.id}
              demanda={demanda}
              onEdit={onEdit}
              onDelete={onDelete}
              onComplete={onComplete}
              onMoveToDone={onMoveToDone}
            />
          ))}
          {demandas.length === 0 && !isAdding && (
            <div className="h-20 flex items-center justify-center text-[13px] text-zinc-400 dark:text-zinc-600">
              {emptyMessages[id] || "Vazio"}
            </div>
          )}
        </SortableContext>

        {isAdding && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-2 mb-2 shadow-sm animate-in fade-in zoom-in duration-200">
            <form onSubmit={(e) => {
              e.preventDefault();
              const event = (e as any).nativeEvent;
              onQuickAdd(id, quickTitle, event);
              setQuickTitle("");
              if (inputRef.current) inputRef.current.focus();
            }}>
              <Input
                ref={inputRef}
                placeholder="Nova tarefa..."
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  if (!quickTitle.trim()) setIsAdding(false);
                }}
                className="text-[14px] h-7 border-none focus-visible:ring-0 px-1 placeholder:text-zinc-400"
                disabled={loading}
              />
            </form>
          </div>
        )}
      </div>

      <div className="p-2">
        <Button
          variant="ghost"
          className="w-full justify-start text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 h-8 font-normal text-sm gap-2 px-2 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
          onClick={() => setIsAdding(true)}
        >
          <Plus size={16} />
          Novo
        </Button>
      </div>
    </div>
  );
}
