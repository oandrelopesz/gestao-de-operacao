// Ficha do cliente (Fase 5 do front novo): tudo do cliente em uma tela, puxando das abas que já existem.
// Só leitura: para editar, cada bloco leva à aba de sempre. Entra pelo "Abrir ficha" da aba Clientes e pelos nomes
// do painel Hoje, que só aparecem nas aparências Painel e Editorial (a Clássica segue igual).
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, FolderOpen, LayoutDashboard, NotebookPen, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CACHE_KEYS, loadColunas, loadDemandas, loadSaldo } from "@/lib/data";
import { getCached } from "@/lib/pageCache";
import { useLido } from "@/lib/useLido";
import { NPS_STATUS_META, formatBRL, parseOperacoesResumo, tempoDeCasa } from "@/lib/clientes";
import { formatMoeda } from "@/lib/moedas";
import { clientesDaDemanda } from "@/lib/clientesDaDemanda";
import { diasDeAtraso, formatarDataCurta, hojeBrasilia } from "@/lib/entrega";
import { fetchNotasCliente } from "@/lib/notas";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cliente/$id")({ component: FichaCliente });

const STATUS_SALDO: Record<string, { rotulo: string; atr?: boolean }> = {
  ok: { rotulo: "Em dia" },
  alerta: { rotulo: "Alerta", atr: true },
  critico: { rotulo: "Crítico", atr: true },
  zerado: { rotulo: "Zerado", atr: true },
  sem_recarga: { rotulo: "Sem recarga" },
  cartao: { rotulo: "Cartão" },
};

async function buscarCliente(id: string) {
  const { data, error } = await supabase.from("clientes_view").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as any;
}

function FichaCliente() {
  const { id } = Route.useParams();
  const hoje = hojeBrasilia();
  const doCache = getCached<any[]>(CACHE_KEYS.clientesView)?.find((c) => c.id === id);
  const cliente = useLido<any>(null, () => buscarCliente(id), [id]);
  const c = cliente.v ?? doCache;
  const demandas = useLido<any[]>(CACHE_KEYS.demandas, loadDemandas);
  const colunas = useLido<{ id: string; title: string }[]>(CACHE_KEYS.colunas, loadColunas);
  const saldo = useLido<any[]>(CACHE_KEYS.saldo, loadSaldo);
  const notas = useLido(null, () => fetchNotasCliente(id), [id]);

  if (!c) {
    return (
      <div className="space-y-4">
        <Voltar />
        <p className="text-sm text-muted-foreground">{cliente.erro || cliente.v === null ? "Cliente não encontrado." : "Carregando cliente…"}</p>
      </div>
    );
  }

  const nps = NPS_STATUS_META[c.nps_status] ?? NPS_STATUS_META.sem_avaliacao;
  const operacoes = parseOperacoesResumo(c.operacoes);
  const nomeColuna = (s: string) => colunas.v?.find((k) => k.id === s)?.title ?? s;
  const abertas = (demandas.v ?? []).filter((d) => d.status !== "feito" && d.status !== "agendadas" && clientesDaDemanda(d).includes(id));
  const contas = (saldo.v ?? []).filter((r) => r.cliente_id === id);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Voltar />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="titulo-pagina text-2xl font-bold tracking-tight">{c.nome}</h1>
          {c.status_operacional !== "ativo" && <Badge variant="secondary">{c.status_operacional === "pausado" ? "Pausado" : "Em churn"}</Badge>}
          {c.arquivado && <Badge variant="secondary">Arquivado</Badge>}
          {c.em_onboarding && <Badge variant="secondary">Onboarding</Badge>}
          <Badge variant="outline" className={cn("font-normal", nps.classes)}>
            NPS: {nps.label}{c.ultima_nps_score != null ? ` (${c.ultima_nps_score})` : ""}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[c.nicho, c.data_inicio ? `cliente há ${tempoDeCasa(c.data_inicio)}` : null].filter(Boolean).join(" · ") || "Sem nicho e sem data de início"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Bloco icone={<Wallet size={16} />} titulo="Verba e saldo" para="/saldo">
          <p className="text-sm">
            {c.trafego_ativo === false ? "Tráfego desligado" : <>Verba do mês: <b className="tabular-nums">{formatBRL(c.verba_mensal_brl)}</b></>}
          </p>
          {operacoes.length > 1 && (
            <ul className="space-y-1 text-sm">
              {operacoes.map((o) => (
                <li key={o.id} className="flex justify-between gap-3">
                  <span className="truncate">{o.nome}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{o.verba_mensal != null ? formatMoeda(o.verba_mensal, o.moeda) : "sem verba"}</span>
                </li>
              ))}
            </ul>
          )}
          {!saldo.v ? <Vazio>Carregando saldo…</Vazio> : contas.length === 0 ? <Vazio>Nenhuma conta de anúncio no Saldo.</Vazio> : (
            <ul className="space-y-1.5 text-sm">
              {contas.map((r) => {
                const st = STATUS_SALDO[r.alerta_dispensado ? "ok" : r.status_alerta] ?? { rotulo: r.status_alerta };
                return (
                  <li key={`${r.operacao_id ?? ""}-${(r.plataformas ?? []).join()}`} className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{(r.plataformas ?? []).join(", ") || "Conta"}{r.operacao_nome && operacoes.length > 1 ? ` · ${r.operacao_nome}` : ""}</span>
                    <span className={cn("shrink-0 text-xs", st.atr ? "hoje-atr" : "text-muted-foreground")}>
                      {r.dias_restantes != null && r.status_alerta !== "cartao" ? `${r.dias_restantes} d · ` : ""}{st.rotulo}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Bloco>

        <Bloco icone={<LayoutDashboard size={16} />} titulo={`Demandas abertas${demandas.v ? ` (${abertas.length})` : ""}`} para="/">
          {!demandas.v ? <Vazio>Carregando demandas…</Vazio> : abertas.length === 0 ? <Vazio>Nenhuma demanda aberta.</Vazio> : (
            <ul className="space-y-1.5 text-sm">
              {abertas.slice(0, 12).map((d) => {
                const atr = d.status !== "recorrentes" && diasDeAtraso(d.prazo, hoje) > 0;
                return (
                  <li key={d.id} className="flex items-baseline justify-between gap-3 min-w-0">
                    <span className={cn("truncate", atr && "hoje-atr")}>{d.titulo}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{nomeColuna(d.status)}{d.prazo ? ` · ${formatarDataCurta(d.prazo)}` : ""}</span>
                  </li>
                );
              })}
              {abertas.length > 12 && <li className="text-xs text-muted-foreground">e mais {abertas.length - 12}</li>}
            </ul>
          )}
        </Bloco>

        <Bloco icone={<NotebookPen size={16} />} titulo="Notas do cliente" para="/central" busca={{ cliente: id }}>
          {notas.erro ? <Vazio>Não consegui abrir as notas.</Vazio> : !notas.v ? <Vazio>Carregando notas…</Vazio> : notas.v.length === 0 ? <Vazio>Nenhuma nota na pasta do cliente.</Vazio> : (
            <ul className="space-y-1.5 text-sm">
              {notas.v.slice(0, 8).map((n) => (
                <li key={n.id} className="flex items-baseline justify-between gap-3 min-w-0">
                  <span className="truncate">{n.titulo || "(sem título)"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatarDataCurta(String(n.updated_at).slice(0, 10))}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco icone={<FolderOpen size={16} />} titulo="Arquivos" para="/central" busca={{ cliente: id }}>
          <Vazio>A pasta do cliente na Central de arquivos.</Vazio>
        </Bloco>
      </div>
    </div>
  );
}

function Voltar() {
  return (
    <Link to="/clientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft size={14} /> Clientes
    </Link>
  );
}

function Bloco({ icone, titulo, para, busca, children }: { icone: ReactNode; titulo: string; para: string; busca?: Record<string, string>; children: ReactNode }) {
  return (
    <Card className="hoje-bloco">
      <CardContent className="p-4 space-y-3">
        <Link to={para} search={busca as never} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          {icone}
          {titulo}
        </Link>
        {children}
      </CardContent>
    </Card>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
