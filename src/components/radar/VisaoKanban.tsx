import { useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { MoveRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CLASSES, STATUS, TEMAS, type Achado, type StatusAchado } from "@/lib/radar";

function CardConteudo({ a }: { a: Achado }) {
  const c = CLASSES[a.classe];
  return (
    <>
      <div className="flex items-center gap-1.5 text-xs">
        <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium", c.selo)}>
          <span aria-hidden>{c.emoji}</span>
          {c.rotulo}
        </span>
        <span className="font-mono text-muted-foreground">{a.id}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium leading-snug">{a.titulo}</p>
      {a.temas.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {a.temas.map((slug) => {
            const t = TEMAS.find((x) => x.slug === slug);
            return (
              <span key={slug} className={cn("rounded border px-1.5 py-0.5 text-[11px]", t?.cor)}>
                {t?.rotulo ?? slug}
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}

function CardKanban({ a, onStatus }: { a: Achado; onStatus: (id: string, s: StatusAchado) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: a.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative rounded-md border border-l-4 bg-card p-2.5 shadow-sm",
        CLASSES[a.classe].borda,
        isDragging && "opacity-40",
      )}
    >
      {/* a alça de arrasto é o corpo do card; o menu fica fora dela para o clique funcionar */}
      <div {...attributes} {...listeners} className="cursor-grab touch-none pr-8 active:cursor-grabbing">
        <CardConteudo a={a} />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7"
            aria-label={`Mover ${a.id} para outro status`}
          >
            <MoveRight className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {STATUS.filter((s) => s.valor !== a.status).map((s) => (
            <DropdownMenuItem key={s.valor} onSelect={() => onStatus(a.id, s.valor)}>
              Mover para {s.rotulo}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Coluna({ valor, rotulo, itens, onStatus }: {
  valor: StatusAchado; rotulo: string; itens: Achado[]; onStatus: (id: string, s: StatusAchado) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: valor });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${rotulo}, ${itens.length} achados`}
      className={cn(
        "flex min-w-64 flex-1 flex-col rounded-lg border bg-muted/30 p-2 transition-colors",
        isOver && "border-primary bg-primary/10 ring-2 ring-primary/40",
      )}
    >
      <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
        {rotulo}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{itens.length}</span>
      </h3>
      <div className="flex flex-col gap-2">
        {itens.map((a) => <CardKanban key={a.id} a={a} onStatus={onStatus} />)}
        {itens.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Nenhum achado</p>}
      </div>
    </section>
  );
}

export function VisaoKanban(p: { achados: Achado[]; onStatus: (id: string, s: StatusAchado) => void }) {
  const [ativo, setAtivo] = useState<Achado | null>(null);
  // distância de 6 px: clique simples não vira arrasto
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const aoComecar = (e: DragStartEvent) => setAtivo(p.achados.find((a) => a.id === e.active.id) ?? null);
  const aoSoltar = (e: DragEndEvent) => {
    setAtivo(null);
    const alvo = e.over?.id as StatusAchado | undefined;
    const a = p.achados.find((x) => x.id === e.active.id);
    if (a && alvo && alvo !== a.status) p.onStatus(a.id, alvo);
  };

  return (
    <DndContext sensors={sensors} onDragStart={aoComecar} onDragEnd={aoSoltar} onDragCancel={() => setAtivo(null)}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {STATUS.map((s) => (
          <Coluna key={s.valor} valor={s.valor} rotulo={s.rotulo} onStatus={p.onStatus}
            itens={p.achados.filter((a) => a.status === s.valor)} />
        ))}
      </div>
      <DragOverlay>
        {ativo && (
          <div className={cn("rounded-md border border-l-4 bg-card p-2.5 shadow-lg", CLASSES[ativo.classe].borda)}>
            <CardConteudo a={ativo} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
