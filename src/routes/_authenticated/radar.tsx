// Aba Radar IA (Pessoal): a nota de cada dia com os achados do bot de pesquisa.
// Filtros e visão ficam na URL (lerFiltros/filtrosParaSearch em src/lib/radar.ts). Dados: src/lib/radarDados.ts.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { lerFiltros, filtrosParaSearch, VISOES, type Filtros, type StatusAchado, type Visao } from "@/lib/radar";
import { useAchadosRadar, useAtualizarAchado } from "@/lib/radarDados";
import { BarraFiltros } from "@/components/radar/BarraFiltros";
import { VisaoDia } from "@/components/radar/VisaoDia";
import { VisaoCards } from "@/components/radar/VisaoCards";
import { VisaoTabela } from "@/components/radar/VisaoTabela";
import { VisaoCalendario } from "@/components/radar/VisaoCalendario";
import { VisaoKanban } from "@/components/radar/VisaoKanban";

type Busca = Record<string, string | number>;

function paraUrl(f: Filtros): Busca {
  const s: Busca = filtrosParaSearch(f);
  if (f.alerta) s.alerta = 1; // número: o roteador grava alerta=1 sem aspas na URL
  return s;
}

export const Route = createFileRoute("/_authenticated/radar")({
  validateSearch: (s: Record<string, unknown>): Busca => paraUrl(lerFiltros(s)),
  component: RadarPage,
});

function RadarPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filtros = useMemo(() => lerFiltros(search), [search]);
  const mudar = useCallback(
    (f: Filtros, opcoes?: { substituir?: boolean }) => navigate({ search: paraUrl(f), replace: opcoes?.substituir }),
    [navigate],
  );

  const atualizar = useAtualizarAchado();
  const onStatus = useCallback((id: string, status: StatusAchado) => atualizar.mutate({ id, status }), [atualizar]);
  const onNota = useCallback((id: string, nota_pessoal: string) => atualizar.mutate({ id, nota_pessoal: nota_pessoal || null }), [atualizar]);

  const emLista = filtros.view === "cards" || filtros.view === "tabela" || filtros.view === "kanban";
  // ponytail: até 500 achados por consulta (limite em useAchadosRadar); paginar por dia quando passar disso
  const lista = useAchadosRadar(filtros, emLista);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Radar IA</h1>
        <p className="text-muted-foreground text-sm">A nota de cada dia com os achados do bot: o que é, como te afeta e o próximo passo.</p>
      </div>

      <Tabs value={filtros.view} onValueChange={(v) => mudar({ ...filtros, view: v as Visao })}>
        <TabsList className="max-w-full overflow-x-auto justify-start">
          {VISOES.map((v) => (
            <TabsTrigger key={v.valor} value={v.valor} className="min-h-11 md:min-h-0">{v.rotulo}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <BarraFiltros filtros={filtros} onChange={mudar} />

      {filtros.view === "dia" && <VisaoDia filtros={filtros} onChange={mudar} onStatus={onStatus} onNota={onNota} />}
      {filtros.view === "calendario" && <VisaoCalendario filtros={filtros} onChange={mudar} />}
      {emLista && lista.isPending && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {emLista && lista.isError && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-destructive">Não foi possível carregar os achados.</span>
          <Button variant="outline" size="sm" onClick={() => lista.refetch()}>Tentar de novo</Button>
        </div>
      )}
      {emLista && lista.data && (
        <>
          {filtros.view === "cards" && <VisaoCards achados={lista.data} onStatus={onStatus} onNota={onNota} />}
          {filtros.view === "tabela" && (
            <VisaoTabela achados={lista.data} onAbrirDia={(dia) => mudar({ ...filtros, dia, de: undefined, ate: undefined, view: "dia" })} />
          )}
          {filtros.view === "kanban" && <VisaoKanban achados={lista.data} onStatus={onStatus} />}
        </>
      )}
    </div>
  );
}
