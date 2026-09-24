import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Layers, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { duplicarTemplate, excluirTemplate, fetchTemplates, renomearTemplate, type Template } from "@/lib/processosService";
import type { TipoProcesso } from "@/lib/processos";
import { TemplateEditorDialog } from "./TemplateEditorDialog";

interface TemplatesViewProps {
  tipo: TipoProcesso;
}

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao salvar");

/** Aba de templates (compartilhada entre Onboarding e Roadmap): grade de cards com criar/editar/renomear/duplicar/excluir. */
export function TemplatesView({ tipo }: TemplatesViewProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ template: Template | null } | null>(null);
  const [renomeando, setRenomeando] = useState<Template | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [excluindo, setExcluindo] = useState<Template | null>(null);
  const [processando, setProcessando] = useState(false);

  const carregar = async () => {
    try {
      setTemplates(await fetchTemplates(tipo));
      setErro(null);
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  const duplicar = async (t: Template) => {
    setProcessando(true);
    try {
      await duplicarTemplate(t.id);
      toast.success(`"${t.nome}" duplicado`);
      await carregar();
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setProcessando(false);
    }
  };

  const abrirRenomear = (t: Template) => {
    setRenomeando(t);
    setNovoNome(t.nome);
  };

  const salvarNome = async () => {
    if (!renomeando || !novoNome.trim() || salvandoNome) return;
    setSalvandoNome(true);
    try {
      await renomearTemplate(renomeando.id, novoNome.trim());
      toast.success("Template renomeado");
      setRenomeando(null);
      await carregar();
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setSalvandoNome(false);
    }
  };

  const excluir = async () => {
    if (!excluindo) return;
    setProcessando(true);
    try {
      await excluirTemplate(excluindo.id);
      toast.success(`"${excluindo.nome}" excluído`);
      setExcluindo(null);
      await carregar();
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Crie quantos templates quiser. Eles não têm datas — as datas você coloca ao aplicar no cliente.
        </p>
        <Button className="gap-2 shrink-0" onClick={() => setEditor({ template: null })}>
          <Plus size={16} /> Criar template
        </Button>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="bg-muted rounded-full p-4"><Layers size={32} className="text-muted-foreground" /></div>
          <h3 className="text-base font-medium">Nenhum template ainda</h3>
          <p className="text-muted-foreground max-w-xs text-sm">
            Crie um template com os passos que se repetem, e aplique em cada cliente com um clique.
          </p>
          <Button onClick={() => setEditor({ template: null })}>Criar o primeiro template</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <CardContent className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-snug truncate">{t.nome}</h3>
                    <p className="text-xs text-muted-foreground">{t.passos.length} {t.passos.length === 1 ? "passo" : "passos"}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" title="Mais ações">
                        <MoreHorizontal size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditor({ template: t })}>
                        <Pencil size={14} className="mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => abrirRenomear(t)}>
                        <Type size={14} className="mr-2" /> Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicar(t)}>
                        <Copy size={14} className="mr-2" /> Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setExcluindo(t)}>
                        <Trash2 size={14} className="mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {t.passos.length > 0 ? (
                  <ol className="space-y-0.5 text-xs text-muted-foreground list-decimal list-inside">
                    {t.passos.slice(0, 3).map((p) => (
                      <li key={p.id} className="truncate">{p.titulo}</li>
                    ))}
                    {t.passos.length > 3 && <li className="list-none text-[11px] italic">+{t.passos.length - 3} passo(s)</li>}
                  </ol>
                ) : (
                  <p className="text-xs italic text-muted-foreground">Sem passos ainda</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateEditorDialog
        aberto={!!editor}
        tipo={tipo}
        template={editor?.template ?? null}
        onClose={() => setEditor(null)}
        onSalvo={carregar}
      />

      <Dialog open={!!renomeando} onOpenChange={(o) => { if (!o && !salvandoNome) setRenomeando(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear template</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") salvarNome(); }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenomeando(null)} disabled={salvandoNome}>Cancelar</Button>
            <Button onClick={salvarNome} disabled={!novoNome.trim() || salvandoNome}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluindo} onOpenChange={(o) => { if (!o && !processando) setExcluindo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{excluindo?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>Processos que já usaram este template não mudam.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); excluir(); }} disabled={processando} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
