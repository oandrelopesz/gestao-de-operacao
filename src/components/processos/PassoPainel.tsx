import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Check, Info, Loader2, Map as MapIcon, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useConfig } from "@/lib/appConfig";
import { diasDeAtraso, formatarDataCurta, hojeBrasilia } from "@/lib/entrega";
import { ordenarPassos, posicaoParaNovoPasso, renumerar, type TipoProcesso } from "@/lib/processos";
import {
  alternarConclusaoPasso,
  atualizarPasso,
  excluirPasso,
  salvarOrdem,
  type Passo,
  type RoadmapLigado,
} from "@/lib/processosService";

interface PassoPainelProps {
  passo: Passo | null;
  tipo: TipoProcesso;
  roadmap: RoadmapLigado | null;
  /** Todos os passos do processo: usados para reposicionar o passo quando a data muda. */
  passos?: Passo[];
  somenteLeitura?: boolean;
  onClose: () => void;
  onSalvo: () => void;
  onAbrirRoadmap?: (roadmapId: string) => void;
}

type Patch = { titulo?: string; data?: string | null; observacoes?: string | null };

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao salvar");

/** Painel lateral de um passo da trilha: título, data, observações, status, roadmap ligado e excluir. */
export function PassoPainel({ passo: passoProp, tipo, roadmap, passos, somenteLeitura, onClose, onSalvo, onAbrirRoadmap }: PassoPainelProps) {
  const [janelaDias] = useConfig<number>("onboarding_janela_dias", 2);
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [alternando, setAlternando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  // Mantém o último passo para o conteúdo continuar na tela durante a animação de saída
  const ultimoPasso = useRef<Passo | null>(passoProp);
  if (passoProp) ultimoPasso.current = passoProp;
  const passo = passoProp ?? ultimoPasso.current;

  // Últimos valores gravados (para comparar e não gravar duas vezes o mesmo campo)
  const gravado = useRef<{ titulo: string; data: string | null; observacoes: string | null }>({ titulo: "", data: null, observacoes: null });
  const dataRef = useRef<HTMLInputElement>(null);

  // Recarrega os campos só ao trocar de passo (não a cada recarga, para não atropelar o que está sendo digitado)
  useEffect(() => {
    if (!passoProp) return;
    setTitulo(passoProp.titulo);
    setData(passoProp.data ?? "");
    setObservacoes(passoProp.observacoes ?? "");
    gravado.current = { titulo: passoProp.titulo, data: passoProp.data, observacoes: passoProp.observacoes ?? null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passoProp?.id]);

  // A data pode mudar por fora (popup de datas ao arrastar): acompanha o valor gravado
  useEffect(() => {
    if (!passoProp) return;
    setData(passoProp.data ?? "");
    gravado.current = { ...gravado.current, data: passoProp.data };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passoProp?.data]);

  /** Tira o passo da lista normalizada e o recoloca na posição cronológica da nova data (sem data → fim). */
  const reposicionar = async (id: string, novaData: string | null) => {
    if (!passos?.length) return;
    const atual = passos.find((p) => p.id === id);
    if (!atual) return;
    const outros = renumerar(ordenarPassos(passos.filter((p) => p.id !== id)));
    const lista = [...outros];
    lista.splice(posicaoParaNovoPasso(outros, novaData), 0, { ...atual, data: novaData });
    await salvarOrdem(renumerar(lista).map((p) => ({ id: p.id, ordem: p.ordem })));
  };

  const gravar = async (patch: Patch) => {
    if (!passo || !Object.keys(patch).length) return;
    const id = passo.id;
    const antes = gravado.current;
    gravado.current = { ...gravado.current, ...patch } as typeof gravado.current;
    try {
      await atualizarPasso(id, patch);
      if ("data" in patch) await reposicionar(id, patch.data ?? null);
    } catch (e) {
      gravado.current = antes;
      toast.error(erroMsg(e));
    } finally {
      onSalvo();
    }
  };

  /** Mudanças ainda não gravadas (data vazia ou incompleta nunca apaga a data: só o "Limpar" apaga). */
  const pendencias = (): Patch => {
    const patch: Patch = {};
    const t = titulo.trim();
    if (t && t !== gravado.current.titulo) patch.titulo = t;
    const o = observacoes.trim() || null;
    if (o !== gravado.current.observacoes) patch.observacoes = o;
    if (data && !dataRef.current?.validity.badInput && data !== gravado.current.data) patch.data = data;
    return patch;
  };

  const salvarTitulo = () => {
    if (!titulo.trim()) { setTitulo(gravado.current.titulo); return; }
    const { titulo: t } = pendencias();
    if (t) void gravar({ titulo: t });
  };
  const salvarObservacoes = () => {
    const p = pendencias();
    if ("observacoes" in p) void gravar({ observacoes: p.observacoes });
  };
  const salvarData = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.validity.badInput || !e.target.value) {
      // Data digitada pela metade ou apagada no teclado: volta para a gravada (apagar é pelo "Limpar")
      setData(gravado.current.data ?? "");
      return;
    }
    if (e.target.value !== gravado.current.data) void gravar({ data: e.target.value });
  };
  const limparData = () => {
    setData("");
    if (gravado.current.data !== null) void gravar({ data: null });
  };

  /** Fechar (Esc, clique fora, X): grava o que ainda estava em edição antes de desmontar. */
  const fechar = () => {
    if (!somenteLeitura) {
      const patch = pendencias();
      if (Object.keys(patch).length) void gravar(patch);
    }
    onClose();
  };

  const alternar = async () => {
    if (!passo || alternando) return;
    const concluir = !passo.concluido_em;
    if (concluir && tipo === "onboarding" && roadmap && roadmap.progresso < 100) {
      toast.warning("O roadmap ligado ainda não está 100%");
    }
    setAlternando(true);
    try {
      await alternarConclusaoPasso(passo.id, concluir);
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setAlternando(false);
      onSalvo();
    }
  };

  const excluir = async () => {
    if (!passo) return;
    setExcluindo(true);
    try {
      await excluirPasso(passo.id);
      toast.success(`"${passo.titulo}" excluído`);
      onClose();
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setExcluindo(false);
      setConfirmarExclusao(false);
      onSalvo();
    }
  };

  const concluido = !!passo?.concluido_em;
  const atraso = passo && !concluido ? diasDeAtraso(passo.data, hojeBrasilia()) : 0;
  const concluidoEm = passo?.concluido_em ? formatarDataCurta(hojeBrasilia(new Date(passo.concluido_em))) : null;

  return (
    <>
      <Sheet open={!!passoProp} onOpenChange={(o) => { if (!o) fechar(); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto p-0 gap-0">
          {passo && (
            <div className="flex min-h-full flex-col">
              <SheetHeader className="space-y-1 border-b border-border/70 px-6 pb-4 pt-6 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Passo do {tipo === "onboarding" ? "onboarding" : "roadmap"}
                </p>
                <SheetTitle className="text-lg leading-snug break-words">{passo.titulo}</SheetTitle>
                <SheetDescription className="sr-only">Detalhes e edição do passo</SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-6 px-6 py-5">
                {/* Status */}
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                    concluido
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : atraso > 0
                        ? "border-red-500/30 bg-red-500/5"
                        : "border-border/70 bg-muted/30",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        concluido ? "bg-emerald-500 text-white" : atraso > 0 ? "bg-red-500 text-white" : "border border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {concluido ? <Check size={14} strokeWidth={3} /> : <CalendarDays size={13} />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {concluido ? `Concluído em ${concluidoEm}` : atraso > 0 ? `Atrasado há ${atraso} ${atraso === 1 ? "dia" : "dias"}` : "Pendente"}
                      </p>
                    </div>
                  </div>
                  {!somenteLeitura && (
                    <Button
                      size="sm"
                      variant={concluido ? "outline" : "default"}
                      className={cn("h-8 shrink-0 gap-1.5", !concluido && "bg-emerald-600 hover:bg-emerald-600/90 text-white")}
                      onClick={alternar}
                      disabled={alternando}
                    >
                      {alternando ? <Loader2 size={14} className="animate-spin" /> : concluido ? <RotateCcw size={14} /> : <Check size={14} />}
                      {concluido ? "Desfazer" : "Concluir"}
                    </Button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="passo-titulo" className="text-xs">Título</Label>
                  <Input
                    id="passo-titulo"
                    value={titulo}
                    disabled={somenteLeitura}
                    onChange={(e) => setTitulo(e.target.value)}
                    onBlur={salvarTitulo}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="passo-data" className="text-xs">Data</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id="passo-data"
                      ref={dataRef}
                      type="date"
                      value={data}
                      disabled={somenteLeitura}
                      onChange={(e) => setData(e.target.value)}
                      onBlur={salvarData}
                    />
                    {!somenteLeitura && data && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 shrink-0 px-2.5 text-xs"
                        // Evita que o campo perca o foco (e grave pelo blur) antes do clique
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={limparData}
                      >
                        Limpar
                      </Button>
                    )}
                  </div>
                  {!data && <p className="text-[11px] italic text-muted-foreground">Sem data: o passo fica no fim da trilha.</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="passo-obs" className="text-xs">Observações</Label>
                  <Textarea
                    id="passo-obs"
                    value={observacoes}
                    disabled={somenteLeitura}
                    onChange={(e) => setObservacoes(e.target.value)}
                    onBlur={salvarObservacoes}
                    rows={5}
                    placeholder={somenteLeitura ? "" : "Anotações, links, combinados…"}
                    className="resize-y text-sm"
                  />
                </div>

                {tipo === "onboarding" && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Roadmap ligado</p>
                    {roadmap ? (
                      <div className="rounded-lg border border-border/70 bg-card p-3 space-y-2.5 shadow-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                            <MapIcon size={14} className="shrink-0 text-primary" />
                            <span className="truncate">{roadmap.nome}</span>
                          </span>
                          <span className={cn("text-xs font-semibold tabular-nums", roadmap.progresso >= 100 ? "text-emerald-600" : "text-muted-foreground")}>
                            {roadmap.progresso}%
                          </span>
                        </div>
                        <Progress value={roadmap.progresso} className="h-1.5" />
                        {onAbrirRoadmap && (
                          <Button variant="outline" size="sm" className="h-8 w-full gap-1.5" onClick={() => onAbrirRoadmap(roadmap.id)}>
                            <MapIcon size={14} /> Abrir roadmap
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                        Nenhum roadmap ligado — crie na aba Roadmap
                      </p>
                    )}
                  </div>
                )}

                {tipo === "onboarding" && (
                  <p className="flex items-start gap-2 rounded-md bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    <Info size={13} className="mt-px shrink-0 text-primary" />
                    Passos com data entram em Demandas quando faltarem até {janelaDias} {janelaDias === 1 ? "dia" : "dias"}.
                  </p>
                )}
              </div>

              {!somenteLeitura && (
                <div className="border-t border-border/70 px-6 py-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmarExclusao(true)}
                  >
                    <Trash2 size={14} /> Excluir passo
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmarExclusao} onOpenChange={(o) => { if (!o && !excluindo) setConfirmarExclusao(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{passo?.titulo}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O passo sai da trilha. {tipo === "onboarding" ? "Se ele já virou demanda e ainda não foi feita, ela também sai do Kanban." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); excluir(); }}
              disabled={excluindo}
              className="bg-destructive hover:bg-destructive/90"
            >
              {excluindo && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
