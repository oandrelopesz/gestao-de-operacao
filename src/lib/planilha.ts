// Tabela genérica para exportação (CSV, XLSX e PDF): cada célula sabe o próprio tipo. Sem dependências.
import { formatarReais, partesSP } from "./crmFormato.ts";

export type Valor =
  | { t: "texto"; v: string }
  | { t: "inteiro"; v: number }
  | { t: "numero"; v: number; casas?: number }
  | { t: "moeda"; v: number }
  | { t: "data"; v: Date }
  | { t: "datahora"; v: Date }
  | null;

export interface ColunaPlanilha {
  titulo: string;
  /** Agrupamento (seção da ficha no PDF) */
  secao?: string;
  /** Largura aproximada em caracteres (XLSX) */
  largura?: number;
}

export interface Planilha {
  cabecalho: ColunaPlanilha[];
  linhas: Valor[][];
}

const dois = (n: number) => String(n).padStart(2, "0");

/** Texto da célula: "csv" é fácil de o Excel reconhecer (1500,00); "legivel" é para gente (R$ 1.500,00). */
export function textoDoValor(v: Valor, modo: "csv" | "legivel"): string {
  if (!v) return "";
  switch (v.t) {
    case "texto":
      return v.v;
    case "inteiro":
      return String(Math.round(v.v));
    case "numero":
      return v.v.toFixed(v.casas ?? 1).replace(".", ",");
    case "moeda":
      return modo === "csv" ? v.v.toFixed(2).replace(".", ",") : formatarReais(v.v);
    case "data": {
      const p = partesSP(v.v);
      return `${dois(p.dia)}/${dois(p.mes)}/${p.ano}`;
    }
    case "datahora": {
      const p = partesSP(v.v);
      return `${dois(p.dia)}/${dois(p.mes)}/${p.ano}${modo === "csv" ? " " : " às "}${dois(p.hora)}:${dois(p.minuto)}`;
    }
  }
}

/** Número de série do Excel para a data/hora de parede em São Paulo. */
export function serialExcel(d: Date): number {
  const p = partesSP(d);
  return (Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto) - Date.UTC(1899, 11, 30)) / 86_400_000;
}
