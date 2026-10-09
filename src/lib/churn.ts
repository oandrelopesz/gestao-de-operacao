// Churn do mês: quantos clientes foram marcados como churn no mês e quanto isso pesa na base.
// O mês do churn é o dia em que ele foi marcado (clientes.churn_em, gravado pelo banco), mesmo que o contrato vá até o mês seguinte.
export type ClienteChurn = {
  agencia: string;
  status_operacional: string;
  churn_em: string | null;
  arquivado?: boolean | null;
};
export type LinhaChurn = { churns: number; base: number; pct: number | null };

/**
 * `mes` é "AAAA-MM". Base = quem era cliente no mês: os que viraram churn nele mais os não arquivados que não estão em churn.
 * Churn sem data (antigo) ou de outro mês fica fora da conta e da base.
 */
export function churnDoMes(
  clientes: ClienteChurn[],
  mes: string,
): { total: LinhaChurn; porAgencia: Record<string, LinhaChurn> } {
  const linha = (): LinhaChurn => ({ churns: 0, base: 0, pct: null });
  const total = linha();
  const porAgencia: Record<string, LinhaChurn> = {};
  for (const c of clientes) {
    const churnou = c.status_operacional === "churn" && !!c.churn_em?.startsWith(mes);
    if (!churnou && (c.arquivado || c.status_operacional === "churn")) continue;
    const ag = (porAgencia[c.agencia] ??= linha());
    for (const l of [total, ag]) {
      l.base++;
      if (churnou) l.churns++;
    }
  }
  for (const l of [total, ...Object.values(porAgencia)])
    l.pct = l.base > 0 ? l.churns / l.base : null;
  return { total, porAgencia };
}
