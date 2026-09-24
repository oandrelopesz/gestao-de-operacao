import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ColorPicker } from "@/components/admin/ColorPicker";
import {
  CORES_TEMAS, EVENTO_TEMAS_LINKS, atualizarTema, criarTema, excluirTema, fetchLinks, fetchTemas, moverTema, traduzErroLinks,
  type TemaLink,
} from "@/lib/links";

type Edicao = { id?: string; nome: string; hex: string };

/** Criar, renomear, trocar a cor, reordenar e excluir temas de links (usada na aba Links e no Admin). */
export function TemasLinksLista() {
  const [temas, setTemas] = useState<TemaLink[]>([]);
  const [qtdPorTema, setQtdPorTema] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [toDelete, setToDelete] = useState<TemaLink | null>(null);
  const [saving, setSaving] = useState(false);
  const [movendo, setMovendo] = useState(false);

  const carregar = async () => {
    try {
      const [t, l] = await Promise.all([fetchTemas(), fetchLinks()]);
      setTemas(t);
      const qtd: Record<string, number> = {};
      l.forEach((x) => { if (x.tema_id) qtd[x.tema_id] = (qtd[x.tema_id] || 0) + 1; });
      setQtdPorTema(qtd);
    } catch (e) {
      toast.error(traduzErroLinks(e));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    const ouvir = () => { carregar(); };
    window.addEventListener(EVENTO_TEMAS_LINKS, ouvir);
    return () => window.removeEventListener(EVENTO_TEMAS_LINKS, ouvir);
  }, []);

  const salvar = async () => {
    if (!edicao) return;
    const nome = edicao.nome.trim();
    if (!nome) { toast.error("Informe o nome do tema"); return; }
    if (temas.some((t) => t.nome.toLowerCase() === nome.toLowerCase() && t.id !== edicao.id)) {
      toast.error("Já existe um tema com esse nome");
      return;
    }
    setSaving(true);
    try {
      if (edicao.id) await atualizarTema(edicao.id, { nome, hex: edicao.hex });
      else await criarTema(nome, edicao.hex);
      toast.success(edicao.id ? "Tema atualizado" : "Tema criado");
      setEdicao(null);
    } catch (e) {
      toast.error(traduzErroLinks(e));
    } finally {
      setSaving(false);
    }
  };

  const mover = async (id: string, delta: -1 | 1) => {
    if (movendo) return;
    setMovendo(true);
    try {
      await moverTema(temas, id, delta);
    } catch (e) {
      toast.error(traduzErroLinks(e));
      await carregar();
    } finally {
      setMovendo(false);
    }
  };

  const excluir = async () => {
    if (!toDelete) return;
    setSaving(true);
    try {
      await excluirTema(toDelete.id);
      toast.success(`Tema "${toDelete.nome}" excluído`);
      setToDelete(null);
    } catch (e) {
      toast.error(traduzErroLinks(e));
    } finally {
      setSaving(false);
    }
  };

  const qtdExcluir = toDelete ? qtdPorTema[toDelete.id] || 0 : 0;

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-md border">
        {temas.map((t, idx) => {
          const qtd = qtdPorTema[t.id] || 0;
          return (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: t.hex }} />
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.nome}</span>
                <p className="text-xs text-muted-foreground">{qtd} {qtd === 1 ? "link" : "links"}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0 || movendo} onClick={() => mover(t.id, -1)} title="Subir">
                  <ArrowUp size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === temas.length - 1 || movendo} onClick={() => mover(t.id, 1)} title="Descer">
                  <ArrowDown size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEdicao({ id: t.id, nome: t.nome, hex: t.hex })} title="Editar">
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setToDelete(t)} title="Excluir">
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          );
        })}
        {!carregando && temas.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum tema ainda. Clique em "Novo tema" para criar o primeiro.</p>
        )}
      </div>
      <Button size="sm" variant="outline" className="gap-2" onClick={() => setEdicao({ nome: "", hex: CORES_TEMAS[temas.length % CORES_TEMAS.length] })}>
        <Plus size={14} /> Novo tema
      </Button>

      <Dialog open={!!edicao} onOpenChange={(o) => { if (!o) setEdicao(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{edicao?.id ? "Editar tema" : "Novo tema"}</DialogTitle>
          </DialogHeader>
          {edicao && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); salvar(); }}>
              <div className="space-y-2">
                <Label htmlFor="tema-link-nome">Nome</Label>
                <Input id="tema-link-nome" autoFocus placeholder="Ex.: Ferramentas de IA" value={edicao.nome}
                  onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} />
              </div>
              <ColorPicker colors={CORES_TEMAS} value={edicao.hex} onChange={(hex) => setEdicao({ ...edicao, hex })} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEdicao(null)} disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Salvando..." : edicao.id ? "Salvar" : "Criar tema"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o tema "{toDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Os links continuam salvos, em "Sem tema".
              {qtdExcluir > 0 && ` ${qtdExcluir} ${qtdExcluir === 1 ? "link vai" : "links vão"} para lá.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); excluir(); }} disabled={saving} className="bg-destructive hover:bg-destructive/90">
              {saving ? "Aguarde..." : "Excluir tema"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Dialog do botão "Temas" na aba Links. */
export function TemasLinksDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Temas dos links</DialogTitle>
          <DialogDescription>Os filtros da aba Links, nesta ordem. Ao excluir um tema, os links dele ficam em "Sem tema".</DialogDescription>
        </DialogHeader>
        {open && <TemasLinksLista />}
      </DialogContent>
    </Dialog>
  );
}

/** Card da seção "Links" do Admin. */
export function LinksTemasCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Link2 size={18} /> Temas dos links</CardTitle>
        <CardDescription>Os filtros da aba Links, nesta ordem. Ao excluir um tema, os links dele ficam em "Sem tema".</CardDescription>
      </CardHeader>
      <CardContent>
        <TemasLinksLista />
      </CardContent>
    </Card>
  );
}
