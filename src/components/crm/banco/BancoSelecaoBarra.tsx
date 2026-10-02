// Barra flutuante das ações em massa do Banco de leads (layout de SelecaoBarraCrm). Vai para o <body> (portal).
import { useState } from "react";
import { createPortal } from "react-dom";
import { CheckSquare, Loader2, Send, ShieldCheck, ShieldX, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function BancoSelecaoBarra({
  quantidade,
  onEnviarAoCrm,
  onValido,
  onExcluir,
  onLimpar,
}: {
  quantidade: number;
  onEnviarAoCrm: () => Promise<void>;
  onValido: (valido: boolean) => Promise<void>;
  onExcluir: () => Promise<void>;
  onLimpar: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const qtd = `${quantidade} ${quantidade === 1 ? "lead" : "leads"}`;
  const executar = async (f: () => Promise<void>) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await f();
    } finally {
      setOcupado(false);
      setConfirmar(false);
      onLimpar();
    }
  };

  const barra = (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-xl">
        <span className="flex items-center gap-1.5 pr-1 text-sm font-semibold" aria-live="polite">
          {ocupado ? <Loader2 size={15} className="animate-spin text-primary" /> : <CheckSquare size={15} className="text-primary" />}
          {quantidade} {quantidade === 1 ? "selecionado" : "selecionados"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={ocupado} onClick={() => void executar(onEnviarAoCrm)} title={`Enviar ${qtd} ao CRM (Primeiro contato)`}>
            <Send size={13} /> Enviar ao CRM
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={ocupado} onClick={() => void executar(() => onValido(true))}>
            <ShieldCheck size={13} /> Válido
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={ocupado} onClick={() => void executar(() => onValido(false))}>
            <ShieldX size={13} /> Inválido
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive" disabled={ocupado} onClick={() => setConfirmar(true)}>
            <Trash2 size={13} /> Excluir
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={ocupado} onClick={onLimpar} aria-label="Limpar seleção" title="Limpar seleção">
            <X size={15} />
          </Button>
        </div>
      </div>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {qtd}?</AlertDialogTitle>
            <AlertDialogDescription>As linhas saem da planilha. Leads que estão no CRM continuam lá.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void executar(onExcluir)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(barra, document.body);
}
