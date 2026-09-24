import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ColorPicker } from "@/components/admin/ColorPicker";

export interface Tema { id: string; nome: string; hex: string; ordem: number }

/** O que o gerenciador precisa de cada aba com temas (Links, Notas…). */
export interface ApiTemas {
  /** Evento de janela disparado a cada mudança nos temas */
  evento: string;
  item: { singular: string; plural: string; feminino?: boolean };
  exemplo: string;
  traduzErro: (e: unknown) => string;
  fetchTemas: () => Promise<Tema[]>;
  /** Quantos itens por tema (id → quantidade) */
  contar: () => Promise<Record<string, number>>;
  criar: (nome: string, hex: string) => Promise<unknown>;
  atualizar: (id: string, campos: { nome: string; hex: string }) => Promise<void>;
  excluir: (id: string) => Promise<void>;
  mover: (lista: Tema[], id: string, delta: -1 | 1) => Promise<void>;
}

export const CORES_TEMAS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#a855f7", "#ec4899", "#64748b",
];

type Edicao = { id?: string; nome: string; hex: string };

/** Criar, renomear, trocar a cor, reordenar e excluir temas (usada nas abas e no Admin). */
export function TemasLista({ api }: { api: ApiTemas }) {
  const [temas, setTemas] = useState<Tema[]>([]);
  const [qtdPorTema, setQtdPorTema] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [toDelete, setToDelete] = useState<Tema | null>(null);
  const [saving, setSaving] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const { singular, plural } = api.item;

  useEffect(() => {
    const carregar = async () => {
      try {
        const [t, qtd] = await Promise.all([api.fetchTemas(), api.contar()]);
        setTemas(t);
        setQtdPorTema(qtd);
      } catch (e) {
        toast.error(api.traduzErro(e));
      } finally {
        setCarregando(false);
      }
    };
    carregar();
    window.addEventListener(api.evento, carregar);
    return () => window.removeEventListener(api.evento, carregar);
  }, [api]);

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
      if (edicao.id) await api.atualizar(edicao.id, { nome, hex: edicao.hex });
      else await api.criar(nome, edicao.hex);
      toast.success(edicao.id ? "Tema atualizado" : "Tema criado");
      setEdicao(null);
    } catch (e) {
      toast.error(api.traduzErro(e));
    } finally {
      setSaving(false);
    }
  };

  const mover = async (id: string, delta: -1 | 1) => {
    if (movendo) return;
    setMovendo(true);
    try {
      await api.mover(temas, id, delta);
    } catch (e) {
      toast.error(api.traduzErro(e));
      window.dispatchEvent(new Event(api.evento));
    } finally {
      setMovendo(false);
    }
  };

  const excluir = async () => {
    if (!toDelete) return;
    setSaving(true);
    try {
      await api.excluir(toDelete.id);
      toast.success(`Tema "${toDelete.nome}" excluído`);
      setToDelete(null);
    } catch (e) {
      toast.error(api.traduzErro(e));
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
                <p className="text-xs text-muted-foreground">{qtd} {qtd === 1 ? singular : plural}</p>
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
            <DialogDescription className="sr-only">Nome e cor do tema</DialogDescription>
          </DialogHeader>
          {edicao && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); salvar(); }}>
              <div className="space-y-2">
                <Label htmlFor="tema-nome">Nome</Label>
                <Input id="tema-nome" autoFocus autoComplete="off" placeholder={api.exemplo} value={edicao.nome}
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
              {api.item.feminino ? `As ${plural} continuam salvas, em "Sem tema".` : `Os ${plural} continuam salvos, em "Sem tema".`}
              {qtdExcluir > 0 && ` ${qtdExcluir} ${qtdExcluir === 1 ? `${singular} vai` : `${plural} vão`} para lá.`}
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
