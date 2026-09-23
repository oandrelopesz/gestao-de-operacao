import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { criarPasta, atualizarPasta, excluirPasta, mensagemErroPdf, type PdfBiblioteca } from "@/lib/pdfs";
import { opcoesDePasta, podeMoverPasta, idsDescendentes, PASTA_CORES, type PdfPasta } from "@/lib/pdfsArvore";

/** create: nova pasta dentro de `parentId` (null = tema na raiz); edit: renomear, mover ou trocar a cor */
export type PastaDialogState =
  | { mode: "create"; parentId: string | null }
  | { mode: "edit"; pasta: PdfPasta }
  | null;

const RAIZ = "__raiz";

interface PastaDialogProps {
  state: PastaDialogState;
  pastas: PdfPasta[];
  onClose: () => void;
  onSaved: (pasta?: PdfPasta) => Promise<void> | void;
}

export function PastaDialog({ state, pastas, onClose, onSaved }: PastaDialogProps) {
  const [nome, setNome] = useState("");
  const [parent, setParent] = useState<string>(RAIZ);
  const [cor, setCor] = useState<string>(PASTA_CORES[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    if (state.mode === "create") {
      setNome("");
      setParent(state.parentId ?? RAIZ);
      const temas = pastas.filter((p) => !p.parent_id).length;
      setCor(PASTA_CORES[temas % PASTA_CORES.length]);
    } else {
      setNome(state.pasta.nome);
      setParent(state.pasta.parent_id ?? RAIZ);
      setCor(state.pasta.cor && state.pasta.cor.startsWith("#") ? state.pasta.cor : PASTA_CORES[0]);
    }
  }, [state, pastas]);

  const editando = state?.mode === "edit" ? state.pasta : null;
  // Uma pasta não pode ir para dentro dela mesma nem de uma subpasta sua
  const opcoes = useMemo(() => opcoesDePasta(pastas, editando?.id), [pastas, editando?.id]);
  const ehTema = parent === RAIZ;

  const save = async () => {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) { toast.error("Dê um nome para a pasta"); return; }
    const parentId = parent === RAIZ ? null : parent;
    const irmaComMesmoNome = pastas.some(
      (p) => (p.parent_id ?? null) === parentId && p.id !== editando?.id && p.nome.toLowerCase() === nomeLimpo.toLowerCase(),
    );
    if (irmaComMesmoNome) { toast.error(`Já existe uma pasta "${nomeLimpo}" nesse lugar`); return; }
    if (editando && !podeMoverPasta(pastas, editando.id, parentId)) {
      toast.error("Uma pasta não pode ir para dentro dela mesma");
      return;
    }
    setSaving(true);
    try {
      // Só temas guardam cor; subpastas herdam a do tema
      const corFinal = parentId ? null : cor;
      if (editando) {
        const mudouDeLugar = (editando.parent_id ?? null) !== parentId;
        await atualizarPasta(editando.id, {
          nome: nomeLimpo,
          parent_id: parentId,
          cor: corFinal,
          ...(mudouDeLugar ? { ordem: pastas.filter((p) => (p.parent_id ?? null) === parentId).length } : {}),
        });
        toast.success("Pasta atualizada");
        await onSaved();
      } else {
        const nova = await criarPasta(pastas, { nome: nomeLimpo, parent_id: parentId, cor: corFinal });
        toast.success(parentId ? `Subpasta "${nova.nome}" criada` : `Tema "${nova.nome}" criado`);
        await onSaved(nova);
      }
      onClose();
    } catch (e) {
      toast.error(mensagemErroPdf(e));
    } finally {
      setSaving(false);
    }
  };

  const titulo = editando ? "Editar pasta" : ehTema ? "Novo tema" : "Nova subpasta";

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Temas ficam na raiz (ex.: Tráfego, IA). Dentro deles você cria subpastas (ex.: Meta Ads, Claude), em quantos níveis quiser.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="space-y-2">
            <Label htmlFor="pasta-nome">Nome</Label>
            <Input id="pasta-nome" autoFocus placeholder={ehTema ? "Ex.: Tráfego" : "Ex.: Meta Ads"} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pasta-parent">Dentro de</Label>
            <Select value={parent} onValueChange={setParent}>
              <SelectTrigger id="pasta-parent"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={RAIZ}>Raiz (é um tema)</SelectItem>
                {opcoes.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    <span style={{ paddingLeft: o.nivel * 14 }}>{o.nome}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {ehTema && (
            <div className="space-y-2">
              <Label>Cor do tema</Label>
              <div className="flex flex-wrap gap-2">
                {PASTA_CORES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setCor(hex)}
                    className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110",
                      cor === hex && "ring-2 ring-offset-2 ring-offset-background ring-zinc-900 dark:ring-zinc-100",
                    )}
                    style={{ backgroundColor: hex }}
                    title={hex}
                  >
                    {cor === hex && <Check size={14} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : editando ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ExcluirPastaDialogProps {
  pasta: PdfPasta | null;
  biblioteca: PdfBiblioteca;
  onClose: () => void;
  onDeleted: (pasta: PdfPasta) => Promise<void> | void;
}

/** Confirmação de exclusão mostrando quantas subpastas e PDFs vão junto. */
export function ExcluirPastaDialog({ pasta, biblioteca, onClose, onDeleted }: ExcluirPastaDialogProps) {
  const [saving, setSaving] = useState(false);

  const resumo = useMemo(() => {
    if (!pasta) return { subpastas: 0, pdfs: 0 };
    const ids = idsDescendentes(biblioteca.pastas, pasta.id);
    return { subpastas: ids.size - 1, pdfs: biblioteca.pdfs.filter((f) => ids.has(f.pasta_id)).length };
  }, [pasta, biblioteca]);

  const excluir = async () => {
    if (!pasta) return;
    setSaving(true);
    try {
      await excluirPasta(pasta.id, biblioteca);
      toast.success(`Pasta "${pasta.nome}" excluída`);
      await onDeleted(pasta);
      onClose();
    } catch (e) {
      toast.error(mensagemErroPdf(e));
    } finally {
      setSaving(false);
    }
  };

  const partes: string[] = [];
  if (resumo.subpastas) partes.push(`${resumo.subpastas} ${resumo.subpastas === 1 ? "subpasta" : "subpastas"}`);
  if (resumo.pdfs) partes.push(`${resumo.pdfs} ${resumo.pdfs === 1 ? "PDF" : "PDFs"}`);

  return (
    <AlertDialog open={!!pasta} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir a pasta "{pasta?.nome}"?</AlertDialogTitle>
          <AlertDialogDescription>
            {partes.length
              ? `Vão junto ${partes.join(" e ")}, apagados de vez do armazenamento. Não há como desfazer.`
              : "A pasta está vazia. Não há como desfazer."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); excluir(); }} disabled={saving} className="bg-destructive hover:bg-destructive/90">
            {saving ? "Excluindo..." : "Excluir pasta"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
