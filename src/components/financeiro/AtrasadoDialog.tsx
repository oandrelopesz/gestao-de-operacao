import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/clientes";
import { nomeDoMes } from "@/lib/financeiro";
import type { Cobranca } from "@/lib/financeiroCobranca";
import { CobrancaLinha } from "@/components/financeiro/CobrancaLinha";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** Nome da fonte (cliente). */
  nome: string;
  /** O que está devendo, do mês mais antigo ao mais novo, e o total (resultado de `atrasadoDe`). */
  atrasado: { itens: Cobranca[]; total: number };
  onValorCheio: (cobranca: Cobranca) => void;
  onConfigurar: (cobranca: Cobranca) => void;
  onIsentar: (cobranca: Cobranca) => void;
  onDesfazer: (cobranca: Cobranca) => void;
  /** Uma gravação em andamento: trava os botões das linhas. */
  ocupado: boolean;
}

/** Lista do atrasado acumulado de um cliente: as parcelas vencidas e não quitadas, agrupadas por mês, com as ações. */
export function AtrasadoDialog({ aberto, onFechar, nome, atrasado, onValorCheio, onConfigurar, onIsentar, onDesfazer, ocupado }: Props) {
  // Uma seção por mês, na ordem em que os meses aparecem (do mais antigo)
  const meses: { mes: string; itens: Cobranca[] }[] = [];
  for (const c of atrasado.itens) {
    const grupo = meses.find((m) => m.mes === c.mes);
    if (grupo) grupo.itens.push(c);
    else meses.push({ mes: c.mes, itens: [c] });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-h-[90vh] sm:max-w-[560px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{`Atrasado de ${nome}`}</DialogTitle>
          <DialogDescription>Parcelas vencidas que ainda não foram quitadas nem isentadas.</DialogDescription>
        </DialogHeader>

        {meses.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nada atrasado.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <span className="text-sm font-medium">Total atrasado</span>
              <span className="text-lg font-bold">{formatBRL(atrasado.total)}</span>
            </div>
            <div className="space-y-3">
              {meses.map((m) => (
                <section key={m.mes} aria-label={nomeDoMes(`${m.mes}-01`)} className="space-y-1.5">
                  {m.itens.map((c) => (
                    <CobrancaLinha
                      key={`${c.mes}-${c.parcela}`}
                      cobranca={c}
                      mostrarMes
                      onValorCheio={onValorCheio}
                      onConfigurar={onConfigurar}
                      onIsentar={onIsentar}
                      onDesfazer={onDesfazer}
                      ocupado={ocupado}
                    />
                  ))}
                </section>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
