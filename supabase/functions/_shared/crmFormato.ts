// Datas e números do CRM. Fuso de São Paulo = UTC-3 fixo (sem horário de verão desde 2019), então as contas
// não dependem do fuso da máquina. Sem dependências (roda no `node --test`).

const OFFSET_MS = 3 * 60 * 60 * 1000;
export const HORA_MS = 3_600_000;
export const DIA_MS = 86_400_000;
export const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export interface PartesSP {
  ano: number;
  /** 1–12 */
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  /** 0 = domingo */
  diaSemana: number;
}

export function partesSP(d: Date): PartesSP {
  const l = new Date(d.getTime() - OFFSET_MS);
  return {
    ano: l.getUTCFullYear(), mes: l.getUTCMonth() + 1, dia: l.getUTCDate(),
    hora: l.getUTCHours(), minuto: l.getUTCMinutes(), diaSemana: l.getUTCDay(),
  };
}

/** Instante de uma data/hora de parede em SP (mes 1–12; o dia pode transbordar: 0 = último do mês anterior). */
export function deSP(ano: number, mes: number, dia: number, hora = 0, minuto = 0): Date {
  return new Date(Date.UTC(ano, mes - 1, dia, hora, minuto) + OFFSET_MS);
}

/** O dia de `d` em SP deslocado `dias`, às hh:mm. */
export function diaSPAs(d: Date, dias: number, hora: number, minuto = 0): Date {
  const p = partesSP(d);
  return deSP(p.ano, p.mes, p.dia + dias, hora, minuto);
}

export function mesmoDiaSP(a: Date, b: Date): boolean {
  const x = partesSP(a);
  const y = partesSP(b);
  return x.ano === y.ano && x.mes === y.mes && x.dia === y.dia;
}

const dois = (n: number) => String(n).padStart(2, "0");
const paraData = (v: string | Date) => (typeof v === "string" ? new Date(v) : v);

/** "26/09 às 14:30" */
export function formatarDataHora(v: string | Date): string {
  const p = partesSP(paraData(v));
  return `${dois(p.dia)}/${dois(p.mes)} às ${dois(p.hora)}:${dois(p.minuto)}`;
}

/** "qua 11:00" */
export function formatarDiaCurtoHora(v: string | Date): string {
  const p = partesSP(paraData(v));
  return `${DIAS_CURTOS[p.diaSemana]} ${dois(p.hora)}:${dois(p.minuto)}`;
}

/** "14:30" */
export function formatarHora(v: string | Date): string {
  const p = partesSP(paraData(v));
  return `${dois(p.hora)}:${dois(p.minuto)}`;
}

/** "26/09/2026" */
export function formatarData(v: string | Date): string {
  const p = partesSP(paraData(v));
  return `${dois(p.dia)}/${dois(p.mes)}/${p.ano}`;
}

/** Campos `<input type=date>` (aaaa-mm-dd) e `<input type=time>` (hh:mm) em SP → ISO. */
export function isoDeCampos(data: string, hora: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  const h = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!d || !h) return null;
  return deSP(Number(d[1]), Number(d[2]), Number(d[3]), Number(h[1]), Number(h[2])).toISOString();
}

/** ISO → campos de formulário em SP. */
export function camposDeIso(iso: string | null | undefined): { data: string; hora: string } {
  if (!iso) return { data: "", hora: "" };
  const p = partesSP(new Date(iso));
  return { data: `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`, hora: `${dois(p.hora)}:${dois(p.minuto)}` };
}

const umaCasa = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/** "45 min", "3,5 h", "2,1 dias" */
export function formatarDuracao(horas: number | null): string {
  if (horas === null || !Number.isFinite(horas)) return "—";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${umaCasa(horas)} h`;
  return `${umaCasa(horas / 24)} dias`;
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatarReais(v: number | null | undefined): string {
  return REAIS.format(Number(v) || 0).replace(/ /g, " ");
}

/** 0.256 → "25,6%" */
export function formatarPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${umaCasa(v * 100)}%`;
}
