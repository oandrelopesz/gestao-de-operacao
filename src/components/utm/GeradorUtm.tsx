import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ExternalLink, Info, Plus, Save, SlidersHorizontal, Trash2, TriangleAlert, Wand2, X } from "lucide-react";
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
/** O que o formulário lembra entre visitas (só neste navegador). A v1 tinha um funil só. */
const CHAVE_FORM = "gerador-utm.form.v2";
const CHAVE_FORM_V1 = "gerador-utm.form.v1";
const IDS_CANAIS = CANAIS.map((c) => c.id);

/** Um funil: um destino (site, LP, formulário nativo...) com os canais em que ele vai ser usado. */
interface Funil { id: string; destino: string; url: string; canais: string[]; perfis: Record<string, string> }
interface Item { funil: Funil; canal: Canal; entrada: Entrada; r: ResultadoUtm }

const novoFunil = (p: Partial<Funil> = {}): Funil => ({ id: Math.random().toString(36).slice(2, 8), destino: "site", url: "", canais: [], perfis: {}, ...p });

/** Lê o que foi lembrado, descartando o que não existe mais (canal ou destino removido) */
function lerFunisSalvos(): { funis: Funil[]; cliente: string } {
  const limpar = (f: Partial<Funil>): Funil => novoFunil({
    id: typeof f.id === "string" && f.id ? f.id : undefined,
    destino: DESTINOS.some((d) => d.id === f.destino) ? f.destino : "site",
    url: typeof f.url === "string" ? f.url : "",
    canais: Array.isArray(f.canais) ? IDS_CANAIS.filter((id) => f.canais!.includes(id)) : [],
    perfis: f.perfis && typeof f.perfis === "object" ? Object.fromEntries(Object.entries(f.perfis).filter(([, v]) => typeof v === "string")) : {},
  });
  try {
    const v2 = JSON.parse(localStorage.getItem(CHAVE_FORM) ?? "null");
    if (v2 && Array.isArray(v2.funis) && v2.funis.length) return { funis: v2.funis.map(limpar), cliente: typeof v2.cliente === "string" ? v2.cliente : "" };
    const v1 = JSON.parse(localStorage.getItem(CHAVE_FORM_V1) ?? "null");
    if (v1) return { funis: [limpar({ url: v1.url, destino: v1.destino, canais: v1.canais })], cliente: typeof v1.cliente === "string" ? v1.cliente : "" };
  } catch { /* sem armazenamento no navegador: começa em branco */ }
  return { funis: [novoFunil()], cliente: "" };
}

/** O que ainda falta para poder gerar (null = tudo preenchido) */
function pendencia(f: Funil, n: number): string | null {
  const d = destinoPorId(f.destino);
  if (!f.canais.length) return `Funil ${n}: marque ao menos um canal.`;
  if (!(d && !d.comLink) && !f.url.trim()) return `Funil ${n}: preencha o link de destino.`;
  const sem = f.canais.find((id) => canalPorId(id)?.perfil && !f.perfis[id]?.trim());
  if (sem) return `Funil ${n}: preencha o nome do perfil de ${canalPorId(sem)!.nome}.`;
  return null;
}

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
  const [funis, setFunis] = useState<Funil[]>(() => [novoFunil()]);
  /** Foto dos funis no momento do clique em Gerar: só o que está aqui aparece à direita */
  const [gerado, setGerado] = useState<Funil[] | null>(null);
  const [entradas, setEntradas] = useState<Record<string, Entrada>>({});
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const clienteSalvo = useRef("");
  const aoGerar = useRef<HTMLDivElement>(null);

  // Lembra o formulário: ao voltar (ou recarregar) nada do que foi preenchido se perde
  useEffect(() => {
    const s = lerFunisSalvos();
    setFunis(s.funis);
    clienteSalvo.current = s.cliente;
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
      localStorage.setItem(CHAVE_FORM, JSON.stringify({ funis, cliente: clienteId || clienteSalvo.current }));
    } catch { /* sem armazenamento: tudo bem */ }
  }, [pronto, funis, clienteId]);

  const mudarFunil = (id: string, m: Partial<Funil>) => setFunis((fs) => fs.map((f) => (f.id === id ? { ...f, ...m } : f)));
  const alternarCanal = (f: Funil, canalId: string) =>
    mudarFunil(f.id, { canais: IDS_CANAIS.filter((x) => (x === canalId ? !f.canais.includes(canalId) : f.canais.includes(x))) });
  const mudarPerfil = (f: Funil, canalId: string, v: string) => mudarFunil(f.id, { perfis: { ...f.perfis, [canalId]: v } });
  const tirarCanal = (funilId: string, canalId: string) => {
    const tira = (fs: Funil[]) => fs.map((f) => (f.id === funilId ? { ...f, canais: f.canais.filter((x) => x !== canalId) } : f));
    setFunis(tira);
    setGerado((g) => (g ? tira(g).filter((f) => f.canais.length) : g));
  };
  const atualizar = (chave: string, canalId: string, mudancas: Partial<Entrada>) =>
    setEntradas((prev) => ({ ...prev, [chave]: { ...(prev[chave] ?? entradaPadrao(canalId)), ...mudancas } }));
  const alternarAjustes = (chave: string) =>
    setAbertos((prev) => { const n = new Set(prev); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });

  const pendencias = funis.map((f, i) => pendencia(f, i + 1)).filter((p): p is string => !!p);
  const totalCanais = funis.reduce((n, f) => n + f.canais.length, 0);
  const gerar = () => {
    if (pendencias.length) return;
    setGerado(JSON.parse(JSON.stringify(funis)));
    setTimeout(() => aoGerar.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };
  // O formulário mudou depois de gerar: o que está à direita ficou para trás
  const desatualizado = !!gerado && JSON.stringify(gerado) !== JSON.stringify(funis);

  const itens: Item[] = useMemo(
    () =>
      (gerado ?? []).flatMap((f) =>
        f.canais.map((id) => {
          const entrada: Entrada = { ...(entradas[`${f.id}|${id}`] ?? entradaPadrao(id)), url: f.url, destino: f.destino, perfil: f.perfis[id] ?? "" };
          return { funil: f, canal: canalPorId(id)!, entrada, r: gerarUtm(entrada) };
        }),
      ),
    [gerado, entradas],
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
    // Dois funis podem dar o mesmo link final: o banco recusa a mesma linha duas vezes no mesmo lote
    const vistos = new Set<string>();
    const novas: NovaUtm[] = [];
    for (const x of lista) {
      const n = novaDeResultado(x.r, clienteId, x.entrada.url);
      if (n && !vistos.has(n.url_final)) { vistos.add(n.url_final); novas.push(n); }
    }
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
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] xl:items-start">
      <Card className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        <CardContent className="space-y-6 p-4">
          <Passo n={1} titulo="Cliente">
            <div className="space-y-1.5">
              <SeletorCliente clientes={clientes} valor={clienteId} onChange={onCliente} limpavel />
              <p className="text-[11px] text-muted-foreground">Serve para guardar. Para só gerar e copiar, pode deixar vazio.</p>
            </div>
          </Passo>

          <Passo n={2} titulo="Funis e canais">
            <p className="-mt-1 text-[11px] text-muted-foreground">
              Um funil é um destino (site, landing page, formulário nativo...) com os canais em que ele vai ser usado. Não precisa digitar nome de campanha: a plataforma preenche campanha, conjunto e anúncio sozinha quando o clique acontece.
            </p>
            {funis.map((f, i) => (
              <FormFunil
                key={f.id} n={i + 1} funil={f} podeRemover={funis.length > 1} datalist="utm-urls-cliente"
                onMudar={(m) => mudarFunil(f.id, m)} onCanal={(id) => alternarCanal(f, id)} onPerfil={(id, v) => mudarPerfil(f, id, v)}
                onRemover={() => setFunis((fs) => fs.filter((x) => x.id !== f.id))}
              />
            ))}
            <datalist id="utm-urls-cliente">{urlsDoCliente.map((u) => <option key={u} value={u} />)}</datalist>
            <Button variant="outline" size="sm" className="w-full gap-1.5 border-dashed text-xs" onClick={() => setFunis((fs) => [...fs, novoFunil()])}>
              <Plus size={13} /> Adicionar outro funil
            </Button>
          </Passo>

          <div className="sticky bottom-0 -mx-4 -mb-4 space-y-2 border-t bg-card p-4">
            {pendencias[0] && <p className="text-xs text-amber-600 dark:text-amber-400">{pendencias[0]}</p>}
            <Button className="w-full gap-2" disabled={pendencias.length > 0} onClick={gerar}>
              <Wand2 size={15} /> Gerar UTMs{totalCanais ? ` (${totalCanais} em ${funis.length} ${funis.length === 1 ? "funil" : "funis"})` : ""}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div ref={aoGerar} className="min-w-0 space-y-3">
        {!gerado || itens.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Info size={22} /></span>
              <p className="text-base font-semibold">Preencha ao lado e clique em Gerar</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Cada canal de cada funil gera a sua UTM pronta para colar na plataforma, com as variáveis certas para capturar campanha, conjunto e anúncio.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">UTMs prontas ({itens.length})</h2>
                {comProblema > 0 && <p className="text-xs text-destructive">{comProblema} {comProblema === 1 ? "precisa" : "precisam"} de ajuste antes de copiar</p>}
                {desatualizado && <p className="text-xs text-amber-600 dark:text-amber-400">Você mudou o formulário depois de gerar. Clique em Gerar de novo para atualizar.</p>}
              </div>
              <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={guardando || !guardaveis.length} onClick={() => guardar(guardaveis)}>
                <Save size={13} /> Guardar todas{guardaveis.length ? ` (${guardaveis.length})` : ""}
              </Button>
            </div>
            {gerado.map((f, i) => {
              const doFunil = itens.filter((x) => x.funil.id === f.id);
              const dest = destinoPorId(f.destino);
              return (
                <section key={f.id} className="space-y-3">
                  <h3 className="flex flex-wrap items-baseline gap-x-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Funil {i + 1} · {dest?.nome ?? f.destino}</span>
                    {f.url && dest?.comLink && <span className="break-all font-mono text-[11px] font-normal normal-case tracking-normal">{f.url}</span>}
                  </h3>
                  {doFunil.map(({ canal, entrada, r }) => {
                    const chave = `${f.id}|${canal.id}`;
                    return (
                      <CartaoCanal
                        key={chave} canal={canal} entrada={entrada} r={r}
                        aberto={abertos.has(chave)} onAjustes={() => alternarAjustes(chave)}
                        onMudar={(m) => atualizar(chave, canal.id, m)} onRemover={() => tirarCanal(f.id, canal.id)}
                        guardada={jaGuardada(r)} guardando={guardando} onGuardar={() => guardar([{ funil: f, canal, entrada, r }])}
                        notaDestino={r.semLink ? dest?.nota : undefined}
                      />
                    );
                  })}
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function FormFunil({ n, funil, podeRemover, datalist, onMudar, onCanal, onPerfil, onRemover }: {
  n: number; funil: Funil; podeRemover: boolean; datalist: string;
  onMudar: (m: Partial<Funil>) => void; onCanal: (id: string) => void; onPerfil: (id: string, v: string) => void; onRemover: () => void;
}) {
  const dest = destinoPorId(funil.destino);
  const semLink = !!dest && !dest.comLink;
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funil {n}</h3>
        {podeRemover && (
          <Button size="icon" variant="ghost" className="h-6 w-6" title="Remover este funil" aria-label="Remover este funil" onClick={onRemover}><Trash2 size={13} /></Button>
        )}
      </div>
      <SeletorExplicado
        rotulo="Tipo de destino (para onde o clique leva)" valor={funil.destino} onChange={(v) => onMudar({ destino: v })}
        opcoes={DESTINOS.map((d) => ({ valor: d.id, rotulo: d.nome, explicacao: d.explicacao }))}
      />
      {semLink ? (
        <div className="flex items-start gap-1.5 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <Info size={13} className="mt-0.5 shrink-0" /> {dest?.nota}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs">Link de destino ({dest?.nome.toLowerCase() ?? "a página"} para onde o clique vai)</Label>
          <Input
            className="h-9 text-sm" placeholder="https://www.site-do-cliente.com.br/pagina" list={datalist}
            value={funil.url} onChange={(e) => onMudar({ url: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">Se o link já tiver UTM antiga, ela é trocada. Parâmetros e âncora são mantidos.</p>
        </div>
      )}
      <div className="space-y-2">
        <p className="text-xs font-medium">Onde este funil vai ser usado</p>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onMudar({ canais: CANAIS.filter((c) => c.grupo === "pago").map((c) => c.id) })}>Todos os pagos</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onMudar({ canais: IDS_CANAIS })}>Todos</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!funil.canais.length} onClick={() => onMudar({ canais: [] })}>Limpar</Button>
        </div>
        {(["pago", "organico"] as const).map((g) => (
          <div key={g}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g === "pago" ? "Anúncios pagos" : "Orgânico e perfis"}</p>
            <ul>
              {CANAIS.filter((c) => c.grupo === g).map((c) => {
                const marcado = funil.canais.includes(c.id);
                return (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                      <Checkbox checked={marcado} onCheckedChange={() => onCanal(c.id)} />
                      <span>{c.nome}</span>
                    </label>
                    {marcado && c.perfil && (
                      <div className="mb-1.5 ml-8 space-y-1">
                        <Label className="text-[11px]">Nome do perfil ({c.perfil.rotulo})</Label>
                        <Input
                          className="h-8 text-sm" placeholder={c.perfil.placeholder}
                          value={funil.perfis[c.id] ?? ""} onChange={(e) => onPerfil(c.id, e.target.value)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
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
            {(["campaign", "term", "content"] as NomeSlot[]).filter((n) => !(n === "content" && canal.perfil)).map((n) => (
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
