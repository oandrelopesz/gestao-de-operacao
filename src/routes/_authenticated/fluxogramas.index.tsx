import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, FolderInput, MoreVertical, Network, Pencil, Plus, Search, Square, SquareArrowOutUpRight, Tags, Trash2, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCachedState } from "@/lib/pageCache";
import { useBusca } from "@/lib/useBusca";
import { MensagemBusca } from "@/components/MensagemBusca";
import {
  EVENTO_FLUXO_SALVO, EVENTO_TEMAS_FLUXOS, criarFluxo, duplicarFluxo, excluirFluxo, fetchTemasFluxo, listarFluxos, moverFluxo, renomearFluxo,
  traduzErroFluxos, type FluxoResumo,
} from "@/lib/fluxosDados";
import type { Tema } from "@/components/temas/TemasLista";
import { TemasFluxoDialog } from "@/components/fluxos/TemasFluxo";

export const Route = createFileRoute("/_authenticated/fluxogramas/")({ component: FluxogramasPage });

const TODOS = "__todos__";
const SEM_TEMA = "__sem_tema__";
const SEM = "__sem__"; // valor do Select para "Sem tema"

const MODELOS = [
  { id: null, rotulo: "Em branco", detalhe: "Quadro livre", icone: <Square size={20} strokeWidth={1.75} /> },
  { id: "mapa-mental", rotulo: "Mapa mental", detalhe: "Ideia central e tópicos", icone: <Network size={20} strokeWidth={1.75} /> },
] as const;

function quando(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoje.toDateString()) return `Hoje, ${hora}`;
  if (d.toDateString() === ontem.toDateString()) return `Ontem, ${hora}`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: d.getFullYear() === hoje.getFullYear() ? undefined : "numeric" });
}

function FluxogramasPage() {
  const navigate = useNavigate();
  const [fluxos, setFluxos] = useCachedState<FluxoResumo[] | null>("fluxos.lista", null);
  const [temas, setTemas] = useCachedState<Tema[]>("fluxos.temas", []);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string>(TODOS);
  const [busca, setBusca] = useState("");
  const [temasAberto, setTemasAberto] = useState(false);
  const [novo, setNovo] = useState<{ titulo: string; tema_id: string | null; modelo: string | null } | null>(null);
  const [criando, setCriando] = useState(false);
  const [renomeando, setRenomeando] = useState<{ id: string; titulo: string } | null>(null);
  const [paraExcluir, setParaExcluir] = useState<FluxoResumo | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [f, t] = await Promise.all([listarFluxos(), fetchTemasFluxo()]);
      setFluxos(f);
      setTemas(t);
      setErro(null);
    } catch (e) {
      setErro(traduzErroFluxos(e));
      setFluxos((prev) => prev ?? []);
    }
  }, [setFluxos, setTemas]);

  useEffect(() => {
    carregar();
    window.addEventListener(EVENTO_TEMAS_FLUXOS, carregar);
    window.addEventListener(EVENTO_FLUXO_SALVO, carregar);
    return () => {
      window.removeEventListener(EVENTO_TEMAS_FLUXOS, carregar);
      window.removeEventListener(EVENTO_FLUXO_SALVO, carregar);
    };
  }, [carregar]);

  // Tema excluído enquanto estava filtrado: volta para Todos
  useEffect(() => {
    if (filtro !== TODOS && filtro !== SEM_TEMA && temas.length && !temas.some((t) => t.id === filtro)) setFiltro(TODOS);
  }, [temas, filtro]);

  const lista = useMemo(() => fluxos ?? [], [fluxos]);
  const temaDe = useMemo(() => new Map(temas.map((t) => [t.id, t])), [temas]);
  const contagem = useMemo(() => {
    const c: Record<string, number> = { [TODOS]: lista.length };
    for (const f of lista) {
      const k = f.tema_id && temaDe.has(f.tema_id) ? f.tema_id : SEM_TEMA;
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [lista, temaDe]);
  const doTema = useMemo(() => {
    return lista.filter((f) => filtro === TODOS || (filtro === SEM_TEMA ? !f.tema_id || !temaDe.has(f.tema_id) : f.tema_id === filtro));
  }, [lista, filtro, temaDe]);
  // Busca tolerante (sem acento, com erro de digitação) no título e nos textos dentro do quadro
  const resultadoBusca = useBusca(doTema, busca, (f) => [f.titulo, f.textos]);
  const visiveis = resultadoBusca.itens;
  const temaDoFiltro = filtro !== TODOS && filtro !== SEM_TEMA ? filtro : null;

  const criar = async () => {
    if (!novo || criando) return;
    setCriando(true);
    try {
      const f = await criarFluxo({ titulo: novo.titulo, tema_id: novo.tema_id, modelo: novo.modelo });
      setNovo(null);
      navigate({ to: "/fluxogramas/$id", params: { id: f.id } });
    } catch (e) {
      toast.error(traduzErroFluxos(e));
    } finally {
      setCriando(false);
    }
  };

  const renomear = async () => {
    if (!renomeando || ocupado) return;
    setOcupado(true);
    try {
      await renomearFluxo(renomeando.id, renomeando.titulo);
      setRenomeando(null);
      await carregar();
    } catch (e) {
      toast.error(traduzErroFluxos(e));
    } finally {
      setOcupado(false);
    }
  };

  const duplicar = async (f: FluxoResumo) => {
    const aviso = toast.loading("Duplicando o quadro…");
    try {
      await duplicarFluxo(f.id);
      toast.success("Quadro duplicado", { id: aviso });
      await carregar();
    } catch (e) {
      toast.error(traduzErroFluxos(e), { id: aviso });
    }
  };

  const mover = async (f: FluxoResumo, tema_id: string | null) => {
    try {
      await moverFluxo(f.id, tema_id);
      toast.success(`Movido para ${tema_id ? temaDe.get(tema_id)?.nome : "Sem tema"}`);
      await carregar();
    } catch (e) {
      toast.error(traduzErroFluxos(e));
    }
  };

  const excluir = async () => {
    if (!paraExcluir || ocupado) return;
    setOcupado(true);
    try {
      await excluirFluxo(paraExcluir.id);
      toast.success("Quadro excluído");
      setParaExcluir(null);
      await carregar();
    } catch (e) {
      toast.error(traduzErroFluxos(e));
    } finally {
      setOcupado(false);
    }
  };

  const filtros = [
    { id: TODOS, nome: "Todos", hex: null as string | null },
    ...temas.map((t) => ({ id: t.id, nome: t.nome, hex: t.hex })),
    ...(contagem[SEM_TEMA] ? [{ id: SEM_TEMA, nome: "Sem tema", hex: null }] : []),
  ];

  const abrirNovo = () => setNovo({ titulo: "", tema_id: temaDoFiltro, modelo: null });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <Workflow size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fluxogramas</h1>
            <p className="text-sm text-muted-foreground">Quadros infinitos para funis, fluxogramas, cards e mapas mentais</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setTemasAberto(true)}><Tags size={16} /> Temas</Button>
          <Button className="gap-2" onClick={abrirNovo}><Plus size={16} /> Novo quadro</Button>
        </div>
      </div>

      {erro && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{erro}</CardContent></Card>}

      <div className="relative w-full max-w-[280px]">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Buscar nos quadros…" className="h-9 pl-8 text-sm" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filtros.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filtro === f.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {f.hex && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.hex }} />}
            {f.nome}
            <span className="tabular-nums opacity-70">{contagem[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {fluxos !== null && resultadoBusca.modo === "parecidos" && <MensagemBusca resultado={resultadoBusca} className="-mb-2" />}
      {fluxos === null ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/3] rounded-xl" />)}
        </div>
      ) : visiveis.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Workflow size={26} /></span>
            {resultadoBusca.modo === "nenhum"
              ? <MensagemBusca resultado={resultadoBusca} className="text-base font-semibold text-foreground" />
              : <p className="text-base font-semibold">Nenhum quadro aqui ainda</p>}
            {resultadoBusca.modo !== "nenhum" && <Button className="mt-1 gap-2" onClick={abrirNovo}><Plus size={16} /> Novo quadro</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visiveis.map((f, i) => {
            const tema = f.tema_id ? temaDe.get(f.tema_id) : undefined;
            return (
              <div
                key={f.id}
                className="group relative overflow-hidden rounded-xl border bg-card animate-in fade-in slide-in-from-bottom-2 duration-300 transition-[box-shadow,border-color,translate] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                style={{ animationDelay: `${Math.min(i, 12) * 35}ms`, animationFillMode: "both", ...(tema ? { borderTopColor: tema.hex, borderTopWidth: 3 } : {}) }}
              >
                <Link to="/fluxogramas/$id" params={{ id: f.id }} className="block">
                  <div className="flex aspect-video items-center justify-center overflow-hidden border-b bg-muted/30">
                    {f.miniatura ? (
                      // Miniatura sempre clara; no tema escuro inverte como o próprio Excalidraw faz
                      <img src={f.miniatura} alt="" loading="lazy" className="h-full w-full object-contain p-2 transition-transform duration-500 ease-out group-hover:scale-[1.03] dark:[filter:invert(93%)_hue-rotate(180deg)]" />
                    ) : (
                      <Workflow size={28} className="text-muted-foreground/40 transition-transform duration-500 group-hover:scale-110" />
                    )}
                  </div>
                  <div className="p-3 pr-10">
                    <p className="truncate text-sm font-semibold">{f.titulo}</p>
                    <div className="mt-1.5 flex min-w-0 items-center gap-2">
                      {tema && (
                        <span className="inline-flex min-w-0 items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: `${tema.hex}1f`, color: tema.hex }}>
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tema.hex }} /> <span className="truncate">{tema.nome}</span>
                        </span>
                      )}
                      <span className="shrink-0 text-[10px] text-muted-foreground">{quando(f.updated_at)}</span>
                    </div>
                  </div>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="absolute bottom-3 right-2 h-7 w-7" aria-label={`Opções de ${f.titulo}`}>
                      <MoreVertical size={15} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem className="gap-2" onClick={() => navigate({ to: "/fluxogramas/$id", params: { id: f.id } })}>
                      <SquareArrowOutUpRight size={14} /> Abrir
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onClick={() => setRenomeando({ id: f.id, titulo: f.titulo })}>
                      <Pencil size={14} /> Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onClick={() => duplicar(f)}>
                      <Copy size={14} /> Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2"><FolderInput size={14} /> Mover para tema</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="max-h-80 w-52 overflow-y-auto">
                        {temas.map((t) => (
                          <DropdownMenuItem key={t.id} className="gap-2 text-xs" disabled={t.id === f.tema_id} onClick={() => mover(f, t.id)}>
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.hex }} /> {t.nome}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem className="gap-2 text-xs" disabled={!f.tema_id} onClick={() => mover(f, null)}>Sem tema</DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => setParaExcluir(f)}>
                      <Trash2 size={14} /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!novo} onOpenChange={(o) => { if (!o) setNovo(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Novo quadro</DialogTitle>
            <DialogDescription>Quadro infinito. Dá para mudar o nome e o tema depois.</DialogDescription>
          </DialogHeader>
          {novo && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); criar(); }}>
              <div className="grid grid-cols-2 gap-2">
                {MODELOS.map((m) => (
                  <button
                    key={m.rotulo}
                    type="button"
                    aria-pressed={novo.modelo === m.id}
                    onClick={() => setNovo({ ...novo, modelo: m.id })}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-center transition-all duration-200",
                      novo.modelo === m.id ? "border-primary bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {m.icone}
                    <span className="text-sm font-semibold">{m.rotulo}</span>
                    <span className="text-[11px] opacity-75">{m.detalhe}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="novo-quadro-nome">Nome</Label>
                <Input id="novo-quadro-nome" autoFocus placeholder="Sem título" value={novo.titulo}
                  onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tema</Label>
                <Select value={novo.tema_id ?? SEM} onValueChange={(v) => setNovo({ ...novo, tema_id: v === SEM ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>Sem tema</SelectItem>
                    {temas.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.hex }} /> {t.nome}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setNovo(null)}>Cancelar</Button>
                <Button type="submit" disabled={criando}>{criando ? "Criando…" : "Criar e abrir"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!renomeando} onOpenChange={(o) => { if (!o) setRenomeando(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Renomear quadro</DialogTitle>
          </DialogHeader>
          {renomeando && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); renomear(); }}>
              <Input autoFocus value={renomeando.titulo} aria-label="Nome do quadro" placeholder="Sem título"
                onChange={(e) => setRenomeando({ ...renomeando, titulo: e.target.value })} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRenomeando(null)}>Cancelar</Button>
                <Button type="submit" disabled={ocupado}>Salvar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!paraExcluir} onOpenChange={(o) => { if (!o) setParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o quadro e as imagens dele?</AlertDialogTitle>
            <AlertDialogDescription>
              "{paraExcluir?.titulo}" sai do sistema de vez, junto com as imagens coladas nele. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={ocupado}
              onClick={(e) => { e.preventDefault(); excluir(); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TemasFluxoDialog open={temasAberto} onOpenChange={setTemasAberto} />
    </div>
  );
}
