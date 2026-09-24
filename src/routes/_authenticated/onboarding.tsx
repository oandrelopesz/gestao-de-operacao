import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck2, Layers, Loader2, PenLine, Rocket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatarDataCurta } from "@/lib/entrega";
import {
  criarProcesso,
  fetchClientesEmOnboarding,
  fetchProcessos,
  fetchRoadmapsLigados,
  fetchTemplates,
  type ClienteResumo,
  type Processo,
  type RoadmapLigado,
} from "@/lib/processosService";
import { ProcessoCard } from "@/components/processos/ProcessoCard";
import { VerbaOnboarding } from "@/components/processos/VerbaOnboarding";
import { EscolherTemplateDialog } from "@/components/processos/EscolherTemplateDialog";
import { TemplatesView } from "@/components/processos/TemplatesView";
import { HistoricoView } from "@/components/processos/HistoricoView";
import { dataBrasilia } from "@/components/processos/ConcluirOnboardingDialog";

type Aba = "andamento" | "templates" | "historico";
type SearchParams = { cliente?: string; aba?: Aba };

const ABAS: Aba[] = ["andamento", "templates", "historico"];

export const Route = createFileRoute("/_authenticated/onboarding")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    cliente: typeof search.cliente === "string" && search.cliente ? search.cliente : undefined,
    aba: ABAS.includes(search.aba as Aba) ? (search.aba as Aba) : undefined,
  }),
  component: OnboardingPage,
});

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao carregar");

function OnboardingPage() {
  const navigate = useNavigate({ from: "/onboarding" });
  const { cliente: clienteFoco, aba: abaParam } = Route.useSearch();
  const aba: Aba = abaParam ?? "andamento";

  const mudarAba = (nova: string) => {
    navigate({ search: (s: SearchParams) => ({ ...s, aba: nova === "andamento" ? undefined : (nova as Aba) }), replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
          <Rocket size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Onboarding</h1>
          <p className="text-sm text-muted-foreground">Clientes marcados como em onboarding e os próximos passos de cada um</p>
        </div>
      </div>

      <Tabs value={aba} onValueChange={mudarAba} className="space-y-5">
        <TabsList>
          <TabsTrigger value="andamento">Em andamento</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="andamento" className="mt-0">
          <EmAndamento clienteFoco={clienteFoco} />
        </TabsContent>
        <TabsContent value="templates" className="mt-0">
          <TemplatesView tipo="onboarding" />
        </TabsContent>
        <TabsContent value="historico" className="mt-0">
          <HistoricoView tipo="onboarding" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------------------------ Em andamento

function EmAndamento({ clienteFoco }: { clienteFoco?: string }) {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [roadmaps, setRoadmaps] = useState<RoadmapLigado[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [destacado, setDestacado] = useState<string | null>(null);

  // Contador de requisições: uma recarga antiga que termina depois de uma nova é descartada
  const requisicao = useRef(0);
  const carregar = useCallback(async () => {
    const minha = ++requisicao.current;
    try {
      const [c, p] = await Promise.all([fetchClientesEmOnboarding(), fetchProcessos("onboarding", "ativos")]);
      const r = await fetchRoadmapsLigados(p.flatMap((x) => x.passos.map((s) => s.id)));
      if (minha !== requisicao.current) return;
      setClientes(c);
      setProcessos(p);
      setRoadmaps(r);
      setErro(null);
    } catch (e) {
      if (minha !== requisicao.current) return;
      setErro(erroMsg(e));
    } finally {
      if (minha === requisicao.current) setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const processoDoCliente = useMemo(() => {
    const m = new Map<string, Processo>();
    processos.forEach((p) => { if (p.cliente_id && !m.has(p.cliente_id)) m.set(p.cliente_id, p); });
    return m;
  }, [processos]);

  // ?cliente=<id>: rola até o card e destaca por 3s
  const cardsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const focado = useRef<string | null>(null);
  const timerDestaque = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading || !clienteFoco || focado.current === clienteFoco) return;
    const el = cardsRef.current[clienteFoco];
    if (!el) return;
    focado.current = clienteFoco;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setDestacado(clienteFoco);
    // Timer num ref: a reexecução do efeito (clientes recarregados) não pode cancelá-lo e deixar o destaque preso
    if (timerDestaque.current) clearTimeout(timerDestaque.current);
    timerDestaque.current = setTimeout(() => setDestacado(null), 3000);
  }, [loading, clienteFoco, clientes]);
  useEffect(() => () => { if (timerDestaque.current) clearTimeout(timerDestaque.current); }, []);

  const abrirRoadmap = (id: string) => navigate({ to: "/roadmap" as any, search: { id } as any });

  if (loading) {
    return (
      <div className="space-y-4">
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

  if (clientes.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Rocket size={26} />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold">Nenhum cliente em onboarding</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Marque "Em onboarding" no cadastro do cliente (aba Clientes Ativos) para ele aparecer aqui
            </p>
          </div>
          <Button className="mt-1 gap-2" onClick={() => navigate({ to: "/clientes" as any })}>
            <Users size={16} /> Ir para Clientes Ativos
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {clientes.length} {clientes.length === 1 ? "cliente em onboarding" : "clientes em onboarding"}
      </p>
      {clientes.map((c) => {
        const processo = processoDoCliente.get(c.id);
        return (
          <div key={c.id} ref={(el) => { cardsRef.current[c.id] = el; }} className="scroll-mt-24">
            {processo ? (
              <ProcessoCard
                processo={processo}
                roadmaps={roadmaps.filter((r) => processo.passos.some((p) => p.id === r.passo_onboarding_id))}
                destaque={destacado === c.id}
                extraCabecalho={<VerbaOnboarding clienteId={c.id} />}
                onMudou={carregar}
                onAbrirRoadmap={abrirRoadmap}
              />
            ) : (
              <ClienteSemProcesso cliente={c} destaque={destacado === c.id} onCriado={carregar} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Cliente sem processo

function ClienteSemProcesso({ cliente, destaque, onCriado }: { cliente: ClienteResumo; destaque: boolean; onCriado: () => void }) {
  const [escolher, setEscolher] = useState(false);
  const [criando, setCriando] = useState(false);

  const usarTemplate = async (templateId: string) => {
    try {
      const template = (await fetchTemplates("onboarding")).find((t) => t.id === templateId);
      await criarProcesso({
        tipo: "onboarding",
        cliente_id: cliente.id,
        nome: template?.nome ?? "Personalizado",
        template_id: templateId,
        iniciado_em: cliente.onboarding_desde,
      });
      toast.success(`Onboarding de ${cliente.nome} criado`);
      onCriado();
    } catch (e) {
      toast.error(erroMsg(e));
      // O processo pode ter sido criado e só os passos falharem: recarrega para não tentar criar de novo
      onCriado();
      throw e;
    }
  };

  const doZero = async () => {
    if (criando) return;
    setCriando(true);
    try {
      await criarProcesso({ tipo: "onboarding", cliente_id: cliente.id, nome: "Personalizado", iniciado_em: cliente.onboarding_desde });
      toast.success(`Onboarding de ${cliente.nome} criado`);
      onCriado();
    } catch (e) {
      toast.error(erroMsg(e));
      onCriado();
    } finally {
      setCriando(false);
    }
  };

  return (
    <Card className={cn("overflow-hidden transition-shadow duration-500", destaque && "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg")}>
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h2 className="truncate text-lg font-semibold tracking-tight">{cliente.nome}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {cliente.onboarding_desde && (
              <span className="inline-flex items-center gap-1">
                <CalendarCheck2 size={13} /> Entrou em {formatarDataCurta(dataBrasilia(cliente.onboarding_desde))}
              </span>
            )}
            <span>Ainda não tem uma trilha de passos.</span>
          </div>
        </div>
        <div className="flex items-start gap-2 md:shrink-0">
          <VerbaOnboarding clienteId={cliente.id} />
        </div>
      </div>

      <div className="mx-5 mb-5 flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">Como você quer montar o onboarding deste cliente?</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button className="gap-2" onClick={() => setEscolher(true)}>
            <Layers size={15} /> Usar template
          </Button>
          <Button variant="outline" className="gap-2" onClick={doZero} disabled={criando}>
            {criando ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />} Começar do zero
          </Button>
        </div>
      </div>

      <EscolherTemplateDialog
        aberto={escolher}
        tipo="onboarding"
        processoTemConcluidos={false}
        modoCriacao
        onEscolher={(id) => usarTemplate(id)}
        onClose={() => setEscolher(false)}
      />
    </Card>
  );
}
