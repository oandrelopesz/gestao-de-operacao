// As agências agora vêm do banco (tabela agencias) — ver src/lib/agencias.tsx

export function formatBRL(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

export function parseBRLInput(input: string): number {
  const digits = input.replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
}

export function maskBRLInput(input: string): string {
  const value = parseBRLInput(input);
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function tempoDeCasa(dataInicio: string | null | undefined): string {
  if (!dataInicio) return "—";
  const start = new Date(dataInicio);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 1) return "menos de 1 mês";
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearLabel = `${years} ${years === 1 ? "ano" : "anos"}`;
  if (rest === 0) return yearLabel;
  return `${yearLabel} e ${rest} ${rest === 1 ? "mês" : "meses"}`;
}

export const NPS_STATUS_META: Record<string, { label: string; classes: string; dot: string }> = {
  ancora: {
    label: "Âncora",
    classes: "bg-emerald-900/10 text-emerald-900 dark:text-emerald-300 border-emerald-900/20",
    dot: "bg-emerald-900",
  },
  saudavel: {
    label: "Saudável",
    classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  em_risco: {
    label: "Em risco",
    classes: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    dot: "bg-amber-500",
  },
  critico: {
    label: "Crítico",
    classes: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
    dot: "bg-red-500",
  },
  sem_avaliacao: {
    label: "Sem avaliação",
    classes: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/40",
  },
};

export const PAGAMENTO_META: Record<string, { label: string; classes: string }> = {
  em_dia: { label: "Em dia", classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  pendente: { label: "Pendente", classes: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  atrasado: { label: "Atrasado", classes: "bg-red-500/10 text-red-700 dark:text-red-300" },
};
