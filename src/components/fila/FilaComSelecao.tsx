// Fila com ordem, pausa, cancelamento e seleção em massa — usada no Swipe file (downloads) e no
// Transcritor. Quem usa entrega as linhas já traduzidas (título, subtítulo, etapa) e as ações.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { useSensoresArrastar } from "@/lib/arrastar";
import { toast } from "sonner";
import {
  ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Check, ChevronsUp, GripVertical, ListOrdered, Loader2, Pause, Play, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { moverNaFila } from "@/lib/swipeFila";

export interface LinhaDaFila {
  id: string;
  titulo: string;
  subtitulo?: string;
  cor?: string;
  /** Só em andamento: o que está fazendo agora ("Baixando", "Transcrevendo 45%"...) */
  etapa?: string;
  /** 0–1; null = sem barra (indeterminado) */
  progresso?: number | null;
  /** Em andamento que não dá para pausar (ex.: envio do arquivo, só cancelar) */
  semPausa?: boolean;
}

interface Props {
  titulo: string;
  icone?: ReactNode;
  andamento: LinhaDaFila[];
  aguardando: LinhaDaFila[]; // já na ordem da fila
  pausados: LinhaDaFila[];
  /** Nome da coisa na confirmação ("download", "transcrição") */
  /** `feminino` acerta o gênero dos avisos ("esta transcrição", "pausadas") */
  nomeItem: { singular: string; plural: string; feminino?: boolean };
  onReordenar: (ids: string[]) => Promise<void>;
  onPausar: (ids: string[]) => Promise<void>;
  onRetomar: (ids: string[]) => Promise<void>;
  onCancelar: (ids: string[]) => Promise<void>;
  onMover: (ids: string[], destino: "topo" | "fim") => Promise<void>;
  onErro: (e: unknown) => string;
  /** Recarregar depois de cada ação */
  onMudou: () => Promise<void> | void;
}

export function FilaComSelecao({
  titulo, icone, andamento, aguardando, pausados, nomeItem, onReordenar, onPausar, onRetomar, onCancelar, onMover, onErro, onMudou,
}: Props) {
  const [ordem, setOrdem] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmarCancelar, setConfirmarCancelar] = useState<string[] | null>(null);

  useEffect(() => setOrdem(aguardando.map((l) => l.id)), [aguardando]);

  // Selecionados que saíram da fila (terminaram, foram cancelados) deixam de contar
  const todos = useMemo(() => new Set([...andamento, ...aguardando, ...pausados].map((l) => l.id)), [andamento, aguardando, pausados]);
  const marcados = [...selecionados].filter((id) => todos.has(id));
  const sensors = useSensoresArrastar(4, sortableKeyboardCoordinates);

  if (!andamento.length && !aguardando.length && !pausados.length) return null;

  const acao = async (chave: string, fn: () => Promise<void>, sucesso?: string, limpar = false) => {
    setOcupado(chave);
    try {
      await fn();
      if (sucesso) toast.success(sucesso);
      if (limpar) setSelecionados(new Set());
    } catch (e) {
      toast.error(onErro(e));
    } finally {
      await onMudou();
      setOcupado(null);
    }
  };

  const gravarOrdem = (nova: string[]) => {
    setOrdem(nova);
    acao("__ordem", () => onReordenar(nova));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const de = ordem.indexOf(String(active.id));
    const para = ordem.indexOf(String(over.id));
    if (de >= 0 && para >= 0) gravarOrdem(arrayMove(ordem, de, para));
  };

  const alternar = (id: string) => setSelecionados((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const idsAguardando = new Set(aguardando.map((l) => l.id));
  const idsPausados = new Set(pausados.map((l) => l.id));
  const pausaveis = marcados.filter((id) => !idsPausados.has(id) && !andamento.find((l) => l.id === id)?.semPausa);
  const retomaveis = marcados.filter((id) => idsPausados.has(id));
  const moviveis = marcados.filter((id) => idsAguardando.has(id));
  const qtd = (n: number) => `${n} ${n === 1 ? nomeItem.singular : nomeItem.plural}`;
  const gen = (masculino: string, feminino: string) => (nomeItem.feminino ? feminino : masculino);
  const pausadosTxt = (n: number) => gen(n > 1 ? "pausados" : "pausado", n > 1 ? "pausadas" : "pausada");

  const Caixa = ({ id }: { id: string }) => {
    const marcado = selecionados.has(id);
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={marcado}
        aria-label={marcado ? "Desmarcar" : "Selecionar"}
        onClick={() => alternar(id)}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
          marcado ? "border-primary bg-primary text-primary-foreground" : "border-zinc-300 hover:border-primary dark:border-zinc-600",
        )}
      >
        {marcado && <Check size={10} />}
      </button>
    );
  };

  const BotaoCancelar = ({ id }: { id: string }) => (
    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={ocupado === id}
      onClick={() => setConfirmarCancelar([id])} title="Cancelar (tira da fila e apaga — não dá para desfazer)">
      <X size={14} />
    </Button>
  );

  const porId = new Map(aguardando.map((l) => [l.id, l]));

  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {icone ?? <ListOrdered size={16} className="text-primary" />}
          <h3 className="text-sm font-semibold">{titulo}</h3>
          <span className="text-xs text-muted-foreground">
            {aguardando.length} na fila{pausados.length ? ` · ${pausados.length} ${pausadosTxt(pausados.length)}` : ""}
          </span>
          {ocupado === "__ordem" && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
          <button type="button" className="ml-auto text-xs text-primary hover:underline"
            onClick={() => setSelecionados(marcados.length === todos.size ? new Set() : new Set(todos))}>
            {marcados.length === todos.size ? "Desmarcar todos" : "Selecionar todos"}
          </button>
        </div>

        {marcados.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1.5">
            <span className="px-1 text-xs font-semibold">{qtd(marcados.length)}</span>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!pausaveis.length || !!ocupado}
                onClick={() => acao("__massa", () => onPausar(pausaveis), `${qtd(pausaveis.length)} ${pausadosTxt(pausaveis.length)}`, true)}>
                <Pause size={12} /> Pausar
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!retomaveis.length || !!ocupado}
                onClick={() => acao("__massa", () => onRetomar(retomaveis), "De volta à fila (no fim)", true)}>
                <Play size={12} /> Retomar
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!moviveis.length || !!ocupado}
                onClick={() => acao("__massa", () => onMover(moviveis, "topo"), gen("Movidos para o topo da fila", "Movidas para o topo da fila"), true)}>
                <ArrowUpToLine size={12} /> Topo
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!moviveis.length || !!ocupado}
                onClick={() => acao("__massa", () => onMover(moviveis, "fim"), gen("Movidos para o fim da fila", "Movidas para o fim da fila"), true)}>
                <ArrowDownToLine size={12} /> Fim
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" disabled={!!ocupado}
                onClick={() => setConfirmarCancelar(marcados)}>
                <X size={12} /> Cancelar
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelecionados(new Set())} title="Limpar seleção" aria-label="Limpar seleção">
                <X size={13} />
              </Button>
            </div>
          </div>
        )}

        {/* Em andamento */}
        {andamento.map((l) => (
          <div key={l.id} className="flex items-center gap-3 rounded-lg border border-blue-500/40 bg-blue-500/5 px-3 py-2">
            <Caixa id={l.id} />
            <Loader2 size={16} className="shrink-0 animate-spin text-blue-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.titulo}</p>
              <p className="truncate text-[11px] text-muted-foreground">{[l.etapa, l.subtitulo].filter(Boolean).join(" · ")}</p>
              {l.progresso != null && <Progress value={Math.round(l.progresso * 100)} className="mt-1 h-1.5" />}
            </div>
            {!l.semPausa && (
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={ocupado === l.id}
                onClick={() => acao(l.id, () => onPausar([l.id]), gen("Pausado", "Pausada") + ": sai da vez até você retomar")}>
                {ocupado === l.id ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />} Pausar
              </Button>
            )}
            <BotaoCancelar id={l.id} />
          </div>
        ))}

        {/* Na fila */}
        {ordem.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Arraste pela alça (ou use as setas) para escolher a ordem. O de cima é o próximo.</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
              <SortableContext items={ordem} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {ordem.map((id, idx) => {
                    const l = porId.get(id);
                    if (!l) return null;
                    return (
                      <LinhaOrdenavel
                        key={id}
                        linha={l}
                        posicao={idx + 1}
                        caixa={<Caixa id={id} />}
                        cancelar={<BotaoCancelar id={id} />}
                        primeiro={idx === 0}
                        ultimo={idx === ordem.length - 1}
                        ocupado={ocupado === id}
                        onSubir={() => gravarOrdem(moverNaFila(ordem, id, -1))}
                        onDescer={() => gravarOrdem(moverNaFila(ordem, id, 1))}
                        onTopo={() => acao(id, () => onMover([id], "topo"), "Vai ser o próximo")}
                        onPausar={() => acao(id, () => onPausar([id]), gen("Pausado", "Pausada") + ": sai da vez até você retomar")}
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
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{gen("Pausados", "Pausadas")}</p>
            {pausados.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-1.5">
                <Caixa id={l.id} />
                <Pause size={14} className="shrink-0 text-violet-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{l.titulo}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{[l.subtitulo, "recomeça do zero ao retomar"].filter(Boolean).join(" · ")}</p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={ocupado === l.id}
                  onClick={() => acao(l.id, () => onRetomar([l.id]), "De volta à fila (no fim)")}>
                  {ocupado === l.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Retomar
                </Button>
                <BotaoCancelar id={l.id} />
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!confirmarCancelar} onOpenChange={(o) => { if (!o) setConfirmarCancelar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar {confirmarCancelar && confirmarCancelar.length > 1 ? qtd(confirmarCancelar.length) : `${gen("este", "esta")} ${nomeItem.singular}`}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sai da fila e é apagado de vez (se estiver rodando, para na hora). Não dá para desfazer — para só esperar, use Pausar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                const ids = confirmarCancelar ?? [];
                setConfirmarCancelar(null);
                acao("__massa", () => onCancelar(ids), ids.length > 1 ? `${qtd(ids.length)} ${gen("cancelados", "canceladas")}` : gen("Cancelado", "Cancelada"), true);
              }}
            >
              Cancelar de vez
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

interface LinhaOrdenavelProps {
  linha: LinhaDaFila;
  posicao: number;
  caixa: ReactNode;
  cancelar: ReactNode;
  primeiro: boolean;
  ultimo: boolean;
  ocupado: boolean;
  onSubir: () => void;
  onDescer: () => void;
  onTopo: () => void;
  onPausar: () => void;
}

function LinhaOrdenavel({ linha, posicao, caixa, cancelar, primeiro, ultimo, ocupado, onSubir, onDescer, onTopo, onPausar }: LinhaOrdenavelProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: linha.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5", isDragging && "relative z-10 shadow-lg ring-2 ring-primary/40")}
    >
      {caixa}
      <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing" title="Arraste para mudar a ordem">
        <GripVertical size={14} />
      </button>
      <Badge variant="secondary" className="numeric h-5 min-w-5 justify-center px-1.5 text-[10px]">{posicao}</Badge>
      {linha.cor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: linha.cor }} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{linha.titulo}</p>
        {linha.subtitulo && <p className="truncate text-[11px] text-muted-foreground">{linha.subtitulo}</p>}
      </div>
      <div className="flex shrink-0 items-center">
        {!primeiro && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onTopo} disabled={ocupado} title="Em seguida (vai para o topo)">
            <ChevronsUp size={14} />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSubir} disabled={primeiro || ocupado} title="Subir"><ArrowUp size={13} /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDescer} disabled={ultimo || ocupado} title="Descer"><ArrowDown size={13} /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPausar} disabled={ocupado} title="Pausar (sai da vez até você retomar)">
          {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />}
        </Button>
        {cancelar}
      </div>
    </div>
  );
}
