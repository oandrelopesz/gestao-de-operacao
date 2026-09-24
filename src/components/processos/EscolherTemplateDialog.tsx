import { useEffect, useState } from "react";
import { FilePlus2, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fetchTemplates, type Template } from "@/lib/processosService";
import type { TipoProcesso } from "@/lib/processos";
import { TemplateEditorDialog } from "./TemplateEditorDialog";

interface EscolherTemplateDialogProps {
  aberto: boolean;
  tipo: TipoProcesso;
  /** Desabilita "Substituir": o processo já tem passos concluídos. */
  processoTemConcluidos: boolean;
  onEscolher: (templateId: string, modo: "substituir" | "acrescentar") => void | Promise<void>;
  onClose: () => void;
}

type Modo = "substituir" | "acrescentar";

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao carregar");

/** Escolher um template para aplicar num processo: substituir os passos atuais ou acrescentar ao fim. */
export function EscolherTemplateDialog({ aberto, tipo, processoTemConcluidos, onEscolher, onClose }: EscolherTemplateDialogProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("substituir");
  const [aplicando, setAplicando] = useState(false);
  const [editorAberto, setEditorAberto] = useState(false);

  const carregar = async () => {
    setLoading(true);
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
    if (!aberto) return;
    setSelecionadoId(null);
    setModo(processoTemConcluidos ? "acrescentar" : "substituir");
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, tipo]);

  const aplicar = async () => {
    if (!selecionadoId || aplicando) return;
    setAplicando(true);
    try {
      await onEscolher(selecionadoId, modo);
      onClose();
    } finally {
      setAplicando(false);
    }
  };

  return (
    <>
      <Dialog open={aberto && !editorAberto} onOpenChange={(o) => { if (!o && !aplicando) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Escolher template</DialogTitle>
            <DialogDescription>Templates não têm datas — elas entram só ao aplicar.</DialogDescription>
          </DialogHeader>

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Layers size={28} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum template ainda.</p>
            </div>
          ) : (
            <ol className="space-y-1.5 max-h-[35vh] overflow-y-auto -mx-1 px-1">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelecionadoId(t.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      selecionadoId === t.id ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/40",
                    )}
                  >
                    <span className="font-medium truncate">{t.nome}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t.passos.length} {t.passos.length === 1 ? "passo" : "passos"}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}

          <Button type="button" variant="ghost" size="sm" className="w-fit gap-1.5" onClick={() => setEditorAberto(true)}>
            <FilePlus2 size={14} /> Criar template novo
          </Button>

          <div className="space-y-2">
            <Label className="text-xs">Como aplicar</Label>
            <RadioGroup value={modo} onValueChange={(v) => setModo(v as Modo)} className="space-y-2">
              <div className={cn("flex items-start gap-2.5 rounded-lg border p-2.5", processoTemConcluidos && "opacity-60")}>
                <RadioGroupItem value="substituir" id="modo-substituir" disabled={processoTemConcluidos} className="mt-0.5" />
                <Label htmlFor="modo-substituir" className={cn("flex-1 font-normal", !processoTemConcluidos && "cursor-pointer")}>
                  <span className="block text-sm font-medium">Substituir os passos</span>
                  <span className="block text-xs text-muted-foreground">
                    {processoTemConcluidos
                      ? "Indisponível: já há passos concluídos neste processo."
                      : "Apaga os passos atuais e coloca os do template."}
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg border p-2.5">
                <RadioGroupItem value="acrescentar" id="modo-acrescentar" className="mt-0.5" />
                <Label htmlFor="modo-acrescentar" className="flex-1 cursor-pointer font-normal">
                  <span className="block text-sm font-medium">Acrescentar ao fim</span>
                  <span className="block text-xs text-muted-foreground">Os passos do template entram depois dos que já existem.</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={aplicando}>Cancelar</Button>
            <Button onClick={aplicar} disabled={!selecionadoId || aplicando} className="gap-1.5">
              {aplicando && <Loader2 size={14} className="animate-spin" />}
              Aplicar template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateEditorDialog
        aberto={editorAberto}
        tipo={tipo}
        template={null}
        onClose={() => setEditorAberto(false)}
        onSalvo={() => { setEditorAberto(false); carregar(); }}
      />
    </>
  );
}
