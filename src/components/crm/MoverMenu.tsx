// Botão "Mover": lista as outras colunas e pede o movimento (a janela da exigência abre pelo contexto).
import type { ReactNode, SyntheticEvent } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCrm } from "@/components/crm/CrmContexto";
import type { LeadCrm } from "@/lib/crmTipos";

const parar = (e: SyntheticEvent) => e.stopPropagation();

export function MoverMenu({ lead, children }: { lead: LeadCrm; children?: ReactNode }) {
  const { colunas, colunaDoLead, pedirMovimento } = useCrm();
  const atual = colunaDoLead(lead);
  const destinos = colunas.filter((c) => c.id !== atual?.id);

  // O span segura clique, toque e teclas (inclusive os do menu, que sobem pela árvore do React)
  // para não arrastar nem abrir a ficha do card.
  return (
    <span onPointerDown={parar} onClick={parar} onKeyDown={parar} className="inline-flex">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {children ?? (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
              <ArrowRightLeft size={12} /> Mover
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
          <DropdownMenuLabel className="text-xs">Mover {lead.nome} para</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {destinos.length === 0 ? (
            <DropdownMenuItem disabled className="text-xs">
              Nenhuma outra coluna
            </DropdownMenuItem>
          ) : (
            destinos.map((c) => (
              <DropdownMenuItem
                key={c.id}
                className="gap-2 text-xs"
                onSelect={() => pedirMovimento(lead, c.id)}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.hex }}
                  aria-hidden
                />
                <span className="truncate">{c.titulo}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
