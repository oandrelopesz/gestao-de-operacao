import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, Layers, Link2, Loader2, PenLine, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatarDataCurta } from "@/lib/entrega";
import {
  criarProcesso,
  fetchClientesAtivos,
  fetchClientesEmOnboarding,
  fetchTemplates,
  type ClienteResumo,
  type Template,
} from "@/lib/processosService";
import { fetchPassosLivres, PassoOnboardingSelect, type PassosDoOnboarding } from "./LigarPassoDialog";

type Filtro = "onboarding" | "andamento";
type Base = "template" | "zero";

/** Valor do Select para roadmap pessoal (sem cliente). */
const PESSOAL = "__pessoal__";

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao salvar");

/** Parseia "YYYY-MM-DD" como data local, evitando o deslocamento de dia do fuso. */
export function parseDataLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

interface NovoRoadmapDialogProps {
  aberto: boolean;
  /** Cliente já escolhido ao abrir (opcional). */
  clienteIdInicial?: string;
  onClose: () => void;
  /** Chamado depois de criar — `id` vem vazio se a criação falhou no meio (a lista deve recarregar mesmo assim). */
  onCriado: (id: string | null) => void;
}

export function NovoRoadmapDialog({ aberto, clienteIdInicial, onClose, onCriado }: NovoRoadmapDialogProps) {
  const [emOnboarding, setEmOnboarding] = useState<ClienteResumo[]>([]);
  const [emAndamento, setEmAndamento] = useState<ClienteResumo[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<Filtro>("onboarding");
  /** Id do cliente, ou PESSOAL para roadmap pessoal. */
  const [clienteId, setClienteId] = useState("");
  const [nome, setNome] = useState("");
  const [base, setBase] = useState<Base>("zero");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [prazo, setPrazo] = useState<string | null>(null);
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [passos, setPassos] = useState<PassosDoOnboarding | null>(null);
  const [carregandoPassos, setCarregandoPassos] = useState(false);
  const [passoId, setPassoId] = useState("");
  const [criando, setCriando] = useState(false);

  // Abrir: zera o formulário e carrega clientes + templates
  const reqAbrir = useRef(0);
  useEffect(() => {
    if (!aberto) return;
    const minha = ++reqAbrir.current;
    setCarregando(true);
    setErro(null);
    setClienteId("");
    setNome("");
    setBase("zero");
    setTemplateId(null);
    setPrazo(null);
    setPassoId("");
    setPassos(null);
    Promise.all([fetchClientesEmOnboarding(), fetchClientesAtivos(), fetchTemplates("roadmap")])
      .then(([onb, ativos, t]) => {
        if (minha !== reqAbrir.current) return;
        const idsOnb = new Set(onb.map((c) => c.id));
        const andamento = ativos.filter((c) => !c.em_onboarding && !idsOnb.has(c.id));
        setEmOnboarding(onb);
        setEmAndamento(andamento);
        setTemplates(t);
        if (t.length) setBase("template");
        const inicial = clienteIdInicial ? [...onb, ...andamento].find((c) => c.id === clienteIdInicial) : undefined;
        if (inicial) {
          setFiltro(idsOnb.has(inicial.id) ? "onboarding" : "andamento");
          setClienteId(inicial.id);
        } else {
          setFiltro(onb.length ? "onboarding" : "andamento");
        }
      })
      .catch((e) => { if (minha === reqAbrir.current) setErro(erroMsg(e)); })
      .finally(() => { if (minha === reqAbrir.current) setCarregando(false); });
  }, [aberto, clienteIdInicial]);

  // Cliente escolhido: passos livres do onboarding ativo dele
  const reqPassos = useRef(0);
  useEffect(() => {
    const minha = ++reqPassos.current;
    setPassoId("");
    setPassos(null);
    if (!aberto || !clienteId || clienteId === PESSOAL) return;
    setCarregandoPassos(true);
    fetchPassosLivres(clienteId)
      .then((d) => { if (minha === reqPassos.current) setPassos(d); })
      .catch(() => {
        if (minha !== reqPassos.current) return;
        toast.error("Não foi possível carregar os passos do onboarding");
        setPassos({ onboarding: null, livres: [] });
      })
      .finally(() => { if (minha === reqPassos.current) setCarregandoPassos(false); });
  }, [aberto, clienteId]);

  const lista = filtro === "onboarding" ? emOnboarding : emAndamento;
  const ehPessoal = clienteId === PESSOAL;
  const clienteSelecionado = useMemo(
    () => [...emOnboarding, ...emAndamento].find((c) => c.id === clienteId) ?? null,
    [emOnboarding, emAndamento, clienteId],
  );
  const passoEscolhido = passos?.livres.find((p) => p.id === passoId) ?? null;
  // Ligado a um passo com data: a data do passo manda no prazo final (trigger do banco)
  const prazoDoPasso = passoEscolhido?.data ?? null;
  const prazoEfetivo = prazoDoPasso ?? prazo;

  const trocarFiltro = (f: Filtro) => {
    if (f === filtro) return;
    setFiltro(f);
    if (clienteId !== PESSOAL) setClienteId("");
  };

  const escolherTemplate = (t: Template) => {
    const anterior = templates.find((x) => x.id === templateId);
    setTemplateId(t.id);
    // Sugere o nome do template, sem sobrescrever o que a pessoa digitou
    if (!nome.trim() || (anterior && nome === anterior.nome)) setNome(t.nome);
  };

  const podeCriar = !!clienteId && !!nome.trim() && (base === "zero" || !!templateId) && !criando;

  const criar = async () => {
    if (!podeCriar) return;
    setCriando(true);
    try {
      const id = await criarProcesso({
        tipo: "roadmap",
        cliente_id: ehPessoal ? null : clienteId,
        pessoal: ehPessoal,
        nome: nome.trim(),
        template_id: base === "template" ? templateId : null,
        prazo_final: prazoEfetivo,
        passo_onboarding_id: passoId || null,
      });
      toast.success(`Roadmap "${nome.trim()}" criado ${ehPessoal ? "como pessoal" : `para ${clienteSelecionado?.nome ?? "o cliente"}`}`);
      onClose();
      onCriado(id);
    } catch (e) {
      toast.error(erroMsg(e));
      // O roadmap pode ter sido criado e só os passos do template falharem: recarrega a lista
      onCriado(null);
    } finally {
      setCriando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !criando) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo roadmap</DialogTitle>
          <DialogDescription>Um projeto de longo prazo do cliente, passo a passo. Os passos do roadmap não viram demandas.</DialogDescription>
        </DialogHeader>

        {erro ? (
          <p className="text-sm text-destructive">{erro}</p>
        ) : carregando ? (
          <div className="flex justify-center py-10">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Cliente */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs">Cliente</Label>
                <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                  {([
                    ["onboarding", "Em onboarding", emOnboarding.length],
                    ["andamento", "Em andamento", emAndamento.length],
                  ] as const).map(([valor, rotulo, qtd]) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => trocarFiltro(valor)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        filtro === valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {rotulo} <span className="tabular-nums opacity-60">{qtd}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger>
                  <SelectValue placeholder={lista.length ? "Escolha o cliente" : filtro === "onboarding" ? "Nenhum cliente em onboarding" : "Nenhum cliente em andamento"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PESSOAL}>Pessoal</SelectItem>
                  {lista.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Base */}
            <div className="space-y-2">
              <Label className="text-xs">Passos</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["template", "Template", "Parte de uma lista pronta", Layers],
                  ["zero", "Começar do zero", "Você adiciona os passos", PenLine],
                ] as const).map(([valor, titulo, sub, Icone]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setBase(valor)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
                      base === valor ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/40",
                    )}
                  >
                    <span className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      base === valor ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    )}>
                      <Icone size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{titulo}</span>
                      <span className="block text-xs text-muted-foreground">{sub}</span>
                    </span>
                  </button>
                ))}
              </div>
              {base === "template" && (
                templates.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
                    Nenhum template de roadmap ainda — crie na aba Templates ou comece do zero.
                  </p>
                ) : (
                  <ol className="-mx-1 max-h-44 space-y-1.5 overflow-y-auto px-1">
                    {templates.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => escolherTemplate(t)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                            templateId === t.id ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/40",
                          )}
                        >
                          <span className="truncate font-medium">{t.nome}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t.passos.length} {t.passos.length === 1 ? "passo" : "passos"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )
              )}
            </div>

            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="novo-roadmap-nome" className="text-xs">Nome do roadmap</Label>
              <Input
                id="novo-roadmap-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); criar(); } }}
                placeholder="Ex.: Landing page"
              />
            </div>

            {/* Ligar a um passo */}
            {clienteId && !ehPessoal && (carregandoPassos || passos?.onboarding) && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Link2 size={12} /> Ligar a um passo do onboarding <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                {carregandoPassos || !passos ? (
                  <div className="h-10 animate-pulse rounded-md bg-muted" />
                ) : passos.livres.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Todos os passos do onboarding deste cliente já têm um roadmap.</p>
                ) : (
                  <PassoOnboardingSelect dados={passos} valor={passoId} onChange={setPassoId} />
                )}
              </div>
            )}

            {/* Prazo final */}
            <div className="space-y-2">
              <Label className="text-xs">Prazo final <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              {prazoDoPasso ? (
                <p className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <CalendarClock size={14} className="text-muted-foreground" />
                  {formatarDataCurta(prazoDoPasso)}
                  <span className="text-xs text-muted-foreground">— a data do passo do onboarding</span>
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <Popover open={calendarioAberto} onOpenChange={setCalendarioAberto}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-44 justify-start gap-2 font-normal", !prazo && "text-muted-foreground")}>
                        <CalendarClock size={14} />
                        {prazo ? format(parseDataLocal(prazo), "dd/MM/yyyy") : "Sem prazo"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={prazo ? parseDataLocal(prazo) : undefined}
                        onSelect={(date) => { if (date) { setPrazo(format(date, "yyyy-MM-dd")); setCalendarioAberto(false); } }}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                  {prazo && (
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setPrazo(null)} aria-label="Remover prazo">
                      <X size={14} />
                    </Button>
                  )}
                  {passoEscolhido && prazo && (
                    <span className="text-xs text-muted-foreground">O passo recebe esta data.</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={criando}>Cancelar</Button>
          <Button onClick={criar} disabled={!podeCriar} className="gap-1.5">
            {criando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Criar roadmap
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
