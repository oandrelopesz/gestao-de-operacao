// Pontos de contato da reunião (spec §6): versão compacta (card e Fila do dia) e lista completa (ficha).
import { useMemo, useState, useSyncExternalStore, type SyntheticEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/components/crm/CrmContexto";
import {
  calcularPontos,
  periodoDaCall,
  resumoPontos,
  ROTULO_PERIODO,
  type EstadoPonto,
  type PontoCalculado,
} from "@/lib/crmPontos";
import { formatarDataHora, formatarDiaCurtoHora } from "@/lib/crmFormato";
import type { LeadCrm } from "@/lib/crmTipos";
import { cn } from "@/lib/utils";

const parar = (e: SyntheticEvent) => e.stopPropagation();

// Relógio de minuto compartilhado: um único intervalo para todos os cards/linhas que dependem da hora.
let agoraMs = Date.now();
const ouvintes = new Set<() => void>();
let relogio: ReturnType<typeof setInterval> | null = null;

function assinarRelogio(aviso: () => void) {
  ouvintes.add(aviso);
  if (!relogio) {
    agoraMs = Date.now();
    relogio = setInterval(() => {
      agoraMs = Date.now();
      ouvintes.forEach((f) => f());
    }, 60_000);
  }
  return () => {
    ouvintes.delete(aviso);
    if (!ouvintes.size && relogio) {
      clearInterval(relogio);
      relogio = null;
    }
  };
}

/** "Agora" que muda a cada minuto (urgências e pontos de contato dependem da hora). */
export function useAgoraMinuto(): Date {
  const ms = useSyncExternalStore(
    assinarRelogio,
    () => agoraMs,
    () => agoraMs,
  );
  return useMemo(() => new Date(ms), [ms]);
}

const ESTADO: Record<EstadoPonto, { rotulo: (p: PontoCalculado) => string; cor: string }> = {
  feito: {
    rotulo: (p) => (p.feitoEm ? `feito em ${formatarDataHora(p.feitoEm)}` : "feito"),
    cor: "text-emerald-600 dark:text-emerald-400",
  },
  nao_se_aplica: { rotulo: () => "não se aplica", cor: "text-muted-foreground" },
  atrasado: { rotulo: () => "atrasado", cor: "text-amber-600 dark:text-amber-400 font-medium" },
  pendente: { rotulo: () => "pendente", cor: "text-muted-foreground" },
};

export function PontosContato({ lead, compacto = false }: { lead: LeadCrm; compacto?: boolean }) {
  const { marcarPonto } = useCrm();
  const agora = useAgoraMinuto();
  const pontos = useMemo(() => calcularPontos(lead, agora), [lead, agora]);
  const [salvando, setSalvando] = useState<number | null>(null);

  if (!pontos.length) return null;
  const resumo = resumoPontos(pontos);

  const marcar = async (n: number, feito: boolean) => {
    if (salvando !== null) return;
    setSalvando(n);
    try {
      await marcarPonto(lead, n, feito);
    } finally {
      setSalvando(null);
    }
  };

  if (compacto) {
    // O ponto que pede ação agora: o atrasado mais recente ou, sem atraso, o próximo
    const alvo = resumo.atrasado ?? resumo.proximo;
    return (
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-tight">
        <p className="min-w-0 flex-1">
          <span className="font-medium tabular-nums">
            Pontos {resumo.feitos}/{resumo.aplicaveis}
          </span>
          <span className="text-muted-foreground"> · </span>
          {resumo.atrasado ? (
            <span className="text-amber-600 dark:text-amber-400">
              Atrasado: {resumo.atrasado.nome}, {formatarDataHora(resumo.atrasado.quando)}
            </span>
          ) : resumo.proximo ? (
            <span className="text-muted-foreground">
              Próximo: {resumo.proximo.nome} — {formatarDiaCurtoHora(resumo.proximo.quando)}
            </span>
          ) : resumo.aplicaveis === 0 ? (
            <span className="text-muted-foreground">Nenhum ponto se aplica</span>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400">Todos feitos</span>
          )}
        </p>
        {alvo && (
          <span onPointerDown={parar} onClick={parar} className="shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[11px]"
              disabled={salvando !== null}
              onClick={() => void marcar(alvo.n, true)}
              aria-label={`Marcar "${alvo.nome}" como feito`}
              title={`Marcar "${alvo.nome}" como feito`}
            >
              {salvando === alvo.n ? <Loader2 className="animate-spin" /> : <Check />}
              Feito
            </Button>
          </span>
        )}
      </div>
    );
  }

  const periodo = periodoDaCall(new Date(lead.reuniao_em!));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <p className="text-sm font-medium">
          Pontos de contato{" "}
          <span className="tabular-nums text-muted-foreground">
            {resumo.feitos}/{resumo.aplicaveis}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Call: {ROTULO_PERIODO[periodo].toLowerCase()}
        </p>
      </div>
      <ul className="space-y-1.5">
        {pontos.map((p) => {
          const estado = ESTADO[p.estado];
          const id = `ponto-${lead.id}-${p.n}`;
          return (
            <li
              key={p.n}
              className={cn(
                "flex items-start gap-2.5 rounded-md border px-2.5 py-2",
                p.estado === "atrasado" ? "border-amber-500/50 bg-amber-500/5" : "border-border/60",
              )}
            >
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={p.estado === "feito"}
                disabled={p.estado === "nao_se_aplica" || salvando !== null}
                onPointerDown={parar}
                onClick={parar}
                onCheckedChange={(v) => void marcar(p.n, v === true)}
              />
              <label
                htmlFor={id}
                className="min-w-0 flex-1 cursor-pointer text-sm leading-tight"
                onClick={parar}
              >
                <span
                  className={cn(
                    "block",
                    p.estado === "nao_se_aplica" && "text-muted-foreground line-through",
                  )}
                >
                  {p.n}. {p.nome}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatarDiaCurtoHora(p.quando)}
                </span>
                <span className="text-xs text-muted-foreground"> · </span>
                <span className={cn("text-xs", estado.cor)}>{estado.rotulo(p)}</span>
              </label>
              {salvando === p.n && (
                <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-muted-foreground" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
