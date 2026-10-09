// Dados das fontes do Financeiro com recebimento por cliente: busca os clientes da agência e os valores personalizados e
// põe em cada fonte `por_cliente` e o `valor_mensal` do mês atual (assim a aba, os cartões e o sino somam o valor certo
// sem saber da diferença). A conta em si está em financeiroPorCliente.ts.
import { supabase } from "@/integrations/supabase/client";
import {
  calcularPorCliente,
  type ClienteDaAgencia,
  type ConfigPorCliente,
  type ModeloPorCliente,
  type ValoresPersonalizados,
} from "@/lib/financeiroPorCliente";

export interface DadosPorCliente {
  config: ConfigPorCliente;
  clientes: ClienteDaAgencia[];
  personalizados: ValoresPersonalizados;
}

/** Fonte que pode ser por cliente: os campos que a conta lê (a linha da financeiro_view). */
export interface FonteComPorCliente {
  fonte_id: string;
  agencia_id: string | null;
  valor_mensal: number;
  tipo_recebimento?: string | null;
  modelo_por_cliente?: string | null;
  valor_fixo?: number | null;
  valor_por_cliente?: number | null;
  por_cliente?: DadosPorCliente | null;
}

export const ehPorCliente = (f: { tipo_recebimento?: string | null }) => f.tipo_recebimento === "por_cliente";

/** Valor esperado do mês ("YYYY-MM") de uma fonte já enriquecida. */
export function valorDoMesPorCliente(d: DadosPorCliente, mes: string): number {
  return calcularPorCliente(d.config, d.clientes, d.personalizados, mes).total;
}

/**
 * Fontes por cliente ganham `por_cliente` e `valor_mensal` = o valor de `mesAtual`; as fixas passam como vieram.
 * Uma consulta de clientes e uma de valores personalizados para todas.
 */
export async function enriquecerPorCliente<T extends FonteComPorCliente>(fontes: T[], mesAtual: string): Promise<T[]> {
  const alvo = fontes.filter(ehPorCliente);
  if (!alvo.length) return fontes;
  const [cli, pers] = await Promise.all([
    // as any: as colunas do churn ainda não estão nos tipos gerados
    (supabase.from("clientes") as any)
      .select("id, nome, agencia, arquivado, status_operacional, churn_efeito_imediato, contrato_ate")
      .eq("arquivado", false)
      .order("nome"),
    (supabase.from("financeiro_fonte_clientes" as any) as any).select("fonte_id, cliente_id, valor").in("fonte_id", alvo.map((f) => f.fonte_id)),
  ]);
  if (cli.error) throw cli.error;
  if (pers.error) throw pers.error;
  const clientes = (cli.data || []) as (ClienteDaAgencia & { agencia: string | null })[];
  return fontes.map((f) => {
    if (!ehPorCliente(f)) return f;
    const config: ConfigPorCliente = {
      modelo: (f.modelo_por_cliente as ModeloPorCliente) === "so_variavel" ? "so_variavel" : "fixo_variavel",
      valor_fixo: Number(f.valor_fixo) || 0,
      valor_por_cliente: Number(f.valor_por_cliente) || 0,
    };
    const personalizados: ValoresPersonalizados = {};
    for (const p of (pers.data || []) as { fonte_id: string; cliente_id: string; valor: number | null }[]) {
      if (p.fonte_id === f.fonte_id && p.valor != null) personalizados[p.cliente_id] = Number(p.valor);
    }
    const daAgencia = f.agencia_id ? clientes.filter((c) => c.agencia === f.agencia_id) : [];
    const por_cliente: DadosPorCliente = { config, clientes: daAgencia, personalizados };
    return { ...f, por_cliente, valor_mensal: valorDoMesPorCliente(por_cliente, mesAtual) };
  });
}

/** Grava (ou, com `valor` null, apaga) o valor personalizado de um cliente numa fonte. */
export async function salvarValorDoCliente(fonteId: string, clienteId: string, valor: number | null): Promise<void> {
  const tabela = supabase.from("financeiro_fonte_clientes" as any) as any;
  const { error } =
    valor == null
      ? await tabela.delete().eq("fonte_id", fonteId).eq("cliente_id", clienteId)
      : await tabela.upsert({ fonte_id: fonteId, cliente_id: clienteId, valor, updated_at: new Date().toISOString() }, { onConflict: "fonte_id,cliente_id" });
  if (error) throw error;
}
