import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FATOR_UNIDADE, LEMBRETE_PADRAO, MAX_LEMBRETES, deUnidade, paraUnidade,
  type FormEvento, type Lembrete, type MetodoLembrete, type Unidade,
} from "@/lib/agendaEvento";

interface Props { form: FormEvento; onChange: (patch: Partial<FormEvento>) => void; disabled?: boolean }

const UNIDADES: { valor: Unidade; rotulo: string }[] = [
  { valor: "minutos", rotulo: "minutos" }, { valor: "horas", rotulo: "horas" },
  { valor: "dias", rotulo: "dias" }, { valor: "semanas", rotulo: "semanas" },
];

export function LembretesCampo({ form, onChange, disabled }: Props) {
  const lista = form.lembretes;
  const trocar = (i: number, l: Lembrete) => onChange({ lembretes: lista.map((x, j) => (j === i ? l : x)) });

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={form.lembretesPadrao}
          disabled={disabled}
          onCheckedChange={(v) => onChange({ lembretesPadrao: v, lembretes: !v && !lista.length ? [{ ...LEMBRETE_PADRAO }] : lista })}
        />
        Usar as notificações padrão da agenda
      </label>
      {!form.lembretesPadrao && (
        <>
          {lista.map((l, i) => {
            const unidade = l.unidade ?? paraUnidade(l.minutos).unidade;
            const valor = l.minutos / FATOR_UNIDADE[unidade];
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select value={l.metodo} onValueChange={(m) => trocar(i, { ...l, metodo: m as MetodoLembrete })} disabled={disabled}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popup">Notificação</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number" min={0} className="w-20" value={valor} disabled={disabled}
                  onChange={(e) => trocar(i, { ...l, unidade, minutos: deUnidade(Math.max(0, Number(e.target.value) || 0), unidade) })}
                />
                <Select value={unidade} onValueChange={(u) => trocar(i, { ...l, unidade: u as Unidade, minutos: deUnidade(valor, u as Unidade) })} disabled={disabled}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map((u) => <SelectItem key={u.valor} value={u.valor}>{u.rotulo}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">antes</span>
                {!disabled && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Remover notificação"
                    onClick={() => onChange({ lembretes: lista.filter((_, j) => j !== i) })}>
                    <X size={14} />
                  </Button>
                )}
              </div>
            );
          })}
          {!disabled && lista.length < MAX_LEMBRETES && (
            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
              onClick={() => onChange({ lembretes: [...lista, { ...LEMBRETE_PADRAO }] })}>
              <Plus size={14} /> Adicionar notificação
            </Button>
          )}
        </>
      )}
    </div>
  );
}
