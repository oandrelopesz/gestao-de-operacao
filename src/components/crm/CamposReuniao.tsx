// Campos de data, hora, duração e (opcional) e-mail de uma reunião do CRM. Usado na janela de movimento e na ficha.
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
import { DURACOES_REUNIAO } from "@/lib/crmColunas";

export interface CamposReuniaoValor {
  /** aaaa-mm-dd (fuso de São Paulo) */
  data: string;
  /** hh:mm */
  hora: string;
  duracaoMin: number;
  email: string;
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
  comEmail,
}: {
  valor: CamposReuniaoValor;
  onChange: (v: CamposReuniaoValor) => void;
  comEmail?: boolean;
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
      {comEmail && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-email`}>E-mail do lead (recebe o convite)</Label>
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="nome@empresa.com.br"
            value={valor.email}
            onChange={(e) => onChange({ ...valor, email: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Sem e-mail, o evento é criado sem convidado.
          </p>
        </div>
      )}
    </div>
  );
}
