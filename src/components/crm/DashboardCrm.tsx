// Dashboard do CRM (spec §10): números, jornada do lead e painéis. Todas as contas vêm de `crmMetricas`;
// aqui só se formata e desenha. Os leads e eventos já chegam filtrados pelo topo da página.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCrm } from "@/components/crm/CrmContexto";
import {
  calcularFunil, calcularJornada, calcularNumeros, chaveFaturamento, chaveNicho, chaveTrafego, chaveUtmCampaign,
  chaveUtmSource, comparecimentoPor, contarMotivos, depoisDaReuniao, noShowRecuperacao, parados, porGrupo, previsao,
  tempoPorColuna, tentativasAteReuniao, type Amostra, type LinhaComparecimento, type LinhaGrupo,
} from "@/lib/crmMetricas";
import { DIA_MS, formatarData, formatarDuracao, formatarPct, formatarReais } from "@/lib/crmFormato";
import type { ColunaCrm, EventoCrm, LeadCrm } from "@/lib/crmTipos";
import { cn } from "@/lib/utils";

// ---------- utilidades de exibição ----------

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const umaCasa = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rodapeMedia = (a: Amostra) => (a.n > 0 ? `média entre ${plural(a.n, "lead", "leads")}` : "sem dados ainda");
const ordinal = (n: number) => (n === 0 ? "0" : `${n}ª`);
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const truncar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Mesmo visual do tooltip do Dashboard geral (claro e escuro). */
const ESTILO_TOOLTIP = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
};
const ESTILO_ITEM_TOOLTIP = { color: "var(--popover-foreground)" };
const TICK = { fontSize: 11, fill: "var(--muted-foreground)" };
const COR_GRADE = "#88888825";
const COR_CURSOR = "#8888881a";

/** "Agora" que anda sozinho a cada minuto (tempo na coluna atual e parados). */
function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return agora;
}

// ---------- peças ----------

function Vazio({ texto = "Sem dados no período" }: { texto?: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{texto}</p>;
}

function Painel({
  titulo,
  descricao,
  className,
  children,
}: {
  titulo: string;
  descricao?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="space-y-1 p-4 pb-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descricao && <CardDescription className="text-xs">{descricao}</CardDescription>}
      </CardHeader>
      <CardContent className="p-4 pt-0">{children}</CardContent>
    </Card>
  );
}

function Numero({ titulo, valor, rodape }: { titulo: string; valor: string; rodape: string }) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-3">
        <p className="text-[10px] font-bold uppercase leading-tight tracking-wide text-muted-foreground">{titulo}</p>
        <p className="numeric mt-1 break-words text-xl font-semibold leading-tight">{valor}</p>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{rodape}</p>
      </CardContent>
    </Card>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{titulo}</h2>
      {children}
    </section>
  );
}

function BolinhaCor({ hex }: { hex: string | undefined }) {
  return <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: hex ?? "var(--muted-foreground)" }} />;
}

// ---------- painéis ----------

function PainelFunil({ leads }: { leads: LeadCrm[] }) {
  const { etapas, gargalo } = useMemo(() => calcularFunil(leads), [leads]);
  const topo = etapas[0]?.qtd ?? 0;
  return (
    <Painel titulo="Funil" descricao="Leads que chegaram a cada marco; a porcentagem é a passagem da etapa anterior.">
      {topo === 0 ? (
        <Vazio />
      ) : (
        <ol className="space-y-3">
          {etapas.map((e, i) => {
            // Uma passagem de 100% não é gargalo, mesmo que seja a menor
            const eGargalo = e.id === gargalo && e.taxa !== null && e.taxa < 1;
            return (
              <li key={e.id}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="inline-flex flex-wrap items-center gap-2 text-sm font-medium">
                    {e.rotulo}
                    {eGargalo && (
                      <Badge
                        variant="outline"
                        className="h-5 gap-1 border-amber-500/60 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-300"
                      >
                        <AlertTriangle size={11} aria-hidden /> Maior gargalo
                      </Badge>
                    )}
                  </span>
                  <span className="numeric text-xs text-muted-foreground">
                    <span className="text-sm font-semibold text-foreground">{e.qtd}</span>
                    {i > 0 && ` · ${formatarPct(e.taxa)} da anterior`}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", eGargalo ? "bg-amber-500" : "bg-primary")}
                    style={{ width: `${(e.qtd / topo) * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Painel>
  );
}

function PainelTentativas({ leads, colunas }: { leads: LeadCrm[]; colunas: ColunaCrm[] }) {
  const t = useMemo(() => tentativasAteReuniao(leads, colunas), [leads, colunas]);
  const dados = t.distribuicao.map((d) => ({ rotulo: ordinal(d.n), qtd: d.qtd }));
  const marcaram = t.distribuicao.reduce((s, d) => s + d.qtd, 0);
  const agora = t.emFollowUp.length
    ? t.emFollowUp.map(({ n, qtd }) => (n === 0 ? `${qtd} sem tentativa` : `${qtd} na ${n}ª`)).join(", ")
    : "ninguém";
  return (
    <Painel
      titulo="Em qual tentativa responderam"
      descricao="Quantos follow-ups cada lead precisou até marcar a reunião (0 = marcou sem follow-up)."
    >
      {marcaram === 0 && t.emFollowUp.length === 0 ? (
        <Vazio />
      ) : (
        <div className="space-y-3">
          {marcaram === 0 ? (
            <Vazio texto="Nenhum lead do período marcou reunião ainda." />
          ) : (
            <div className="-ml-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dados} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={COR_GRADE} />
                  <XAxis dataKey="rotulo" tick={TICK} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} width={36} tick={TICK} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: COR_CURSOR }}
                    contentStyle={ESTILO_TOOLTIP}
                    itemStyle={ESTILO_ITEM_TOOLTIP}
                    labelFormatter={(r: string) => (r === "0" ? "Sem follow-up" : `${r} tentativa`)}
                    formatter={(v: number) => [plural(v, "lead", "leads"), "Marcaram reunião"]}
                  />
                  <Bar
                    dataKey="qtd"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                    label={{ position: "top", fontSize: 11, fill: "var(--muted-foreground)", formatter: (v: number) => (v ? v : "") }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Média entre quem precisou de follow-up: </span>
              {t.mediaQuemPrecisou.n > 0 ? (
                <>
                  <span className="numeric font-semibold">{umaCasa(t.mediaQuemPrecisou.valor)}</span>{" "}
                  <span className="text-muted-foreground">(entre {plural(t.mediaQuemPrecisou.n, "lead", "leads")})</span>
                </>
              ) : (
                <span className="text-muted-foreground">sem dados ainda</span>
              )}
            </p>
            <p>
              <span className="text-muted-foreground">Em follow-up agora: </span>
              <span>{agora}</span>
            </p>
          </div>
        </div>
      )}
    </Painel>
  );
}

const LINHAS_INICIAIS = 10;

function TabelaGrupos({ linhas, rotulo }: { linhas: LinhaGrupo[]; rotulo: string }) {
  const [todas, setTodas] = useState(false);
  const visiveis = todas ? linhas : linhas.slice(0, LINHAS_INICIAIS);
  return (
    <div className="space-y-2">
      <Table className="min-w-[680px] text-xs sm:text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-0">{rotulo}</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Reuniões</TableHead>
            <TableHead className="text-right">Realizadas</TableHead>
            <TableHead className="text-right">Fechamentos</TableHead>
            <TableHead className="text-right">Receita</TableHead>
            <TableHead className="text-right">Conversão</TableHead>
            <TableHead className="pr-0 text-right">Ticket</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visiveis.map((l) => (
            <TableRow key={l.grupo}>
              <TableCell className="max-w-[240px] truncate pl-0 font-medium" title={l.grupo}>
                {l.grupo}
              </TableCell>
              <TableCell className="numeric text-right">{l.leads}</TableCell>
              <TableCell className="numeric text-right">{l.reunioes}</TableCell>
              <TableCell className="numeric text-right">{l.realizadas}</TableCell>
              <TableCell className="numeric text-right">{l.fechamentos}</TableCell>
              <TableCell className="numeric whitespace-nowrap text-right">{formatarReais(l.receita)}</TableCell>
              <TableCell className="numeric text-right">{formatarPct(l.conversao)}</TableCell>
              <TableCell
                className="numeric whitespace-nowrap pr-0 text-right"
                title={l.ticket !== null ? `média entre ${plural(l.fechamentos, "fechamento", "fechamentos")}` : undefined}
              >
                {l.ticket === null ? "—" : formatarReais(l.ticket)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Conversão = fechamentos ÷ leads, sem contar os desqualificados. Ticket = média entre os fechamentos da linha.
        </p>
        {linhas.length > LINHAS_INICIAIS && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setTodas((v) => !v)}>
            {todas ? "Mostrar menos" : `Mostrar todas as ${linhas.length} linhas`}
          </Button>
        )}
      </div>
    </div>
  );
}

function PainelGrupos({
  titulo,
  descricao,
  rotulo,
  leads,
  colunas,
  chave,
}: {
  titulo: string;
  descricao: string;
  rotulo: string;
  leads: LeadCrm[];
  colunas: ColunaCrm[];
  chave: (l: LeadCrm) => string;
}) {
  const linhas = useMemo(() => porGrupo(leads, colunas, chave), [leads, colunas, chave]);
  return (
    <Painel titulo={titulo} descricao={descricao} className="lg:col-span-2">
      {linhas.length === 0 ? <Vazio /> : <TabelaGrupos linhas={linhas} rotulo={rotulo} />}
    </Painel>
  );
}

function PainelMotivos({
  titulo,
  tipo,
  leads,
  colunas,
}: {
  titulo: string;
  tipo: "perdido" | "desqualificado";
  leads: LeadCrm[];
  colunas: ColunaCrm[];
}) {
  const dados = useMemo(() => contarMotivos(leads, colunas, tipo), [leads, colunas, tipo]);
  const total = dados.reduce((s, d) => s + d.qtd, 0);
  const altura = Math.max(dados.length * 36 + 32, 110);
  const quem = tipo === "perdido" ? plural(total, "lead perdido", "leads perdidos") : plural(total, "lead desqualificado", "leads desqualificados");
  return (
    <Painel titulo={titulo} descricao={total > 0 ? `Entre ${quem}.` : undefined}>
      {dados.length === 0 ? (
        <Vazio />
      ) : (
        <ResponsiveContainer width="100%" height={altura}>
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 0 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={COR_GRADE} />
            <XAxis type="number" allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="motivo"
              width={132}
              tick={TICK}
              tickFormatter={(v: string) => truncar(v, 22)}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: COR_CURSOR }}
              contentStyle={ESTILO_TOOLTIP}
              itemStyle={ESTILO_ITEM_TOOLTIP}
              formatter={(v: number) => [plural(v, "lead", "leads"), "Quantidade"]}
            />
            <Bar
              dataKey="qtd"
              fill="var(--primary)"
              radius={[0, 4, 4, 0]}
              maxBarSize={22}
              label={{ position: "right", fontSize: 11, fill: "var(--muted-foreground)" }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Painel>
  );
}

function MiniNumero({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-[10px] font-bold uppercase leading-tight tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="numeric mt-1 text-lg font-semibold">{valor}</p>
    </div>
  );
}

function PainelNoShow({ leads }: { leads: LeadCrm[] }) {
  const ns = useMemo(() => noShowRecuperacao(leads), [leads]);
  return (
    <Painel titulo="No-show e recuperação" descricao="Leads que faltaram a alguma reunião e o que aconteceu depois.">
      {ns.faltaram === 0 ? (
        <Vazio />
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <MiniNumero rotulo="Faltaram" valor={ns.faltaram} />
            <MiniNumero rotulo="Remarcaram" valor={ns.remarcaram} />
            <MiniNumero rotulo="Compareceram depois" valor={ns.compareceramDepois} />
            <MiniNumero rotulo="Recuperação" valor={formatarPct(ns.taxa)} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Recuperação = compareceram depois ÷ faltaram (entre {plural(ns.faltaram, "lead que faltou", "leads que faltaram")}).
          </p>
        </div>
      )}
    </Painel>
  );
}

function PainelDepoisReuniao({ leads, colunas }: { leads: LeadCrm[]; colunas: ColunaCrm[] }) {
  const d = useMemo(() => depoisDaReuniao(leads, colunas), [leads, colunas]);
  const linhas: [string, number][] = [
    ["Fechou na hora", d.naHora],
    ["Fechou no follow-up", d.noFollowUp],
    ["Não fechou", d.naoFechou],
    ["Em andamento", d.emAndamento],
  ];
  return (
    <Painel
      titulo="Depois da reunião"
      descricao={d.total > 0 ? `Dos ${plural(d.total, "lead que compareceu", "leads que compareceram")} à reunião.` : undefined}
    >
      {d.total === 0 ? (
        <Vazio />
      ) : (
        <ul className="space-y-3">
          {linhas.map(([rotulo, qtd]) => (
            <li key={rotulo}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{rotulo}</span>
                <span className="numeric text-xs text-muted-foreground">
                  <span className="text-sm font-semibold text-foreground">{qtd}</span> · {formatarPct(qtd / d.total)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(qtd / d.total) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}

function MiniTabelaComparecimento({ titulo, rotulo, linhas }: { titulo: string; rotulo: string; linhas: LinhaComparecimento[] }) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-medium">{titulo}</h3>
      {linhas.length === 0 ? (
        <Vazio />
      ) : (
        <Table className="min-w-[260px] text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 pl-0">{rotulo}</TableHead>
              <TableHead className="h-8 text-right">Realizadas</TableHead>
              <TableHead className="h-8 text-right">Faltas</TableHead>
              <TableHead className="h-8 pr-0 text-right">Taxa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.grupo}>
                <TableCell className="whitespace-nowrap pl-0 font-medium">{l.grupo}</TableCell>
                <TableCell className="numeric text-right">{l.realizadas}</TableCell>
                <TableCell className="numeric text-right">{l.faltas}</TableCell>
                <TableCell className="numeric pr-0 text-right">{formatarPct(l.taxa)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function PainelComparecimento({ eventos }: { eventos: EventoCrm[] }) {
  const grupos = useMemo(
    () => ({
      periodo: comparecimentoPor(eventos, "periodo"),
      dia: comparecimentoPor(eventos, "dia_semana").map((l) => ({ ...l, grupo: capitalizar(l.grupo) })),
      pontos: comparecimentoPor(eventos, "pontos"),
    }),
    [eventos],
  );
  const vazio = !grupos.periodo.length && !grupos.dia.length && !grupos.pontos.length;
  return (
    <Painel
      titulo="Comparecimento"
      descricao="Pelos resultados de reunião registrados (compareceu ou faltou). Taxa = realizadas ÷ (realizadas + faltas)."
      className="lg:col-span-2"
    >
      {vazio ? (
        <Vazio />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MiniTabelaComparecimento titulo="Período da call" rotulo="Período" linhas={grupos.periodo} />
          <MiniTabelaComparecimento titulo="Dia da semana" rotulo="Dia" linhas={grupos.dia} />
          <MiniTabelaComparecimento titulo="Pontos de contato cumpridos" rotulo="Pontos" linhas={grupos.pontos} />
        </div>
      )}
    </Painel>
  );
}

function PainelTempoColuna({
  leads,
  eventos,
  colunas,
  agora,
}: {
  leads: LeadCrm[];
  eventos: EventoCrm[];
  colunas: ColunaCrm[];
  agora: Date;
}) {
  const tempos = useMemo(() => tempoPorColuna(leads, eventos, colunas, agora), [leads, eventos, colunas, agora]);
  const cor = useMemo(() => new Map(colunas.map((c) => [c.id, c.hex])), [colunas]);
  const vazio = tempos.every((t) => t.media.n === 0);
  return (
    <Painel
      titulo="Tempo médio em cada coluna"
      descricao="Conta a estadia atual de quem ainda está na coluna. Entre parênteses, quantas passagens entraram na média."
    >
      {vazio ? (
        <Vazio />
      ) : (
        <ul className="divide-y">
          {tempos.map((t) => (
            <li key={t.colunaId} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2">
                <BolinhaCor hex={cor.get(t.colunaId)} />
                <span className="truncate">{t.titulo}</span>
              </span>
              <span className="numeric shrink-0 text-right">
                <span className="font-medium">{formatarDuracao(t.media.valor)}</span>{" "}
                <span className="text-xs text-muted-foreground">{t.media.n > 0 ? `(entre ${t.media.n})` : "(sem dados)"}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}

function PainelPrevisao({ leads, colunas, fechamentos }: { leads: LeadCrm[]; colunas: ColunaCrm[]; fechamentos: number }) {
  const p = useMemo(() => previsao(leads, colunas), [leads, colunas]);
  return (
    <Painel titulo="Previsão" descricao="Leads em proposta × taxa histórica de fechamento × ticket médio.">
      {leads.length === 0 ? (
        <Vazio />
      ) : p.valor === null ? (
        <div className="space-y-2 py-2 text-sm text-muted-foreground">
          <p>
            <span className="numeric font-semibold text-foreground">{plural(p.emProposta, "lead", "leads")}</span> em proposta agora.
          </p>
          <p>
            {p.taxa === null
              ? "Ainda não há propostas com desfecho (ganho, perdido ou desqualificado) no período para calcular a taxa de fechamento."
              : "Ainda não há fechamentos no período para calcular o ticket médio."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="numeric text-2xl font-semibold">≈ {formatarReais(p.valor)}</p>
          <p className="text-sm">
            {plural(p.emProposta, "lead", "leads")} em proposta × {formatarPct(p.taxa)} de fechamento × ticket{" "}
            {formatarReais(p.ticket)} ≈ {formatarReais(p.valor)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            (taxa calculada entre {plural(p.amostra, "proposta com desfecho", "propostas com desfecho")}; ticket médio entre{" "}
            {plural(fechamentos, "fechamento", "fechamentos")})
          </p>
        </div>
      )}
    </Painel>
  );
}

function PainelParados({
  leads,
  colunas,
  agora,
  abrirFicha,
}: {
  leads: LeadCrm[];
  colunas: ColunaCrm[];
  agora: Date;
  abrirFicha: (id: string) => void;
}) {
  const grupos = useMemo(() => {
    const desde = (l: LeadCrm) => new Date(l.coluna_desde ?? l.created_at).getTime();
    return parados(leads, colunas, agora).map((g) => ({
      coluna: g.coluna,
      leads: [...g.leads].sort((a, b) => desde(a) - desde(b)).map((l) => ({ lead: l, dias: Math.floor((agora.getTime() - desde(l)) / DIA_MS) })),
    }));
  }, [leads, colunas, agora]);
  return (
    <Painel
      titulo="Parados há mais de 7 dias"
      descricao="Leads fora de ganho, perdido e desqualificado sem mudar de coluna há mais de 7 dias. Clique no nome para abrir a ficha."
      className="lg:col-span-2"
    >
      {leads.length === 0 ? (
        <Vazio />
      ) : grupos.length === 0 ? (
        <Vazio texto="Nenhum lead parado há mais de 7 dias." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {grupos.map(({ coluna, leads: itens }) => (
            <div key={coluna.id} className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <BolinhaCor hex={coluna.hex} />
                <span className="truncate">{coluna.titulo}</span>
                <span className="numeric shrink-0 text-xs font-normal text-muted-foreground">({itens.length})</span>
              </p>
              <ul className="mt-1 space-y-0.5">
                {itens.map(({ lead, dias }) => (
                  <li key={lead.id}>
                    <button
                      type="button"
                      onClick={() => abrirFicha(lead.id)}
                      title={`Na coluna desde ${formatarData(lead.coluna_desde ?? lead.created_at)}`}
                      className="flex w-full items-baseline justify-between gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium underline-offset-2 hover:underline">{lead.nome}</span>
                        {lead.empresa && <span className="text-muted-foreground"> · {lead.empresa}</span>}
                      </span>
                      <span className="numeric shrink-0 text-xs text-muted-foreground">há {plural(dias, "dia", "dias")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Painel>
  );
}

// ---------- dashboard ----------

export function DashboardCrm({ leads, eventos }: { leads: LeadCrm[]; eventos: EventoCrm[] }) {
  const { colunas, abrirFicha } = useCrm();
  const agora = useAgora();

  const numeros = useMemo(() => calcularNumeros(leads, colunas), [leads, colunas]);
  const jornada = useMemo(() => calcularJornada(leads), [leads]);
  const noShow = useMemo(() => noShowRecuperacao(leads), [leads]);
  // Reuniões com desfecho = realizadas + quem faltou e nunca compareceu (a base do comparecimento)
  const baseComparecimento = numeros.reunioesRealizadas + noShow.faltaram - noShow.compareceramDepois;

  const tempo = (a: Amostra) => formatarDuracao(a.valor);
  const qtd = (a: Amostra) => umaCasa(a.valor);

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Os números seguem o período, o critério e a etiqueta escolhidos no topo.</p>

      <Secao titulo="Números">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Numero titulo="Leads" valor={String(numeros.leads)} rodape="no período" />
          <Numero titulo="Reuniões marcadas" valor={String(numeros.reunioesMarcadas)} rodape="leads com a 1ª reunião marcada" />
          <Numero titulo="Reuniões realizadas" valor={String(numeros.reunioesRealizadas)} rodape="leads que compareceram" />
          <Numero
            titulo="Comparecimento"
            valor={formatarPct(numeros.comparecimento)}
            rodape={`entre ${plural(baseComparecimento, "reunião com desfecho", "reuniões com desfecho")}`}
          />
          <Numero titulo="Propostas" valor={String(numeros.propostas)} rodape="propostas enviadas" />
          <Numero titulo="Fechamentos" valor={String(numeros.fechamentos)} rodape="leads em coluna de ganho" />
          <Numero
            titulo="Receita"
            valor={formatarReais(numeros.receita)}
            rodape={`soma de ${plural(numeros.fechamentos, "fechamento", "fechamentos")}`}
          />
          <Numero
            titulo="Ticket médio"
            valor={numeros.ticketMedio === null ? "—" : formatarReais(numeros.ticketMedio)}
            rodape={numeros.fechamentos > 0 ? `média entre ${plural(numeros.fechamentos, "fechamento", "fechamentos")}` : "sem fechamentos ainda"}
          />
          <Numero
            titulo="Conversão"
            valor={formatarPct(numeros.conversao)}
            rodape={`sem contar ${plural(numeros.desqualificados, "desqualificado", "desqualificados")}`}
          />
        </div>
      </Secao>

      <Secao titulo="Jornada do lead">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Numero titulo="Até o 1º contato" valor={tempo(jornada.ateContato)} rodape={rodapeMedia(jornada.ateContato)} />
          <Numero
            titulo="1º contato → reunião marcada"
            valor={tempo(jornada.contatoAteReuniao)}
            rodape={rodapeMedia(jornada.contatoAteReuniao)}
          />
          <Numero titulo="Follow-ups até marcar" valor={qtd(jornada.followUpsAteReuniao)} rodape={rodapeMedia(jornada.followUpsAteReuniao)} />
          <Numero titulo="Reunião → proposta" valor={tempo(jornada.realizadaAteProposta)} rodape={rodapeMedia(jornada.realizadaAteProposta)} />
          <Numero
            titulo="1º contato → fechamento"
            valor={tempo(jornada.contatoAteFechamento)}
            rodape={rodapeMedia(jornada.contatoAteFechamento)}
          />
          <Numero
            titulo="Follow-ups de proposta até fechar"
            valor={qtd(jornada.followUpsAteFechamento)}
            rodape={rodapeMedia(jornada.followUpsAteFechamento)}
          />
        </div>
      </Secao>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PainelFunil leads={leads} />
        <PainelTentativas leads={leads} colunas={colunas} />
        <PainelGrupos
          titulo="Orgânico × Pago"
          descricao="Pela etiqueta de tráfego do lead."
          rotulo="Tráfego"
          leads={leads}
          colunas={colunas}
          chave={chaveTrafego}
        />
        <PainelGrupos
          titulo="Origem (utm_source)"
          descricao="Leads sem UTM ficam em “Sem UTM”."
          rotulo="Origem"
          leads={leads}
          colunas={colunas}
          chave={chaveUtmSource}
        />
        <PainelGrupos
          titulo="Campanha (utm_campaign)"
          descricao="Leads sem UTM ficam em “Sem UTM”."
          rotulo="Campanha"
          leads={leads}
          colunas={colunas}
          chave={chaveUtmCampaign}
        />
        <PainelGrupos
          titulo="Nicho"
          descricao="Pelo nicho informado no lead."
          rotulo="Nicho"
          leads={leads}
          colunas={colunas}
          chave={chaveNicho}
        />
        <PainelGrupos
          titulo="Faixa de faturamento"
          descricao="Pela faixa de faturamento informada no lead."
          rotulo="Faixa"
          leads={leads}
          colunas={colunas}
          chave={chaveFaturamento}
        />
        <PainelMotivos titulo="Motivos de perda" tipo="perdido" leads={leads} colunas={colunas} />
        <PainelMotivos titulo="Motivos de desqualificação" tipo="desqualificado" leads={leads} colunas={colunas} />
        <PainelNoShow leads={leads} />
        <PainelDepoisReuniao leads={leads} colunas={colunas} />
        <PainelComparecimento eventos={eventos} />
        <PainelTempoColuna leads={leads} eventos={eventos} colunas={colunas} agora={agora} />
        <PainelPrevisao leads={leads} colunas={colunas} fechamentos={numeros.fechamentos} />
        <PainelParados leads={leads} colunas={colunas} agora={agora} abrirFicha={abrirFicha} />
      </div>
    </div>
  );
}
