import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Bookmark, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { ColorPicker } from "@/components/admin/ColorPicker";
import {
  fetchTiposVerDepois, salvarTipoVerDepois, excluirTipoVerDepois, moverTipoVerDepois, iconeDoTipo,
  TIPO_OUTRO, VER_DEPOIS_CORES, type TipoVerDepois,
} from "@/lib/verDepoisTipos";

type TipoDialog = { id?: string; label: string; hex: string };

// Erro típico quando a migration do Admin por aba ainda não foi aplicada no banco
function traduzErro(e: any): string {
  const msg: string = e?.message || "";
  if (/ver_depois_tipos/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return "A tabela de tipos ainda não existe no banco. Rode supabase/migrations/20260924120000_admin_config.sql no SQL Editor.";
  }
  return msg || "Erro ao salvar tipo";
}

/** Card da seção "Ver depois" do Admin: tipos de link (nome, cor e ordem). */
export function VerDepoisTiposCard() {
  const [tipos, setTipos] = useState<TipoVerDepois[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [movendo, setMovendo] = useState(false);
  const [linksPorTipo, setLinksPorTipo] = useState<Record<string, number>>({});
  const [dialog, setDialog] = useState<TipoDialog | null>(null);
  const [toDelete, setToDelete] = useState<TipoVerDepois | null>(null);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    try {
      const [lista, { data: itens }] = await Promise.all([
        fetchTiposVerDepois(),
        supabase.from("ver_depois").select("tipo"),
      ]);
      setTipos(lista);
      const porTipo: Record<string, number> = {};
      (itens || []).forEach((i) => { porTipo[i.tipo] = (porTipo[i.tipo] || 0) + 1; });
      setLinksPorTipo(porTipo);
      setErro(null);
    } catch (e) {
      setErro(traduzErro(e));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!dialog) return;
    const label = dialog.label.trim();
    if (!label) {
      toast.error("Informe o nome do tipo");
      return;
    }
    if (tipos.some((t) => t.label.toLowerCase() === label.toLowerCase() && t.id !== dialog.id)) {
      toast.error("Já existe um tipo com esse nome");
      return;
    }
    setSaving(true);
    try {
      await salvarTipoVerDepois({ id: dialog.id, label, hex: dialog.hex });
      toast.success(dialog.id ? "Tipo atualizado" : "Tipo criado");
      setDialog(null);
      await carregar();
    } catch (e) {
      toast.error(traduzErro(e));
    } finally {
      setSaving(false);
    }
  };

  const mover = async (id: string, delta: -1 | 1) => {
    if (movendo) return;
    setMovendo(true);
    try {
      await moverTipoVerDepois(tipos, id, delta);
    } catch (e) {
      toast.error(traduzErro(e));
    }
    await carregar();
    setMovendo(false);
  };

  const excluir = async () => {
    if (!toDelete) return;
    setSaving(true);
    try {
      await excluirTipoVerDepois(toDelete.id);
      toast.success(`Tipo "${toDelete.label}" excluído`);
      setToDelete(null);
      await carregar();
    } catch (e) {
      toast.error(traduzErro(e));
    } finally {
      setSaving(false);
    }
  };

  const qtdExcluir = toDelete ? linksPorTipo[toDelete.id] || 0 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Bookmark size={18} /> Tipos de link</CardTitle>
          <CardDescription>Filtros e opções do campo "Tipo" na aba Ver depois, nesta ordem. A detecção automática pelo link continua usando YouTube, Reel e Post.</CardDescription>
        </div>
        <Button
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => setDialog({ label: "", hex: VER_DEPOIS_CORES[tipos.length % VER_DEPOIS_CORES.length] })}
        >
          <Plus size={14} /> Novo tipo
        </Button>
      </CardHeader>
      <CardContent>
        <div className="divide-y rounded-md border">
          {tipos.map((t, idx) => {
            const qtd = linksPorTipo[t.id] || 0;
            const fixo = t.id === TIPO_OUTRO;
            return (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2">
                <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: t.hex }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground shrink-0">{iconeDoTipo(t.id)}</span>
                    <span className="font-medium truncate">{t.label}</span>
                    {fixo && <Badge variant="outline" className="text-[10px]">Fixo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{qtd} {qtd === 1 ? "link" : "links"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={movendo || idx === 0} onClick={() => mover(t.id, -1)} title="Subir">
                    <ArrowUp size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={movendo || idx === tipos.length - 1} onClick={() => mover(t.id, 1)} title="Descer">
                    <ArrowDown size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialog({ id: t.id, label: t.label, hex: t.hex })} title="Editar">
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    disabled={fixo}
                    onClick={() => setToDelete(t)}
                    title={fixo ? "Recebe os links dos tipos excluídos" : "Excluir"}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
          {erro && (
            <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
              <p className="text-sm text-destructive">{erro}</p>
              <Button variant="outline" size="sm" onClick={() => { setCarregando(true); carregar(); }}>Tentar de novo</Button>
            </div>
          )}
          {!carregando && !erro && tipos.length === 0 && (
            <p className="px-3 py-6 text-sm text-muted-foreground text-center">Nenhum tipo. Clique em "Novo tipo" para criar o primeiro.</p>
          )}
        </div>
      </CardContent>

      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{dialog?.id ? "Editar tipo" : "Novo tipo"}</DialogTitle>
          </DialogHeader>
          {dialog && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
              <div className="space-y-2">
                <Label htmlFor="vd-tipo-nome">Nome</Label>
                <Input
                  id="vd-tipo-nome"
                  autoFocus
                  placeholder="Ex.: Podcast"
                  value={dialog.label}
                  onChange={(e) => setDialog({ ...dialog, label: e.target.value })}
                />
              </div>
              <ColorPicker colors={VER_DEPOIS_CORES} value={dialog.hex} onChange={(hex) => setDialog({ ...dialog, hex })} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Salvando..." : dialog.id ? "Salvar" : "Criar tipo"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo "{toDelete?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Os links deste tipo passam para 'Outro link'.
              {qtdExcluir > 0 && ` ${qtdExcluir} ${qtdExcluir === 1 ? "link será movido" : "links serão movidos"}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); excluir(); }} disabled={saving} className="bg-destructive hover:bg-destructive/90">
              {saving ? "Aguarde..." : "Excluir tipo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
