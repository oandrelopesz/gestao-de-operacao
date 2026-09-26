import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TemasLista } from "@/components/temas/TemasLista";
import { apiTemasFluxo } from "@/lib/fluxosDados";

/** Dialog do botão "Temas" na aba Fluxogramas. */
export function TemasFluxoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Temas dos quadros</DialogTitle>
          <DialogDescription>Os filtros da aba Fluxogramas, nesta ordem. Ao excluir um tema, os quadros dele ficam em "Sem tema".</DialogDescription>
        </DialogHeader>
        {open && <TemasLista api={apiTemasFluxo} />}
      </DialogContent>
    </Dialog>
  );
}
