// Aba Conteúdo, área Clientes: todos os clientes, o que falta em cada um, ocultar um a um ou em massa.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MensagemBusca } from "@/components/MensagemBusca";
import { useBusca } from "@/lib/useBusca";
import { fetchClientesOpcoes, type ClienteOpcao } from "@/lib/gmn";
import { fetchContas, type ContaInstagram } from "@/lib/instagram";
import { cofrePastas, kitDoCofre, ligarCliente, ocultarClientes, salvarCliente, type ClienteConteudo } from "@/lib/conteudo";
import { faltaParaGerar, normalizarNome, type Formato } from "../../../supabase/functions/conteudo/regras.ts";
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

interface Item { cliente_id: string; nome: string; linha: ClienteConteudo | null }

export function Clientes({ clientes, recarregar }: { clientes: ClienteConteudo[] | null; recarregar: () => void }) {
  const [opcoes, setOpcoes] = useState<ClienteOpcao[]>([]);
  const [contas, setContas] = useState<ContaInstagram[]>([]);
  const [busca, setBusca] = useState("");
  const [ocultos, setOcultos] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null); // cliente_id: a linha pode chegar depois do recarregar
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    fetchClientesOpcoes().then(setOpcoes).catch((e) => toast.error(e.message));
    fetchContas().then(setContas).catch((e) => toast.error(e.message));
  }, []);

  const itens = useMemo<Item[]>(() => {
    const porId = new Map((clientes ?? []).map((c) => [c.cliente_id, c]));
    const lista: Item[] = opcoes.map((o) => ({ cliente_id: o.id, nome: o.nome, linha: porId.get(o.id) ?? null }));
    const ids = new Set(opcoes.map((o) => o.id));
    for (const c of clientes ?? []) if (!ids.has(c.cliente_id)) lista.push({ cliente_id: c.cliente_id, nome: c.clientes?.nome ?? "Cliente", linha: c });
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [opcoes, clientes]);
  const doModo = useMemo(() => itens.filter((i) => !!i.linha?.oculto === ocultos), [itens, ocultos]);
  const resultado = useBusca(doModo, busca, (i) => [i.nome]);
  const visiveis = resultado.itens;

  if (!clientes) return <Loader2 className="h-5 w-5 animate-spin" />;
  const linhaAberta = aberto ? clientes.find((c) => c.cliente_id === aberto) ?? null : null;
  const contaDe = (l: ClienteConteudo | null) => contas.find((c) => c.id === l?.ig_conta_id);

  function alternar(id: string) {
    setMarcados((m) => { const n = new Set(m); if (!n.delete(id)) n.add(id); return n; });
  }
  async function ocultar(ids: string[], valor: boolean) {
    setOcupado(true);
    try {
      await ocultarClientes(ids, valor, clientes ?? []);
      setMarcados(new Set());
      recarregar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOcupado(false);
    }
  }
  /** Cria a linha do cliente (pasta do cofre pelo nome) e puxa o kit. */
  async function configurar(i: Item, ativo: boolean) {
    const pastas = await cofrePastas().then((r) => r.pastas).catch(() => [] as string[]);
    const n = normalizarNome(i.nome);
    await ligarCliente({ cliente_id: i.cliente_id, pasta_cofre: pastas.find((p) => normalizarNome(p) === n) ?? null, ig_conta_id: null, ativo });
    const aviso = toast.loading("Puxando o kit do cofre...");
    try {
      await kitDoCofre(i.cliente_id);
      toast.dismiss(aviso);
    } catch (e: any) {
      toast.error(e.message, { id: aviso });
    }
  }
  async function executar(fn: () => Promise<void>) {
    setOcupado(true);
    try {
      await fn();
      recarregar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOcupado(false);
    }
  }
  function abrir(i: Item) {
    if (i.linha) setAberto(i.cliente_id);
    else executar(async () => { await configurar(i, false); setAberto(i.cliente_id); });
  }
  function ligar(i: Item, ativo: boolean) {
    executar(() => (i.linha ? salvarCliente(i.linha.id, { ativo }) : configurar(i, ativo)));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar cliente" aria-label="Buscar cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={ocultos} onCheckedChange={(v) => { setOcultos(v); setMarcados(new Set()); }} />Mostrar ocultos
        </label>
      </div>
      <MensagemBusca resultado={resultado} />
      {!visiveis.length && !busca && <p className="text-sm text-muted-foreground">{ocultos ? "Nenhum cliente oculto." : "Nenhum cliente."}</p>}
      <div className="divide-y rounded-lg border">
        {visiveis.map((i) => {
          const falta = i.linha ? faltaDoCliente(i.linha) : [];
          const conta = contaDe(i.linha);
          return (
            <div key={i.cliente_id} role="button" tabIndex={0} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
              onClick={() => !ocupado && abrir(i)}
              onKeyDown={(e) => e.target === e.currentTarget && e.key === "Enter" && !ocupado && abrir(i)}>
              <span onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={marcados.has(i.cliente_id)} onCheckedChange={() => alternar(i.cliente_id)} aria-label={`Selecionar ${i.nome}`} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{i.nome}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {conta ? `@${conta.usuario}` : "Sem conta do Instagram"}
                  {" · "}
                  {!i.linha ? "Ainda não configurado"
                    : falta.length ? <span className="text-amber-600">Falta: {falta.join(", ")}</span>
                    : "Pronto para gerar"}
                </div>
              </div>
              {i.linha?.ativo && !falta.length && <Badge variant="secondary" className="hidden sm:inline-flex">Gera toda semana</Badge>}
              <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                <Switch checked={!!i.linha?.ativo} disabled={ocupado} onCheckedChange={(v) => ligar(i, v)}
                  aria-label={`${i.linha?.ativo ? "Desligar" : "Ligar"} ${i.nome}`} />
              </span>
              <Button variant="ghost" size="icon" disabled={ocupado} aria-label={`${i.linha?.oculto ? "Mostrar" : "Ocultar"} ${i.nome}`}
                onClick={(e) => { e.stopPropagation(); ocultar([i.cliente_id], !i.linha?.oculto); }}>
                {i.linha?.oculto ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            </div>
          );
        })}
      </div>
      {marcados.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-xl">
            <span className="text-sm font-semibold">{marcados.size} {marcados.size === 1 ? "selecionado" : "selecionados"}</span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {marcados.size < visiveis.length && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={ocupado}
                  onClick={() => setMarcados(new Set(visiveis.map((i) => i.cliente_id)))}>Selecionar todos ({visiveis.length})</Button>
              )}
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={ocupado} onClick={() => ocultar([...marcados], !ocultos)}>
                {ocultos ? <Eye size={13} /> : <EyeOff size={13} />}{ocultos ? "Mostrar" : "Ocultar"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => setMarcados(new Set())}><X size={13} />Limpar</Button>
            </div>
          </div>
        </div>
      )}
      {linhaAberta && <GavetaCliente cliente={linhaAberta} fechar={() => setAberto(null)} recarregar={recarregar} />}
    </div>
  );
}
