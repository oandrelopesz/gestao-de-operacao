import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { emailValido } from "@/lib/agendaEvento";

interface Props { valor: string[]; onChange: (emails: string[]) => void; disabled?: boolean }

export function ParticipantesCampo({ valor, onChange, disabled }: Props) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const adicionar = () => {
    const novos = texto.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!novos.length) return;
    const invalido = novos.find((e) => !emailValido(e));
    if (invalido) { setErro(`E-mail inválido: ${invalido}`); return; }
    const lista = [...valor];
    for (const e of novos) if (!lista.some((x) => x.toLowerCase() === e.toLowerCase())) lista.push(e);
    onChange(lista);
    setTexto("");
    setErro(null);
  };

  return (
    <div className="space-y-2">
      {!disabled && (
        <Input
          value={texto}
          inputMode="email"
          autoComplete="off"
          placeholder="nome@empresa.com — Enter para adicionar"
          onChange={(e) => { setTexto(e.target.value); setErro(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === ";") { e.preventDefault(); adicionar(); }
          }}
          onBlur={adicionar}
        />
      )}
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valor.map((e) => (
            <Badge key={e} variant="secondary" className="gap-1 font-normal">
              {e}
              {!disabled && (
                <button type="button" className="hover:text-destructive" onClick={() => onChange(valor.filter((x) => x !== e))} aria-label={`Remover ${e}`}>
                  <X size={11} />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
