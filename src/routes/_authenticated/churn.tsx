import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, UserMinus, Undo2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS, loadClientesChurn } from "@/lib/data";
import { useAgencias, agenciaBadgeStyle } from "@/lib/agencias";
import { formatBRL } from "@/lib/clientes";
import { useBusca } from "@/lib/useBusca";
import { MensagemBusca } from "@/components/MensagemBusca";

export const Route = createFileRoute("/_authenticated/churn")({
  validateSearch: (s: Record<string, unknown>): { agencia?: string } => ({
    agencia: typeof s.agencia === "string" && s.agencia ? s.agencia : "todos",
  }),
  component: ChurnPage,
});

interface ClienteChurn {
  id: string;
  nome: string;
  agencia: string;
  nicho: string | null;
  data_inicio: string | null;
  verba_mensal_brl: number | null;
  churn_em: string | null;
  contrato_ate: string | null;
  churn_efeito_imediato: boolean | null;
  arquivado: boolean;
}

const dataBR = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesPorExtenso = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
const mesDoChurn = (c: ClienteChurn) => c.churn_em?.slice(0, 7) ?? "sem-data";
/** Quando o cliente de fato saiu: o fim do contrato, ou o dia do churn se foi imediato ou sem contrato */
const saiuEm = (c: ClienteChurn) => (c.churn_efeito_imediato ? c.churn_em : c.contrato_ate ?? c.churn_em);

function ChurnPage() {
  const { agencia } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { agencias, meta: agenciaMetaOf, label: agenciaLabelOf } = useAgencias();
  const [clientes, setClientes] = useCachedState<ClienteChurn[]>(CACHE_KEYS.clientesChurn, []);
  const [loading, setLoading] = useState(!hasCached(CACHE_KEYS.clientesChurn));
  const [erro, setErro] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mes, setMes] = useState("todos");
  const [reativando, setReativando] = useState<ClienteChurn | null>(null);

  const carregar = async () => {
    try {
      setClientes((await loadClientesChurn()) as ClienteChurn[]);
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

  const meses = useMemo(() => Array.from(new Set(clientes.map(mesDoChurn))).sort().reverse(), [clientes]);

  const base = useMemo(
    () => clientes
      .filter((c) => agencia === "todos" || c.agencia === agencia)
      .filter((c) => mes === "todos" || mesDoChurn(c) === mes),
    [clientes, agencia, mes],
  );
  const resultado = useBusca(base, search, (c) => [c.nome, agenciaLabelOf(c.agencia), c.nicho ?? ""], { deps: [agenciaLabelOf], manterOrdem: true });
  const lista = resultado.itens;
  const verbaPerdida = lista.reduce((s, c) => s + Number(c.verba_mensal_brl || 0), 0);

  // Voltar a ativo: o banco limpa as datas do churn sozinho; o cliente reaparece em Clientes Ativos e no Saldo
  const reativar = async () => {
    if (!reativando) return;
    const { error } = await supabase.from("clientes").update({ status_operacional: "ativo" } as any).eq("id", reativando.id);
    if (error) toast.error("Erro ao reativar: " + error.message);
    else { toast.success(`${reativando.nome} voltou para Clientes Ativos`); carregar(); }
    setReativando(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clientes em Churn</h1>
        <p className="text-muted-foreground">
          Quem já saiu da agência, com a data do churn. Entram aqui no fim do contrato, ou na hora se o churn for de efeito imediato.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Clientes que saíram</p>
          <p className="numeric text-3xl font-bold">{lista.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Verba mensal que gerenciavam</p>
          <p className="numeric text-3xl font-bold">{formatBRL(verbaPerdida)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Último churn</p>
          <p className="numeric text-3xl font-bold">{dataBR(lista.find((c) => c.churn_em)?.churn_em ?? null)}</p>
        </CardContent></Card>
      </div>

      <Tabs value={agencia} onValueChange={(v) => navigate({ search: { agencia: v } })}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="todos">Todos ({clientes.length})</TabsTrigger>
          {agencias.map((a) => (
            <TabsTrigger key={a.id} value={a.id}>{a.label} ({counts[a.id] || 0})</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {meses.map((m) => (
              <SelectItem key={m} value={m}>{m === "sem-data" ? "Sem data (antigos)" : mesPorExtenso(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          <UserMinus size={36} className="text-muted-foreground mb-3 opacity-50" />
          {resultado.modo === "nenhum" && base.length > 0 ? (
            <MensagemBusca resultado={resultado} className="text-lg font-semibold text-foreground" />
          ) : (
            <>
              <h3 className="text-lg font-semibold">Nenhum cliente em churn por aqui</h3>
              <p className="text-sm text-muted-foreground">Marque o status Churn no cadastro do cliente em Clientes Ativos.</p>
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
                <TableHead>Churn em</TableHead>
                <TableHead>Saiu em</TableHead>
                <TableHead>Entrou em</TableHead>
                <TableHead className="text-right">Verba/mês</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.nome}{c.arquivado && <Badge variant="outline" className="ml-2 text-[10px]">Arquivado</Badge>}</div>
                    {c.nicho && <div className="text-xs text-muted-foreground">{c.nicho}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" style={agenciaBadgeStyle(agenciaMetaOf(c.agencia)?.hex)}>{agenciaLabelOf(c.agencia)}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{dataBR(c.churn_em)}</TableCell>
                  <TableCell className="tabular-nums">
                    {dataBR(saiuEm(c))}
                    {c.churn_efeito_imediato && <span className="ml-1 text-xs text-muted-foreground">(imediato)</span>}
                  </TableCell>
                  <TableCell className="tabular-nums">{dataBR(c.data_inicio)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(Number(c.verba_mensal_brl || 0))}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Reativar cliente" onClick={() => setReativando(c)}>
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
              O cliente volta para Clientes Ativos e para o Saldo, e o churn deixa de contar no mês em que foi marcado.
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
