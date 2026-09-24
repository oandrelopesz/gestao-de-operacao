import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, Link2, Loader2, Map as MapIcon, Plus, Rocket, Unlink, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { diasDeAtraso, formatarDataCurta, hojeBrasilia } from "@/lib/entrega";
import { progresso } from "@/lib/processos";
import { atualizarProcesso, fetchProcessos, type Passo, type Processo } from "@/lib/processosService";
import { ProcessoCard } from "@/components/processos/ProcessoCard";
import { TemplatesView } from "@/components/processos/TemplatesView";
import { HistoricoView } from "@/components/processos/HistoricoView";
import { NovoRoadmapDialog, parseDataLocal } from "@/components/processos/NovoRoadmapDialog";
import { LigarPassoDialog } from "@/components/processos/LigarPassoDialog";

type Aba = "andamento" | "templates" | "historico";
type SearchParams = { id?: string; aba?: Aba };

const ABAS: Aba[] = ["andamento", "templates", "historico"];

export const Route = createFileRoute("/_authenticated/roadmap")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    id: typeof search.id === "string" && search.id ? search.id : undefined,
    aba: ABAS.includes(search.aba as Aba) ? (search.aba as Aba) : undefined,
  }),
  component: RoadmapPage,
});

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao carregar");

function RoadmapPage() {
  const navigate = useNavigate({ from: "/roadmap" });
  const { id: roadmapFoco, aba: abaParam } = Route.useSearch();
  const aba: Aba = abaParam ?? "andamento";

  const mudarAba = (nova: string) => {
    navigate({ search: (s: SearchParams) => ({ ...s, aba: nova === "andamento" ? undefined : (nova as Aba) }), replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
          <MapIcon size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Roadmap</h1>
          <p className="text-sm text-muted-foreground">Projetos de longo prazo de cada cliente, passo a passo</p>
        </div>
      </div>

      <Tabs value={aba} onValueChange={mudarAba} className="space-y-5">
        <TabsList>
          <TabsTrigger value="andamento">Em andamento</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="andamento" className="mt-0">
          <EmAndamento roadmapFoco={roadmapFoco} />
        </TabsContent>
        <TabsContent value="templates" className="mt-0">
          <TemplatesView tipo="roadmap" />
        </TabsContent>
        <TabsContent value="historico" className="mt-0">
          <HistoricoView tipo="roadmap" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------------------------ Em andamento

interface Grupo { clienteId: string; clienteNome: string; roadmaps: Processo[] }

function EmAndamento({ roadmapFoco }: { roadmapFoco?: string }) {
  const navigate = useNavigate();
  const [roadmaps, setRoadmaps] = useState<Processo[]>([]);
  const [passosOnboarding, setPassosOnboarding] = useState<Map<string, Passo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [destacado, setDestacado] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [ligarRoadmap, setLigarRoadmap] = useState<Processo | null>(null);

  // Ids carregados da última vez: o que some da lista pode ter sido concluído pelo banco (100%)
  const anteriores = useRef<Map<string, string>>(new Map());

  // Contador de requisições: uma recarga antiga que termina depois de uma nova é descartada
  const requisicao = useRef(0);
  const carregar = useCallback(async () => {
    const minha = ++requisicao.current;
    try {
      const [r, o] = await Promise.all([fetchProcessos("roadmap", "ativos"), fetchProcessos("onboarding", "ativos")]);
      if (minha !== requisicao.current) return;
      const passos = new Map<string, Passo>();
      o.forEach((p) => p.passos.forEach((s) => passos.set(s.id, s)));

      const idsNovos = new Set(r.map((x) => x.id));
      const sumidos = [...anteriores.current.keys()].filter((id) => !idsNovos.has(id));
      anteriores.current = new Map(r.map((x) => [x.id, x.nome]));

      setRoadmaps(r);
      setPassosOnboarding(passos);
      setErro(null);

      if (sumidos.length) avisarConcluidos(sumidos);
    } catch (e) {
      if (minha !== requisicao.current) return;
      setErro(erroMsg(e));
    } finally {
      if (minha === requisicao.current) setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const grupos = useMemo<Grupo[]>(() => {
    const m = new Map<string, Grupo>();
    roadmaps.forEach((r) => {
      const g = m.get(r.cliente_id) ?? { clienteId: r.cliente_id, clienteNome: r.cliente?.nome ?? "Cliente", roadmaps: [] };
      g.roadmaps.push(r);
      m.set(r.cliente_id, g);
    });
    const lista = [...m.values()];
    lista.forEach((g) => g.roadmaps.sort((a, b) => a.iniciado_em.localeCompare(b.iniciado_em)));
    return lista.sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));
  }, [roadmaps]);

  // ?id=<roadmap>: rola até o card e destaca por 3s
  const cardsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const focado = useRef<string | null>(null);
  const timerDestaque = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destacar = useCallback((id: string) => {
    const el = cardsRef.current[id];
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setDestacado(id);
    // Timer num ref: a reexecução do efeito (lista recarregada) não pode cancelá-lo e deixar o destaque preso
    if (timerDestaque.current) clearTimeout(timerDestaque.current);
    timerDestaque.current = setTimeout(() => setDestacado(null), 3000);
    return true;
  }, []);
  useEffect(() => {
    if (loading || !roadmapFoco || focado.current === roadmapFoco) return;
    if (destacar(roadmapFoco)) focado.current = roadmapFoco;
  }, [loading, roadmapFoco, roadmaps, destacar]);
  useEffect(() => () => { if (timerDestaque.current) clearTimeout(timerDestaque.current); }, []);

  // Recém-criado: recarrega e destaca quando o card aparecer
  const [destacarDepois, setDestacarDepois] = useState<string | null>(null);
  useEffect(() => {
    if (!destacarDepois) return;
    if (destacar(destacarDepois)) setDestacarDepois(null);
  }, [destacarDepois, roadmaps, destacar]);

  const desligar = async (r: Processo) => {
    try {
      await atualizarProcesso(r.id, { passo_onboarding_id: null });
      toast.success(`"${r.nome}" desligado do onboarding`);
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      carregar();
    }
  };

  const novoBotao = (
    <Button className="gap-2" onClick={() => setNovoAberto(true)}>
      <Plus size={16} /> Novo roadmap
    </Button>
  );

  const dialogs = (
    <>
      <NovoRoadmapDialog
        aberto={novoAberto}
        onClose={() => setNovoAberto(false)}
        onCriado={(id) => { if (id) setDestacarDepois(id); carregar(); }}
      />
      <LigarPassoDialog
        aberto={!!ligarRoadmap}
        roadmap={ligarRoadmap}
        onClose={() => setLigarRoadmap(null)}
        onMudou={carregar}
      />
    </>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end"><Skeleton className="h-10 w-36" /></div>
        {[0, 1].map((i) => (
          <Card key={i} className="p-5 space-y-4">
            <div className="flex items-center gap-3"><Skeleton className="h-6 w-48" /><Skeleton className="h-5 w-24" /></div>
            <Skeleton className="h-2 w-72" />
            <div className="flex gap-6 pt-2">{[0, 1, 2, 3, 4].map((j) => <Skeleton key={j} className="h-10 w-10 rounded-full" />)}</div>
          </Card>
        ))}
      </div>
    );
  }

  if (erro) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-destructive">
          {erro}
          <Button size="sm" variant="outline" onClick={() => { setLoading(true); carregar(); }}>Tentar de novo</Button>
        </CardContent>
      </Card>
    );
  }

  if (roadmaps.length === 0) {
    return (
      <>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MapIcon size={26} />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold">Nenhum roadmap em andamento</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Crie um roadmap para acompanhar um projeto longo de um cliente — landing page, estrutura de tracking, CRM — passo a passo
              </p>
            </div>
            <div className="mt-1">{novoBotao}</div>
          </CardContent>
        </Card>
        {dialogs}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {roadmaps.length} {roadmaps.length === 1 ? "roadmap em andamento" : "roadmaps em andamento"} · {grupos.length}{" "}
          {grupos.length === 1 ? "cliente" : "clientes"}
        </p>
        {novoBotao}
      </div>

      {grupos.map((g) => (
        <section key={g.clienteId} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">{g.clienteNome}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {g.roadmaps.length}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {g.roadmaps.map((r) => {
            const passo = r.passo_onboarding_id ? passosOnboarding.get(r.passo_onboarding_id) ?? null : null;
            return (
              <div key={r.id} ref={(el) => { cardsRef.current[r.id] = el; }} className="scroll-mt-24">
                <ProcessoCard
                  processo={r}
                  roadmaps={[]}
                  destaque={destacado === r.id}
                  extraCabecalho={<PrazoFinal roadmap={r} passo={passo} onMudou={carregar} />}
                  acoesMenu={
                    r.passo_onboarding_id ? (
                      <>
                        <DropdownMenuItem onSelect={() => navigate({ to: "/onboarding" as any, search: { cliente: r.cliente_id } as any })}>
                          <Rocket size={14} className="mr-2" /> Ver no onboarding
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => desligar(r)}>
                          <Unlink size={14} className="mr-2" /> Desligar do onboarding
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <DropdownMenuItem onSelect={() => setLigarRoadmap(r)}>
                        <Link2 size={14} className="mr-2" /> Ligar a um passo do onboarding
                      </DropdownMenuItem>
                    )
                  }
                  onMudou={carregar}
                />
              </div>
            );
          })}
        </section>
      ))}

      {dialogs}
    </div>
  );
}

/** Os roadmaps que sumiram de "ativos" e o banco marcou como concluídos (chegaram a 100%). */
async function avisarConcluidos(ids: string[]) {
  try {
    const { data, error } = await (supabase.from("processos") as any)
      .select("id, nome, status")
      .in("id", ids)
      .eq("status", "concluido");
    if (error) return;
    ((data || []) as { nome: string }[]).forEach((r) => {
      toast.success(`Roadmap ${r.nome} concluído — foi para o Histórico`);
    });
  } catch {
    // aviso é só cortesia; a lista já está certa
  }
}

// ------------------------------------------------------------------ Prazo final

function PrazoFinal({ roadmap, passo, onMudou }: { roadmap: Processo; passo: Passo | null; onMudou: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const ligado = !!roadmap.passo_onboarding_id;
  const prazo = roadmap.prazo_final;
  const concluido = roadmap.passos.length > 0 && progresso(roadmap.passos) === 100;
  const atrasado = !!prazo && !concluido && diasDeAtraso(prazo, hojeBrasilia()) > 0;

  const salvar = async (novo: string | null) => {
    if (salvando || novo === prazo) { setAberto(false); return; }
    setSalvando(true);
    try {
      await atualizarProcesso(roadmap.id, { prazo_final: novo });
      toast.success(
        novo
          ? `Prazo final: ${formatarDataCurta(novo)}${ligado ? " — o passo do onboarding também mudou" : ""}`
          : "Prazo final removido",
      );
      setAberto(false);
      onMudou();
    } catch (e) {
      toast.error(erroMsg(e));
      onMudou();
    } finally {
      setSalvando(false);
    }
  };

  const gatilho = (
    <button
      type="button"
      className={cn(
        "group flex min-w-[9.5rem] items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors",
        prazo ? "border-border/70 bg-muted/30 hover:bg-muted/60" : "border-dashed border-primary/40 text-primary hover:bg-primary/5",
      )}
    >
      <span className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        !prazo ? "bg-primary/10 text-primary"
          : atrasado ? "bg-red-500/10 text-red-600 dark:text-red-400"
            : "bg-sky-500/10 text-sky-600 dark:text-sky-400",
      )}>
        {salvando ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Prazo final</span>
        {prazo ? (
          <span className="flex items-baseline gap-1.5">
            <span className={cn("text-sm font-semibold tabular-nums", atrasado ? "text-red-600 dark:text-red-400" : "text-foreground")}>
              {formatarDataCurta(prazo)}
            </span>
            {ligado && <span className="whitespace-nowrap text-xs text-muted-foreground">(do onboarding)</span>}
          </span>
        ) : (
          <span className="block text-sm font-medium">
            Definir prazo{ligado && <span className="ml-1 text-xs font-normal text-muted-foreground">(do onboarding)</span>}
          </span>
        )}
      </span>
    </button>
  );

  return (
    <Popover open={aberto} onOpenChange={(o) => { if (!salvando) setAberto(o); }}>
      {ligado ? (
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>{gatilho}</PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64 text-xs">
              {passo ? <>Ligado ao passo <strong>"{passo.titulo}"</strong> do onboarding.</> : "Ligado a um passo do onboarding."} Mudar o prazo aqui muda a data do passo (e vice-versa).
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <PopoverTrigger asChild>{gatilho}</PopoverTrigger>
      )}
      <PopoverContent className="w-auto p-0" align="end">
        {ligado && (
          <p className="max-w-[17rem] border-b px-3 py-2 text-xs text-muted-foreground">
            {passo ? `Esta data é a do passo "${passo.titulo}" do onboarding` : "Ligado a um passo do onboarding"} — mudar aqui muda lá também.
          </p>
        )}
        <Calendar
          mode="single"
          selected={prazo ? parseDataLocal(prazo) : undefined}
          onSelect={(date) => date && salvar(format(date, "yyyy-MM-dd"))}
          initialFocus
          locale={ptBR}
        />
        {prazo && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground" onClick={() => salvar(null)} disabled={salvando}>
              <X size={13} /> Remover prazo
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
