// Aba Financeiro: situação do mês de cada fonte de receita, por parcela.
// Pagamento único é uma parcela só (valor_mensal no dia_recebimento); o fracionado guarda em
// `financeiro_fontes.parcelas` a lista [{ dia, valor }] e cada parcela é recebida (e cobrada) à parte.
// Sem dependências: roda no navegador e no `node --test`. Datas são "YYYY-MM-DD" do dia em Brasília.

export type StatusMes = "recebido" | "isento" | "atrasado" | "pendente" | "a_vencer";

/** Freelancer = trabalho feito para uma agência (financeiro_fontes.agencia_id diz qual). */
export type TipoFonte = "agencia" | "cliente_pessoal" | "freelancer";

export const TIPOS_DE_FONTE: Record<TipoFonte, { label: string; classe: string }> = {
  agencia: { label: "Agência", classe: "text-blue-600 border-blue-200 bg-blue-50" },
  cliente_pessoal: { label: "Pessoal", classe: "text-emerald-600 border-emerald-200 bg-emerald-50" },
  freelancer: { label: "Freelancer", classe: "text-violet-600 border-violet-200 bg-violet-50" },
};

export function tipoDaFonte(tipo: string) {
  return TIPOS_DE_FONTE[tipo as TipoFonte] ?? TIPOS_DE_FONTE.cliente_pessoal;
}

export interface Parcela {
  dia: number;
  valor: number;
  /** pix | cartao | boleto; ausente = a forma de pagamento da fonte */
  forma?: string | null;
}

/** Linha de `financeiro_recebimentos` do mês atual, como a `financeiro_view` entrega em `recebimentos_mes`. */
export interface RecebimentoMes {
  id: string;
  parcela: number;
  recebido: boolean;
  /** Parcela abonada neste mês: o que não foi pago deixa de ser cobrado. */
  isento?: boolean | null;
  data_confirmacao: string | null;
  valor_recebido: number | null;
  /** Valor da parcela congelado quando ela foi acertada (vence o valor atual da fonte). */
  valor_devido?: number | null;
}

export interface FonteDoMes {
  valor_mensal: number;
  dia_recebimento: number;
  parcelas?: Parcela[] | null;
  recebimentos_mes?: RecebimentoMes[] | null;
  /** Primeiro mês cobrado ("YYYY-MM-DD"); antes dele a fonte está fora da cobrança. */
  cobranca_desde?: string | null;
}

export interface ParcelaDoMes extends Parcela {
  /** 1 = primeira parcela (em ordem de dia). */
  numero: number;
  total: number;
  vencimento: string;
  status: StatusMes;
  recebimento: RecebimentoMes | null;
  /** O que a parcela vale neste mês: o valor congelado no acerto (`valor_devido`) ou, sem ele, `valor`. */
  devido: number;
  /** O que já entrou na parcela, no máximo o devido (o que passa disso não abate outra parcela). */
  pago: number;
  /** O que ainda falta receber: 0 se recebida ou isenta. É o valor que o sino cobra. */
  falta: number;
  /** O que a isenção abonou: devido menos o que já tinha sido pago; 0 se não é isenta. */
  abonado: number;
}

export interface SituacaoDoMes {
  parcelas: ParcelaDoMes[];
  status: StatusMes;
  fracionado: boolean;
  recebidas: number;
  valorRecebido: number;
  valorEmAberto: number;
  valorAtrasado: number;
}

export const MIN_PARCELAS = 2;
export const MAX_PARCELAS = 6;
/** Dias depois do vencimento em que a parcela ainda é "pendente" antes de virar "atrasada". */
export const DIAS_DE_TOLERANCIA = 5;

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// ---- Datas "YYYY-MM-DD" (aritmética em UTC para não depender do fuso da máquina)
function utc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function somarDias(iso: string, n: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const porDia = (a: Parcela, b: Parcela) => a.dia - b.dia;

export function ehFracionado(fonte: Pick<FonteDoMes, "parcelas">): boolean {
  return Array.isArray(fonte.parcelas) && fonte.parcelas.length >= MIN_PARCELAS;
}

/** As parcelas do mês em ordem de dia; pagamento único vira uma parcela só. */
export function parcelasDaFonte(fonte: FonteDoMes): Parcela[] {
  if (!ehFracionado(fonte)) return [{ dia: fonte.dia_recebimento, valor: Number(fonte.valor_mensal) || 0 }];
  return fonte.parcelas!.map((p) => ({ dia: Number(p.dia), valor: Number(p.valor) || 0 })).sort(porDia);
}

/** Data do vencimento no mês de `hoje`; dia que o mês não tem (29–31) cai no último dia. */
export function vencimentoNoMes(dia: number, hoje: string): string {
  const [y, m] = hoje.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${hoje.slice(0, 7)}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

export function statusDaParcela(vencimento: string, recebido: boolean, hoje: string): StatusMes {
  if (recebido) return "recebido";
  if (hoje > somarDias(vencimento, DIAS_DE_TOLERANCIA)) return "atrasado";
  if (hoje >= vencimento) return "pendente";
  return "a_vencer";
}

/**
 * A pior situação entre as parcelas: atrasado > pendente > a vencer. Todas isentas = isento; todas recebidas
 * ou isentas = recebido.
 */
function statusGeral(parcelas: ParcelaDoMes[]): StatusMes {
  if (parcelas.every((p) => p.status === "isento")) return "isento";
  if (parcelas.every((p) => p.status === "recebido" || p.status === "isento")) return "recebido";
  if (parcelas.some((p) => p.status === "atrasado")) return "atrasado";
  if (parcelas.some((p) => p.status === "pendente")) return "pendente";
  return "a_vencer";
}

const CENTAVO = 0.005;
/** Arredonda em centavos (soma de valores quebrados não pode sair 0,30000000000000004). */
const arred = (v: number) => Math.round(v * 100) / 100;

/**
 * Valor da parcela congelado no registro: `valor_devido`; num registro antigo recebido e não isento sem ele (a tela
 * antiga gravava o valor da parcela em `valor_recebido`), o que foi recebido. Sem nada congelado: null (vale o atual).
 */
export function valorDevidoDoRegistro(
  registro: { recebido?: boolean | null; isento?: boolean | null; valor_recebido?: number | null; valor_devido?: number | null } | null | undefined,
): number | null {
  if (!registro) return null;
  if (registro.valor_devido != null) return Number(registro.valor_devido);
  if (registro.recebido && !registro.isento && registro.valor_recebido != null) return Number(registro.valor_recebido);
  return null;
}

export function situacaoDoMes(fonte: FonteDoMes, hoje: string): SituacaoDoMes {
  const lista = parcelasDaFonte(fonte);
  const recebimentos = fonte.recebimentos_mes || [];
  const parcelas = lista.map((p, i): ParcelaDoMes => {
    const recebimento = recebimentos.find((r) => r.parcela === i + 1) || null;
    const vencimento = vencimentoNoMes(p.dia, hoje);
    // O valor congelado no acerto vence o atual; o pago conta no máximo o devido (o excesso não abate outra parcela)
    const devido = arred(valorDevidoDoRegistro(recebimento) ?? p.valor);
    const pago = recebimento?.recebido ? arred(Math.max(0, Math.min(Number(recebimento.valor_recebido ?? devido), devido))) : 0;
    // Recebido de verdade só quando o pago cobre o devido; valor menor é parcial e a parcela segue em aberto pela data
    const quitada = !!recebimento?.recebido && pago >= devido - CENTAVO;
    // Quitada vale mais que a isenção: isenta com o pagamento cobrindo o devido é recebida (nada abonado)
    const isenta = !!recebimento?.isento && !quitada;
    const status: StatusMes = isenta ? "isento" : statusDaParcela(vencimento, quitada, hoje);
    const falta = isenta || quitada ? 0 : arred(devido - pago);
    const abonado = isenta ? arred(devido - pago) : 0;
    return { ...p, numero: i + 1, total: lista.length, vencimento, recebimento, status, devido, pago, falta, abonado };
  });
  const soma = (ps: ParcelaDoMes[], valor: (p: ParcelaDoMes) => number) => arred(ps.reduce((t, p) => t + valor(p), 0));
  return {
    parcelas,
    status: statusGeral(parcelas),
    fracionado: ehFracionado(fonte),
    recebidas: parcelas.filter((p) => p.status === "recebido").length,
    // O que entrou em qualquer parcela com pagamento (inclusive parcial e isenta que já tinha pago), com o valor informado
    valorRecebido: soma(parcelas.filter((p) => p.recebimento?.recebido), (p) => Math.max(0, Number(p.recebimento?.valor_recebido ?? p.devido))),
    valorEmAberto: soma(parcelas, (p) => p.falta),
    valorAtrasado: soma(parcelas.filter((p) => p.status === "atrasado"), (p) => p.falta),
  };
}

/**
 * Parcelas do mês de `hoje` que o sino avisa: pendentes ou atrasadas com algo ainda a receber, só de fonte já cobrada
 * neste mês ("cobrar a partir de" depois do mês atual = fora da cobrança, como na aba).
 */
export function parcelasParaAvisar(fonte: FonteDoMes, hoje: string): ParcelaDoMes[] {
  if (fonte.cobranca_desde && String(fonte.cobranca_desde).slice(0, 7) > hoje.slice(0, 7)) return [];
  return situacaoDoMes(fonte, hoje).parcelas.filter((p) => (p.status === "pendente" || p.status === "atrasado") && p.falta > 0);
}

// ---- Formulário

/** Volta o dia para 1..31 quando passa do fim do mês. */
const noMes = (dia: number) => ((dia - 1) % 31 + 31) % 31 + 1;

/**
 * Sugestão ao ligar o fracionado: o total dividido em centavos (a sobra vai na última) e os dias
 * espalhados pelo mês a partir do dia atual da fonte. Sai em ordem de dia.
 */
export function dividirEmParcelas(total: number, n: number, diaInicial: number): Parcela[] {
  const centavos = Math.round((Number(total) || 0) * 100);
  const base = Math.floor(centavos / n);
  const passo = Math.floor(30 / n);
  const inicio = Math.min(Math.max(Math.round(diaInicial) || 1, 1), 31);
  return Array.from({ length: n }, (_, i) => ({
    dia: i === 0 ? inicio : ((inicio - 1 + i * passo) % 30) + 1,
    valor: (i === n - 1 ? centavos - base * (n - 1) : base) / 100,
  })).sort(porDia);
}

/** Muda a quantidade sem perder o que já foi digitado: tira do fim ou acrescenta parcelas vazias. */
export function ajustarQuantidade(parcelas: Parcela[], n: number): Parcela[] {
  if (n <= parcelas.length) return parcelas.slice(0, n);
  const passo = Math.floor(30 / n);
  const usados = new Set(parcelas.map((p) => p.dia));
  const novas = [...parcelas];
  while (novas.length < n) {
    let dia = noMes((novas[novas.length - 1]?.dia || 1) + passo);
    while (usados.has(dia)) dia = noMes(dia + 1);
    usados.add(dia);
    novas.push({ dia, valor: 0 });
  }
  return novas;
}

/** Mensagem do primeiro problema, ou null se as parcelas podem ser salvas. */
export function validarParcelas(parcelas: Parcela[]): string | null {
  if (parcelas.length < MIN_PARCELAS || parcelas.length > MAX_PARCELAS) {
    return `Escolha de ${MIN_PARCELAS} a ${MAX_PARCELAS} parcelas`;
  }
  for (const [i, p] of parcelas.entries()) {
    if (!Number.isInteger(p.dia) || p.dia < 1 || p.dia > 31) return `Parcela ${i + 1}: o dia precisa ser de 1 a 31`;
    if (!(p.valor > 0)) return `Parcela ${i + 1}: informe o valor`;
  }
  const vistos = new Set<number>();
  for (const p of parcelas) {
    if (vistos.has(p.dia)) return `Duas parcelas no dia ${p.dia}: use dias diferentes`;
    vistos.add(p.dia);
  }
  return null;
}

export function ordenarParcelas(parcelas: Parcela[]): Parcela[] {
  return [...parcelas].sort(porDia);
}

/**
 * A configuração do pagamento mudou? Quantidade, dias ou valores (em centavos); trocar entre pagamento único e parcelado
 * muda a quantidade. A forma de pagamento não conta.
 */
export function mudouAsParcelas(antes: Parcela[], depois: Parcela[]): boolean {
  const a = ordenarParcelas(antes);
  const b = ordenarParcelas(depois);
  if (a.length !== b.length) return true;
  const centavos = (v: number) => Math.round((Number(v) || 0) * 100);
  return a.some((p, i) => Number(p.dia) !== Number(b[i].dia) || centavos(p.valor) !== centavos(b[i].valor));
}

/** Valor em reais no formato da máscara de moeda ("3.500,00"); a máscara lê dígitos como centavos. */
let fmtValor: Intl.NumberFormat | null = null; // criado uma vez
export function textoDoValor(valor: number): string {
  fmtValor ??= new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return fmtValor.format(Number(valor) || 0);
}

/** "2026-09-01" → "setembro de 2026" (sem `new Date`, que em Brasília voltaria um mês). */
export function nomeDoMes(mesReferencia: string): string {
  const [y, m] = mesReferencia.split("-").map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

/** "dias 5 e 20", "dias 1, 10 e 20". */
export function descreverDias(parcelas: Parcela[]): string {
  const dias = ordenarParcelas(parcelas).map((p) => String(p.dia));
  return `dias ${dias.length > 1 ? `${dias.slice(0, -1).join(", ")} e ${dias[dias.length - 1]}` : dias[0]}`;
}

/** Histórico: um grupo por mês (mais recente primeiro), com as parcelas do mês em ordem. */
export function agruparHistorico<T extends { mes_referencia: string; parcela?: number | null }>(registros: T[], meses = 12) {
  const grupos = new Map<string, T[]>();
  for (const r of registros) {
    const mes = r.mes_referencia.slice(0, 7);
    grupos.set(mes, [...(grupos.get(mes) || []), r]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, meses)
    .map(([mes, itens]) => ({
      mes,
      nome: nomeDoMes(`${mes}-01`),
      itens: [...itens].sort((a, b) => (a.parcela ?? 1) - (b.parcela ?? 1)),
    }));
}
