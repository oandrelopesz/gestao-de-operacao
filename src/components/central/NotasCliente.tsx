// Notas rápidas dentro da pasta do cliente (senhas, links, acessos). Mesmo editor da aba Notas; ficam em `notas` com cliente_id.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  atualizarNota, criarNota, excluirNotas, fetchNotasCliente, removerImagensNotas, traduzErroNotas, type Nota,
} from "@/lib/notas";
import { imagensRemovidas, type NoDoc } from "@/lib/notasDoc";
import { previaSemTitulo, tituloOuPrimeiraLinha } from "@/lib/notasTexto";

const EditorNota = lazy(() => import("@/components/notas/EditorNota").then((m) => ({ default: m.EditorNota })));

type Edicao = { id?: string; titulo: string; conteudo: string; doc: NoDoc | null };

export function NotasCliente({ clienteId }: { clienteId: string }) {
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const original = useRef<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setNotas(await fetchNotasCliente(clienteId));
      setErro(null);
    } catch (e) {
      setErro(traduzErroNotas(e));
      setNotas((p) => p ?? []);
    }
  }, [clienteId]);
  useEffect(() => { setNotas(null); void carregar(); }, [carregar]);

  const abrir = (e: Edicao) => { original.current = e; setEdicao(e); };
  const abrirNota = (n: Nota) => abrir({ id: n.id, titulo: n.titulo, conteudo: n.conteudo, doc: n.doc });
  const descartar = () => {
    if (edicao) void removerImagensNotas(imagensRemovidas(edicao.doc, original.current?.doc));
    setEdicao(null);
  };

  /** `aoFechar`: fechou o popup sem clicar em Salvar (salva só se mudou algo). */
  const salvar = async (aoFechar = false) => {
    if (!edicao || salvando) return;
    const o = original.current;
    const mudou = !o || edicao.titulo !== o.titulo || edicao.conteudo !== o.conteudo || JSON.stringify(edicao.doc) !== JSON.stringify(o.doc);
    const titulo = tituloOuPrimeiraLinha(edicao.titulo, edicao.conteudo);
    if (aoFechar && (!mudou || (!edicao.id && !titulo))) { descartar(); return; }
    if (!titulo) { toast.error("Escreva um título ou algum texto"); return; }
    setSalvando(true);
    try {
      const campos = { titulo, conteudo: edicao.conteudo.replace(/\s+$/, ""), tema_id: null, doc: edicao.doc, cliente_id: clienteId };
      if (edicao.id) {
        await atualizarNota(edicao.id, campos);
        void removerImagensNotas(imagensRemovidas(o?.doc, edicao.doc));
      } else await criarNota(campos);
      toast.success("Nota salva");
      setEdicao(null);
      await carregar();
    } catch (e) {
      toast.error(traduzErroNotas(e));
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExcluir = async () => {
    const id = excluir;
    setExcluir(null);
    if (!id) return;
    try {
      await excluirNotas([id]);
      if (edicao?.id === id) setEdicao(null);
      await carregar();
    } catch (e) {
      toast.error(traduzErroNotas(e));
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold flex items-center gap-2"><StickyNote size={18} /> Notas</h2>
        <Button size="sm" onClick={() => abrir({ titulo: "", conteudo: "", doc: null })}><Plus size={16} className="mr-1" />Nova nota</Button>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {notas === null && <Loader2 className="animate-spin text-muted-foreground" />}
      {notas && notas.length === 0 && !erro && (
        <p className="text-sm text-muted-foreground">Nenhuma nota. Use para guardar senhas, links e acessos deste cliente.</p>
      )}
      {notas && notas.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {notas.map((n) => (
            <Card key={n.id} role="button" tabIndex={0} className="cursor-pointer hover:bg-accent transition-colors"
              onClick={() => abrirNota(n)} onKeyDown={(e) => { if (e.key === "Enter") abrirNota(n); }}>
              <CardContent className="p-3 space-y-1">
                <p className="text-sm font-semibold break-words">{n.titulo}</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words line-clamp-5">{previaSemTitulo(n.titulo, n.conteudo)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!edicao} onOpenChange={(o) => { if (!o) void salvar(true); }}>
        <DialogContent className="flex h-[92vh] max-h-[92vh] flex-col gap-3 sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{edicao?.id ? "Editar nota" : "Nova nota"}</DialogTitle>
            <DialogDescription className="text-xs">Ctrl+Enter salva. Fechar também salva o que mudou. Cole prints com Ctrl+V.</DialogDescription>
          </DialogHeader>
          {edicao && (
            <form
              className="flex min-h-0 flex-1 flex-col gap-3"
              onSubmit={(e) => { e.preventDefault(); void salvar(); }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void salvar(); } }}
            >
              <Input autoFocus={!edicao.id} placeholder="Título" value={edicao.titulo} autoComplete="off" className="text-base font-semibold"
                onChange={(e) => setEdicao({ ...edicao, titulo: e.target.value })} />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
                <Suspense fallback={<div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground"><Loader2 size={16} className="mr-2 animate-spin" /> Abrindo o editor…</div>}>
                  <EditorNota
                    key={edicao.id ?? "nova"}
                    doc={edicao.doc}
                    textoAntigo={edicao.conteudo}
                    autoFocus={!!edicao.id}
                    onChange={(doc, texto) => setEdicao((a) => (a ? { ...a, doc, conteudo: texto } : a))}
                  />
                </Suspense>
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                {edicao.id ? (
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setExcluir(edicao.id ?? null)}>
                    <Trash2 size={14} /> Excluir
                  </Button>
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

      <AlertDialog open={!!excluir} onOpenChange={(o) => { if (!o) setExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta nota?</AlertDialogTitle>
            <AlertDialogDescription>Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmarExcluir(); }} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
