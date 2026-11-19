// Painel "Hoje" (Fase 5 do front novo): o dia em um lugar só, puxando das abas que já existem.
// Só leitura. Abre na hora com o cache das abas (getCached) e atualiza por trás, sem nunca gravar nesse cache,
// para não mudar o comportamento de nenhuma aba. No menu ele só aparece nas aparências Painel e Editorial.
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CalendarDays, DollarSign, LayoutDashboard, Target, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CACHE_KEYS, loadDemandas, loadFinanceiro, loadSaldo } from "@/lib/data";
import { useLido } from "@/lib/useLido";
import { diasDeAtraso, hojeBrasilia } from "@/lib/entrega";
import { parcelasParaAvisar } from "@/lib/financeiro";
import { formatBRL } from "@/lib/clientes";
import { carregarColunas, carregarLeads } from "@/lib/crmDados";
import { montarFila } from "@/lib/crmUrgencia";
import { listarEventos } from "@/lib/googleCalendar";
import type { EventoGoogle } from "@/lib/agendaEvento";

export const Route = createFileRoute("/_authenticated/hoje")({ component: HojePage });

const ORDEM_SALDO: Record<string, number> = { zerado: 0, critico: 1, alerta: 2 };
const ROTULO_SALDO: Record<string, string> = { zerado: "Zerado", critico: "Crítico", alerta: "Alerta" };

function HojePage() {
  const hoje = hojeBrasilia();
  const demandas = useLido<any[]>(CACHE_KEYS.demandas, loadDemandas);
  const saldo = useLido<any[]>(CACHE_KEYS.saldo, loadSaldo);
  const financeiro = useLido<any[]>(CACHE_KEYS.financeiro, loadFinanceiro);
  const crm = useLido(null, async () => {
    const [leads, colunas] = await Promise.all([carregarLeads(), carregarColunas()]);
    return montarFila(leads, colunas, new Date()).filter((g) => g.itens.length > 0);
  });
  const agenda = useLido<EventoGoogle[]>(null, () =>
    listarEventos("primary", new Date(`${hoje}T00:00:00-03:00`), new Date(`${hoje}T23:59:59-03:00`)),
  );

  const doQuadro = (demandas.v ?? []).filter((d) => d.status !== "agendadas");
  const fazerHoje = doQuadro.filter((d) => d.status === "fazer_hoje");
  const atrasadas = doQuadro.filter((d) => d.status !== "feito" && d.status !== "recorrentes" && diasDeAtraso(d.prazo, hoje) > 0);
  const contas = (saldo.v ?? [])
    .filter((r) => r.status_alerta in ORDEM_SALDO && !r.alerta_dispensado)
    .sort((a, b) => ORDEM_SALDO[a.status_alerta] - ORDEM_SALDO[b.status_alerta] || (a.dias_restantes ?? 0) - (b.dias_restantes ?? 0));
  const parcelas = (financeiro.v ?? []).flatMap((f) => parcelasParaAvisar(f, hoje).map((p) => ({ fonte: f, p })));
  const dataLonga = new Date(`${hoje}T12:00:00-03:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="titulo-pagina text-2xl font-bold tracking-tight">Hoje</h1>
        <p className="text-muted-foreground text-sm first-letter:uppercase">{dataLonga}</p>
      </div>

      <div className="hoje-grade grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Bloco icone={<LayoutDashboard size={16} />} titulo="Fazer hoje" numero={fazerHoje.length} para="/" carregando={!demandas.v}
          rodape={atrasadas.length > 0 ? <span className="hoje-atr">{atrasadas.length} {atrasadas.length === 1 ? "atrasada" : "atrasadas"} no quadro</span> : null}>
          {fazerHoje.length === 0 ? <Vazio>Nada em Fazer hoje.</Vazio> : (
            <Lista itens={fazerHoje.slice(0, 8).map((d) => ({ id: d.id, texto: d.titulo, extra: d.clientes?.nome, atr: diasDeAtraso(d.prazo, hoje) > 0 }))} resto={fazerHoje.length - 8} />
          )}
        </Bloco>

        <Bloco icone={<CalendarDays size={16} />} titulo="Agenda" numero={agenda.v?.length} para="/agenda" carregando={!agenda.v && !agenda.erro}>
          {agenda.erro ? <Vazio>Abra a Agenda para conectar o Google.</Vazio> : (agenda.v ?? []).length === 0 ? <Vazio>Sem eventos hoje.</Vazio> : (
            <Lista itens={(agenda.v ?? []).slice(0, 8).map((e, i) => ({ id: e.id ?? String(i), texto: e.summary || "(sem título)", extra: horaDoEvento(e) }))} resto={(agenda.v ?? []).length - 8} />
          )}
        </Bloco>

        <Bloco icone={<Wallet size={16} />} titulo="Saldo para recarregar" numero={contas.length} para="/saldo" carregando={!saldo.v}>
          {contas.length === 0 ? <Vazio>Nenhuma conta em alerta.</Vazio> : (
            <Lista itens={contas.slice(0, 8).map((r) => ({
              id: `${r.cliente_id}-${r.operacao_id ?? ""}-${(r.plataformas ?? []).join()}`,
              texto: r.cliente_nome,
              extra: `${(r.plataformas ?? []).join(", ")} · ${ROTULO_SALDO[r.status_alerta]}`,
              atr: r.status_alerta === "zerado",
              cliente: r.cliente_id,
            }))} resto={contas.length - 8} />
          )}
        </Bloco>

        <Bloco icone={<DollarSign size={16} />} titulo="A receber" numero={parcelas.length} para="/financeiro" carregando={!financeiro.v}>
          {parcelas.length === 0 ? <Vazio>Nada vencido ou vencendo.</Vazio> : (
            <Lista itens={parcelas.slice(0, 8).map(({ fonte, p }) => ({
              id: `${fonte.fonte_id}-${p.numero}`,
              texto: fonte.nome,
              extra: `${formatBRL(p.falta)} · ${p.status === "atrasado" ? "atrasado" : p.vencimento === hoje ? "vence hoje" : `venceu dia ${p.dia}`}`,
              atr: p.status === "atrasado",
            }))} resto={parcelas.length - 8} />
          )}
        </Bloco>

        <Bloco icone={<Target size={16} />} titulo="CRM, fila do dia" numero={crm.v?.reduce((t, g) => t + g.itens.length, 0)} para="/crm" carregando={!crm.v && !crm.erro}>
          {crm.erro ? <Vazio>Não consegui abrir o CRM.</Vazio> : (crm.v ?? []).length === 0 ? <Vazio>Fila do dia vazia.</Vazio> : (
            <ul className="space-y-1.5 text-sm">
              {(crm.v ?? []).map((g) => (
                <li key={g.bloco} className="flex items-baseline justify-between gap-3">
                  <span className={g.bloco.includes("atrasados") ? "hoje-atr" : undefined}>{g.titulo}</span>
                  <b className="tabular-nums">{g.itens.length}</b>
                </li>
              ))}
            </ul>
          )}
        </Bloco>
      </div>
    </div>
  );
}

function horaDoEvento(e: EventoGoogle) {
  if (!e.start?.dateTime) return "dia todo";
  return new Date(e.start.dateTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function Bloco({ icone, titulo, numero, para, carregando, rodape, children }: {
  icone: ReactNode; titulo: string; numero?: number; para: string; carregando: boolean; rodape?: ReactNode; children: ReactNode;
}) {
  return (
    <Card className="hoje-bloco">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <Link to={para} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            {icone}
            {titulo}
          </Link>
          <span className="hoje-num tabular-nums">{carregando ? "…" : numero ?? 0}</span>
        </div>
        {carregando ? <Vazio>Carregando…</Vazio> : children}
        {!carregando && rodape && <p className="text-xs">{rodape}</p>}
      </CardContent>
    </Card>
  );
}

function Lista({ itens, resto }: { itens: { id: string; texto: string; extra?: string | null; atr?: boolean; cliente?: string }[]; resto: number }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {itens.map((i) => (
        <li key={i.id} className="flex items-baseline justify-between gap-3 min-w-0">
          {i.cliente ? (
            <Link to="/cliente/$id" params={{ id: i.cliente }} className={`truncate hover:underline ${i.atr ? "hoje-atr" : ""}`}>{i.texto}</Link>
          ) : (
            <span className={`truncate ${i.atr ? "hoje-atr" : ""}`}>{i.texto}</span>
          )}
          {i.extra && <span className="shrink-0 text-xs text-muted-foreground">{i.extra}</span>}
        </li>
      ))}
      {resto > 0 && <li className="text-xs text-muted-foreground">e mais {resto}</li>}
    </ul>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
