import { StickyNote } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TemasLista } from "@/components/temas/TemasLista";
import { apiTemasNotas } from "@/lib/notas";

const DESCRICAO = 'Os filtros da aba Notas, nesta ordem. Ao excluir um tema, as notas dele ficam em "Sem tema".';

/** Dialog do botão "Temas" na aba Notas. */
export function TemasNotasDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Temas das notas</DialogTitle>
          <DialogDescription>{DESCRICAO}</DialogDescription>
        </DialogHeader>
        {open && <TemasLista api={apiTemasNotas} />}
      </DialogContent>
    </Dialog>
  );
}

/** Card da seção "Notas" do Admin. */
export function NotasTemasCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><StickyNote size={18} /> Temas das notas</CardTitle>
        <CardDescription>{DESCRICAO}</CardDescription>
      </CardHeader>
      <CardContent>
        <TemasLista api={apiTemasNotas} />
      </CardContent>
    </Card>
  );
}
