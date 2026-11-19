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
import type { DonoDemanda } from "@/components/demandas/ClientePicker";

interface Demanda {
  id: string;
  titulo: string;
  descricao?: string;
  status: string;
  prioridade: string;
  prazo?: string | null;
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
  dia_semana?: number | null;
  processo_passo_id?: string | null;
  roadmap_id?: string | null;
  pessoal?: boolean;
  agencia_id?: string | null;
  clientes_extras?: string[] | null;
  prioritaria?: boolean | null;
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
  onSetDia?: (id: string, dia: number) => void;
  onAtribuirCliente?: (id: string, valor: DonoDemanda) => void;
  onAlternarPrioridade?: (id: string, ligar: boolean) => void;
  onEnviarRoadmap?: (demanda: Demanda) => void;
  onDesligarRoadmap?: (id: string) => void;
  onDuplicate?: (demanda: Demanda) => void;
  diasDaColuna?: number[];
  secoes?: { id: string; titulo: string; demandas: Demanda[] }[];
  clientes?: { id: string; nome: string; agencia?: string }[];
  /** Seleção em massa (ver DemandasPage) */
  selecionadas?: Set<string>;
  modoSelecao?: boolean;
  onAlternarSelecao?: (id: string) => void;
}

const VISIBLE_BATCH = 40;

const emptyMessages: Record<string, string> = {
  recorrentes: "Sem tarefas recorrentes",
  fazer_hoje: "Nada pra hoje",
  fazer_amanha: "Vazio",
  fazer_depois_amanha: "Vazio",
  fazer_fim_de_semana: "Nada pro fim de semana",
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
  onSetDia,
  onAtribuirCliente,
  onAlternarPrioridade,
  onEnviarRoadmap,
  onDesligarRoadmap,
  onDuplicate,
  diasDaColuna,
  secoes,
  clientes: clientesDisponiveis,
  selecionadas,
  modoSelecao,
  onAlternarSelecao,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !!secoes });
  const [isAdding, setIsAdding] = useState(false);
  // Colunas muito longas (ex.: Feito com centenas de cards) travavam a troca de aba:
  // renderiza um lote por vez e o restante sob demanda.
  const [visibleLimit, setVisibleLimit] = useState(VISIBLE_BATCH);
  const visibleDemandas = demandas.length > visibleLimit ? demandas.slice(0, visibleLimit) : demandas;
  const hiddenCount = demandas.length - visibleDemandas.length;
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

  const renderCard = (demanda: Demanda) => (
    <KanbanCard
      key={demanda.id}
      demanda={demanda}
      onEdit={onEdit}
      onDelete={onDelete}
      onComplete={onComplete}
      onMoveToDone={onMoveToDone}
      onSetDia={onSetDia}
      onAtribuirCliente={onAtribuirCliente}
      onAlternarPrioridade={onAlternarPrioridade}
      onEnviarRoadmap={onEnviarRoadmap}
      onDesligarRoadmap={onDesligarRoadmap}
      onDuplicate={onDuplicate}
      diasDaColuna={diasDaColuna}
      clientes={clientesDisponiveis}
      selecionada={selecionadas?.has(demanda.id)}
      modoSelecao={modoSelecao}
      onAlternarSelecao={onAlternarSelecao}
    />
  );

  return (
    // coluna-*: ganchos das aparências Painel/Editorial no styles.css (na Clássica não pintam nada); --cc = cor da coluna
    <div
      data-sobre={!secoes && isOver ? "" : undefined}
      style={{ "--cc": hex } as React.CSSProperties}
      className={cn(
      "coluna-kanban flex flex-col w-[280px] shrink-0 rounded-xl p-0 h-full transition-colors border border-border/60",
      "bg-muted/40",
      !secoes && isOver && "bg-accent/50 border-primary/30"
    )}>
      {/* Top indicator line */}
      <div
        className="coluna-topo h-[3px] w-full rounded-t-xl mb-0"
        style={{ backgroundColor: hex }}
      />

      <div className="coluna-cab flex items-center justify-between px-3 pt-3 mb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-xs tracking-tight uppercase" style={{ color: hex }}>{title}</h3>
          <span className="coluna-n text-[10px] text-muted-foreground font-medium px-1.5 py-0.5 rounded-full bg-zinc-200/50 dark:bg-zinc-800/50">
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
                  <Pencil size={12} /> Editar coluna
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
        {secoes ? (
          secoes.map((secao) => (
            <SecaoColuna key={secao.id} secao={secao} renderCard={renderCard} />
          ))
        ) : (
          <>
            <SortableContext
              id={id}
              items={visibleDemandas.map((d) => d.id)}
              strategy={verticalListSortingStrategy}
            >
              {visibleDemandas.map(renderCard)}
              {demandas.length === 0 && !isAdding && (
                <div className="h-20 flex items-center justify-center text-[13px] text-zinc-400 dark:text-zinc-600">
                  {emptyMessages[id] || "Vazio"}
                </div>
              )}
            </SortableContext>

            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setVisibleLimit((l) => l + VISIBLE_BATCH)}
                className="w-full mb-2 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md transition-colors"
              >
                Mostrar mais {Math.min(VISIBLE_BATCH, hiddenCount)} de {hiddenCount}
              </button>
            )}
          </>
        )}

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

/** Uma das seções (Sábado/Domingo) da coluna de fim de semana: área de drop e ordem próprias. */
function SecaoColuna({ secao, renderCard }: { secao: { id: string; titulo: string; demandas: Demanda[] }; renderCard: (d: Demanda) => React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: secao.id });
  return (
    <div ref={setNodeRef} className={cn("rounded-lg mb-2 pb-1 transition-colors", isOver && "bg-accent/50")}>
      <div className="flex items-center justify-between px-1 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{secao.titulo}</span>
        <span className="text-[10px] font-medium">{secao.demandas.length}</span>
      </div>
      <SortableContext id={secao.id} items={secao.demandas.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        {secao.demandas.map(renderCard)}
        {secao.demandas.length === 0 && (
          <div className="h-14 flex items-center justify-center text-[12px] text-zinc-400 dark:text-zinc-600 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md">
            Arraste para cá
          </div>
        )}
      </SortableContext>
    </div>
  );
}
