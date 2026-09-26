// Topo do CRM: título, botões (Colunas, Novo lead), seletor de visão e filtros (período, critério, etiqueta, busca).
import { BarChart3, CalendarRange, Columns3, KanbanSquare, ListChecks, Plus, Search, Table2, Tag, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ATALHOS_PERIODO, type AtalhoPeriodo, type CriterioPeriodo, type FiltroCrm, type FiltroPeriodo } from "@/lib/crmPeriodo";

export type VisaoCrm = "fila" | "kanban" | "planilha" | "dashboard";

const VISOES: { id: VisaoCrm; rotulo: string; Icone: LucideIcon }[] = [
  { id: "fila", rotulo: "Fila do dia", Icone: ListChecks },
  { id: "kanban", rotulo: "Kanban", Icone: KanbanSquare },
  { id: "planilha", rotulo: "Planilha", Icone: Table2 },
  { id: "dashboard", rotulo: "Dashboard", Icone: BarChart3 },
];

/** Select com ícone à esquerda: valor logo depois do ícone e a seta no fim */
const SELECT_COM_ICONE = "justify-start gap-1.5 [&>svg:last-child]:ml-auto";

export function CrmTopo({
  visao,
  onVisao,
  filtro,
  onFiltro,
  qtd,
  onNovoLead,
  onColunas,
}: {
  visao: VisaoCrm;
  onVisao: (v: VisaoCrm) => void;
  filtro: FiltroCrm;
  onFiltro: (f: FiltroCrm) => void;
  qtd: number;
  onNovoLead: () => void;
  onColunas: () => void;
}) {
  const mudar = (parcial: Partial<FiltroCrm>) => onFiltro({ ...filtro, ...parcial });
  const mudarPeriodo = (parcial: Partial<FiltroPeriodo>) => mudar({ periodo: { ...filtro.periodo, ...parcial } });
  const { periodo } = filtro;

  return (
    <div className="flex flex-col gap-3 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight">CRM</h1>
          <p className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider">Funil de vendas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={onColunas}>
            <Columns3 size={14} /> Colunas
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-8" onClick={onNovoLead}>
            <Plus size={14} /> Novo lead
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={visao} onValueChange={(v) => onVisao(v as VisaoCrm)} className="w-full sm:w-auto">
          <TabsList aria-label="Visão do CRM" className="grid w-full grid-cols-4 h-auto sm:inline-flex sm:w-auto sm:h-9">
            {VISOES.map(({ id, rotulo, Icone }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="flex-col gap-0.5 px-1 py-1.5 text-[11px] sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1 sm:text-xs"
              >
                <Icone size={14} className="shrink-0" />
                {rotulo}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Select value={periodo.atalho} onValueChange={(v) => mudarPeriodo({ atalho: v as AtalhoPeriodo })}>
          <SelectTrigger aria-label="Período" className={`h-9 text-xs flex-1 min-w-[140px] sm:flex-none sm:w-[165px] ${SELECT_COM_ICONE}`}>
            <CalendarRange className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            {ATALHOS_PERIODO.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {periodo.atalho === "personalizado" && (
          <div className="flex w-full items-center gap-1.5 text-xs text-muted-foreground sm:w-auto">
            <span>De</span>
            <Input
              type="date"
              aria-label="Data inicial do período"
              value={periodo.de ?? ""}
              max={periodo.ate || undefined}
              onChange={(e) => mudarPeriodo({ de: e.target.value || null })}
              className="h-9 min-w-0 flex-1 md:text-xs sm:w-[145px] sm:flex-none"
            />
            <span>até</span>
            <Input
              type="date"
              aria-label="Data final do período"
              value={periodo.ate ?? ""}
              min={periodo.de || undefined}
              onChange={(e) => mudarPeriodo({ ate: e.target.value || null })}
              className="h-9 min-w-0 flex-1 md:text-xs sm:w-[145px] sm:flex-none"
            />
          </div>
        )}

        <Select value={periodo.criterio} onValueChange={(v) => mudarPeriodo({ criterio: v as CriterioPeriodo })}>
          <SelectTrigger
            aria-label="Critério do período"
            title="O período vale pela data de entrada do lead ou por qualquer movimentação no histórico"
            className="h-9 text-xs flex-1 min-w-[140px] sm:flex-none sm:w-[150px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="entrada">Data de entrada</SelectItem>
            <SelectItem value="movimentacao">Movimentação</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtro.trafego} onValueChange={(v) => mudar({ trafego: v as FiltroCrm["trafego"] })}>
          <SelectTrigger aria-label="Etiqueta" className={`h-9 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-[130px] ${SELECT_COM_ICONE}`}>
            <Tag className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="organico">Orgânico</SelectItem>
            <SelectItem value="pago">Pago</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Buscar leads"
            placeholder="Buscar nome, empresa, telefone ou e-mail"
            className="pl-9 h-9 md:text-xs"
            value={filtro.busca}
            onChange={(e) => mudar({ busca: e.target.value })}
          />
        </div>

        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap tabular-nums">
          {qtd} {qtd === 1 ? "lead" : "leads"}
        </span>
      </div>
    </div>
  );
}
