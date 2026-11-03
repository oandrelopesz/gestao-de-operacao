import { useState } from "react";
import { Check, Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { novaDescricao, type Descricao } from "@/lib/arquivoDescricoes";

/** Copia para a área de transferência; cai no método antigo se o navegador não deixar o novo. */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = texto;
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 shrink-0 gap-1 px-2 text-xs"
      disabled={!texto}
      title={rotulo ? `Copiar "${rotulo}"` : "Copiar o texto"}
      data-testid="copiar-descricao"
      onClick={async (e) => {
        e.stopPropagation();
        if (await copiarTexto(texto)) {
          setCopiado(true);
          toast.success(rotulo ? `"${rotulo}" copiada` : "Texto copiado");
          window.setTimeout(() => setCopiado(false), 1500);
        } else {
          toast.error("Não foi possível copiar");
        }
      }}
    >
      {copiado ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      <span>{copiado ? "Copiado" : "Copiar"}</span>
    </Button>
  );
}

/** Lista editável de descrições: nome + texto, com copiar e remover em cada uma. */
export function DescricoesEditor({ valor, onChange, idBase, linhas = 3 }: { valor: Descricao[]; onChange: (v: Descricao[]) => void; idBase: string; linhas?: number }) {
  const mudar = (id: string, patch: Partial<Descricao>) => onChange(valor.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  return (
    <div className="space-y-2" data-testid="descricoes-editor">
      {valor.map((d, i) => (
        <div key={d.id} className="space-y-1.5 rounded-md border bg-muted/20 p-2" data-testid="descricao-item">
          <div className="flex items-center gap-1.5">
            <Input
              id={`${idBase}-titulo-${i}`}
              aria-label="Nome da descrição"
              className="h-8 text-xs font-medium"
              placeholder="Nome da descrição (ex.: Legenda, Roteiro, Link)"
              value={d.titulo}
              onChange={(e) => mudar(d.id, { titulo: e.target.value })}
            />
            <BotaoCopiar texto={d.texto} rotulo={d.titulo.trim() || undefined} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              title="Remover esta descrição"
              aria-label="Remover esta descrição"
              onClick={() => onChange(valor.filter((x) => x.id !== d.id))}
            >
              <X size={14} />
            </Button>
          </div>
          <Textarea
            id={`${idBase}-texto-${i}`}
            aria-label="Texto da descrição"
            rows={linhas}
            placeholder="Descrição: do que se trata, onde usar, links…"
            value={d.texto}
            onChange={(e) => mudar(d.id, { texto: e.target.value })}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        data-testid="adicionar-descricao"
        onClick={() => onChange([...valor, novaDescricao()])}
      >
        <Plus size={13} /> Adicionar descrição
      </Button>
    </div>
  );
}
