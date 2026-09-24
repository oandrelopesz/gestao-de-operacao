import { useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface OpcaoEscolha { valor: string; rotulo: string }
interface Pedido {
  titulo: string;
  descricao?: string;
  opcoes: OpcaoEscolha[];
  confirmar: string;
  modo: "lista" | "botoes";
}

/** Pergunta com opções (lista com rádio ou um botão por opção). Resolve `null` se cancelar. */
export function useEscolha() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [valor, setValor] = useState("");
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const perguntar = (
    titulo: string,
    opcoes: OpcaoEscolha[],
    opts: { descricao?: string; confirmar?: string; modo?: "lista" | "botoes" } = {},
  ) =>
    new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      setValor(opcoes[0]?.valor ?? "");
      setPedido({ titulo, opcoes, descricao: opts.descricao, confirmar: opts.confirmar ?? "OK", modo: opts.modo ?? "lista" });
    });

  const fechar = (v: string | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setPedido(null);
  };

  const elemento = (
    <AlertDialog open={!!pedido} onOpenChange={(o) => { if (!o) fechar(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pedido?.titulo}</AlertDialogTitle>
          {pedido?.descricao && <AlertDialogDescription>{pedido.descricao}</AlertDialogDescription>}
        </AlertDialogHeader>
        {pedido?.modo === "lista" && (
          <RadioGroup value={valor} onValueChange={setValor} className="gap-3 py-1">
            {pedido.opcoes.map((o) => (
              <label key={o.valor} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <RadioGroupItem value={o.valor} /> {o.rotulo}
              </label>
            ))}
          </RadioGroup>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => fechar(null)}>Cancelar</AlertDialogCancel>
          {pedido?.modo === "botoes"
            ? pedido.opcoes.map((o, i) => (
              <AlertDialogAction
                key={o.valor}
                onClick={() => fechar(o.valor)}
                className={i < pedido.opcoes.length - 1 ? "bg-secondary text-secondary-foreground hover:bg-secondary/80" : undefined}
              >
                {o.rotulo}
              </AlertDialogAction>
            ))
            : <AlertDialogAction onClick={() => fechar(valor)}>{pedido?.confirmar}</AlertDialogAction>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { elemento, perguntar };
}
