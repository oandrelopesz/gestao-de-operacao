# Plano A — Demandas: entrega e colunas com regra de data / dias da semana

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda demanda tem data de entrega, atualizada ao mover para colunas com regra de data. Qualquer coluna pode ser "por dias da semana", generalizando a coluna de fim de semana.

**Architecture:**
- **Banco:**
  - Cada coluna ganha `regra_data` e `dias_semana`; o card guarda `dia_semana` (0–6).
  - Triggers BEFORE, em ordem alfabética (`demandas_10_…`, `demandas_20_…`):
    1. normalizam o dia pela coluna;
    2. gravam `prazo` pela regra quando o card muda de coluna ou de dia.
  - Processos automáticos (virada, sincronização) ligam a flag de sessão `app.sem_regra_data` e não recalculam a entrega.
- **Front:** o módulo puro `src/lib/colunasDias.ts` substitui `src/lib/fimDeSemana.ts`, com containers `coluna:dia`.
- **Compatibilidade:** `dia_fim_de_semana` continua sincronizada até o front novo estar publicado. A Task 6 remove a coluna.

**Tech Stack:** React 19, dnd-kit, shadcn (Dialog, Popover, Calendar, Switch, Select), Supabase (Lovable Cloud, pg_cron), node --test.

**Spec:** `docs/superpowers/specs/2026-09-23-onboarding-roadmap-design.md`, seção "Adendo › A".

## Global Constraints

- Dias: `0 = domingo … 6 = sábado` (igual a `Date.getDay()` e `extract(dow)`). A ordem do array `dias_semana` é a ordem das seções na coluna.
- `regra_data` ∈ `'nenhuma' | 'hoje' | 'amanha' | 'depois_amanha' | 'dias_semana'`.
- Coluna de fim de semana = `regra_data 'dias_semana'`, `dias_semana {6,0}`: Sábado primeiro.
- "Hoje" = data de Brasília: `(now() AT TIME ZONE 'America/Sao_Paulo')::date` no SQL e `hojeBrasilia()` no front.
- Próximo dia da semana: hoje, se hoje já é o dia; senão, a próxima ocorrência.
- Id de seção: `${colunaId}:${dia}`. Ids de coluna só têm `[a-z0-9_]`.
- Flag de sessão que desliga o recálculo da entrega: `app.sem_regra_data = 'on'`, via `set_config(..., true)`.
- Migrations são aplicadas pelo **controlador** no SQL editor do Lovable. Implementadores só escrevem o arquivo.
- Preserve os finais de linha: arquivos CRLF continuam CRLF.
- Testes: `npm test` (`node --test src/lib/*.test.ts`). Módulos testados não importam com `@/`. Tipos: `npx tsc --noEmit`.
- Commits terminam com uma linha em branco e `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- UI em português.

---

### Task 1: Migration — regra de data, dias por coluna, entrega automática, app_config

**Files:**
- Create: `supabase/migrations/20260924090000_colunas_regra_data.sql`
- Modify: `src/integrations/supabase/types.ts`:
  - `demanda_colunas`: + `regra_data: string`, + `dias_semana: number[]`;
  - `demandas`: + `dia_semana: number | null`;
  - nova tabela `app_config`: `chave: string`, `valor: Json`, `updated_at: string`.
  - Em cada caso, Row, Insert (opcional) e Update (opcional).
- Modify: `src/lib/demandaColunas.ts` (tipo, fetch e DEFAULT_COLUMNS)

**Interfaces:**
- Produces:
  - `KanbanColumnDef` ganha `regra: RegraData; dias: number[]`. `RegraData` é exportado de `src/lib/colunasDias.ts` (Task 2). Para não depender da ordem das tasks, declare aqui `export type RegraData = "nenhuma" | "hoje" | "amanha" | "depois_amanha" | "dias_semana";` em `demandaColunas.ts`; a Task 2 reexporta do mesmo lugar.
  - SQL: `public.hoje_brt()`, `public.proximo_dia_semana(smallint)`, tabela `app_config`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Regra de data por coluna do Kanban e colunas "por dias da semana" (generaliza "Fazer no fim de semana").
-- Mover um card para uma coluna com regra grava a entrega (demandas.prazo). Virada e sincronizações
-- ligam app.sem_regra_data para não recalcular a entrega.

CREATE OR REPLACE FUNCTION public.hoje_brt() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $$;

-- Próxima ocorrência do dia da semana (0 = domingo … 6 = sábado); hoje, se hoje já é o dia
CREATE OR REPLACE FUNCTION public.proximo_dia_semana(p_dia smallint) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT public.hoje_brt() + ((p_dia - extract(dow FROM public.hoje_brt())::int + 7) % 7)
$$;

CREATE TABLE IF NOT EXISTS public.app_config (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_config' AND policyname = 'app_config_all') THEN
    CREATE POLICY "app_config_all" ON public.app_config FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
INSERT INTO public.app_config (chave, valor) VALUES ('virada_ativa', 'true'::jsonb) ON CONFLICT (chave) DO NOTHING;

ALTER TABLE public.demanda_colunas
  ADD COLUMN IF NOT EXISTS regra_data TEXT NOT NULL DEFAULT 'nenhuma'
    CHECK (regra_data IN ('nenhuma', 'hoje', 'amanha', 'depois_amanha', 'dias_semana')),
  ADD COLUMN IF NOT EXISTS dias_semana SMALLINT[] NOT NULL DEFAULT '{}';

UPDATE public.demanda_colunas SET regra_data = 'hoje' WHERE id = 'fazer_hoje';
UPDATE public.demanda_colunas SET regra_data = 'amanha' WHERE id = 'fazer_amanha';
UPDATE public.demanda_colunas SET regra_data = 'depois_amanha' WHERE id = 'fazer_depois_amanha';
UPDATE public.demanda_colunas SET regra_data = 'dias_semana', dias_semana = '{6,0}' WHERE id = 'fazer_fim_de_semana';

ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS dia_semana SMALLINT CHECK (dia_semana BETWEEN 0 AND 6);
UPDATE public.demandas SET dia_semana = CASE dia_fim_de_semana WHEN 'domingo' THEN 0 WHEN 'sabado' THEN 6 END
WHERE dia_fim_de_semana IS NOT NULL AND dia_semana IS NULL;

-- 1º BEFORE trigger (ordem alfabética): dia válido para a coluna; mantém dia_fim_de_semana (legado) em sincronia
DROP TRIGGER IF EXISTS demandas_ajusta_dia_fds ON public.demandas;
CREATE OR REPLACE FUNCTION public.demandas_ajusta_dia_semana()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dias SMALLINT[];
BEGIN
  -- Front antigo só escreve dia_fim_de_semana: traduz para dia_semana
  IF TG_OP = 'UPDATE' AND NEW.dia_fim_de_semana IS DISTINCT FROM OLD.dia_fim_de_semana
     AND NEW.dia_semana IS NOT DISTINCT FROM OLD.dia_semana THEN
    NEW.dia_semana := CASE NEW.dia_fim_de_semana WHEN 'domingo' THEN 0 WHEN 'sabado' THEN 6 ELSE NULL END;
  END IF;
  SELECT c.dias_semana INTO dias FROM public.demanda_colunas c WHERE c.id = NEW.status;
  IF dias IS NULL OR cardinality(dias) = 0 THEN
    NEW.dia_semana := NULL;
  ELSIF NEW.dia_semana IS NULL OR NOT (NEW.dia_semana = ANY (dias)) THEN
    NEW.dia_semana := dias[1];
  END IF;
  NEW.dia_fim_de_semana := CASE WHEN NEW.status = 'fazer_fim_de_semana' THEN
    CASE NEW.dia_semana WHEN 0 THEN 'domingo' WHEN 6 THEN 'sabado' END END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_10_dia_semana ON public.demandas;
CREATE TRIGGER demandas_10_dia_semana
  BEFORE INSERT OR UPDATE OF status, dia_semana, dia_fim_de_semana ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_ajusta_dia_semana();

-- 2º BEFORE trigger: entrega pela regra da coluna quando o card muda de coluna ou de dia
CREATE OR REPLACE FUNCTION public.demandas_aplica_regra_data()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r TEXT;
BEGIN
  IF current_setting('app.sem_regra_data', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.prazo IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.dia_semana IS NOT DISTINCT FROM OLD.dia_semana THEN RETURN NEW; END IF;
  SELECT c.regra_data INTO r FROM public.demanda_colunas c WHERE c.id = NEW.status;
  NEW.prazo := CASE r
    WHEN 'hoje' THEN public.hoje_brt()
    WHEN 'amanha' THEN public.hoje_brt() + 1
    WHEN 'depois_amanha' THEN public.hoje_brt() + 2
    WHEN 'dias_semana' THEN CASE WHEN NEW.dia_semana IS NULL THEN NEW.prazo ELSE public.proximo_dia_semana(NEW.dia_semana) END
    ELSE NEW.prazo
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_20_regra_data ON public.demandas;
CREATE TRIGGER demandas_20_regra_data
  BEFORE INSERT OR UPDATE OF status, dia_semana, dia_fim_de_semana ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_aplica_regra_data();

-- Virada: respeita app_config.virada_ativa e não recalcula a entrega dos cards que ela move
CREATE OR REPLACE FUNCTION public.virar_dia_demandas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hoje DATE := public.hoje_brt();
  base INTEGER;
  n INTEGER;
  total INTEGER := 0;
BEGIN
  IF (SELECT valor FROM app_config WHERE chave = 'virada_ativa') = 'false'::jsonb THEN
    RETURN 0;
  END IF;
  INSERT INTO demandas_viradas (dia) VALUES (hoje) ON CONFLICT (dia) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  PERFORM set_config('app.sem_regra_data', 'on', true);

  SELECT COALESCE(MAX(ordem), -1) + 1 INTO base FROM demandas WHERE status = 'fazer_hoje';

  WITH fila AS (
    SELECT id, row_number() OVER (ORDER BY ordem, created_at, id) - 1 AS pos
    FROM demandas WHERE status = 'fazer_amanha'
  )
  UPDATE demandas d SET status = 'fazer_hoje', ordem = base + fila.pos
  FROM fila WHERE d.id = fila.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;

  WITH fila AS (
    SELECT id, row_number() OVER (ORDER BY ordem, created_at, id) - 1 AS pos
    FROM demandas WHERE status = 'fazer_depois_amanha'
  )
  UPDATE demandas d SET status = 'fazer_amanha', ordem = fila.pos
  FROM fila WHERE d.id = fila.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;

  PERFORM set_config('app.sem_regra_data', 'off', true);
  UPDATE demandas_viradas SET movidas = total WHERE dia = hoje;
  RETURN total;
END $$;
REVOKE EXECUTE ON FUNCTION public.virar_dia_demandas() FROM PUBLIC, anon, authenticated;
```

- [ ] **Step 2: Tipos e colunas no front**

Em `src/lib/demandaColunas.ts`:
```ts
export type RegraData = "nenhuma" | "hoje" | "amanha" | "depois_amanha" | "dias_semana";

export interface KanbanColumnDef {
  id: string;
  title: string;
  color: string;
  hex: string;
  sistema: boolean;
  /** Data de entrega gravada ao mover um card para esta coluna */
  regra: RegraData;
  /** Dias da semana (0 = domingo … 6 = sábado) em que a coluna se divide; vazio = coluna simples */
  dias: number[];
}
```
- `DEFAULT_COLUMNS`:
  - `regra: "hoje" | "amanha" | "depois_amanha"` para as três colunas de dia;
  - `regra: "dias_semana", dias: [6, 0]` para `fazer_fim_de_semana`;
  - `regra: "nenhuma", dias: []` nas demais.
- `fetchDemandaColunas`: inclua `regra_data, dias_semana` no select e mapeie `regra: (row.regra_data ?? "nenhuma") as RegraData, dias: (row.dias_semana ?? []).map(Number)`.

Atualize `types.ts` como listado em Files, preservando a ordem alfabética das chaves.

- [ ] **Step 3: Verificar e commitar**

Run: `npx tsc --noEmit`. Esperado: sem erros. Se algum uso de `KanbanColumnDef` construir objetos literais, complete com `regra` e `dias`.
```bash
git add supabase/migrations/20260924090000_colunas_regra_data.sql src/integrations/supabase/types.ts src/lib/demandaColunas.ts
git commit -m "Demandas: regra de data por coluna, colunas por dias da semana e entrega automática (banco)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4 (controlador): aplicar no Lovable e testar num bloco que termina com RAISE**

Teste:
1. mover um card de `standby` para `fazer_amanha` → `prazo = hoje+1`;
2. depois para `fazer_fim_de_semana` com `dia_semana = 0` → o próximo domingo;
3. update só de `dia_fim_de_semana = 'sabado'` (front antigo) → `dia_semana = 6` e prazo no sábado;
4. `SELECT set_config('app.sem_regra_data','on',true)` e mover de volta → prazo inalterado.

---

### Task 2: Módulo puro `colunasDias.ts` + `entrega.ts` (substitui `fimDeSemana.ts`)

**Files:**
- Create: `src/lib/colunasDias.ts`, `src/lib/colunasDias.test.ts`, `src/lib/entrega.ts`, `src/lib/entrega.test.ts`
- Delete: `src/lib/fimDeSemana.ts`, `src/lib/fimDeSemana.test.ts`. Remova-os **nesta task só se** nenhum arquivo importar mais deles; como a Task 3 ainda os usa, **deixe-os** e a Task 3 apaga.

**Interfaces:**
- Produces (`src/lib/colunasDias.ts`):
  - `NOMES_DIA: string[]` (índice 0–6), `NOMES_DIA_CURTO: string[]`
  - `rotuloFazerNoDia(dia: number): string` → "Fazer no sábado", "Fazer na segunda"
  - `type MapaDias = Record<string, number[]>`
  - `interface ItemDia { id: string; status: string; ordem?: number | null; dia_semana?: number | null }`
  - `secaoId(coluna: string, dia: number): string`
  - `parseSecao(container: string): { coluna: string; dia: number } | null`
  - `mapaDias(colunas: { id: string; dias: number[] }[]): MapaDias`, só com as colunas que têm dias
  - `containerIdsDoQuadro(colunas: { id: string; dias: number[] }[]): string[]`
  - `diaEfetivo(d: ItemDia, mapa: MapaDias): number | null`
  - `containerDe(d: ItemDia, mapa: MapaDias): string`
  - `aplicarContainer<T extends ItemDia>(d: T, container: string): T`
  - `moverParaDia<T extends ItemDia>(lista: T[], id: string, dia: number, mapa: MapaDias): T[]`, que devolve a MESMA referência se o card já está no dia
  - `camposParaSalvar(d: ItemDia, mapa: MapaDias): { status: string; ordem: number; dia_semana: number | null }`
- Produces (`src/lib/entrega.ts`):
  - `hojeBrasilia(agora?: Date): string` (YYYY-MM-DD)
  - `diasDeAtraso(prazo: string | null | undefined, hoje: string): number`
  - `formatarDataCurta(iso: string): string` ("26/09")

- [ ] **Step 1: Testes**

`src/lib/colunasDias.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  NOMES_DIA, rotuloFazerNoDia, secaoId, parseSecao, mapaDias, containerIdsDoQuadro, diaEfetivo,
  containerDe, aplicarContainer, moverParaDia, camposParaSalvar,
} from "./colunasDias.ts";

const colunas = [
  { id: "fazer_hoje", dias: [] },
  { id: "fazer_fim_de_semana", dias: [6, 0] },
  { id: "segunda_x", dias: [1] },
  { id: "standby", dias: [] },
];
const mapa = mapaDias(colunas);

test("nomes e rótulos dos dias", () => {
  assert.equal(NOMES_DIA[0], "Domingo");
  assert.equal(NOMES_DIA[6], "Sábado");
  assert.equal(rotuloFazerNoDia(6), "Fazer no sábado");
  assert.equal(rotuloFazerNoDia(0), "Fazer no domingo");
  assert.equal(rotuloFazerNoDia(1), "Fazer na segunda");
});

test("secaoId / parseSecao", () => {
  assert.equal(secaoId("fazer_fim_de_semana", 6), "fazer_fim_de_semana:6");
  assert.deepEqual(parseSecao("fazer_fim_de_semana:0"), { coluna: "fazer_fim_de_semana", dia: 0 });
  assert.equal(parseSecao("fazer_hoje"), null);
  assert.equal(parseSecao("x:7"), null);
});

test("mapaDias só com colunas que têm dias; containers no lugar da coluna, na ordem dos dias", () => {
  assert.deepEqual(mapa, { fazer_fim_de_semana: [6, 0], segunda_x: [1] });
  assert.deepEqual(containerIdsDoQuadro(colunas), ["fazer_hoje", "fazer_fim_de_semana:6", "fazer_fim_de_semana:0", "segunda_x:1", "standby"]);
});

test("diaEfetivo/containerDe: dia inválido ou vazio vira o primeiro dia da coluna", () => {
  assert.equal(diaEfetivo({ id: "a", status: "fazer_fim_de_semana", dia_semana: 0 }, mapa), 0);
  assert.equal(diaEfetivo({ id: "a", status: "fazer_fim_de_semana", dia_semana: null }, mapa), 6);
  assert.equal(diaEfetivo({ id: "a", status: "fazer_fim_de_semana", dia_semana: 3 }, mapa), 6);
  assert.equal(diaEfetivo({ id: "a", status: "standby", dia_semana: 3 }, mapa), null);
  assert.equal(containerDe({ id: "a", status: "fazer_fim_de_semana", dia_semana: 0 }, mapa), "fazer_fim_de_semana:0");
  assert.equal(containerDe({ id: "a", status: "standby", dia_semana: 0 }, mapa), "standby");
});

test("aplicarContainer: seção grava status e dia; coluna simples apaga o dia", () => {
  const d = { id: "a", status: "fazer_hoje", dia_semana: null as number | null, titulo: "x" };
  const dentro = aplicarContainer(d, "segunda_x:1");
  assert.deepEqual(dentro, { id: "a", status: "segunda_x", dia_semana: 1, titulo: "x" });
  assert.deepEqual(aplicarContainer(dentro, "standby"), { id: "a", status: "standby", dia_semana: null, titulo: "x" });
});

const fds = (id: string, dia: number, ordem: number) => ({ id, status: "fazer_fim_de_semana", dia_semana: dia, ordem });

test("moverParaDia: vai para o fim do outro dia e renumera as duas seções", () => {
  const lista = [fds("s1", 6, 0), fds("s2", 6, 1), fds("s3", 6, 2), fds("d1", 0, 0)];
  const r = moverParaDia(lista, "s2", 0, mapa);
  const por = Object.fromEntries(r.map((d) => [d.id, `${d.dia_semana}:${d.ordem}`]));
  assert.deepEqual(por, { s1: "6:0", s3: "6:1", d1: "0:0", s2: "0:1" });
});

test("moverParaDia: já no dia pedido devolve a mesma lista; id desconhecido também", () => {
  const lista = [fds("s1", 6, 0)];
  assert.equal(moverParaDia(lista, "s1", 6, mapa), lista);
  assert.equal(moverParaDia(lista, "zzz", 0, mapa), lista);
});

test("camposParaSalvar: dia só em coluna com dias", () => {
  assert.deepEqual(camposParaSalvar({ id: "a", status: "standby", ordem: 2, dia_semana: 6 }, mapa), { status: "standby", ordem: 2, dia_semana: null });
  assert.deepEqual(camposParaSalvar({ id: "a", status: "fazer_fim_de_semana", ordem: null, dia_semana: null }, mapa), { status: "fazer_fim_de_semana", ordem: 0, dia_semana: 6 });
});
```

`src/lib/entrega.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { hojeBrasilia, diasDeAtraso, formatarDataCurta } from "./entrega.ts";

test("hojeBrasilia usa o fuso de São Paulo", () => {
  // 02:00 UTC do dia 24 ainda é dia 23 em Brasília (UTC-3)
  assert.equal(hojeBrasilia(new Date("2026-09-24T02:00:00Z")), "2026-09-23");
  assert.equal(hojeBrasilia(new Date("2026-09-24T03:30:00Z")), "2026-09-24");
});

test("diasDeAtraso", () => {
  assert.equal(diasDeAtraso("2026-09-20", "2026-09-23"), 3);
  assert.equal(diasDeAtraso("2026-09-23", "2026-09-23"), 0);
  assert.equal(diasDeAtraso("2026-09-25", "2026-09-23"), 0);
  assert.equal(diasDeAtraso(null, "2026-09-23"), 0);
});

test("formatarDataCurta", () => {
  assert.equal(formatarDataCurta("2026-09-05"), "05/09");
});
```

- [ ] **Step 2:** `npm test`. Esperado: FAIL, módulos inexistentes.

- [ ] **Step 3: Implementar**

`src/lib/colunasDias.ts`:
```ts
// Colunas do Kanban "por dias da semana" (ex.: Fazer no fim de semana = sábado e domingo). No quadro,
// cada dia vira uma seção de drag-and-drop com id "coluna:dia". Aqui fica a tradução entre o banco
// (status + dia_semana, 0 = domingo … 6 = sábado) e esses containers.
export const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const NOMES_DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function rotuloFazerNoDia(dia: number): string {
  const nome = NOMES_DIA[dia].toLowerCase();
  return dia === 0 || dia === 6 ? `Fazer no ${nome}` : `Fazer na ${nome}`;
}

export type MapaDias = Record<string, number[]>;

export interface ItemDia {
  id: string;
  status: string;
  ordem?: number | null;
  dia_semana?: number | null;
}

export const secaoId = (coluna: string, dia: number) => `${coluna}:${dia}`;

export function parseSecao(container: string): { coluna: string; dia: number } | null {
  const m = /^(.+):([0-6])$/.exec(container);
  return m ? { coluna: m[1], dia: Number(m[2]) } : null;
}

export function mapaDias(colunas: { id: string; dias: number[] }[]): MapaDias {
  const mapa: MapaDias = {};
  for (const c of colunas) if (c.dias.length) mapa[c.id] = c.dias;
  return mapa;
}

export function containerIdsDoQuadro(colunas: { id: string; dias: number[] }[]): string[] {
  return colunas.flatMap((c) => (c.dias.length ? c.dias.map((d) => secaoId(c.id, d)) : [c.id]));
}

export function diaEfetivo(d: ItemDia, mapa: MapaDias): number | null {
  const dias = mapa[d.status];
  if (!dias) return null;
  return d.dia_semana != null && dias.includes(d.dia_semana) ? d.dia_semana : dias[0];
}

export function containerDe(d: ItemDia, mapa: MapaDias): string {
  const dia = diaEfetivo(d, mapa);
  return dia == null ? d.status : secaoId(d.status, dia);
}

export function aplicarContainer<T extends ItemDia>(d: T, container: string): T {
  const secao = parseSecao(container);
  if (secao) return { ...d, status: secao.coluna, dia_semana: secao.dia };
  return { ...d, status: container, dia_semana: null };
}

const porOrdem = (a: ItemDia, b: ItemDia) => (a.ordem ?? 0) - (b.ordem ?? 0);

/** Leva o card para o fim do `dia` (na coluna dele) e renumera as duas seções. */
export function moverParaDia<T extends ItemDia>(lista: T[], id: string, dia: number, mapa: MapaDias): T[] {
  const card = lista.find((d) => d.id === id);
  if (!card) return lista;
  const origem = containerDe(card, mapa);
  const destino = secaoId(card.status, dia);
  if (origem === destino || !mapa[card.status]?.includes(dia)) return lista;
  const ordem = new Map<string, number>();
  lista.filter((d) => d.id !== id && containerDe(d, mapa) === origem).sort(porOrdem).forEach((d, i) => ordem.set(d.id, i));
  const doDia = lista.filter((d) => d.id !== id && containerDe(d, mapa) === destino).sort(porOrdem);
  doDia.forEach((d, i) => ordem.set(d.id, i));
  ordem.set(id, doDia.length);
  return lista.map((d) => {
    const base = d.id === id ? aplicarContainer(d, destino) : d;
    return ordem.has(d.id) ? { ...base, ordem: ordem.get(d.id) } : base;
  });
}

export function camposParaSalvar(d: ItemDia, mapa: MapaDias) {
  return { status: d.status, ordem: d.ordem ?? 0, dia_semana: diaEfetivo(d, mapa) };
}
```

`src/lib/entrega.ts`:
```ts
/** Data de hoje em Brasília (YYYY-MM-DD), a mesma usada pelo banco (hoje_brt). */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

const DIA_MS = 24 * 60 * 60 * 1000;
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Quantos dias a entrega já passou (0 = em dia ou sem entrega). */
export function diasDeAtraso(prazo: string | null | undefined, hoje: string): number {
  if (!prazo) return 0;
  const d = Math.round((utc(hoje) - utc(prazo)) / DIA_MS);
  return d > 0 ? d : 0;
}

export function formatarDataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
```

- [ ] **Step 4:** `npm test`. Esperado: todos PASS. Rode também `npx tsc --noEmit`.
- [ ] **Step 5: Commit**
```bash
git add src/lib/colunasDias.ts src/lib/colunasDias.test.ts src/lib/entrega.ts src/lib/entrega.test.ts
git commit -m "Demandas: lógica das colunas por dias da semana e da data de entrega" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Quadro usa colunas por dias genéricas (card, coluna, popup, página)

**Files:**
- Modify: `src/components/EscolherDiaDialog.tsx`, `src/components/KanbanCard.tsx`, `src/components/KanbanColumn.tsx`, `src/routes/_authenticated/index.tsx`
- Delete: `src/lib/fimDeSemana.ts`, `src/lib/fimDeSemana.test.ts`

**Interfaces:**
- Consumes: Task 2 (`colunasDias.ts`, `entrega.ts`); Task 1 (`KanbanColumnDef.regra/dias`).
- Produces:
  - `EscolherDiaDialog({ aberto, titulo, dias, sugerido, onEscolher(dia: number), onCancelar })`
  - `KanbanCard`/`KanbanCardView` aceitam `diasDaColuna?: number[]` e `onSetDia?: (id: string, dia: number) => void`
  - `KanbanColumn` aceita `diasDaColuna?: number[]` e repassa aos cards; `secoes` fica como está: `{ id, titulo, demandas }[]`
  - A interface `Demanda` do card e da coluna troca `dia_fim_de_semana?: string | null` por `dia_semana?: number | null` e ganha `prazo?: string | null`

- [ ] **Step 1: Popup genérico** (`EscolherDiaDialog.tsx`)
```tsx
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NOMES_DIA } from "@/lib/colunasDias";

/** Pergunta em que dia a demanda vai ser feita ao entrar numa coluna por dias. Fechar = desistir do movimento. */
export function EscolherDiaDialog({ aberto, titulo, dias, sugerido, onEscolher, onCancelar }: {
  aberto: boolean;
  titulo: string;
  dias: number[];
  sugerido: number | null;
  onEscolher: (dia: number) => void;
  onCancelar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onCancelar(); }}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Em que dia você vai fazer essa demanda?</DialogDescription>
        </DialogHeader>
        <div className={dias.length > 2 ? "grid grid-cols-3 gap-2 pt-2" : "grid grid-cols-2 gap-2 pt-2"}>
          {dias.map((dia) => (
            <Button key={dia} variant={dia === sugerido ? "default" : "outline"} className="h-12 text-base" onClick={() => onEscolher(dia)} autoFocus={dia === sugerido}>
              {NOMES_DIA[dia]}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Card** (`KanbanCard.tsx`)
- Imports:
  - troque o import de `@/lib/fimDeSemana` por `import { NOMES_DIA, rotuloFazerNoDia } from "@/lib/colunasDias";` e `import { hojeBrasilia, diasDeAtraso, formatarDataCurta } from "@/lib/entrega";`;
  - acrescente `AlertTriangle` ao import do lucide.
- Interface `Demanda`:
  - troque `dia_fim_de_semana?: string | null` por `dia_semana?: number | null`;
  - acrescente `prazo?: string | null`.
- Props:
  - `onSetDia?: (id: string, dia: number) => void` substitui a versão `DiaFds`;
  - acrescente `diasDaColuna?: number[]`.
  - Repasse os dois no wrapper `KanbanCard`.
- No corpo de `KanbanCardView`:
```tsx
  const diaCard = diasDaColuna?.length
    ? (demanda.dia_semana != null && diasDaColuna.includes(demanda.dia_semana) ? demanda.dia_semana : diasDaColuna[0])
    : null;
  const atraso = !isDone && !isRecorrenteMae ? diasDeAtraso(demanda.prazo, hojeBrasilia()) : 0;
```
- No `className` do `<Card>`, acrescente `atraso > 0 && "border-red-500/70 bg-red-500/5 ring-1 ring-red-500/30"`.
- Menu ⋯, no lugar dos itens de `DIAS_FDS`:
```tsx
                  {onSetDia && diasDaColuna && diasDaColuna.length > 1 && diasDaColuna.map((dia) => (
                    <DropdownMenuItem
                      key={dia}
                      disabled={diaCard === dia}
                      onClick={(e) => { e.stopPropagation(); onSetDia(demanda.id, dia); }}
                      className="gap-2 py-1.5"
                    >
                      <CalendarDays size={12} /> {rotuloFazerNoDia(dia)}
                    </DropdownMenuItem>
                  ))}
```
- Linha de selos:
  - condição: `(demanda.clientes?.nome || demanda.descricao || isRecorrenteMae || diaCard != null || demanda.prazo)`.
  - Selo de dia, no lugar do de fim de semana: `{diaCard != null && (<span …mesmas classes…><CalendarDays size={10} /> {NOMES_DIA[diaCard]}</span>)}`.
  - Selo de entrega, logo depois:
```tsx
              {demanda.prazo && !isRecorrenteMae && (
                atraso > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500 text-white" title={`Entrega era ${formatarDataCurta(demanda.prazo)}`}>
                    <AlertTriangle size={10} /> Atrasada há {atraso} {atraso === 1 ? "dia" : "dias"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-600 dark:text-zinc-300" title="Data de entrega">
                    <CalendarDays size={10} /> Entrega {formatarDataCurta(demanda.prazo)}
                  </span>
                )
              )}
```

- [ ] **Step 3: Coluna** (`KanbanColumn.tsx`)
- Remova o import de `@/lib/fimDeSemana`.
- Interface `Demanda`: troque `dia_fim_de_semana` por `dia_semana?: number | null` e acrescente `prazo?: string | null`.
- Props:
  - `onSetDia?: (id: string, dia: number) => void`;
  - `diasDaColuna?: number[]`.
- `renderCard` passa `diasDaColuna={diasDaColuna}` e `onSetDia={onSetDia}`.
- `emptyMessages`: a chave `fazer_fim_de_semana` continua.

- [ ] **Step 4: Página** (`index.tsx`)
- Imports:
  - troque o bloco de import de `@/lib/fimDeSemana` por `import { mapaDias as montarMapaDias, containerIdsDoQuadro, containerDe, aplicarContainer, moverParaDia, camposParaSalvar, parseSecao, secaoId, NOMES_DIA } from "@/lib/colunasDias";`;
  - acrescente `useCallback` ao import do React se faltar.
- Estado e helpers (substituem os atuais):
```tsx
  const mapa = useMemo(() => montarMapaDias(columns), [columns]);
  const containerIds = useMemo(() => containerIdsDoQuadro(columns), [columns]);
  const getContainer = useCallback((d: any) => containerDe(d, mapa), [mapa]);
  const [escolhaDia, setEscolhaDia] = useState<{ id: string; origem: string; coluna: string; sugerido: number } | null>(null);
```
- `salvarContainers`: filtro por `getContainer(d)` e update com `camposParaSalvar(d, mapa)`.
- `useKanbanDnd`: `getContainer`, `setContainer: aplicarContainer`, `containerIds`.
- `onDrop`: abre o popup quando entra numa coluna por dias vinda de fora dela:
```tsx
      const alvo = parseSecao(target);
      if (alvo && parseSecao(origin)?.coluna !== alvo.coluna) {
        setEscolhaDia({ id: activeId, origem: origin, coluna: alvo.coluna, sugerido: alvo.dia });
        return;
      }
      await salvarContainers(finalList, [origin, target]);
```
- `escolherDia(dia: number)`:
```tsx
    if (!escolhaDia) return;
    const lista = moverParaDia(demandas, escolhaDia.id, dia, mapa);
    setDemandas(lista);
    setEscolhaDia(null);
    await salvarContainers(lista, [escolhaDia.origem, ...(mapa[escolhaDia.coluna] ?? []).map((d) => secaoId(escolhaDia.coluna, d))]);
```
- `mudarDia(id: string, dia: number)`: pega a coluna do card:
```tsx
    const card = demandas.find((d) => d.id === id);
    if (!card) return;
    const lista = moverParaDia(demandas, id, dia, mapa);
    if (lista === demandas) return;
    setDemandas(lista);
    await salvarContainers(lista, (mapa[card.status] ?? []).map((d) => secaoId(card.status, d)));
```
- Render das colunas:
```tsx
  const secoes = col.dias.length
    ? col.dias.map((dia) => ({ id: secaoId(col.id, dia), titulo: NOMES_DIA[dia], demandas: cards.filter((d) => getContainer(d) === secaoId(col.id, dia)) }))
    : undefined;
```
  - Passe `diasDaColuna={col.dias}` ao `KanbanColumn`.
- Popup:
```tsx
      <EscolherDiaDialog
        aberto={!!escolhaDia}
        titulo={columns.find((c) => c.id === escolhaDia?.coluna)?.title ?? ""}
        dias={escolhaDia ? mapa[escolhaDia.coluna] ?? [] : []}
        sugerido={escolhaDia?.sugerido ?? null}
        onEscolher={escolherDia}
        onCancelar={cancelarEscolhaDia}
      />
```
- `handleSubmit`: troque a linha de `dia_fim_de_semana` por:
```tsx
      const diasCol = mapa[sanitizedValues.status];
      sanitizedValues.dia_semana = diasCol?.length
        ? (diasCol.includes(editingDemanda?.dia_semana) ? editingDemanda.dia_semana : diasCol[0])
        : null;
```
- Delete `src/lib/fimDeSemana.ts` e `src/lib/fimDeSemana.test.ts` (`git rm`). Confirme com `grep -rn "fimDeSemana\|dia_fim_de_semana" src` que só sobra `types.ts`.

- [ ] **Step 5:** `npx tsc --noEmit` e `npm test` limpos.
- [ ] **Step 6: Commit**
```bash
git add -A src/components/EscolherDiaDialog.tsx src/components/KanbanCard.tsx src/components/KanbanColumn.tsx src/routes/_authenticated/index.tsx src/lib/fimDeSemana.ts src/lib/fimDeSemana.test.ts
git commit -m "Demandas: qualquer coluna pode ser por dias da semana; entrega e atraso no card" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Painel do card — campo "Entrega"

**Files:**
- Modify: `src/components/demandas/DemandaDrawer.tsx`

**Interfaces:**
- Consumes: `formatarDataCurta`, `hojeBrasilia`, `diasDeAtraso` de `@/lib/entrega`; `onUpdate(id, { prazo })`, que já existe e atualiza o estado local.

- [ ] **Step 1:** na interface `Demanda` do drawer, acrescente `prazo?: string | null`.
- [ ] **Step 2:** abaixo da linha "Cliente", adicione a linha **"Entrega"**, no mesmo grid `grid-cols-[120px,1fr]`, com o ícone `CalendarDays`:
  - um `Popover` com um botão que mostra `formatarDataCurta(prazo)` e o dia da semana (ex.: "26/09 · sexta"), ou "Definir data";
  - dentro, `Calendar mode="single"`, com `selected` = data local de `prazo` e `onSelect` → `saveUpdate({ prazo: format(date, "yyyy-MM-dd") })`, usando `format` de `date-fns`. Não use `toISOString`: o fuso desloca o dia;
  - ao lado, um botão "×" (`title="Remover data"`), visível quando há prazo, que chama `saveUpdate({ prazo: null })`;
  - se `diasDeAtraso(prazo, hojeBrasilia()) > 0` e o status não é `feito`, mostra o texto vermelho "Atrasada há N dias".
  - Veja como o drawer já usa `Popover`/`Calendar` em `handleDateSelect` (recorrência) e siga o mesmo estilo.
- [ ] **Step 3:** `npx tsc --noEmit`.
- [ ] **Step 4: Commit**
```bash
git add src/components/demandas/DemandaDrawer.tsx
git commit -m "Demandas: campo Entrega no painel do card" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Criar/editar coluna com regra de data e dias + virada no Admin

**Files:**
- Create: `src/components/demandas/RegraDataCampos.tsx`, `src/lib/appConfig.ts`
- Modify: `src/routes/_authenticated/index.tsx` (diálogo de coluna, ~linhas 170-215 e 794-840), `src/routes/_authenticated/admin.tsx` (card "Colunas do Kanban", ~700-750, diálogo ~986-1010, `saveColuna` ~392-425)

**Interfaces:**
- Produces:
  - `RegraDataCampos({ regra, dias, onChange(regra: RegraData, dias: number[]) })`
  - `appConfig.ts`: `getConfig<T>(chave: string, padrao: T): Promise<T>`, `setConfig(chave: string, valor: unknown): Promise<void>`, `useConfig<T>(chave: string, padrao: T): [T, (v: T) => Promise<void>, boolean]` (valor, salvar, carregando). O Plano C usa estes.

- [ ] **Step 1: `RegraDataCampos.tsx`**
```tsx
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { NOMES_DIA_CURTO } from "@/lib/colunasDias";
import type { RegraData } from "@/lib/demandaColunas";

const REGRAS: { id: RegraData; label: string; ajuda: string }[] = [
  { id: "nenhuma", label: "Sem data automática", ajuda: "A entrega fica como está ao mover para cá." },
  { id: "hoje", label: "Hoje", ajuda: "Ao mover para cá, a entrega vira hoje." },
  { id: "amanha", label: "Amanhã", ajuda: "Ao mover para cá, a entrega vira amanhã." },
  { id: "depois_amanha", label: "Depois de amanhã", ajuda: "Ao mover para cá, a entrega vira depois de amanhã." },
  { id: "dias_semana", label: "Dias da semana", ajuda: "A coluna se divide por dia; ao mover para cá você escolhe o dia e a entrega vira o próximo dia escolhido." },
];
// Ordem de exibição: segunda a domingo
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

export function RegraDataCampos({ regra, dias, onChange }: { regra: RegraData; dias: number[]; onChange: (regra: RegraData, dias: number[]) => void }) {
  const alternar = (d: number) => {
    const novo = dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d];
    // Ordem das seções: a ordem de segunda a domingo, exceto fim de semana que mantém sábado antes de domingo
    onChange(regra, ORDEM_DIAS.filter((x) => novo.includes(x)));
  };
  return (
    <div className="space-y-2">
      <Label>Data de entrega ao mover para esta coluna</Label>
      <Select value={regra} onValueChange={(v) => { if (v) onChange(v as RegraData, v === "dias_semana" ? (dias.length ? dias : [6, 0]) : []); }}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {REGRAS.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{REGRAS.find((r) => r.id === regra)?.ajuda}</p>
      {regra === "dias_semana" && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {ORDEM_DIAS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => alternar(d)}
              className={cn(
                "h-8 min-w-[44px] px-2 rounded-md border text-xs font-medium transition-colors",
                dias.includes(d) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent",
              )}
            >
              {NOMES_DIA_CURTO[d]}
            </button>
          ))}
        </div>
      )}
      {regra === "dias_semana" && dias.length === 0 && <p className="text-xs text-destructive">Marque pelo menos um dia.</p>}
    </div>
  );
}
```
The `ORDEM_DIAS` puts Saturday before Sunday, so `{6,0}` sorts as Sáb, Dom. That is the required section order.

- [ ] **Step 2: `appConfig.ts`**
```ts
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Configurações simples do sistema (tabela app_config: chave → valor JSON). */
export async function getConfig<T>(chave: string, padrao: T): Promise<T> {
  const { data, error } = await supabase.from("app_config" as any).select("valor").eq("chave", chave).maybeSingle();
  if (error || !data) return padrao;
  return ((data as any).valor ?? padrao) as T;
}

export async function setConfig(chave: string, valor: unknown): Promise<void> {
  const { error } = await supabase.from("app_config" as any).upsert({ chave, valor, updated_at: new Date().toISOString() } as any);
  if (error) throw error;
}

export function useConfig<T>(chave: string, padrao: T): [T, (v: T) => Promise<void>, boolean] {
  const [valor, setValor] = useState<T>(padrao);
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    let vivo = true;
    getConfig(chave, padrao).then((v) => { if (vivo) { setValor(v); setCarregando(false); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  const salvar = async (v: T) => {
    const antes = valor;
    setValor(v);
    try { await setConfig(chave, v); } catch (e) { setValor(antes); throw e; }
  };
  return [valor, salvar, carregando];
}
```

- [ ] **Step 3: Diálogo de coluna no quadro** (`index.tsx`)
- `ColumnDialogState` ganha `regra: RegraData; dias: number[]`.
- Ao abrir:
  - "rename" (Editar coluna) usa `col.regra`/`col.dias`;
  - "create" usa `regra: "nenhuma", dias: []`.
- No formulário, abaixo das cores: `<RegraDataCampos regra={columnDialog.regra} dias={columnDialog.dias} onChange={(regra, dias) => setColumnDialog({ ...columnDialog, regra, dias })} />`.
- Salvar:
  - inclua `regra_data: columnDialog.regra, dias_semana: columnDialog.dias` no update e no insert;
  - bloqueie o salvamento se `regra === "dias_semana" && dias.length === 0`, com `toast.error("Marque pelo menos um dia")`;
  - após salvar, recarregue colunas **e** demandas: mudar dias pode reatribuir `dia_semana` via trigger na próxima gravação; o recarregamento só atualiza a tela.
- Título do diálogo: "Editar coluna" (o item do menu da coluna passa a dizer **"Editar coluna"** em vez de "Editar nome").

- [ ] **Step 4: Admin** (`admin.tsx`, card "Colunas do Kanban")
- Mesmo tratamento no `ColunaDialog`/`saveColuna`: estado `regra`/`dias`, `<RegraDataCampos …/>`, gravação de `regra_data`/`dias_semana` e a mesma validação.
- Na lista de colunas, abaixo do id, mostre a regra em texto: "Entrega: hoje" / "Entrega: amanhã" / "Entrega: depois de amanhã" / "Dias: Sáb, Dom" / nada, para "nenhuma".
- No `CardHeader` desse card, abaixo da descrição, acrescente uma linha com `Switch` + texto "Virada automática à meia-noite (amanhã → hoje, depois de amanhã → amanhã)", ligada a `useConfig<boolean>("virada_ativa", true)`, com `toast` de erro se falhar.

- [ ] **Step 5:** `npx tsc --noEmit` e `npm test`.
- [ ] **Step 6: Commit**
```bash
git add src/components/demandas/RegraDataCampos.tsx src/lib/appConfig.ts src/routes/_authenticated/index.tsx src/routes/_authenticated/admin.tsx
git commit -m "Demandas: criar/editar coluna com regra de data e dias da semana; virada liga/desliga no Admin" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 (controlador, depois do push): remover o legado `dia_fim_de_semana`

Só depois do push. O site publicado se atualiza a cada push (memória `lovable-build-falhando`). Aplique no Lovable:
```sql
CREATE OR REPLACE FUNCTION public.demandas_ajusta_dia_semana()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dias SMALLINT[];
BEGIN
  SELECT c.dias_semana INTO dias FROM public.demanda_colunas c WHERE c.id = NEW.status;
  IF dias IS NULL OR cardinality(dias) = 0 THEN
    NEW.dia_semana := NULL;
  ELSIF NEW.dia_semana IS NULL OR NOT (NEW.dia_semana = ANY (dias)) THEN
    NEW.dia_semana := dias[1];
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_10_dia_semana ON public.demandas;
DROP TRIGGER IF EXISTS demandas_20_regra_data ON public.demandas;
ALTER TABLE public.demandas DROP COLUMN IF EXISTS dia_fim_de_semana;
DROP FUNCTION IF EXISTS public.demandas_ajusta_dia_fds();
CREATE TRIGGER demandas_10_dia_semana BEFORE INSERT OR UPDATE OF status, dia_semana ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_ajusta_dia_semana();
CREATE TRIGGER demandas_20_regra_data BEFORE INSERT OR UPDATE OF status, dia_semana ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_aplica_regra_data();
```
Salve o mesmo SQL como `supabase/migrations/20260924093000_remove_dia_fim_de_semana.sql` e remova `dia_fim_de_semana` de `types.ts`. Commit e push.
