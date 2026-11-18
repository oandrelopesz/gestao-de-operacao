import { Fragment } from "react";
import { pedacosWhatsapp } from "@/lib/radar";
import { cn } from "@/lib/utils";

// Só texto: o bot nunca injeta HTML.
export function TextoWhatsapp({ texto, className }: { texto: string; className?: string }) {
  return (
    <div className={cn("whitespace-pre-wrap break-words text-sm", className)}>
      {pedacosWhatsapp(texto).map((p, i) => {
        if ("quebra" in p) return <br key={i} />;
        let el: React.ReactNode = p.texto;
        if (p.riscado) el = <s>{el}</s>;
        if (p.italico) el = <em>{el}</em>;
        if (p.negrito) el = <strong>{el}</strong>;
        return <Fragment key={i}>{el}</Fragment>;
      })}
    </div>
  );
}
