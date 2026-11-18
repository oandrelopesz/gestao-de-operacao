import { useEffect, useMemo, useState } from "react";
import { Search, PauseCircle, Undo2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS, loadClientesPausados } from "@/lib/data";
import { useAgencias, agenciaBadgeStyle } from "@/lib/agencias";
import { formatBRL } from "@/lib/clientes";
import { useBusca } from "@/lib/useBusca";
import { MensagemBusca } from "@/components/MensagemBusca";

interface ClientePausado {
  id: string;
  nome: string;
  agencia: string;
  nicho: string | null;
  data_inicio: string | null;
  verba_mensal_brl: number | null;
}

const dataBR = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

/** Sub-aba "Pausados" de Clientes: quem está com o contrato parado, fora das demais abas até voltar. */
export function ClientesPausados() {
  const [agencia, setAgencia] = useState("todos");
  const { agencias, meta: agenciaMetaOf, label: agenciaLabelOf } = useAgencias();
  const [clientes, setClientes] = useCachedState<ClientePausado[]>(CACHE_KEYS.clientesPausados, []);
  const [loading, setLoading] = useState(!hasCached(CACHE_KEYS.clientesPausados));
  const [erro, setErro] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reativando, setReativando] = useState<ClientePausado | null>(null);

  const carregar = async () => {
    try {
      setClientes((await loadClientesPausados()) as ClientePausado[]);
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { carregar(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    clientes.forEach((cli) => { c[cli.agencia] = (c[cli.agencia] || 0) + 1; });
    return c;
  }, [clientes]);

  const base = useMemo(() => clientes.filter((c) => agencia === "todos" || c.agencia === agencia), [clientes, agencia]);
  const resultado = useBusca(base, search, (c) => [c.nome, agenciaLabelOf(c.agencia), c.nicho ?? ""], { deps: [agenciaLabelOf], manterOrdem: true });
  const lista = resultado.itens;
  const verbaParada = lista.reduce((s, c) => s + Number(c.verba_mensal_brl || 0), 0);

  // Voltar a ativo: reaparece em Clientes Ativos, no Saldo (o tráfego retoma) e em todos os seletores
  const reativar = async () => {
    if (!reativando) return;
    const { error } = await supabase.from("clientes").update({ status_operacional: "ativo" } as any).eq("id", reativando.id);
    if (error) toast.error("Erro ao reativar: " + error.message);
    else { toast.success(`${reativando.nome} voltou para Clientes Ativos`); carregar(); }
    setReativando(null);
  };

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Clientes com o contrato pausado. Ficam fora de Saldo, NPS, Central de arquivos, demandas e da verba gerenciada até voltarem.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Clientes pausados</p>
          <p className="numeric text-3xl font-bold">{lista.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Verba mensal parada</p>
          <p className="numeric text-3xl font-bold">{formatBRL(verbaParada)}</p>
        </CardContent></Card>
      </div>

      <Tabs value={agencia} onValueChange={setAgencia}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="todos">Todos ({clientes.length})</TabsTrigger>
          {agencias.map((a) => (
            <TabsTrigger key={a.id} value={a.id}>{a.label} ({counts[a.id] || 0})</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {resultado.modo === "parecidos" && <MensagemBusca resultado={resultado} className="-mb-3" />}

      {loading ? (
        <div className="h-40 rounded-lg bg-muted/40 animate-pulse" />
      ) : erro ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4 text-destructive">
            <AlertCircle size={18} /> Não foi possível carregar: {erro}
            <Button variant="outline" size="sm" onClick={carregar}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/20">
          <PauseCircle size={36} className="text-muted-foreground mb-3 opacity-50" />
          {resultado.modo === "nenhum" && base.length > 0 ? (
            <MensagemBusca resultado={resultado} className="text-lg font-semibold text-foreground" />
          ) : (
            <>
              <h3 className="text-lg font-semibold">Nenhum cliente pausado</h3>
              <p className="text-sm text-muted-foreground">Marque o status Pausado no cadastro do cliente em Clientes Ativos.</p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Agência</TableHead>
                <TableHead>Entrou em</TableHead>
                <TableHead className="text-right">Verba/mês</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.nome}</div>
                    {c.nicho && <div className="text-xs text-muted-foreground">{c.nicho}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" style={agenciaBadgeStyle(agenciaMetaOf(c.agencia)?.hex)}>{agenciaLabelOf(c.agencia)}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{dataBR(c.data_inicio)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(Number(c.verba_mensal_brl || 0))}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Reativar cliente" aria-label={`Reativar ${c.nome}`} onClick={() => setReativando(c)}>
                      <Undo2 size={15} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!reativando} onOpenChange={(o) => !o && setReativando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reativar {reativando?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O cliente volta para Clientes Ativos, Saldo, NPS, Central de arquivos e para os seletores de demanda e nota.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={reativar}>Reativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
