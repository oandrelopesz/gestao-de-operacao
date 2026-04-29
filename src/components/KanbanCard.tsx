import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MoreVertical, Pencil, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface KanbanCardProps {
  demanda: Demanda;
  onEdit: (demanda: Demanda) => void;
  onDelete: (id: string) => void;
}

const priorityColors = {
  baixa: "bg-slate-100 text-slate-700 border-slate-200",
  media: "bg-blue-50 text-blue-700 border-blue-200",
  alta: "bg-orange-50 text-orange-700 border-orange-200",
  urgente: "bg-red-50 text-red-700 border-red-200",
};

export function KanbanCard({ demanda, onEdit, onDelete }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: demanda.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isDone = demanda.status === "feito";

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <Card
        className={cn(
          "mb-3 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors bg-card",
          isDone && "opacity-60 grayscale-[0.5]"
        )}
        onClick={() => onEdit(demanda)}
      >
        <div 
          className="absolute top-0 bottom-0 left-0 w-1 rounded-l-md" 
          {...attributes} 
          {...listeners} 
        />
        <CardContent className="p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h4 className={cn(
              "text-sm font-medium leading-tight",
              isDone && "line-through text-muted-foreground"
            )}>
              {demanda.titulo}
            </h4>
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuItem onClick={() => onEdit(demanda)} className="gap-2">
                    <Pencil size={14} /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {}} className="gap-2">
                    <Copy size={14} /> Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onDelete(demanda.id)} 
                    className="gap-2 text-destructive focus:text-destructive"
                  >
                    <Trash2 size={14} /> Deletar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            {demanda.clientes?.nome && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal border-muted-foreground/20">
                {demanda.clientes.nome}
              </Badge>
            )}
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] py-0 px-1.5 font-normal border-transparent capitalize",
                priorityColors[demanda.prioridade]
              )}
            >
              {demanda.prioridade}
            </Badge>
            {demanda.prazo && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
                <Calendar size={10} />
                {new Date(demanda.prazo).toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
