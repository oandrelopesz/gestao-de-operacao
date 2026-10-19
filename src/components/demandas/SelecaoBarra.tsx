import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRightLeft, CalendarDays, Check, CheckSquare, Crown, Loader2, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientePicker, type DonoDemanda } from "@/components/demandas/ClientePicker";
import { NOMES_DIA, secaoId } from "@/lib/colunasDias";

interface ColunaDestino { id: string; title: string; hex: string; dias: number[] }

interface SelecaoBarraProps {
  qtd: number;
  /** Quantas dá para selecionar com "Selecionar todas" (abertas e visíveis) */
  qtdSelecionaveis: number;
  colunas: ColunaDestino[];
  clientes: { id: string; nome: string; agencia?: string }[];
  ocupado: boolean;
  onMover: (destino: string, rotulo: string) => void;
  onConcluir: () => void;
  onCliente: (valor: DonoDemanda) => void;
  onEntrega: (prazo: string | null) => void;
  /** Todas as selecionadas já têm a coroa: o botão tira em vez de pôr */
  todasPrioritarias?: boolean;
  onPrioridade?: (ligar: boolean) => void;
  onSelecionarTodas: () => void;
  onLimpar: () => void;
}

/** Barra flutuante das ações em massa das Demandas (aparece no modo "Selecionar" ou com cards marcados). */
export function SelecaoBarra({
  qtd, qtdSelecionaveis, colunas, clientes, ocupado, onMover, onConcluir, onCliente, onEntrega, todasPrioritarias, onPrioridade, onSelecionarTodas, onLimpar,
}: SelecaoBarraProps) {
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const semSelecao = qtd === 0;
  // Colunas por dia viram um destino por dia (ex.: "Fazer no fim de semana · Sábado")
  const destinos = colunas
    .filter((c) => c.id !== "recorrentes")
    .flatMap((c) =>
      c.dias.length > 1
        ? c.dias.map((d) => ({ id: secaoId(c.id, d), rotulo: `${c.title} · ${NOMES_DIA[d]}`, hex: c.hex }))
        : [{ id: c.dias.length === 1 ? secaoId(c.id, c.dias[0]) : c.id, rotulo: c.title, hex: c.hex }],
    );

  return (
    <div className="fixed bottom-5 left-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-xl">
        <span className="flex items-center gap-1.5 pr-1 text-sm font-semibold">
          {ocupado ? <Loader2 size={15} className="animate-spin text-primary" /> : <CheckSquare size={15} className="text-primary" />}
          {semSelecao ? "Clique nos cards para selecionar" : `${qtd} ${qtd === 1 ? "selecionada" : "selecionadas"}`}
        </span>
        {!semSelecao && <span className="hidden text-xs text-muted-foreground md:inline">· arraste uma para mover todas</span>}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {qtd < qtdSelecionaveis && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onSelecionarTodas} disabled={ocupado}>
              Selecionar todas ({qtdSelecionaveis})
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={semSelecao || ocupado}>
                <ArrowRightLeft size={13} /> Mover para
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="max-h-80 w-60 overflow-y-auto">
              <DropdownMenuLabel className="text-xs">Mover {qtd} para</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {destinos.map((d) => (
                <DropdownMenuItem key={d.id} className="gap-2 text-xs" onClick={() => onMover(d.id, d.rotulo)}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.hex }} /> {d.rotulo}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {onPrioridade && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              disabled={semSelecao || ocupado}
              onClick={() => onPrioridade(!todasPrioritarias)}
              title={todasPrioritarias ? "Tirar a prioridade das selecionadas" : "Marcar as selecionadas como prioridade"}
            >
              <Crown size={13} className={todasPrioritarias && !semSelecao ? "fill-amber-400 text-amber-500" : "text-amber-500"} />
              {todasPrioritarias && !semSelecao ? "Tirar prioridade" : "Prioridade"}
            </Button>
          )}

          <ClientePicker clientes={clientes} clienteIdAtual={null} variosClientes onEscolher={onCliente} align="end">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={semSelecao || ocupado}>
              <User size={13} /> Cliente
            </Button>
          </ClientePicker>

          <Popover open={calendarioAberto} onOpenChange={setCalendarioAberto}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={semSelecao || ocupado}>
                <CalendarDays size={13} /> Entrega
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end" side="top">
              <Calendar
                mode="single"
                locale={ptBR}
                onSelect={(date) => {
                  if (!date) return;
                  setCalendarioAberto(false);
                  onEntrega(format(date, "yyyy-MM-dd"));
                }}
              />
              <div className="border-t p-2">
                <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground"
                  onClick={() => { setCalendarioAberto(false); onEntrega(null); }}>
                  Sem data de entrega
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button size="sm" className="h-8 gap-1.5 bg-emerald-600 bg-none text-xs text-white shadow-none hover:bg-emerald-700" disabled={semSelecao || ocupado} onClick={onConcluir}>
            <Check size={13} /> Concluir
          </Button>

          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onLimpar} title="Sair da seleção (Esc)" aria-label="Sair da seleção">
            <X size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}
