import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DIAS_FDS, ROTULO_DIA, type DiaFds } from "@/lib/fimDeSemana";

/** Pergunta em que dia do fim de semana a demanda vai ser feita. Fechar = desistir do movimento. */
export function EscolherDiaDialog({ aberto, sugerido, onEscolher, onCancelar }: {
  aberto: boolean;
  sugerido: DiaFds;
  onEscolher: (dia: DiaFds) => void;
  onCancelar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onCancelar(); }}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Fazer no fim de semana</DialogTitle>
          <DialogDescription>Em que dia você vai fazer essa demanda?</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 pt-2">
          {DIAS_FDS.map((dia) => (
            <Button key={dia} variant={dia === sugerido ? "default" : "outline"} className="h-12 text-base" onClick={() => onEscolher(dia)} autoFocus={dia === sugerido}>
              {ROTULO_DIA[dia]}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
