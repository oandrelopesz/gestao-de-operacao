import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { MoreVertical, Pencil, Copy, Trash2, Check, FileText, Repeat, CalendarDays, User, UserPlus, AlertTriangle, Rocket, Map as MapIcon, Unlink, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientePicker, type DonoDemanda } from "@/components/demandas/ClientePicker";
import { cn } from "@/lib/utils";
import { useAgencias } from "@/lib/agencias";
import { NOMES_DIA, rotuloFazerNoDia } from "@/lib/colunasDias";
import { hojeBrasilia, diasDeAtraso, formatarDataCurta } from "@/lib/entrega";

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
}

interface KanbanCardProps {
  demanda: Demanda;
  onEdit: (demanda: Demanda) => void;
  onDelete: (id: string, name: string) => void;
  onComplete?: (id: string) => void;
  onMoveToDone?: (id: string) => void;
  onSetDia?: (id: string, dia: number) => void;
  onAtribuirCliente?: (id: string, valor: DonoDemanda) => void;
  onEnviarRoadmap?: (demanda: Demanda) => void;
  onDesligarRoadmap?: (id: string) => void;
  /** Item "Duplicar" do menu: só aparece quando há quem duplique (o card do DragOverlay não passa) */
  onDuplicate?: (demanda: Demanda) => void;
  diasDaColuna?: number[];
  clientes?: { id: string; nome: string; agencia?: string }[];
  /** Seleção em massa: card marcado, modo "Selecionar" ligado e alternar a marcação */
  selecionada?: boolean;
  modoSelecao?: boolean;
  onAlternarSelecao?: (id: string) => void;
  /** Só no card que segue o ponteiro: quantos cards vão juntos no arrasto */
  qtdNoArrasto?: number;
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
export function KanbanCardView({ demanda, onEdit, onDelete, onComplete, onMoveToDone, onSetDia, onAtribuirCliente, onEnviarRoadmap, onDesligarRoadmap, onDuplicate, diasDaColuna, clientes, selecionada, modoSelecao, onAlternarSelecao, qtdNoArrasto, sortable }: KanbanCardProps & { sortable?: SortableBindings }) {
  const navigate = useNavigate();
  const { label: labelAgencia, meta: metaAgencia } = useAgencias();
  const isRecorrenteMae = demanda.status === "recorrentes";
  const isDragging = sortable?.isDragging ?? false;

  const isDone = demanda.status === "feito";
  const diaCard = diasDaColuna?.length
    ? (demanda.dia_semana != null && diasDaColuna.includes(demanda.dia_semana) ? demanda.dia_semana : diasDaColuna[0])
    : null;
  const atraso = !isDone && !isRecorrenteMae ? diasDeAtraso(demanda.prazo, hojeBrasilia()) : 0;
  // Demanda de passo de onboarding: o roadmap vem do passo, não se envia/desliga à mão
  const podeRoadmap = !demanda.processo_passo_id && !isRecorrenteMae;
  // Faixa da agência no topo do card: a demanda da própria agência ou a agência do cliente (cor do cadastro)
  const agenciaId = !demanda.pessoal ? demanda.agencia_id || demanda.clientes?.agencia : undefined;
  const agenciaHex = agenciaId ? metaAgencia(agenciaId)?.hex : undefined;

  // Get preview of description (first 2 lines)
  const descriptionPreview = demanda.descricao ? demanda.descricao.split('\n').slice(0, 2).join('\n') : "";

  const today = new Date().toISOString().split('T')[0];
  const isDueToday = demanda.proxima_execucao === today;
  const isOverdue = isRecorrenteMae && demanda.proxima_execucao && demanda.proxima_execucao < today;
  const isDoneForNow = isRecorrenteMae && demanda.proxima_execucao && demanda.proxima_execucao > today;
  const canCompleteRecorrente = isRecorrenteMae && (isDueToday || isOverdue);
  // Recorrentes (mãe) ficam fora da seleção em massa: já são travados no arrasto
  const podeSelecionar = !!onAlternarSelecao && !isRecorrenteMae;
  const mostrarConcluir = !isDone && !isDoneForNow && !!(onMoveToDone || onComplete);

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
      {!!qtdNoArrasto && qtdNoArrasto > 1 && (
        <span className="absolute -right-2 -top-2 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground shadow-md">
          {qtdNoArrasto}
        </span>
      )}
      <Card
        className={cn(
          "transition-[transform,box-shadow,border-color] duration-150 bg-card border border-border/70 shadow-xs hover:shadow-md hover:-translate-y-px hover:border-primary/30 overflow-hidden rounded-lg",
          isDone && "opacity-60",
          isRecorrenteMae && isDueToday && "border-primary/50 shadow-primary/10 ring-1 ring-primary/20",
          isDoneForNow && "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50",
          atraso > 0 && "border-red-500/70 bg-red-500/5 ring-1 ring-red-500/30",
          selecionada && "border-primary ring-2 ring-primary/60 bg-primary/5"
        )}
        onClick={(e) => {
          e.stopPropagation();
          // Modo "Selecionar" (ou Ctrl/Cmd + clique): o clique marca/desmarca em vez de abrir
          if (podeSelecionar && (modoSelecao || e.ctrlKey || e.metaKey)) {
            onAlternarSelecao?.(demanda.id);
            return;
          }
          // Demanda de passo de onboarding ligada a roadmap abre o roadmap; as demais abrem o card (a tag Roadmap leva ao roadmap)
          if (demanda.roadmap_id && demanda.processo_passo_id) {
            navigate({ to: "/roadmap", search: { id: demanda.roadmap_id } });
            return;
          }
          onEdit(demanda);
        }}
      >
        {agenciaId && (
          <div
            title={`Agência: ${labelAgencia(agenciaId)}`}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider border-b border-border/50 bg-muted/40 text-muted-foreground"
            style={agenciaHex ? { color: agenciaHex, backgroundColor: `${agenciaHex}14`, borderBottomColor: `${agenciaHex}33` } : undefined}
          >
            <Building2 size={11} className="shrink-0" />
            <span className="truncate">{labelAgencia(agenciaId)}</span>
          </div>
        )}
        <div className="p-2.5 space-y-1.5 relative">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              {podeSelecionar && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!selecionada}
                  aria-label={selecionada ? "Desmarcar" : "Selecionar"}
                  title={selecionada ? "Desmarcar" : "Selecionar (ou Ctrl + clique no card)"}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onAlternarSelecao?.(demanda.id); }}
                  className={cn(
                    "transition-opacity mt-1 h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 cursor-pointer",
                    selecionada
                      ? "bg-primary border-primary text-primary-foreground opacity-100"
                      : cn("border-zinc-300 dark:border-zinc-700 hover:border-primary", modoSelecao ? "opacity-100" : "opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100")
                  )}
                >
                  {selecionada && <Check size={10} />}
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

            <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              {onAtribuirCliente && !demanda.processo_passo_id && (
                <div onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <ClientePicker
                    clientes={clientes ?? []}
                    clienteIdAtual={demanda.cliente_id}
                    pessoalAtual={demanda.pessoal}
                    agenciaIdAtual={demanda.agencia_id}
                    onEscolher={(valor) => onAtribuirCliente(demanda.id, valor)}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Atribuir cliente"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className={cn(
                        "h-6 w-6 transition-opacity",
                        demanda.cliente_id || demanda.pessoal || demanda.agencia_id
                          ? "opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100"
                          : "opacity-100"
                      )}
                    >
                      <UserPlus size={14} />
                    </Button>
                  </ClientePicker>
                </div>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity -mr-1">
                    <MoreVertical size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[180px] text-xs">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(demanda); }} className="gap-2 py-1.5">
                    <Pencil size={12} /> Detalhes
                  </DropdownMenuItem>
                  {onSetDia && diasDaColuna && diasDaColuna.length > 1 && diasDaColuna.map((dia) => (
                    <DropdownMenuItem
                      key={dia}
                      disabled={diaCard === dia}
                      onClick={(e) => { e.stopPropagation(); onSetDia(demanda.id, dia); }}
                      className="gap-2 py-1.5"
                    >
                      <CalendarDays size={12} /> {rotuloFazerNoDia(dia)}
                    </DropdownMenuItem>
                  ))}
                  {podeRoadmap && !demanda.roadmap_id && onEnviarRoadmap && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEnviarRoadmap(demanda); }} className="gap-2 py-1.5">
                      <MapIcon size={12} /> Enviar para o Roadmap
                    </DropdownMenuItem>
                  )}
                  {podeRoadmap && demanda.roadmap_id && (
                    <>
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); navigate({ to: "/roadmap", search: { id: demanda.roadmap_id ?? undefined } }); }}
                        className="gap-2 py-1.5"
                      >
                        <MapIcon size={12} /> Abrir roadmap
                      </DropdownMenuItem>
                      {onDesligarRoadmap && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDesligarRoadmap(demanda.id); }} className="gap-2 py-1.5">
                          <Unlink size={12} /> Desligar do roadmap
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                  {onDuplicate && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(demanda); }} className="gap-2 py-1.5">
                      <Copy size={12} /> Duplicar
                    </DropdownMenuItem>
                  )}
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

          {(demanda.clientes?.nome || demanda.pessoal || demanda.descricao || isRecorrenteMae || diaCard != null || demanda.prazo || demanda.processo_passo_id || demanda.roadmap_id || mostrarConcluir) && (
            <div className="flex items-end gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              {demanda.processo_passo_id && (
                <button
                  type="button"
                  title="Ir para o Onboarding"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate({ to: "/onboarding", search: { cliente: demanda.cliente_id ?? undefined } });
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500 text-white hover:brightness-110"
                >
                  <Rocket size={10} /> Onboarding
                </button>
              )}

              {demanda.roadmap_id && (
                <button
                  type="button"
                  title="Ir para o Roadmap"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate({ to: "/roadmap", search: { id: demanda.roadmap_id ?? undefined } });
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500 text-white hover:brightness-110"
                >
                  <MapIcon size={10} /> Roadmap
                </button>
              )}

              {demanda.pessoal ? (
                <span className="inline-flex items-center gap-1 max-w-full truncate text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600">
                  <User size={10} className="shrink-0" /> Pessoal
                </span>
              ) : demanda.clientes?.nome && (
                <span
                  title={`Cliente: ${demanda.clientes.nome}`}
                  className="inline-flex items-center gap-1 max-w-full truncate text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300"
                >
                  <User size={10} className="shrink-0" /> <span className="truncate">{demanda.clientes.nome}</span>
                </span>
              )}

              {demanda.descricao && (
                <span
                  title="Esta tarefa tem observação"
                  className="inline-flex items-center gap-1 rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700/70"
                >
                  <FileText size={9} /> observação
                </span>
              )}

              {diaCard != null && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-300">
                  <CalendarDays size={10} /> {NOMES_DIA[diaCard]}
                </span>
              )}

              {demanda.prazo && !isRecorrenteMae && (
                atraso > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500 text-white" title={`Entrega era ${formatarDataCurta(demanda.prazo)}`}>
                    <AlertTriangle size={10} /> Atrasada há {atraso} {atraso === 1 ? "dia" : "dias"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-600 dark:text-zinc-300" title="Data de entrega">
                    <CalendarDays size={10} /> Entrega {formatarDataCurta(demanda.prazo)}
                  </span>
                )
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
            {/* Concluir: canto inferior direito (o canto superior esquerdo é da seleção) */}
            {mostrarConcluir && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
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
                  "transition-opacity ml-auto h-4 w-4 rounded-sm border flex items-center justify-center shrink-0",
                  isRecorrenteMae && !canCompleteRecorrente
                    ? "opacity-40 cursor-not-allowed border-zinc-300 dark:border-zinc-700"
                    : "opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 border-zinc-300 dark:border-zinc-700 hover:bg-emerald-500 hover:border-emerald-500 hover:text-white cursor-pointer"
                )}
              >
                <Check size={10} />
              </button>
            )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
