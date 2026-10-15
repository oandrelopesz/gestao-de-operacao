import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buscar } from "@/lib/search";
import { CANAIS, canalPorId, destinoPorId } from "@/lib/utmCanais";
import { lerUtm, nomeDaUtm, sugerirCanal } from "@/lib/utm";
import { excluirUtms, guardarUtms, traduzErroUtm, type UtmGuardada } from "@/lib/utmGuardadas";
import { MensagemBusca } from "@/components/MensagemBusca";
import { LinhaCopiar } from "./UtmPecas";
import { SeletorCliente } from "./SeletorCliente";

interface Props {
  utms: UtmGuardada[];
  clientes: { id: string; nome: string }[];
  carregando: boolean;
  clienteId?: string;
  onAbrir: (id?: string) => void;
  onGerarMais: (id: string) => void;
  onMudou: () => Promise<void> | void;
}

const SEM_CANAL = "__outro__";
const nomeCanal = (id: string | null) => (id ? canalPorId(id)?.nome ?? id : "Outro");

export function GuardadasUtm({ utms, clientes, carregando, clienteId, onAbrir, onGerarMais, onMudou }: Props) {
  const [busca, setBusca] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<string[] | null>(null);

  const porCliente = useMemo(() => {
    const m = new Map<string, UtmGuardada[]>();
    for (const u of utms) m.set(u.cliente_id, [...(m.get(u.cliente_id) ?? []), u]);
    return m;
  }, [utms]);
  const nomeDe = (id: string) => clientes.find((c) => c.id === id)?.nome ?? "Cliente arquivado";
  const cards = useMemo(
    () => [...porCliente.entries()]
      .map(([id, lista]) => ({ id, nome: nomeDe(id), lista }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [porCliente, clientes],
  );
  const resultado = useMemo(() => buscar(cards, busca, (c) => [c.nome]), [cards, busca]);

  const excluir = async () => {
    if (!paraExcluir) return;
    try {
      await excluirUtms(paraExcluir);
      toast.success(paraExcluir.length === 1 ? "UTM excluída" : `${paraExcluir.length} UTMs excluídas`);
      setParaExcluir(null);
      await onMudou();
    } catch (e) {
      toast.error(traduzErroUtm(e));
    }
  };

  const dialogos = (
    <>
      <AdicionarExistente
        aberto={adicionando} onFechar={() => setAdicionando(false)} clientes={clientes} clienteIdFixo={clienteId}
        onSalvo={async () => { setAdicionando(false); await onMudou(); }}
      />
      <AlertDialog open={!!paraExcluir} onOpenChange={(o) => !o && setParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {paraExcluir?.length === 1 ? "esta UTM" : `${paraExcluir?.length} UTMs`}?</AlertDialogTitle>
            <AlertDialogDescription>
              Só some da lista guardada. Links que você já colou em anúncios continuam funcionando.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  // ---------- Um cliente aberto ----------
  if (clienteId) {
    const lista = porCliente.get(clienteId) ?? [];
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Voltar para os clientes" onClick={() => onAbrir()}><ArrowLeft size={16} /></Button>
            <div>
              <h2 className="text-lg font-semibold leading-tight">{nomeDe(clienteId)}</h2>
              <p className="text-xs text-muted-foreground">{lista.length} {lista.length === 1 ? "UTM guardada" : "UTMs guardadas"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAdicionando(true)}><Plus size={14} /> Adicionar existente</Button>
            <Button size="sm" className="gap-1.5" onClick={() => onGerarMais(clienteId)}><Sparkles size={14} /> Gerar mais</Button>
          </div>
        </div>
        {lista.length === 0 ? (
          <Card className="border-dashed"><CardContent className="px-6 py-12 text-center text-sm text-muted-foreground">Este cliente ainda não tem UTM guardada.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {lista.map((u) => (
              <Card key={u.id}>
                <CardContent className="space-y-2.5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" title={u.nome}>{u.nome}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{nomeCanal(u.canal)}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-muted-foreground">{u.utm_source} / {u.utm_medium}</span>
                        {u.destino && destinoPorId(u.destino) && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">destino: {destinoPorId(u.destino)!.nome}</span>}
                        {u.origem === "manual" && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">adicionada na mão</span>}
                        <span className="text-muted-foreground">{new Date(u.created_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Excluir" aria-label="Excluir" onClick={() => setParaExcluir([u.id])}
                    ><Trash2 size={14} /></Button>
                  </div>
                  {/* Destino sem link (mensagens, formulário nativo): só existem os parâmetros */}
                  {u.destino && destinoPorId(u.destino)?.comLink === false ? (
                    <LinhaCopiar titulo="Só os parâmetros" texto={u.parametros || u.url_final} destaque />
                  ) : (
                    <>
                      <LinhaCopiar titulo="Link completo" texto={u.url_final} destaque />
                      {u.parametros && <LinhaCopiar titulo="Só os parâmetros" texto={u.parametros} />}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {dialogos}
      </div>
    );
  }

  // ---------- Lista de clientes com UTM ----------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-[240px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." className="h-9 pl-8 text-sm" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAdicionando(true)}><Plus size={14} /> Adicionar existente</Button>
      </div>
      {resultado.modo === "parecidos" && <MensagemBusca resultado={resultado} />}
      {carregando ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : resultado.itens.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="px-6 py-12 text-center text-sm text-muted-foreground">
            {busca ? "Nenhum cliente encontrado." : "Nenhuma UTM guardada ainda. Gere uma na aba Gerar e clique em Guardar, ou adicione uma que já existe."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {resultado.itens.map((c) => {
            const canais = [...new Set(c.lista.map((u) => nomeCanal(u.canal)))];
            return (
              <button
                key={c.id} type="button" onClick={() => onAbrir(c.id)}
                className="rounded-xl border bg-card p-3.5 text-left transition-[box-shadow,border-color] hover:border-primary/40 hover:shadow-md"
              >
                <p className="truncate text-sm font-semibold" title={c.nome}>{c.nome}</p>
                <p className="text-xs text-muted-foreground">{c.lista.length} {c.lista.length === 1 ? "UTM" : "UTMs"}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {canais.slice(0, 4).map((n) => <span key={n} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{n}</span>)}
                  {canais.length > 4 && <span className="px-1 text-[10px] text-muted-foreground">+{canais.length - 4}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {dialogos}
    </div>
  );
}

function AdicionarExistente({ aberto, onFechar, clientes, clienteIdFixo, onSalvo }: {
  aberto: boolean; onFechar: () => void; clientes: { id: string; nome: string }[]; clienteIdFixo?: string; onSalvo: () => Promise<void> | void;
}) {
  const [cliente, setCliente] = useState("");
  const [link, setLink] = useState("");
  const [canal, setCanal] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  const lida = useMemo(() => (link.trim() ? lerUtm(link) : null), [link]);
  const canalAtual = canal ?? (lida ? sugerirCanal(lida.source, lida.medium) : null);
  const nomeAtual = nome || (lida ? nomeDaUtm(nomeCanal(canalAtual), lida.campaign) : "");
  const clienteAtual = clienteIdFixo ?? cliente;

  const fechar = () => { setLink(""); setCanal(null); setNome(""); setCliente(""); onFechar(); };
  const salvar = async () => {
    if (!clienteAtual) { toast.error("Escolha o cliente"); return; }
    if (!lida) { toast.error("Cole um link que tenha UTM (utm_source, utm_medium ou utm_campaign)"); return; }
    setSalvando(true);
    try {
      await guardarUtms([{
        cliente_id: clienteAtual, canal: canalAtual, nome: nomeAtual, url_base: lida.base, url_final: lida.url, destino: null,
        parametros: lida.parametros, utm_source: lida.source, utm_medium: lida.medium, utm_campaign: lida.campaign,
        utm_content: lida.content, utm_term: lida.term, origem: "manual",
      }]);
      toast.success("UTM guardada");
      setLink(""); setCanal(null); setNome(""); setCliente("");
      await onSalvo();
    } catch (e) {
      toast.error(traduzErroUtm(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Adicionar uma UTM que já existe</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!clienteIdFixo && (
            <div className="space-y-1.5">
              <Label className="text-xs">Cliente</Label>
              <SeletorCliente clientes={clientes} valor={cliente} onChange={setCliente} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Link com UTM</Label>
            <Input className="h-9 text-sm" placeholder="https://site.com.br/pagina?utm_source=..." value={link} onChange={(e) => setLink(e.target.value)} autoFocus />
            {link.trim() && !lida && <p className="text-xs text-destructive">Esse link não tem UTM, ou não parece um link.</p>}
            {lida && (
              <p className="break-all text-xs text-muted-foreground">
                Origem <b>{lida.source || "—"}</b> · Mídia <b>{lida.medium || "—"}</b> · Campanha <b>{lida.campaign || "—"}</b>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Canal</Label>
            <Select value={canalAtual ?? SEM_CANAL} onValueChange={(v) => setCanal(v === SEM_CANAL ? "" : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {CANAIS.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                <SelectItem value={SEM_CANAL}>Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nome</Label>
            <Input className="h-9 text-sm" placeholder="Como vai aparecer na lista" value={nomeAtual} onChange={(e) => setNome(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={fechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !lida || !clienteAtual}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
