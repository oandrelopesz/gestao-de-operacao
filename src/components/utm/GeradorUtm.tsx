import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Info, Save, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CANAIS, MEDIUMS, canalPorId, opcoesDoSlot, type Canal, type NomeSlot } from "@/lib/utmCanais";
import { entradaPadrao, gerarUtm, type Entrada, type EscolhaSlot, type ResultadoUtm } from "@/lib/utm";
import { guardarUtms, novaDeResultado, traduzErroUtm, type NovaUtm, type UtmGuardada } from "@/lib/utmGuardadas";
import { LinhaCopiar, SeletorComOutro, SeletorExplicado } from "./UtmPecas";

interface Props {
  clientes: { id: string; nome: string }[];
  clienteId: string;
  onCliente: (id: string) => void;
  utms: UtmGuardada[];
  onGuardou: () => Promise<void> | void;
}

const PARAM: Record<NomeSlot, string> = { campaign: "utm_campaign", term: "utm_term", content: "utm_content" };

interface Item { canal: Canal; entrada: Entrada; r: ResultadoUtm }

export function GeradorUtm({ clientes, clienteId, onCliente, utms, onGuardou }: Props) {
  const [url, setUrl] = useState("");
  const [campanha, setCampanha] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [entradas, setEntradas] = useState<Record<string, Entrada>>({});
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);

  const alternar = (id: string) =>
    setSelecionados((s) => CANAIS.map((c) => c.id).filter((x) => (x === id ? !s.includes(id) : s.includes(x))));
  const definirCanais = (ids: string[]) => setSelecionados(ids);
  const atualizar = (id: string, mudancas: Partial<Entrada>) =>
    setEntradas((prev) => ({ ...prev, [id]: { ...(prev[id] ?? entradaPadrao(id)), ...mudancas } }));
  const alternarAjustes = (id: string) =>
    setAbertos((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // A campanha digitada em cima vale para todo canal que pede texto, a menos que o canal tenha o seu próprio
  const itens: Item[] = useMemo(
    () =>
      selecionados.map((id) => {
        const base = entradas[id] ?? entradaPadrao(id);
        const entrada: Entrada = {
          ...base, url,
          campaign: { ...base.campaign, texto: base.campaign.texto !== "" ? base.campaign.texto : campanha },
        };
        return { canal: canalPorId(id)!, entrada, r: gerarUtm(entrada) };
      }),
    [selecionados, entradas, url, campanha],
  );

  const urlsDoCliente = useMemo(
    () => [...new Set(utms.filter((u) => u.cliente_id === clienteId && u.url_base).map((u) => u.url_base))],
    [utms, clienteId],
  );
  const jaGuardada = (r: ResultadoUtm) =>
    !!clienteId && !!r.linkCompleto && utms.some((u) => u.cliente_id === clienteId && u.url_final === r.linkCompleto);

  const guardar = async (lista: Item[]) => {
    if (!clienteId) { toast.error("Escolha o cliente para guardar"); return; }
    const novas = lista.map((x) => novaDeResultado(x.r, clienteId, x.entrada.url)).filter((n): n is NovaUtm => !!n);
    if (!novas.length) { toast.error("Preencha o link de destino para guardar"); return; }
    setGuardando(true);
    try {
      await guardarUtms(novas);
      toast.success(novas.length === 1 ? "UTM guardada" : `${novas.length} UTMs guardadas`);
      await onGuardou();
    } catch (e) {
      toast.error(traduzErroUtm(e));
    } finally {
      setGuardando(false);
    }
  };

  const guardaveis = itens.filter((x) => !x.r.erros.length && x.r.linkCompleto && !jaGuardada(x.r));

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Cliente</Label>
            <Select value={clienteId || undefined} onValueChange={onCliente}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Serve para guardar. Para só gerar e copiar, pode deixar vazio.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Link de destino (a página para onde o clique vai)</Label>
            <Input
              className="h-9 text-sm" placeholder="https://www.site-do-cliente.com.br/pagina" list="utm-urls-cliente"
              value={url} onChange={(e) => setUrl(e.target.value)}
            />
            <datalist id="utm-urls-cliente">{urlsDoCliente.map((u) => <option key={u} value={u} />)}</datalist>
            <p className="text-[11px] text-muted-foreground">Se o link já tiver UTM antiga, ela é trocada. Parâmetros e âncora são mantidos.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nome da campanha</Label>
            <Input className="h-9 text-sm" placeholder="Ex.: Black Friday 2026" value={campanha} onChange={(e) => setCampanha(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Usado nos canais que pedem o nome digitado. Vira minúsculo, sem acento e com _ (black_friday_2026). Nos canais com variável, a plataforma preenche sozinha.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Onde o link vai ser usado</h2>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => definirCanais(CANAIS.filter((c) => c.grupo === "pago").map((c) => c.id))}>Todos os pagos</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => definirCanais(CANAIS.map((c) => c.id))}>Todos</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!selecionados.length} onClick={() => definirCanais([])}>Limpar</Button>
          </div>
        </div>
        {(["pago", "organico"] as const).map((g) => (
          <div key={g}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g === "pago" ? "Anúncios pagos" : "Orgânico e perfis"}</p>
            <div className="flex flex-wrap gap-1.5">
              {CANAIS.filter((c) => c.grupo === g).map((c) => {
                const on = selecionados.includes(c.id);
                return (
                  <button
                    key={c.id} type="button" aria-pressed={on} onClick={() => alternar(c.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {on && <Check size={12} />} {c.nome}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {itens.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Info size={22} /></span>
            <p className="text-base font-semibold">Escolha os canais acima</p>
            <p className="max-w-md text-sm text-muted-foreground">Cada canal gera a sua UTM pronta para colar na plataforma, já com as variáveis certas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">UTMs prontas ({itens.length})</h2>
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={guardando || !guardaveis.length} onClick={() => guardar(guardaveis)}>
              <Save size={13} /> Guardar todas{guardaveis.length ? ` (${guardaveis.length})` : ""}
            </Button>
          </div>
          {itens.map(({ canal, entrada, r }) => (
            <CartaoCanal
              key={canal.id} canal={canal} entrada={entrada} r={r} campanhaGlobal={campanha}
              aberto={abertos.has(canal.id)} onAjustes={() => alternarAjustes(canal.id)}
              onMudar={(m) => atualizar(canal.id, m)} onRemover={() => alternar(canal.id)}
              guardada={jaGuardada(r)} guardando={guardando} onGuardar={() => guardar([{ canal, entrada, r }])}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoCanal({ canal, entrada, r, campanhaGlobal, aberto, onAjustes, onMudar, onRemover, guardada, guardando, onGuardar }: {
  canal: Canal; entrada: Entrada; r: ResultadoUtm; campanhaGlobal: string;
  aberto: boolean; onAjustes: () => void; onMudar: (m: Partial<Entrada>) => void; onRemover: () => void;
  guardada: boolean; guardando: boolean; onGuardar: () => void;
}) {
  const temIds = !!canal.ids.utmId || canal.ids.extras.length > 0;
  const botaoGuardar = (
    <Button size="sm" variant={guardada ? "ghost" : "secondary"} className="h-auto min-h-8 gap-1.5 text-xs" disabled={guardando || guardada || !r.linkCompleto} onClick={onGuardar}>
      {guardada ? <Check size={13} /> : <Save size={13} />} {guardada ? "Guardada" : "Guardar"}
    </Button>
  );
  const linkLinha = (
    <LinhaCopiar
      key="link" titulo="Link completo" texto={r.linkCompleto} acoes={botaoGuardar} destaque={canal.primeiro === "link"}
      vazio={r.erros.length ? "Corrija o que está em vermelho" : "Preencha o link de destino para ver o link completo"}
    />
  );
  const paramLinha = (
    <LinhaCopiar
      key="param" titulo={`Só os parâmetros (para colar no campo ${canal.primeiro === "parametros" ? "da plataforma" : "se a plataforma pedir"})`}
      texto={r.parametros || null} vazio="Corrija o que está em vermelho" destaque={canal.primeiro === "parametros"}
    />
  );

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{canal.nome}</h3>
            {!r.erros.length && (
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {r.campos.utm_source} / {r.campos.utm_medium}
              </span>
            )}
            {r.dinamico && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">preenchida pela plataforma</span>}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant={aberto ? "secondary" : "ghost"} className="h-7 gap-1.5 text-xs" onClick={onAjustes}>
              <SlidersHorizontal size={13} /> Ajustes <ChevronDown size={12} className={cn("transition-transform", aberto && "rotate-180")} />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Tirar este canal" aria-label="Tirar este canal" onClick={onRemover}><X size={14} /></Button>
          </div>
        </div>

        {aberto && (
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
            <SeletorComOutro rotulo="Origem (utm_source)" valor={entrada.source} onChange={(v) => onMudar({ source: v })} opcoes={canal.sources} />
            <SeletorComOutro rotulo="Mídia (utm_medium)" valor={entrada.medium} onChange={(v) => onMudar({ medium: v })} opcoes={MEDIUMS} />
            {(["campaign", "term", "content"] as NomeSlot[]).map((n) => (
              <EditorSlot
                key={n} canal={canal} nome={n} valor={entrada[n]} campanhaGlobal={campanhaGlobal}
                onChange={(v) => onMudar({ [n]: v } as Partial<Entrada>)}
              />
            ))}
            {temIds && (
              <label className="flex items-start gap-2.5 text-xs sm:col-span-2">
                <Switch checked={entrada.incluirIds} onCheckedChange={(v) => onMudar({ incluirIds: v })} />
                <span>
                  <span className="font-medium">Incluir IDs (utm_id e parâmetros extras)</span>
                  <span className="block text-muted-foreground">
                    Acrescenta o número da campanha, do conjunto e do anúncio. Ajuda a cruzar com o relatório da plataforma e com o CRM.
                  </span>
                </span>
              </label>
            )}
          </div>
        )}

        {r.erros.length > 0 && (
          <ul className="space-y-0.5 text-xs font-medium text-destructive">
            {r.erros.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        {canal.primeiro === "parametros" ? [paramLinha, linkLinha] : [linkLinha, paramLinha]}
        {r.modeloGoogle && (
          <LinhaCopiar titulo="Modelo de acompanhamento (alternativa ao sufixo, para quando já existe um modelo na conta)" texto={r.modeloGoogle} />
        )}

        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Onde colar:</span> {canal.onde}</p>
        {canal.nota && (
          <p className="flex gap-1.5 text-xs text-muted-foreground"><Info size={13} className="mt-0.5 shrink-0" /> {canal.nota}</p>
        )}
        {r.avisos.map((a) => (
          <p key={a} className="flex gap-1.5 text-xs text-amber-600 dark:text-amber-400"><TriangleAlert size={13} className="mt-0.5 shrink-0" /> {a}</p>
        ))}
      </CardContent>
    </Card>
  );
}

function EditorSlot({ canal, nome, valor, campanhaGlobal, onChange }: {
  canal: Canal; nome: NomeSlot; valor: EscolhaSlot; campanhaGlobal: string; onChange: (v: EscolhaSlot) => void;
}) {
  const opcoes = opcoesDoSlot(canal, nome).map((o) => ({
    valor: o.id, rotulo: o.rotulo, explicacao: o.valor ? `${o.valor}: ${o.explicacao}` : o.explicacao,
  }));
  return (
    <div className="space-y-2">
      <SeletorExplicado rotulo={`${canal[nome].rotulo} (${PARAM[nome]})`} valor={valor.modo} onChange={(m) => onChange({ ...valor, modo: m })} opcoes={opcoes} />
      {valor.modo === "fixo" && (
        <Input
          className="h-9 text-sm"
          placeholder={nome === "campaign" && campanhaGlobal ? `Usando: ${campanhaGlobal}. Digite para mudar só aqui` : "Digite o valor"}
          value={valor.texto} onChange={(e) => onChange({ ...valor, texto: e.target.value })}
        />
      )}
    </div>
  );
}
