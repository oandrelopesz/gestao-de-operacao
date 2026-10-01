// Cobrança mês a mês de cada fonte do Financeiro: de "cobrar a partir de" até o mês atual, cada parcela de cada mês com
// o que foi pago, o que falta, o que foi abonado (isento) e se já venceu. Puro (sem Supabase/React): roda no navegador e no
// node --test. Datas "YYYY-MM-DD" e meses "YYYY-MM" de Brasília.
import { nomeDoMes, parcelasDaFonte, statusDaParcela, vencimentoNoMes, type FonteDoMes } from "./financeiro.ts";

export type FormaPagamento = "pix" | "cartao" | "boleto";
export const FORMAS_DE_PAGAMENTO: Record<FormaPagamento, string> = { pix: "PIX", cartao: "Cartão", boleto: "Boleto" };

export function formaDePagamento(v: unknown): FormaPagamento | null {
  return v === "pix" || v === "cartao" || v === "boleto" ? v : null;
}

/** Linha de `financeiro_recebimentos` (os campos que a cobrança usa). */
export interface RegistroRecebimento {
  id: string;
  fonte_id: string;
  mes_referencia: string;
  parcela: number | null;
  recebido: boolean | null;
  isento: boolean | null;
  valor_recebido: number | null;
  valor_devido: number | null;
  data_confirmacao: string | null;
  observacoes: string | null;
}

export interface FonteCobravel extends FonteDoMes {
  forma_pagamento?: string | null;
  cobranca_desde?: string | null;
  parcelas?: { dia: number; valor: number; forma?: string | null }[] | null;
}

export type SituacaoCobranca = "recebido" | "parcial" | "isento" | "atrasado" | "pendente" | "a_vencer";
export type SituacaoMes = SituacaoCobranca | "fora";

export interface Cobranca {
  mes: string;
  parcela: number;
  total: number;
  dia: number;
  vencimento: string;
  valor: number;
  pago: number;
  falta: number;
  abonado: number;
  forma: FormaPagamento | null;
  situacao: SituacaoCobranca;
  vencida: boolean;
  registro: RegistroRecebimento | null;
}

export const COBRANCA_DESDE_PADRAO = "2026-09-01";
const CENTAVO = 0.005;
const arred = (v: number) => Math.round(v * 100) / 100;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Anos aceitos em "cobrar a partir de" (um ano digitado pela metade, como 0026, não pode virar mês fantasma). */
export const ANO_COBRANCA_MIN = 2020;
export const ANO_COBRANCA_MAX = 2100;
/** "YYYY-MM" válido (mês 01..12) com ano entre ANO_COBRANCA_MIN e ANO_COBRANCA_MAX. */
function mesDeCobrancaValido(mes: string): boolean {
  const ano = Number(mes.slice(0, 4));
  return MES.test(mes) && ano >= ANO_COBRANCA_MIN && ano <= ANO_COBRANCA_MAX;
}

function proximoMes(mes: string): string {
  let [y, m] = mes.split("-").map(Number);
  m++;
  if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** "YYYY-MM" de cada mês de `desde` até o mês de `hoje` (inclusive). Data inválida ou de ano fora de 2020-2100 vale como setembro de 2026. */
export function mesesCobrados(desde: string | null | undefined, hoje: string): string[] {
  const pedido = String(desde ?? "").slice(0, 7);
  const inicio = mesDeCobrancaValido(pedido) ? pedido : COBRANCA_DESDE_PADRAO.slice(0, 7);
  const fim = hoje.slice(0, 7);
  const out: string[] = [];
  for (let mes = inicio; mes <= fim && out.length < 600; mes = proximoMes(mes)) out.push(mes);
  return out;
}

/** Os `n` meses que terminam no mês de `hoje`, do mais antigo ao atual. */
export function ultimosMeses(hoje: string, n: number): string[] {
  let [y, m] = hoje.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m < 1) { m = 12; y--; }
  }
  return out;
}

/** As parcelas da configuração da fonte, em ordem de dia, com a forma de cada uma (ou a da fonte). */
export function parcelasComForma(fonte: FonteCobravel) {
  const daFonte = formaDePagamento(fonte.forma_pagamento);
  const originais = Array.isArray(fonte.parcelas) ? fonte.parcelas : [];
  return parcelasDaFonte(fonte).map((p) => {
    const original = originais.find((o) => Number(o.dia) === p.dia);
    return { ...p, forma: formaDePagamento(original?.forma) ?? daFonte };
  });
}

/**
 * Cada parcela de cada mês cobrado da fonte, do mês mais antigo ao atual. `registros` precisa ser só os da fonte
 * (a função casa por mês e parcela, não por `fonte_id`).
 */
export function cobrancasDaFonte(fonte: FonteCobravel, registros: RegistroRecebimento[], hoje: string): Cobranca[] {
  const parcelas = parcelasComForma(fonte);
  const mesAtual = hoje.slice(0, 7);
  const out: Cobranca[] = [];
  for (const mes of mesesCobrados(fonte.cobranca_desde, hoje)) {
    parcelas.forEach((p, i) => {
      const numero = i + 1;
      const registro = registros.find((r) => r.mes_referencia.slice(0, 7) === mes && (r.parcela ?? 1) === numero) ?? null;
      const valor = arred(registro?.valor_devido != null ? Number(registro.valor_devido) : p.valor);
      const pagoInformado = registro?.recebido ? Number(registro.valor_recebido ?? valor) : 0;
      const pago = arred(Math.max(0, Math.min(pagoInformado, valor)));
      const vencimento = vencimentoNoMes(p.dia, `${mes}-01`);
      const vencida = mes < mesAtual || statusDaParcela(vencimento, false, hoje) === "atrasado";
      let situacao: SituacaoCobranca;
      let falta = 0;
      let abonado = 0;
      if (registro?.isento) {
        situacao = "isento";
        abonado = arred(valor - pago);
      } else if (pago >= valor - CENTAVO) {
        situacao = "recebido";
      } else {
        falta = arred(valor - pago);
        situacao = pago > 0 ? "parcial" : mes < mesAtual ? "atrasado" : (statusDaParcela(vencimento, false, hoje) as SituacaoCobranca);
      }
      out.push({ mes, parcela: numero, total: parcelas.length, dia: p.dia, vencimento, valor, pago, falta, abonado, forma: p.forma, situacao, vencida, registro });
    });
  }
  return out;
}

/**
 * O que está devendo (vencido e não quitado nem isento) e o total. Os itens saem na ordem recebida: do mais antigo ao
 * mais novo quando são as cobranças de uma fonte só (várias fontes juntas só servem para o total).
 */
export function atrasadoDe(cobrancas: Cobranca[]) {
  const itens = cobrancas.filter((c) => c.vencida && c.falta > 0);
  return { itens, total: arred(itens.reduce((t, c) => t + c.falta, 0)) };
}

/** Totais de um conjunto de cobranças (um mês de uma ou de várias fontes). */
export function totaisDe(cobrancas: Cobranca[]) {
  const soma = (f: (c: Cobranca) => number) => arred(cobrancas.reduce((t, c) => t + f(c), 0));
  return {
    previsto: soma((c) => c.valor - c.abonado),
    recebido: soma((c) => c.pago),
    isento: soma((c) => c.abonado),
    emAberto: soma((c) => c.falta),
  };
}

/** Situação do mês de uma fonte (calendário): a pior das parcelas; todas isentas = isento; nada cobrado = fora. */
export function situacaoDoMesCobrado(doMes: Cobranca[]): SituacaoMes {
  if (!doMes.length) return "fora";
  const tem = (s: SituacaoCobranca) => doMes.some((c) => c.situacao === s);
  if (tem("atrasado")) return "atrasado";
  if (tem("parcial")) return "parcial";
  if (tem("pendente")) return "pendente";
  if (tem("a_vencer")) return "a_vencer";
  if (doMes.every((c) => c.situacao === "isento")) return "isento";
  return "recebido";
}

/** Os últimos `n` meses até hoje, com a situação e os totais de cada um. */
export function calendarioDaFonte(cobrancas: Cobranca[], hoje: string, n = 12) {
  return ultimosMeses(hoje, n).map((mes) => {
    const doMes = cobrancas.filter((c) => c.mes === mes);
    return { mes, nome: nomeDoMes(`${mes}-01`), situacao: situacaoDoMesCobrado(doMes), ...totaisDe(doMes) };
  });
}

/**
 * Meses da navegação da aba: do `cobranca_desde` mais antigo das fontes (inválido vale como setembro de 2026, como em
 * `mesesCobrados`; sem fontes, também) até o mês atual. Nunca fica vazia: o mês atual sempre está na lista.
 */
export function mesesNavegaveis(fontes: FonteCobravel[], hoje: string): string[] {
  const padrao = COBRANCA_DESDE_PADRAO.slice(0, 7);
  const atual = hoje.slice(0, 7);
  const inicios = fontes
    .map((f) => {
      const m = String(f.cobranca_desde ?? "").slice(0, 7);
      return mesDeCobrancaValido(m) ? m : padrao;
    })
    .sort();
  const primeiro = inicios[0] ?? padrao;
  return mesesCobrados(`${primeiro < atual ? primeiro : atual}-01`, hoje);
}

/** "YYYY-MM" dentro dos meses navegáveis; senão o mês atual, ou o último da lista se o atual não estiver nela. */
export function mesEscolhido(v: unknown, navegaveis: string[], hoje: string): string {
  if (typeof v === "string" && navegaveis.includes(v)) return v;
  const atual = hoje.slice(0, 7);
  if (navegaveis.includes(atual)) return atual;
  return navegaveis[navegaveis.length - 1] ?? atual;
}

/** Texto e cores de cada situação (cor nunca sozinha: sempre com o texto). */
export const INFO_SITUACAO: Record<SituacaoMes, { label: string; classe: string }> = {
  recebido: { label: "Recebido", classe: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  parcial: { label: "Parcial", classe: "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  isento: { label: "Isento", classe: "border-sky-200 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
  atrasado: { label: "Atrasado", classe: "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  pendente: { label: "Pendente", classe: "border-amber-200 bg-amber-50/60 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" },
  a_vencer: { label: "A vencer", classe: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300" },
  fora: { label: "Fora da cobrança", classe: "border-dashed border-zinc-200 bg-transparent text-zinc-400" },
};
