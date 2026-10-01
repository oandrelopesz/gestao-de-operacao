import { formatBRL } from "@/lib/clientes";
import { cn } from "@/lib/utils";
import { INFO_SITUACAO, type SituacaoMes, type calendarioDaFonte } from "@/lib/financeiroCobranca";

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** No calendário o que está vencido e em aberto se chama "Devido" (no resto da tela, "Atrasado"). */
function rotuloDoMes(situacao: SituacaoMes): string {
  return situacao === "atrasado" ? "Devido" : INFO_SITUACAO[situacao].label;
}

/** "2026-09" → "set 2026" */
function mesCurto(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${MES_CURTO[Number(m) - 1]} ${ano}`;
}

interface Props {
  meses: ReturnType<typeof calendarioDaFonte>;
  /** Mês escolhido ("YYYY-MM"); null = nenhum. */
  selecionado: string | null;
  onSelecionar: (mes: string) => void;
}

/** Os últimos meses de um cliente em grade: cada mês com a situação (texto + cor) e o valor em aberto ou recebido. */
export function CalendarioCobranca({ meses, selecionado, onSelecionar }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {meses.map((m) => {
        const fora = m.situacao === "fora";
        const escolhido = m.mes === selecionado;
        const valor =
          m.emAberto > 0 ? { quantia: m.emAberto, sufixo: "em aberto" }
          : m.recebido > 0 ? { quantia: m.recebido, sufixo: "recebido" }
          : m.isento > 0 ? { quantia: m.isento, sufixo: "abonado" }
          : null;
        return (
          <button
            key={m.mes}
            type="button"
            title={m.nome}
            aria-pressed={escolhido}
            disabled={fora}
            onClick={() => onSelecionar(m.mes)}
            className={cn(
              "flex min-w-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-shadow",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "enabled:hover:shadow-sm disabled:cursor-not-allowed",
              INFO_SITUACAO[m.situacao].classe,
              escolhido && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
            )}
          >
            <span className="text-sm font-semibold capitalize">{mesCurto(m.mes)}</span>
            <span className="text-xs font-medium">{rotuloDoMes(m.situacao)}</span>
            {valor && (
              <span className="text-xs">
                {/* O valor nunca quebra no meio; se faltar espaço, só o "em aberto" desce para a linha de baixo */}
                <span className="whitespace-nowrap">{formatBRL(valor.quantia)}</span> {valor.sufixo}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
