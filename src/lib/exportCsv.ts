// CSV que o Excel em português abre direto: BOM UTF-8, separador ";", decimais com vírgula, e texto que começa
// com =, +, - ou @ ganha um apóstrofo (não vira fórmula). Sem dependências.
import { textoDoValor, type Planilha, type Valor } from "./planilha.ts";

function protegerFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function celula(v: Valor): string {
  const s = v && v.t === "texto" ? protegerFormula(v.v) : textoDoValor(v, "csv");
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gerarCsv(p: Planilha): string {
  const cabecalho = p.cabecalho.map((c) => celula({ t: "texto", v: c.titulo })).join(";");
  const linhas = p.linhas.map((l) => l.map(celula).join(";"));
  return "﻿" + [cabecalho, ...linhas].join("\r\n");
}
