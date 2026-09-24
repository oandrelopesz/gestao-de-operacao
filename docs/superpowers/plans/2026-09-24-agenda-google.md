# Agenda (Google Calendar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba `/agenda` que mostra e edita a agenda real do Google (`contato@andrelopes.digital`) pela API do Google Calendar — visões Dia/Semana/Mês, criar/editar/excluir com repetição, participantes, Meet e notificações.

**Architecture:** O navegador chama a Calendar API v3 direto, com o access token que já vem de `getAccessToken()` (`src/lib/googleDrive.ts` → edge function `google-token`). Regras puras (RRULE e evento⇄formulário) ficam em libs sem dependências testadas com `node --test`; `googleCalendar.ts` é o cliente HTTP; `agendaSerie.ts` orquestra "só este / seguintes / todos"; a tela usa FullCalendar v6 carregado só no cliente.

**Tech Stack:** React 19, TanStack Router (file routes), shadcn/ui, FullCalendar 6 (`@fullcalendar/react`, `core`, `daygrid`, `timegrid`, `interaction`), sonner, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-24-agenda-google-design.md`

## Global Constraints

- Conta Google: `contato@andrelopes.digital`; projeto Cloud `gestao-de-operacao-509002` (app OAuth interno).
- Escopos: `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/calendar.calendarlist.readonly`.
- Fuso: `America/Sao_Paulo` (UTC-3 fixo). Eventos com horário vão com `timeZone: "America/Sao_Paulo"`.
- Sem tabelas novas e sem edge functions novas.
- Libs testadas (`recorrencia.ts`, `agendaEvento.ts`) não importam nada com `@/`; entre si importam com extensão `.ts`.
- Textos da interface em português; menu "Agenda" no grupo Operação logo após Demandas.
- Arquivos do repo usam CRLF em parte; não reformatar arquivos inteiros.
- Testes: `npm test` (= `node --test src/lib/*.test.ts`). Build: `npm run build`.

---

### Task 1: Regras de repetição (RRULE)

**Files:**
- Create: `src/lib/recorrencia.ts`
- Test: `src/lib/recorrencia.test.ts`

**Interfaces:**
- Produces: `type Freq`, `type DiaSemana`, `type FimRecorrencia`, `interface Recorrencia { freq; intervalo; diasSemana; mensal: "dia"|"posicao"; fim }`, `DIAS`, `DIAS_CURTO`, `DIAS_LETRA`, `somarDias(iso, n)`, `diferencaDias(de, ate)`, `diaDaSemana(iso)`, `posicaoNoMes(iso)`, `paraRRule(r, inicioISO, diaInteiro): string`, `deRRule(linha): Recorrencia | null`, `type Preset`, `PRESETS`, `regraDoPreset(p, inicioISO)`, `rotuloPreset(p, inicioISO)`, `identificarPreset(r, inicioISO): Preset`, `descrever(r, inicioISO)`, `encerrarAntesDe(linha, ocorrenciaISO, diaInteiro)`.

- [ ] **Step 1: Write the failing test** — `src/lib/recorrencia.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  paraRRule, deRRule, regraDoPreset, identificarPreset, rotuloPreset, descrever, encerrarAntesDe,
  posicaoNoMes, somarDias, diferencaDias, type Recorrencia,
} from "./recorrencia.ts";

// 24/09/2026 é quinta-feira (4ª quinta do mês); 30/09/2026 é a 5ª quarta (a última)
const QUI = "2026-09-24";

test("presets viram as RRULEs do Google", () => {
  assert.equal(paraRRule(regraDoPreset("diario", QUI)!, QUI, false), "RRULE:FREQ=DAILY");
  assert.equal(paraRRule(regraDoPreset("semanal", QUI)!, QUI, false), "RRULE:FREQ=WEEKLY;BYDAY=TH");
  assert.equal(paraRRule(regraDoPreset("mensal_dia", QUI)!, QUI, false), "RRULE:FREQ=MONTHLY;BYMONTHDAY=24");
  assert.equal(paraRRule(regraDoPreset("mensal_pos", QUI)!, QUI, false), "RRULE:FREQ=MONTHLY;BYDAY=4TH");
  assert.equal(paraRRule(regraDoPreset("anual", QUI)!, QUI, false), "RRULE:FREQ=YEARLY");
  assert.equal(paraRRule(regraDoPreset("uteis", QUI)!, QUI, false), "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
  assert.equal(regraDoPreset("nao", QUI), null);
});

test("5ª ocorrência do dia no mês vira 'última' (-1)", () => {
  assert.equal(posicaoNoMes("2026-09-30"), -1);
  assert.equal(paraRRule(regraDoPreset("mensal_pos", "2026-09-30")!, "2026-09-30", false), "RRULE:FREQ=MONTHLY;BYDAY=-1WE");
});

test("personalizado: intervalo, dias ordenados e fim", () => {
  const r: Recorrencia = { freq: "WEEKLY", intervalo: 2, diasSemana: ["FR", "MO"], mensal: "dia", fim: { tipo: "vezes", n: 10 } };
  assert.equal(paraRRule(r, QUI, false), "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=10");
});

test("UNTIL: dia inteiro usa data; com horário usa o fim do dia de Brasília em UTC", () => {
  const r: Recorrencia = { freq: "DAILY", intervalo: 1, diasSemana: [], mensal: "dia", fim: { tipo: "data", data: "2026-10-31" } };
  assert.equal(paraRRule(r, QUI, true), "RRULE:FREQ=DAILY;UNTIL=20261031");
  assert.equal(paraRRule(r, QUI, false), "RRULE:FREQ=DAILY;UNTIL=20261101T025959Z");
});

test("deRRule lê o que paraRRule escreve (ida e volta)", () => {
  const casos: Recorrencia[] = [
    { freq: "WEEKLY", intervalo: 2, diasSemana: ["MO", "FR"], mensal: "dia", fim: { tipo: "vezes", n: 10 } },
    { freq: "MONTHLY", intervalo: 1, diasSemana: [], mensal: "posicao", fim: { tipo: "nunca" } },
    { freq: "DAILY", intervalo: 3, diasSemana: [], mensal: "dia", fim: { tipo: "data", data: "2026-10-31" } },
  ];
  for (const r of casos) for (const diaInteiro of [true, false]) assert.deepEqual(deRRule(paraRRule(r, QUI, diaInteiro)), r);
});

test("deRRule: UNTIL em UTC de madrugada é o dia anterior em Brasília", () => {
  assert.deepEqual(deRRule("RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261030T025959Z")?.fim, { tipo: "data", data: "2026-10-29" });
  assert.deepEqual(deRRule("RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261030T150000Z")?.fim, { tipo: "data", data: "2026-10-30" });
});

test("deRRule: dias úteis gravados como DAILY viram WEEKLY", () => {
  assert.deepEqual(deRRule("RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"), regraDoPreset("uteis", QUI));
});

test("deRRule recusa o que o formulário não edita", () => {
  assert.equal(deRRule("RRULE:FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=-1"), null);
  assert.equal(deRRule("RRULE:FREQ=YEARLY;BYMONTH=3,9"), null);
  assert.equal(deRRule("RRULE:FREQ=HOURLY"), null);
  assert.equal(deRRule("RRULE:FREQ=DAILY;INTERVAL=2;BYDAY=MO,WE"), null);
  assert.equal(deRRule("EXDATE:20260101"), null);
});

test("identificarPreset", () => {
  assert.equal(identificarPreset(null, QUI), "nao");
  assert.equal(identificarPreset(deRRule("RRULE:FREQ=WEEKLY;BYDAY=TH"), QUI), "semanal");
  assert.equal(identificarPreset(deRRule("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"), QUI), "uteis");
  assert.equal(identificarPreset(deRRule("RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=5"), QUI), "personalizado");
});

test("rótulos em português", () => {
  assert.equal(rotuloPreset("semanal", QUI), "Semanal: cada quinta-feira");
  assert.equal(rotuloPreset("mensal_pos", QUI), "Mensal: na quarta quinta-feira");
  assert.equal(rotuloPreset("mensal_pos", "2026-09-26"), "Mensal: no quarto sábado");
  assert.equal(rotuloPreset("anual", QUI), "Anual: em 24 de setembro");
});

test("descrever", () => {
  assert.equal(descrever(deRRule("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=10")!, QUI), "A cada 2 semanas: seg, sex · 10 vezes");
  assert.equal(descrever(deRRule("RRULE:FREQ=MONTHLY;BYMONTHDAY=24;UNTIL=20261231")!, QUI), "Mensal no dia 24 · até 31/12/2026");
  assert.equal(descrever(regraDoPreset("uteis", QUI)!, QUI), "Todos os dias úteis");
});

test("encerrarAntesDe troca COUNT/UNTIL pelo dia anterior à ocorrência", () => {
  assert.equal(encerrarAntesDe("RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=10", "2026-10-08", false), "RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261008T025959Z");
  assert.equal(encerrarAntesDe("RRULE:FREQ=DAILY;UNTIL=20261231", "2026-10-08", true), "RRULE:FREQ=DAILY;UNTIL=20261007");
});

test("datas", () => {
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(diferencaDias("2026-09-24", "2026-10-01"), 7);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/recorrencia.test.ts`
Expected: FAIL — `Cannot find module './recorrencia.ts'`.

- [ ] **Step 3: Write the implementation** — `src/lib/recorrencia.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/recorrencia.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recorrencia.ts src/lib/recorrencia.test.ts
git commit -m "Agenda: regras de repetição (RRULE do Google) com testes"
```

---

### Task 2: Evento do Google ⇄ formulário

**Files:**
- Create: `src/lib/agendaEvento.ts`
- Test: `src/lib/agendaEvento.test.ts`

**Interfaces:**
- Consumes: `deRRule`, `paraRRule`, `somarDias`, `diferencaDias`, `identificarPreset`, `regraDoPreset`, `Recorrencia` de `./recorrencia.ts`.
- Produces: `FUSO`, `MAX_LEMBRETES`, `MAX_MINUTOS_LEMBRETE`, `FATOR_UNIDADE`, `type Unidade`, `type MetodoLembrete`, `interface Lembrete { metodo; minutos; unidade? }`, `LEMBRETE_PADRAO`, `interface Horario`, `interface Participante`, `interface EventoGoogle`, `interface FormEvento`, `dataLocal(d)`, `horaLocal(d)`, `dataDe(h: Horario)`, `novoForm(inicio, fim, diaInteiro, calendarId)`, `eventoParaForm(ev, calendarId, recurrence?)`, `linhasRecorrencia(f)`, `formParaEvento(f, original?, requestId?)`, `moverInicio(f, data, hora)`, `ancorarNaSerie(f, inicioSerieISO, ocorrenciaISO)`, `temParticipantes(ev)`, `emailValido(s)`, `validarForm(f): string | null`, `paraUnidade(min)`, `deUnidade(valor, unidade)`, `removerNulos(obj)`.

- [ ] **Step 1: Write the failing test** — `src/lib/agendaEvento.test.ts`:

```ts
process.env.TZ = "America/Sao_Paulo";
import test from "node:test";
import assert from "node:assert/strict";
import {
  novoForm, formParaEvento, eventoParaForm, moverInicio, ancorarNaSerie, validarForm, paraUnidade, deUnidade,
  removerNulos, dataDe, type EventoGoogle,
} from "./agendaEvento.ts";
import { regraDoPreset } from "./recorrencia.ts";

const BASE = novoForm(new Date(2026, 8, 24, 10, 0), new Date(2026, 8, 24, 11, 0), false, "primary");

test("novoForm: horário vem da seleção, 10 min de notificação", () => {
  assert.equal(BASE.inicioData, "2026-09-24");
  assert.equal(BASE.inicioHora, "10:00");
  assert.equal(BASE.fimHora, "11:00");
  assert.deepEqual(BASE.lembretes, [{ metodo: "popup", minutos: 10 }]);
  assert.equal(BASE.lembretesPadrao, false);
});

test("novoForm dia inteiro: fim exclusivo do FullCalendar vira o último dia", () => {
  const f = novoForm(new Date(2026, 8, 24), new Date(2026, 8, 26), true, "primary");
  assert.equal(f.inicioData, "2026-09-24");
  assert.equal(f.fimData, "2026-09-25");
});

test("formParaEvento: horário com fuso, Meet novo, lembretes, participantes", () => {
  const corpo = formParaEvento({ ...BASE, titulo: "  Call  ", meet: true, participantes: ["a@b.com"] }, null, "req-1");
  assert.equal(corpo.summary, "Call");
  assert.deepEqual(corpo.start, { date: null, dateTime: "2026-09-24T10:00:00", timeZone: "America/Sao_Paulo" });
  assert.deepEqual(corpo.conferenceData, { createRequest: { requestId: "req-1", conferenceSolutionKey: { type: "hangoutsMeet" } } });
  assert.deepEqual(corpo.reminders, { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] });
  assert.deepEqual(corpo.attendees, [{ email: "a@b.com" }]);
  assert.deepEqual(corpo.recurrence, []);
});

test("formParaEvento dia inteiro: end.date exclusivo", () => {
  const corpo = formParaEvento({ ...BASE, diaInteiro: true, fimData: "2026-09-25" });
  assert.deepEqual(corpo.start, { date: "2026-09-24", dateTime: null, timeZone: null });
  assert.deepEqual(corpo.end, { date: "2026-09-26", dateTime: null, timeZone: null });
});

test("Meet: mantém o existente, remove quando desligado", () => {
  assert.equal("conferenceData" in formParaEvento({ ...BASE, meet: true, linkMeet: "https://meet.google.com/x" }), false);
  assert.equal(formParaEvento({ ...BASE, meet: false, linkMeet: "https://meet.google.com/x" }).conferenceData, null);
});

test("eventoParaForm ⇄ formParaEvento preserva respostas dos participantes e a regra", () => {
  const ev: EventoGoogle = {
    id: "e1", summary: "Reunião",
    start: { dateTime: "2026-09-24T10:00:00-03:00" }, end: { dateTime: "2026-09-24T11:30:00-03:00" },
    recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TH", "EXDATE;TZID=America/Sao_Paulo:20261001T100000"],
    attendees: [
      { email: "eu@x.com", self: true, organizer: true, responseStatus: "accepted" },
      { email: "Cliente@Y.com", responseStatus: "accepted" },
    ],
    hangoutLink: "https://meet.google.com/abc",
    reminders: { useDefault: true },
  };
  const f = eventoParaForm(ev, "primary");
  assert.equal(f.fimHora, "11:30");
  assert.deepEqual(f.participantes, ["Cliente@Y.com"]);
  assert.equal(f.recorrencia?.freq, "WEEKLY");
  assert.deepEqual(f.outrasLinhas, ["EXDATE;TZID=America/Sao_Paulo:20261001T100000"]);
  assert.equal(f.meet, true);
  assert.equal(f.linkMeet, "https://meet.google.com/abc");
  assert.equal(f.lembretesPadrao, true);

  const corpo = formParaEvento({ ...f, participantes: ["cliente@y.com", "novo@z.com"] }, ev);
  assert.deepEqual(corpo.attendees, [
    { email: "Cliente@Y.com", responseStatus: "accepted" },
    { email: "novo@z.com" },
    { email: "eu@x.com", self: true, organizer: true, responseStatus: "accepted" },
  ]);
  assert.deepEqual(corpo.recurrence, ["RRULE:FREQ=WEEKLY;BYDAY=TH", "EXDATE;TZID=America/Sao_Paulo:20261001T100000"]);
  assert.deepEqual(corpo.reminders, { useDefault: true });
});

test("regra que o formulário não edita volta intacta", () => {
  const ev: EventoGoogle = { start: { date: "2026-09-24" }, end: { date: "2026-09-25" }, recurrence: ["RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1"] };
  const f = eventoParaForm(ev, "primary");
  assert.equal(f.recorrencia, null);
  assert.equal(f.regraOriginal, "RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1");
  assert.equal(f.fimData, "2026-09-24");
  assert.deepEqual(formParaEvento(f, ev).recurrence, ["RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1"]);
});

test("recorrência da série vem do mestre quando a ocorrência não tem", () => {
  const inst: EventoGoogle = { start: { dateTime: "2026-10-01T10:00:00-03:00" }, end: { dateTime: "2026-10-01T11:00:00-03:00" }, recurringEventId: "m" };
  assert.equal(eventoParaForm(inst, "primary", ["RRULE:FREQ=DAILY"]).recorrencia?.freq, "DAILY");
});

test("moverInicio mantém a duração e o preset semanal acompanha o dia", () => {
  const f = { ...BASE, fimHora: "11:30", recorrencia: regraDoPreset("semanal", "2026-09-24") };
  const g = moverInicio(f, "2026-09-25", "23:00");
  assert.equal(g.fimData, "2026-09-26");
  assert.equal(g.fimHora, "00:30");
  assert.deepEqual(g.recorrencia?.diasSemana, ["FR"]);
});

test("ancorarNaSerie aplica o deslocamento da ocorrência no início da série", () => {
  const f = { ...BASE, inicioData: "2026-10-09", fimData: "2026-10-09" }; // ocorrência de 08/10 movida 1 dia
  const g = ancorarNaSerie(f, "2026-09-24", "2026-10-08");
  assert.equal(g.inicioData, "2026-09-25");
  assert.equal(g.fimData, "2026-09-25");
});

test("validarForm", () => {
  assert.equal(validarForm(BASE), "Dê um nome ao evento");
  const ok = { ...BASE, titulo: "X" };
  assert.equal(validarForm(ok), null);
  assert.equal(validarForm({ ...ok, fimHora: "09:00" }), "O fim precisa ser depois do início");
  assert.equal(validarForm({ ...ok, participantes: ["sem-arroba"] }), "E-mail inválido: sem-arroba");
  assert.equal(validarForm({ ...ok, lembretes: [{ metodo: "popup", minutos: 50_000 }] }), "Notificação de no máximo 4 semanas antes");
  assert.equal(
    validarForm({ ...ok, recorrencia: { freq: "DAILY", intervalo: 1, diasSemana: [], mensal: "dia", fim: { tipo: "data", data: "2026-09-01" } } }),
    "A repetição termina antes do início do evento",
  );
});

test("unidades de notificação", () => {
  assert.deepEqual(paraUnidade(10), { valor: 10, unidade: "minutos" });
  assert.deepEqual(paraUnidade(120), { valor: 2, unidade: "horas" });
  assert.deepEqual(paraUnidade(1440), { valor: 1, unidade: "dias" });
  assert.deepEqual(paraUnidade(20160), { valor: 2, unidade: "semanas" });
  assert.deepEqual(paraUnidade(0), { valor: 0, unidade: "minutos" });
  assert.equal(deUnidade(3, "horas"), 180);
});

test("dataDe e removerNulos", () => {
  assert.equal(dataDe({ date: "2026-09-24" }), "2026-09-24");
  assert.equal(dataDe({ dateTime: "2026-09-25T01:00:00Z" }), "2026-09-24");
  assert.deepEqual(removerNulos({ a: 1, b: null, c: { d: null, e: "x" }, f: [{ g: null, h: 2 }] }), { a: 1, c: { e: "x" }, f: [{ h: 2 }] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/agendaEvento.test.ts`
Expected: FAIL — `Cannot find module './agendaEvento.ts'`.

- [ ] **Step 3: Write the implementation** — `src/lib/agendaEvento.ts`:

```ts
// Evento do Google Calendar ⇄ formulário da Agenda. Sem dependências (roda no `node --test`).
import {
  deRRule, diferencaDias, identificarPreset, paraRRule, regraDoPreset, somarDias, type Recorrencia,
} from "./recorrencia.ts";

export const FUSO = "America/Sao_Paulo";
export const MAX_LEMBRETES = 5;
/** O Google aceita notificação até 4 semanas antes. */
export const MAX_MINUTOS_LEMBRETE = 40_320;

export type Unidade = "minutos" | "horas" | "dias" | "semanas";
export const FATOR_UNIDADE: Record<Unidade, number> = { minutos: 1, horas: 60, dias: 1440, semanas: 10_080 };

export type MetodoLembrete = "popup" | "email";
/** `unidade` é só da tela (como a pessoa digitou); o Google recebe minutos. */
export interface Lembrete { metodo: MetodoLembrete; minutos: number; unidade?: Unidade }
export const LEMBRETE_PADRAO: Lembrete = { metodo: "popup", minutos: 10 };

export interface Horario { date?: string | null; dateTime?: string | null; timeZone?: string | null }
export interface Participante {
  email: string; responseStatus?: string; self?: boolean; organizer?: boolean; displayName?: string; optional?: boolean;
}
export interface EventoGoogle {
  id?: string;
  etag?: string;
  status?: string;
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: Horario;
  end?: Horario;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: Horario;
  attendees?: Participante[];
  organizer?: { email?: string; self?: boolean };
  guestsCanModify?: boolean;
  hangoutLink?: string;
  conferenceData?: Record<string, unknown> | null;
  reminders?: { useDefault: boolean; overrides?: { method: MetodoLembrete; minutes: number }[] };
}

export interface FormEvento {
  titulo: string;
  calendarId: string;
  diaInteiro: boolean;
  inicioData: string; // YYYY-MM-DD
  inicioHora: string; // HH:mm
  fimData: string; // último dia (inclusivo) no dia inteiro
  fimHora: string;
  recorrencia: Recorrencia | null;
  /** RRULE que o formulário não sabe editar: volta intacta para o Google. */
  regraOriginal: string | null;
  /** EXDATE/RDATE da série, preservadas. */
  outrasLinhas: string[];
  participantes: string[];
  meet: boolean;
  linkMeet: string | null;
  lembretesPadrao: boolean;
  lembretes: Lembrete[];
  descricao: string;
  local: string;
}

const dois = (n: number) => String(n).padStart(2, "0");
/** Date → "YYYY-MM-DD" no fuso do navegador (o sistema é usado em Brasília). */
export function dataLocal(d: Date): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}
export function horaLocal(d: Date): string {
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}
/** Dia (YYYY-MM-DD) de um horário do Google. */
export function dataDe(h: Horario): string {
  return h.date ? h.date : dataLocal(new Date(h.dateTime as string));
}

// Minutos desde 2000-01-01 00:00 (sem fuso: só para somar durações)
function minutosAbs(data: string, hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return diferencaDias("2000-01-01", data) * 1440 + h * 60 + m;
}
function deMinutosAbs(n: number): { data: string; hora: string } {
  const dias = Math.floor(n / 1440);
  const resto = n - dias * 1440;
  return { data: somarDias("2000-01-01", dias), hora: `${dois(Math.floor(resto / 60))}:${dois(resto % 60)}` };
}

export function novoForm(inicio: Date, fim: Date, diaInteiro: boolean, calendarId: string): FormEvento {
  const inicioData = dataLocal(inicio);
  // Na seleção de dia inteiro o FullCalendar entrega o fim exclusivo (dia seguinte)
  const fimData = diaInteiro ? somarDias(dataLocal(fim), -1) : dataLocal(fim);
  return {
    titulo: "",
    calendarId,
    diaInteiro,
    inicioData,
    inicioHora: diaInteiro ? "09:00" : horaLocal(inicio),
    fimData: fimData < inicioData ? inicioData : fimData,
    fimHora: diaInteiro ? "10:00" : horaLocal(fim),
    recorrencia: null,
    regraOriginal: null,
    outrasLinhas: [],
    participantes: [],
    meet: false,
    linkMeet: null,
    lembretesPadrao: false,
    lembretes: [{ ...LEMBRETE_PADRAO }],
    descricao: "",
    local: "",
  };
}

/** `recurrence`: a da série (mestre) quando `ev` é uma ocorrência. */
export function eventoParaForm(ev: EventoGoogle, calendarId: string, recurrence?: string[]): FormEvento {
  const diaInteiro = !!ev.start?.date;
  const ini = diaInteiro ? null : new Date(ev.start?.dateTime as string);
  const fim = diaInteiro ? null : new Date(ev.end?.dateTime as string);
  const linhas = recurrence ?? ev.recurrence ?? [];
  const rrule = linhas.find((l) => /^RRULE:/i.test(l)) ?? null;
  const rec = rrule ? deRRule(rrule) : null;
  const entradas = (ev.conferenceData?.entryPoints ?? []) as { entryPointType: string; uri: string }[];
  const meet = ev.hangoutLink ?? entradas.find((e) => e.entryPointType === "video")?.uri ?? null;
  return {
    titulo: ev.summary ?? "",
    calendarId,
    diaInteiro,
    inicioData: diaInteiro ? (ev.start?.date as string) : dataLocal(ini as Date),
    inicioHora: diaInteiro ? "09:00" : horaLocal(ini as Date),
    fimData: diaInteiro ? somarDias(ev.end?.date as string, -1) : dataLocal(fim as Date),
    fimHora: diaInteiro ? "10:00" : horaLocal(fim as Date),
    recorrencia: rec,
    regraOriginal: rrule && !rec ? rrule : null,
    outrasLinhas: linhas.filter((l) => !/^RRULE:/i.test(l)),
    participantes: (ev.attendees ?? []).filter((a) => !a.self).map((a) => a.email),
    meet: !!meet,
    linkMeet: meet,
    lembretesPadrao: ev.reminders?.useDefault ?? true,
    lembretes: (ev.reminders?.overrides ?? []).map((o) => ({ metodo: o.method, minutos: o.minutes })),
    descricao: ev.description ?? "",
    local: ev.location ?? "",
  };
}

export function linhasRecorrencia(f: FormEvento): string[] {
  const regra = f.recorrencia ? paraRRule(f.recorrencia, f.inicioData, f.diaInteiro) : f.regraOriginal;
  return regra ? [regra, ...f.outrasLinhas] : [];
}

/** Mantém os objetos originais (com a resposta de cada um) e o próprio usuário na lista. */
function participantesDoCorpo(emails: string[], originais: Participante[]): Participante[] {
  const porEmail = new Map(originais.map((a) => [a.email.toLowerCase(), a]));
  const lista = emails.map((e) => porEmail.get(e.toLowerCase()) ?? { email: e });
  const eu = originais.find((a) => a.self);
  if (eu && !lista.some((a) => a.email.toLowerCase() === eu.email.toLowerCase())) lista.push(eu);
  return lista;
}

function novoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Corpo para insert/patch. Os `null` limpam o campo oposto (dia inteiro ⇄ horário) num patch. */
export function formParaEvento(f: FormEvento, original: EventoGoogle | null = null, requestId: string = novoId()): EventoGoogle {
  const corpo: EventoGoogle = {
    summary: f.titulo.trim(),
    description: f.descricao,
    location: f.local.trim(),
    start: f.diaInteiro
      ? { date: f.inicioData, dateTime: null, timeZone: null }
      : { date: null, dateTime: `${f.inicioData}T${f.inicioHora}:00`, timeZone: FUSO },
    end: f.diaInteiro
      ? { date: somarDias(f.fimData, 1), dateTime: null, timeZone: null }
      : { date: null, dateTime: `${f.fimData}T${f.fimHora}:00`, timeZone: FUSO },
    recurrence: linhasRecorrencia(f),
    attendees: participantesDoCorpo(f.participantes, original?.attendees ?? []),
    reminders: f.lembretesPadrao
      ? { useDefault: true }
      : { useDefault: false, overrides: f.lembretes.slice(0, MAX_LEMBRETES).map((l) => ({ method: l.metodo, minutes: l.minutos })) },
  };
  if (f.meet && !f.linkMeet) corpo.conferenceData = { createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } };
  if (!f.meet && f.linkMeet) corpo.conferenceData = null;
  return corpo;
}

/** Muda o início mantendo a duração; repetição de preset (ex.: "toda quinta") acompanha o novo dia. */
export function moverInicio(f: FormEvento, data: string, hora: string): FormEvento {
  let recorrencia = f.recorrencia;
  const preset = identificarPreset(f.recorrencia, f.inicioData);
  if (f.recorrencia && preset !== "personalizado" && preset !== "nao") {
    recorrencia = { ...(regraDoPreset(preset, data) as Recorrencia), fim: f.recorrencia.fim };
  }
  if (f.diaInteiro) {
    const dur = Math.max(0, diferencaDias(f.inicioData, f.fimData));
    return { ...f, recorrencia, inicioData: data, fimData: somarDias(data, dur) };
  }
  const dur = Math.max(0, minutosAbs(f.fimData, f.fimHora) - minutosAbs(f.inicioData, f.inicioHora));
  const fim = deMinutosAbs(minutosAbs(data, hora) + dur);
  return { ...f, recorrencia, inicioData: data, inicioHora: hora, fimData: fim.data, fimHora: fim.hora };
}

/** Editar "todos" a partir de uma ocorrência: o deslocamento de dias feito nela vale para o início da série. */
export function ancorarNaSerie(f: FormEvento, inicioSerieISO: string, ocorrenciaISO: string): FormEvento {
  const desloc = diferencaDias(ocorrenciaISO, f.inicioData);
  const dur = diferencaDias(f.inicioData, f.fimData);
  const inicio = somarDias(inicioSerieISO, desloc);
  return { ...f, inicioData: inicio, fimData: somarDias(inicio, dur) };
}

export function temParticipantes(ev: EventoGoogle): boolean {
  return (ev.attendees ?? []).some((a) => !a.self);
}

export function emailValido(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function validarForm(f: FormEvento): string | null {
  if (!f.titulo.trim()) return "Dê um nome ao evento";
  const fimAntes = f.diaInteiro
    ? f.fimData < f.inicioData
    : `${f.fimData}T${f.fimHora}` <= `${f.inicioData}T${f.inicioHora}`;
  if (fimAntes) return "O fim precisa ser depois do início";
  const invalido = f.participantes.find((e) => !emailValido(e));
  if (invalido) return `E-mail inválido: ${invalido}`;
  if (!f.lembretesPadrao && f.lembretes.some((l) => l.minutos < 0 || l.minutos > MAX_MINUTOS_LEMBRETE)) {
    return "Notificação de no máximo 4 semanas antes";
  }
  const r = f.recorrencia;
  if (r) {
    if (!Number.isInteger(r.intervalo) || r.intervalo < 1) return "O intervalo da repetição precisa ser 1 ou mais";
    if (r.fim.tipo === "data" && r.fim.data < f.inicioData) return "A repetição termina antes do início do evento";
    if (r.fim.tipo === "vezes" && (!Number.isInteger(r.fim.n) || r.fim.n < 1)) return "A repetição precisa de pelo menos 1 ocorrência";
  }
  return null;
}

export function paraUnidade(minutos: number): { valor: number; unidade: Unidade } {
  for (const u of ["semanas", "dias", "horas"] as Unidade[]) {
    if (minutos > 0 && minutos % FATOR_UNIDADE[u] === 0) return { valor: minutos / FATOR_UNIDADE[u], unidade: u };
  }
  return { valor: minutos, unidade: "minutos" };
}
export function deUnidade(valor: number, unidade: Unidade): number {
  return Math.round(valor * FATOR_UNIDADE[unidade]);
}

/** Tira `null` (insert não precisa limpar nada). */
export function removerNulos<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map((x) => removerNulos(x)) as T;
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== null).map(([k, v]) => [k, removerNulos(v)]),
    ) as T;
  }
  return obj;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all suites, including 13 tests in `agendaEvento.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agendaEvento.ts src/lib/agendaEvento.test.ts
git commit -m "Agenda: conversão evento do Google ⇄ formulário com testes"
```

---

### Task 3: Permissões e cliente da Calendar API

**Files:**
- Modify: `src/lib/googleDrive.ts:15` (escopos) e `:77` (`oauthUrl` usa todos) + nova `invalidarTokenGoogle()`
- Modify: `src/components/swipe/SwipeAdminCard.tsx:43` (texto do toast)
- Create: `src/lib/googleCalendar.ts`

**Interfaces:**
- Consumes: `getAccessToken`, `statusDoDrive` de `@/lib/googleDrive`; `EventoGoogle`, `Horario`, `removerNulos` de `@/lib/agendaEvento`.
- Produces: `CALENDAR_SCOPES`, `GOOGLE_SCOPES`, `invalidarTokenGoogle()` (googleDrive); `AgendaSemPermissaoError`, `AgendaConflitoError`, `interface AgendaGoogle`, `podeEscrever(a)`, `listarAgendas()`, `listarEventos(calendarId, inicio: Date, fim: Date)`, `obterEvento(calendarId, id)`, `criarEvento(calendarId, corpo, enviar)`, `atualizarEvento(calendarId, id, corpo, enviar, etag?)`, `excluirEvento(calendarId, id, enviar)`, `contarOcorrenciasAntes(calendarId, mestreId, horario: Horario)`, `temPermissaoAgenda()`.

- [ ] **Step 1: Escopos no `googleDrive.ts`** — trocar a linha 15 e o `scope` do `oauthUrl`, e acrescentar `invalidarTokenGoogle` logo depois de `let statusCache`:

```ts
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
/** Tudo que a conexão do Google pede: Drive (swipe file) + Agenda. */
export const GOOGLE_SCOPES = [DRIVE_SCOPE, ...CALENDAR_SCOPES];
```

```ts
  u.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
```

```ts
/** Força buscar um access token novo na próxima chamada (ex.: o Google respondeu 401). */
export function invalidarTokenGoogle(): void {
  tokenCache = null;
}
```

- [ ] **Step 2: Toast do Admin** — em `SwipeAdminCard.tsx` trocar `toast.success("Google Drive conectado");` por `toast.success("Google conectado (Drive e Agenda)");`.

- [ ] **Step 3: Cliente da API** — `src/lib/googleCalendar.ts`:

```ts
/**
 * Google Calendar API v3 no navegador, com o mesmo access token do Drive (edge function `google-token`).
 * Sem cópia no banco: o Google é a fonte da verdade.
 */
import { getAccessToken, invalidarTokenGoogle, statusDoDrive } from "@/lib/googleDrive";
import { removerNulos, type EventoGoogle, type Horario } from "@/lib/agendaEvento";

const API = "https://www.googleapis.com/calendar/v3";
const enc = encodeURIComponent;

/** A conexão do Google ainda não tem a permissão da Agenda (reconectar). */
export class AgendaSemPermissaoError extends Error {}
/** O evento mudou no Google depois de aberto (etag diferente). */
export class AgendaConflitoError extends Error {}

async function gcal<T>(path: string, init: RequestInit = {}, repetir = true): Promise<T> {
  const token = await getAccessToken();
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (r.status === 401 && repetir) {
    invalidarTokenGoogle();
    return gcal<T>(path, init, false);
  }
  if (r.status === 204) return undefined as T;
  const data = await r.json().catch(() => ({}));
  if (r.ok) return data as T;
  // Excluir algo que já não existe: o objetivo foi atingido
  if (r.status === 410 && init.method === "DELETE") return undefined as T;
  const msg: string = data?.error?.message ?? "";
  const motivo: string = data?.error?.errors?.[0]?.reason ?? "";
  if (r.status === 403 && (motivo === "insufficientPermissions" || /insufficient authentication scopes/i.test(msg))) {
    throw new AgendaSemPermissaoError("A conexão com o Google ainda não tem permissão para a Agenda.");
  }
  if (r.status === 403 && (motivo === "accessNotConfigured" || /has not been used|is disabled/i.test(msg))) {
    throw new Error("A API do Google Agenda não está ativada no projeto do Google Cloud.");
  }
  if (r.status === 412) {
    throw new AgendaConflitoError("Este evento foi alterado no Google enquanto você editava. A agenda foi recarregada — tente de novo.");
  }
  throw new Error(msg || `Google Agenda respondeu ${r.status}`);
}

export interface AgendaGoogle {
  id: string;
  summary: string;
  summaryOverride?: string;
  backgroundColor: string;
  foregroundColor: string;
  primary?: boolean;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
}

export function podeEscrever(a: AgendaGoogle): boolean {
  return a.accessRole === "owner" || a.accessRole === "writer";
}

export async function listarAgendas(): Promise<AgendaGoogle[]> {
  const todas: AgendaGoogle[] = [];
  let pagina: string | undefined;
  do {
    const q = new URLSearchParams({ maxResults: "250" });
    if (pagina) q.set("pageToken", pagina);
    const d = await gcal<{ items?: AgendaGoogle[]; nextPageToken?: string }>(`/users/me/calendarList?${q}`);
    todas.push(...(d.items ?? []));
    pagina = d.nextPageToken;
  } while (pagina);
  // Principal primeiro; depois as que dá para escrever; depois por nome
  return todas.sort((a, b) =>
    Number(!!b.primary) - Number(!!a.primary)
    || Number(podeEscrever(b)) - Number(podeEscrever(a))
    || (a.summaryOverride ?? a.summary).localeCompare(b.summaryOverride ?? b.summary, "pt-BR"));
}

/** Ocorrências (séries já expandidas) que tocam o período. */
export async function listarEventos(calendarId: string, inicio: Date, fim: Date): Promise<EventoGoogle[]> {
  const eventos: EventoGoogle[] = [];
  let pagina: string | undefined;
  do {
    const q = new URLSearchParams({
      singleEvents: "true", orderBy: "startTime", maxResults: "2500",
      timeMin: inicio.toISOString(), timeMax: fim.toISOString(),
    });
    if (pagina) q.set("pageToken", pagina);
    const d = await gcal<{ items?: EventoGoogle[]; nextPageToken?: string }>(`/calendars/${enc(calendarId)}/events?${q}`);
    eventos.push(...(d.items ?? []));
    pagina = d.nextPageToken;
  } while (pagina);
  return eventos.filter((e) => e.status !== "cancelled");
}

export function obterEvento(calendarId: string, id: string): Promise<EventoGoogle> {
  return gcal<EventoGoogle>(`/calendars/${enc(calendarId)}/events/${enc(id)}`);
}

const params = (enviar: boolean) => `sendUpdates=${enviar ? "all" : "none"}&conferenceDataVersion=1`;

export function criarEvento(calendarId: string, corpo: EventoGoogle, enviar: boolean): Promise<EventoGoogle> {
  return gcal<EventoGoogle>(`/calendars/${enc(calendarId)}/events?${params(enviar)}`, {
    method: "POST",
    body: JSON.stringify(removerNulos(corpo)),
  });
}

export function atualizarEvento(calendarId: string, id: string, corpo: EventoGoogle, enviar: boolean, etag?: string): Promise<EventoGoogle> {
  return gcal<EventoGoogle>(`/calendars/${enc(calendarId)}/events/${enc(id)}?${params(enviar)}`, {
    method: "PATCH",
    headers: etag ? { "If-Match": etag } : {},
    body: JSON.stringify(corpo),
  });
}

export async function excluirEvento(calendarId: string, id: string, enviar: boolean): Promise<void> {
  await gcal<void>(`/calendars/${enc(calendarId)}/events/${enc(id)}?sendUpdates=${enviar ? "all" : "none"}`, { method: "DELETE" });
}

/** Quantas ocorrências da série vêm antes deste horário (inclui as excluídas: o COUNT conta todas). */
export async function contarOcorrenciasAntes(calendarId: string, mestreId: string, horario: Horario): Promise<number> {
  const limite = horario.dateTime ?? `${horario.date}T00:00:00-03:00`;
  let total = 0;
  let pagina: string | undefined;
  do {
    const q = new URLSearchParams({ timeMax: new Date(limite).toISOString(), showDeleted: "true", maxResults: "2500" });
    if (pagina) q.set("pageToken", pagina);
    const d = await gcal<{ items?: unknown[]; nextPageToken?: string }>(
      `/calendars/${enc(calendarId)}/events/${enc(mestreId)}/instances?${q}`,
    );
    total += d.items?.length ?? 0;
    pagina = d.nextPageToken;
  } while (pagina);
  return total;
}

/** A conexão salva já tem a permissão de eventos da Agenda? */
export async function temPermissaoAgenda(): Promise<boolean> {
  const st = await statusDoDrive(true);
  return (st.scope ?? "").split(/\s+/).includes("https://www.googleapis.com/auth/calendar.events");
}
```

- [ ] **Step 4: Verificar tipos e build**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "googleCalendar|googleDrive|SwipeAdminCard"` → Expected: nenhuma linha.
Run: `npm run build` → Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/googleDrive.ts src/lib/googleCalendar.ts src/components/swipe/SwipeAdminCard.tsx
git commit -m "Agenda: permissão da Agenda na conexão do Google e cliente da Calendar API"
```

---

### Task 4: Operações em série (só este / seguintes / todos)

**Files:**
- Create: `src/lib/agendaSerie.ts`

**Interfaces:**
- Consumes: `atualizarEvento`, `contarOcorrenciasAntes`, `criarEvento`, `excluirEvento` (googleCalendar); `ancorarNaSerie`, `dataDe`, `formParaEvento`, `EventoGoogle`, `FormEvento` (agendaEvento); `encerrarAntesDe` (recorrencia).
- Produces: `type Escopo = "este" | "seguintes" | "todos"`, `interface EventoAberto { calendarId; evento; mestre }`, `salvarComEscopo(f, aberto | null, escopo, enviar)`, `excluirComEscopo(aberto, escopo, enviar)`.

- [ ] **Step 1: Implementar** — `src/lib/agendaSerie.ts`:

```ts
// Salvar/excluir respeitando "Só este / Este e os seguintes / Todos" como o Google Agenda faz.
import { atualizarEvento, contarOcorrenciasAntes, criarEvento, excluirEvento } from "@/lib/googleCalendar";
import { ancorarNaSerie, dataDe, formParaEvento, type EventoGoogle, type FormEvento } from "@/lib/agendaEvento";
import { encerrarAntesDe } from "@/lib/recorrencia";

export type Escopo = "este" | "seguintes" | "todos";

/** Evento aberto no formulário: a ocorrência clicada e, se for de uma série, o evento mestre. */
export interface EventoAberto {
  calendarId: string;
  evento: EventoGoogle;
  mestre: EventoGoogle | null;
}

function regraDoMestre(mestre: EventoGoogle): { regra: string; outras: string[] } {
  const linhas = mestre.recurrence ?? [];
  const regra = linhas.find((l) => /^RRULE:/i.test(l));
  if (!regra) throw new Error("A série não tem regra de repetição");
  return { regra, outras: linhas.filter((l) => !/^RRULE:/i.test(l)) };
}

function ocorrenciaDe(evento: EventoGoogle): string {
  return dataDe(evento.originalStartTime ?? evento.start ?? {});
}

function ehPrimeira(aberto: EventoAberto): boolean {
  return !!aberto.mestre && ocorrenciaDe(aberto.evento) <= dataDe(aberto.mestre.start ?? {});
}

/** Mantém o mesmo link do Meet na série nova. */
function copiarConferencia(c: Record<string, unknown>): Record<string, unknown> {
  return { conferenceId: c.conferenceId, conferenceSolution: c.conferenceSolution, entryPoints: c.entryPoints };
}

export async function salvarComEscopo(f: FormEvento, aberto: EventoAberto | null, escopo: Escopo, enviar: boolean): Promise<EventoGoogle> {
  if (!aberto) return criarEvento(f.calendarId, formParaEvento(f), enviar);
  const { calendarId, evento, mestre } = aberto;
  if (!mestre) return atualizarEvento(calendarId, evento.id as string, formParaEvento(f, evento), enviar, evento.etag);

  if (escopo === "este") {
    const corpo = formParaEvento(f, evento);
    delete corpo.recurrence; // ocorrência não tem regra própria
    return atualizarEvento(calendarId, evento.id as string, corpo, enviar, evento.etag);
  }

  const ocorrencia = ocorrenciaDe(evento);
  if (escopo === "todos" || ehPrimeira(aberto)) {
    const g = ancorarNaSerie(f, dataDe(mestre.start ?? {}), ocorrencia);
    return atualizarEvento(calendarId, mestre.id as string, formParaEvento(g, mestre), enviar, mestre.etag);
  }

  // Este e os seguintes: a série antiga para no dia anterior; uma série nova começa nesta ocorrência
  const { regra, outras } = regraDoMestre(mestre);
  let nova: FormEvento = { ...f, outrasLinhas: [] };
  if (f.recorrencia?.fim.tipo === "vezes") {
    const antes = await contarOcorrenciasAntes(calendarId, mestre.id as string, evento.originalStartTime ?? evento.start ?? {});
    nova = { ...nova, recorrencia: { ...f.recorrencia, fim: { tipo: "vezes", n: Math.max(1, f.recorrencia.fim.n - antes) } } };
  }
  await atualizarEvento(
    calendarId, mestre.id as string,
    { recurrence: [encerrarAntesDe(regra, ocorrencia, !!mestre.start?.date), ...outras] },
    enviar, mestre.etag,
  );
  const corpo = formParaEvento(nova, mestre);
  if (nova.meet && mestre.conferenceData?.conferenceId) corpo.conferenceData = copiarConferencia(mestre.conferenceData);
  return criarEvento(calendarId, corpo, enviar);
}

export async function excluirComEscopo(aberto: EventoAberto, escopo: Escopo, enviar: boolean): Promise<void> {
  const { calendarId, evento, mestre } = aberto;
  if (!mestre || escopo === "este") return excluirEvento(calendarId, evento.id as string, enviar);
  if (escopo === "todos" || ehPrimeira(aberto)) return excluirEvento(calendarId, mestre.id as string, enviar);
  const { regra, outras } = regraDoMestre(mestre);
  await atualizarEvento(
    calendarId, mestre.id as string,
    { recurrence: [encerrarAntesDe(regra, ocorrenciaDe(evento), !!mestre.start?.date), ...outras] },
    enviar, mestre.etag,
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit -p . 2>&1 | grep agendaSerie` → Expected: nenhuma linha.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agendaSerie.ts
git commit -m "Agenda: salvar/excluir só este, este e os seguintes ou todos"
```

---

### Task 5: Grade (FullCalendar) e estilo

**Files:**
- Modify: `package.json`, `package-lock.json` (deps)
- Create: `src/components/agenda/AgendaGrade.tsx`
- Modify: `src/styles.css` (fim do arquivo)

**Interfaces:**
- Produces: `type VisaoAgenda = "timeGridDay" | "timeGridWeek" | "dayGridMonth"`; default export `AgendaGrade(props: { visao; eventos: EventInput[]; calRef: RefObject<FullCalendar | null>; onPeriodo(inicio: Date, fim: Date, titulo: string): void; onSelecionar(inicio: Date, fim: Date, diaInteiro: boolean): void; onClicar(id: string): void })`.

- [ ] **Step 1: Dependências**

Run: `npm install @fullcalendar/core@^6.1.19 @fullcalendar/react@^6.1.19 @fullcalendar/daygrid@^6.1.19 @fullcalendar/timegrid@^6.1.19 @fullcalendar/interaction@^6.1.19`
Expected: adiciona os 5 pacotes em `dependencies`.

- [ ] **Step 2: Componente** — `src/components/agenda/AgendaGrade.tsx`:

```tsx
// Grade da Agenda (FullCalendar). Carregado só no navegador (import dinâmico na rota).
import type { RefObject } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import ptBr from "@fullcalendar/core/locales/pt-br";
import type { EventInput } from "@fullcalendar/core";

export type VisaoAgenda = "timeGridDay" | "timeGridWeek" | "dayGridMonth";

interface AgendaGradeProps {
  visao: VisaoAgenda;
  eventos: EventInput[];
  calRef: RefObject<FullCalendar | null>;
  onPeriodo: (inicio: Date, fim: Date, titulo: string) => void;
  onSelecionar: (inicio: Date, fim: Date, diaInteiro: boolean) => void;
  onClicar: (id: string) => void;
}

export default function AgendaGrade({ visao, eventos, calRef, onPeriodo, onSelecionar, onClicar }: AgendaGradeProps) {
  return (
    <div className="agenda-fc h-full">
      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={visao}
        locale={ptBr}
        headerToolbar={false}
        height="100%"
        events={eventos}
        nowIndicator
        selectable
        selectMirror
        dayMaxEvents
        allDayText="dia todo"
        slotDuration="00:30:00"
        scrollTime="07:00:00"
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        datesSet={(a) => onPeriodo(a.start, a.end, a.view.title)}
        select={(a) => {
          onSelecionar(a.start, a.end, a.allDay);
          a.view.calendar.unselect();
        }}
        eventClick={(a) => {
          a.jsEvent.preventDefault();
          onClicar(a.event.id);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Estilo** — acrescentar ao fim de `src/styles.css`:

```css
/* Agenda (FullCalendar) com as cores do tema */
.agenda-fc {
  --fc-border-color: var(--border);
  --fc-page-bg-color: var(--card);
  --fc-neutral-bg-color: var(--muted);
  --fc-list-event-hover-bg-color: var(--muted);
  --fc-today-bg-color: color-mix(in oklch, var(--primary) 7%, transparent);
  --fc-highlight-color: color-mix(in oklch, var(--primary) 16%, transparent);
  --fc-now-indicator-color: var(--destructive);
  --fc-event-border-color: transparent;
  font-size: 0.8rem;
}
.agenda-fc .fc-scrollgrid { border-radius: 12px; overflow: hidden; }
.agenda-fc .fc-col-header-cell-cushion,
.agenda-fc .fc-daygrid-day-number { color: var(--foreground); text-decoration: none; font-weight: 500; }
.agenda-fc .fc-col-header-cell-cushion { padding: 6px 4px; text-transform: capitalize; }
.agenda-fc .fc-timegrid-slot-label-cushion,
.agenda-fc .fc-timegrid-axis-cushion { color: var(--muted-foreground); font-size: 0.7rem; }
.agenda-fc .fc-timegrid-slot { height: 2.4em; }
.agenda-fc .fc-event { border-radius: 6px; cursor: pointer; }
.agenda-fc .fc-timegrid-event .fc-event-main { padding: 2px 4px; }
.agenda-fc .fc-day-today .fc-daygrid-day-number {
  background: var(--primary); color: var(--primary-foreground); border-radius: 9999px; min-width: 1.6rem; text-align: center; margin: 3px;
}
.agenda-fc .fc-daygrid-more-link { color: var(--muted-foreground); font-weight: 500; }
.agenda-fc .fc-popover { background: var(--popover); border-color: var(--border); border-radius: 10px; }
```

- [ ] **Step 4: Build**

Run: `npm run build` → Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/agenda/AgendaGrade.tsx src/styles.css
git commit -m "Agenda: grade com FullCalendar nas cores do sistema"
```

---

### Task 6: Formulário do evento

**Files:**
- Create: `src/components/agenda/Escolha.tsx`
- Create: `src/components/agenda/RecorrenciaCampo.tsx`
- Create: `src/components/agenda/ParticipantesCampo.tsx`
- Create: `src/components/agenda/LembretesCampo.tsx`
- Create: `src/components/agenda/EventoDialog.tsx`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `useEscolha()` → `{ elemento: JSX.Element; perguntar(titulo, opcoes: OpcaoEscolha[], opts?: { descricao?; confirmar?; modo?: "lista" | "botoes" }): Promise<string | null> }`; `RecorrenciaCampo({ form, onChange, disabled })`; `ParticipantesCampo({ valor, onChange, disabled })`; `LembretesCampo({ form, onChange, disabled })`; `type AberturaEvento = { tipo: "novo"; form: FormEvento } | { tipo: "editar"; aberto: EventoAberto }`; `EventoDialog({ abertura, agendas, onClose, onMudou })`.

- [ ] **Step 1: Perguntas (escopo/convite)** — `src/components/agenda/Escolha.tsx`:

```tsx
import { useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface OpcaoEscolha { valor: string; rotulo: string }
interface Pedido {
  titulo: string;
  descricao?: string;
  opcoes: OpcaoEscolha[];
  confirmar: string;
  modo: "lista" | "botoes";
}

/** Pergunta com opções (lista com rádio ou um botão por opção). Resolve `null` se cancelar. */
export function useEscolha() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [valor, setValor] = useState("");
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const perguntar = (
    titulo: string,
    opcoes: OpcaoEscolha[],
    opts: { descricao?: string; confirmar?: string; modo?: "lista" | "botoes" } = {},
  ) =>
    new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      setValor(opcoes[0]?.valor ?? "");
      setPedido({ titulo, opcoes, descricao: opts.descricao, confirmar: opts.confirmar ?? "OK", modo: opts.modo ?? "lista" });
    });

  const fechar = (v: string | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setPedido(null);
  };

  const elemento = (
    <AlertDialog open={!!pedido} onOpenChange={(o) => { if (!o) fechar(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pedido?.titulo}</AlertDialogTitle>
          {pedido?.descricao && <AlertDialogDescription>{pedido.descricao}</AlertDialogDescription>}
        </AlertDialogHeader>
        {pedido?.modo === "lista" && (
          <RadioGroup value={valor} onValueChange={setValor} className="gap-3 py-1">
            {pedido.opcoes.map((o) => (
              <label key={o.valor} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <RadioGroupItem value={o.valor} /> {o.rotulo}
              </label>
            ))}
          </RadioGroup>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => fechar(null)}>Cancelar</AlertDialogCancel>
          {pedido?.modo === "botoes"
            ? pedido.opcoes.map((o, i) => (
              <AlertDialogAction
                key={o.valor}
                onClick={() => fechar(o.valor)}
                className={i < pedido.opcoes.length - 1 ? "bg-secondary text-secondary-foreground hover:bg-secondary/80" : undefined}
              >
                {o.rotulo}
              </AlertDialogAction>
            ))
            : <AlertDialogAction onClick={() => fechar(valor)}>{pedido?.confirmar}</AlertDialogAction>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { elemento, perguntar };
}
```

- [ ] **Step 2: Repetição** — `src/components/agenda/RecorrenciaCampo.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { FormEvento } from "@/lib/agendaEvento";
import {
  DIAS, DIAS_CURTO, DIAS_LETRA, PRESETS, descrever, diaDaSemana, identificarPreset, regraDoPreset, rotuloPreset, somarDias,
  type DiaSemana, type Freq, type Preset, type Recorrencia,
} from "@/lib/recorrencia";

interface Props { form: FormEvento; onChange: (patch: Partial<FormEvento>) => void; disabled?: boolean }

const EDITAR = "__editar__";
const GOOGLE = "__google__";

export function RecorrenciaCampo({ form, onChange, disabled }: Props) {
  const [personalizando, setPersonalizando] = useState(false);
  const preset: string = form.regraOriginal ? GOOGLE : identificarPreset(form.recorrencia, form.inicioData);

  const escolher = (v: string) => {
    if (v === EDITAR) { setPersonalizando(true); return; }
    if (v === GOOGLE || v === "personalizado") return;
    onChange({ recorrencia: regraDoPreset(v as Preset, form.inicioData), regraOriginal: null });
  };

  return (
    <>
      <Select value={preset} onValueChange={escolher} disabled={disabled}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {form.regraOriginal && <SelectItem value={GOOGLE}>Repetição personalizada do Google (mantida)</SelectItem>}
          {PRESETS.filter((p) => p !== "personalizado").map((p) => (
            <SelectItem key={p} value={p}>{rotuloPreset(p, form.inicioData)}</SelectItem>
          ))}
          {preset === "personalizado" && form.recorrencia && (
            <SelectItem value="personalizado">{descrever(form.recorrencia, form.inicioData)}</SelectItem>
          )}
          <SelectItem value={EDITAR}>Personalizado...</SelectItem>
        </SelectContent>
      </Select>
      {personalizando && (
        <PersonalizadoDialog
          form={form}
          onClose={() => setPersonalizando(false)}
          onSalvar={(r) => { onChange({ recorrencia: r, regraOriginal: null }); setPersonalizando(false); }}
        />
      )}
    </>
  );
}

const UNIDADES: { freq: Freq; singular: string; plural: string }[] = [
  { freq: "DAILY", singular: "dia", plural: "dias" },
  { freq: "WEEKLY", singular: "semana", plural: "semanas" },
  { freq: "MONTHLY", singular: "mês", plural: "meses" },
  { freq: "YEARLY", singular: "ano", plural: "anos" },
];

function PersonalizadoDialog({ form, onClose, onSalvar }: { form: FormEvento; onClose: () => void; onSalvar: (r: Recorrencia) => void }) {
  const inicial: Recorrencia = form.recorrencia ?? {
    freq: "WEEKLY", intervalo: 1, diasSemana: [diaDaSemana(form.inicioData)], mensal: "dia", fim: { tipo: "nunca" },
  };
  const [freq, setFreq] = useState<Freq>(inicial.freq);
  const [intervalo, setIntervalo] = useState(String(inicial.intervalo));
  const [dias, setDias] = useState<DiaSemana[]>(inicial.diasSemana.length ? inicial.diasSemana : [diaDaSemana(form.inicioData)]);
  const [mensal, setMensal] = useState(inicial.mensal);
  const [fimTipo, setFimTipo] = useState(inicial.fim.tipo);
  const [fimData, setFimData] = useState(inicial.fim.tipo === "data" ? inicial.fim.data : somarDias(form.inicioData, 90));
  const [fimN, setFimN] = useState(String(inicial.fim.tipo === "vezes" ? inicial.fim.n : 13));

  const n = Math.max(1, Math.floor(Number(intervalo) || 1));
  const alternarDia = (d: DiaSemana) =>
    setDias((atual) => (atual.includes(d) ? (atual.length > 1 ? atual.filter((x) => x !== d) : atual) : [...atual, d]));

  const concluir = () => onSalvar({
    freq,
    intervalo: n,
    diasSemana: freq === "WEEKLY" ? dias : [],
    mensal: freq === "MONTHLY" ? mensal : "dia",
    fim: fimTipo === "data" ? { tipo: "data", data: fimData } : fimTipo === "vezes" ? { tipo: "vezes", n: Math.max(1, Math.floor(Number(fimN) || 1)) } : { tipo: "nunca" },
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Repetição personalizada</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-sm font-normal">Repetir a cada</Label>
            <Input type="number" min={1} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} className="w-16" />
            <Select value={freq} onValueChange={(v) => setFreq(v as Freq)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIDADES.map((u) => <SelectItem key={u.freq} value={u.freq}>{n === 1 ? u.singular : u.plural}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {freq === "WEEKLY" && (
            <div className="space-y-2">
              <Label className="text-sm font-normal">Repetir:</Label>
              <div className="flex gap-1.5">
                {DIAS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    title={DIAS_CURTO[d]}
                    aria-pressed={dias.includes(d)}
                    onClick={() => alternarDia(d)}
                    className={cn(
                      "h-8 w-8 rounded-full text-xs font-medium transition-colors",
                      dias.includes(d) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
                    )}
                  >
                    {DIAS_LETRA[d]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {freq === "MONTHLY" && (
            <Select value={mensal} onValueChange={(v) => setMensal(v as Recorrencia["mensal"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dia">{rotuloPreset("mensal_dia", form.inicioData)}</SelectItem>
                <SelectItem value="posicao">{rotuloPreset("mensal_pos", form.inicioData)}</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-normal">Termina</Label>
            <RadioGroup value={fimTipo} onValueChange={(v) => setFimTipo(v as Recorrencia["fim"]["tipo"])} className="gap-3">
              <label className="flex items-center gap-2.5 text-sm"><RadioGroupItem value="nunca" /> Nunca</label>
              <label className="flex items-center gap-2.5 text-sm">
                <RadioGroupItem value="data" /> Em
                <Input type="date" value={fimData} min={form.inicioData} onChange={(e) => setFimData(e.target.value)}
                  onFocus={() => setFimTipo("data")} className="h-8 w-40" />
              </label>
              <label className="flex items-center gap-2.5 text-sm">
                <RadioGroupItem value="vezes" /> Após
                <Input type="number" min={1} value={fimN} onChange={(e) => setFimN(e.target.value)}
                  onFocus={() => setFimTipo("vezes")} className="h-8 w-20" /> ocorrências
              </label>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={concluir}>Concluído</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Participantes** — `src/components/agenda/ParticipantesCampo.tsx`:

```tsx
import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { emailValido } from "@/lib/agendaEvento";

interface Props { valor: string[]; onChange: (emails: string[]) => void; disabled?: boolean }

export function ParticipantesCampo({ valor, onChange, disabled }: Props) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const adicionar = () => {
    const novos = texto.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!novos.length) return;
    const invalido = novos.find((e) => !emailValido(e));
    if (invalido) { setErro(`E-mail inválido: ${invalido}`); return; }
    const lista = [...valor];
    for (const e of novos) if (!lista.some((x) => x.toLowerCase() === e.toLowerCase())) lista.push(e);
    onChange(lista);
    setTexto("");
    setErro(null);
  };

  return (
    <div className="space-y-2">
      {!disabled && (
        <Input
          value={texto}
          inputMode="email"
          autoComplete="off"
          placeholder="nome@empresa.com — Enter para adicionar"
          onChange={(e) => { setTexto(e.target.value); setErro(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === ";") { e.preventDefault(); adicionar(); }
          }}
          onBlur={adicionar}
        />
      )}
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valor.map((e) => (
            <Badge key={e} variant="secondary" className="gap-1 font-normal">
              {e}
              {!disabled && (
                <button type="button" className="hover:text-destructive" onClick={() => onChange(valor.filter((x) => x !== e))} aria-label={`Remover ${e}`}>
                  <X size={11} />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Notificações** — `src/components/agenda/LembretesCampo.tsx`:

```tsx
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FATOR_UNIDADE, LEMBRETE_PADRAO, MAX_LEMBRETES, deUnidade, paraUnidade,
  type FormEvento, type Lembrete, type MetodoLembrete, type Unidade,
} from "@/lib/agendaEvento";

interface Props { form: FormEvento; onChange: (patch: Partial<FormEvento>) => void; disabled?: boolean }

const UNIDADES: { valor: Unidade; rotulo: string }[] = [
  { valor: "minutos", rotulo: "minutos" }, { valor: "horas", rotulo: "horas" },
  { valor: "dias", rotulo: "dias" }, { valor: "semanas", rotulo: "semanas" },
];

export function LembretesCampo({ form, onChange, disabled }: Props) {
  const lista = form.lembretes;
  const trocar = (i: number, l: Lembrete) => onChange({ lembretes: lista.map((x, j) => (j === i ? l : x)) });

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={form.lembretesPadrao}
          disabled={disabled}
          onCheckedChange={(v) => onChange({ lembretesPadrao: v, lembretes: !v && !lista.length ? [{ ...LEMBRETE_PADRAO }] : lista })}
        />
        Usar as notificações padrão da agenda
      </label>
      {!form.lembretesPadrao && (
        <>
          {lista.map((l, i) => {
            const unidade = l.unidade ?? paraUnidade(l.minutos).unidade;
            const valor = l.minutos / FATOR_UNIDADE[unidade];
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select value={l.metodo} onValueChange={(m) => trocar(i, { ...l, metodo: m as MetodoLembrete })} disabled={disabled}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popup">Notificação</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number" min={0} className="w-20" value={valor} disabled={disabled}
                  onChange={(e) => trocar(i, { ...l, unidade, minutos: deUnidade(Math.max(0, Number(e.target.value) || 0), unidade) })}
                />
                <Select value={unidade} onValueChange={(u) => trocar(i, { ...l, unidade: u as Unidade, minutos: deUnidade(valor, u as Unidade) })} disabled={disabled}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map((u) => <SelectItem key={u.valor} value={u.valor}>{u.rotulo}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">antes</span>
                {!disabled && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Remover notificação"
                    onClick={() => onChange({ lembretes: lista.filter((_, j) => j !== i) })}>
                    <X size={14} />
                  </Button>
                )}
              </div>
            );
          })}
          {!disabled && lista.length < MAX_LEMBRETES && (
            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
              onClick={() => onChange({ lembretes: [...lista, { ...LEMBRETE_PADRAO }] })}>
              <Plus size={14} /> Adicionar notificação
            </Button>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Formulário** — `src/components/agenda/EventoDialog.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  eventoParaForm, linhasRecorrencia, moverInicio, temParticipantes, validarForm, type FormEvento,
} from "@/lib/agendaEvento";
import { AgendaConflitoError, podeEscrever, type AgendaGoogle } from "@/lib/googleCalendar";
import { excluirComEscopo, salvarComEscopo, type Escopo, type EventoAberto } from "@/lib/agendaSerie";
import { useEscolha, type OpcaoEscolha } from "./Escolha";
import { RecorrenciaCampo } from "./RecorrenciaCampo";
import { ParticipantesCampo } from "./ParticipantesCampo";
import { LembretesCampo } from "./LembretesCampo";

export type AberturaEvento = { tipo: "novo"; form: FormEvento } | { tipo: "editar"; aberto: EventoAberto };

interface Props {
  abertura: AberturaEvento | null;
  agendas: AgendaGoogle[];
  onClose: () => void;
  /** Algo mudou no Google: recarregar a grade. */
  onMudou: () => void;
}

const msgErro = (e: unknown) => (e instanceof Error ? e.message : "Erro ao falar com o Google Agenda");

export function EventoDialog({ abertura, agendas, onClose, onMudou }: Props) {
  const [form, setForm] = useState<FormEvento | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { elemento: perguntas, perguntar } = useEscolha();

  const inicial = useMemo(() => {
    if (!abertura) return null;
    if (abertura.tipo === "novo") return abertura.form;
    const { evento, calendarId, mestre } = abertura.aberto;
    return eventoParaForm(evento, calendarId, mestre?.recurrence);
  }, [abertura]);
  const regraInicial = useMemo(() => (inicial ? linhasRecorrencia(inicial).join("\n") : ""), [inicial]);

  useEffect(() => { setForm(inicial); }, [inicial]);

  const editando = abertura?.tipo === "editar" ? abertura.aberto : null;
  const agenda = agendas.find((a) => a.id === form?.calendarId);
  const somenteLeitura = !!editando && (() => {
    if (!agenda || !podeEscrever(agenda)) return true;
    const org = editando.evento.organizer;
    return !!org && !org.self && org.email !== editando.calendarId && !editando.evento.guestsCanModify;
  })();
  const gravaveis = agendas.filter(podeEscrever);
  const recorrente = !!editando?.mestre;

  const mudar = (patch: Partial<FormEvento>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const perguntarEscopo = async (acao: "Editar" | "Excluir", mudouRegra: boolean): Promise<Escopo | null> => {
    const opcoes: OpcaoEscolha[] = [
      ...(mudouRegra ? [] : [{ valor: "este", rotulo: "Este evento" }]),
      { valor: "seguintes", rotulo: "Este e os eventos seguintes" },
      { valor: "todos", rotulo: "Todos os eventos" },
    ];
    return (await perguntar(`${acao} evento recorrente`, opcoes, { confirmar: "OK" })) as Escopo | null;
  };

  const perguntarEnvio = async (titulo: string): Promise<boolean | null> => {
    const v = await perguntar(titulo, [{ valor: "nao", rotulo: "Não enviar" }, { valor: "sim", rotulo: "Enviar" }], {
      modo: "botoes",
      descricao: "O Google manda um e-mail para os participantes.",
    });
    return v === null ? null : v === "sim";
  };

  const salvar = async () => {
    if (!form || !abertura) return;
    const erro = validarForm(form);
    if (erro) { toast.error(erro); return; }
    let escopo: Escopo = "todos";
    if (recorrente) {
      const e = await perguntarEscopo("Editar", linhasRecorrencia(form).join("\n") !== regraInicial);
      if (!e) return;
      escopo = e;
    }
    let enviar = false;
    if (form.participantes.length > 0 || (editando && temParticipantes(editando.evento))) {
      const r = await perguntarEnvio(editando ? "Enviar a atualização aos participantes?" : "Enviar convite aos participantes?");
      if (r === null) return;
      enviar = r;
    }
    setSalvando(true);
    try {
      await salvarComEscopo(form, editando, escopo, enviar);
      toast.success(editando ? "Evento atualizado no Google Agenda" : "Evento criado no Google Agenda");
      onMudou();
      onClose();
    } catch (e) {
      toast.error(msgErro(e));
      if (e instanceof AgendaConflitoError) { onMudou(); onClose(); }
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!editando) return;
    let escopo: Escopo = "todos";
    if (recorrente) {
      const e = await perguntarEscopo("Excluir", false);
      if (!e) return;
      escopo = e;
    } else {
      const ok = await perguntar("Excluir este evento?", [{ valor: "sim", rotulo: "Excluir" }], { modo: "botoes" });
      if (!ok) return;
    }
    let enviar = false;
    if (temParticipantes(editando.evento)) {
      const r = await perguntarEnvio("Avisar os participantes do cancelamento?");
      if (r === null) return;
      enviar = r;
    }
    setSalvando(true);
    try {
      await excluirComEscopo(editando, escopo, enviar);
      toast.success("Evento excluído do Google Agenda");
      onMudou();
      onClose();
    } catch (e) {
      toast.error(msgErro(e));
      if (e instanceof AgendaConflitoError) { onMudou(); onClose(); }
    } finally {
      setSalvando(false);
    }
  };

  const copiarMeet = async () => {
    if (!form?.linkMeet) return;
    try { await navigator.clipboard.writeText(form.linkMeet); toast.success("Link do Meet copiado"); } catch { toast.error("Não foi possível copiar"); }
  };

  const titulo = !editando ? "Novo evento" : somenteLeitura ? "Evento" : "Editar evento";
  const htmlLink = editando?.evento.htmlLink;

  return (
    <>
      <Dialog open={!!abertura && !!form} onOpenChange={(o) => { if (!o && !salvando) onClose(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>
              {somenteLeitura ? "Só leitura: este evento é de outra agenda ou de outro organizador." : "Salvo direto no seu Google Agenda."}
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-5">
              <Input
                autoFocus={!editando}
                value={form.titulo}
                onChange={(e) => mudar({ titulo: e.target.value })}
                placeholder="Adicionar título"
                className="h-11 text-base font-medium"
                disabled={somenteLeitura}
                autoComplete="off"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Agenda</Label>
                  <Select value={form.calendarId} onValueChange={(v) => mudar({ calendarId: v })} disabled={!!editando}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(editando ? agendas : gravaveis).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.backgroundColor }} />
                            {a.summaryOverride ?? a.summary}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <Switch checked={form.diaInteiro} onCheckedChange={(v) => mudar({ diaInteiro: v })} disabled={somenteLeitura} />
                  Dia inteiro
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Início</Label>
                  <div className="flex gap-2">
                    <Input type="date" value={form.inicioData} disabled={somenteLeitura}
                      onChange={(e) => e.target.value && setForm(moverInicio(form, e.target.value, form.inicioHora))} />
                    {!form.diaInteiro && (
                      <Input type="time" step={900} value={form.inicioHora} className="w-32" disabled={somenteLeitura}
                        onChange={(e) => e.target.value && setForm(moverInicio(form, form.inicioData, e.target.value))} />
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Fim</Label>
                  <div className="flex gap-2">
                    <Input type="date" value={form.fimData} min={form.inicioData} disabled={somenteLeitura}
                      onChange={(e) => e.target.value && mudar({ fimData: e.target.value })} />
                    {!form.diaInteiro && (
                      <Input type="time" step={900} value={form.fimHora} className="w-32" disabled={somenteLeitura}
                        onChange={(e) => e.target.value && mudar({ fimHora: e.target.value })} />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Repetição</Label>
                <RecorrenciaCampo form={form} onChange={mudar} disabled={somenteLeitura} />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Participantes</Label>
                <ParticipantesCampo valor={form.participantes} onChange={(v) => mudar({ participantes: v })} disabled={somenteLeitura} />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.meet} onCheckedChange={(v) => mudar({ meet: v })} disabled={somenteLeitura} />
                  <Video size={15} className="text-muted-foreground" /> Videoconferência do Google Meet
                </label>
                {form.meet && form.linkMeet && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                    <span className="truncate font-mono text-xs">{form.linkMeet}</span>
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1" onClick={copiarMeet}><Copy size={13} /> Copiar</Button>
                    <Button type="button" size="sm" className="h-7 gap-1" asChild>
                      <a href={form.linkMeet} target="_blank" rel="noopener noreferrer"><Video size={13} /> Entrar</a>
                    </Button>
                  </div>
                )}
                {form.meet && !form.linkMeet && <p className="text-xs text-muted-foreground">O link é criado pelo Google ao salvar.</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Notificações</Label>
                <LembretesCampo form={form} onChange={mudar} disabled={somenteLeitura} />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Local</Label>
                <Input value={form.local} onChange={(e) => mudar({ local: e.target.value })} placeholder="Adicionar local" disabled={somenteLeitura} />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Descrição</Label>
                <Textarea rows={3} value={form.descricao} onChange={(e) => mudar({ descricao: e.target.value })} placeholder="Adicionar descrição" disabled={somenteLeitura} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:items-center sm:justify-between">
            <div className="flex gap-2">
              {editando && !somenteLeitura && (
                <Button type="button" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={excluir} disabled={salvando}>
                  <Trash2 size={14} /> Excluir
                </Button>
              )}
              {htmlLink && (
                <Button type="button" variant="ghost" className="gap-1.5" asChild>
                  <a href={htmlLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Abrir no Google Agenda</a>
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={salvando}>{somenteLeitura ? "Fechar" : "Cancelar"}</Button>
              {!somenteLeitura && (
                <Button type="button" onClick={salvar} disabled={salvando} className="gap-1.5">
                  {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {perguntas}
    </>
  );
}
```

- [ ] **Step 6: Verificar tipos e build**

Run: `npx tsc --noEmit -p . 2>&1 | grep "components/agenda"` → Expected: nenhuma linha.
Run: `npm run build` → Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/agenda
git commit -m "Agenda: formulário do evento (repetição, participantes, Meet, notificações, escopo)"
```

---

### Task 7: Página `/agenda` e menu

**Files:**
- Create: `src/routes/_authenticated/agenda.tsx`
- Modify: `src/lib/nav.tsx` (ícone `CalendarDays` + link após Demandas)
- Modify: `src/routeTree.gen.ts` (gerado pelo build)

**Interfaces:**
- Consumes: tudo acima; `BotaoGoogleLogin` (`@/components/swipe/BotaoGoogleLogin`, props `clientId`, `onEntrou`); `oauthUrl`, `statusDoDrive`, `DriveAuthError` (`@/lib/googleDrive`); `getUserId`, `FALLBACK_USER_ID` (`@/lib/clientesService`).

- [ ] **Step 1: Menu** — em `src/lib/nav.tsx`, importar `CalendarDays` de `lucide-react` e inserir depois do link de Demandas:

```tsx
      { label: "Agenda", icon: <CalendarDays size={17} />, to: "/agenda" },
```

- [ ] **Step 2: Página** — `src/routes/_authenticated/agenda.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type FullCalendar from "@fullcalendar/react";
import type { EventInput } from "@fullcalendar/core";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DriveAuthError, oauthUrl, statusDoDrive } from "@/lib/googleDrive";
import {
  AgendaSemPermissaoError, listarAgendas, listarEventos, obterEvento, podeEscrever, temPermissaoAgenda, type AgendaGoogle,
} from "@/lib/googleCalendar";
import { novoForm, type EventoGoogle } from "@/lib/agendaEvento";
import { FALLBACK_USER_ID, getUserId } from "@/lib/clientesService";
import { BotaoGoogleLogin } from "@/components/swipe/BotaoGoogleLogin";
import { EventoDialog, type AberturaEvento } from "@/components/agenda/EventoDialog";
import type { VisaoAgenda } from "@/components/agenda/AgendaGrade";

const AgendaGrade = lazy(() => import("@/components/agenda/AgendaGrade"));

export const Route = createFileRoute("/_authenticated/agenda")({ component: AgendaPage });

const VISOES: { valor: VisaoAgenda; rotulo: string }[] = [
  { valor: "timeGridDay", rotulo: "Dia" },
  { valor: "timeGridWeek", rotulo: "Semana" },
  { valor: "dayGridMonth", rotulo: "Mês" },
];
const CHAVE_VISAO = "agenda_visao";
const CHAVE_OCULTAS = "agenda_ocultas";

function lerLocal<T>(chave: string, padrao: T): T {
  try { const v = localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : padrao; } catch { return padrao; }
}
function gravarLocal(chave: string, valor: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* storage indisponível */ }
}

type Estado = "carregando" | "sem_login" | "sem_permissao" | "pronto" | "erro";
interface Ocorrencia { calendarId: string; evento: EventoGoogle }

function AgendaPage() {
  const [montado, setMontado] = useState(false);
  const [estado, setEstado] = useState<Estado>("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [agendas, setAgendas] = useState<AgendaGoogle[]>([]);
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [visao, setVisao] = useState<VisaoAgenda>("timeGridWeek");
  const [periodo, setPeriodo] = useState<{ inicio: Date; fim: Date; titulo: string } | null>(null);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [carregandoEventos, setCarregandoEventos] = useState(false);
  const [abertura, setAbertura] = useState<AberturaEvento | null>(null);
  const calRef = useRef<FullCalendar | null>(null);

  useEffect(() => {
    setMontado(true);
    setVisao(lerLocal<VisaoAgenda>(CHAVE_VISAO, "timeGridWeek"));
    setOcultas(lerLocal<string[]>(CHAVE_OCULTAS, []));
  }, []);

  const iniciar = useCallback(async () => {
    setEstado("carregando");
    setErro(null);
    try {
      const st = await statusDoDrive(true);
      setClientId(st.client_id);
      if (!st.connected || !(await temPermissaoAgenda())) { setEstado("sem_permissao"); return; }
      setAgendas(await listarAgendas());
      setEstado("pronto");
    } catch (e) {
      if (e instanceof AgendaSemPermissaoError) setEstado("sem_permissao");
      else if (e instanceof DriveAuthError) setEstado("sem_login");
      else { setErro(e instanceof Error ? e.message : "Erro ao abrir a agenda"); setEstado("erro"); }
    }
  }, []);

  useEffect(() => {
    // Volta do consentimento do Google (?google_connected=1 / ?google_error=...)
    const p = new URLSearchParams(window.location.search);
    if (p.get("google_connected")) toast.success("Agenda do Google conectada");
    if (p.get("google_error")) toast.error(`O Google recusou a conexão: ${p.get("google_error")}`);
    if (p.has("google_connected") || p.has("google_error")) window.history.replaceState({}, "", window.location.pathname);
    iniciar();
  }, [iniciar]);

  const visiveis = useMemo(() => agendas.filter((a) => !ocultas.includes(a.id)), [agendas, ocultas]);

  const requisicao = useRef(0);
  const carregarEventos = useCallback(async () => {
    if (estado !== "pronto" || !periodo) return;
    const minha = ++requisicao.current;
    setCarregandoEventos(true);
    const resultados = await Promise.allSettled(
      visiveis.map(async (a) => (await listarEventos(a.id, periodo.inicio, periodo.fim)).map((evento) => ({ calendarId: a.id, evento }))),
    );
    if (minha !== requisicao.current) return;
    const falhas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (falhas.some((f) => f.reason instanceof AgendaSemPermissaoError)) { setEstado("sem_permissao"); return; }
    if (falhas.length) toast.error(`Não foi possível carregar ${falhas.length === 1 ? "uma agenda" : `${falhas.length} agendas`}: ${String(falhas[0].reason?.message ?? falhas[0].reason)}`);
    setOcorrencias(resultados.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
    setCarregandoEventos(false);
  }, [estado, periodo, visiveis]);

  useEffect(() => { carregarEventos(); }, [carregarEventos]);

  // Voltou para a aba: pode ter mudado algo no celular
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === "visible") carregarEventos(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [carregarEventos]);

  const corDe = useMemo(() => new Map(agendas.map((a) => [a.id, a])), [agendas]);
  const eventosGrade = useMemo<EventInput[]>(() => ocorrencias.map(({ calendarId, evento }) => {
    const a = corDe.get(calendarId);
    return {
      id: `${calendarId}::${evento.id}`,
      title: evento.summary || "(sem título)",
      start: evento.start?.date ?? evento.start?.dateTime ?? undefined,
      end: evento.end?.date ?? evento.end?.dateTime ?? undefined,
      allDay: !!evento.start?.date,
      backgroundColor: a?.backgroundColor,
      borderColor: a?.backgroundColor,
      textColor: a?.foregroundColor,
    };
  }), [ocorrencias, corDe]);

  const principal = agendas.find((a) => a.primary && podeEscrever(a)) ?? agendas.find(podeEscrever);

  const novo = (inicio: Date, fim: Date, diaInteiro: boolean) => {
    if (!principal) { toast.error("Nenhuma agenda com permissão de escrita"); return; }
    setAbertura({ tipo: "novo", form: novoForm(inicio, fim, diaInteiro, principal.id) });
  };

  const novoAgora = () => {
    const ini = new Date();
    ini.setMinutes(ini.getMinutes() < 30 ? 30 : 60, 0, 0);
    novo(ini, new Date(ini.getTime() + 60 * 60_000), false);
  };

  const abrir = async (id: string) => {
    const o = ocorrencias.find((x) => `${x.calendarId}::${x.evento.id}` === id);
    if (!o) return;
    try {
      const mestre = o.evento.recurringEventId ? await obterEvento(o.calendarId, o.evento.recurringEventId) : null;
      setAbertura({ tipo: "editar", aberto: { calendarId: o.calendarId, evento: o.evento, mestre } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o evento");
    }
  };

  const trocarVisao = (v: VisaoAgenda) => {
    setVisao(v);
    gravarLocal(CHAVE_VISAO, v);
    calRef.current?.getApi().changeView(v);
  };

  const alternarAgenda = (id: string) => {
    setOcultas((atual) => {
      const nova = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id];
      gravarLocal(CHAVE_OCULTAS, nova);
      return nova;
    });
  };

  const conectar = async () => {
    try {
      const st = await statusDoDrive(true);
      if (!st.client_id || !st.redirect_uri) { toast.error("Credenciais do Google não configuradas no projeto"); return; }
      const userId = (await getUserId()) || FALLBACK_USER_ID;
      window.location.href = oauthUrl(st.client_id, st.redirect_uri, userId, `${window.location.origin}/agenda`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a conexão");
    }
  };

  const api = () => calRef.current?.getApi();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <CalendarDays size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
            <p className="text-sm text-muted-foreground">Sua agenda do Google, direto no sistema</p>
          </div>
        </div>
        {estado === "pronto" && (
          <Button className="gap-2" onClick={novoAgora}><Plus size={16} /> Novo evento</Button>
        )}
      </div>

      {estado === "carregando" && <Skeleton className="h-[60vh] w-full rounded-xl" />}

      {estado === "erro" && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-destructive">
            {erro}
            <Button size="sm" variant="outline" onClick={iniciar}>Tentar de novo</Button>
          </CardContent>
        </Card>
      )}

      {estado === "sem_permissao" && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CalendarDays size={26} /></span>
            <p className="text-base font-semibold">Conecte a Agenda do Google</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Autorize uma vez com a conta contato@andrelopes.digital. A conexão do Drive (swipe file) continua a mesma.
            </p>
            <Button className="mt-1" onClick={conectar}>Conectar a Agenda do Google</Button>
          </CardContent>
        </Card>
      )}

      {estado === "sem_login" && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="space-y-3 p-4 text-sm">
            <p className="font-medium">Entre com o Google neste navegador para ver a agenda</p>
            {clientId ? <BotaoGoogleLogin clientId={clientId} onEntrou={iniciar} /> : <p className="text-muted-foreground">Configure o login Google no Admin.</p>}
          </CardContent>
        </Card>
      )}

      {estado === "pronto" && (
        <div className="grid items-start gap-5 lg:grid-cols-[220px_1fr]">
          <Card className="order-2 lg:order-1">
            <CardContent className="space-y-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agendas</p>
              {agendas.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={!ocultas.includes(a.id)}
                    onCheckedChange={() => alternarAgenda(a.id)}
                    style={{ borderColor: a.backgroundColor, backgroundColor: ocultas.includes(a.id) ? undefined : a.backgroundColor }}
                  />
                  <span className="truncate">{a.summaryOverride ?? a.summary}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          <div className="order-1 space-y-3 lg:order-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => api()?.today()}>Hoje</Button>
              <div className="flex">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => api()?.prev()} aria-label="Anterior"><ChevronLeft size={16} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => api()?.next()} aria-label="Próximo"><ChevronRight size={16} /></Button>
              </div>
              <h2 className="text-base font-semibold capitalize">{periodo?.titulo}</h2>
              {carregandoEventos && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={carregarEventos} aria-label="Atualizar"><RefreshCw size={14} /></Button>
                <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                  {VISOES.map((v) => (
                    <button
                      key={v.valor}
                      type="button"
                      onClick={() => trocarVisao(v.valor)}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                        visao === v.valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {v.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="h-[calc(100vh-15rem)] min-h-[560px] rounded-xl border bg-card p-2">
              {montado && (
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <AgendaGrade
                    visao={visao}
                    eventos={eventosGrade}
                    calRef={calRef}
                    onPeriodo={(inicio, fim, titulo) => setPeriodo({ inicio, fim, titulo })}
                    onSelecionar={novo}
                    onClicar={abrir}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      )}

      <EventoDialog abertura={abertura} agendas={agendas} onClose={() => setAbertura(null)} onMudou={carregarEventos} />
    </div>
  );
}
```

- [ ] **Step 3: Testes, tipos e build**

Run: `npm test` → Expected: PASS (todas as suítes).
Run: `npx tsc --noEmit -p . 2>&1 | grep -E "agenda|nav.tsx"` → Expected: nenhuma linha.
Run: `npm run build` → Expected: exit 0; `src/routeTree.gen.ts` passa a ter `/_authenticated/agenda`.

- [ ] **Step 4: Commit e push**

```bash
git add src/routes/_authenticated/agenda.tsx src/lib/nav.tsx src/routeTree.gen.ts
git commit -m "Agenda: aba /agenda com o Google Agenda (dia, semana, mês) no menu Operação"
git push origin main
```

---

### Task 8: Configuração, publicação e teste real

Feito no Chrome do usuário (autorizado por ele). Nada de código novo aqui, só correções que o teste revelar (cada uma com commit próprio).

- [ ] **Step 1: Ativar a Calendar API** — abrir `https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=gestao-de-operacao-509002` logado como `contato@andrelopes.digital` e clicar **Ativar**. Esperado: página da API mostra "API ativada".
- [ ] **Step 2: Publicar** — Lovable, projeto `b894ed2e-2f0d-4ef8-9bd0-7cb1ffbcdf51` → Publicar → Publicar alterações. Esperado: o texto "Agenda" aparece no menu do site.
- [ ] **Step 3: Reconectar** — em `https://gestao-de-operacao.lovable.app/agenda` clicar "Conectar a Agenda do Google" → consentimento com a conta `contato@andrelopes.digital` → volta para `/agenda` com "Agenda do Google conectada". Esperado: `google-token?action=status` mostra `calendar.events` no `scope`; o swipe file continua funcionando (Drive).
- [ ] **Step 4: Teste real (criar)** — criar "TESTE CLAUDE — apagar": amanhã 15:00–15:30, repetição "Semanal" personalizada (seg e qua, 4 ocorrências), participante `contato@andrelopes.digital` não (é o próprio) → usar `oandrelopesz@gmail.com` com "Não enviar", Meet ligado, notificações 10 min Notificação + 1 dia E-mail. Conferir via API (`events.get` do mestre): `recurrence`, `attendees`, `hangoutLink`, `reminders.overrides`, `start.timeZone`.
- [ ] **Step 5: Teste real (editar/excluir)** — mudar título "só este" numa ocorrência; mudar horário "este e os seguintes" na 3ª ocorrência (confere que a série antiga ganhou UNTIL e a nova tem COUNT=2 e o mesmo Meet); excluir "todos" nas duas séries; criar e excluir um evento de dia inteiro sem repetição. Conferir que nada de teste sobrou (`events.list` com `q=TESTE CLAUDE`).
- [ ] **Step 6: Visões** — alternar Dia/Semana/Mês, navegar ‹ ›, esconder/mostrar uma agenda; recarregar a página e conferir que a visão e as ocultas foram lembradas; tema escuro legível.
- [ ] **Step 7: Encerrar** — `git status` limpo, push feito, site publicado com a versão final.
