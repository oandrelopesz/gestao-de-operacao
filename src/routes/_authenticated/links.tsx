import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, CheckSquare, Copy, ExternalLink, FolderInput, Link2, Pencil, Plus, Search, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS } from "@/lib/data";
import {
  EVENTO_TEMAS_LINKS, atualizarLink, criarLink, excluirLinks, fetchLinks, fetchTemas, moverLinks, traduzErroLinks,
  type Link, type TemaLink,
} from "@/lib/links";
import { SEM_TEMA, TODOS, contarPorTema, dominio, filtrarLinks, normalizarUrl } from "@/lib/linksTexto";
import { TemasLinksDialog } from "@/components/links/TemasLinks";
import { MensagemBusca } from "@/components/MensagemBusca";

export const Route = createFileRoute("/_authenticated/links")({ component: LinksPage });

const SEM = "__sem__"; // valor do Select para "Sem tema"

type Edicao = { id?: string; nome: string; url: string; tema_id: string | null };

function LinksPage() {
  // Cache em memória: voltar para a aba mostra os links na hora e atualiza por trás
  const [links, setLinks] = useCachedState<Link[]>(CACHE_KEYS.links, []);
  const [temas, setTemas] = useCachedState<TemaLink[]>(CACHE_KEYS.linksTemas, []);
  const [carregando, setCarregando] = useState(!hasCached(CACHE_KEYS.links));
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string>(TODOS);
  const [busca, setBusca] = useState("");
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [temasAberto, setTemasAberto] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<string[] | null>(null);
  // Seleção em massa
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modoSelecao, setModoSelecao] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [l, t] = await Promise.all([fetchLinks(), fetchTemas()]);
      setLinks(l);
      setTemas(t);
      setErro(null);
    } catch (e) {
      setErro(traduzErroLinks(e));
    } finally {
      setCarregando(false);
    }
  }, [setLinks, setTemas]);

  useEffect(() => {
    carregar();
    window.addEventListener(EVENTO_TEMAS_LINKS, carregar);
    return () => window.removeEventListener(EVENTO_TEMAS_LINKS, carregar);
  }, [carregar]);

  // Tema excluído enquanto estava filtrado: volta para Todos
  useEffect(() => {
    if (filtro !== TODOS && filtro !== SEM_TEMA && temas.length && !temas.some((t) => t.id === filtro)) setFiltro(TODOS);
  }, [temas, filtro]);

  const temaDe = useMemo(() => new Map(temas.map((t) => [t.id, t])), [temas]);
  const contagem = useMemo(() => contarPorTema(links), [links]);
  // Busca tolerante (sem acento, com erro de digitação): o tema e a ordem alfabética valem antes
  const resultadoBusca = useMemo(() => filtrarLinks(links, filtro, busca), [links, filtro, busca]);
  const visiveis = resultadoBusca.itens;

  const selecaoAtiva = modoSelecao || selecionados.size > 0;
  const alternar = (id: string) => setSelecionados((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const limparSelecao = useCallback(() => { setSelecionados(new Set()); setModoSelecao(false); }, []);
  const idsSelecionados = links.filter((l) => selecionados.has(l.id)).map((l) => l.id);

  useEffect(() => {
    if (!selecaoAtiva) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"], [role="alertdialog"]')) limparSelecao();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [selecaoAtiva, limparSelecao]);

  const novo = () => setEdicao({ nome: "", url: "", tema_id: filtro !== TODOS && filtro !== SEM_TEMA ? filtro : null });

  const salvar = async () => {
    if (!edicao) return;
    const nome = edicao.nome.trim();
    const url = normalizarUrl(edicao.url);
    if (!nome) { toast.error("Dê um nome ao link"); return; }
    if (!url) { toast.error("Esse link não parece válido"); return; }
    setSalvando(true);
    try {
      if (edicao.id) await atualizarLink(edicao.id, { nome, url, tema_id: edicao.tema_id });
      else await criarLink({ nome, url, tema_id: edicao.tema_id });
      toast.success(edicao.id ? "Link atualizado" : "Link salvo");
      setEdicao(null);
      await carregar();
    } catch (e) {
      toast.error(traduzErroLinks(e));
    } finally {
      setSalvando(false);
    }
  };

  const mover = async (tema_id: string | null) => {
    const ids = idsSelecionados;
    try {
      await moverLinks(ids, tema_id);
      toast.success(`${ids.length} ${ids.length === 1 ? "link movido" : "links movidos"} para ${tema_id ? temaDe.get(tema_id)?.nome : "Sem tema"}`);
      limparSelecao();
      await carregar();
    } catch (e) {
      toast.error(traduzErroLinks(e));
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    try {
      await excluirLinks(paraExcluir);
      toast.success(paraExcluir.length === 1 ? "Link excluído" : `${paraExcluir.length} links excluídos`);
      setSelecionados((prev) => new Set([...prev].filter((id) => !paraExcluir.includes(id))));
      setParaExcluir(null);
      await carregar();
    } catch (e) {
      toast.error(traduzErroLinks(e));
    }
  };

  const copiar = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success("Link copiado"); } catch { toast.error("Não foi possível copiar"); }
  };

  const filtros = [
    { id: TODOS, nome: "Todos", hex: null as string | null },
    ...temas.map((t) => ({ id: t.id, nome: t.nome, hex: t.hex })),
    ...(contagem[SEM_TEMA] ? [{ id: SEM_TEMA, nome: "Sem tema", hex: null }] : []),
  ];

  return (
    <div className={cn("space-y-5", selecaoAtiva && "pb-20")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <Link2 size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Links</h1>
            <p className="text-sm text-muted-foreground">Seus links salvos, por tema</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setTemasAberto(true)}><Tags size={16} /> Temas</Button>
          <Button className="gap-2" onClick={novo}><Plus size={16} /> Novo link</Button>
        </div>
      </div>

      {erro && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{erro}</CardContent></Card>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[240px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar nome ou link..." className="h-9 pl-8 text-sm" value={busca} onChange={(e) => setBusca(e.target.value)} />
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

      {!carregando && resultadoBusca.modo === "parecidos" && <MensagemBusca resultado={resultadoBusca} className="-mb-2.5" />}
      {carregando ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : visiveis.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Link2 size={26} /></span>
            {resultadoBusca.modo === "nenhum" ? (
              <MensagemBusca resultado={resultadoBusca} className="text-base font-semibold text-foreground" />
            ) : (
              <p className="text-base font-semibold">{busca ? "Nenhum link encontrado" : "Nenhum link aqui ainda"}</p>
            )}
            {!busca && <Button className="mt-1 gap-2" onClick={novo}><Plus size={16} /> Novo link</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visiveis.map((l) => {
            const tema = l.tema_id ? temaDe.get(l.tema_id) : undefined;
            const marcado = selecionados.has(l.id);
            const dom = dominio(l.url);
            return (
              <div
                key={l.id}
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  if (modoSelecao || e.ctrlKey || e.metaKey) { alternar(l.id); return; }
                  window.open(l.url, "_blank", "noopener,noreferrer");
                }}
                onKeyDown={(e) => { if (e.key === "Enter") window.open(l.url, "_blank", "noopener,noreferrer"); }}
                className={cn(
                  "group relative cursor-pointer rounded-xl border bg-card p-3 transition-[box-shadow,border-color] hover:border-primary/40 hover:shadow-md",
                  marcado && "border-primary bg-primary/5 ring-2 ring-primary/50",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    aria-label={marcado ? "Desmarcar" : "Selecionar"}
                    onClick={(e) => { e.stopPropagation(); alternar(l.id); }}
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-opacity",
                      marcado ? "border-primary bg-primary text-primary-foreground" : cn("border-zinc-300 hover:border-primary dark:border-zinc-700", selecaoAtiva ? "opacity-100" : "opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100"),
                    )}
                  >
                    {marcado && <Check size={10} />}
                  </button>
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(dom)}&sz=64`}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-md bg-muted object-contain p-1"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" title={l.nome}>{l.nome}</p>
                    <p className="truncate text-xs text-muted-foreground" title={l.url}>{dom || l.url}</p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  {tema ? (
                    <span className="inline-flex max-w-[60%] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ backgroundColor: `${tema.hex}1f`, color: tema.hex }}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tema.hex }} /> <span className="truncate">{tema.nome}</span>
                    </span>
                  ) : <span className="text-[10px] text-muted-foreground">Sem tema</span>}
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Copiar link" onClick={() => copiar(l.url)}><Copy size={13} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => setEdicao({ id: l.id, nome: l.nome, url: l.url, tema_id: l.tema_id })}><Pencil size={13} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Excluir" onClick={() => setParaExcluir([l.id])}><Trash2 size={13} /></Button>
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
              {idsSelecionados.length ? `${idsSelecionados.length} ${idsSelecionados.length === 1 ? "selecionado" : "selecionados"}` : "Clique nos links para selecionar"}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {visiveis.some((l) => !selecionados.has(l.id)) && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelecionados(new Set([...selecionados, ...visiveis.map((l) => l.id)]))}>
                  Selecionar todos ({visiveis.length})
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

      <Dialog open={!!edicao} onOpenChange={(o) => { if (!o && !salvando) setEdicao(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle>{edicao?.id ? "Editar link" : "Novo link"}</DialogTitle></DialogHeader>
          {edicao && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
              <div className="space-y-2">
                <Label htmlFor="link-url">Link</Label>
                <Input id="link-url" autoFocus={!edicao.id} placeholder="https://..." value={edicao.url} autoComplete="off"
                  onChange={(e) => setEdicao({ ...edicao, url: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="link-nome">Nome</Label>
                <Input id="link-nome" placeholder="Ex.: Biblioteca de anúncios da Meta" value={edicao.nome} autoComplete="off"
                  onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Tema</Label>
                <Select value={edicao.tema_id ?? SEM} onValueChange={(v) => setEdicao({ ...edicao, tema_id: v === SEM ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Button type="button" variant="ghost" className="gap-1.5" asChild>
                    <a href={normalizarUrl(edicao.url) ?? "#"} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Abrir</a>
                  </Button>
                ) : <span />}
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEdicao(null)} disabled={salvando}>Cancelar</Button>
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
            <AlertDialogTitle>{paraExcluir?.length === 1 ? "Excluir este link?" : `Excluir ${paraExcluir?.length} links?`}</AlertDialogTitle>
            <AlertDialogDescription>Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); excluir(); }} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TemasLinksDialog open={temasAberto} onOpenChange={setTemasAberto} />
    </div>
  );
}
