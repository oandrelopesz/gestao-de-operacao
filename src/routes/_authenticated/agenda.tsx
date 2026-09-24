import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type FullCalendar from "@fullcalendar/react";
import type { EventInput } from "@fullcalendar/core";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DriveAuthError, oauthUrl, statusDoDrive } from "@/lib/googleDrive";
import {
  AgendaConflitoError, AgendaSemPermissaoError, listarAgendas, listarEventos, obterEvento, podeEditarEvento, podeEscrever,
  temPermissaoAgenda, type AgendaGoogle,
} from "@/lib/googleCalendar";
import { eventoParaForm, moverPorArrasto, novoForm, temParticipantes, type EventoGoogle } from "@/lib/agendaEvento";
import { salvarComEscopo, type Escopo } from "@/lib/agendaSerie";
import { useEscolha } from "@/components/agenda/Escolha";
import { FALLBACK_USER_ID, getUserId } from "@/lib/clientesService";
import { BotaoGoogleLogin } from "@/components/swipe/BotaoGoogleLogin";
import { EventoDialog, type AberturaEvento } from "@/components/agenda/EventoDialog";
import type { VisaoAgenda } from "@/components/agenda/AgendaGrade";

const AgendaGrade = lazy(() => import("@/components/agenda/AgendaGrade"));

export const Route = createFileRoute("/_authenticated/agenda")({ component: AgendaPage });

const VISOES: { valor: VisaoAgenda; rotulo: string }[] = [
  { valor: "timeGridDay", rotulo: "Dia" },
  { valor: "timeGridWeek", rotulo: "Semana" },
  { valor: "dayGridMonth", rotulo: "Mês" },
];
const CHAVE_VISAO = "agenda_visao";
const CHAVE_OCULTAS = "agenda_ocultas";
const CHAVE_PAINEL = "agenda_painel_agendas";

function lerLocal<T>(chave: string, padrao: T): T {
  try { const v = localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : padrao; } catch { return padrao; }
}
function gravarLocal(chave: string, valor: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* storage indisponível */ }
}

type Estado = "carregando" | "sem_login" | "sem_permissao" | "pronto" | "erro";
interface Ocorrencia { calendarId: string; evento: EventoGoogle }

function AgendaPage() {
  const [montado, setMontado] = useState(false);
  const [estado, setEstado] = useState<Estado>("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [agendas, setAgendas] = useState<AgendaGoogle[]>([]);
  const [ocultas, setOcultas] = useState<string[]>([]);
  /** Bloco "Agendas" à esquerda; escondido, a grade ocupa a largura toda. */
  const [painelAberto, setPainelAberto] = useState(true);
  const [visao, setVisao] = useState<VisaoAgenda>("timeGridWeek");
  const [periodo, setPeriodo] = useState<{ inicio: Date; fim: Date; titulo: string } | null>(null);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [carregandoEventos, setCarregandoEventos] = useState(false);
  const [abertura, setAbertura] = useState<AberturaEvento | null>(null);
  const calRef = useRef<FullCalendar | null>(null);
  const { elemento: perguntas, perguntar } = useEscolha();

  useEffect(() => {
    setMontado(true);
    setVisao(lerLocal<VisaoAgenda>(CHAVE_VISAO, "timeGridWeek"));
    setOcultas(lerLocal<string[]>(CHAVE_OCULTAS, []));
    setPainelAberto(lerLocal<boolean>(CHAVE_PAINEL, true));
  }, []);

  const iniciar = useCallback(async () => {
    setEstado("carregando");
    setErro(null);
    try {
      const st = await statusDoDrive(true);
      setClientId(st.client_id);
      if (!st.connected || !(await temPermissaoAgenda())) { setEstado("sem_permissao"); return; }
      setAgendas(await listarAgendas());
      setEstado("pronto");
    } catch (e) {
      if (e instanceof AgendaSemPermissaoError) setEstado("sem_permissao");
      else if (e instanceof DriveAuthError) setEstado("sem_login");
      else { setErro(e instanceof Error ? e.message : "Erro ao abrir a agenda"); setEstado("erro"); }
    }
  }, []);

  useEffect(() => {
    // Volta do consentimento do Google (?google_connected=1 / ?google_error=...)
    const p = new URLSearchParams(window.location.search);
    if (p.get("google_connected")) toast.success("Agenda do Google conectada");
    if (p.get("google_error")) toast.error(`O Google recusou a conexão: ${p.get("google_error")}`);
    if (p.has("google_connected") || p.has("google_error")) window.history.replaceState({}, "", window.location.pathname);
    iniciar();
  }, [iniciar]);

  const visiveis = useMemo(() => agendas.filter((a) => !ocultas.includes(a.id)), [agendas, ocultas]);

  const requisicao = useRef(0);
  /** `silencioso`: recarga automática — sem indicador e sem aviso de erro (tenta de novo no próximo minuto). */
  const carregarEventos = useCallback(async (silencioso = false) => {
    if (estado !== "pronto" || !periodo) return;
    const minha = ++requisicao.current;
    if (!silencioso) setCarregandoEventos(true);
    const resultados = await Promise.allSettled(
      visiveis.map(async (a) => (await listarEventos(a.id, periodo.inicio, periodo.fim)).map((evento) => ({ calendarId: a.id, evento }))),
    );
    if (minha !== requisicao.current) return;
    setCarregandoEventos(false);
    const falhas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (falhas.some((f) => f.reason instanceof AgendaSemPermissaoError)) { setEstado("sem_permissao"); return; }
    if (falhas.length && silencioso) return; // mantém o que já está na tela
    if (falhas.length) toast.error(`Não foi possível carregar ${falhas.length === 1 ? "uma agenda" : `${falhas.length} agendas`}: ${String(falhas[0].reason?.message ?? falhas[0].reason)}`);
    setOcorrencias(resultados.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
  }, [estado, periodo, visiveis]);

  useEffect(() => { carregarEventos(); }, [carregarEventos]);

  // Atualiza sozinha a cada minuto com a aba visível — mas não no meio de um arrastar,
  // de uma pergunta de "mover" ou com o formulário aberto (a grade mudaria por baixo)
  const ocupado = useRef(false);
  const aberturaRef = useRef(abertura);
  aberturaRef.current = abertura;
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState !== "visible" || ocupado.current || aberturaRef.current) return;
      carregarEventos(true);
    }, 60_000);
    return () => window.clearInterval(t);
  }, [carregarEventos]);

  // Voltou para a aba: pode ter mudado algo no celular
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === "visible" && !ocupado.current) carregarEventos(true); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [carregarEventos]);

  const corDe = useMemo(() => new Map(agendas.map((a) => [a.id, a])), [agendas]);
  const eventosGrade = useMemo<EventInput[]>(() => ocorrencias.map(({ calendarId, evento }) => {
    const a = corDe.get(calendarId);
    return {
      id: `${calendarId}::${evento.id}`,
      title: evento.summary || "(sem título)",
      start: evento.start?.date ?? evento.start?.dateTime ?? undefined,
      end: evento.end?.date ?? evento.end?.dateTime ?? undefined,
      allDay: !!evento.start?.date,
      backgroundColor: a?.backgroundColor,
      borderColor: a?.backgroundColor,
      textColor: a?.foregroundColor,
      editable: podeEditarEvento(a, evento, calendarId),
    };
  }), [ocorrencias, corDe]);

  const principal = agendas.find((a) => a.primary && podeEscrever(a)) ?? agendas.find(podeEscrever);

  const novo = (inicio: Date, fim: Date, diaInteiro: boolean) => {
    if (!principal) { toast.error("Nenhuma agenda com permissão de escrita"); return; }
    setAbertura({ tipo: "novo", form: novoForm(inicio, fim, diaInteiro, principal.id) });
  };

  const novoAgora = () => {
    const ini = new Date();
    ini.setMinutes(ini.getMinutes() < 30 ? 30 : 60, 0, 0);
    novo(ini, new Date(ini.getTime() + 60 * 60_000), false);
  };

  const abrir = async (id: string) => {
    const o = ocorrencias.find((x) => `${x.calendarId}::${x.evento.id}` === id);
    if (!o) return;
    try {
      const mestre = o.evento.recurringEventId ? await obterEvento(o.calendarId, o.evento.recurringEventId) : null;
      setAbertura({ tipo: "editar", aberto: { calendarId: o.calendarId, evento: o.evento, mestre } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o evento");
    }
  };

  // Arrastou/esticou na grade: salva pelo mesmo caminho do formulário (escopo e aviso aos participantes)
  const mover = async (id: string, inicio: Date, fim: Date | null, diaInteiro: boolean, reverter: () => void) => {
    const o = ocorrencias.find((x) => `${x.calendarId}::${x.evento.id}` === id);
    if (!o) { reverter(); return; }
    ocupado.current = true;
    try {
      const mestre = o.evento.recurringEventId ? await obterEvento(o.calendarId, o.evento.recurringEventId) : null;
      const form = moverPorArrasto(eventoParaForm(o.evento, o.calendarId, mestre?.recurrence), inicio, fim, diaInteiro);
      let escopo: Escopo = "todos";
      if (mestre) {
        const e = await perguntar("Mover evento recorrente", [
          { valor: "este", rotulo: "Este evento" },
          { valor: "seguintes", rotulo: "Este e os eventos seguintes" },
          { valor: "todos", rotulo: "Todos os eventos" },
        ], { confirmar: "OK" });
        if (!e) { reverter(); return; }
        escopo = e as Escopo;
      }
      let enviar = false;
      if (temParticipantes(o.evento)) {
        const r = await perguntar("Avisar os participantes da mudança?", [
          { valor: "nao", rotulo: "Não enviar" },
          { valor: "sim", rotulo: "Enviar" },
        ], { modo: "botoes", descricao: "O Google manda um e-mail para os participantes." });
        if (r === null) { reverter(); return; }
        enviar = r === "sim";
      }
      await salvarComEscopo(form, { calendarId: o.calendarId, evento: o.evento, mestre }, escopo, enviar);
      toast.success("Evento movido no Google Agenda");
      carregarEventos();
    } catch (e) {
      reverter();
      toast.error(e instanceof Error ? e.message : "Não foi possível mover o evento");
      if (e instanceof AgendaConflitoError) carregarEventos();
    } finally {
      ocupado.current = false;
    }
  };

  const trocarVisao = (v: VisaoAgenda) => {
    setVisao(v);
    gravarLocal(CHAVE_VISAO, v);
    calRef.current?.getApi().changeView(v);
  };

  const alternarAgenda = (id: string) => {
    setOcultas((atual) => {
      const nova = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id];
      gravarLocal(CHAVE_OCULTAS, nova);
      return nova;
    });
  };

  const conectar = async () => {
    try {
      const st = await statusDoDrive(true);
      if (!st.client_id || !st.redirect_uri) { toast.error("Credenciais do Google não configuradas no projeto"); return; }
      const userId = (await getUserId()) || FALLBACK_USER_ID;
      window.location.href = oauthUrl(st.client_id, st.redirect_uri, userId, `${window.location.origin}/agenda`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a conexão");
    }
  };

  const api = () => calRef.current?.getApi();

  const alternarPainel = () => {
    setPainelAberto((v) => { gravarLocal(CHAVE_PAINEL, !v); return !v; });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <CalendarDays size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
            <p className="text-sm text-muted-foreground">Sua agenda do Google, direto no sistema</p>
          </div>
        </div>
        {estado === "pronto" && (
          <Button className="gap-2" onClick={novoAgora}><Plus size={16} /> Novo evento</Button>
        )}
      </div>

      {estado === "carregando" && <Skeleton className="h-[60vh] w-full rounded-xl" />}

      {estado === "erro" && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-destructive">
            {erro}
            <Button size="sm" variant="outline" onClick={iniciar}>Tentar de novo</Button>
          </CardContent>
        </Card>
      )}

      {estado === "sem_permissao" && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CalendarDays size={26} /></span>
            <p className="text-base font-semibold">Conecte a Agenda do Google</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Autorize uma vez com a conta contato@andrelopes.digital. A conexão do Drive (swipe file) continua a mesma.
            </p>
            <Button className="mt-1" onClick={conectar}>Conectar a Agenda do Google</Button>
          </CardContent>
        </Card>
      )}

      {estado === "sem_login" && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="space-y-3 p-4 text-sm">
            <p className="font-medium">Entre com o Google neste navegador para ver a agenda</p>
            {clientId ? <BotaoGoogleLogin clientId={clientId} onEntrou={iniciar} /> : <p className="text-muted-foreground">Configure o login Google no Admin.</p>}
          </CardContent>
        </Card>
      )}

      {estado === "pronto" && (
        <div className={cn("grid items-start gap-5", painelAberto && "lg:grid-cols-[220px_1fr]")}>
          {painelAberto && (
            <Card className="order-2 lg:order-1">
              <CardContent className="space-y-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agendas</p>
                {agendas.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={!ocultas.includes(a.id)}
                      onCheckedChange={() => alternarAgenda(a.id)}
                      style={{ borderColor: a.backgroundColor, backgroundColor: ocultas.includes(a.id) ? undefined : a.backgroundColor }}
                    />
                    <span className="truncate">{a.summaryOverride ?? a.summary}</span>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="order-1 min-w-0 space-y-3 lg:order-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost" size="icon" className="h-8 w-8" onClick={alternarPainel}
                aria-label={painelAberto ? "Esconder agendas" : "Mostrar agendas"} title={painelAberto ? "Esconder agendas" : "Mostrar agendas"}
              >
                {painelAberto ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
              </Button>
              <Button variant="outline" size="sm" onClick={() => api()?.today()}>Hoje</Button>
              <div className="flex">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => api()?.prev()} aria-label="Anterior"><ChevronLeft size={16} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => api()?.next()} aria-label="Próximo"><ChevronRight size={16} /></Button>
              </div>
              <h2 className="text-base font-semibold first-letter:uppercase">{periodo?.titulo}</h2>
              {carregandoEventos && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => carregarEventos()} aria-label="Atualizar"><RefreshCw size={14} /></Button>
                <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                  {VISOES.map((v) => (
                    <button
                      key={v.valor}
                      type="button"
                      onClick={() => trocarVisao(v.valor)}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                        visao === v.valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {v.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="h-[calc(100vh-15rem)] min-h-[560px] rounded-xl border bg-card p-2">
              {montado && (
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <AgendaGrade
                    visao={visao}
                    eventos={eventosGrade}
                    calRef={calRef}
                    onPeriodo={(inicio, fim, titulo) => setPeriodo({ inicio, fim, titulo })}
                    onSelecionar={novo}
                    onClicar={abrir}
                    onMover={mover}
                    onArrastando={(v) => { ocupado.current = v; }}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      )}

      <EventoDialog abertura={abertura} agendas={agendas} onClose={() => setAbertura(null)} onMudou={() => carregarEventos()} />
      {perguntas}
    </div>
  );
}
