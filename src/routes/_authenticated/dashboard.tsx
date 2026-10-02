import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CheckCircle2, Users, User, CalendarRange, ChevronRight, X, Inbox, Building2, AlertTriangle, MoreVertical, Undo2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClientePicker, type DonoDemanda } from "@/components/demandas/ClientePicker";
import { cn } from "@/lib/utils";
import { hojeBrasilia } from "@/lib/entrega";
import {
  agenciaDaConclusao,
  agregar,
  agregarPorAgencia,
  chaveDaConclusao,
  dataLocalBrasilia,
  entreguesComAtraso,
  intervaloDoPeriodo,
  PREFIXO_AGENCIA,
  type Conclusao,
  type PeriodoId,
} from "@/lib/dashboard";
import { useAgencias } from "@/lib/agencias";
import { expandirPorCliente } from "@/lib/clientesDaDemanda";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

interface ConclusaoRow extends Conclusao {
  id: string;
  /** Nulo quando a demanda já foi excluída da aba Demandas (o registro da conclusão fica) */
  demanda_id: string | null;
  titulo: string | null;
  clientes_extras?: string[] | null;
  /** Cliente principal da demanda: numa demanda de vários clientes, cada entrada tem um `cliente_id` diferente */
  cliente_principal?: string | null;
}

/** Chave única de uma entrada (a mesma conclusão aparece uma vez por cliente) */
const chaveItem = (c: ConclusaoRow) => `${c.id}:${c.cliente_id ?? ""}`;

/** Seleção que lista todas as concluídas do período (clique no cartão "Concluídas no período") */
const SEL_TODAS = "todas";

const PERIODOS: { id: PeriodoId; label: string }[] = [
  { id: "7", label: "7 dias" },
  { id: "14", label: "14 dias" },
  { id: "30", label: "30 dias" },
  { id: "60", label: "60 dias" },
  { id: "90", label: "90 dias" },
  { id: "tudo", label: "Tudo" },
  { id: "personalizado", label: "Personalizado" },
];

const CHAVE_PERIODO = "dashboard_periodo";
const CHAVE_DE = "dashboard_periodo_de";
const CHAVE_ATE = "dashboard_periodo_ate";
const PAGINA = 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

function lerStorage(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarStorage(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    /* navegador sem storage: segue sem lembrar */
  }
}

/** Soma dias a uma data YYYY-MM-DD (em UTC, sem fuso). */
function somarDias(iso: string, dias: number): string {
  const ms = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return new Date(ms + dias * DIA_MS).toISOString().slice(0, 10);
}

const formatarData = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

const formatarDataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** Linhas do bloco "Por agência" são selecionadas com este prefixo (as da tabela por cliente usam a chave do grupo) */
const PREFIXO_SEL_AGENCIA = "ag:";

const formatarPct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function DashboardPage() {
  const [periodo, setPeriodo] = useState<PeriodoId>(() => {
    const salvo = lerStorage(CHAVE_PERIODO);
    return PERIODOS.some((p) => p.id === salvo) ? (salvo as PeriodoId) : "30";
  });
  const [de, setDe] = useState<string>(() => lerStorage(CHAVE_DE) ?? "");
  const [ate, setAte] = useState<string>(() => lerStorage(CHAVE_ATE) ?? "");
  const [hoje, setHoje] = useState(() => hojeBrasilia());
  const [conclusoes, setConclusoes] = useState<ConclusaoRow[]>([]);
  const [clientes, setClientes] = useState<{ id: string; nome: string; agencia: string | null }[]>([]);
  const [clientesArquivados, setClientesArquivados] = useState<{ id: string; nome: string; agencia: string | null }[]>([]);
  const { agencias, todasAgencias, meta: metaAgencia } = useAgencias();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const detalheRef = useRef<HTMLDivElement>(null);

  useEffect(() => gravarStorage(CHAVE_PERIODO, periodo), [periodo]);
  useEffect(() => gravarStorage(CHAVE_DE, de), [de]);
  useEffect(() => gravarStorage(CHAVE_ATE, ate), [ate]);

  // Intervalo em datas de Brasília; no personalizado, de/até invertidos são trocados
  const intervalo = useMemo(() => {
    const r = intervaloDoPeriodo(periodo, hoje, de || undefined, ate || undefined);
    if (r.de && r.ate && r.de > r.ate) return { de: r.ate, ate: r.de };
    return r;
  }, [periodo, hoje, de, ate]);

  // Evita que uma resposta antiga sobrescreva a mais nova
  const seq = useRef(0);

  const carregar = useCallback(async () => {
    const minha = ++seq.current;
    setHoje(hojeBrasilia());
    try {
      const linhas: ConclusaoRow[] = [];
      for (let inicio = 0; ; inicio += PAGINA) {
        let q = supabase
          .from("demanda_conclusoes")
          .select("id, demanda_id, cliente_id, clientes_extras, pessoal, agencia_id, prazo, titulo, concluida_em")
          .order("concluida_em", { ascending: false })
          .range(inicio, inicio + PAGINA - 1);
        // Folga de um dia em UTC; o recorte exato por data de Brasília é feito abaixo
        if (intervalo.de) q = q.gte("concluida_em", `${somarDias(intervalo.de, -1)}T00:00:00Z`);
        if (intervalo.ate) q = q.lt("concluida_em", `${somarDias(intervalo.ate, 2)}T00:00:00Z`);
        const { data, error } = await q;
        if (error) throw error;
        linhas.push(...((data ?? []) as ConclusaoRow[]));
        if (!data || data.length < PAGINA) break;
      }

      const { data: cli, error: errCli } = await supabase
        .from("clientes")
        .select("id, nome, agencia")
        .eq("arquivado", false)
        .order("nome");
      if (errCli) throw errCli;

      // Demanda de mais de um cliente conta uma vez para cada cliente (uma entrada por cliente)
      const noPeriodo = expandirPorCliente(
        linhas.filter((c) => {
          const d = dataLocalBrasilia(c.concluida_em);
          return (!intervalo.de || d >= intervalo.de) && (!intervalo.ate || d <= intervalo.ate);
        }),
      );

      // Clientes arquivados com conclusões no período também ganham linha (e barra/detalhe)
      const ativos = cli ?? [];
      const idsAtivos = new Set(ativos.map((c) => c.id));
      const idsFaltantes = [
        ...new Set(noPeriodo.map((c) => c.cliente_id).filter((id): id is string => !!id && !idsAtivos.has(id))),
      ];
      let arquivados: { id: string; nome: string; agencia: string | null }[] = [];
      if (idsFaltantes.length > 0) {
        const { data: arq, error: errArq } = await supabase.from("clientes").select("id, nome, agencia").in("id", idsFaltantes);
        if (errArq) throw errArq;
        arquivados = (arq ?? []).map((c) => ({ id: c.id, nome: `${c.nome} (arquivado)`, agencia: c.agencia }));
      }

      if (minha !== seq.current) return;
      setConclusoes(noPeriodo);
      setClientes(ativos);
      setClientesArquivados(arquivados);
      setErro(null);
    } catch (e: any) {
      if (minha !== seq.current) return;
      console.error("Erro ao carregar o dashboard:", e);
      setErro(e?.message ?? "Não foi possível carregar o dashboard.");
    } finally {
      if (minha === seq.current) setLoading(false);
    }
  }, [intervalo.de, intervalo.ate]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Tempo real: qualquer entrada/saída de Feito recarrega; ao voltar para a aba também
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-conclusoes")
      .on("postgres_changes", { event: "*", schema: "public", table: "demanda_conclusoes" }, () => {
        carregarRef.current();
      })
      .subscribe();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") carregarRef.current();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      supabase.removeChannel(channel);
    };
  }, []);

  const { total, linhas } = useMemo(
    () => agregar(conclusoes, [...clientes, ...clientesArquivados], todasAgencias),
    [conclusoes, clientes, clientesArquivados, todasAgencias],
  );

  // Por agência: as demandas da própria agência + as dos clientes dela (agência atual do cliente)
  const agenciaDoCliente = useMemo(
    () => new Map([...clientes, ...clientesArquivados].map((c) => [c.id, c.agencia] as const)),
    [clientes, clientesArquivados],
  );
  const porAgencia = useMemo(
    () => agregarPorAgencia(conclusoes, agenciaDoCliente, agencias),
    [conclusoes, agenciaDoCliente, agencias],
  );
  const atraso = useMemo(() => entreguesComAtraso(conclusoes), [conclusoes]);

  const nomeCliente = useMemo(
    () => new Map([...clientes, ...clientesArquivados].map((c) => [c.id, c.nome] as const)),
    [clientes, clientesArquivados],
  );
  const nomeDono = (c: Conclusao) =>
    c.pessoal
      ? "Pessoal"
      : c.agencia_id
        ? `${metaAgencia(c.agencia_id)?.label ?? c.agencia_id} (agência)`
        : c.cliente_id
          ? nomeCliente.get(c.cliente_id) ?? "Cliente removido"
          : "Sem cliente";

  const idsClientes = useMemo(() => new Set(clientes.map((c) => c.id)), [clientes]);
  const clientesAtendidos = linhas.filter((l) => l.total > 0 && idsClientes.has(l.chave)).length;
  const linhaPessoal = linhas.find((l) => l.chave === "pessoal");
  const pessoal = linhaPessoal?.total ?? 0;
  const lider = linhas[0] && linhas[0].total > 0 ? linhas[0] : null;

  const top10 = useMemo(() => linhas.filter((l) => l.total > 0).slice(0, 10), [linhas]);
  const maxPct = linhas.reduce((m, l) => Math.max(m, l.percentual), 0);

  // A seleção vem da tabela por cliente (chave do grupo), do bloco Por agência ("ag:" + id da agência) ou do cartão
  // "Concluídas no período" (todas)
  const agenciaSelecionada = selecionado?.startsWith(PREFIXO_SEL_AGENCIA) ? selecionado.slice(PREFIXO_SEL_AGENCIA.length) : null;
  const todasSelecionadas = selecionado === SEL_TODAS;
  const linhaSelecionada =
    (todasSelecionadas
      ? total > 0
        ? { chave: SEL_TODAS, nome: "Todas as concluídas", total, percentual: 100 }
        : null
      : agenciaSelecionada
        ? porAgencia.find((l) => l.chave === agenciaSelecionada)
        : linhas.find((l) => l.chave === selecionado)) ?? null;
  const detalhe = useMemo(() => {
    if (!selecionado) return [];
    if (selecionado === SEL_TODAS) return conclusoes;
    if (agenciaSelecionada) {
      return conclusoes.filter((c) => (agenciaDaConclusao(c, agenciaDoCliente) ?? "sem_agencia") === agenciaSelecionada);
    }
    return conclusoes.filter((c) => chaveDaConclusao(c) === selecionado);
  }, [conclusoes, selecionado, agenciaSelecionada, agenciaDoCliente]);

  // Linha selecionada sumiu (ex.: período mudou e o grupo não existe mais): fecha o detalhe
  useEffect(() => {
    if (selecionado && !loading && !linhaSelecionada) setSelecionado(null);
  }, [linhaSelecionada, selecionado, loading]);

  const selecionar = (chave: string) => {
    setSelecionado((atual) => (atual === chave ? null : chave));
    requestAnimationFrame(() => detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  // ---------------------------------------------------------------- Ações numa demanda concluída
  const [excluindo, setExcluindo] = useState<ConclusaoRow | null>(null);
  const clientesDoSeletor = useMemo(() => clientes.map((c) => ({ id: c.id, nome: c.nome })), [clientes]);

  /** Desfazer: a demanda sai de Feito e volta para o fim de Fazer hoje (o banco apaga a conclusão do log). */
  const desfazer = async (c: ConclusaoRow) => {
    if (!c.demanda_id) return;
    try {
      const { data: ultima, error: e1 } = await supabase
        .from("demandas")
        .select("ordem")
        .eq("status", "fazer_hoje")
        .order("ordem", { ascending: false })
        .limit(1);
      if (e1) throw e1;
      const { error } = await supabase
        .from("demandas")
        .update({ status: "fazer_hoje", ordem: (ultima?.[0]?.ordem ?? -1) + 1 })
        .eq("id", c.demanda_id);
      if (error) throw error;
      toast.success("Conclusão desfeita: a demanda voltou para Fazer hoje.");
      carregar();
    } catch (e) {
      console.error("Erro ao desfazer a conclusão:", e);
      toast.error("Não foi possível desfazer a conclusão.");
    }
  };

  /** Trocar cliente, Pessoal ou agência: muda a demanda, e o banco acompanha no log. */
  const trocarDono = async (c: ConclusaoRow, valor: DonoDemanda) => {
    if (!c.demanda_id) return;
    const { error } = await supabase.from("demandas").update(valor).eq("id", c.demanda_id);
    if (error) {
      console.error("Erro ao trocar o dono da demanda:", error);
      toast.error("Não foi possível trocar o cliente.");
      return;
    }
    toast.success("Demanda atualizada.");
    carregar();
  };

  /**
   * Excluir: apaga a demanda (aba Demandas) e o registro da conclusão, como se nunca tivesse sido feita.
   * A demanda sai primeiro: se o segundo passo falhar, sobra só o registro, que dá para remover de novo.
   */
  const excluir = async (c: ConclusaoRow) => {
    try {
      if (c.demanda_id) {
        const { error } = await supabase.from("demandas").delete().eq("id", c.demanda_id);
        if (error) throw error;
      }
      const { error } = await supabase.from("demanda_conclusoes").delete().eq("id", c.id);
      if (error) throw error;
      toast.success(c.demanda_id ? "Demanda excluída." : "Removida do histórico.");
      carregar();
    } catch (e) {
      console.error("Erro ao excluir a demanda:", e);
      toast.error("Não foi possível excluir.");
      carregar();
    }
  };

  const acoesDaConclusao = (c: ConclusaoRow) => (
    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity">
      {c.demanda_id && (
        <ClientePicker
          clientes={clientesDoSeletor}
          clienteIdAtual={c.cliente_principal ?? c.cliente_id}
          pessoalAtual={c.pessoal}
          agenciaIdAtual={c.agencia_id}
          clientesExtrasAtuais={c.clientes_extras}
          variosClientes
          onEscolher={(valor) => trocarDono(c, valor)}
          align="end"
        >
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Trocar cliente ou agência">
            <UserPlus size={14} />
          </Button>
        </ClientePicker>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Mais ações">
            <MoreVertical size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px] text-xs">
          {c.demanda_id && (
            <DropdownMenuItem onClick={() => desfazer(c)} className="gap-2 py-1.5">
              <Undo2 size={12} /> Desfazer conclusão
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setExcluindo(c)} className="gap-2 py-1.5 text-destructive focus:text-destructive">
            <Trash2 size={12} /> {c.demanda_id ? "Excluir demanda" : "Remover do histórico"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const descricaoPeriodo = (() => {
    if (!intervalo.de && !intervalo.ate) return "Todo o histórico";
    if (intervalo.de && intervalo.ate) {
      return intervalo.de === intervalo.ate
        ? formatarData(intervalo.de)
        : `${formatarData(intervalo.de)} a ${formatarData(intervalo.ate)}`;
    }
    if (intervalo.de) return `Desde ${formatarData(intervalo.de)}`;
    return `Até ${formatarData(intervalo.ate!)}`;
  })();

  const alturaGrafico = Math.max(top10.length * 40 + 24, 120);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Demandas concluídas por cliente</p>
        </div>
        <div className="flex flex-col items-start lg:items-end gap-2">
          <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  periodo === p.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {periodo === "personalizado" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">De</span>
              <Input type="date" value={de} max={ate || hoje} onChange={(e) => setDe(e.target.value)} className="h-8 w-[150px]" />
              <span className="text-muted-foreground">até</span>
              <Input type="date" value={ate} min={de || undefined} max={hoje} onChange={(e) => setAte(e.target.value)} className="h-8 w-[150px]" />
              {(de || ate) && (
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { setDe(""); setAte(""); }}>
                  Limpar
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <CalendarRange size={13} /> {descricaoPeriodo}
          </p>
        </div>
      </div>

      {erro && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{erro}</span>
            <Button variant="outline" size="sm" onClick={() => carregar()}>Tentar de novo</Button>
          </CardContent>
        </Card>
      )}

      {/* Cartões de resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ResumoCard
          titulo="Concluídas no período"
          valor={total}
          icone={<CheckCircle2 size={18} className="text-emerald-500" />}
          detalhe={lider ? `Mais concluídas: ${lider.nome} (${formatarPct(lider.percentual)})` : "Nenhuma ainda"}
          loading={loading}
          onClick={total > 0 ? () => selecionar(SEL_TODAS) : undefined}
          titulo_acao="Ver todas as concluídas (e excluir ou desfazer)"
        />
        <ResumoCard
          titulo="Clientes atendidos"
          valor={clientesAtendidos}
          icone={<Users size={18} className="text-primary" />}
          detalhe={`de ${clientes.length} cliente${clientes.length === 1 ? "" : "s"} ativo${clientes.length === 1 ? "" : "s"}`}
          loading={loading}
        />
        <ResumoCard
          titulo="Pessoal"
          valor={pessoal}
          icone={<User size={18} className="text-violet-500" />}
          detalhe={total > 0 ? `${formatarPct(linhaPessoal?.percentual ?? 0)} do total` : "Demandas marcadas como Pessoal"}
          loading={loading}
        />
        <ResumoCard
          titulo="Entregues com atraso"
          valor={atraso.atrasadas.length}
          icone={<AlertTriangle size={18} className="text-red-500" />}
          detalhe={total > 0 ? `${formatarPct(atraso.percentual)} das ${total} concluídas` : "Concluídas depois da data de entrega"}
          loading={loading}
        />
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-[320px] lg:col-span-2" />
          <Skeleton className="h-[320px] lg:col-span-3" />
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <div className="bg-muted rounded-full p-4"><Inbox size={36} className="text-muted-foreground" /></div>
          <h3 className="text-lg font-medium">Nenhuma demanda concluída neste período.</h3>
          <p className="text-muted-foreground max-w-sm text-sm">As demandas passam a contar quando vão para Feito.</p>
        </div>
      ) : (
        <>
        {/* Por agência: % das concluídas do período (demandas da agência + dos clientes dela) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Building2 size={16} /> Por agência</CardTitle>
            <CardDescription>
              Quanto cada agência representa das {total} demandas concluídas: as atribuídas à agência mais as dos clientes dela. Clique para ver as demandas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {porAgencia
                .filter((l) => l.total > 0)
                .map((l) => (
                  <div
                    key={l.chave}
                    className="h-full bg-slate-400 first:rounded-l-full last:rounded-r-full"
                    style={{ width: `${(l.total / total) * 100}%`, backgroundColor: metaAgencia(l.chave)?.hex }}
                    title={`${l.nome}: ${formatarPct(l.percentual)}`}
                  />
                ))}
            </div>
            <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
              {porAgencia.map((l) => {
                const chave = PREFIXO_SEL_AGENCIA + l.chave;
                const hex = metaAgencia(l.chave)?.hex;
                return (
                  <button
                    key={l.chave}
                    type="button"
                    onClick={() => selecionar(chave)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                      selecionado === chave && "border-primary bg-primary/5",
                      l.total === 0 && "opacity-60",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-slate-400" style={hex ? { backgroundColor: hex } : undefined} />
                      <span className="truncate">{l.nome}</span>
                    </span>
                    <span className="mt-1 block text-2xl font-bold tabular-nums">{formatarPct(l.percentual)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {l.total} demanda{l.total === 1 ? "" : "s"}
                      {l.diretas > 0 ? ` · ${l.diretas} da agência` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-5 items-start">
          {/* Gráfico: 10 maiores */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 size={16} /> Top 10</CardTitle>
              <CardDescription>Clique numa barra para ver as demandas.</CardDescription>
            </CardHeader>
            <CardContent className="pl-0 pr-4">
              <ResponsiveContainer width="100%" height={alturaGrafico}>
                <BarChart data={top10} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 8 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#88888825" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={120}
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                    tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "#8888881a" }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(v: number, _n, item: any) => [`${v} (${formatarPct(item?.payload?.percentual ?? 0)})`, "Concluídas"]}
                  />
                  <Bar
                    dataKey="total"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={24}
                    className="cursor-pointer"
                    label={{ position: "right", fontSize: 11, fill: "var(--muted-foreground)" }}
                    onClick={(d: any) => d?.chave && selecionar(d.chave)}
                  >
                    {top10.map((l) => (
                      <Cell
                        key={l.chave}
                        fill={
                          l.chave === "pessoal"
                            ? "#8b5cf6"
                            : l.chave === "sem_cliente"
                              ? "#94a3b8"
                              : l.chave.startsWith(PREFIXO_AGENCIA)
                                ? metaAgencia(l.chave.slice(PREFIXO_AGENCIA.length))?.hex ?? "#94a3b8"
                                : "var(--primary)"
                        }
                        fillOpacity={selecionado && selecionado !== l.chave ? 0.35 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tabela completa */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Por cliente</CardTitle>
              <CardDescription>Todos os clientes ativos, mesmo sem demandas (e arquivados com demandas no período). Clique numa linha para ver as demandas.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <div className="max-h-[480px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Cliente</TableHead>
                      <TableHead className="text-right w-[90px]">Demandas</TableHead>
                      <TableHead className="w-[40%] pr-6">% do total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((l) => (
                      <TableRow
                        key={l.chave}
                        onClick={() => selecionar(l.chave)}
                        data-state={selecionado === l.chave ? "selected" : undefined}
                        className={cn("cursor-pointer", l.total === 0 && "text-muted-foreground")}
                      >
                        <TableCell className="pl-6 font-medium">
                          <span className="inline-flex items-center gap-2">
                            <ChevronRight
                              size={14}
                              className={cn("text-muted-foreground transition-transform", selecionado === l.chave && "rotate-90")}
                            />
                            {l.nome}
                            {l.chave === "pessoal" && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Pessoal</Badge>}
                            {l.chave.startsWith(PREFIXO_AGENCIA) && (
                              <Building2 size={13} style={{ color: metaAgencia(l.chave.slice(PREFIXO_AGENCIA.length))?.hex }} />
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{l.total}</TableCell>
                        <TableCell className="pr-6">
                          <div className="flex items-center gap-2">
                            <Progress
                              value={maxPct > 0 ? (l.percentual / maxPct) * 100 : 0}
                              className="h-1.5 bg-muted"
                              indicatorClassName={cn(
                                l.chave === "pessoal" ? "bg-violet-500" : l.chave === "sem_cliente" ? "bg-slate-400" : "bg-primary",
                              )}
                            />
                            <span className="w-12 text-right text-xs tabular-nums">{formatarPct(l.percentual)}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          {/* Entregues com atraso: concluídas depois da data de entrega */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle size={16} className="text-red-500" /> Entregues com atraso</CardTitle>
              <CardDescription>
                {atraso.atrasadas.length} de {total} concluída{total === 1 ? "" : "s"} ({formatarPct(atraso.percentual)}) foram entregues depois da data de entrega
                {atraso.semEntrega > 0 ? ` · ${atraso.semEntrega} sem data de entrega` : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {atraso.atrasadas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma demanda entregue com atraso neste período.</p>
              ) : (
                <ul className="divide-y max-h-[420px] overflow-y-auto">
                  {atraso.atrasadas.map((c) => (
                    <li key={chaveItem(c)} className="group flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{c.titulo || "(sem título)"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {nomeDono(c)} · entrega {formatarData(c.prazo!)} · concluída {formatarDataHora(c.concluida_em)}
                        </p>
                      </div>
                      {acoesDaConclusao(c)}
                      <Badge variant="outline" className="shrink-0 border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 tabular-nums">
                        {c.diasAtraso} {c.diasAtraso === 1 ? "dia" : "dias"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        </>
      )}

      {/* Detalhe do cliente selecionado */}
      <div ref={detalheRef}>
        {linhaSelecionada && !loading && total > 0 && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">{linhaSelecionada.nome}</CardTitle>
                <CardDescription>
                  {detalhe.length} demanda{detalhe.length === 1 ? "" : "s"} concluída{detalhe.length === 1 ? "" : "s"} · {descricaoPeriodo}
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelecionado(null)} title="Fechar">
                <X size={16} />
              </Button>
            </CardHeader>
            <CardContent>
              {detalhe.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma demanda concluída para este cliente no período.</p>
              ) : (
                <ul className="divide-y max-h-[560px] overflow-y-auto">
                  {detalhe.map((c) => (
                    <li key={chaveItem(c)} className="group flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="inline-flex items-center gap-2 min-w-0 flex-1">
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        <span className="truncate">{c.titulo || "(sem título)"}</span>
                        {(agenciaSelecionada || todasSelecionadas) && (
                          <span className="text-xs text-muted-foreground shrink-0">· {nomeDono(c)}</span>
                        )}
                      </span>
                      {acoesDaConclusao(c)}
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{formatarDataHora(c.concluida_em)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={!!excluindo} onOpenChange={(aberto) => { if (!aberto) setExcluindo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{excluindo?.demanda_id ? "Excluir esta demanda?" : "Remover do histórico?"}</AlertDialogTitle>
            <AlertDialogDescription>
              "{excluindo?.titulo || "(sem título)"}"{" "}
              {excluindo?.demanda_id
                ? "será apagada da aba Demandas e deixa de contar no Dashboard (para todos os clientes dela), como se nunca tivesse sido feita."
                : "deixa de contar no Dashboard (a demanda já tinha sido apagada da aba Demandas)."}{" "}
              Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const alvo = excluindo;
                setExcluindo(null);
                if (alvo) excluir(alvo);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ResumoCard({
  titulo,
  valor,
  icone,
  detalhe,
  loading,
  onClick,
  titulo_acao,
}: {
  titulo: string;
  valor: number;
  icone: React.ReactNode;
  detalhe: string;
  loading: boolean;
  onClick?: () => void;
  titulo_acao?: string;
}) {
  return (
    <Card
      onClick={onClick}
      title={onClick ? titulo_acao : undefined}
      className={cn(onClick && "cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30")}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{titulo}</p>
          <div className="rounded-md bg-muted p-1.5">{icone}</div>
        </div>
        {loading ? (
          <>
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-40" />
          </>
        ) : (
          <>
            <p className="mt-2 text-3xl font-bold tabular-nums">{valor}</p>
            <p className="mt-1 text-xs text-muted-foreground truncate">{detalhe}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
