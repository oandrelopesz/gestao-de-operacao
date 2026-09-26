import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Map as MapIcon, Plus, Route } from "lucide-react";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useSensoresArrastar } from "@/lib/arrastar";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { diasDeAtraso, formatarDataCurta, hojeBrasilia } from "@/lib/entrega";
import { ordemAlterada, ordenarPassos, ordenarPassosCronologico, passosEmConflito, proximoPasso, renumerar } from "@/lib/processos";
import {
  adicionarPasso,
  alternarConclusaoPasso,
  salvarOrdem,
  type Passo,
  type Processo,
  type RoadmapLigado,
} from "@/lib/processosService";
import { PassoPainel } from "./PassoPainel";
import { DatasInvertidasDialog } from "./DatasInvertidasDialog";
import { NovoPassoForm } from "./NovoPassoForm";

interface TrilhaProps {
  processo: Processo;
  /** Só no onboarding: roadmaps ligados a passos desta trilha. */
  roadmaps: RoadmapLigado[];
  somenteLeitura?: boolean;
  onMudou: () => void;
  onAbrirRoadmap?: (roadmapId: string) => void;
}

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao salvar");

type Estado = "concluido" | "atrasado" | "proximo" | "pendente";

/** Trilha horizontal de passos: nós ligados por linhas, com reordenação por arrastar, painel do passo e "+ passo". */
export function Trilha({ processo, roadmaps, somenteLeitura = false, onMudou, onAbrirRoadmap }: TrilhaProps) {
  // Cronológica: a data pode ter mudado pelo Kanban sem reordenar; a ordem persistida se ajusta no próximo gravarOrdem
  const ordenados = useMemo(() => ordenarPassosCronologico(processo.passos), [processo.passos]);

  // Ordem otimista: mostra a nova ordem enquanto grava/escolhe datas; volta ao banco quando o processo recarrega
  const [ordemLocal, setOrdemLocal] = useState<Passo[] | null>(null);
  useEffect(() => { setOrdemLocal(null); }, [processo.passos]);
  const passos = ordemLocal ?? ordenados;

  const [painelId, setPainelId] = useState<string | null>(null);
  const [alternando, setAlternando] = useState<Set<string>>(new Set());
  const [arrastando, setArrastando] = useState(false);
  const [conflito, setConflito] = useState<{ depois: Passo[]; ids: string[] } | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);

  const hoje = hojeBrasilia();
  const proximoId = proximoPasso(passos);
  const roadmapDoPasso = useCallback(
    (id: string) => roadmaps.find((r) => r.passo_onboarding_id === id) ?? null,
    [roadmaps],
  );
  const painelPasso = painelId ? processo.passos.find((p) => p.id === painelId) ?? null : null;

  // ------------------------------------------------------------ rolagem com bordas esmaecidas
  const scrollRef = useRef<HTMLDivElement>(null);
  const [bordas, setBordas] = useState({ esquerda: false, direita: false });
  const medir = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const esquerda = el.scrollLeft > 2;
    const direita = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setBordas((b) => (b.esquerda === esquerda && b.direita === direita ? b : { esquerda, direita }));
  }, []);
  useLayoutEffect(() => {
    medir();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [medir, passos.length]);

  // Ao abrir, centraliza o próximo passo se a trilha não cabe na tela
  const centralizado = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !proximoId || centralizado.current === processo.id) return;
    centralizado.current = processo.id;
    const no = el.querySelector<HTMLElement>(`[data-passo-id="${proximoId}"]`);
    if (no && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = Math.max(0, no.offsetLeft - el.clientWidth / 2 + no.offsetWidth / 2);
    }
  }, [processo.id, proximoId]);

  const mascara = bordas.esquerda || bordas.direita
    ? `linear-gradient(to right, ${bordas.esquerda ? "transparent" : "black"} 0, black 48px, black calc(100% - 48px), ${bordas.direita ? "transparent" : "black"} 100%)`
    : undefined;

  // ------------------------------------------------------------ ações
  const alternar = async (passo: Passo) => {
    if (somenteLeitura || alternando.has(passo.id)) return;
    const concluir = !passo.concluido_em;
    const roadmap = roadmapDoPasso(passo.id);
    if (concluir && processo.tipo === "onboarding" && roadmap && roadmap.progresso < 100) {
      toast.warning("O roadmap ligado ainda não está 100%");
    }
    setAlternando((s) => new Set(s).add(passo.id));
    try {
      await alternarConclusaoPasso(passo.id, concluir);
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setAlternando((s) => { const n = new Set(s); n.delete(passo.id); return n; });
      onMudou();
    }
  };

  const sensors = useSensoresArrastar(6);

  const gravarOrdem = async (lista: Passo[]) => {
    const final = renumerar(ordenarPassos(renumerar(lista)));
    setOrdemLocal(final);
    try {
      // Só quem mudou de ordem ou de data em relação ao que está gravado
      const alterados = ordemAlterada(processo.passos, final);
      if (alterados.length) await salvarOrdem(alterados);
    } catch (e) {
      toast.error(erroMsg(e));
      setOrdemLocal(null);
    } finally {
      onMudou();
    }
  };

  const aoSoltar = ({ active, over }: DragEndEvent) => {
    setArrastando(false);
    if (!over || active.id === over.id) return;
    const de = passos.findIndex((p) => p.id === active.id);
    const para = passos.findIndex((p) => p.id === over.id);
    if (de < 0 || para < 0) return;
    const depois = arrayMove(passos, de, para);
    const ids = passosEmConflito(depois, String(active.id));
    if (!ids.length) {
      void gravarOrdem(depois);
      return;
    }
    setOrdemLocal(depois);
    setConflito({ depois, ids });
  };

  const salvarDatas = async (datas: Record<string, string | null>) => {
    if (!conflito) return;
    const comDatas = conflito.depois.map((p) => (p.id in datas ? { ...p, data: datas[p.id] } : p));
    setConflito(null);
    await gravarOrdem(comDatas);
  };

  const cancelarDatas = () => {
    setConflito(null);
    setOrdemLocal(null);
  };

  const adicionar = async (i: { titulo: string; data: string | null; observacoes: string | null }) => {
    try {
      await adicionarPasso(processo, i);
      setNovoAberto(false);
      if (!i.data) toast.info("Passo sem data vai para o fim da trilha");
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      onMudou();
    }
  };

  // ------------------------------------------------------------ render
  const vazio = passos.length === 0;

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={medir}
        className="overflow-x-auto overflow-y-hidden pb-2 scroll-smooth"
        style={mascara ? { maskImage: mascara, WebkitMaskImage: mascara } : undefined}
      >
        <div className="flex w-max items-start px-2 pt-3">
          {vazio && (
            <div className="flex w-56 flex-col items-center gap-2 px-2 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground">
                <Route size={16} />
              </span>
              <p className="text-xs font-medium text-muted-foreground">Nenhum passo ainda</p>
              {!somenteLeitura && <p className="text-[11px] text-muted-foreground/80">Comece pelo "+ passo" ao lado.</p>}
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToHorizontalAxis]}
            onDragStart={() => setArrastando(true)}
            onDragCancel={() => setArrastando(false)}
            onDragEnd={aoSoltar}
          >
            <SortableContext items={passos.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
              {passos.map((passo, i) => {
                const seguinte = passos[i + 1];
                const estado: Estado = passo.concluido_em
                  ? "concluido"
                  : diasDeAtraso(passo.data, hoje) > 0
                    ? "atrasado"
                    : passo.id === proximoId
                      ? "proximo"
                      : "pendente";
                // Linha para o próximo nó (ou para o "+ passo" no fim)
                const temLinha = !!seguinte || (!somenteLeitura && !vazio);
                const linhaVerde = !!seguinte && !!passo.concluido_em && !!seguinte.concluido_em;
                const linhaTracejada = seguinte ? !seguinte.data : true;
                return (
                  <NoDaTrilha
                    key={passo.id}
                    passo={passo}
                    numero={i + 1}
                    estado={estado}
                    ehProximo={passo.id === proximoId}
                    atraso={estado === "atrasado" ? diasDeAtraso(passo.data, hoje) : 0}
                    roadmap={roadmapDoPasso(passo.id)}
                    linha={temLinha ? { verde: linhaVerde, tracejada: linhaTracejada } : null}
                    esconderLinha={arrastando}
                    somenteLeitura={somenteLeitura}
                    ocupado={alternando.has(passo.id)}
                    onAlternar={() => alternar(passo)}
                    onAbrir={() => setPainelId(passo.id)}
                    onAbrirRoadmap={onAbrirRoadmap}
                  />
                );
              })}
            </SortableContext>
          </DndContext>

          {!somenteLeitura && (
            <div className="flex w-32 shrink-0 flex-col items-center">
              <Popover open={novoAberto} onOpenChange={setNovoAberto}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="Adicionar passo"
                    className={cn(
                      "group/add flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground",
                      "transition-all duration-200 hover:scale-105 hover:border-primary hover:bg-primary/5 hover:text-primary",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      novoAberto && "border-primary bg-primary/5 text-primary",
                    )}
                  >
                    <Plus size={16} className="transition-transform duration-200 group-hover/add:rotate-90" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" side="bottom" className="w-72">
                  <NovoPassoForm onAdicionar={adicionar} />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => setNovoAberto(true)}
                className="mt-2 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                + passo
              </button>
            </div>
          )}
        </div>
      </div>

      <PassoPainel
        passo={painelPasso}
        tipo={processo.tipo}
        passos={processo.passos}
        roadmap={painelPasso ? roadmapDoPasso(painelPasso.id) : null}
        somenteLeitura={somenteLeitura}
        onClose={() => setPainelId(null)}
        onSalvo={onMudou}
        onAbrirRoadmap={onAbrirRoadmap}
      />

      <DatasInvertidasDialog
        aberto={!!conflito}
        passos={conflito?.depois ?? SEM_PASSOS}
        idsEmConflito={conflito?.ids ?? SEM_IDS}
        onSalvar={salvarDatas}
        onCancelar={cancelarDatas}
      />
    </div>
  );
}

const SEM_PASSOS: Passo[] = [];
const SEM_IDS: string[] = [];

// ---------------------------------------------------------------- nó

interface NoDaTrilhaProps {
  passo: Passo;
  numero: number;
  estado: Estado;
  ehProximo: boolean;
  atraso: number;
  roadmap: RoadmapLigado | null;
  linha: { verde: boolean; tracejada: boolean } | null;
  esconderLinha: boolean;
  somenteLeitura: boolean;
  ocupado: boolean;
  onAlternar: () => void;
  onAbrir: () => void;
  onAbrirRoadmap?: (roadmapId: string) => void;
}

function NoDaTrilha({
  passo, numero, estado, ehProximo, atraso, roadmap, linha, esconderLinha, somenteLeitura, ocupado, onAlternar, onAbrir, onAbrirRoadmap,
}: NoDaTrilhaProps) {
  // Sem `attributes` (role/tabIndex) de propósito: sem sensor de teclado, o wrapper não deve virar foco inútil.
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: passo.id,
    disabled: somenteLeitura,
  });

  const tituloNo = somenteLeitura
    ? undefined
    : estado === "concluido"
      ? "Desfazer conclusão"
      : "Concluir passo";

  return (
    <div
      ref={setNodeRef}
      data-passo-id={passo.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...(somenteLeitura ? {} : listeners)}
      className={cn(
        "group/no relative flex w-32 shrink-0 flex-col items-center outline-none",
        !somenteLeitura && "cursor-grab active:cursor-grabbing",
        isDragging && "z-20 opacity-90",
      )}
    >
      {/* Linha até o próximo nó (centro deste → centro do próximo, sem passar por baixo dos círculos) */}
      {linha && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-[calc(50%+24px)] top-5 w-[calc(100%-48px)] -translate-y-1/2 transition-opacity duration-150",
            linha.tracejada
              ? cn("h-0 border-t-2 border-dashed", linha.verde ? "border-emerald-500" : "border-muted-foreground/30")
              : cn("h-0.5 rounded-full", linha.verde ? "bg-emerald-500" : "bg-border"),
            esconderLinha && "opacity-0",
          )}
        />
      )}

      {/* Círculo */}
      <div className="relative">
        {ehProximo && estado !== "concluido" && (
          <span aria-hidden className="pointer-events-none absolute -inset-1.5 rounded-full bg-primary/20 animate-pulse-slow" />
        )}
        <button
          type="button"
          disabled={somenteLeitura || ocupado}
          title={tituloNo}
          aria-label={`${tituloNo ?? "Passo"}: ${passo.titulo}${atraso > 0 ? ` (atrasado há ${atraso} ${atraso === 1 ? "dia" : "dias"})` : ""}`}
          onClick={(e) => { e.stopPropagation(); onAlternar(); }}
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
            "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-default",
            !somenteLeitura && "cursor-pointer hover:scale-110",
            estado === "concluido" && "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30",
            estado === "atrasado" && "bg-red-500 text-white shadow-sm shadow-red-500/30",
            estado === "proximo" && "border-2 border-primary bg-background text-primary",
            estado === "pendente" && "border border-border bg-muted text-muted-foreground",
            ehProximo && estado !== "concluido" && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            ocupado && "opacity-60",
            isDragging && "scale-110 shadow-lg",
          )}
        >
          {estado === "concluido" ? (
            <Check size={18} strokeWidth={3} />
          ) : (
            <>
              <span className={cn(!somenteLeitura && estado !== "atrasado" && "group-hover/no:hidden")}>{numero}</span>
              {!somenteLeitura && estado !== "atrasado" && (
                <Check size={16} strokeWidth={2.5} className="hidden opacity-60 group-hover/no:block" />
              )}
            </>
          )}
        </button>
        {roadmap && (
          <span
            title={`Roadmap ligado: ${roadmap.nome}`}
            className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-primary shadow-xs"
          >
            <MapIcon size={9} strokeWidth={2.5} />
          </span>
        )}
      </div>

      {/* Texto abaixo do nó */}
      <div className="mt-2.5 flex w-[120px] flex-col items-center gap-0.5 text-center">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAbrir(); }}
          title={passo.titulo}
          className={cn(
            "line-clamp-2 w-full break-words rounded-sm text-xs font-medium leading-snug transition-colors",
            "hover:text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default",
            estado === "concluido" && "text-muted-foreground",
          )}
        >
          {passo.titulo}
        </button>
        {passo.data ? (
          <span
            title={atraso > 0 ? `Atrasado há ${atraso} ${atraso === 1 ? "dia" : "dias"}` : undefined}
            className={cn("text-[11px] tabular-nums text-muted-foreground", atraso > 0 && "font-medium text-red-600 dark:text-red-400")}
          >
            {formatarDataCurta(passo.data)}
            {atraso > 0 && ` · ${atraso}d atrasado`}
          </span>
        ) : (
          <span className="text-[11px] italic text-muted-foreground/70">sem data</span>
        )}
        {roadmap && (
          <button
            type="button"
            disabled={!onAbrirRoadmap}
            onClick={(e) => { e.stopPropagation(); if (onAbrirRoadmap) onAbrirRoadmap(roadmap.id); }}
            className={cn(
              "mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium transition-colors",
              roadmap.progresso >= 100
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-primary/10 text-primary",
              onAbrirRoadmap && "hover:bg-primary/20",
              "disabled:cursor-default",
            )}
          >
            <MapIcon size={10} /> Roadmap {roadmap.progresso}%
          </button>
        )}
      </div>
    </div>
  );
}
