import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { MoreVertical, Pencil, Copy, Trash2, Check, FileText, Repeat, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { COLUNA_FDS, DIAS_FDS, ROTULO_DIA, type DiaFds } from "@/lib/fimDeSemana";

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
  dia_fim_de_semana?: string | null;
}

interface KanbanCardProps {
  demanda: Demanda;
  onEdit: (demanda: Demanda) => void;
  onDelete: (id: string, name: string) => void;
  onComplete?: (id: string) => void;
  onMoveToDone?: (id: string) => void;
  onSetDia?: (id: string, dia: DiaFds) => void;
}

interface SortableBindings {
  setNodeRef: (el: HTMLElement | null) => void;
  style: React.CSSProperties;
  attributes: Record<string, any>;
  listeners: Record<string, any> | undefined;
  isDragging: boolean;
}

export function KanbanCard(props: KanbanCardProps) {
  const isRecorrenteMae = props.demanda.status === "recorrentes";
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.demanda.id,
    disabled: isRecorrenteMae,
  });
  return (
    <KanbanCardView
      {...props}
      sortable={{ setNodeRef, attributes, listeners, isDragging, style: { transform: CSS.Translate.toString(transform), transition } }}
    />
  );
}

/** Card sem drag-and-drop: usado no DragOverlay (clone que segue o ponteiro). */
export function KanbanCardView({ demanda, onEdit, onDelete, onComplete, onMoveToDone, onSetDia, sortable }: KanbanCardProps & { sortable?: SortableBindings }) {
  const isRecorrenteMae = demanda.status === "recorrentes";
  const isDragging = sortable?.isDragging ?? false;

  const isDone = demanda.status === "feito";

  // Get preview of description (first 2 lines)
  const descriptionPreview = demanda.descricao ? demanda.descricao.split('\n').slice(0, 2).join('\n') : "";

  const today = new Date().toISOString().split('T')[0];
  const isDueToday = demanda.proxima_execucao === today;
  const isOverdue = isRecorrenteMae && demanda.proxima_execucao && demanda.proxima_execucao < today;
  const isDoneForNow = isRecorrenteMae && demanda.proxima_execucao && demanda.proxima_execucao > today;
  const canCompleteRecorrente = isRecorrenteMae && (isDueToday || isOverdue);

  const formatProxima = (iso?: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}`;
  };

  return (
    <div
      ref={sortable?.setNodeRef}
      style={sortable?.style}
      {...(sortable?.attributes ?? {})}
      {...(sortable?.listeners ?? {})}
      className={cn(
        "group relative outline-none rounded-md mb-2",
        !isRecorrenteMae && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 z-50",
        isRecorrenteMae && !isDueToday && !isDoneForNow && "opacity-70"
      )}
    >
      <Card
        className={cn(
          "transition-[transform,box-shadow,border-color] duration-150 bg-card border border-border/70 shadow-xs hover:shadow-md hover:-translate-y-px hover:border-primary/30 overflow-hidden rounded-lg",
          isDone && "opacity-60",
          isRecorrenteMae && isDueToday && "border-primary/50 shadow-primary/10 ring-1 ring-primary/20",
          isDoneForNow && "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onEdit(demanda);
        }}
      >
        <div className="p-2.5 space-y-1.5 relative">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              {!isDone && !isDoneForNow && (onMoveToDone || onComplete) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isRecorrenteMae) {
                      if (!canCompleteRecorrente) return;
                      onComplete?.(demanda.id);
                    } else {
                      onMoveToDone?.(demanda.id);
                    }
                  }}
                  disabled={isRecorrenteMae && !canCompleteRecorrente}
                  title={
                    isRecorrenteMae && !canCompleteRecorrente
                      ? `Liberada em ${formatProxima(demanda.proxima_execucao)}`
                      : "Concluir"
                  }
                  className={cn(
                    "transition-opacity mt-1 h-4 w-4 rounded-sm border flex items-center justify-center shrink-0",
                    isRecorrenteMae && !canCompleteRecorrente
                      ? "opacity-40 cursor-not-allowed border-zinc-300 dark:border-zinc-700"
                      : "opacity-0 group-hover:opacity-100 border-zinc-300 dark:border-zinc-700 hover:bg-emerald-500 hover:border-emerald-500 hover:text-white cursor-pointer"
                  )}
                >
                  <Check size={10} />
                </button>
              )}
              
              <h4 className={cn(
                "text-[14px] font-medium leading-tight break-words",
                isDone && "line-through text-zinc-500"
              )}>
                {demanda.titulo}
                {(isRecorrenteMae || demanda.recorrente_pai_id) && <Repeat size={12} className="inline-block ml-1 text-primary animate-pulse-slow" />}
              </h4>
            </div>

            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity -mr-1">
                    <MoreVertical size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[140px] text-xs">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(demanda); }} className="gap-2 py-1.5">
                    <Pencil size={12} /> Detalhes
                  </DropdownMenuItem>
                  {demanda.status === COLUNA_FDS && onSetDia && DIAS_FDS.map((dia) => (
                    <DropdownMenuItem
                      key={dia}
                      disabled={(demanda.dia_fim_de_semana ?? "sabado") === dia}
                      onClick={(e) => { e.stopPropagation(); onSetDia(demanda.id, dia); }}
                      className="gap-2 py-1.5"
                    >
                      <CalendarDays size={12} /> Fazer no {ROTULO_DIA[dia].toLowerCase()}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); }} className="gap-2 py-1.5">
                    <Copy size={12} /> Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => { e.stopPropagation(); onDelete(demanda.id, demanda.titulo); }} 
                    className="gap-2 py-1.5 text-destructive focus:text-destructive"
                  >
                    <Trash2 size={12} /> Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {(demanda.descricao || isRecorrenteMae || demanda.status === COLUNA_FDS) && (
            <div className="flex items-center gap-2 pt-0.5">
              {demanda.descricao && (
                <span
                  title="Esta tarefa tem observação"
                  className="inline-flex items-center gap-1 rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700/70"
                >
                  <FileText size={9} /> observação
                </span>
              )}

              {demanda.status === COLUNA_FDS && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-300">
                  <CalendarDays size={10} /> {ROTULO_DIA[demanda.dia_fim_de_semana === "domingo" ? "domingo" : "sabado"]}
                </span>
              )}

              {isRecorrenteMae && (
                <div className="flex items-center gap-1 ml-auto shrink-0">
                  {demanda.proxima_execucao && !isDueToday && !isOverdue && (
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                      Próxima: {formatProxima(demanda.proxima_execucao)}
                    </span>
                  )}
                  <span className={cn(
                    "text-[9px] px-1 py-0.5 rounded-full font-bold uppercase tracking-tighter",
                    isOverdue ? "bg-red-500 text-white" :
                    isDueToday ? "bg-primary text-white" :
                    isDoneForNow ? "bg-emerald-500 text-white" :
                    "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                  )}>
                    {isOverdue ? "ATRASADA" : isDueToday ? "HOJE" : (isDoneForNow ? "OK" : (demanda.frequencia_tipo || "Repetir"))}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
