// Coluna do Kanban do CRM: cabeçalho (cor, nome, quantidade, tipo, total em R$, selecionar todos) e a lista
// de cards (área de soltar + SortableContext).
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useCrm } from "@/components/crm/CrmContexto";
import { CardLead } from "@/components/crm/CardLead";
import { rotuloTipo } from "@/lib/crmColunas";
import { formatarReais } from "@/lib/crmFormato";
import type { ColunaCrm, LeadCrm } from "@/lib/crmTipos";
import { cn } from "@/lib/utils";

interface ColunaKanbanProps {
  coluna: ColunaCrm;
  leads: LeadCrm[];
  selecionados: Set<string>;
  onSelecionar: (id: string, marcado: boolean) => void;
  onSelecionarColuna: (ids: string[], marcado: boolean) => void;
}

/** Total em R$ do cabeçalho: ganho soma o fechado; proposta e follow-up de proposta somam a proposta. */
function totalDaColuna(coluna: ColunaCrm, leads: LeadCrm[]): number {
  const campo =
    coluna.tipo === "ganho"
      ? "valor_fechamento"
      : coluna.tipo === "proposta" || coluna.tipo === "follow_up_proposta"
        ? "valor_proposta"
        : null;
  if (!campo) return 0;
  return leads.reduce((s, l) => s + (Number(l[campo]) || 0), 0);
}

export function ColunaKanban({
  coluna,
  leads,
  selecionados,
  onSelecionar,
  onSelecionarColuna,
}: ColunaKanbanProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: coluna.id,
    data: { type: "Column", columnId: coluna.id },
  });
  const { abrirExportacao } = useCrm();
  const ids = leads.map((l) => l.id);
  const algumSelecionado = selecionados.size > 0;
  const todosMarcados = ids.length > 0 && ids.every((id) => selecionados.has(id));
  const total = totalDaColuna(coluna, leads);

  return (
    <section
      aria-label={coluna.titulo}
      className="group/coluna flex h-full max-h-full w-72 shrink-0 flex-col max-lg:w-[85vw] max-lg:max-w-80 max-lg:snap-start"
    >
      <header className="mb-2 shrink-0 space-y-0.5 px-1.5">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: coluna.hex }}
            aria-hidden
          />
          <h3
            className="min-w-0 truncate text-sm font-bold text-foreground/85"
            title={coluna.titulo}
          >
            {coluna.titulo}
          </h3>
          <span
            className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
            aria-label={`${leads.length} ${leads.length === 1 ? "lead" : "leads"}`}
          >
            {leads.length}
          </span>
          <button
            type="button"
            className={cn(
              "shrink-0 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100",
              "ml-auto",
              "opacity-0 group-hover/coluna:opacity-100 pointer-coarse:opacity-100",
            )}
            onClick={() => abrirExportacao({ tipo: "coluna", colunaId: coluna.id })}
            title={`Exportar a coluna ${coluna.titulo}`}
            aria-label={`Exportar a coluna ${coluna.titulo}`}
          >
            <Download size={13} />
          </button>
          {ids.length > 0 && (
            <Checkbox
              className={cn(
                "shrink-0 transition-opacity",
                algumSelecionado || todosMarcados
                  ? "opacity-100"
                  : "opacity-0 focus-visible:opacity-100 group-hover/coluna:opacity-100 pointer-coarse:opacity-100",
              )}
              checked={todosMarcados}
              onCheckedChange={(v) => onSelecionarColuna(ids, v === true)}
              aria-label={
                todosMarcados
                  ? `Desmarcar todos de ${coluna.titulo}`
                  : `Selecionar todos de ${coluna.titulo}`
              }
              title={todosMarcados ? "Desmarcar todos da coluna" : "Selecionar todos da coluna"}
            />
          )}
        </div>
        <p className="flex items-center gap-1.5 pl-[18px] text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="truncate">{rotuloTipo(coluna.tipo)}</span>
          {total > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0 font-semibold normal-case tracking-normal text-emerald-600 dark:text-emerald-400">
                {formatarReais(total)}
              </span>
            </>
          )}
        </p>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/60 bg-card/60 p-2 backdrop-blur-sm transition-colors",
          isOver && "border-primary/40 bg-primary/5",
        )}
      >
        <SortableContext id={coluna.id} items={ids} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <CardLead
              key={lead.id}
              lead={lead}
              selecionado={selecionados.has(lead.id)}
              algumSelecionado={algumSelecionado}
              onSelecionar={onSelecionar}
            />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <p className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border/70 text-xs text-muted-foreground">
            Nenhum lead aqui
          </p>
        )}
      </div>
    </section>
  );
}
