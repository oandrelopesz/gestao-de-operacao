// Topo da aba Dados internos: um clique copia o link público de cada formulário.
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ORDEM_BOTOES, formularioPorId, type FormularioId } from "@/lib/dadosInternos";

export function BotoesLinks() {
  const [copiado, setCopiado] = useState<FormularioId | null>(null);
  const copiar = async (id: FormularioId) => {
    const { link } = formularioPorId(id);
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(id);
      toast.success("Link copiado");
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500);
    } catch {
      toast.error(`Não consegui copiar. O link é ${link}`);
    }
  };
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {ORDEM_BOTOES.map((id) => (
        <Button key={id} variant="outline" size="sm" className="gap-1.5" onClick={() => void copiar(id)} title={`Copiar ${formularioPorId(id).link}`}>
          {copiado === id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          {formularioPorId(id).botao}
        </Button>
      ))}
    </div>
  );
}
