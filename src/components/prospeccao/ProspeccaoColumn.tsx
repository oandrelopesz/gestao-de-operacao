import React, { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Lead, ProspeccaoCard } from "./ProspeccaoCard";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface ProspeccaoColumnProps {
  id: string;
  title: string;
  color: string;
  hex: string;
  leads: Lead[];
  onEdit: (lead: Lead) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (lead: Lead) => void;
  onQuickAdd: (name: string, etapa: string) => void;
}

export function ProspeccaoColumn({
  id,
  title,
  color,
  hex,
  leads,
  onEdit,
  onDelete,
  onDuplicate,
  onQuickAdd,
}: ProspeccaoColumnProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const { setNodeRef } = useDroppable({
    id,
    data: {
      type: "Column",
      columnId: id,
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (newName.trim()) {
      onQuickAdd(newName.trim(), id);
      setNewName("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    } else if (e.key === "Escape") {
      setIsAdding(false);
      setNewName("");
    }
  };

  return (
    <div className="flex flex-col w-72 shrink-0 h-full">
      <div className="flex items-center justify-between px-2 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn("w-2.5 h-2.5 rounded-full", `bg-${color}`)} style={{ backgroundColor: hex }} />
          <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
            {title}
          </h3>
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-500">
            {leads.length}
          </span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 min-h-0 bg-muted/40 border border-border/60 rounded-xl p-2 overflow-y-auto"
      >
        <SortableContext id={id} items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <ProspeccaoCard
              key={lead.id}
              lead={lead}
              onEdit={onEdit}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
            />
          ))}
        </SortableContext>

        {isAdding ? (
          <div className="bg-white dark:bg-zinc-900 border-2 border-primary/50 rounded-md p-2 shadow-sm animate-in zoom-in-95 duration-200">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nome do lead..."
              className="h-8 text-sm border-none shadow-none focus-visible:ring-0 p-0 mb-2"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Press Enter to add</span>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsAdding(false)}>
                  <X size={14} />
                </Button>
                <Button size="icon" className="h-6 w-6" onClick={() => handleSubmit()}>
                  <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start h-8 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 mt-1 gap-2"
            onClick={() => setIsAdding(true)}
          >
            <Plus size={14} />
            Adicionar lead
          </Button>
        )}
      </div>
    </div>
  );
}
