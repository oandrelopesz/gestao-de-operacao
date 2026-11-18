# Demandas agendadas: plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento. Pelo CLAUDE.md global do André, este plano (6 tarefas) roda pelo fluxo /jev-plano; os itens no formato do Jev estão no fim.

**Objetivo:** criar na aba Demandas um botão destacado "Agendar", para guardar uma tarefa com data marcada (ex.: 25/01) fora do quadro, e um botão "Agendadas", para ver, editar, excluir e marcar como feita. A tarefa desce sozinha para o quadro: "Fazer depois de amanhã" 2 dias antes, depois "Fazer amanhã" e "Fazer hoje".

**Arquitetura:** a agendada é uma demanda comum com `status = 'agendadas'`, uma coluna de sistema que existe no banco mas fica escondida no front. A data agendada é o próprio `prazo`. O banco faz toda a descida: (1) um gatilho BEFORE leva para a coluna certa na hora a agendada nova ou com a data mudada que já está a 2 dias ou menos; (2) a virada da meia-noite (`virar_dia_demandas`, que chama `rolar_colunas_por_dia`) desce as agendadas cujo dia chegou a 2 dias ou menos. Nenhuma coluna nova aparece no quadro.

**Tecnologias:** Postgres/Supabase (plpgsql, gatilhos, pg_cron já ligado), React + TanStack Router, shadcn/ui (Sheet, Dialog, Button), react-hook-form + zod, `node --test`, Playwright (`playwright-core`) com `sessao-teste.mjs`.

**Spec:** pedido do André em 18/11/2026 (sem spec separada), copiado aqui:
> "na aba de demandas, coloque um botao, nao precisa ser uma nova coluna, mas um botao com mais destaque para setar uma tarefa pontualmente agendada. tipo, eu tenho uma tarefa que eu preciso fazer dia 25 de janeiro, eu ja deixo ela setada la, com a data, o cliente atribuido, descrição e notas se eu quiser colocar e etc, assim como as tarefas normal, mas fica pra agendar nesse botao, aí quando a data for se aproximando, ela desce pro pipeline, depois de amanha, depois troca pra amanha, depois pra hoje e por ai vai, nao precisa de uma coluna pra isso e coloca um botao pra consultar as tarefas agendadas, editar, excluir, marcar como feita e por aí vai"

**Notas do cofre para ler antes:** `_knowledge/modulos/demandas.md`, `_knowledge/tecnico/banco-de-dados.md`, `_knowledge/tecnico/editor-sql-e-migrations.md`, `_knowledge/tecnico/testes-e-automacao.md`, `_decisions/2026-10-02-coroa-de-prioridade.md` (cofre em `C:\Users\Andre\Sistemas\Gestão de Operação\Obsidian Gestão de Operação\Gestão de Operação`).

## Restrições globais

- Todo texto da tela e todo comentário em português do Brasil.
- Sem dependência nova. Usar só o que já está no projeto (shadcn `Sheet`, `lucide-react`, `playwright-core`).
- O banco é o de produção (`uajusldnvzgakffofkhl`); não há banco de teste. Teste de banco só dentro de transação desfeita (`ROLLBACK`). Teste de tela pode gravar, mas apaga o que criou e usa título começando com `[TESTE]`.
- Tabela nova não entra (a regra `so_andre` de RLS só precisaria entrar se houvesse tabela nova).
- Migration idempotente (pode rodar duas vezes) e registrada em `supabase_migrations.schema_migrations`.
- Não repetir `REVOKE ... FROM authenticated` em função já existente: o `CREATE OR REPLACE` mantém as permissões que a `seguranca_fase2` deu.
- Commit em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push no `main` = deploy na Cloudflare.
- No fim, registrar no cofre (`_memory/historico.md` no topo, `_knowledge/modulos/demandas.md`, decisão em `_decisions/2026-11-18-demandas-agendadas.md`). Sem travessão no cofre.

## Como o banco funciona hoje (conferido em 18/11/2026)

- `demanda_colunas`: `id text`, `titulo`, `hex`, `ordem`, `sistema bool`, `regra_data` (`nenhuma|hoje|amanha|depois_amanha|dias_semana`), `dias_semana smallint[]`. No ar: recorrentes(0), fazer_hoje(1), fazer_amanha(2), fazer_depois_amanha(3), fazer_fim_de_semana(4), standby(5), feito(7).
- `demandas.status` é FK para `demanda_colunas(id)` com `ON DELETE CASCADE` (apagar a coluna apaga as demandas dela).
- Gatilhos BEFORE em `demandas` rodam em ordem alfabética: `demandas_05_pessoal`, `demandas_10_dia_semana`, `demandas_15_prioridade_feito`, `demandas_20_regra_data` (INSERT/UPDATE OF status, dia_semana, dia_fim_de_semana), `demandas_40_conclusao`, `demandas_50_*`, `demandas_60_*`. O gatilho novo `demandas_08_agendada` roda antes do `_10` e do `_20`.
- `demandas_aplica_regra_data` (gatilho `_20`): em INSERT com prazo, não mexe. Em UPDATE sem mudar status, não mexe. Ao entrar em fazer_hoje/amanhã/depois de amanhã, grava prazo = hoje/+1/+2. Feito guarda o prazo.
- `virar_dia_demandas()` (cron job 3, 03:00 UTC = 00:00 de Brasília): amanhã para hoje, depois de amanhã para amanhã, e no fim `rolar_colunas_por_dia(hoje)`.
- `hoje_brt()` devolve a data de hoje em Brasília (tipo `date`).

## Arquivos

| Arquivo | O que faz |
|---|---|
| Criar `supabase/migrations/20261118220000_demandas_agendadas.sql` | coluna `agendadas`, CHECK, gatilho `_08`, `rolar_colunas_por_dia` com as agendadas |
| Criar `tools/migracao/testar-demandas-agendadas.mjs` | teste do banco em transação desfeita |
| Criar `tools/migracao/aplicar-migration.mjs` | aplica um .sql na produção e registra a versão |
| Criar `src/lib/agendadas.ts` + `src/lib/agendadas.test.ts` | id da coluna e texto "em N dias · desce para o quadro em DD/MM" |
| Modificar `src/lib/demandaColunas.ts` | `fetchDemandaColunas` esconde a coluna (vale para quadro, Admin, CRM e Ideias) |
| Modificar `src/routes/_authenticated/admin.tsx` | "Zerar colunas" não apaga a coluna de sistema `agendadas` |
| Modificar `src/components/demandas/DemandaDrawer.tsx` | selo "Agendada" e sem o botão de remover a data |
| Modificar `src/components/DemandaForm.tsx` | modo `agendar`: sem coluna, sem recorrência, data obrigatória |
| Criar `src/components/demandas/AgendadasSheet.tsx` | painel lateral com a lista e as ações |
| Modificar `src/routes/_authenticated/index.tsx` | botões, painel, quadro e lista sem as agendadas, aviso ao salvar |
| Criar `tools/auditoria-mobile/testar-agendadas.mjs` | teste de tela de ponta a ponta |

---

### Tarefa 1: banco (migration, teste e aplicação na produção)

**Arquivos:**
- Criar: `supabase/migrations/20261118220000_demandas_agendadas.sql`
- Criar: `tools/migracao/testar-demandas-agendadas.mjs`
- Criar: `tools/migracao/aplicar-migration.mjs`

**Interfaces:**
- Produz: coluna `demanda_colunas.id = 'agendadas'`; constraint `demandas_agendada_tem_data`; função `public.demandas_agendada_chegou()`; gatilho `demandas_08_agendada`; `public.rolar_colunas_por_dia(date)` atualizada. O front grava `status: 'agendadas'` com `prazo` obrigatório.

- [ ] **Passo 1: escrever o teste do banco (vai falhar, porque a migration ainda não existe)**

`tools/migracao/testar-demandas-agendadas.mjs`:

```js
// Teste da migration 20261118220000_demandas_agendadas.sql. Tudo dentro de uma transação desfeita (ROLLBACK):
// aplica a migration duas vezes, cria demandas "[TESTE]" agendadas e simula a virada de dias à frente.
// Uso: node tools/migracao/testar-demandas-agendadas.mjs   (não deixa rastro)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { conectar } from "./conexao.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migration = readFileSync(join(raiz, "supabase/migrations/20261118220000_demandas_agendadas.sql"), "utf8");
const USER = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";

let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const c = await conectar();
try {
  await c.query("BEGIN");
  await c.query(migration);
  await c.query(migration);
  confere("migration aplica duas vezes sem erro", true);

  const hoje = (await c.query("SELECT public.hoje_brt()::text AS h")).rows[0].h;
  const dia = async (n) => (await c.query("SELECT ($1::date + $2::int)::text AS d", [hoje, n])).rows[0].d;
  const nova = async (titulo, n) => (await c.query(
    `INSERT INTO public.demandas (user_id, titulo, status, prazo)
     VALUES ($1, $2, 'agendadas', $3::date + $4::int) RETURNING id`,
    [USER, "[TESTE] " + titulo, hoje, n])).rows[0].id;
  const ler = async (id) => (await c.query(
    "SELECT status, prazo::text AS prazo FROM public.demandas WHERE id = $1", [id])).rows[0];

  const longe = await nova("longe", 10);
  let r = await ler(longe);
  confere("agendada a 10 dias fica em Agendadas", r.status === "agendadas" && r.prazo === await dia(10), JSON.stringify(r));

  for (const [n, col] of [[2, "fazer_depois_amanha"], [1, "fazer_amanha"], [0, "fazer_hoje"]]) {
    const id = await nova(`perto ${n}`, n);
    r = await ler(id);
    confere(`agendada a ${n} dia(s) entra em ${col}`, r.status === col && r.prazo === await dia(n), JSON.stringify(r));
  }

  await c.query("SAVEPOINT sem_data");
  let recusou = false;
  try {
    await c.query(`INSERT INTO public.demandas (user_id, titulo, status) VALUES ($1, '[TESTE] sem data', 'agendadas')`, [USER]);
  } catch { recusou = true; }
  await c.query("ROLLBACK TO SAVEPOINT sem_data");
  confere("agendada sem data é recusada", recusou);

  await c.query("UPDATE public.demandas SET titulo = '[TESTE] longe editada', descricao = 'nota' WHERE id = $1", [longe]);
  r = await ler(longe);
  confere("editar o texto não tira de Agendadas", r.status === "agendadas" && r.prazo === await dia(10), JSON.stringify(r));

  // Virada simulada: "hoje" 7 dias à frente (faltam 3) não mexe; 8 dias à frente (faltam 2) desce
  await c.query("SELECT public.rolar_colunas_por_dia($1::date + 7)", [hoje]);
  r = await ler(longe);
  confere("virada com 3 dias de folga não mexe", r.status === "agendadas", JSON.stringify(r));
  await c.query("SELECT public.rolar_colunas_por_dia($1::date + 8)", [hoje]);
  r = await ler(longe);
  confere("virada 2 dias antes desce para Fazer depois de amanhã",
    r.status === "fazer_depois_amanha" && r.prazo === await dia(10), JSON.stringify(r));

  // Virada que ficou dias sem rodar: agendada com a data já passada entra em Fazer hoje
  const vencida = await nova("vencida", 5);
  await c.query("SELECT public.rolar_colunas_por_dia($1::date + 7)", [hoje]);
  r = await ler(vencida);
  confere("agendada vencida entra em Fazer hoje", r.status === "fazer_hoje", JSON.stringify(r));

  // Trocar só a data (painel da demanda) para amanhã desce na hora
  const mudar = await nova("mudar data", 20);
  await c.query("UPDATE public.demandas SET prazo = $2::date + 1 WHERE id = $1", [mudar, hoje]);
  r = await ler(mudar);
  confere("trocar a data para amanhã desce para Fazer amanhã", r.status === "fazer_amanha", JSON.stringify(r));

  // Marcar como feita pela lista guarda a data
  const feita = await nova("feita", 15);
  await c.query("UPDATE public.demandas SET status = 'feito' WHERE id = $1", [feita]);
  r = await ler(feita);
  confere("marcar como feita guarda a data", r.status === "feito" && r.prazo === await dia(15), JSON.stringify(r));

  // A coluna não aparece para o front (ela é filtrada lá), mas é de sistema e sem regra de data
  const col = (await c.query("SELECT sistema, regra_data FROM public.demanda_colunas WHERE id = 'agendadas'")).rows[0];
  confere("coluna agendadas é de sistema e sem regra", col?.sistema === true && col?.regra_data === "nenhuma", JSON.stringify(col));
} catch (e) {
  console.error("ERRO", e.message);
  falhas++;
} finally {
  await c.query("ROLLBACK");
  await c.end();
}
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `node tools/migracao/testar-demandas-agendadas.mjs`
Esperado: `ENOENT` ao ler `20261118220000_demandas_agendadas.sql` (o arquivo ainda não existe).

- [ ] **Passo 3: escrever a migration**

`supabase/migrations/20261118220000_demandas_agendadas.sql`:

```sql
-- Demandas agendadas (18/11/2026, pedido do André): tarefa com data marcada (ex.: 25/01) que fica guardada fora
-- do quadro e desce sozinha para "Fazer depois de amanhã" 2 dias antes; depois anda com a virada (amanhã, hoje).
-- 1) Coluna de sistema 'agendadas', escondida no front (fetchDemandaColunas filtra). A data agendada é o prazo.
-- 2) Agendada sem data não existe (CHECK).
-- 3) Gatilho BEFORE demandas_08_agendada: agendada nova ou com a data trocada que já está a 2 dias ou menos
--    entra direto em Fazer hoje, amanhã ou depois de amanhã, no fim da coluna. Roda antes do _20 (regra de data).
-- 4) rolar_colunas_por_dia (chamada pela virada) também desce as agendadas cujo dia chegou a 2 dias ou menos.
--    A data vencida (virada que ficou dias sem rodar) entra em Fazer hoje.
-- Idempotente. O CREATE OR REPLACE mantém as permissões dadas pela seguranca_fase2 (não repetir o REVOKE).

INSERT INTO public.demanda_colunas (id, titulo, hex, ordem, sistema, regra_data)
VALUES ('agendadas', 'Agendadas', '#0ea5e9', 6, true, 'nenhuma')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.demandas DROP CONSTRAINT IF EXISTS demandas_agendada_tem_data;
ALTER TABLE public.demandas ADD CONSTRAINT demandas_agendada_tem_data
  CHECK (status <> 'agendadas' OR prazo IS NOT NULL);

CREATE OR REPLACE FUNCTION public.demandas_agendada_chegou()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  faltam INTEGER;
  alvo TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'agendadas' OR NEW.prazo IS NULL THEN RETURN NEW; END IF;
  faltam := NEW.prazo - public.hoje_brt();
  IF faltam > 2 THEN RETURN NEW; END IF;
  alvo := CASE WHEN faltam <= 0 THEN 'fazer_hoje' WHEN faltam = 1 THEN 'fazer_amanha' ELSE 'fazer_depois_amanha' END;
  -- Coluna apagada no Admin: a agendada espera em Agendadas
  IF NOT EXISTS (SELECT 1 FROM public.demanda_colunas WHERE id = alvo) THEN RETURN NEW; END IF;
  NEW.status := alvo;
  NEW.ordem := (SELECT COALESCE(MAX(ordem), -1) + 1 FROM public.demandas WHERE status = alvo);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS demandas_08_agendada ON public.demandas;
CREATE TRIGGER demandas_08_agendada
  BEFORE INSERT OR UPDATE OF status, prazo ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_agendada_chegou();

-- Igual à de 30/09 (20260930200000) e, na fila, também as agendadas cujo dia chegou a 2 dias ou menos.
CREATE OR REPLACE FUNCTION public.rolar_colunas_por_dia(p_hoje date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  base INTEGER;
  n INTEGER;
  total INTEGER := 0;
  v_prev TEXT := current_setting('app.sem_regra_data', true);
BEGIN
  PERFORM set_config('app.sem_regra_data', 'on', true);
  FOR r IN SELECT * FROM (VALUES ('fazer_depois_amanha', 2), ('fazer_amanha', 1), ('fazer_hoje', 0)) AS v(alvo, desloc) LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM demanda_colunas WHERE id = r.alvo);
    SELECT COALESCE(MAX(ordem), -1) + 1 INTO base FROM demandas WHERE status = r.alvo;
    WITH fila AS (
      SELECT d.id, row_number() OVER (ORDER BY c.ordem, d.ordem, d.created_at, d.id) - 1 AS pos
      FROM demandas d JOIN demanda_colunas c ON c.id = d.status
      WHERE (c.regra_data = 'dias_semana'
             AND d.dia_semana = EXTRACT(DOW FROM p_hoje + r.desloc)::smallint)
         OR (d.status = 'agendadas'
             AND (d.prazo = p_hoje + r.desloc OR (r.desloc = 0 AND d.prazo < p_hoje)))
    )
    UPDATE demandas d SET status = r.alvo, ordem = base + fila.pos, prazo = p_hoje + r.desloc
    FROM fila WHERE d.id = fila.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  PERFORM set_config('app.sem_regra_data', COALESCE(NULLIF(v_prev, ''), 'off'), true);
  RETURN total;
END $$;
```

Observação: o `prazo = p_hoje + r.desloc` da virada grava a própria data agendada (só muda na vencida, que vira hoje). O gatilho `_08` não mexe no UPDATE da virada, porque nele `NEW.status` já é a coluna de destino.

- [ ] **Passo 4: rodar o teste e ver passar**

Rodar: `node tools/migracao/testar-demandas-agendadas.mjs`
Esperado: todas as linhas `OK` e `tudo certo` no fim (saída 0). Se `INSERT` em `demandas` reclamar de coluna obrigatória, acrescentar a coluna no `nova()` e rodar de novo.

- [ ] **Passo 5: criar o script de aplicar migration na produção**

`tools/migracao/aplicar-migration.mjs`:

```js
// Aplica um .sql de supabase/migrations no banco de produção, numa transação, e registra a versão no histórico
// do Supabase (supabase_migrations.schema_migrations). Versão e nome saem do nome do arquivo.
// Uso: node tools/migracao/aplicar-migration.mjs supabase/migrations/20261118220000_demandas_agendadas.sql
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { conectar } from "./conexao.mjs";

const arquivo = process.argv[2];
const m = arquivo && basename(arquivo).match(/^(\d{14})_(.+)\.sql$/);
if (!m) throw new Error("uso: node aplicar-migration.mjs supabase/migrations/AAAAMMDDHHMMSS_nome.sql");
const c = await conectar();
try {
  await c.query("BEGIN");
  await c.query(readFileSync(arquivo, "utf8"));
  await c.query(
    "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [m[1], m[2]]);
  await c.query("COMMIT");
  console.log(`aplicada e registrada: ${m[1]}_${m[2]}`);
} catch (e) {
  await c.query("ROLLBACK");
  console.error("ERRO", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
```

- [ ] **Passo 6: aplicar na produção e conferir**

Rodar: `node tools/migracao/aplicar-migration.mjs supabase/migrations/20261118220000_demandas_agendadas.sql`
Esperado: `aplicada e registrada: 20261118220000_demandas_agendadas`.
Rodar de novo o teste (`node tools/migracao/testar-demandas-agendadas.mjs`): continua `tudo certo` (a migration já aplicada roda de novo sem erro).

- [ ] **Passo 7: commit**

```bash
git add supabase/migrations/20261118220000_demandas_agendadas.sql tools/migracao/testar-demandas-agendadas.mjs tools/migracao/aplicar-migration.mjs
git commit -m "feat(demandas): coluna escondida de agendadas que desce sozinha 2 dias antes da data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: utilitário das agendadas

**Arquivos:**
- Criar: `src/lib/agendadas.ts`
- Teste: `src/lib/agendadas.test.ts`

**Interfaces:**
- Consome: `formatarDataCurta(iso)` de `src/lib/entrega.ts`; `somarDias(iso, n)` e `diferencaDias(de, ate)` de `src/lib/recorrencia.ts`.
- Produz: `export const COLUNA_AGENDADAS = "agendadas"`; `export function resumoAgendada(prazo: string, hoje: string): string`.

- [ ] **Passo 1: escrever o teste**

`src/lib/agendadas.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resumoAgendada } from "./agendadas.ts";

test("resumoAgendada conta os dias e diz quando a tarefa desce para o quadro", () => {
  assert.equal(resumoAgendada("2027-01-25", "2026-11-18"), "em 68 dias · desce para o quadro em 23/01");
  assert.equal(resumoAgendada("2026-11-21", "2026-11-18"), "em 3 dias · desce para o quadro amanhã");
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `node --test src/lib/agendadas.test.ts`
Esperado: FALHA com `Cannot find module` (`agendadas.ts` não existe).

- [ ] **Passo 3: escrever o utilitário**

`src/lib/agendadas.ts` (imports relativos com `.ts`, como os outros arquivos de `src/lib` testados pelo `node --test`):

```ts
// Demandas agendadas: tarefa com data marcada que espera fora do quadro (coluna de sistema escondida) e desce
// sozinha para "Fazer depois de amanhã" 2 dias antes da data. Quem move é o banco (gatilho e virada).
import { formatarDataCurta } from "./entrega.ts";
import { diferencaDias, somarDias } from "./recorrencia.ts";

/** Valor de demandas.status das agendadas. A coluna existe no banco, mas o front não a mostra no quadro. */
export const COLUNA_AGENDADAS = "agendadas";

/** Linha da lista: "em 12 dias · desce para o quadro em 23/01". */
export function resumoAgendada(prazo: string, hoje: string): string {
  const desce = somarDias(prazo, -2);
  const quando = desce === somarDias(hoje, 1) ? "amanhã" : `em ${formatarDataCurta(desce)}`;
  return `em ${diferencaDias(hoje, prazo)} dias · desce para o quadro ${quando}`;
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `node --test src/lib/agendadas.test.ts` e depois `npm test`
Esperado: PASS nos dois.

- [ ] **Passo 5: commit**

```bash
git add src/lib/agendadas.ts src/lib/agendadas.test.ts
git commit -m "feat(demandas): utilitário das agendadas (coluna e resumo da data)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: esconder a coluna e proteger a agendada

**Arquivos:**
- Modificar: `src/lib/demandaColunas.ts:46-57` (`fetchDemandaColunas`)
- Modificar: `src/routes/_authenticated/admin.tsx:603` (zerar colunas)
- Modificar: `src/components/demandas/DemandaDrawer.tsx:178-182, 262-276, 346-355`

**Interfaces:**
- Consome: `COLUNA_AGENDADAS` de `@/lib/agendadas`.
- Produz: nenhuma lista de colunas do front contém `agendadas` (quadro, Admin, CRM, Ideias usam `fetchDemandaColunas`).

- [ ] **Passo 1: `fetchDemandaColunas` filtra a coluna**

Em `src/lib/demandaColunas.ts`, acrescentar o import e o filtro:

```ts
import { COLUNA_AGENDADAS } from "@/lib/agendadas";
```

```ts
export async function fetchDemandaColunas(): Promise<KanbanColumnDef[]> {
  const { data, error } = await supabase
    .from("demanda_colunas")
    .select("id, titulo, hex, ordem, sistema, regra_data, dias_semana")
    // Agendadas é coluna de sistema escondida: as tarefas dela aparecem só no botão "Agendadas"
    .neq("id", COLUNA_AGENDADAS)
    .order("ordem", { ascending: true });
```

(o resto da função fica igual)

- [ ] **Passo 2: "Zerar colunas" do Admin não apaga a coluna de sistema**

Em `src/routes/_authenticated/admin.tsx`, importar `COLUNA_AGENDADAS` de `@/lib/agendadas` e trocar a linha 603:

```ts
        // Agendadas fica: é a coluna de sistema (escondida) das tarefas agendadas
        const { error } = await supabase.from("demanda_colunas").delete().not("id", "is", null).neq("id", COLUNA_AGENDADAS);
```

- [ ] **Passo 3: painel da demanda mostra o selo e não deixa tirar a data**

Em `src/components/demandas/DemandaDrawer.tsx`:
1. Importar `COLUNA_AGENDADAS` de `@/lib/agendadas` e acrescentar `CalendarClock` ao import de `lucide-react`.
2. Logo depois de `const currentColumn = columns.find(c => c.id === demanda.status);` (linha 178):

```ts
  // Agendada: a coluna é escondida (não vem em `columns`) e a data é obrigatória (CHECK no banco)
  const agendada = demanda.status === COLUNA_AGENDADAS;
```

3. Na célula do Status, depois do bloco `{currentColumn && (...)}` (linhas 263-275):

```tsx
                {agendada && (
                  <Badge variant="outline" className="text-[11px] py-0 h-5 gap-1">
                    <CalendarClock size={11} />
                    Agendada
                  </Badge>
                )}
```

4. No botão "Remover data" (linha 346), trocar `{demanda.prazo && (` por `{demanda.prazo && !agendada && (`.

- [ ] **Passo 4: conferir os tipos**

Rodar: `npx tsc --noEmit`
Esperado: sem erros.

- [ ] **Passo 5: commit**

```bash
git add src/lib/demandaColunas.ts src/routes/_authenticated/admin.tsx src/components/demandas/DemandaDrawer.tsx
git commit -m "feat(demandas): coluna de agendadas escondida no quadro, Admin e painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: formulário no modo agendar

**Arquivos:**
- Modificar: `src/components/DemandaForm.tsx:45-50, 141-187, 189-260, 262-274, 290-292`

**Interfaces:**
- Consome: `hojeBrasilia()` de `@/lib/entrega`.
- Produz: `DemandaForm` aceita `agendar?: boolean`. Com `agendar`, o formulário não mostra Coluna nem Tarefa Recorrente, a data se chama "Data agendada", é obrigatória (`required`) e não aceita dia passado (`min` = hoje em Brasília). O `status` vem de `initialValues.status` (`"agendadas"`).

- [ ] **Passo 1: prop nova**

```ts
interface DemandaFormProps {
  clientes: { id: string; nome: string; agencia?: string }[];
  columns: { id: string; title: string }[];
  onSubmit: (values: DemandaFormValues) => void;
  loading?: boolean;
  /** Tarefa agendada: sem coluna nem recorrência, com data obrigatória (o banco a desce 2 dias antes) */
  agendar?: boolean;
}

export function DemandaForm({ clientes, columns, onSubmit, loading, initialValues, agendar }: DemandaFormProps & { initialValues?: Partial<DemandaFormValues> }) {
```

E acrescentar `import { hojeBrasilia } from "@/lib/entrega";`.

- [ ] **Passo 2: esconder Coluna e Recorrente no modo agendar**

Envolver o `FormField name="status"` (linhas 142-163) em `{!agendar && ( ... )}` e trocar a grade da linha 141 para a Prioridade ocupar a linha toda: `<div className={agendar ? "grid gap-4" : "grid grid-cols-2 gap-4"}>`. Envolver o bloco inteiro `<div className="space-y-4 p-4 border rounded-lg bg-muted/20">` (linhas 189-260, Tarefa Recorrente) em `{!agendar && ( ... )}`.

- [ ] **Passo 3: data obrigatória**

No `FormField name="prazo"` (linhas 262-274):

```tsx
            <FormItem>
              <FormLabel>{agendar ? "Data agendada" : "Prazo (Opcional)"}</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  {...field}
                  value={field.value || ""}
                  required={agendar}
                  min={agendar ? hojeBrasilia() : undefined}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
```

- [ ] **Passo 4: texto do botão**

```tsx
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Salvando..." : agendar ? "Agendar" : "Criar Demanda"}
        </Button>
```

- [ ] **Passo 5: conferir os tipos**

Rodar: `npx tsc --noEmit`
Esperado: sem erros.

- [ ] **Passo 6: commit**

```bash
git add src/components/DemandaForm.tsx
git commit -m "feat(demandas): formulário com modo agendar (data obrigatória, sem coluna)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: botões, painel de agendadas e quadro sem elas

**Arquivos:**
- Criar: `src/components/demandas/AgendadasSheet.tsx`
- Modificar: `src/routes/_authenticated/index.tsx` (estados ~L102-128, `openNewDemanda` L264, `handleCreateOrUpdateDemanda` L304-315, `useBusca` L530, cabeçalho L790-807, diálogo L1175-1194)

**Interfaces:**
- Consome: `COLUNA_AGENDADAS`, `resumoAgendada` (Tarefa 2); `DemandaForm` com `agendar` (Tarefa 4); `formatarDataCurta`, `hojeBrasilia`, `siglaDoDia` de `@/lib/entrega`; no `index.tsx`: `moverParaFeito(id)`, `handleOpenDrawer(d)`, `setDeletingId`, `setDeletingName`, `setEditingDemanda`, `setIsModalOpen`, `fetchDemandas`.
- Produz: `AgendadasSheet` com as props abaixo.

- [ ] **Passo 1: criar o painel**

`src/components/demandas/AgendadasSheet.tsx`:

```tsx
// Painel lateral das tarefas agendadas (botão "Agendadas" das Demandas): ver, abrir, editar, marcar como feita e excluir.
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatarDataCurta, hojeBrasilia, siglaDoDia } from "@/lib/entrega";
import { resumoAgendada } from "@/lib/agendadas";

interface AgendadasSheetProps {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Já ordenadas pela data */
  agendadas: any[];
  onAgendar: () => void;
  onAbrir: (d: any) => void;
  onEditar: (d: any) => void;
  onConcluir: (d: any) => void;
  onExcluir: (d: any) => void;
}

export function AgendadasSheet({ aberto, onOpenChange, agendadas, onAgendar, onAbrir, onEditar, onConcluir, onExcluir }: AgendadasSheetProps) {
  const hoje = hojeBrasilia();
  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>Tarefas agendadas</SheetTitle>
          <SheetDescription>Cada uma desce sozinha para Fazer depois de amanhã 2 dias antes da data.</SheetDescription>
        </SheetHeader>
        <Button size="sm" className="gap-1.5 self-start" onClick={onAgendar}>
          <Plus size={14} />
          Agendar tarefa
        </Button>
        <div className="flex-1 overflow-y-auto -mx-2">
          {agendadas.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2 py-8 text-center">Nenhuma tarefa agendada.</p>
          ) : (
            <ul className="divide-y">
              {agendadas.map((d) => (
                <li key={d.id} className="flex items-start gap-3 px-2 py-3">
                  <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onAbrir(d)}>
                    <div className="text-sm font-medium truncate">{d.titulo}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {siglaDoDia(d.prazo)} {formatarDataCurta(d.prazo)}
                      {d.pessoal ? " · Pessoal" : d.clientes?.nome ? ` · ${d.clientes.nome}` : ""}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{resumoAgendada(d.prazo, hoje)}</div>
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" aria-label="Editar" onClick={() => onEditar(d)}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Marcar como feita" aria-label="Marcar como feita" onClick={() => onConcluir(d)}>
                      <Check size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Excluir" aria-label="Excluir" onClick={() => onExcluir(d)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Passo 2: estados, listas e ações no `index.tsx`**

1. Imports: `import { AgendadasSheet } from "@/components/demandas/AgendadasSheet";`, `import { COLUNA_AGENDADAS } from "@/lib/agendadas";`, acrescentar `formatarDataCurta` ao import de `@/lib/entrega` (linha 61) e `CalendarClock` ao import de `lucide-react`.
2. Junto dos outros estados (depois da linha 128): `const [agendadasAberta, setAgendadasAberta] = useState(false);`
3. Depois de `openNewDemanda` (linha 270):

```ts
  const openAgendar = () => {
    setEditingDemanda({ status: COLUNA_AGENDADAS });
    setIsModalOpen(true);
  };
```

4. Em `handleCreateOrUpdateDemanda`, trocar `toast.success("Demanda criada!");` (linha 314) por:

```ts
        toast.success(sanitizedValues.status === COLUNA_AGENDADAS && sanitizedValues.prazo
          ? `Agendada para ${formatarDataCurta(sanitizedValues.prazo)}`
          : "Demanda criada!");
```

5. Antes do `useBusca` (linha 530), separar as agendadas do quadro e trocar `demandas` por `doQuadro` no primeiro argumento do `useBusca`:

```ts
  // Agendadas esperam fora do quadro e da lista (botão "Agendadas"); o banco as desce 2 dias antes da data
  const doQuadro = useMemo(() => demandas.filter((d) => d.status !== COLUNA_AGENDADAS), [demandas]);
  const agendadas = useMemo(
    () => demandas.filter((d) => d.status === COLUNA_AGENDADAS).sort((a, b) => String(a.prazo).localeCompare(String(b.prazo))),
    [demandas],
  );
```

```ts
  const resultadoBusca = useBusca(
    doQuadro,
    searchQuery,
```

- [ ] **Passo 3: botões no cabeçalho**

No cabeçalho (linha 803), antes do botão "Nova":

```tsx
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setAgendadasAberta(true)}>
                Agendadas
                {agendadas.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{agendadas.length}</span>
                )}
            </Button>
            <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
                onClick={openAgendar}
            >
                <CalendarClock size={14} />
                Agendar
            </Button>
```

- [ ] **Passo 4: diálogo no modo agendar**

No `<Dialog open={isModalOpen} ...>` (linhas 1179-1192), usar `agendando`:

```tsx
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingDemanda?.status === COLUNA_AGENDADAS
                ? editingDemanda?.id ? "Editar tarefa agendada" : "Agendar tarefa"
                : editingDemanda?.id ? "Editar Demanda" : "Nova Demanda"}
            </DialogTitle>
            <DialogDescription>
              {editingDemanda?.status === COLUNA_AGENDADAS
                ? "Ela fica em Agendadas e desce para Fazer depois de amanhã 2 dias antes da data."
                : "Preencha os detalhes da tarefa abaixo."}
            </DialogDescription>
          </DialogHeader>
          <DemandaForm
            clientes={clientes}
            columns={columns}
            onSubmit={handleCreateOrUpdateDemanda}
            loading={loading}
            initialValues={editingDemanda}
            agendar={editingDemanda?.status === COLUNA_AGENDADAS}
          />
        </DialogContent>
```

- [ ] **Passo 5: montar o painel**

Logo depois do `</Dialog>` do formulário (linha 1194):

```tsx
      <AgendadasSheet
        aberto={agendadasAberta}
        onOpenChange={setAgendadasAberta}
        agendadas={agendadas}
        onAgendar={() => { setAgendadasAberta(false); openAgendar(); }}
        onAbrir={(d) => { setAgendadasAberta(false); handleOpenDrawer(d); }}
        onEditar={(d) => { setAgendadasAberta(false); setEditingDemanda(d); setIsModalOpen(true); }}
        onConcluir={(d) => moverParaFeito(d.id)}
        onExcluir={(d) => { setDeletingId(d.id); setDeletingName(d.titulo); }}
      />
```

(Excluir reaproveita o `AlertDialog` de remoção que já existe; ele abre por cima do painel.)

- [ ] **Passo 6: conferir os tipos e os testes**

Rodar: `npx tsc --noEmit` e `npm test`
Esperado: sem erros, testes passando.

- [ ] **Passo 7: commit**

```bash
git add src/components/demandas/AgendadasSheet.tsx src/routes/_authenticated/index.tsx
git commit -m "feat(demandas): botões Agendar e Agendadas com painel para editar, concluir e excluir

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: teste de tela, publicação e cofre

**Arquivos:**
- Criar: `tools/auditoria-mobile/testar-agendadas.mjs`
- Modificar (cofre): `_memory/historico.md`, `_knowledge/modulos/demandas.md`; criar `_decisions/2026-11-18-demandas-agendadas.md`

**Interfaces:**
- Consome: tudo das Tarefas 1 a 5; `CHROME` e `abrirEstavel` de `tools/auditoria-mobile/rotas.mjs`; sessão de `sessao-teste.mjs`.

- [ ] **Passo 1: escrever o teste de tela**

`tools/auditoria-mobile/testar-agendadas.mjs`:

```js
// Confere o botão Agendar e o painel Agendadas das Demandas. Cria "[TESTE] agendada ..." para daqui a 60 dias,
// confere que ela aparece no painel e não no quadro, e apaga pelo próprio painel (não deixa rastro).
// Uso: SITE=http://127.0.0.1:5199 node --import ./sessao-teste.mjs testar-agendadas.mjs
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const SITE = process.env.SITE || "https://gestao.andrelopes.digital";
const TITULO = `[TESTE] agendada ${Date.now()}`;
const daqui = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const nav = await chromium.launch({ executablePath: CHROME });
let falhou = false;
const ok = (c, m) => { console.log(c ? "ok  " : "FALHA", m); if (!c) falhou = true; };
try {
  const p = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  p.on("pageerror", (e) => { console.log("  pageerror:", e.message.slice(0, 200)); falhou = true; });

  await abrirEstavel(p, `${SITE}/`, 3000);
  await p.getByRole("button", { name: /^Agendar$/ }).click();
  const dialogo = p.getByRole("dialog");
  await dialogo.getByText("Agendar tarefa").first().waitFor({ timeout: 15000 });
  ok(await dialogo.getByText("Coluna", { exact: true }).count() === 0, "formulário de agendar não pede coluna");
  await dialogo.getByPlaceholder("O que precisa ser feito?").fill(TITULO);
  await dialogo.locator('input[type="date"]').fill(daqui(60));
  await dialogo.getByRole("button", { name: /^Agendar$/ }).click();
  await p.getByText(/Agendada para/).first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(1500);
  ok(await p.getByText(TITULO).count() === 0, "agendada não aparece no quadro");

  await p.getByRole("button", { name: /^Agendadas/ }).click();
  const linha = p.locator("li", { hasText: TITULO });
  await linha.waitFor({ timeout: 15000 });
  ok(/desce para o quadro em/.test(await linha.innerText()), "painel mostra quando a tarefa desce");
  await p.screenshot({ path: process.env.TEMP + "/agendadas-painel.png" });

  await linha.getByRole("button", { name: "Excluir" }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
  await linha.waitFor({ state: "detached", timeout: 15000 });
  ok(true, "excluir pelo painel apaga a agendada");
} finally {
  await nav.close();
}
process.exit(falhou ? 1 : 0);
```

- [ ] **Passo 2: rodar contra o servidor local**

Antes, matar os `vite` antigos (memória "Dev server local") e subir: `npx vite dev --port 5199` em segundo plano.
Rodar (dentro de `tools/auditoria-mobile`): `SITE=http://127.0.0.1:5199 node --import ./sessao-teste.mjs testar-agendadas.mjs`
Esperado: 4 linhas `ok`, saída 0. Abrir `%TEMP%/agendadas-painel.png` e conferir o painel.

- [ ] **Passo 3: commit e push (push = deploy)**

```bash
git add tools/auditoria-mobile/testar-agendadas.mjs
git commit -m "test(demandas): teste de tela do Agendar e do painel Agendadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Passo 4: conferir na produção**

Depois do deploy da Cloudflare, rodar o mesmo teste contra o site: `node --import ./sessao-teste.mjs testar-agendadas.mjs` (sem `SITE`).
Esperado: 4 linhas `ok`.

- [ ] **Passo 5: registrar no cofre**

- `_memory/historico.md`, no topo: entrada de 18/11/2026 com o que foi feito, os commits, a migration `20261118220000_demandas_agendadas` aplicada e os testes.
- `_knowledge/modulos/demandas.md`: seção "Agendadas (18/11/2026)" explicando a coluna escondida, o gatilho `demandas_08_agendada`, a virada e onde fica o código (`src/lib/agendadas.ts`, `AgendadasSheet.tsx`).
- `_decisions/2026-11-18-demandas-agendadas.md`: por que coluna escondida em vez de campo novo (o quadro, a virada e a regra de data já funcionam por `status`; a descida fica toda no banco, e nenhum `select` de demandas precisou mudar fora da aba).
- Armadilha para `_learnings/` só se aparecer alguma na execução.

---

## Itens para o Jev

Aplicar a migration na produção (Tarefa 1, passo 6), o teste de tela de ponta a ponta, os commits, o push e o cofre ficam com a sessão principal depois da revisão. Os executores não aplicam nada na produção, não commitam e não fazem push.

- [r] T1 | files: supabase/migrations/20261118220000_demandas_agendadas.sql,tools/migracao/testar-demandas-agendadas.mjs,tools/migracao/aplicar-migration.mjs | check: node tools/migracao/testar-demandas-agendadas.mjs | exec: sonnet | Tarefa 1 passos 1 a 5 (migration, teste em transação desfeita, script de aplicar); NÃO rodar o aplicar-migration.mjs
- [r] T2 | files: src/lib/agendadas.ts,src/lib/agendadas.test.ts | check: node --test src/lib/agendadas.test.ts | exec: haiku | Tarefa 2: utilitário COLUNA_AGENDADAS e resumoAgendada, código exato do plano
- [r] T3 | files: src/lib/demandaColunas.ts,src/routes/_authenticated/admin.tsx,src/components/demandas/DemandaDrawer.tsx | after: T2 | check: npx tsc --noEmit | exec: haiku | Tarefa 3: esconder a coluna, proteger no Admin e selo no painel
- [r] T4 | files: src/components/DemandaForm.tsx | check: npx tsc --noEmit | exec: haiku | Tarefa 4: formulário com modo agendar
- [r] T5 | files: src/components/demandas/AgendadasSheet.tsx,src/routes/_authenticated/index.tsx | after: T3,T4 | check: npx tsc --noEmit && npm test | exec: sonnet | Tarefa 5: botões, painel e quadro sem as agendadas
- [r] T6 | files: tools/auditoria-mobile/testar-agendadas.mjs | after: T5 | check: node --check tools/auditoria-mobile/testar-agendadas.mjs | exec: haiku | Tarefa 6 passo 1: só escrever o teste de tela (a sessão principal roda)

## Fora deste plano

- Mostrar as agendadas na faixa "Previsão de Recorrências" do topo: o pedido não pede. Entra se o André quiser ver os próximos dias com elas.
- Agendada recorrente: a recorrência já tem fluxo próprio (coluna Recorrentes).
- Mover um card que já está no quadro para Agendadas: não há caminho na tela. Se vier, pôr `'agendadas'` na lista `NOT IN ('feito', 'recorrentes')` de `demandas_aplica_regra_data`, senão o gatilho apaga a data e o CHECK recusa.
