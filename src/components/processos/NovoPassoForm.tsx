import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface NovoPassoFormProps {
  onAdicionar: (i: { titulo: string; data: string | null; observacoes: string | null }) => void | Promise<void>;
}

/** Formulário curto do "+ passo" (usado dentro de um Popover no fim da trilha). */
export function NovoPassoForm({ onAdicionar }: NovoPassoFormProps) {
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  const podeSalvar = titulo.trim().length > 0 && !salvando;

  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      await onAdicionar({ titulo: titulo.trim(), data: data || null, observacoes: observacoes.trim() || null });
      setTitulo("");
      setData("");
      setObservacoes("");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold">Novo passo</p>
        <p className="text-xs text-muted-foreground">Passos com data entram na trilha pela data; sem data vão para o fim.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="novo-passo-titulo" className="text-xs">Título</Label>
        <Input
          id="novo-passo-titulo"
          autoFocus
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ex.: Reunião de kickoff"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="novo-passo-data" className="text-xs">Data recomendada</Label>
          <span className="text-[10px] text-muted-foreground">opcional</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            id="novo-passo-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="h-8 text-sm"
          />
          {data && (
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setData("")}>
              Limpar
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="novo-passo-obs" className="text-xs">Observações</Label>
          <span className="text-[10px] text-muted-foreground">opcional</span>
        </div>
        <Textarea
          id="novo-passo-obs"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar(); }}
          rows={3}
          className="text-sm resize-none"
        />
      </div>

      <Button type="submit" size="sm" className="w-full gap-1.5" disabled={!podeSalvar}>
        {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Adicionar passo
      </Button>
    </form>
  );
}
