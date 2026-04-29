import React, { useState, useEffect, useRef } from "react";
import { 
  X, 
  Trash2, 
  Copy, 
  CheckCircle2, 
  Clock, 
  User, 
  Calendar, 
  ArrowRight,
  Plus,
  Check,
  ChevronDown,
  Repeat,
  History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Demanda {
  id: string;
  titulo: string;
  descricao?: string;
  status: string;
  prioridade: string;
  prazo?: string;
  cliente_id: string | null;
  created_at?: string;
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

interface DemandaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  demanda: Demanda | null;
  onUpdate: (id: string, values: Partial<Demanda>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (demanda: Demanda) => Promise<void>;
  clientes: { id: string; nome: string; agencia?: string }[];
  columns: { id: string; title: string; color: string; hex: string }[];
}

export function DemandaDrawer({
  isOpen,
  onClose,
  demanda,
  onUpdate,
  onDelete,
  onDuplicate,
  clientes,
  columns,
}: DemandaDrawerProps) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  
  const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const descTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (demanda) {
      setTitulo(demanda.titulo || "");
      setDescricao(demanda.descricao || "");
    }
  }, [demanda]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  if (!demanda) return null;

  const handleTitleBlur = () => {
    if (titulo !== demanda.titulo) {
      saveUpdate({ titulo });
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLElement).blur();
    }
  };

  const handleDescChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setDescricao(newVal);
    
    if (descTimeoutRef.current) clearTimeout(descTimeoutRef.current);
    
    descTimeoutRef.current = setTimeout(() => {
      saveUpdate({ descricao: newVal });
    }, 500);
  };

  const saveUpdate = async (values: Partial<Demanda>) => {
    setIsSaving(true);
    await onUpdate(demanda.id, values);
    setIsSaving(false);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  const currentColumn = columns.find(c => c.id === demanda.status);
  const creationDate = demanda.created_at 
    ? formatDistanceToNow(new Date(demanda.created_at), { addSuffix: true, locale: ptBR })
    : "";

  return (
    <>
      {/* Backdrop for mobile, but non-blocking for desktop as requested (though typically a drawer has a backdrop, the prompt says "kanban continues interactive in background") */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/5 z-40 lg:hidden" 
          onClick={onClose}
        />
      )}
      
      <div className={cn(
        "fixed inset-y-0 right-0 z-50 w-full lg:w-[40%] bg-white dark:bg-zinc-950 border-l shadow-2xl transition-transform duration-300 ease-in-out flex flex-col",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X size={18} />
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            {showSaved && (
              <span className="text-[10px] text-zinc-400 animate-in fade-in fade-out duration-500">Salvo</span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5">
                  Mover para <ChevronDown size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {columns.map(col => (
                  <DropdownMenuItem 
                    key={col.id} 
                    onClick={() => saveUpdate({ status: col.id })}
                    className="gap-2"
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.hex }} />
                    {col.title}
                    {demanda.status === col.id && <Check size={14} className="ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-4 space-y-6">
          {/* Title input */}
          <div className="space-y-1">
            <textarea
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className="w-full text-3xl font-bold bg-transparent border-none focus:ring-0 p-0 resize-none min-h-[40px] leading-tight placeholder:text-zinc-300 dark:placeholder:text-zinc-800"
              placeholder="Sem título"
              rows={1}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = target.scrollHeight + 'px';
              }}
            />
          </div>

          {/* Metadata */}
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[120px,1fr] items-center gap-2 group">
              <div className="flex items-center gap-2 text-zinc-400">
                <Clock size={14} />
                <span>Status</span>
              </div>
              <div className="flex items-center">
                {currentColumn && (
                  <Badge 
                    variant="outline" 
                    className="text-[11px] py-0 h-5"
                    style={{ 
                      borderColor: currentColumn.hex, 
                      color: currentColumn.hex,
                      backgroundColor: `${currentColumn.hex}10` 
                    }}
                  >
                    {currentColumn.title}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[120px,1fr] items-center gap-2">
              <div className="flex items-center gap-2 text-zinc-400">
                <Calendar size={14} />
                <span>Criado</span>
              </div>
              <div className="text-zinc-500">
                {creationDate}
              </div>
            </div>

            {(demanda.cliente_id || true) && (
              <div className="grid grid-cols-[120px,1fr] items-center gap-2">
                <div className="flex items-center gap-2 text-zinc-400">
                  <User size={14} />
                  <span>Cliente</span>
                </div>
                <div className="flex items-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 px-1.5 py-0.5 rounded transition-colors text-left truncate max-w-full">
                        {demanda.clientes?.nome || "Adicionar cliente"}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
                      <DropdownMenuItem onClick={() => saveUpdate({ cliente_id: null })}>
                        Nenhum
                      </DropdownMenuItem>
                      {clientes.map(c => (
                        <DropdownMenuItem key={c.id} onClick={() => saveUpdate({ cliente_id: c.id })}>
                          {c.nome}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
            
            {/* Add field placeholder button */}
            <div className="pt-2 flex flex-wrap gap-2">
               <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] text-zinc-400 gap-1.5 px-1.5 hover:text-zinc-600">
                    <Plus size={12} /> Adicionar campo
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem className="text-xs" onClick={() => saveUpdate({ recorrente: true, frequencia_tipo: 'semanal' })}>Recorrência</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs">Prioridade</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs">Prazo</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs">Tags</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Separator className="my-6 opacity-50" />

          {/* Recurrence Section */}
          {demanda.recorrente && (
            <div className="space-y-4 border rounded-lg p-4 bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                <Repeat size={16} className="text-primary" />
                <span>Configuração de Recorrência</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-zinc-400">Tipo</span>
                  <Select 
                    value={demanda.frequencia_tipo || "semanal"} 
                    onValueChange={(val) => saveUpdate({ frequencia_tipo: val })}
                  >
                    <SelectTrigger className="h-7 text-xs border-none bg-transparent p-0 focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diaria" className="text-xs">Diária</SelectItem>
                      <SelectItem value="semanal" className="text-xs">Semanal</SelectItem>
                      <SelectItem value="quinzenal" className="text-xs">Quinzenal</SelectItem>
                      <SelectItem value="mensal" className="text-xs">Mensal</SelectItem>
                      <SelectItem value="customizada" className="text-xs">Customizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {demanda.proxima_execucao && (
                  <div className="space-y-1">
                    <span className="text-zinc-400">Próxima Execução</span>
                    <div className="font-medium">{new Date(demanda.proxima_execucao).toLocaleDateString('pt-BR')}</div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex gap-2">
                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1.5" onClick={() => onUpdate(demanda.id, { recorrente: false })}>
                  Desativar Recorrência
                </Button>
              </div>
            </div>
          )}

          {/* Description area */}
          <div className="space-y-2">
            <textarea
              value={descricao}
              onChange={handleDescChange}
              placeholder="Adicione uma descrição..."
              className="w-full min-h-[300px] bg-transparent border-none focus:ring-0 p-0 resize-none leading-relaxed text-[15px] placeholder:text-zinc-300 dark:placeholder:text-zinc-800"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-zinc-500 hover:text-zinc-900 h-8 gap-1.5 text-xs"
              onClick={() => onDuplicate(demanda)}
            >
              <Copy size={14} /> Duplicar
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-zinc-500 hover:text-destructive h-8 gap-1.5 text-xs"
              onClick={() => {
                if (window.confirm("Tem certeza que deseja excluir esta tarefa?")) {
                  onDelete(demanda.id);
                }
              }}
            >
              <Trash2 size={14} /> Remover
            </Button>
          </div>
          
          <div className="text-[10px] text-zinc-400 italic">
            Salvo automaticamente
          </div>
        </div>
      </div>
    </>
  );
}
