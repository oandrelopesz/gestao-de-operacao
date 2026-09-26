// Planilha do CRM: todos os leads filtrados numa tabela ordenável, com páginas de 50 e ações em massa (spec §9.5).
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCrm } from "@/components/crm/CrmContexto";
import { SelecaoBarraCrm } from "@/components/crm/SelecaoBarraCrm";
import { formatarData, formatarDataHora, formatarReais } from "@/lib/crmFormato";
import { formatarTelefone } from "@/lib/crmWhatsapp";
import type { ColunaCrm, LeadCrm } from "@/lib/crmTipos";
import { cn } from "@/lib/utils";

const POR_PAGINA = 50;

/** "Agora" que anda sozinho a cada minuto (marca de próximo contato vencido). */
function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return agora;
}

type Campo =
  | "nome" | "empresa" | "telefone" | "email" | "trafego" | "coluna" | "tentativas" | "proximo" | "reuniao"
  | "proposta" | "fechado" | "origem" | "campanha" | "entrada";
type Direcao = "asc" | "desc";
type ValorOrdem = string | number | null;

const tempo = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
const texto = (v: string | null) => (v && v.trim() ? v.trim() : null);

/** Valor usado para ordenar cada coluna (null = vazio, sempre por último). */
function valorDe(l: LeadCrm, campo: Campo, coluna: ColunaCrm | undefined): ValorOrdem {
  switch (campo) {
    case "nome": return texto(l.nome);
    case "empresa": return texto(l.empresa);
    case "telefone": return texto(l.telefone);
    case "email": return texto(l.email);
    case "trafego": return l.trafego === "pago" ? "Pago" : "Orgânico";
    case "coluna": return coluna ? coluna.ordem : null;
    case "tentativas": return (l.follow_up ?? 0) + (l.follow_up_proposta ?? 0);
    case "proximo": return tempo(l.proximo_contato_em);
    case "reuniao": return tempo(l.reuniao_em);
    case "proposta": return l.valor_proposta ?? null;
    case "fechado": return l.valor_fechamento ?? null;
    case "origem": return texto(l.utm_source);
    case "campanha": return texto(l.utm_campaign);
    case "entrada": return tempo(l.created_at);
  }
}

function comparar(a: ValorOrdem, b: ValorOrdem, direcao: Direcao): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const r = typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base", numeric: true });
  return direcao === "asc" ? r : -r;
}

const CABECALHOS: { campo: Campo; rotulo: string; titulo?: string; direita?: boolean }[] = [
  { campo: "nome", rotulo: "Nome" },
  { campo: "empresa", rotulo: "Empresa" },
  { campo: "telefone", rotulo: "Telefone" },
  { campo: "email", rotulo: "E-mail" },
  { campo: "trafego", rotulo: "Etiqueta" },
  { campo: "coluna", rotulo: "Coluna" },
  { campo: "tentativas", rotulo: "Tentativas", titulo: "Follow-up / follow-up da proposta" },
  { campo: "proximo", rotulo: "Próximo contato" },
  { campo: "reuniao", rotulo: "Reunião" },
  { campo: "proposta", rotulo: "Valor proposta", direita: true },
  { campo: "fechado", rotulo: "Valor fechado", direita: true },
  { campo: "origem", rotulo: "Origem" },
  { campo: "campanha", rotulo: "Campanha" },
  { campo: "entrada", rotulo: "Entrada" },
];

const vazio = <span className="text-muted-foreground">—</span>;

/** Texto longo cortado com reticências (o completo fica no title). */
function Corte({ largura, children }: { largura: string; children: string }) {
  return <span className={cn("block truncate", largura)} title={children}>{children}</span>;
}

export function PlanilhaCrm({ leads }: { leads: LeadCrm[] }) {
  const { colunaDoLead, abrirFicha } = useCrm();
  const agora = useAgora();
  const [ordem, setOrdem] = useState<{ campo: Campo; direcao: Direcao }>({ campo: "entrada", direcao: "desc" });
  const [pagina, setPagina] = useState(1);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());

  const ordenados = useMemo(() => {
    const comValor = leads.map((l) => ({ l, v: valorDe(l, ordem.campo, colunaDoLead(l)) }));
    comValor.sort((a, b) => comparar(a.v, b.v, ordem.direcao));
    return comValor.map((x) => x.l);
  }, [leads, ordem, colunaDoLead]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const daPagina = ordenados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  // Só age sobre o que está na lista filtrada (um filtro novo não deixa seleção escondida).
  const visiveis = useMemo(() => new Set(leads.map((l) => l.id)), [leads]);
  const selecionadosVisiveis = useMemo(() => [...selecionados].filter((id) => visiveis.has(id)), [selecionados, visiveis]);
  const paginaToda = daPagina.length > 0 && daPagina.every((l) => selecionados.has(l.id));

  const ordenarPor = (campo: Campo) => {
    setOrdem((o) => (o.campo === campo ? { campo, direcao: o.direcao === "asc" ? "desc" : "asc" } : { campo, direcao: "asc" }));
    setPagina(1);
  };

  const marcar = (id: string, marcado: boolean) =>
    setSelecionados((prev) => {
      const s = new Set(prev);
      if (marcado) s.add(id);
      else s.delete(id);
      return s;
    });

  const marcarPagina = (marcado: boolean) =>
    setSelecionados((prev) => {
      const s = new Set(prev);
      for (const l of daPagina) {
        if (marcado) s.add(l.id);
        else s.delete(l.id);
      }
      return s;
    });

  return (
    <div className={cn("min-w-0 space-y-3", selecionadosVisiveis.length > 0 && "pb-20")}>
      <div className="max-h-[max(20rem,calc(100dvh-16rem))] w-full overflow-auto rounded-md border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky top-0 z-10 w-10 bg-card shadow-[inset_0_-1px_0_var(--color-border)]">
                <Checkbox
                  checked={paginaToda}
                  onCheckedChange={(v) => marcarPagina(v === true)}
                  disabled={daPagina.length === 0}
                  aria-label="Selecionar todos desta página"
                />
              </TableHead>
              {CABECALHOS.map((c) => {
                const ativo = ordem.campo === c.campo;
                const Seta = !ativo ? ArrowUpDown : ordem.direcao === "asc" ? ArrowUp : ArrowDown;
                return (
                  <TableHead
                    key={c.campo}
                    aria-sort={ativo ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(
                      "sticky top-0 z-10 whitespace-nowrap bg-card shadow-[inset_0_-1px_0_var(--color-border)]",
                      c.direita && "text-right",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => ordenarPor(c.campo)}
                      title={c.titulo ? `${c.titulo} — clique para ordenar` : "Clique para ordenar"}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        ativo && "text-foreground",
                      )}
                    >
                      {c.rotulo}
                      <Seta size={12} className={cn("shrink-0", !ativo && "opacity-40")} aria-hidden />
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {daPagina.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={CABECALHOS.length + 1} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum lead neste filtro.
                </TableCell>
              </TableRow>
            ) : (
              daPagina.map((l) => {
                const coluna = colunaDoLead(l);
                const marcado = selecionados.has(l.id);
                const vencido = !!l.proximo_contato_em && new Date(l.proximo_contato_em).getTime() <= agora.getTime();
                return (
                  <TableRow key={l.id} data-state={marcado ? "selected" : undefined} className="whitespace-nowrap">
                    <TableCell className="w-10">
                      <Checkbox checked={marcado} onCheckedChange={(v) => marcar(l.id, v === true)} aria-label={`Selecionar ${l.nome}`} />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => abrirFicha(l.id)}
                        className="block max-w-[16rem] truncate text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                        title={l.nome}
                      >
                        {l.nome}
                      </button>
                    </TableCell>
                    <TableCell>{l.empresa ? <Corte largura="max-w-[14rem]">{l.empresa}</Corte> : vazio}</TableCell>
                    <TableCell>{l.telefone ? formatarTelefone(l.telefone) : vazio}</TableCell>
                    <TableCell>{l.email ? <Corte largura="max-w-[16rem]">{l.email}</Corte> : vazio}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 px-1.5 text-[10px] font-medium",
                          l.trafego === "pago" && "border-violet-500/40 text-violet-700 dark:text-violet-300",
                        )}
                      >
                        {l.trafego === "pago" ? "Pago" : "Orgânico"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {coluna ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: coluna.hex }} aria-hidden />
                          {coluna.titulo}
                        </span>
                      ) : vazio}
                    </TableCell>
                    <TableCell
                      className="tabular-nums"
                      title={`Follow-up: ${l.follow_up ?? 0} · Follow-up da proposta: ${l.follow_up_proposta ?? 0}`}
                    >
                      {l.follow_up ?? 0}
                      <span className="text-muted-foreground"> / {l.follow_up_proposta ?? 0}</span>
                    </TableCell>
                    <TableCell>
                      {l.proximo_contato_em ? (
                        <span className={cn(vencido && "text-amber-600 dark:text-amber-400")}>
                          {formatarDataHora(l.proximo_contato_em)}
                          {vencido && " (vencido)"}
                        </span>
                      ) : vazio}
                    </TableCell>
                    <TableCell>{l.reuniao_em ? formatarDataHora(l.reuniao_em) : vazio}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.valor_proposta != null ? formatarReais(l.valor_proposta) : vazio}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.valor_fechamento != null ? formatarReais(l.valor_fechamento) : vazio}</TableCell>
                    <TableCell>{l.utm_source ? <Corte largura="max-w-[12rem]">{l.utm_source}</Corte> : vazio}</TableCell>
                    <TableCell>{l.utm_campaign ? <Corte largura="max-w-[14rem]">{l.utm_campaign}</Corte> : vazio}</TableCell>
                    <TableCell className="tabular-nums">{formatarData(l.created_at)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {ordenados.length} {ordenados.length === 1 ? "lead" : "leads"}
          {selecionadosVisiveis.length > 0 && ` · ${selecionadosVisiveis.length} ${selecionadosVisiveis.length === 1 ? "selecionado" : "selecionados"}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            disabled={paginaAtual <= 1}
            onClick={() => setPagina(paginaAtual - 1)}
          >
            <ChevronLeft size={14} aria-hidden /> Anterior
          </Button>
          <span className="whitespace-nowrap text-muted-foreground tabular-nums">
            Página {paginaAtual} de {totalPaginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            disabled={paginaAtual >= totalPaginas}
            onClick={() => setPagina(paginaAtual + 1)}
          >
            Próxima <ChevronRight size={14} aria-hidden />
          </Button>
        </div>
      </div>

      {selecionadosVisiveis.length > 0 && (
        <SelecaoBarraCrm selecionados={selecionadosVisiveis} onLimpar={() => setSelecionados(new Set())} />
      )}
    </div>
  );
}
