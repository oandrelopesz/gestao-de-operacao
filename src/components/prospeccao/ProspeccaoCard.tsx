import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { MoreVertical, Pencil, Copy, Trash2, Calendar, FileText, Building2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAgencias, agenciaBadgeStyle } from "@/lib/agencias";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/clientes";

export interface Lead {
  id: string;
  nome: string;
  nicho?: string;
  agencia_destino?: string;
  etapa: string;
  origem?: string;
  origem_detalhe?: string;
  valor_estimado?: number;
  probabilidade?: number;
  data_proximo_contato?: string;
  observacoes?: string;
  data_lead: string;
  data_fechamento?: string;
  data_perda?: string;
  motivo_perda?: string;
  cliente_id?: string | null;
  created_at?: string;
}

interface ProspeccaoCardProps {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (lead: Lead) => void;
}

export function ProspeccaoCard({ lead, onEdit, onDelete, onDuplicate }: ProspeccaoCardProps) {
  const { label: agenciaLabelOf, meta: agenciaMetaOf } = useAgencias();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes}
      {...listeners}
      className={cn(
        "group relative outline-none rounded-md mb-2 cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 z-50"
      )}
    >
      <Card
        className="hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden"
        onClick={() => onEdit(lead)}
      >
        <div className="p-2.5 space-y-1.5 relative">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-[14px] font-medium leading-tight break-words">
                {lead.nome}
              </h4>
              {(lead.nicho || (lead.valor_estimado && lead.valor_estimado > 0)) && (
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                  {lead.nicho && <span className="truncate">{lead.nicho}</span>}
                  {lead.nicho && lead.valor_estimado && lead.valor_estimado > 0 && <span>•</span>}
                  {lead.valor_estimado && lead.valor_estimado > 0 && (
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatBRL(lead.valor_estimado)}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity -mr-1">
                    <MoreVertical size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[140px] text-xs">
                  <DropdownMenuItem onClick={() => onEdit(lead)} className="gap-2 py-1.5">
                    <Pencil size={12} /> Detalhes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(lead)} className="gap-2 py-1.5">
                    <Copy size={12} /> Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onDelete(lead.id, lead.nome)} 
                    className="gap-2 py-1.5 text-destructive focus:text-destructive"
                  >
                    <Trash2 size={12} /> Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-2">
              {lead.data_proximo_contato && (
                <div title={`Próximo contato: ${lead.data_proximo_contato}`} className="text-amber-600">
                  <Calendar size={12} />
                </div>
              )}
              {lead.observacoes && (
                <div title="Tem observações">
                  <FileText size={12} className="text-zinc-400" />
                </div>
              )}
            </div>
            
            {lead.agencia_destino && (
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 h-4 font-normal uppercase border-zinc-200 dark:border-zinc-700"
                style={agenciaBadgeStyle(agenciaMetaOf(lead.agencia_destino)?.hex)}
              >
                {agenciaLabelOf(lead.agencia_destino)}
              </Badge>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
