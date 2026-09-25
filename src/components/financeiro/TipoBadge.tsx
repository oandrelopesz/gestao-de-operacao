import { Badge } from "@/components/ui/badge";
import { useAgencias, agenciaBadgeStyle } from "@/lib/agencias";
import { tipoDaFonte } from "@/lib/financeiro";
import { cn } from "@/lib/utils";

/** Tipo da fonte ("Agência", "Pessoal", "Freelancer") e, no freelancer, a agência atribuída na cor dela. */
export function TipoBadge({ tipo, agenciaId, className }: { tipo: string; agenciaId?: string | null; className?: string }) {
  const { meta } = useAgencias();
  const info = tipoDaFonte(tipo);
  const agencia = tipo === "freelancer" && agenciaId ? meta(agenciaId) : undefined;
  return (
    <>
      <Badge variant="outline" className={cn(className, info.classe)}>{info.label}</Badge>
      {agencia && (
        <Badge variant="outline" className={className} style={agenciaBadgeStyle(agencia.hex)}>{agencia.label}</Badge>
      )}
    </>
  );
}
