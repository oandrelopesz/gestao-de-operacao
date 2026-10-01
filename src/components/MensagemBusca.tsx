import { cn } from "@/lib/utils";

/** Aviso da busca tolerante: "Sem resultado exato. Itens parecidos:" ou "Nenhum resultado encontrado.". Some quando não há aviso. */
export function MensagemBusca({
  resultado,
  className,
}: {
  resultado: { mensagem: string | null };
  className?: string;
}) {
  if (!resultado.mensagem) return null;
  return (
    <p role="status" className={cn("text-sm text-muted-foreground", className)}>
      {resultado.mensagem}
    </p>
  );
}
