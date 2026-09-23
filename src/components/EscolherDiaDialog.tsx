import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NOMES_DIA } from "@/lib/colunasDias";

/** Pergunta em que dia a demanda vai ser feita ao entrar numa coluna por dias. Fechar = desistir do movimento. */
export function EscolherDiaDialog({ aberto, titulo, dias, sugerido, onEscolher, onCancelar }: {
  aberto: boolean;
  titulo: string;
  dias: number[];
  sugerido: number | null;
  onEscolher: (dia: number) => void;
  onCancelar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onCancelar(); }}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Em que dia você vai fazer essa demanda?</DialogDescription>
        </DialogHeader>
        <div className={dias.length > 2 ? "grid grid-cols-3 gap-2 pt-2" : "grid grid-cols-2 gap-2 pt-2"}>
          {dias.map((dia) => (
            <Button key={dia} variant={dia === sugerido ? "default" : "outline"} className="h-12 text-base" onClick={() => onEscolher(dia)} autoFocus={dia === sugerido}>
              {NOMES_DIA[dia]}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
