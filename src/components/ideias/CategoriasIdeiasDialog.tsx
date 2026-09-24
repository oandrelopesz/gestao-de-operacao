import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { ColorPicker } from "@/components/admin/ColorPicker";
import {
  fetchCategoriasIdeiasOuErro, criarCategoriaIdeia, atualizarCategoriaIdeia, excluirCategoriaIdeia, moverCategoriaIdeia,
  CORES_CATEGORIAS_IDEIAS, EVENTO_CATEGORIAS_IDEIAS, type CategoriaIdeia,
} from "@/lib/ideiasCategorias";

type CategoriaEdicao = { id?: string; label: string; hex: string };

// Erro típico quando a migration das categorias ainda não foi aplicada no banco
export function traduzErroCategoria(e: any): string {
  const msg: string = e?.message || "";
  if (/ideia_categorias/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return "A tabela de categorias ainda não existe no banco. Rode supabase/migrations/20260924130000_ideias_categorias.sql no SQL Editor.";
  }
  return msg || "Erro ao salvar categoria";
}

/** Lista para criar, renomear, trocar a cor, reordenar e excluir categorias de ideias (usada no dialog da aba e no Admin). */
export function CategoriasIdeiasLista() {
  const [categorias, setCategorias] = useState<CategoriaIdeia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ideiasPorCategoria, setIdeiasPorCategoria] = useState<Record<string, number>>({});
  const [edicao, setEdicao] = useState<CategoriaEdicao | null>(null);
  const [toDelete, setToDelete] = useState<CategoriaIdeia | null>(null);
  const [saving, setSaving] = useState(false);
  const [movendo, setMovendo] = useState(false);

  const carregar = async () => {
    try {
      const [lista, { data: itens }] = await Promise.all([
        fetchCategoriasIdeiasOuErro(),
        supabase.from("ideias").select("tipo"),
      ]);
      setCategorias(lista);
      const porCategoria: Record<string, number> = {};
      (itens || []).forEach((i) => { porCategoria[i.tipo] = (porCategoria[i.tipo] || 0) + 1; });
      setIdeiasPorCategoria(porCategoria);
    } catch (e) {
      toast.error(traduzErroCategoria(e));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    const ouvir = () => { carregar(); };
    window.addEventListener(EVENTO_CATEGORIAS_IDEIAS, ouvir);
    return () => window.removeEventListener(EVENTO_CATEGORIAS_IDEIAS, ouvir);
  }, []);

  const novaCategoria = (qtd: number) => ({ label: "", hex: CORES_CATEGORIAS_IDEIAS[qtd % CORES_CATEGORIAS_IDEIAS.length] });

  const salvar = async () => {
    if (!edicao) return;
    const label = edicao.label.trim();
    if (!label) {
      toast.error("Informe o nome da categoria");
      return;
    }
    if (categorias.some((c) => c.label.toLowerCase() === label.toLowerCase() && c.id !== edicao.id)) {
      toast.error("Já existe uma categoria com esse nome");
      return;
    }
    setSaving(true);
    try {
      if (edicao.id) await atualizarCategoriaIdeia(edicao.id, { label, hex: edicao.hex });
      else await criarCategoriaIdeia(label, edicao.hex);
      toast.success(edicao.id ? "Categoria atualizada" : "Categoria criada");
      setEdicao(null);
    } catch (e) {
      toast.error(traduzErroCategoria(e));
    } finally {
      setSaving(false);
    }
  };

  const mover = async (id: string, delta: -1 | 1) => {
    if (movendo) return; // ignora cliques enquanto um reorder anterior ainda está em andamento
    setMovendo(true);
    try {
      await moverCategoriaIdeia(categorias, id, delta);
    } catch (e) {
      toast.error(traduzErroCategoria(e));
      await carregar();
    } finally {
      setMovendo(false);
    }
  };

  const excluir = async () => {
    if (!toDelete) return;
    setSaving(true);
    try {
      await excluirCategoriaIdeia(toDelete.id);
      toast.success(`Categoria "${toDelete.label}" excluída`);
      setToDelete(null);
    } catch (e) {
      toast.error(traduzErroCategoria(e));
    } finally {
      setSaving(false);
    }
  };

  const qtdExcluir = toDelete ? ideiasPorCategoria[toDelete.id] || 0 : 0;
  const destinoExcluir = toDelete
    ? categorias.find((c) => c.id !== toDelete.id && !c.sistema)?.label
      || categorias.find((c) => c.sistema)?.label
      || "Para cliente"
    : "";

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-md border">
        {categorias.map((c, idx) => {
          const qtd = ideiasPorCategoria[c.id] || 0;
          return (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2">
              <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{c.label}</span>
                  {c.sistema && <Badge variant="outline" className="text-[10px]">Fixa</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{qtd} {qtd === 1 ? "ideia" : "ideias"}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0 || movendo} onClick={() => mover(c.id, -1)} title="Subir">
                  <ArrowUp size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === categorias.length - 1 || movendo} onClick={() => mover(c.id, 1)} title="Descer">
                  <ArrowDown size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEdicao({ id: c.id, label: c.label, hex: c.hex })} title="Editar">
                  <Pencil size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  disabled={c.sistema}
                  onClick={() => setToDelete(c)}
                  title={c.sistema ? "Categoria fixa: é ela que mostra os campos de agência e cliente" : "Excluir"}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          );
        })}
        {!carregando && categorias.length === 0 && (
          <p className="px-3 py-6 text-sm text-muted-foreground text-center">Nenhuma categoria. Clique em "Nova categoria" para criar a primeira.</p>
        )}
      </div>
      <Button size="sm" variant="outline" className="gap-2" onClick={() => setEdicao(novaCategoria(categorias.length))}>
        <Plus size={14} /> Nova categoria
      </Button>

      <Dialog open={!!edicao} onOpenChange={(o) => { if (!o) setEdicao(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{edicao?.id ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          </DialogHeader>
          {edicao && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); salvar(); }}>
              <div className="space-y-2">
                <Label htmlFor="ideia-cat-nome">Nome</Label>
                <Input
                  id="ideia-cat-nome"
                  autoFocus
                  placeholder="Ex.: Pessoal"
                  value={edicao.label}
                  onChange={(e) => setEdicao({ ...edicao, label: e.target.value })}
                />
              </div>
              <ColorPicker colors={CORES_CATEGORIAS_IDEIAS} value={edicao.hex} onChange={(hex) => setEdicao({ ...edicao, hex })} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEdicao(null)} disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Salvando..." : edicao.id ? "Salvar" : "Criar categoria"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria "{toDelete?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              As ideias desta categoria passam para "{destinoExcluir}".
              {qtdExcluir > 0 && ` ${qtdExcluir} ${qtdExcluir === 1 ? "ideia será movida" : "ideias serão movidas"}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); excluir(); }} disabled={saving} className="bg-destructive hover:bg-destructive/90">
              {saving ? "Aguarde..." : "Excluir categoria"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Dialog aberto pelo botão "+ Categoria" no topo da aba Ideias. */
export function CategoriasIdeiasDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categorias de ideias</DialogTitle>
          <DialogDescription>
            Filtros e opções do campo "Tipo" na aba Ideias, nesta ordem. "Para cliente" é fixa: é ela que mostra os campos de agência e cliente.
          </DialogDescription>
        </DialogHeader>
        {open && <CategoriasIdeiasLista />}
      </DialogContent>
    </Dialog>
  );
}
