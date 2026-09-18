import { useEffect, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  type Habilidade, type Subhabilidade, type RecursoTipo, RECURSO_TIPOS,
  createHabilidade, updateHabilidade, createSubhabilidade, updateSubhabilidade, createRecurso,
  formatNota, nivelDaNota,
} from "@/lib/habilidades";

const PESOS = [
  { value: "1", label: "1 · normal" },
  { value: "1.5", label: "1,5 · importante" },
  { value: "2", label: "2 · muito importante" },
  { value: "3", label: "3 · crítico" },
];

function PesoSelect({ value, onChange, id }: { value: number; onChange: (v: number) => void; id?: string }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent>
        {PESOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------- Habilidade

export type HabilidadeDialogState =
  | { mode: "create" }
  | { mode: "edit"; habilidade: Habilidade }
  | null;

export function HabilidadeDialog({ state, onClose, onSaved, habilidades }: {
  state: HabilidadeDialogState;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  habilidades: Habilidade[];
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [peso, setPeso] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    if (state.mode === "edit") {
      setNome(state.habilidade.nome);
      setDescricao(state.habilidade.descricao || "");
      setPeso(state.habilidade.peso);
    } else {
      setNome("");
      setDescricao("");
      setPeso(1);
    }
  }, [state]);

  const handleSave = async () => {
    if (!state) return;
    if (!nome.trim()) {
      toast.error("Informe o nome da habilidade");
      return;
    }
    const duplicada = habilidades.some((h) => h.nome.toLowerCase() === nome.trim().toLowerCase() && (state.mode === "create" || h.id !== state.habilidade.id));
    if (duplicada) {
      toast.error("Já existe uma habilidade com esse nome");
      return;
    }
    setSaving(true);
    try {
      if (state.mode === "edit") {
        await updateHabilidade(state.habilidade.id, { nome, descricao, peso });
        toast.success("Habilidade atualizada");
      } else {
        await createHabilidade({ nome, descricao, peso }, habilidades);
        toast.success("Habilidade criada. Agora adicione as subhabilidades.");
      }
      await onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar habilidade");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{state?.mode === "edit" ? "Editar habilidade" : "Nova habilidade"}</DialogTitle>
          <DialogDescription>A nota da habilidade é a média ponderada das subhabilidades dela.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <div className="space-y-2">
            <Label htmlFor="hab-nome">Nome</Label>
            <Input id="hab-nome" autoFocus placeholder="Ex.: Gestão de Tráfego" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hab-desc">Descrição (opcional)</Label>
            <Textarea id="hab-desc" rows={2} placeholder="O que essa habilidade cobre" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hab-peso">Peso na nota geral</Label>
            <PesoSelect id="hab-peso" value={peso} onChange={setPeso} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : state?.mode === "edit" ? "Salvar" : "Criar habilidade"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Subhabilidade

export type SubhabilidadeDialogState =
  | { mode: "create"; habilidade: Habilidade }
  | { mode: "edit"; habilidade: Habilidade; sub: Subhabilidade }
  | null;

export function SubhabilidadeDialog({ state, onClose, onSaved }: {
  state: SubhabilidadeDialogState;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [nome, setNome] = useState("");
  const [criterios, setCriterios] = useState("");
  const [peso, setPeso] = useState(1);
  const [nota, setNota] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    if (state.mode === "edit") {
      setNome(state.sub.nome);
      setCriterios(state.sub.criterios || "");
      setPeso(state.sub.peso);
      setNota(state.sub.nota);
    } else {
      setNome("");
      setCriterios("");
      setPeso(1);
      setNota(0);
    }
  }, [state]);

  const handleSave = async () => {
    if (!state) return;
    if (!nome.trim()) {
      toast.error("Informe o nome da subhabilidade");
      return;
    }
    const duplicada = state.habilidade.subhabilidades.some((s) => s.nome.toLowerCase() === nome.trim().toLowerCase() && (state.mode === "create" || s.id !== state.sub.id));
    if (duplicada) {
      toast.error("Já existe uma subhabilidade com esse nome nesta habilidade");
      return;
    }
    setSaving(true);
    try {
      if (state.mode === "edit") {
        await updateSubhabilidade(state.sub.id, { nome, criterios, peso, nota });
        toast.success("Subhabilidade atualizada");
      } else {
        await createSubhabilidade({ habilidade_id: state.habilidade.id, nome, criterios, peso, nota }, state.habilidade.subhabilidades);
        toast.success("Subhabilidade criada");
      }
      await onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar subhabilidade");
    } finally {
      setSaving(false);
    }
  };

  const nivel = nivelDaNota(nota);

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{state?.mode === "edit" ? "Editar subhabilidade" : "Nova subhabilidade"}</DialogTitle>
          <DialogDescription>Em <strong>{state?.habilidade.nome}</strong>. O critério descreve o que seria nota 10, para você se avaliar com honestidade.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <div className="space-y-2">
            <Label htmlFor="sub-nome">Nome</Label>
            <Input id="sub-nome" autoFocus placeholder="Ex.: Meta Ads" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sub-crit">O que seria nota 10</Label>
            <Textarea id="sub-crit" rows={3} placeholder="Ex.: Domina estrutura de conta, públicos, testes de criativo e escala sem quebrar o CPA." value={criterios} onChange={(e) => setCriterios(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sub-peso">Peso na habilidade</Label>
              <PesoSelect id="sub-peso" value={peso} onChange={setPeso} />
            </div>
            <div className="space-y-2">
              <Label>Nota atual</Label>
              <div className="flex items-center gap-3 h-10">
                <Slider min={0} max={10} step={0.5} value={[nota]} onValueChange={([v]) => setNota(v)} className="flex-1" />
                <span className="numeric w-10 text-right font-semibold" style={{ color: nivel.hex }}>{formatNota(nota)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : state?.mode === "edit" ? "Salvar" : "Criar subhabilidade"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Recurso (sugestão)

export function RecursoDialog({ habilidade, onClose, onSaved }: {
  habilidade: Habilidade | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [tipo, setTipo] = useState<RecursoTipo>("livro");
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [link, setLink] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (habilidade) {
      setTipo("livro");
      setTitulo("");
      setAutor("");
      setLink("");
      setObservacao("");
    }
  }, [habilidade]);

  const handleSave = async () => {
    if (!habilidade) return;
    if (!titulo.trim()) {
      toast.error("Informe o título");
      return;
    }
    setSaving(true);
    try {
      await createRecurso({ habilidade_id: habilidade.id, tipo, titulo, autor, link, observacao }, habilidade.recursos);
      toast.success("Sugestão adicionada");
      await onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar sugestão");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!habilidade} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Nova sugestão de estudo</DialogTitle>
          <DialogDescription>Aparece na lista de sugestões de <strong>{habilidade?.nome}</strong>.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rec-tipo">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as RecursoTipo)}>
                <SelectTrigger id="rec-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURSO_TIPOS.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rec-autor">Autor / quem ensina</Label>
              <Input id="rec-autor" value={autor} onChange={(e) => setAutor(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec-titulo">Título</Label>
            <Input id="rec-titulo" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec-link">Link (LP, página de compra ou perfil — opcional)</Label>
            <Input id="rec-link" placeholder="https://..." value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec-obs">Por que vale a pena (opcional)</Label>
            <Input id="rec-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Adicionar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Prompt

export function PromptDialog({ habilidade, prompt, onClose }: {
  habilidade: Habilidade | null;
  prompt: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => { setCopied(false); }, [habilidade]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success("Prompt copiado. Cole no Claude Cowork ou no GPT com navegação.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  const download = () => {
    const blob = new Blob([prompt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Prompt - ${habilidade?.nome || "habilidade"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={!!habilidade} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Prompt de pesquisa · {habilidade?.nome}</DialogTitle>
          <DialogDescription>
            Gerado agora a partir das notas e subhabilidades atuais desta habilidade (inclusive as que você adicionou): as de nota mais baixa viram prioridade e as altas ficam de fora. Mudou uma nota? Gere de novo. Cole em um modelo com navegação (Claude Cowork, GPT com browser) e ele entrega um .docx com o plano de estudos.
          </DialogDescription>
        </DialogHeader>
        <Textarea readOnly value={prompt} className="h-[55vh] font-mono text-xs leading-relaxed resize-none" />
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={download}>
            <Download size={14} /> Baixar .md
          </Button>
          <Button type="button" className="gap-2" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar prompt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
