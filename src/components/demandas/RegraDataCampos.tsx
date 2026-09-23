import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { NOMES_DIA_CURTO } from "@/lib/colunasDias";
import type { RegraData } from "@/lib/demandaColunas";

const REGRAS: { id: RegraData; label: string; ajuda: string }[] = [
  { id: "nenhuma", label: "Sem data automática", ajuda: "A entrega fica como está ao mover para cá." },
  { id: "hoje", label: "Hoje", ajuda: "Ao mover para cá, a entrega vira hoje." },
  { id: "amanha", label: "Amanhã", ajuda: "Ao mover para cá, a entrega vira amanhã." },
  { id: "depois_amanha", label: "Depois de amanhã", ajuda: "Ao mover para cá, a entrega vira depois de amanhã." },
  { id: "dias_semana", label: "Dias da semana", ajuda: "A coluna se divide por dia; ao mover para cá você escolhe o dia e a entrega vira o próximo dia escolhido." },
];
// Ordem de exibição: segunda a domingo
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

export function RegraDataCampos({ regra, dias, onChange }: { regra: RegraData; dias: number[]; onChange: (regra: RegraData, dias: number[]) => void }) {
  const alternar = (d: number) => {
    const novo = dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d];
    // Ordem das seções: a ordem de segunda a domingo, exceto fim de semana que mantém sábado antes de domingo
    onChange(regra, ORDEM_DIAS.filter((x) => novo.includes(x)));
  };
  return (
    <div className="space-y-2">
      <Label>Data de entrega ao mover para esta coluna</Label>
      <Select value={regra} onValueChange={(v) => { if (v) onChange(v as RegraData, v === "dias_semana" ? (dias.length ? dias : [6, 0]) : []); }}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {REGRAS.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{REGRAS.find((r) => r.id === regra)?.ajuda}</p>
      {regra === "dias_semana" && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {ORDEM_DIAS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => alternar(d)}
              className={cn(
                "h-8 min-w-[44px] px-2 rounded-md border text-xs font-medium transition-colors",
                dias.includes(d) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent",
              )}
            >
              {NOMES_DIA_CURTO[d]}
            </button>
          ))}
        </div>
      )}
      {regra === "dias_semana" && dias.length === 0 && <p className="text-xs text-destructive">Marque pelo menos um dia.</p>}
    </div>
  );
}
