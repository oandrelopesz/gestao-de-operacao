import { useEffect, useMemo, useState } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ChevronsUp, GripVertical, ListOrdered, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  categoriaMeta, pausarItem, retomarItem, reordenarFila, baixarEmSeguida, erroAmigavel,
  type SwipeItem, type SwipeJob,
} from "@/lib/swipe";
import { separarFila, moverNaFila } from "@/lib/swipeFila";

interface Props {
  jobs: SwipeJob[];
  itens: SwipeItem[];
  nomeNicho: (id: string | null | undefined) => string;
  onChange: () => Promise<void> | void;
}

function tempoDesde(iso: string | null, agora: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Fila de downloads do swipe file: o que está baixando (com botão de pausar), a ordem de quem
 * espera (arrastar, setas ou "baixar em seguida") e os pausados (retomar).
 */
export function FilaDownloads({ jobs, itens, nomeNicho, onChange }: Props) {
  const { rodando, aguardando, pausados } = useMemo(() => separarFila(jobs), [jobs]);
  const [ordem, setOrdem] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  // A ordem local acompanha o banco, mas muda na hora ao arrastar (sem esperar o recarregamento)
  useEffect(() => setOrdem(aguardando.map((j) => j.id)), [aguardando]);

  useEffect(() => {
    if (!rodando.length) return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [rodando.length]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const itemDe = (job: SwipeJob) => itens.find((i) => i.id === job.item_id);

  const acao = async (id: string, fn: () => Promise<void>, sucesso?: string) => {
    setOcupado(id);
    try {
      await fn();
      if (sucesso) toast.success(sucesso);
      await onChange();
    } catch (e) {
      toast.error(erroAmigavel(e));
      await onChange();
    } finally {
      setOcupado(null);
    }
  };

  const gravarOrdem = (nova: string[]) => {
    setOrdem(nova);
    acao("__ordem", () => reordenarFila(aguardando, nova));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const de = ordem.indexOf(String(active.id));
    const para = ordem.indexOf(String(over.id));
    if (de < 0 || para < 0) return;
    gravarOrdem(arrayMove(ordem, de, para));
  };

  if (!rodando.length && !aguardando.length && !pausados.length) return null;

  const porId = new Map(aguardando.map((j) => [j.id, j]));
  const nomeDoJob = (job: SwipeJob) => {
    const item = itemDe(job);
    return item?.player || String(job.payload?.nome_arquivo || "Item");
  };
  const detalhe = (job: SwipeJob) => {
    const item = itemDe(job);
    const cat = categoriaMeta(item?.categoria || String(job.payload?.categoria || ""));
    const nicho = item ? [nomeNicho(item.nicho_id), nomeNicho(item.subnicho_id)].filter(Boolean).join(" › ") : "";
    return { cat, nicho };
  };

  return (
    <Card className="border-primary/30">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center gap-2">
          <ListOrdered size={16} className="text-primary" />
          <h3 className="text-sm font-semibold">Fila de downloads</h3>
          <span className="text-xs text-muted-foreground">
            {aguardando.length} na fila{pausados.length ? ` · ${pausados.length} pausado${pausados.length > 1 ? "s" : ""}` : ""}
          </span>
          {ocupado === "__ordem" && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
        </div>

        {/* Baixando agora */}
        {rodando.map((job) => {
          const { cat, nicho } = detalhe(job);
          return (
            <div key={job.id} className="flex items-center gap-3 rounded-lg border border-blue-500/40 bg-blue-500/5 px-3 py-2">
              <Loader2 size={16} className="shrink-0 animate-spin text-blue-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{nomeDoJob(job)}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  Baixando agora · {tempoDesde(job.iniciado_em, agora)} · {cat.singular}{nicho ? ` · ${nicho}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                disabled={ocupado === job.id}
                onClick={() => acao(job.id, () => pausarItem(job.item_id), "Pausado. O próximo da fila começa em até 1 minuto.")}
                title="Interrompe este download e libera a vez para o próximo"
              >
                {ocupado === job.id ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />} Pausar
              </Button>
            </div>
          );
        })}

        {/* Na fila */}
        {ordem.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Arraste pela alça (ou use as setas) para escolher a ordem. O de cima é o próximo.</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
              <SortableContext items={ordem} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {ordem.map((id, idx) => {
                    const job = porId.get(id);
                    if (!job) return null;
                    const { cat, nicho } = detalhe(job);
                    return (
                      <LinhaFila
                        key={id}
                        id={id}
                        posicao={idx + 1}
                        titulo={nomeDoJob(job)}
                        subtitulo={`${cat.singular}${nicho ? ` · ${nicho}` : ""}`}
                        cor={cat.hex}
                        primeiro={idx === 0}
                        ultimo={idx === ordem.length - 1}
                        ocupado={ocupado === id}
                        onSubir={() => gravarOrdem(moverNaFila(ordem, id, -1))}
                        onDescer={() => gravarOrdem(moverNaFila(ordem, id, 1))}
                        onTopo={() => acao(id, () => baixarEmSeguida(id, aguardando), "Vai ser o próximo a baixar")}
                        onPausar={() => acao(id, () => pausarItem(job.item_id), "Pausado: ele sai da vez até você retomar")}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* Pausados */}
        {pausados.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Pausados</p>
            {pausados.map((job) => {
              const { cat, nicho } = detalhe(job);
              return (
                <div key={job.id} className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-1.5">
                  <Pause size={14} className="shrink-0 text-violet-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{nomeDoJob(job)}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{cat.singular}{nicho ? ` · ${nicho}` : ""} · recomeça do zero ao retomar</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    disabled={ocupado === job.id}
                    onClick={() => acao(job.id, () => retomarItem(job.item_id), "De volta à fila (no fim)")}
                  >
                    {ocupado === job.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Retomar
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface LinhaFilaProps {
  id: string;
  posicao: number;
  titulo: string;
  subtitulo: string;
  cor: string;
  primeiro: boolean;
  ultimo: boolean;
  ocupado: boolean;
  onSubir: () => void;
  onDescer: () => void;
  onTopo: () => void;
  onPausar: () => void;
}

function LinhaFila({ id, posicao, titulo, subtitulo, cor, primeiro, ultimo, ocupado, onSubir, onDescer, onTopo, onPausar }: LinhaFilaProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5",
        isDragging && "relative z-10 shadow-lg ring-2 ring-primary/40",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
        title="Arraste para mudar a ordem"
      >
        <GripVertical size={14} />
      </button>
      <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[10px] numeric">{posicao}</Badge>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{titulo}</p>
        <p className="truncate text-[11px] text-muted-foreground">{subtitulo}</p>
      </div>
      <div className="flex shrink-0 items-center">
        {!primeiro && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onTopo} disabled={ocupado} title="Baixar em seguida (vai para o topo)">
            <ChevronsUp size={14} />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSubir} disabled={primeiro || ocupado} title="Subir"><ArrowUp size={13} /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDescer} disabled={ultimo || ocupado} title="Descer"><ArrowDown size={13} /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPausar} disabled={ocupado} title="Pausar (sai da vez até você retomar)">
          {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />}
        </Button>
      </div>
    </div>
  );
}
