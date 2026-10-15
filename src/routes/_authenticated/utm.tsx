import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Tags } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS } from "@/lib/data";
import { fetchPastas } from "@/lib/central";
import { fetchUtms, traduzErroUtm, type UtmGuardada } from "@/lib/utmGuardadas";
import { GeradorUtm } from "@/components/utm/GeradorUtm";
import { GuardadasUtm } from "@/components/utm/GuardadasUtm";

// Gerador de UTM: ?aba=guardadas abre a subaba das guardadas e &cliente=<id> abre o cliente.
export const Route = createFileRoute("/_authenticated/utm")({
  validateSearch: (s: Record<string, unknown>): { aba?: "guardadas"; cliente?: string } => ({
    ...(s.aba === "guardadas" ? { aba: "guardadas" as const } : {}),
    ...(typeof s.cliente === "string" && s.cliente ? { cliente: s.cliente } : {}),
  }),
  component: UtmPage,
});

function UtmPage() {
  const { aba, cliente } = Route.useSearch();
  const navigate = useNavigate();
  const [utms, setUtms] = useCachedState<UtmGuardada[]>(CACHE_KEYS.utms, []);
  const [clientes, setClientes] = useCachedState<{ id: string; nome: string }[]>(CACHE_KEYS.utmClientes, []);
  const [carregando, setCarregando] = useState(!hasCached(CACHE_KEYS.utms));
  const [erro, setErro] = useState<string | null>(null);
  // Cliente escolhido no gerador: fica aqui para sobreviver à troca de subaba e para o "Gerar mais"
  const [clienteGerar, setClienteGerar] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [u, c] = await Promise.all([fetchUtms(), fetchPastas()]);
      setUtms(u);
      setClientes(c);
      setErro(null);
    } catch (e) {
      setErro(traduzErroUtm(e));
    } finally {
      setCarregando(false);
    }
  }, [setUtms, setClientes]);

  useEffect(() => { carregar(); }, [carregar]);

  const abaAtual = aba === "guardadas" ? "guardadas" : "gerar";
  const irParaAba = (v: string) =>
    navigate({ to: "/utm", search: v === "guardadas" ? { aba: "guardadas" as const } : {} });
  const abrirCliente = (id?: string) =>
    navigate({ to: "/utm", search: id ? { aba: "guardadas" as const, cliente: id } : { aba: "guardadas" as const } });
  const gerarMais = (id: string) => { setClienteGerar(id); navigate({ to: "/utm", search: {} }); };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
          <Tags size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gerador de UTM</h1>
          <p className="text-sm text-muted-foreground">Links rastreáveis prontos para colar em cada plataforma, por cliente</p>
        </div>
      </div>

      {erro && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{erro}</CardContent></Card>}

      <Tabs value={abaAtual} onValueChange={irParaAba}>
        <TabsList>
          <TabsTrigger value="gerar">Gerar</TabsTrigger>
          <TabsTrigger value="guardadas">Guardadas{utms.length ? ` (${utms.length})` : ""}</TabsTrigger>
        </TabsList>
        {/* forceMount: o que foi preenchido no gerador não se perde ao olhar as guardadas */}
        <TabsContent value="gerar" forceMount className="mt-4 data-[state=inactive]:hidden">
          <GeradorUtm clientes={clientes} clienteId={clienteGerar} onCliente={setClienteGerar} utms={utms} onGuardou={carregar} />
        </TabsContent>
        <TabsContent value="guardadas" className="mt-4">
          <GuardadasUtm
            utms={utms} clientes={clientes} carregando={carregando} clienteId={cliente}
            onAbrir={abrirCliente} onGerarMais={gerarMais} onMudou={carregar}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
