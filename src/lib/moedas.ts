import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Moeda = "BRL" | "USD" | "EUR" | "GBP";

export const MOEDAS: { id: Moeda; label: string; simbolo: string }[] = [
  { id: "BRL", label: "Real (R$)", simbolo: "R$" },
  { id: "USD", label: "Dólar (US$)", simbolo: "US$" },
  { id: "EUR", label: "Euro (€)", simbolo: "€" },
  { id: "GBP", label: "Libra (£)", simbolo: "£" },
];

const ESTRANGEIRAS: Exclude<Moeda, "BRL">[] = ["USD", "EUR", "GBP"];

export function isMoeda(v: unknown): v is Moeda {
  return typeof v === "string" && MOEDAS.some((m) => m.id === v);
}

export function simboloMoeda(moeda: Moeda | string | null | undefined): string {
  return MOEDAS.find((m) => m.id === moeda)?.simbolo || "R$";
}

export function formatMoeda(valor: number | string | null | undefined, moeda: Moeda | string | null | undefined = "BRL"): string {
  const n = typeof valor === "string" ? Number(valor) : valor ?? 0;
  const currency = isMoeda(moeda) ? moeda : "BRL";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(n || 0);
}

/** Quantos BRL vale 1 unidade de cada moeda; `data` é o dia da cotação usada */
export interface Cotacoes {
  BRL: number;
  USD: number;
  EUR: number;
  GBP: number;
  data: string | null;
  /** true quando nenhuma cotação foi obtida (valores em 1:1) */
  indisponivel: boolean;
}

const SEM_COTACAO: Cotacoes = { BRL: 1, USD: 1, EUR: 1, GBP: 1, data: null, indisponivel: true };

export function paraBRL(valor: number | null | undefined, moeda: Moeda | string | null | undefined, cot: Cotacoes | null | undefined): number {
  const n = Number(valor || 0);
  if (!cot || !isMoeda(moeda) || moeda === "BRL") return n;
  return n * (cot[moeda] || 1);
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

// Fontes públicas, sem chave. Frankfurter (BCE) primeiro; AwesomeAPI (BR) como reserva.
async function buscarCotacoesExternas(): Promise<{ valores: Record<Exclude<Moeda, "BRL">, number>; fonte: string } | null> {
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=BRL&to=USD,EUR,GBP", { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const j = await r.json();
      const rates = j?.rates || {};
      if (rates.USD && rates.EUR && rates.GBP) {
        return { valores: { USD: 1 / rates.USD, EUR: 1 / rates.EUR, GBP: 1 / rates.GBP }, fonte: "frankfurter" };
      }
    }
  } catch {
    // tenta a próxima fonte
  }
  try {
    const r = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL", { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const j = await r.json();
      const usd = Number(j?.USDBRL?.bid), eur = Number(j?.EURBRL?.bid), gbp = Number(j?.GBPBRL?.bid);
      if (usd && eur && gbp) return { valores: { USD: usd, EUR: eur, GBP: gbp }, fonte: "awesomeapi" };
    }
  } catch {
    // sem rede: usa o que houver no banco
  }
  return null;
}

let cache: Promise<Cotacoes> | null = null;

/**
 * Cotação do dia. Lê da tabela cotacoes; se ainda não houver a de hoje, busca na API,
 * grava (para o banco converter nas views) e devolve. Sem rede, usa a mais recente gravada.
 */
export function fetchCotacoes(force = false): Promise<Cotacoes> {
  if (cache && !force) return cache;
  const p: Promise<Cotacoes> = (async (): Promise<Cotacoes> => {
    const dia = hoje();
    const { data: deHoje } = await supabase.from("cotacoes").select("moeda, valor, data").eq("data", dia);
    const mapa: Partial<Record<Moeda, number>> = {};
    (deHoje || []).forEach((r) => { if (isMoeda(r.moeda)) mapa[r.moeda] = Number(r.valor); });

    if (ESTRANGEIRAS.every((m) => mapa[m])) {
      return { BRL: 1, USD: mapa.USD!, EUR: mapa.EUR!, GBP: mapa.GBP!, data: dia, indisponivel: false };
    }

    const externas = await buscarCotacoesExternas();
    if (externas) {
      const rows = ESTRANGEIRAS.map((m) => ({ moeda: m, data: dia, valor: Number(externas.valores[m].toFixed(6)), fonte: externas.fonte }));
      const { error } = await supabase.from("cotacoes").upsert(rows, { onConflict: "moeda,data" });
      if (error) console.warn("Não foi possível gravar cotações:", error.message);
      return { BRL: 1, ...externas.valores, data: dia, indisponivel: false };
    }

    // Sem API: última cotação conhecida de cada moeda
    const { data: ultimas } = await supabase.from("cotacoes").select("moeda, valor, data").order("data", { ascending: false }).limit(30);
    const out: Partial<Record<Moeda, number>> = {};
    let dataMaisAntiga: string | null = null;
    (ultimas || []).forEach((r) => {
      if (isMoeda(r.moeda) && !out[r.moeda]) {
        out[r.moeda] = Number(r.valor);
        dataMaisAntiga = !dataMaisAntiga || r.data < dataMaisAntiga ? r.data : dataMaisAntiga;
      }
    });
    if (ESTRANGEIRAS.every((m) => out[m])) {
      return { BRL: 1, USD: out.USD!, EUR: out.EUR!, GBP: out.GBP!, data: dataMaisAntiga, indisponivel: false };
    }
    return SEM_COTACAO;
  })().catch(() => SEM_COTACAO);
  cache = p;
  return p;
}

export function useCotacoes(): Cotacoes | null {
  const [cot, setCot] = useState<Cotacoes | null>(null);
  useEffect(() => {
    let ativo = true;
    fetchCotacoes().then((c) => { if (ativo) setCot(c); });
    return () => { ativo = false; };
  }, []);
  return cot;
}
