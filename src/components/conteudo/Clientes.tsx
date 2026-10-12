// Aba Conteúdo, área Clientes: os clientes ligados, o que falta em cada um e o "Ligar cliente".
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchClientesOpcoes, type ClienteOpcao } from "@/lib/gmn";
import { fetchContas, type ContaInstagram } from "@/lib/instagram";
import { cofrePastas, ligarCliente, type ClienteConteudo } from "@/lib/conteudo";
import { faltaParaGerar, type Formato } from "../../../supabase/functions/conteudo/regras.ts";
import { GavetaCliente } from "./GavetaCliente";

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div className="space-y-1"><Label>{rotulo}</Label>{children}</div>;
}

/** O que falta, olhando os formatos que a agenda usa (sem agenda, conta como carrossel). */
export function faltaDoCliente(c: ClienteConteudo): string[] {
  const formatos: Formato[] = c.agenda.length ? [...new Set(c.agenda.map((a) => a.formato))] : ["carrossel"];
  const falta = new Set(formatos.flatMap((f) => faltaParaGerar(c, f)));
  if (!c.agenda.length) falta.add("dias na agenda");
  return [...falta];
}

export function Clientes({ clientes, recarregar }: { clientes: ClienteConteudo[] | null; recarregar: () => void }) {
  const [ligar, setLigar] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  if (!clientes) return <Loader2 className="h-5 w-5 animate-spin" />;
  const cliente = clientes.find((c) => c.id === aberto) ?? null;
  return (
    <div className="space-y-3">
      <Button onClick={() => setLigar(true)}><Plus className="mr-1 h-4 w-4" />Ligar cliente</Button>
      {!clientes.length && <p className="text-sm text-muted-foreground">Nenhum cliente ligado ainda.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clientes.map((c) => {
          const falta = faltaDoCliente(c);
          return (
            <Card key={c.id} role="button" tabIndex={0} className="cursor-pointer hover:bg-muted/50"
              onClick={() => setAberto(c.id)} onKeyDown={(e) => e.key === "Enter" && setAberto(c.id)}>
              <CardContent className="space-y-2 p-4">
                <div className="font-medium">{c.clientes?.nome ?? "Cliente"}</div>
                <div className="text-xs text-muted-foreground">{c.agenda.length} {c.agenda.length === 1 ? "post" : "posts"} por semana</div>
                {falta.length ? <p className="text-xs text-amber-600">Falta: {falta.join(", ")}</p> : <Badge variant="secondary">Pronto para gerar</Badge>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <LigarCliente aberto={ligar} fechar={() => setLigar(false)} ligados={clientes.map((c) => c.cliente_id)}
        aoLigar={() => { setLigar(false); recarregar(); }} />
      {cliente && <GavetaCliente cliente={cliente} fechar={() => setAberto(null)} recarregar={recarregar} />}
    </div>
  );
}

function LigarCliente({ aberto, fechar, ligados, aoLigar }: { aberto: boolean; fechar: () => void; ligados: string[]; aoLigar: () => void }) {
  const [opcoes, setOpcoes] = useState<ClienteOpcao[]>([]);
  const [pastas, setPastas] = useState<string[]>([]);
  const [contas, setContas] = useState<ContaInstagram[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [pasta, setPasta] = useState("");
  const [conta, setConta] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setClienteId(""); setPasta(""); setConta("");
    fetchClientesOpcoes().then(setOpcoes).catch((e) => toast.error(e.message));
    cofrePastas().then((r) => setPastas(r.pastas)).catch((e) => toast.error(`Cofre: ${e.message}`));
    fetchContas().then((cs) => setContas(cs.filter((c) => c.ativa))).catch((e) => toast.error(e.message));
  }, [aberto]);
  const livres = opcoes.filter((o) => !ligados.includes(o.id));
  function escolherCliente(id: string) {
    setClienteId(id);
    const nome = livres.find((o) => o.id === id)?.nome.toLowerCase();
    const igual = pastas.find((p) => p.toLowerCase() === nome);
    if (igual) setPasta(igual);
  }
  async function salvar() {
    setSalvando(true);
    try {
      await ligarCliente({ cliente_id: clienteId, pasta_cofre: pasta || null, ig_conta_id: conta || null });
      toast.success("Cliente ligado.");
      aoLigar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ligar cliente</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Campo rotulo="Cliente">
            <Select value={clienteId} onValueChange={escolherCliente}>
              <SelectTrigger><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
              <SelectContent>{livres.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo rotulo="Pasta no cofre de clientes">
            <Select value={pasta} onValueChange={setPasta}>
              <SelectTrigger><SelectValue placeholder={pastas.length ? "Escolha a pasta" : "Cofre ainda não sincronizado"} /></SelectTrigger>
              <SelectContent>{pastas.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo rotulo="Conta do Instagram">
            <Select value={conta} onValueChange={setConta}>
              <SelectTrigger><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
              <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={c.id}>@{c.usuario}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
        </div>
        <DialogFooter><Button disabled={!clienteId || salvando} onClick={salvar}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Ligar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
