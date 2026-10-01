import { CreditCard, QrCode, Receipt, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FORMAS_DE_PAGAMENTO, type FormaPagamento } from "@/lib/financeiroCobranca";

const ICONES: Record<FormaPagamento, LucideIcon> = { pix: QrCode, cartao: CreditCard, boleto: Receipt };

/** Forma de pagamento (PIX, Cartão ou Boleto) com ícone e texto; nada quando não foi informada. */
export function FormaBadge({ forma, className }: { forma: FormaPagamento | null | undefined; className?: string }) {
  if (!forma) return null;
  const Icone = ICONES[forma];
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", className)}>
      <Icone className="h-3 w-3" aria-hidden="true" />
      {FORMAS_DE_PAGAMENTO[forma]}
    </Badge>
  );
}
