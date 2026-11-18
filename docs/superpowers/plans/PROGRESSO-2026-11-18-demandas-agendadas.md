# Progresso (despachante Jev)

Plano: `2026-11-18-demandas-agendadas.md` | gerado 2026-11-18T21:45:02.696Z

## Auditoria

- Itens: 6. Finais (revisados): 0. Aguardando revisao: 0. Pendentes de execucao: 6 (0% concluido).
- Ondas de execucao pendentes: 4. Maior onda: 3 itens simultaneos.
- Executores pendentes: haiku 4, sonnet 2, opus 0. Revisor padrao: sonnet alto.

## Execucao (cada onda roda em paralelo, em background; a proxima so comeca quando a anterior fecha)

Cada executor grava `relatorios-2026-11-18-demandas-agendadas/<ID>.md` (inicio, fim, arquivos, o que fez, resultado do check, duvidas) e muda o item para `[r]`. Nao marca `[x]`.

### Onda 1

| Item | Executor | Esforco | Arquivos | Check (aceite) |
|---|---|---|---|---|
| T1 | sonnet | high | supabase/migrations/20261118220000_demandas_agendadas.sql, tools/migracao/testar-demandas-agendadas.mjs, tools/migracao/aplicar-migration.mjs | `node tools/migracao/testar-demandas-agendadas.mjs` |
| T2 | haiku | low | src/lib/agendadas.ts, src/lib/agendadas.test.ts | `node --test src/lib/agendadas.test.ts` |
| T4 | haiku | low | src/components/DemandaForm.tsx | `npx tsc --noEmit` |

### Onda 2

| Item | Executor | Esforco | Arquivos | Check (aceite) |
|---|---|---|---|---|
| T3 | haiku | low | src/lib/demandaColunas.ts, src/routes/_authenticated/admin.tsx, src/components/demandas/DemandaDrawer.tsx | `npx tsc --noEmit` |

### Onda 3

| Item | Executor | Esforco | Arquivos | Check (aceite) |
|---|---|---|---|---|
| T5 | sonnet | medium | src/components/demandas/AgendadasSheet.tsx, src/routes/_authenticated/index.tsx | `npx tsc --noEmit && npm test` |

### Onda 4

| Item | Executor | Esforco | Arquivos | Check (aceite) |
|---|---|---|---|---|
| T6 | haiku | low | tools/auditoria-mobile/testar-agendadas.mjs | `node --check tools/auditoria-mobile/testar-agendadas.mjs` |

## Revisao

Depois que todas as ondas fecharem, um unico revisor (sonnet, esforco alto) le os relatorios, confere os arquivos, roda os checks e grava `REVISAO-2026-11-18-demandas-agendadas.md` com um veredito por item (APROVADO, AJUSTADO ou REFAZER) e a linha final `RESULTADO: aprovados N, ajustados N, refazer N`. Aprovados e ajustados viram `[x]`; REFAZER volta a `[ ]` com `exec: sonnet`.

## Status por item

| Item | Estado | Executor | Relatorio | Descricao |
|---|---|---|---|---|
| T1 | pendente | sonnet | - | Tarefa 1 passos 1 a 5 (migration, teste em transação desfeita, script de aplicar); NÃO rodar o aplic |
| T2 | pendente | haiku | - | Tarefa 2: utilitário COLUNA_AGENDADAS e resumoAgendada, código exato do plano |
| T3 | pendente | haiku | - | Tarefa 3: esconder a coluna, proteger no Admin e selo no painel |
| T4 | pendente | haiku | - | Tarefa 4: formulário com modo agendar |
| T5 | pendente | sonnet | - | Tarefa 5: botões, painel e quadro sem as agendadas |
| T6 | pendente | haiku | - | Tarefa 6 passo 1: só escrever o teste de tela (a sessão principal roda) |
