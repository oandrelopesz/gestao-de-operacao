// Fonte do Financeiro com recebimento POR CLIENTE: o valor esperado do mês vem dos clientes da agência.
// Total do mês M = valor fixo (só no modelo fixo + variável) + soma, entre os clientes que contam em M, do valor
// personalizado do cliente ou, sem ele, do valor padrão por cliente. Puro (sem Supabase/React): roda no navegador e no
// node --test. Meses "YYYY-MM"; datas "YYYY-MM-DD".

export type TipoRecebimento = "fixo" | "por_cliente";
export type ModeloPorCliente = "fixo_variavel" | "so_variavel";

export interface ConfigPorCliente {
  modelo: ModeloPorCliente;
  valor_fixo: number;
  valor_por_cliente: number;
}

/** Os campos de `clientes` que decidem se o cliente conta. */
export interface ClienteDaAgencia {
  id: string;
  nome: string;
  arquivado: boolean | null;
  status_operacional: string | null;
  churn_efeito_imediato: boolean | null;
  contrato_ate: string | null;
}

/** Valores personalizados por cliente; ausente ou null = valor padrão. */
export type ValoresPersonalizados = Record<string, number | null | undefined>;

export interface LinhaCliente {
  cliente: ClienteDaAgencia;
  valor: number;
  personalizado: boolean;
  /** Em churn, mas com o contrato ainda valendo no mês (some dos meses seguintes). */
  emChurn: boolean;
  contrato_ate: string | null;
}

export interface ResumoPorCliente {
  quantidade: number;
  fixo: number;
  variavel: number;
  total: number;
  clientes: LinhaCliente[];
}

const arred = (v: number) => Math.round(v * 100) / 100;

/** Churn efeito imediato ou sem data de contrato sai na hora; com contrato, conta até o mês da data. */
export function clienteContaNoMes(c: ClienteDaAgencia, mes: string): boolean {
  if (c.arquivado) return false;
  if (c.status_operacional !== "churn") return true;
  return !c.churn_efeito_imediato && !!c.contrato_ate && c.contrato_ate >= `${mes}-01`;
}

export function calcularPorCliente(
  config: ConfigPorCliente,
  clientes: ClienteDaAgencia[],
  personalizados: ValoresPersonalizados,
  mes: string,
): ResumoPorCliente {
  const padrao = Number(config.valor_por_cliente) || 0;
  const linhas = clientes
    .filter((c) => clienteContaNoMes(c, mes))
    .map((cliente): LinhaCliente => {
      const p = personalizados[cliente.id];
      const personalizado = p != null;
      return {
        cliente,
        valor: personalizado ? Number(p) : padrao,
        personalizado,
        emChurn: cliente.status_operacional === "churn",
        contrato_ate: cliente.contrato_ate,
      };
    });
  const fixo = config.modelo === "fixo_variavel" ? Number(config.valor_fixo) || 0 : 0;
  const variavel = arred(linhas.reduce((t, l) => t + l.valor, 0));
  return { quantidade: linhas.length, fixo, variavel, total: arred(fixo + variavel), clientes: linhas };
}
