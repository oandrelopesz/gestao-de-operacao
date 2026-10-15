import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ExternalLink, Info, Save, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { CANAIS, DESTINOS, MEDIUMS, canalPorId, destinoPorId, opcoesDoSlot, type Canal, type NomeSlot } from "@/lib/utmCanais";
import { entradaPadrao, gerarUtm, linkDeTeste, type Captura, type Entrada, type EscolhaSlot, type ResultadoUtm } from "@/lib/utm";
import { guardarUtms, novaDeResultado, traduzErroUtm, type NovaUtm, type UtmGuardada } from "@/lib/utmGuardadas";
import { LinhaCopiar, SeletorComOutro, SeletorExplicado } from "./UtmPecas";
import { SeletorCliente } from "./SeletorCliente";

interface Props {
  clientes: { id: string; nome: string }[];
  clienteId: string;
  onCliente: (id: string) => void;
  utms: UtmGuardada[];
  onGuardou: () => Promise<void> | void;
}

const PARAM: Record<NomeSlot, string> = { campaign: "utm_campaign", term: "utm_term", content: "utm_content" };
/** O que o formulário lembra entre visitas (só neste navegador) */
const CHAVE_FORM = "gerador-utm.form.v1";

interface Item { canal: Canal; entrada: Entrada; r: ResultadoUtm }

function Passo({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{n}</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export function GeradorUtm({ clientes, clienteId, onCliente, utms, onGuardou }: Props) {
  const [url, setUrl] = useState("");
  const [destino, setDestino] = useState("site");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [entradas, setEntradas] = useState<Record<string, Entrada>>({});
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const clienteSalvo = useRef("");

  // Lembra o formulário: ao voltar (ou recarregar) nada do que foi preenchido se perde
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE_FORM) ?? "null");
      if (s) {
        if (typeof s.url === "string") setUrl(s.url);
        if (DESTINOS.some((d) => d.id === s.destino)) setDestino(s.destino);
        if (Array.isArray(s.canais)) setSelecionados(CANAIS.map((c) => c.id).filter((id) => s.canais.includes(id)));
        if (typeof s.cliente === "string") clienteSalvo.current = s.cliente;
      }
    } catch { /* sem armazenamento no navegador: começa em branco */ }
    setPronto(true);
  }, []);
  // O cliente salvo volta quando a lista chega, sem passar por cima de um cliente já escolhido (ex.: "Gerar mais")
  useEffect(() => {
    const id = clienteSalvo.current;
    if (id && !clienteId && clientes.some((c) => c.id === id)) { clienteSalvo.current = ""; onCliente(id); }
  }, [clientes, clienteId, onCliente]);
  useEffect(() => {
    if (!pronto) return;
    try {
      localStorage.setItem(CHAVE_FORM, JSON.stringify({ url, destino, canais: selecionados, cliente: clienteId || clienteSalvo.current }));
    } catch { /* sem armazenamento: tudo bem */ }
  }, [pronto, url, destino, selecionados, clienteId]);

  const destinoAtual = destinoPorId(destino);
  const semLink = !!destinoAtual && !destinoAtual.comLink;

  const alternar = (id: string) =>
    setSelecionados((s) => CANAIS.map((c) => c.id).filter((x) => (x === id ? !s.includes(id) : s.includes(x))));
  const atualizar = (id: string, mudancas: Partial<Entrada>) =>
    setEntradas((prev) => ({ ...prev, [id]: { ...(prev[id] ?? entradaPadrao(id)), ...mudancas } }));
  const alternarAjustes = (id: string) =>
    setAbertos((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const itens: Item[] = useMemo(
    () =>
      selecionados.map((id) => {
        const entrada: Entrada = { ...(entradas[id] ?? entradaPadrao(id)), url, destino };
        return { canal: canalPorId(id)!, entrada, r: gerarUtm(entrada) };
      }),
    [selecionados, entradas, url, destino],
  );

  const urlsDoCliente = useMemo(
    () => [...new Set(utms.filter((u) => u.cliente_id === clienteId && u.url_base).map((u) => u.url_base))],
    [utms, clienteId],
  );
  // Sem link (mensagens, formulário nativo) o que se guarda e se compara são os parâmetros
  const jaGuardada = (r: ResultadoUtm) => {
    const chave = r.linkCompleto ?? (r.semLink ? r.parametros : null);
    return !!clienteId && !!chave && utms.some((u) => u.cliente_id === clienteId && u.url_final === chave);
  };

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

  const guardaveis = itens.filter((x) => !x.r.erros.length && (x.r.linkCompleto || x.r.semLink) && !jaGuardada(x.r));
  const comProblema = itens.filter((x) => x.r.erros.length).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] xl:items-start">
      <Card className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        <CardContent className="space-y-6 p-4">
          <Passo n={1} titulo="Cliente e destino">
            <div className="space-y-1.5">
              <Label className="text-xs">Cliente</Label>
              <SeletorCliente clientes={clientes} valor={clienteId} onChange={onCliente} limpavel />
              <p className="text-[11px] text-muted-foreground">Serve para guardar. Para só gerar e copiar, pode deixar vazio.</p>
            </div>
            <SeletorExplicado
              rotulo="Tipo de destino (para onde o clique leva)" valor={destino} onChange={setDestino}
              opcoes={DESTINOS.map((d) => ({ valor: d.id, rotulo: d.nome, explicacao: d.explicacao }))}
            />
            {semLink ? (
              <div className="flex items-start gap-1.5 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                <Info size={13} className="mt-0.5 shrink-0" /> {destinoAtual?.nota}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Link de destino ({destinoAtual?.nome.toLowerCase() ?? "a página"} para onde o clique vai)</Label>
                <Input
                  className="h-9 text-sm" placeholder="https://www.site-do-cliente.com.br/pagina" list="utm-urls-cliente"
                  value={url} onChange={(e) => setUrl(e.target.value)}
                />
                <datalist id="utm-urls-cliente">{urlsDoCliente.map((u) => <option key={u} value={u} />)}</datalist>
                <p className="text-[11px] text-muted-foreground">Se o link já tiver UTM antiga, ela é trocada. Parâmetros e âncora são mantidos.</p>
              </div>
            )}
          </Passo>

          <Passo n={2} titulo="Onde o link vai ser usado">
            <p className="-mt-1 text-[11px] text-muted-foreground">
              Não precisa digitar o nome da campanha: a plataforma preenche campanha, conjunto e anúncio sozinha quando o clique acontece.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelecionados(CANAIS.filter((c) => c.grupo === "pago").map((c) => c.id))}>Todos os pagos</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelecionados(CANAIS.map((c) => c.id))}>Todos</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!selecionados.length} onClick={() => setSelecionados([])}>Limpar</Button>
            </div>
            {(["pago", "organico"] as const).map((g) => (
              <div key={g}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g === "pago" ? "Anúncios pagos" : "Orgânico e perfis"}</p>
                <ul>
                  {CANAIS.filter((c) => c.grupo === g).map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                        <Checkbox checked={selecionados.includes(c.id)} onCheckedChange={() => alternar(c.id)} />
                        <span>{c.nome}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Passo>
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-3">
        {itens.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Info size={22} /></span>
              <p className="text-base font-semibold">Marque os canais ao lado</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Cada canal gera a sua UTM pronta para colar na plataforma, com as variáveis certas para capturar campanha, conjunto e anúncio.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">UTMs prontas ({itens.length})</h2>
                {comProblema > 0 && <p className="text-xs text-destructive">{comProblema} {comProblema === 1 ? "precisa" : "precisam"} de ajuste antes de copiar</p>}
              </div>
              <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={guardando || !guardaveis.length} onClick={() => guardar(guardaveis)}>
                <Save size={13} /> Guardar todas{guardaveis.length ? ` (${guardaveis.length})` : ""}
              </Button>
            </div>
            {itens.map(({ canal, entrada, r }) => (
              <CartaoCanal
                key={canal.id} canal={canal} entrada={entrada} r={r}
                aberto={abertos.has(canal.id)} onAjustes={() => alternarAjustes(canal.id)}
                onMudar={(m) => atualizar(canal.id, m)} onRemover={() => alternar(canal.id)}
                guardada={jaGuardada(r)} guardando={guardando} onGuardar={() => guardar([{ canal, entrada, r }])}
                notaDestino={r.semLink ? destinoAtual?.nota : undefined}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const ESTILO_CAPTURA: Record<Captura, string> = {
  dinamico: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  fixo: "bg-primary/10 text-primary",
  ausente: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};
const TEXTO_CAPTURA: Record<Captura, string> = { dinamico: "automático", fixo: "texto fixo", ausente: "não captura" };

function ChipCaptura({ rotulo, estado, naoUsa, detalhe }: { rotulo: string; estado: Captura; naoUsa?: boolean; detalhe?: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 font-medium", naoUsa ? "bg-muted text-muted-foreground" : ESTILO_CAPTURA[estado])}>
      {rotulo}: {naoUsa ? "não usa" : estado === "dinamico" && detalhe ? detalhe : TEXTO_CAPTURA[estado]}
    </span>
  );
}

function CartaoCanal({ canal, entrada, r, aberto, onAjustes, onMudar, onRemover, guardada, guardando, onGuardar, notaDestino }: {
  canal: Canal; entrada: Entrada; r: ResultadoUtm;
  aberto: boolean; onAjustes: () => void; onMudar: (m: Partial<Entrada>) => void; onRemover: () => void;
  guardada: boolean; guardando: boolean; onGuardar: () => void; notaDestino?: string;
}) {
  const temIds = !!canal.ids.utmId || canal.ids.extras.length > 0;
  const ok = r.erros.length === 0;
  // Canal sem variável (X) pede texto digitado: os ajustes já abrem para não passar batido
  const abrir = aberto || (["campaign", "term", "content"] as NomeSlot[]).some((n) => entrada[n].modo === "fixo" && canal[n].opcoes.length === 0);
  const botaoGuardar = (
    <Button size="sm" variant={guardada ? "ghost" : "secondary"} className="h-auto min-h-8 gap-1.5 text-xs" disabled={guardando || guardada || !ok || !(r.linkCompleto || r.semLink)} onClick={onGuardar}>
      {guardada ? <Check size={13} /> : <Save size={13} />} {guardada ? "Guardada" : "Guardar"}
    </Button>
  );
  const botaoTestar = r.linkCompleto ? (
    <Button
      size="sm" variant="ghost" className="h-auto min-h-8 gap-1.5 text-xs"
      title={r.dinamico ? "Abre o link trocando as variáveis por valores de teste (teste_...), para conferir no GA4 em tempo real" : "Abre o link para testar"}
      onClick={() => window.open(r.dinamico ? linkDeTeste(r.linkCompleto!) : r.linkCompleto!, "_blank", "noopener,noreferrer")}
    >
      <ExternalLink size={13} /> Testar
    </Button>
  ) : null;
  const linkLinha = (
    <LinhaCopiar
      key="link" titulo="Link completo" texto={r.linkCompleto}
      acoes={<>{botaoTestar}{botaoGuardar}</>} destaque={canal.primeiro === "link"}
      vazio={ok ? "Preencha o link de destino para ver o link completo" : "Corrija o que está em vermelho"}
    />
  );
  const paramLinha = (
    <LinhaCopiar
      key="param" titulo={`Só os parâmetros (para colar no campo ${canal.primeiro === "parametros" ? "da plataforma" : "se a plataforma pedir"})`}
      texto={r.parametros || null} vazio="Corrija o que está em vermelho" destaque={canal.primeiro === "parametros" || r.semLink}
      acoes={r.semLink ? botaoGuardar : undefined}
    />
  );

  return (
    <Card className={cn(!ok && "border-destructive/50")}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{canal.nome}</h3>
            {ok && (
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {r.campos.utm_source} / {r.campos.utm_medium}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant={aberto ? "secondary" : "ghost"} className="h-7 gap-1.5 text-xs" onClick={onAjustes}>
              <SlidersHorizontal size={13} /> Ajustes <ChevronDown size={12} className={cn("transition-transform", aberto && "rotate-180")} />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Tirar este canal" aria-label="Tirar este canal" onClick={onRemover}><X size={14} /></Button>
          </div>
        </div>

        {ok && (
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="font-medium text-muted-foreground">Captura:</span>
            {(["campaign", "term", "content"] as NomeSlot[]).map((n) => (
              <ChipCaptura key={n} rotulo={canal[n].rotulo} estado={r.captura[n]} detalhe={r.escolhas[n]} naoUsa={r.captura[n] === "ausente" && canal[n].opcoes.length === 0} />
            ))}
            {temIds && <ChipCaptura rotulo="IDs" estado={r.captura.ids ? "dinamico" : "ausente"} />}
          </div>
        )}

        {abrir && (
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
            <SeletorComOutro rotulo="Origem (utm_source)" valor={entrada.source} onChange={(v) => onMudar({ source: v })} opcoes={canal.sources} />
            <SeletorComOutro rotulo="Mídia (utm_medium)" valor={entrada.medium} onChange={(v) => onMudar({ medium: v })} opcoes={MEDIUMS} />
            {(["campaign", "term", "content"] as NomeSlot[]).map((n) => (
              <EditorSlot
                key={n} canal={canal} nome={n} valor={entrada[n]}
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

        {!ok && (
          <ul className="space-y-0.5 text-xs font-medium text-destructive">
            {r.erros.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        {r.semLink ? [paramLinha] : canal.primeiro === "parametros" ? [paramLinha, linkLinha] : [linkLinha, paramLinha]}
        {r.modeloGoogle && (
          <LinhaCopiar titulo="Modelo de acompanhamento (alternativa ao sufixo, para quando já existe um modelo na conta)" texto={r.modeloGoogle} />
        )}

        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Onde colar:</span> {canal.onde}</p>
        {canal.nota && (
          <p className="flex gap-1.5 text-xs text-muted-foreground"><Info size={13} className="mt-0.5 shrink-0" /> {canal.nota}</p>
        )}
        {notaDestino && (
          <p className="flex gap-1.5 text-xs text-muted-foreground"><Info size={13} className="mt-0.5 shrink-0" /> {notaDestino}</p>
        )}
        {r.avisos.map((a) => (
          <p key={a} className="flex gap-1.5 text-xs text-amber-600 dark:text-amber-400"><TriangleAlert size={13} className="mt-0.5 shrink-0" /> {a}</p>
        ))}
      </CardContent>
    </Card>
  );
}

function EditorSlot({ canal, nome, valor, onChange }: {
  canal: Canal; nome: NomeSlot; valor: EscolhaSlot; onChange: (v: EscolhaSlot) => void;
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
          placeholder={nome === "campaign" ? "Ex.: Black Friday 2026" : "Digite o valor"}
          value={valor.texto} onChange={(e) => onChange({ ...valor, texto: e.target.value })}
        />
      )}
    </div>
  );
}
