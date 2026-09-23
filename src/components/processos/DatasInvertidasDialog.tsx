import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ordemValida, ordenarPassos, renumerar } from "@/lib/processos";
import { formatarDataCurta } from "@/lib/entrega";
import type { Passo } from "@/lib/processosService";

interface DatasInvertidasDialogProps {
  aberto: boolean;
  /** A lista inteira, já na nova ordem (depois de arrastar). */
  passos: Passo[];
  idsEmConflito: string[];
  onSalvar: (datas: Record<string, string | null>) => void | Promise<void>;
  onCancelar: () => void;
}

/** Popup aberto quando o arrastar deixa prazos invertidos: pede uma data nova para cada passo em conflito. */
export function DatasInvertidasDialog({ aberto, passos, idsEmConflito, onSalvar, onCancelar }: DatasInvertidasDialogProps) {
  const [datas, setDatas] = useState<Record<string, string | null>>({});
  const [salvando, setSalvando] = useState(false);

  // Pré-preenche com a data atual de cada passo em conflito sempre que o popup abre
  useEffect(() => {
    if (!aberto) return;
    const inicial: Record<string, string | null> = {};
    passos.forEach((p) => { if (idsEmConflito.includes(p.id)) inicial[p.id] = p.data; });
    setDatas(inicial);
    setSalvando(false);
  }, [aberto, passos, idsEmConflito]);

  const emConflito = useMemo(() => passos.filter((p) => idsEmConflito.includes(p.id)), [passos, idsEmConflito]);
  const comDatasNovas = useMemo(
    () => passos.map((p) => (p.id in datas ? { ...p, data: datas[p.id] } : p)),
    [passos, datas],
  );
  // Sem data pode ficar em qualquer lugar: ao gravar ele vai para o fim, então valida já normalizado
  // (renumerar antes, para não desfazer a ordem arrastada)
  const valida = ordemValida(ordenarPassos(renumerar(comDatasNovas)));

  // Vizinhos com data (fora do conflito) ajudam a escolher uma data que caiba na sequência
  const referencia = (id: string) => {
    const idx = comDatasNovas.findIndex((p) => p.id === id);
    const antes = [...comDatasNovas.slice(0, idx)].reverse().find((p) => p.data && !idsEmConflito.includes(p.id));
    const depois = comDatasNovas.slice(idx + 1).find((p) => p.data && !idsEmConflito.includes(p.id));
    return { antes: antes?.data ?? null, depois: depois?.data ?? null };
  };
  const br = formatarDataCurta;

  const salvar = async () => {
    if (!valida || salvando) return;
    setSalvando(true);
    try {
      await onSalvar(datas);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !salvando) onCancelar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock size={18} className="text-primary" />
            Ajustar as datas
          </DialogTitle>
          <DialogDescription>
            Você trocou a ordem de passos com datas. Escolha a nova data de cada um para os prazos não ficarem invertidos.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-2 max-h-[50vh] overflow-y-auto -mx-1 px-1">
          {emConflito.map((p) => {
            const posicao = passos.findIndex((x) => x.id === p.id) + 1;
            const valor = datas[p.id] ?? null;
            const { antes, depois } = referencia(p.id);
            return (
              <li key={p.id} className="rounded-lg border border-border/70 bg-muted/30 p-2.5 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {posicao}
                  </span>
                  <p className="text-sm font-medium leading-snug break-words">{p.titulo}</p>
                </div>
                <div className="flex items-center gap-1.5 pl-7">
                  <Input
                    type="date"
                    value={valor ?? ""}
                    min={antes ?? undefined}
                    max={depois ?? undefined}
                    onChange={(e) => setDatas((d) => ({ ...d, [p.id]: e.target.value || null }))}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant={valor === null ? "secondary" : "outline"}
                    size="sm"
                    className="h-8 shrink-0 px-2.5 text-xs"
                    onClick={() => setDatas((d) => ({ ...d, [p.id]: null }))}
                  >
                    sem data
                  </Button>
                </div>
                {(antes || depois) && (
                  <p className="pl-7 text-[11px] text-muted-foreground">
                    {antes && depois
                      ? `Entre ${br(antes)} e ${br(depois)}`
                      : antes
                        ? `A partir de ${br(antes)}`
                        : `Até ${br(depois!)}`}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        {!valida && (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 animate-fade-up dark:text-amber-400"
            aria-live="polite"
          >
            <AlertTriangle size={14} className="mt-px shrink-0" />
            <span>As datas ainda estão fora de ordem. Ajuste para que cada data não venha antes da anterior (ou use "sem data": o passo vai para o fim).</span>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={!valida || salvando} className="gap-1.5">
            {salvando && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
