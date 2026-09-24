import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CheckCircle2, Users, User, CalendarRange, ChevronRight, X, Inbox } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { hojeBrasilia } from "@/lib/entrega";
import { agregar, dataLocalBrasilia, intervaloDoPeriodo, type Conclusao, type PeriodoId } from "@/lib/dashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

interface ConclusaoRow extends Conclusao {
  id: string;
  titulo: string | null;
}

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

const chaveDaConclusao = (c: Conclusao) => (c.pessoal ? "pessoal" : c.cliente_id ?? "sem_cliente");

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
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
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
          .select("id, cliente_id, pessoal, titulo, concluida_em")
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
        .select("id, nome")
        .eq("arquivado", false)
        .order("nome");
      if (errCli) throw errCli;

      if (minha !== seq.current) return;
      const noPeriodo = linhas.filter((c) => {
        const d = dataLocalBrasilia(c.concluida_em);
        return (!intervalo.de || d >= intervalo.de) && (!intervalo.ate || d <= intervalo.ate);
      });
      setConclusoes(noPeriodo);
      setClientes(cli ?? []);
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

  const { total, linhas } = useMemo(() => agregar(conclusoes, clientes), [conclusoes, clientes]);

  const idsClientes = useMemo(() => new Set(clientes.map((c) => c.id)), [clientes]);
  const clientesAtendidos = linhas.filter((l) => l.total > 0 && idsClientes.has(l.chave)).length;
  const linhaPessoal = linhas.find((l) => l.chave === "pessoal");
  const pessoal = linhaPessoal?.total ?? 0;
  const lider = linhas[0] && linhas[0].total > 0 ? linhas[0] : null;

  const top10 = useMemo(() => linhas.filter((l) => l.total > 0).slice(0, 10), [linhas]);
  const maxPct = linhas.reduce((m, l) => Math.max(m, l.percentual), 0);

  // Conclusões de clientes arquivados (ou removidos) não têm linha própria: agregar soma no total
  const semLinha = useMemo(() => {
    const chaves = new Set(linhas.map((l) => l.chave));
    return conclusoes.filter((c) => !chaves.has(chaveDaConclusao(c))).length;
  }, [conclusoes, linhas]);

  const linhaSelecionada = linhas.find((l) => l.chave === selecionado) ?? null;
  const detalhe = useMemo(
    () => (selecionado ? conclusoes.filter((c) => chaveDaConclusao(c) === selecionado) : []),
    [conclusoes, selecionado],
  );

  // Linha selecionada sumiu (ex.: período mudou e o grupo não existe mais): fecha o detalhe
  useEffect(() => {
    if (selecionado && !loading && !linhas.some((l) => l.chave === selecionado)) setSelecionado(null);
  }, [linhas, selecionado, loading]);

  const selecionar = (chave: string) => {
    setSelecionado((atual) => (atual === chave ? null : chave));
    requestAnimationFrame(() => detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

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
      <div className="grid gap-4 sm:grid-cols-3">
        <ResumoCard
          titulo="Concluídas no período"
          valor={total}
          icone={<CheckCircle2 size={18} className="text-emerald-500" />}
          detalhe={lider ? `Mais concluídas: ${lider.nome} (${formatarPct(lider.percentual)})` : "Nenhuma ainda"}
          loading={loading}
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
                        fill={l.chave === "pessoal" ? "#8b5cf6" : l.chave === "sem_cliente" ? "#94a3b8" : "var(--primary)"}
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
              <CardDescription>Todos os clientes ativos, mesmo sem demandas. Clique numa linha para ver as demandas.</CardDescription>
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
              {semLinha > 0 && (
                <p className="px-6 pt-2 text-xs text-muted-foreground">
                  {semLinha} demanda{semLinha === 1 ? "" : "s"} de cliente{semLinha === 1 ? "" : "s"} arquivado{semLinha === 1 ? "" : "s"} entra{semLinha === 1 ? "" : "m"} no total, sem linha própria.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
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
                <ul className="divide-y">
                  {detalhe.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        <span className="truncate">{c.titulo || "(sem título)"}</span>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{formatarDataHora(c.concluida_em)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ResumoCard({
  titulo,
  valor,
  icone,
  detalhe,
  loading,
}: {
  titulo: string;
  valor: number;
  icone: React.ReactNode;
  detalhe: string;
  loading: boolean;
}) {
  return (
    <Card>
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
