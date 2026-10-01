export type PeriodoId = "7" | "14" | "30" | "60" | "90" | "tudo" | "personalizado";

const DIA_MS = 24 * 60 * 60 * 1000;
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

const paraIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Intervalo de datas (YYYY-MM-DD) para um período do dashboard, relativo a `hoje`. */
export function intervaloDoPeriodo(
  p: PeriodoId,
  hoje: string,
  de?: string,
  ate?: string,
): { de: string | null; ate: string | null } {
  if (p === "tudo") return { de: null, ate: null };
  if (p === "personalizado") return { de: de ?? null, ate: ate ?? null };

  const n = Number(p);
  const inicio = paraIso(utc(hoje) - (n - 1) * DIA_MS);
  return { de: inicio, ate: hoje };
}

export interface Conclusao {
  cliente_id: string | null;
  pessoal: boolean;
  concluida_em: string;
}

export interface LinhaDashboard {
  chave: string;
  nome: string;
  total: number;
  percentual: number;
}

/** Agrega conclusões de demandas por cliente (mais Pessoal e Sem cliente). */
export function agregar(
  conclusoes: Conclusao[],
  clientes: { id: string; nome: string }[],
): { total: number; linhas: LinhaDashboard[] } {
  const contagens = new Map<string, number>();
  for (const c of clientes) contagens.set(c.id, 0);

  let pessoal = 0;
  let semCliente = 0;

  for (const c of conclusoes) {
    if (c.pessoal) {
      pessoal++;
    } else if (c.cliente_id === null) {
      semCliente++;
    } else {
      contagens.set(c.cliente_id, (contagens.get(c.cliente_id) ?? 0) + 1);
    }
  }

  const total = conclusoes.length;
  const percentual = (n: number) => (total === 0 ? 0 : Math.round((n * 1000) / total) / 10);

  const linhas: LinhaDashboard[] = clientes.map((c) => ({
    chave: c.id,
    nome: c.nome,
    total: contagens.get(c.id) ?? 0,
    percentual: percentual(contagens.get(c.id) ?? 0),
  }));

  if (pessoal > 0) {
    linhas.push({ chave: "pessoal", nome: "Pessoal", total: pessoal, percentual: percentual(pessoal) });
  }
  if (semCliente > 0) {
    linhas.push({ chave: "sem_cliente", nome: "Sem cliente", total: semCliente, percentual: percentual(semCliente) });
  }

  linhas.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));

  return { total, linhas };
}

// Criado uma vez: é chamado para cada conclusão do período (centenas/milhares por abertura do Dashboard)
let fmtDataBrasilia: Intl.DateTimeFormat | null = null;
/** Data local em Brasília (YYYY-MM-DD) a partir de um timestamp ISO. */
export function dataLocalBrasilia(iso: string): string {
  fmtDataBrasilia ??= new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmtDataBrasilia.format(new Date(iso));
}
