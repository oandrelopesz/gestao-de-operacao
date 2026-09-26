// Tentativas de follow-up (spec §5): contador da coluna e botão "Registrar Nª tentativa".
// Só aparece quando a coluna atual do lead é de follow-up (prospecção ou proposta).
import { useState, type MouseEvent, type SyntheticEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/components/crm/CrmContexto";
import { infoTentativas } from "@/lib/crmTentativas";
import type { LeadCrm } from "@/lib/crmTipos";
import { cn } from "@/lib/utils";

const parar = (e: SyntheticEvent) => e.stopPropagation();

export function BotaoTentativa({ lead, compacto = false }: { lead: LeadCrm; compacto?: boolean }) {
  const { colunaDoLead, registrarTentativa } = useCrm();
  const [salvando, setSalvando] = useState(false);
  const coluna = colunaDoLead(lead);
  const info = coluna ? infoTentativas(lead, coluna) : null;
  if (!info) return null;

  const registrar = async (e: MouseEvent) => {
    e.stopPropagation();
    if (salvando || info.noLimite) return;
    setSalvando(true);
    try {
      await registrarTentativa(lead);
    } finally {
      setSalvando(false);
    }
  };

  const avisoLimite = info.noLimite && (
    <p
      className={cn(
        "basis-full text-amber-600 dark:text-amber-400",
        compacto ? "text-[11px] leading-tight" : "text-xs",
      )}
    >
      As {info.teto} tentativas acabaram. Mova o lead para a coluna que traduz o que aconteceu.
    </p>
  );

  // O span segura o clique/arrasto mesmo com o botão desabilitado (que não recebe eventos do ponteiro)
  const botao = (
    <span onPointerDown={parar} onClick={parar} className="shrink-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("gap-1", compacto ? "h-7 px-2 text-xs" : "h-8")}
        disabled={salvando || info.noLimite}
        onClick={registrar}
      >
        {salvando ? <Loader2 className="animate-spin" /> : !info.noLimite && <Plus />}
        {info.rotuloBotao}
      </Button>
    </span>
  );

  if (compacto) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className="text-[11px] font-medium tabular-nums text-muted-foreground"
          title={`${info.feitas} de ${info.teto} tentativas`}
          aria-label={`${info.feitas} de ${info.teto} tentativas`}
        >
          {info.feitas} de {info.teto}
        </span>
        {botao}
        {avisoLimite}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {info.feitas} de {info.teto} tentativas
          </p>
          <p className="text-xs text-muted-foreground">
            {info.escopo === "proposta" ? "Follow-up de proposta" : "Follow-up de prospecção"}
          </p>
        </div>
        {botao}
      </div>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: info.teto }, (_, i) => (
          <span
            key={i}
            className={cn("h-1.5 flex-1 rounded-full", i < info.feitas ? "bg-primary" : "bg-muted")}
          />
        ))}
      </div>
      {avisoLimite}
    </div>
  );
}
