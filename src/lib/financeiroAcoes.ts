// Gravações da cobrança do Financeiro (uma linha por fonte + mês + parcela em financeiro_recebimentos).
import { supabase } from "@/integrations/supabase/client";
import type { Cobranca, RegistroRecebimento } from "@/lib/financeiroCobranca";

const USUARIO_PADRAO = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";
const tabela = () => supabase.from("financeiro_recebimentos" as any) as any;

async function usuario(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? USUARIO_PADRAO;
}

async function gravar(fonteId: string, c: Cobranca, campos: Record<string, unknown>) {
  const { error } = await tabela().upsert(
    { user_id: await usuario(), fonte_id: fonteId, mes_referencia: `${c.mes}-01`, parcela: c.parcela, ...campos },
    { onConflict: "fonte_id,mes_referencia,parcela" },
  );
  if (error) throw error;
}

/** Quita a parcela daquele mês com o valor cheio. */
export async function confirmarValorCheio(fonteId: string, c: Cobranca) {
  await gravar(fonteId, c, { recebido: true, isento: false, valor_recebido: c.valor, valor_devido: c.valor, data_confirmacao: new Date().toISOString() });
}

/** Valor recebido NO TOTAL daquela parcela (menor que o devido deixa o resto em aberto). `dataIso` = "YYYY-MM-DD". */
export async function confirmarValorRecebido(fonteId: string, c: Cobranca, valorTotal: number, dataIso: string) {
  if (!(valorTotal > 0)) throw new Error("Informe um valor maior que zero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) throw new Error("Informe a data do recebimento.");
  await gravar(fonteId, c, {
    recebido: true, isento: false, valor_recebido: Math.round(valorTotal * 100) / 100, valor_devido: c.valor,
    data_confirmacao: new Date(`${dataIso}T12:00:00-03:00`).toISOString(),
  });
}

/** Abona a parcela daquele mês (o que já foi pago continua contando). */
export async function isentarCobranca(fonteId: string, c: Cobranca, motivo: string | null) {
  await gravar(fonteId, c, { isento: true, valor_devido: c.valor, observacoes: motivo?.trim() || null });
}

/** Isenta as parcelas do mês que ainda não estão quitadas nem isentas. */
export async function isentarMes(fonteId: string, doMes: Cobranca[], motivo: string | null) {
  for (const c of doMes) if (c.situacao !== "recebido" && c.situacao !== "isento") await isentarCobranca(fonteId, c, motivo);
}

/** Volta a parcela daquele mês a "não acertada" (apaga o registro). */
export async function desfazerCobranca(c: Cobranca) {
  if (!c.registro) return;
  const { error } = await tabela().delete().eq("id", c.registro.id);
  if (error) throw error;
}

/** Registros a partir de um mês ("YYYY-MM-DD"), de todas as fontes. */
export async function buscarRegistrosDesde(desde: string): Promise<RegistroRecebimento[]> {
  const { data, error } = await tabela()
    .select("id, fonte_id, mes_referencia, parcela, recebido, isento, valor_recebido, valor_devido, data_confirmacao, observacoes")
    .gte("mes_referencia", desde)
    .order("mes_referencia");
  if (error) throw error;
  return (data ?? []) as RegistroRecebimento[];
}
