// Aba Financeiro: situação do mês de cada fonte de receita, por parcela.
// Pagamento único é uma parcela só (valor_mensal no dia_recebimento); o fracionado guarda em
// `financeiro_fontes.parcelas` a lista [{ dia, valor }] e cada parcela é recebida (e cobrada) à parte.
// Sem dependências: roda no navegador e no `node --test`. Datas são "YYYY-MM-DD" do dia em Brasília.

export type StatusMes = "recebido" | "atrasado" | "pendente" | "a_vencer";

export interface Parcela {
  dia: number;
  valor: number;
}

/** Linha de `financeiro_recebimentos` do mês atual, como a `financeiro_view` entrega em `recebimentos_mes`. */
export interface RecebimentoMes {
  id: string;
  parcela: number;
  recebido: boolean;
  data_confirmacao: string | null;
  valor_recebido: number | null;
}

export interface FonteDoMes {
  valor_mensal: number;
  dia_recebimento: number;
  parcelas?: Parcela[] | null;
  recebimentos_mes?: RecebimentoMes[] | null;
}

export interface ParcelaDoMes extends Parcela {
  /** 1 = primeira parcela (em ordem de dia). */
  numero: number;
  total: number;
  vencimento: string;
  status: StatusMes;
  recebimento: RecebimentoMes | null;
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

/** A pior situação entre as parcelas: atrasado > pendente > a vencer; recebido só com todas pagas. */
function statusGeral(parcelas: ParcelaDoMes[]): StatusMes {
  if (parcelas.every((p) => p.status === "recebido")) return "recebido";
  if (parcelas.some((p) => p.status === "atrasado")) return "atrasado";
  if (parcelas.some((p) => p.status === "pendente")) return "pendente";
  return "a_vencer";
}

export function situacaoDoMes(fonte: FonteDoMes, hoje: string): SituacaoDoMes {
  const lista = parcelasDaFonte(fonte);
  const recebimentos = fonte.recebimentos_mes || [];
  const parcelas = lista.map((p, i): ParcelaDoMes => {
    const recebimento = recebimentos.find((r) => r.parcela === i + 1) || null;
    const vencimento = vencimentoNoMes(p.dia, hoje);
    return { ...p, numero: i + 1, total: lista.length, vencimento, recebimento, status: statusDaParcela(vencimento, !!recebimento?.recebido, hoje) };
  });
  const recebidas = parcelas.filter((p) => p.status === "recebido");
  const soma = (ps: ParcelaDoMes[], valor: (p: ParcelaDoMes) => number) => ps.reduce((t, p) => t + valor(p), 0);
  return {
    parcelas,
    status: statusGeral(parcelas),
    fracionado: ehFracionado(fonte),
    recebidas: recebidas.length,
    valorRecebido: soma(recebidas, (p) => p.recebimento?.valor_recebido ?? p.valor),
    valorEmAberto: soma(parcelas.filter((p) => p.status !== "recebido"), (p) => p.valor),
    valorAtrasado: soma(parcelas.filter((p) => p.status === "atrasado"), (p) => p.valor),
  };
}

/** Rótulo e classes (Tailwind) de cada situação, para fonte e parcela. */
export function infoDoStatus(status: StatusMes) {
  switch (status) {
    case "recebido": return { label: "Recebido", color: "bg-emerald-500", text: "text-emerald-500", border: "border-emerald-200", bg: "bg-emerald-50/50" };
    case "atrasado": return { label: "Atrasado", color: "bg-red-500", text: "text-red-500", border: "border-red-200", bg: "bg-red-50/50" };
    case "pendente": return { label: "Pendente", color: "bg-amber-500", text: "text-amber-500", border: "border-amber-200", bg: "bg-amber-50/50" };
    default: return { label: "A vencer", color: "bg-zinc-400", text: "text-zinc-500", border: "border-zinc-200", bg: "bg-zinc-50/50" };
  }
}

/** Cartões do topo: valores somados por parcela, contagens por fonte. */
export function resumoDoMes(fontes: FonteDoMes[], hoje: string) {
  const situacoes = fontes.map((f) => situacaoDoMes(f, hoje));
  const soma = (valor: (s: SituacaoDoMes) => number) => situacoes.reduce((t, s) => t + valor(s), 0);
  return {
    previsto: soma((s) => s.parcelas.reduce((t, p) => t + p.valor, 0)),
    recebido: soma((s) => s.valorRecebido),
    emAberto: soma((s) => s.valorEmAberto),
    atrasado: soma((s) => s.valorAtrasado),
    fontes: fontes.length,
    fontesRecebidas: situacoes.filter((s) => s.status === "recebido").length,
    fontesEmAberto: situacoes.filter((s) => s.status !== "recebido").length,
    fontesAtrasadas: situacoes.filter((s) => s.status === "atrasado").length,
  };
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

/** Valor em reais no formato da máscara de moeda ("3.500,00"); a máscara lê dígitos como centavos. */
export function textoDoValor(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(valor) || 0);
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
