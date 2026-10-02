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
  /** Demanda atribuída à própria agência (exclusiva com cliente e Pessoal) */
  agencia_id?: string | null;
  /** Data de entrega quando foi concluída (YYYY-MM-DD) */
  prazo?: string | null;
  concluida_em: string;
}

export interface LinhaDashboard {
  chave: string;
  nome: string;
  total: number;
  percentual: number;
}

const percentualDe = (n: number, total: number) => (total === 0 ? 0 : Math.round((n * 1000) / total) / 10);

/** Prefixo da chave das linhas de demandas da própria agência na tabela por cliente */
export const PREFIXO_AGENCIA = "agencia:";

/** Grupo da conclusão na tabela por cliente: Pessoal, agência (demanda da própria agência), cliente ou Sem cliente. */
export function chaveDaConclusao(c: Conclusao): string {
  if (c.pessoal) return "pessoal";
  if (c.agencia_id) return PREFIXO_AGENCIA + c.agencia_id;
  return c.cliente_id ?? "sem_cliente";
}

/**
 * Agrega conclusões de demandas por cliente (mais Pessoal, as demandas de cada agência e Sem cliente).
 * Pessoal, agências e Sem cliente só ganham linha quando têm conclusões.
 */
export function agregar(
  conclusoes: Conclusao[],
  clientes: { id: string; nome: string }[],
  agencias: { id: string; label: string }[] = [],
): { total: number; linhas: LinhaDashboard[] } {
  const contagens = new Map<string, number>();
  for (const c of clientes) contagens.set(c.id, 0);
  for (const c of conclusoes) {
    const chave = chaveDaConclusao(c);
    contagens.set(chave, (contagens.get(chave) ?? 0) + 1);
  }

  const total = conclusoes.length;
  const linha = (chave: string, nome: string): LinhaDashboard => {
    const n = contagens.get(chave) ?? 0;
    return { chave, nome, total: n, percentual: percentualDe(n, total) };
  };

  const linhas: LinhaDashboard[] = clientes.map((c) => linha(c.id, c.nome));
  if (contagens.get("pessoal")) linhas.push(linha("pessoal", "Pessoal"));
  for (const chave of contagens.keys()) {
    if (!chave.startsWith(PREFIXO_AGENCIA)) continue;
    const id = chave.slice(PREFIXO_AGENCIA.length);
    linhas.push(linha(chave, `${agencias.find((a) => a.id === id)?.label ?? id} (agência)`));
  }
  if (contagens.get("sem_cliente")) linhas.push(linha("sem_cliente", "Sem cliente"));

  linhas.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));

  return { total, linhas };
}

/** Agência da conclusão: a da própria demanda ou a do cliente; Pessoal e sem cliente não têm. */
export function agenciaDaConclusao(c: Conclusao, agenciaDoCliente: Map<string, string | null | undefined>): string | null {
  if (c.pessoal) return null;
  if (c.agencia_id) return c.agencia_id;
  return (c.cliente_id && agenciaDoCliente.get(c.cliente_id)) || null;
}

export interface LinhaAgencia extends LinhaDashboard {
  /** Quantas foram de demandas atribuídas à própria agência (o resto veio dos clientes dela) */
  diretas: number;
}

/**
 * Conclusões por agência: as demandas da agência mais as dos clientes dela. Todas as agências informadas aparecem
 * (mesmo com 0); "Sem agência" (Pessoal, sem cliente ou cliente sem agência) só quando tem conclusões.
 * Agência que não está na lista mas aparece nas conclusões (ex.: inativa) também ganha linha.
 */
export function agregarPorAgencia(
  conclusoes: Conclusao[],
  agenciaDoCliente: Map<string, string | null | undefined>,
  agencias: { id: string; label: string }[],
): LinhaAgencia[] {
  const contagens = new Map<string, { total: number; diretas: number }>();
  for (const a of agencias) contagens.set(a.id, { total: 0, diretas: 0 });
  for (const c of conclusoes) {
    const id = agenciaDaConclusao(c, agenciaDoCliente) ?? "sem_agencia";
    const atual = contagens.get(id) ?? { total: 0, diretas: 0 };
    atual.total++;
    if (c.agencia_id && !c.pessoal) atual.diretas++;
    contagens.set(id, atual);
  }
  const total = conclusoes.length;
  const linhas: LinhaAgencia[] = [];
  for (const [chave, { total: n, diretas }] of contagens) {
    if (chave === "sem_agencia") continue;
    const nome = agencias.find((a) => a.id === chave)?.label ?? chave;
    linhas.push({ chave, nome, total: n, diretas, percentual: percentualDe(n, total) });
  }
  linhas.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  const sem = contagens.get("sem_agencia");
  if (sem) linhas.push({ chave: "sem_agencia", nome: "Sem agência", total: sem.total, diretas: 0, percentual: percentualDe(sem.total, total) });
  return linhas;
}

const diasEntre = (de: string, ate: string) => Math.round((utc(ate) - utc(de)) / DIA_MS);

/**
 * Demandas entregues com atraso: concluídas (data de Brasília) depois da data de entrega. Sem entrega não conta como
 * atraso. `percentual` é sobre todas as concluídas recebidas; a lista vem do maior atraso para o menor.
 */
export function entreguesComAtraso<T extends Conclusao>(
  conclusoes: T[],
): { atrasadas: (T & { diasAtraso: number })[]; percentual: number; semEntrega: number } {
  const atrasadas: (T & { diasAtraso: number })[] = [];
  let semEntrega = 0;
  for (const c of conclusoes) {
    if (!c.prazo) {
      semEntrega++;
      continue;
    }
    const dias = diasEntre(c.prazo, dataLocalBrasilia(c.concluida_em));
    if (dias > 0) atrasadas.push({ ...c, diasAtraso: dias });
  }
  atrasadas.sort((a, b) => b.diasAtraso - a.diasAtraso || b.concluida_em.localeCompare(a.concluida_em));
  return { atrasadas, percentual: percentualDe(atrasadas.length, conclusoes.length), semEntrega };
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
