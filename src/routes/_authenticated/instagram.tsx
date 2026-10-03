import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Instagram, Loader2, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClienteSelect } from "@/components/ClienteSelect";
import { useCachedState } from "@/lib/pageCache";
import { CACHE_KEYS, loadClientesLite } from "@/lib/data";
import { fetchContas, sincronizarContas, vincularCliente, type ContaInstagram } from "@/lib/instagram";

export const Route = createFileRoute("/_authenticated/instagram")({ component: InstagramPage });

function InstagramPage() {
  const [contas, setContas] = useState<ContaInstagram[] | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [clientes, setClientes] = useCachedState<{ id: string; nome: string; agencia?: string | null }[]>(CACHE_KEYS.clientesLite, []);

  const carregar = () => fetchContas().then(setContas).catch((e) => toast.error(e.message));
  useEffect(() => {
    carregar();
    loadClientesLite().then(setClientes).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const r = await sincronizarContas();
      toast.success(`${r.contas} ${r.contas === 1 ? "conta de Instagram" : "contas de Instagram"} em ${r.paginas} ${r.paginas === 1 ? "página" : "páginas"}`);
      await carregar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const ligar = async (conta: ContaInstagram, clienteId: string | null) => {
    setContas((prev) => prev && prev.map((c) => (c.id === conta.id ? { ...c, cliente_id: clienteId } : c)));
    try {
      await vincularCliente(conta.id, clienteId);
    } catch (e: any) {
      toast.error(e.message);
      carregar();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Instagram</h1>
          <p className="text-sm text-muted-foreground">Contas de Instagram dos clientes ligadas à sua BM. Em breve: criar e agendar posts.</p>
        </div>
        <Button className="gap-2" onClick={sincronizar} disabled={sincronizando}>
          {sincronizando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sincronizar contas
        </Button>
      </div>

      {contas === null ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Carregando...</div>
      ) : contas.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Nenhuma conta ainda. Clique em "Sincronizar contas".</CardContent></Card>
      ) : (
        <Card>
          <div className="divide-y">
            {contas.map((c) => (
              <div key={c.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {c.foto_url ? (
                    <img src={c.foto_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted"><Instagram size={18} /></span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">@{c.usuario}</p>
                  </div>
                  {c.pagina_tem_local && <Badge variant="outline" className="gap-1 text-[10px]"><MapPin size={10} /> Localização</Badge>}
                  {!c.ativa && <Badge variant="secondary" className="text-[10px]">Sem acesso</Badge>}
                </div>
                <div className="w-full sm:w-64">
                  <ClienteSelect clientes={clientes} value={c.cliente_id} onChange={(id) => ligar(c, id)} opcaoVazia="Sem cliente" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
