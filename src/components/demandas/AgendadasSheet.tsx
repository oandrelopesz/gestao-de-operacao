// Painel lateral das tarefas agendadas (botão "Agendadas" das Demandas): ver, abrir, editar, marcar como feita e excluir.
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatarDataCurta, hojeBrasilia, siglaDoDia } from "@/lib/entrega";
import { resumoAgendada } from "@/lib/agendadas";

interface AgendadasSheetProps {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Já ordenadas pela data */
  agendadas: any[];
  onAgendar: () => void;
  onAbrir: (d: any) => void;
  onEditar: (d: any) => void;
  onConcluir: (d: any) => void;
  onExcluir: (d: any) => void;
}

export function AgendadasSheet({ aberto, onOpenChange, agendadas, onAgendar, onAbrir, onEditar, onConcluir, onExcluir }: AgendadasSheetProps) {
  const hoje = hojeBrasilia();
  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>Tarefas agendadas</SheetTitle>
          <SheetDescription>Cada uma desce sozinha para Fazer depois de amanhã 2 dias antes da data.</SheetDescription>
        </SheetHeader>
        <Button size="sm" className="gap-1.5 self-start" onClick={onAgendar}>
          <Plus size={14} />
          Agendar tarefa
        </Button>
        <div className="flex-1 overflow-y-auto -mx-2">
          {agendadas.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2 py-8 text-center">Nenhuma tarefa agendada.</p>
          ) : (
            <ul className="divide-y">
              {agendadas.map((d) => (
                <li key={d.id} className="flex items-start gap-3 px-2 py-3">
                  <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onAbrir(d)}>
                    <div className="text-sm font-medium truncate">{d.titulo}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {siglaDoDia(d.prazo)} {formatarDataCurta(d.prazo)}
                      {d.pessoal ? " · Pessoal" : d.clientes?.nome ? ` · ${d.clientes.nome}` : ""}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{resumoAgendada(d.prazo, hoje)}</div>
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" aria-label="Editar" onClick={() => onEditar(d)}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Marcar como feita" aria-label="Marcar como feita" onClick={() => onConcluir(d)}>
                      <Check size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Excluir" aria-label="Excluir" onClick={() => onExcluir(d)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
