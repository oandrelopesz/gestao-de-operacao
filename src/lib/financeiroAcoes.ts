// Gravações da cobrança do Financeiro (uma linha por fonte + mês + parcela em financeiro_recebimentos).
import { supabase } from "@/integrations/supabase/client";
import type { Cobranca, RegistroRecebimento } from "@/lib/financeiroCobranca";

const USUARIO_PADRAO = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";
const tabela = () => supabase.from("financeiro_recebimentos" as any) as any;

/** Erro da nossa validação: a mensagem é para o usuário (a tela mostra no aviso no lugar do erro genérico). */
export class ErroValidacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroValidacao";
  }
}

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

/** Quita a parcela daquele mês com o valor cheio (zera a isenção e o motivo antigo). */
export async function confirmarValorCheio(fonteId: string, c: Cobranca) {
  await gravar(fonteId, c, {
    recebido: true, isento: false, valor_recebido: c.valor, valor_devido: c.valor, observacoes: null,
    data_confirmacao: new Date().toISOString(),
  });
}

/** "YYYY-MM-DD" de um dia que existe no calendário (recusa 2026-02-31, 2026-13-01 e texto livre). */
function diaExiste(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = iso.split("-").map(Number);
  const volta = new Date(Date.UTC(a, m - 1, d));
  return !Number.isNaN(volta.getTime()) && volta.toISOString().slice(0, 10) === iso;
}

/**
 * Valor recebido NO TOTAL daquela parcela (menor que o devido deixa o resto em aberto; zera a isenção e o motivo antigo).
 * `dataIso` = "YYYY-MM-DD".
 */
export async function confirmarValorRecebido(fonteId: string, c: Cobranca, valorTotal: number, dataIso: string) {
  if (!(valorTotal > 0)) throw new ErroValidacao("Informe o valor recebido (maior que zero).");
  if (!diaExiste(dataIso)) throw new ErroValidacao("Informe a data do recebimento.");
  await gravar(fonteId, c, {
    recebido: true, isento: false, valor_recebido: Math.round(valorTotal * 100) / 100, valor_devido: c.valor, observacoes: null,
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

/**
 * Desfaz o acerto da parcela daquele mês. Isenta que já tinha pagamento só perde a isenção (e o motivo): o pagamento fica e a
 * parcela volta a parcial (isenta e paga por inteiro já conta como recebida, então cai no outro caso). Qualquer outro caso apaga
 * o registro (volta a "não acertada").
 */
export async function desfazerCobranca(c: Cobranca) {
  if (!c.registro) return;
  const { error } = c.situacao === "isento" && c.pago > 0
    ? await tabela().update({ isento: false, observacoes: null }).eq("id", c.registro.id)
    : await tabela().delete().eq("id", c.registro.id);
  if (error) throw error;
}

const PAGINA = 1000;

/** Registros a partir de um mês ("YYYY-MM-DD"), de todas as fontes. Pagina de 1000 em 1000 (limite do Supabase) até vir uma página curta. */
export async function buscarRegistrosDesde(desde: string): Promise<RegistroRecebimento[]> {
  const todos: RegistroRecebimento[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await tabela()
      .select("id, fonte_id, mes_referencia, parcela, recebido, isento, valor_recebido, valor_devido, data_confirmacao, observacoes")
      .gte("mes_referencia", desde)
      .order("mes_referencia")
      .order("id") // desempate: sem ele as páginas podem repetir ou pular linhas do mesmo mês
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []) as RegistroRecebimento[];
    todos.push(...pagina);
    if (pagina.length < PAGINA) return todos;
  }
}
