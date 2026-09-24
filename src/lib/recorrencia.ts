// Repetição de eventos da Agenda ⇄ RRULE do Google Calendar (RFC 5545) — só o que o formulário edita.
// Sem dependências: roda no navegador e no `node --test`.

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type DiaSemana = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";
export type FimRecorrencia = { tipo: "nunca" } | { tipo: "data"; data: string } | { tipo: "vezes"; n: number };

export interface Recorrencia {
  freq: Freq;
  /** A cada N dias/semanas/meses/anos (mínimo 1). */
  intervalo: number;
  /** Só WEEKLY: dias da semana (vazio = o dia do início). */
  diasSemana: DiaSemana[];
  /** Só MONTHLY: mesmo dia do mês ("dia 24") ou mesma posição ("quarta quinta-feira"). */
  mensal: "dia" | "posicao";
  fim: FimRecorrencia;
}

export const DIAS: DiaSemana[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
export const DIAS_CURTO: Record<DiaSemana, string> = { SU: "dom", MO: "seg", TU: "ter", WE: "qua", TH: "qui", FR: "sex", SA: "sáb" };
export const DIAS_LETRA: Record<DiaSemana, string> = { SU: "D", MO: "S", TU: "T", WE: "Q", TH: "Q", FR: "S", SA: "S" };
const DIAS_LONGO: Record<DiaSemana, string> = {
  SU: "domingo", MO: "segunda-feira", TU: "terça-feira", WE: "quarta-feira", TH: "quinta-feira", FR: "sexta-feira", SA: "sábado",
};
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const UTEIS: DiaSemana[] = ["MO", "TU", "WE", "TH", "FR"];

// ---- Datas "YYYY-MM-DD" (aritmética em UTC para não depender do fuso da máquina)
function utc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function isoDe(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function somarDias(iso: string, n: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDe(d);
}
export function diferencaDias(de: string, ate: string): number {
  return Math.round((utc(ate).getTime() - utc(de).getTime()) / 86_400_000);
}
export function diaDaSemana(iso: string): DiaSemana {
  return DIAS[utc(iso).getUTCDay()];
}
function diaDoMes(iso: string): number {
  return utc(iso).getUTCDate();
}
function nomeMes(iso: string): string {
  return MESES[utc(iso).getUTCMonth()];
}
/** Posição do dia da semana no mês: 1 a 4, ou -1 para a 5ª (a última). */
export function posicaoNoMes(iso: string): number {
  const n = Math.ceil(diaDoMes(iso) / 7);
  return n >= 5 ? -1 : n;
}
function compacta(iso: string): string {
  return iso.replace(/-/g, "");
}
function dataBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function ordinal(iso: string): { artigo: string; texto: string } {
  const dia = diaDaSemana(iso);
  const masc = dia === "SA" || dia === "SU";
  const nomes: Record<number, [string, string]> = {
    1: ["primeiro", "primeira"], 2: ["segundo", "segunda"], 3: ["terceiro", "terceira"], 4: ["quarto", "quarta"], [-1]: ["último", "última"],
  };
  return { artigo: masc ? "no" : "na", texto: `${nomes[posicaoNoMes(iso)][masc ? 0 : 1]} ${DIAS_LONGO[dia]}` };
}

/** UNTIL: data pura (dia inteiro) ou o fim do dia em Brasília (UTC-3, sem horário de verão) escrito em UTC. */
function untilDe(iso: string, diaInteiro: boolean): string {
  return diaInteiro ? compacta(iso) : `${compacta(somarDias(iso, 1))}T025959Z`;
}

export function paraRRule(r: Recorrencia, inicioISO: string, diaInteiro: boolean): string {
  const partes = [`FREQ=${r.freq}`];
  if (r.intervalo > 1) partes.push(`INTERVAL=${Math.floor(r.intervalo)}`);
  if (r.freq === "WEEKLY") {
    const dias = r.diasSemana.length ? r.diasSemana : [diaDaSemana(inicioISO)];
    partes.push(`BYDAY=${DIAS.filter((d) => dias.includes(d)).join(",")}`);
  }
  if (r.freq === "MONTHLY") {
    partes.push(r.mensal === "posicao" ? `BYDAY=${posicaoNoMes(inicioISO)}${diaDaSemana(inicioISO)}` : `BYMONTHDAY=${diaDoMes(inicioISO)}`);
  }
  if (r.fim.tipo === "vezes") partes.push(`COUNT=${Math.max(1, Math.floor(r.fim.n))}`);
  if (r.fim.tipo === "data") partes.push(`UNTIL=${untilDe(r.fim.data, diaInteiro)}`);
  return `RRULE:${partes.join(";")}`;
}

function lerFim(kv: Record<string, string>): FimRecorrencia | null {
  if (kv.COUNT && kv.UNTIL) return null;
  if (kv.COUNT) {
    const n = Number(kv.COUNT);
    return Number.isInteger(n) && n > 0 ? { tipo: "vezes", n } : null;
  }
  if (kv.UNTIL) {
    const u = kv.UNTIL.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})\d{2}\d{2}(Z?))?$/);
    if (!u) return null;
    let iso = `${u[1]}-${u[2]}-${u[3]}`;
    // Em UTC antes das 03:00 ainda é o dia anterior em Brasília
    if (u[4] !== undefined && u[5] === "Z" && Number(u[4]) < 3) iso = somarDias(iso, -1);
    return { tipo: "data", data: iso };
  }
  return { tipo: "nunca" };
}

/** Lê a RRULE do Google. `null` = tem partes que o formulário não edita (a regra fica intacta). */
export function deRRule(linha: string): Recorrencia | null {
  const m = linha.trim().match(/^RRULE:(.+)$/i);
  if (!m) return null;
  const kv: Record<string, string> = {};
  for (const parte of m[1].split(";")) {
    const [k, v] = parte.split("=");
    if (!k || v === undefined) return null;
    kv[k.toUpperCase()] = v.toUpperCase();
  }
  if (Object.keys(kv).some((k) => !["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "COUNT", "UNTIL", "WKST"].includes(k))) return null;
  let freq = kv.FREQ as Freq;
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  const intervalo = kv.INTERVAL ? Number(kv.INTERVAL) : 1;
  if (!Number.isInteger(intervalo) || intervalo < 1) return null;
  const fim = lerFim(kv);
  if (!fim) return null;
  let diasSemana: DiaSemana[] = [];
  let mensal: Recorrencia["mensal"] = "dia";
  if (kv.BYDAY) {
    const lista = kv.BYDAY.split(",");
    const soDias = lista.every((d) => DIAS.includes(d as DiaSemana));
    if (freq === "WEEKLY" && soDias) {
      diasSemana = lista as DiaSemana[];
    } else if (freq === "DAILY" && soDias && intervalo === 1) {
      // "dias úteis" às vezes vem como DAILY;BYDAY=MO,...,FR
      diasSemana = lista as DiaSemana[];
      freq = "WEEKLY";
    } else if (freq === "MONTHLY" && /^(-1|[1-4])(SU|MO|TU|WE|TH|FR|SA)$/.test(kv.BYDAY)) {
      mensal = "posicao";
    } else return null;
  }
  if (kv.BYMONTHDAY !== undefined && (freq !== "MONTHLY" || !/^\d{1,2}$/.test(kv.BYMONTHDAY))) return null;
  return { freq, intervalo, diasSemana, mensal, fim };
}

export type Preset = "nao" | "diario" | "semanal" | "mensal_dia" | "mensal_pos" | "anual" | "uteis" | "personalizado";
export const PRESETS: Preset[] = ["nao", "diario", "semanal", "mensal_dia", "mensal_pos", "anual", "uteis", "personalizado"];

export function regraDoPreset(p: Preset, inicioISO: string): Recorrencia | null {
  const base = { intervalo: 1, diasSemana: [] as DiaSemana[], mensal: "dia" as const, fim: { tipo: "nunca" } as FimRecorrencia };
  switch (p) {
    case "diario": return { ...base, freq: "DAILY" };
    case "semanal": return { ...base, freq: "WEEKLY", diasSemana: [diaDaSemana(inicioISO)] };
    case "mensal_dia": return { ...base, freq: "MONTHLY" };
    case "mensal_pos": return { ...base, freq: "MONTHLY", mensal: "posicao" };
    case "anual": return { ...base, freq: "YEARLY" };
    case "uteis": return { ...base, freq: "WEEKLY", diasSemana: [...UTEIS] };
    default: return null;
  }
}

export function rotuloPreset(p: Preset, inicioISO: string): string {
  switch (p) {
    case "nao": return "Não se repete";
    case "diario": return "Todos os dias";
    case "semanal": return `Semanal: cada ${DIAS_LONGO[diaDaSemana(inicioISO)]}`;
    case "mensal_dia": return `Mensal: no dia ${diaDoMes(inicioISO)}`;
    case "mensal_pos": { const o = ordinal(inicioISO); return `Mensal: ${o.artigo} ${o.texto}`; }
    case "anual": return `Anual: em ${diaDoMes(inicioISO)} de ${nomeMes(inicioISO)}`;
    case "uteis": return "Todos os dias úteis (segunda a sexta)";
    case "personalizado": return "Personalizado...";
  }
}

export function identificarPreset(r: Recorrencia | null, inicioISO: string): Preset {
  if (!r) return "nao";
  const alvo = paraRRule(r, inicioISO, true);
  return PRESETS.find((p) => {
    const rp = regraDoPreset(p, inicioISO);
    return rp !== null && paraRRule(rp, inicioISO, true) === alvo;
  }) ?? "personalizado";
}

export function descrever(r: Recorrencia, inicioISO: string): string {
  const plural: Record<Freq, string> = { DAILY: "dias", WEEKLY: "semanas", MONTHLY: "meses", YEARLY: "anos" };
  const sozinho: Record<Freq, string> = { DAILY: "Todos os dias", WEEKLY: "Semanal", MONTHLY: "Mensal", YEARLY: "Anual" };
  let txt = r.intervalo > 1 ? `A cada ${r.intervalo} ${plural[r.freq]}` : sozinho[r.freq];
  if (r.freq === "WEEKLY") {
    const dias = r.diasSemana.length ? r.diasSemana : [diaDaSemana(inicioISO)];
    const ordenados = DIAS.filter((d) => dias.includes(d));
    txt = r.intervalo === 1 && ordenados.join() === UTEIS.join()
      ? "Todos os dias úteis"
      : `${txt}: ${ordenados.map((d) => DIAS_CURTO[d]).join(", ")}`;
  }
  if (r.freq === "MONTHLY") {
    const o = ordinal(inicioISO);
    txt += r.mensal === "posicao" ? ` ${o.artigo} ${o.texto}` : ` no dia ${diaDoMes(inicioISO)}`;
  }
  if (r.freq === "YEARLY") txt += ` em ${diaDoMes(inicioISO)} de ${nomeMes(inicioISO)}`;
  if (r.fim.tipo === "data") txt += ` · até ${dataBr(r.fim.data)}`;
  if (r.fim.tipo === "vezes") txt += ` · ${r.fim.n} ${r.fim.n === 1 ? "vez" : "vezes"}`;
  return txt;
}

/** "Este e os seguintes": a série antiga passa a terminar no dia anterior à ocorrência (tira COUNT/UNTIL). */
export function encerrarAntesDe(linha: string, ocorrenciaISO: string, diaInteiro: boolean): string {
  const partes = linha.trim().replace(/^RRULE:/i, "").split(";").filter((p) => p && !/^(COUNT|UNTIL)=/i.test(p));
  partes.push(`UNTIL=${untilDe(somarDias(ocorrenciaISO, -1), diaInteiro)}`);
  return `RRULE:${partes.join(";")}`;
}
