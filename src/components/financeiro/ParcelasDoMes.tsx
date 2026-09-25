import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/clientes";
import { cn } from "@/lib/utils";
import { infoDoStatus, type ParcelaDoMes } from "@/lib/financeiro";

const dataCurta = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

/** Parcelas do mês de uma fonte fracionada, cada uma com a sua situação e o botão de recebido. */
export function ParcelasDoMes({ parcelas, onAlternar }: { parcelas: ParcelaDoMes[]; onAlternar: (parcela: ParcelaDoMes) => void }) {
  return (
    <div className="space-y-1.5">
      {parcelas.map((p) => {
        const info = infoDoStatus(p.status);
        const recebida = p.status === "recebido";
        return (
          <div key={p.numero} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="font-semibold">{p.numero}ª · dia {p.dia}</span>
                <span className="font-bold">{formatBRL(p.valor)}</span>
              </div>
              <div className={cn("text-[10px] font-medium", info.text)}>
                {recebida ? `Recebida em ${dataCurta(p.recebimento?.data_confirmacao)}` : info.label}
              </div>
            </div>
            <Button
              variant={recebida ? "outline" : "default"}
              size="sm"
              className={cn("h-7 shrink-0 px-2 text-[11px] font-bold", recebida && "border-emerald-200 text-emerald-600 bg-emerald-50/50")}
              onClick={(e) => { e.stopPropagation(); onAlternar(p); }}
            >
              {recebida ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Recebida</> : "Marcar recebida"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
