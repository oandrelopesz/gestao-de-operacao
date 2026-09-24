import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { salvarTemplate, type Template, type TemplatePasso } from "@/lib/processosService";
import type { TipoProcesso } from "@/lib/processos";

interface TemplateEditorDialogProps {
  aberto: boolean;
  tipo: TipoProcesso;
  /** null = criando um template novo */
  template: Template | null;
  onClose: () => void;
  onSalvo: () => void;
}

interface PassoEdit {
  id: string;
  titulo: string;
  observacoes: string;
  aberto: boolean;
}

let contadorLocal = 0;
const idLocal = () => `novo-${Date.now()}-${contadorLocal++}`;

function passosIniciais(template: Template | null): PassoEdit[] {
  if (template) {
    return template.passos.map((p) => ({ id: p.id, titulo: p.titulo, observacoes: p.observacoes ?? "", aberto: false }));
  }
  return [
    { id: idLocal(), titulo: "Demanda 1", observacoes: "", aberto: false },
    { id: idLocal(), titulo: "Demanda 2", observacoes: "", aberto: false },
  ];
}

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao salvar");

/** Diálogo de criar/editar um template (Onboarding ou Roadmap): nome + lista de passos reordenável. */
export function TemplateEditorDialog({ aberto, tipo, template, onClose, onSalvo }: TemplateEditorDialogProps) {
  const [nome, setNome] = useState("");
  const [passos, setPassos] = useState<PassoEdit[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [focoId, setFocoId] = useState<string | null>(null);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!aberto) return;
    setNome(template?.nome ?? "");
    setPassos(passosIniciais(template));
    setFocoId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, template?.id]);

  // "+ Adicionar passo" cria o passo já selecionado para renomear
  useEffect(() => {
    if (!focoId) return;
    const el = inputsRef.current[focoId];
    if (el) {
      el.focus();
      el.select();
    }
    setFocoId(null);
  }, [focoId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const adicionarPasso = () => {
    const novo: PassoEdit = { id: idLocal(), titulo: `Demanda ${passos.length + 1}`, observacoes: "", aberto: false };
    setPassos((p) => [...p, novo]);
    setFocoId(novo.id);
  };

  const removerPasso = (id: string) => setPassos((p) => p.filter((x) => x.id !== id));

  const atualizarPasso = (id: string, patch: Partial<PassoEdit>) =>
    setPassos((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const aoSoltar = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setPassos((p) => {
      const de = p.findIndex((x) => x.id === active.id);
      const para = p.findIndex((x) => x.id === over.id);
      if (de < 0 || para < 0) return p;
      return arrayMove(p, de, para);
    });
  };

  const passosValidos = passos.filter((p) => p.titulo.trim().length > 0);
  const podeSalvar = nome.trim().length > 0 && passosValidos.length > 0 && !salvando;

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      const payload: TemplatePasso[] = passosValidos.map((p) => ({ titulo: p.titulo.trim(), observacoes: p.observacoes.trim() || null }));
      await salvarTemplate({ id: template?.id, tipo, nome: nome.trim(), passos: payload });
      toast.success("Template salvo");
      onSalvo();
      onClose();
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !salvando) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? "Editar template" : "Novo template"}</DialogTitle>
          <DialogDescription>
            Templates não têm datas — elas entram só quando você aplicar o template num cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="template-nome" className="text-xs">Nome do template</Label>
            <Input
              id="template-nome"
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Onboarding padrão"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Passos</Label>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
              <SortableContext items={passos.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <ol className="space-y-2 max-h-[45vh] overflow-y-auto -mx-1 px-1">
                  {passos.map((passo) => (
                    <PassoEditorItem
                      key={passo.id}
                      passo={passo}
                      onRef={(el) => { inputsRef.current[passo.id] = el; }}
                      onChange={(patch) => atualizarPasso(passo.id, patch)}
                      onRemover={() => removerPasso(passo.id)}
                      podeRemover={passos.length > 1}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>

            <Button type="button" variant="outline" size="sm" className="mt-2 gap-1.5" onClick={adicionarPasso}>
              <Plus size={14} /> Adicionar passo
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={!podeSalvar} className="gap-1.5">
            {salvando && <Loader2 size={14} className="animate-spin" />}
            Salvar template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- item da lista

interface PassoEditorItemProps {
  passo: PassoEdit;
  onRef: (el: HTMLInputElement | null) => void;
  onChange: (patch: Partial<PassoEdit>) => void;
  onRemover: () => void;
  podeRemover: boolean;
}

function PassoEditorItem({ passo, onRef, onChange, onRemover, podeRemover }: PassoEditorItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: passo.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "rounded-lg border border-border/70 bg-muted/30 p-2",
        isDragging && "z-10 opacity-90 shadow-lg",
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-7 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
          title="Arrastar para reordenar"
        >
          <GripVertical size={14} />
        </button>
        <Input
          ref={onRef}
          value={passo.titulo}
          onChange={(e) => onChange({ titulo: e.target.value })}
          placeholder="Título do passo"
          className="h-8 text-sm"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          onClick={() => onChange({ aberto: !passo.aberto })}
          title={passo.aberto ? "Ocultar observações" : "Observações"}
        >
          {passo.aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0 text-destructive hover:text-destructive"
          onClick={onRemover}
          disabled={!podeRemover}
          title="Excluir passo"
        >
          <Trash2 size={14} />
        </Button>
      </div>
      {passo.aberto && (
        <Textarea
          value={passo.observacoes}
          onChange={(e) => onChange({ observacoes: e.target.value })}
          placeholder="Observações (opcional)"
          rows={2}
          className="mt-2 resize-none text-sm"
        />
      )}
    </li>
  );
}
