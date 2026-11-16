// Calculadora de taxas: conta pura, testada em taxas.test.ts (os templates guardados ficam em taxasGuardadas.ts).
import { formatBRL } from "./clientes.ts";

/** acrescentar: valor desejado -> valor com taxa (ex.: PIX). descontar: valor pago -> o que sobra sem a taxa. */
export type Direcao = "acrescentar" | "descontar";
/** fora: a taxa soma por cima do valor. dentro: a taxa já está inclusa no total. */
export type Metodo = "fora" | "dentro";

export interface ResultadoTaxa {
  /** Valor final (nos dois sentidos) */
  resultado: number;
  /** Quanto a taxa pesa em reais */
  taxaEmReais: number;
  /** A conta, em texto, para conferir */
  formula: string;
}

/** Arredonda para o centavo sem o ruído do ponto flutuante (100 * 1.13 = 113.00000000000001). */
const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

export const formatarTaxa = (taxa: number) => `${taxa.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;

/** valor em reais, taxa em % (13,15 = 13,15%). null = conta impossível (valor zerado ou taxa fora de 0 a 100). */
export function calcularTaxa(valor: number, taxa: number, direcao: Direcao, metodo: Metodo): ResultadoTaxa | null {
  if (!(valor > 0) || !(taxa >= 0) || taxa >= 100) return null;
  const t = taxa / 100;
  const v = formatBRL(valor);
  const p = formatarTaxa(taxa);
  let bruto: number;
  let formula: string;
  if (direcao === "acrescentar") {
    if (metodo === "fora") { bruto = valor * (1 + t); formula = `${v} × (1 + ${p})`; }
    else { bruto = valor / (1 - t); formula = `${v} ÷ (1 − ${p})`; }
  } else if (metodo === "fora") { bruto = valor / (1 + t); formula = `${v} ÷ (1 + ${p})`; }
  else { bruto = valor * (1 - t); formula = `${v} × (1 − ${p})`; }
  const resultado = centavos(bruto);
  return { resultado, taxaEmReais: centavos(Math.abs(resultado - valor)), formula };
}

/** Texto do campo de taxa -> número. Aceita vírgula ou ponto; vazio vira 0. */
export function lerTaxa(texto: string): number {
  const n = Number(texto.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** O que o campo de taxa aceita: só dígitos e uma vírgula (o ponto vira vírgula), até 2 inteiros e 4 decimais. */
export function limparTaxa(texto: string): string {
  const [inteiro, ...resto] = texto.replace(/\./g, ",").replace(/[^\d,]/g, "").split(",");
  return resto.length ? `${inteiro.slice(0, 2)},${resto.join("").slice(0, 4)}` : inteiro.slice(0, 2);
}

/** Número -> texto do campo de taxa (13.15 -> "13,15"). */
export const taxaParaCampo = (taxa: number) => String(taxa).replace(".", ",");

/** Valor para colar no app do banco ou da Meta: sem R$ nem ponto de milhar (1131.5 -> "1131,50"). */
export const valorParaCopiar = (n: number) => n.toFixed(2).replace(".", ",");
