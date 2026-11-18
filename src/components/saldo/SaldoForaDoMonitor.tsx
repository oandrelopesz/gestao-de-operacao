import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, PauseCircle, Search, Undo2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MensagemBusca } from "@/components/MensagemBusca";
import { supabase } from "@/integrations/supabase/client";
import { CACHE_KEYS, loadSaldoFora } from "@/lib/data";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { useAgencias, agenciaBadgeStyle } from "@/lib/agencias";
import { formatMoeda } from "@/lib/moedas";
import { useBusca } from "@/lib/useBusca";

interface Conta {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_agencia: string;
  cliente_status_operacional: string;
  plataformas: string[];
  operacao_nome: string | null;
  moeda: string;
  saldo_atual_estimado: number | null;
  qtd_recargas: number;
  data_ultima_recarga: string | null;
  valor_ultima_recarga: number | null;
}

interface Grupo { id: string; nome: string; agencia: string; contas: Conta[] }

const dataBR = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

/**
 * Abas Pausados e Em churn do Saldo: contas de quem saiu do monitor. Só leitura (sem alertas, recarga ou verba).
 * Pausado mostra o saldo congelado e pode ser reativado; churn mostra o histórico de recargas.
 */
export function SaldoForaDoMonitor({ grupo }: { grupo: "pausados" | "churn" }) {
  const { label: agenciaLabelOf, meta: agenciaMetaOf } = useAgencias();
  const [dados, setDados] = useCachedState<Conta[]>(CACHE_KEYS.saldoFora, []);
  const [loading, setLoading] = useState(!hasCached(CACHE_KEYS.saldoFora));
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [reativando, setReativando] = useState<Grupo | null>(null);
  const pausados = grupo === "pausados";

  const carregar = async () => {
    try {
      setDados((await loadSaldoFora()) as Conta[]);
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void carregar(); }, []);

  const clientes = useMemo<Grupo[]>(() => {
    const m = new Map<string, Grupo>();
    for (const c of dados) {
      if ((c.cliente_status_operacional === "pausado") !== pausados) continue;
      const g = m.get(c.cliente_id) ?? { id: c.cliente_id, nome: c.cliente_nome, agencia: c.cliente_agencia, contas: [] };
      g.contas.push(c);
      m.set(c.cliente_id, g);
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [dados, pausados]);

  const resultado = useBusca(clientes, busca, (g) => [g.nome, agenciaLabelOf(g.agencia), ...g.contas.flatMap((c) => c.plataformas)], { manterOrdem: true });

  const reativar = async () => {
    if (!reativando) return;
    const { error } = await supabase.from("clientes").update({ status_operacional: "ativo" } as any).eq("id", reativando.id);
    if (error) toast.error("Erro ao reativar: " + error.message);
    else { toast.success(`${reativando.nome} voltou para o monitor de saldo`); void carregar(); }
    setReativando(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {pausados
          ? "Clientes pausados: o saldo das contas fica congelado, sem alertas, e volta de onde parou quando o cliente é reativado."
          : "Clientes em churn que já saíram: ficam fora dos alertas e da verba. Aqui só o histórico das contas."}
      </p>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar cliente ou plataforma..." className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <MensagemBusca resultado={resultado} />

      {erro ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4 text-destructive">
            <AlertCircle size={18} /> Não foi possível carregar: {erro}
            <Button variant="outline" size="sm" onClick={() => void carregar()}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="h-40 rounded-lg bg-muted/40 animate-pulse" />
      ) : resultado.itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/20">
          {pausados ? <PauseCircle size={36} className="text-muted-foreground mb-3 opacity-50" /> : <UserMinus size={36} className="text-muted-foreground mb-3 opacity-50" />}
          <h3 className="text-lg font-semibold">{clientes.length ? "Nenhum resultado" : pausados ? "Nenhum cliente pausado com conta de saldo" : "Nenhum cliente em churn com conta de saldo"}</h3>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {resultado.itens.map((g) => (
            <Card key={g.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold min-w-0" title={g.nome}><span className={`h-2 w-2 shrink-0 rounded-full ${pausados ? "bg-yellow-500" : "bg-red-500"}`} aria-hidden /><span className="truncate">{g.nome}</span></div>
                    <Badge variant="outline" className="mt-1" style={agenciaBadgeStyle(agenciaMetaOf(g.agencia)?.hex)}>{agenciaLabelOf(g.agencia)}</Badge>
                  </div>
                  {pausados ? (
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setReativando(g)}>
                      <Undo2 size={14} /> Reativar
                    </Button>
                  ) : (
                    <Button asChild variant="ghost" size="sm" className="shrink-0">
                      <Link to="/clientes" search={{ aba: "churn" }}>Ver em Clientes</Link>
                    </Button>
                  )}
                </div>
                <ul className="space-y-2">
                  {g.contas.map((c) => (
                    <li key={c.id} className="rounded-md bg-muted/40 p-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.plataformas.map((p) => <Badge key={p} variant="secondary">{p}</Badge>)}
                        {c.operacao_nome && c.operacao_nome !== "Principal" && <span className="text-xs text-muted-foreground">{c.operacao_nome}</span>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 text-xs text-muted-foreground">
                        {pausados && <span>Saldo congelado: <b className="numeric text-foreground">{formatMoeda(c.saldo_atual_estimado, c.moeda)}</b></span>}
                        <span>
                          {c.qtd_recargas > 0
                            ? `Última recarga: ${formatMoeda(c.valor_ultima_recarga, c.moeda)} em ${dataBR(c.data_ultima_recarga)}`
                            : "Sem recargas"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!reativando} onOpenChange={(o) => !o && setReativando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reativar {reativando?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O cliente volta para Clientes Ativos e para o monitor de saldo, com o saldo retomado de onde parou.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void reativar()}>Reativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
