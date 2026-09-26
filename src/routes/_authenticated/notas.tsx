import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, CheckSquare, Copy, FolderInput, Plus, Search, StickyNote, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCachedState } from "@/lib/pageCache";
import {
  EVENTO_TEMAS_NOTAS, atualizarNota, criarNota, excluirNotas, fetchNotas, fetchTemasNotas, moverNotas, removerImagensNotas, traduzErroNotas,
  type Nota,
} from "@/lib/notas";
import { SEM_TEMA, TODOS, contarPorTema, filtrarNotas, previaSemTitulo, tituloOuPrimeiraLinha } from "@/lib/notasTexto";
import { imagensRemovidas, primeiraImagem, type NoDoc } from "@/lib/notasDoc";
import { EditorNota } from "@/components/notas/EditorNota";
import type { Tema } from "@/components/temas/TemasLista";
import { TemasNotasDialog } from "@/components/notas/TemasNotas";

export const Route = createFileRoute("/_authenticated/notas")({ component: NotasPage });

const SEM = "__sem__"; // valor do Select para "Sem tema"

type Edicao = { id?: string; titulo: string; conteudo: string; tema_id: string | null; doc: NoDoc | null };

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

function NotasPage() {
  const [notas, setNotas] = useCachedState<Nota[] | null>("notas.lista", null);
  const [temas, setTemas] = useCachedState<Tema[]>("notas.temas", []);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string>(TODOS);
  const [busca, setBusca] = useState("");
  const [rapida, setRapida] = useState("");
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const original = useRef<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [temasAberto, setTemasAberto] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<string[] | null>(null);
  // Seleção em massa
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modoSelecao, setModoSelecao] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [n, t] = await Promise.all([fetchNotas(), fetchTemasNotas()]);
      setNotas(n);
      setTemas(t);
      setErro(null);
    } catch (e) {
      setErro(traduzErroNotas(e));
      setNotas((prev) => prev ?? []);
    }
  }, [setNotas, setTemas]);

  useEffect(() => {
    carregar();
    window.addEventListener(EVENTO_TEMAS_NOTAS, carregar);
    return () => window.removeEventListener(EVENTO_TEMAS_NOTAS, carregar);
  }, [carregar]);

  // Tema excluído enquanto estava filtrado: volta para Todas
  useEffect(() => {
    if (filtro !== TODOS && filtro !== SEM_TEMA && temas.length && !temas.some((t) => t.id === filtro)) setFiltro(TODOS);
  }, [temas, filtro]);

  const lista = useMemo(() => notas ?? [], [notas]);
  const temaDe = useMemo(() => new Map(temas.map((t) => [t.id, t])), [temas]);
  const contagem = useMemo(() => contarPorTema(lista), [lista]);
  const visiveis = useMemo(() => filtrarNotas(lista, filtro, busca), [lista, filtro, busca]);
  const temaDoFiltro = filtro !== TODOS && filtro !== SEM_TEMA ? filtro : null;

  const selecaoAtiva = modoSelecao || selecionados.size > 0;
  const alternar = (id: string) => setSelecionados((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const limparSelecao = useCallback(() => { setSelecionados(new Set()); setModoSelecao(false); }, []);
  const idsSelecionados = lista.filter((n) => selecionados.has(n.id)).map((n) => n.id);

  useEffect(() => {
    if (!selecaoAtiva) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"], [role="alertdialog"]')) limparSelecao();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [selecaoAtiva, limparSelecao]);

  const abrir = (e: Edicao) => { original.current = e; setEdicao(e); };
  const novo = () => abrir({ titulo: "", conteudo: "", tema_id: temaDoFiltro, doc: null });
  const abrirNota = (n: Nota) => abrir({ id: n.id, titulo: n.titulo, conteudo: n.conteudo, tema_id: n.tema_id, doc: n.doc });

  /** Imagens que entraram nesta edição e não vão ficar salvas (nota descartada): saem do armazenamento. */
  const limparImagensNovas = (e: Edicao | null) => {
    if (e) removerImagensNotas(imagensRemovidas(e.doc, original.current?.doc));
  };
  const descartar = () => {
    limparImagensNovas(edicao);
    setEdicao(null);
  };

  // Anotação rápida: Enter salva o texto como título, no tema do filtro
  const salvarRapida = async () => {
    const titulo = rapida.trim();
    if (!titulo) return;
    try {
      const nova = await criarNota({ titulo, conteudo: "", tema_id: temaDoFiltro });
      setNotas((prev) => [nova, ...(prev ?? [])]);
      setRapida("");
      toast.success("Nota salva");
    } catch (e) {
      toast.error(traduzErroNotas(e));
    }
  };

  const mudou = (e: Edicao) => {
    const o = original.current;
    return !o || e.titulo !== o.titulo || e.conteudo !== o.conteudo || e.tema_id !== o.tema_id || JSON.stringify(e.doc) !== JSON.stringify(o.doc);
  };

  /** Salva e fecha. `aoFechar`: fechou o popup sem clicar em Salvar (salva só se mudou algo). */
  const salvar = async (aoFechar = false) => {
    if (!edicao || salvando) return;
    const titulo = tituloOuPrimeiraLinha(edicao.titulo, edicao.conteudo);
    if (aoFechar && (!mudou(edicao) || (!edicao.id && !titulo))) { descartar(); return; }
    if (!titulo) { toast.error("Escreva um título ou algum texto"); return; }
    setSalvando(true);
    try {
      const campos = { titulo, conteudo: edicao.conteudo.replace(/\s+$/, ""), tema_id: edicao.tema_id, doc: edicao.doc };
      if (edicao.id) await atualizarNota(edicao.id, campos);
      else await criarNota(campos);
      // Imagens que estavam na nota e foram tiradas agora saem do armazenamento
      if (edicao.id) removerImagensNotas(imagensRemovidas(original.current?.doc, edicao.doc));
      toast.success(edicao.id ? "Nota atualizada" : "Nota salva");
      setEdicao(null);
      await carregar();
    } catch (e) {
      toast.error(traduzErroNotas(e));
    } finally {
      setSalvando(false);
    }
  };

  const mover = async (tema_id: string | null) => {
    const ids = idsSelecionados;
    try {
      await moverNotas(ids, tema_id);
      toast.success(`${ids.length} ${ids.length === 1 ? "nota movida" : "notas movidas"} para ${tema_id ? temaDe.get(tema_id)?.nome : "Sem tema"}`);
      limparSelecao();
      await carregar();
    } catch (e) {
      toast.error(traduzErroNotas(e));
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    try {
      await excluirNotas(paraExcluir);
      toast.success(paraExcluir.length === 1 ? "Nota excluída" : `${paraExcluir.length} notas excluídas`);
      setSelecionados((prev) => new Set([...prev].filter((id) => !paraExcluir.includes(id))));
      if (edicao?.id && paraExcluir.includes(edicao.id)) setEdicao(null);
      setParaExcluir(null);
      await carregar();
    } catch (e) {
      toast.error(traduzErroNotas(e));
    }
  };

  /** Copia com formatação (cola no Docs/e-mail com títulos, listas e links) e em texto puro. */
  const copiar = async (n: Pick<Nota, "titulo" | "conteudo" | "doc">) => {
    const texto = n.conteudo.trim() ? `${n.titulo}\n\n${n.conteudo}` : n.titulo;
    try {
      if (n.doc && typeof ClipboardItem !== "undefined") {
        const [{ generateHTML }, { extensoesNota }] = await Promise.all([import("@tiptap/core"), import("@/components/notas/extensoesNota")]);
        const titulo = document.createElement("h2");
        titulo.textContent = n.titulo;
        const html = `${titulo.outerHTML}${generateHTML(n.doc as Parameters<typeof generateHTML>[0], extensoesNota())}`;
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([texto], { type: "text/plain" }),
        })]);
      } else {
        await navigator.clipboard.writeText(texto);
      }
      toast.success("Nota copiada");
    } catch {
      try { await navigator.clipboard.writeText(texto); toast.success("Nota copiada (só o texto)"); } catch { toast.error("Não foi possível copiar"); }
    }
  };

  const filtros = [
    { id: TODOS, nome: "Todas", hex: null as string | null },
    ...temas.map((t) => ({ id: t.id, nome: t.nome, hex: t.hex })),
    ...(contagem[SEM_TEMA] ? [{ id: SEM_TEMA, nome: "Sem tema", hex: null }] : []),
  ];

  return (
    <div className={cn("space-y-5", selecaoAtiva && "pb-20")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <StickyNote size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notas</h1>
            <p className="text-sm text-muted-foreground">Anotações rápidas, por tema</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setTemasAberto(true)}><Tags size={16} /> Temas</Button>
          <Button className="gap-2" onClick={novo}><Plus size={16} /> Nova nota</Button>
        </div>
      </div>

      {erro && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{erro}</CardContent></Card>}

      <form className="relative" onSubmit={(e) => { e.preventDefault(); salvarRapida(); }}>
        <Plus className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={rapida}
          onChange={(e) => setRapida(e.target.value)}
          placeholder={`Anotação rápida… (Enter salva${temaDoFiltro ? ` em "${temaDe.get(temaDoFiltro)?.nome}"` : ""})`}
          className="h-10 pl-9"
          autoComplete="off"
        />
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[240px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar nas notas..." className="h-9 pl-8 text-sm" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Button size="sm" variant={selecaoAtiva ? "default" : "outline"} className="h-9 gap-1.5"
          onClick={() => (selecaoAtiva ? limparSelecao() : setModoSelecao(true))}>
          <CheckSquare size={14} /> {selecaoAtiva ? "Sair da seleção" : "Selecionar"}
        </Button>
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

      {notas === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : visiveis.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><StickyNote size={26} /></span>
            <p className="text-base font-semibold">{busca ? "Nenhuma nota encontrada" : "Nenhuma nota aqui ainda"}</p>
            {!busca && <Button className="mt-1 gap-2" onClick={novo}><Plus size={16} /> Nova nota</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visiveis.map((n) => {
            const tema = n.tema_id ? temaDe.get(n.tema_id) : undefined;
            const marcado = selecionados.has(n.id);
            const previa = previaSemTitulo(n.titulo, n.conteudo);
            const capa = primeiraImagem(n.doc);
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if (modoSelecao || e.ctrlKey || e.metaKey) { alternar(n.id); return; }
                  abrirNota(n);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") abrirNota(n); }}
                className={cn(
                  "group relative flex cursor-pointer flex-col rounded-xl border bg-card p-3 transition-[box-shadow,border-color] hover:border-primary/40 hover:shadow-md",
                  marcado && "border-primary bg-primary/5 ring-2 ring-primary/50",
                )}
                style={tema ? { borderTopColor: tema.hex, borderTopWidth: 3 } : undefined}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    aria-label={marcado ? "Desmarcar" : "Selecionar"}
                    onClick={(e) => { e.stopPropagation(); alternar(n.id); }}
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-opacity",
                      marcado ? "border-primary bg-primary text-primary-foreground" : cn("border-zinc-300 hover:border-primary dark:border-zinc-700", selecaoAtiva ? "opacity-100" : "opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100"),
                    )}
                  >
                    {marcado && <Check size={10} />}
                  </button>
                  <p className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug">{n.titulo}</p>
                </div>
                {capa && (
                  <img src={capa} alt="" loading="lazy" className="mt-2 h-28 w-full rounded-lg border object-cover" />
                )}
                {previa && (
                  <p className={cn("mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground", capa ? "line-clamp-3" : "line-clamp-6")}>{previa}</p>
                )}
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {tema ? (
                      <span className="inline-flex min-w-0 items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: `${tema.hex}1f`, color: tema.hex }}>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tema.hex }} /> <span className="truncate">{tema.nome}</span>
                      </span>
                    ) : null}
                    <span className="shrink-0 text-[10px] text-muted-foreground">{quando(n.updated_at)}</span>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Copiar" onClick={() => copiar(n)}><Copy size={13} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Excluir" onClick={() => setParaExcluir([n.id])}><Trash2 size={13} /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selecaoAtiva && (
        <div className="fixed bottom-5 left-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-xl">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <CheckSquare size={15} className="text-primary" />
              {idsSelecionados.length ? `${idsSelecionados.length} ${idsSelecionados.length === 1 ? "selecionada" : "selecionadas"}` : "Clique nas notas para selecionar"}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {visiveis.some((n) => !selecionados.has(n.id)) && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelecionados(new Set([...selecionados, ...visiveis.map((n) => n.id)]))}>
                  Selecionar todas ({visiveis.length})
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={!idsSelecionados.length}>
                    <FolderInput size={13} /> Mover para tema
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="max-h-80 w-56 overflow-y-auto">
                  <DropdownMenuLabel className="text-xs">Mover {idsSelecionados.length} para</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {temas.map((t) => (
                    <DropdownMenuItem key={t.id} className="gap-2 text-xs" onClick={() => mover(t.id)}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.hex }} /> {t.nome}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem className="gap-2 text-xs" onClick={() => mover(null)}>Sem tema</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive" disabled={!idsSelecionados.length}
                onClick={() => setParaExcluir(idsSelecionados)}>
                <Trash2 size={13} /> Excluir
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={limparSelecao} title="Sair da seleção (Esc)" aria-label="Sair da seleção">
                <X size={15} />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!edicao} onOpenChange={(o) => { if (!o) salvar(true); }}>
        <DialogContent className="flex h-[92vh] max-h-[92vh] flex-col gap-3 sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{edicao?.id ? "Editar nota" : "Nova nota"}</DialogTitle>
            <DialogDescription className="text-xs">Ctrl+Enter salva. Fechar também salva o que mudou. Cole prints com Ctrl+V.</DialogDescription>
          </DialogHeader>
          {edicao && (
            <form
              className="flex min-h-0 flex-1 flex-col gap-3"
              onSubmit={(e) => { e.preventDefault(); salvar(); }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar(); } }}
            >
              <Input autoFocus={!edicao.id} placeholder="Título" value={edicao.titulo} autoComplete="off" className="text-base font-semibold"
                onChange={(e) => setEdicao({ ...edicao, titulo: e.target.value })} />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
                <EditorNota
                  key={edicao.id ?? "nova"}
                  doc={edicao.doc}
                  textoAntigo={edicao.conteudo}
                  autoFocus={!!edicao.id}
                  onChange={(doc, texto) => setEdicao((atual) => (atual ? { ...atual, doc, conteudo: texto } : atual))}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={edicao.tema_id ?? SEM} onValueChange={(v) => setEdicao({ ...edicao, tema_id: v === SEM ? null : v })}>
                  <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {temas.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.hex }} />{t.nome}</span>
                      </SelectItem>
                    ))}
                    <SelectItem value={SEM}>Sem tema</SelectItem>
                  </SelectContent>
                </Select>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setTemasAberto(true)}>+ Criar ou editar temas</button>
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                {edicao.id ? (
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => copiar({ titulo: edicao.titulo, conteudo: edicao.conteudo, doc: edicao.doc })}>
                      <Copy size={14} /> Copiar
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => edicao.id && setParaExcluir([edicao.id])}>
                      <Trash2 size={14} /> Excluir
                    </Button>
                  </div>
                ) : <span />}
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={descartar} disabled={salvando}>Descartar</Button>
                  <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!paraExcluir} onOpenChange={(o) => { if (!o) setParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{paraExcluir?.length === 1 ? "Excluir esta nota?" : `Excluir ${paraExcluir?.length} notas?`}</AlertDialogTitle>
            <AlertDialogDescription>Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); excluir(); }} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TemasNotasDialog open={temasAberto} onOpenChange={setTemasAberto} />
    </div>
  );
}
