import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, parseBRLInput } from "@/lib/clientes";
import { MIN_PARCELAS, MAX_PARCELAS, ajustarQuantidade, textoDoValor, type Parcela } from "@/lib/financeiro";

const QUANTIDADES = Array.from({ length: MAX_PARCELAS - MIN_PARCELAS + 1 }, (_, i) => MIN_PARCELAS + i);

interface Props {
  ativo: boolean;
  onAtivoChange: (ativo: boolean) => void;
  parcelas: Parcela[];
  onChange: (parcelas: Parcela[]) => void;
}

/** Alavanca "Pagamento fracionado" do cadastro da fonte: quantas vezes, e o dia e o valor de cada parcela. */
export function ParcelasEditor({ ativo, onAtivoChange, parcelas, onChange }: Props) {
  const total = parcelas.reduce((t, p) => t + (p.valor || 0), 0);
  const alterar = (i: number, campo: Partial<Parcela>) => onChange(parcelas.map((p, j) => (j === i ? { ...p, ...campo } : p)));

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <Label htmlFor="fracionado" className="cursor-pointer">Pagamento fracionado</Label>
          <p className="text-xs text-muted-foreground">O mês é pago em parcelas, cada uma no seu dia.</p>
        </div>
        <Switch id="fracionado" checked={ativo} onCheckedChange={onAtivoChange} />
      </div>

      {ativo && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label>Em quantas vezes</Label>
            <Select value={String(parcelas.length)} onValueChange={(v) => onChange(ajustarQuantidade(parcelas, Number(v)))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUANTIDADES.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} parcelas</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {parcelas.map((p, i) => (
              <div key={i} className="grid grid-cols-[76px_72px_1fr] items-end gap-2">
                <span className="pb-2 text-sm font-medium">Parcela {i + 1}</span>
                <div className="grid gap-1">
                  <Label htmlFor={`parcela-dia-${i}`} className="text-[11px] text-muted-foreground">Dia</Label>
                  <Input
                    id={`parcela-dia-${i}`}
                    type="number"
                    min={1}
                    max={31}
                    value={p.dia || ""}
                    onChange={(e) => alterar(i, { dia: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`parcela-valor-${i}`} className="text-[11px] text-muted-foreground">Valor</Label>
                  <Input
                    id={`parcela-valor-${i}`}
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={p.valor ? textoDoValor(p.valor) : ""}
                    onChange={(e) => alterar(i, { valor: parseBRLInput(e.target.value) })}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t pt-2 text-sm">
            <span className="text-muted-foreground">Total do mês</span>
            <span className="font-bold">{formatBRL(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
