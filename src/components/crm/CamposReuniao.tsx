// Campos de data, hora e duração de uma reunião do CRM (janela de movimento e ficha). O e-mail do convite não é
// pedido aqui: vem do próprio lead; `convite` só mostra para quem ele vai.
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DURACOES_REUNIAO, emailValido } from "@/lib/crmColunas";

export interface CamposReuniaoValor {
  /** aaaa-mm-dd (fuso de São Paulo) */
  data: string;
  /** hh:mm */
  hora: string;
  duracaoMin: number;
}

const CHAVE_DURACAO = "crm-duracao";

/** Última duração usada neste navegador (30 min quando não há). */
export function duracaoPadraoReuniao(): number {
  try {
    const n = Number(localStorage.getItem(CHAVE_DURACAO));
    if (Number.isInteger(n) && n >= 5 && n <= 480) return n;
  } catch {
    // sem storage (SSR ou navegação privada)
  }
  return 30;
}

function lembrarDuracao(n: number) {
  try {
    localStorage.setItem(CHAVE_DURACAO, String(n));
  } catch {
    // sem storage
  }
}

export function CamposReuniao({
  valor,
  onChange,
  convite,
}: {
  valor: CamposReuniaoValor;
  onChange: (v: CamposReuniaoValor) => void;
  /** E-mail do lead (null = lead sem e-mail). Sem a prop, o aviso do convite não aparece. */
  convite?: string | null;
}) {
  const id = useId();
  const duracoes = DURACOES_REUNIAO.includes(valor.duracaoMin)
    ? DURACOES_REUNIAO
    : [...DURACOES_REUNIAO, valor.duracaoMin].sort((a, b) => a - b);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_7rem_7rem]">
        <div className="col-span-2 grid gap-1.5 sm:col-span-1">
          <Label htmlFor={`${id}-data`}>Data</Label>
          <Input
            id={`${id}-data`}
            type="date"
            value={valor.data}
            onChange={(e) => onChange({ ...valor, data: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-hora`}>Hora</Label>
          <Input
            id={`${id}-hora`}
            type="time"
            value={valor.hora}
            onChange={(e) => onChange({ ...valor, hora: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-duracao`}>Duração</Label>
          <Select
            value={String(valor.duracaoMin)}
            onValueChange={(v) => {
              const n = Number(v);
              lembrarDuracao(n);
              onChange({ ...valor, duracaoMin: n });
            }}
          >
            <SelectTrigger id={`${id}-duracao`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {duracoes.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} min
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {convite !== undefined && (
        <p className="text-xs text-muted-foreground">
          {convite && emailValido(convite) ? (
            <>
              O convite vai para <span className="font-medium text-foreground">{convite.trim()}</span> (e-mail do lead).
            </>
          ) : (
            <>Lead sem e-mail: o evento é criado sem convidado. Para convidar, preencha o e-mail na ficha do lead.</>
          )}
        </p>
      )}
    </div>
  );
}
