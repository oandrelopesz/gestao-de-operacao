# Revisão: Demandas agendadas (18/11/2026)

Checks rodados pelo revisor: `node tools/migracao/testar-demandas-agendadas.mjs` (13 OK, "tudo certo", transação desfeita), `node --test src/lib/agendadas.test.ts`, `npx tsc --noEmit` (sem erros) e `npm test` (879 testes, 879 passam, 0 falham). Nada aplicado na produção, sem commit, sem push, nada apagado. Nenhum arquivo de código foi alterado pelo revisor.

## T1 | APROVADO
- SQL relido inteiro contra a Tarefa 1: idêntico ao plano (coluna `agendadas` ordem 6 e `ON CONFLICT DO NOTHING`, CHECK idempotente, `demandas_agendada_chegou`, gatilho `_08`, `rolar_colunas_por_dia`).
- `rolar_colunas_por_dia` conferida contra a versão no repo (20260930200000, única definição; `seguranca_fase2` só mexe em permissão): diferença exclusiva é o `OR` das agendadas (`prazo = hoje+desloc` ou, em desloc 0, `prazo < hoje`). Nenhum `REVOKE` repetido, como pede o plano.
- Interação com `demandas_aplica_regra_data` (`_20`, versão 30/09): INSERT com prazo não mexe; edição pelo formulário (envia status+prazo) cai em `_08` e depois `_20` recalcula o prazo igual à data (hoje/+1/+2), coerente; update só de prazo não dispara `_20`; virada roda com `app.sem_regra_data = on`. Ordem alfabética `_05 < _08 < _10 < _15 < _20` correta.
- Teste de banco rodado (transação desfeita): migration 2x, 10 dias fica, 0/1/2 dias desce, sem data recusada, virada com 3 dias de folga não mexe, com 2 desce, vencida entra em Fazer hoje, trocar data desce, feita guarda a data, coluna de sistema sem regra.
- `aplicar-migration.mjs` igual ao plano (transação, registra versão), NÃO executado.
- Observação (não bloqueia): o executor pulou o passo 2 (ver falhar por ENOENT); irrelevante.

## T2 | APROVADO
- `COLUNA_AGENDADAS = "agendadas"` e `resumoAgendada(prazo, hoje): string` exatos do plano; imports `.ts` relativos; teste cobre os dois casos (68 dias / 23/01 e 3 dias / amanhã) e passa.
- Observação (não bloqueia): fora da faixa normal (agendada parada em Agendadas porque a coluna Fazer foi apagada no Admin) o texto pode sair "em 1 dias" ou negativo; caso raro, sem ajuste.

## T3 | APROVADO
- `fetchDemandaColunas` com `.neq("id", COLUNA_AGENDADAS)` antes do `.order`; é o único acesso a `demanda_colunas` por listagem (Admin e `index.tsx` usam esse hook ou só update/delete de colunas que já existem na lista).
- Admin "Zerar colunas": `.neq("id", COLUNA_AGENDADAS)` na linha do delete; `wipeAllDemandas()` roda antes, então as demandas agendadas somem e a coluna de sistema fica.
- Drawer: `agendada` logo após `currentColumn`, selo "Agendada" com `CalendarClock`, "Remover data" com `!agendada`. O calendário do drawer já ignora seleção vazia (`date && ...`), então não há como zerar a data e quebrar o CHECK. Comentários existentes preservados (diff só tem adições, exceto a linha do botão e o delete do Admin).
- Interface com T2 bate (`COLUNA_AGENDADAS` importado de `@/lib/agendadas`).

## T4 | APROVADO
- Prop `agendar?: boolean` na interface e na assinatura; `hojeBrasilia` importado de `@/lib/entrega`.
- Com `agendar`: Coluna (`status`) e bloco Tarefa Recorrente escondidos; grade vira uma coluna; data com label "Data agendada", `required` e `min = hoje em Brasília`; botão "Agendar". Sem `agendar`, o comportamento antigo é idêntico.
- `status` vem de `initialValues.status` (`"agendadas"`); schema (`status.min(1)`) aceita. A indentação dos blocos envolvidos não foi reajustada (só estética, tsc passa).
- O relatório do executor dizia item `[ ]` e check não rodado; o check (tsc) foi rodado agora e passa.

## T5 | APROVADO
- Props do `AgendadasSheet` (`aberto, onOpenChange, agendadas, onAgendar, onAbrir, onEditar, onConcluir, onExcluir`) batem exatamente com o uso no `index.tsx`; `resumoAgendada`, `siglaDoDia`, `formatarDataCurta`, `hojeBrasilia` existem.
- `demandas` sem filtro continua em drag-and-drop (`useKanbanDnd items`), `salvarContainers`, `marcarPrioridade`, escolha de dia, seleção em massa e contagem de coluna. As agendadas ficam fora de qualquer container (nenhum card é renderizado delas), então o arrasto não as toca.
- `doQuadro` exclui `status === 'agendadas'` e alimenta só o `useBusca`; `filteredDemandas` (Kanban por `col.id`, Lista, "Selecionar todas" na linha ~705) já nasce sem elas.
- `openAgendar`, toast "Agendada para DD/MM", botões (Agendadas ghost com contador, Agendar outline com `CalendarClock`), diálogo condicionado, painel montado depois do Dialog, excluir reaproveita o AlertDialog ("Remover") e concluir usa `moverParaFeito` (status feito; o banco guarda a data). Edição existente envia status `agendadas` e o banco desce se a data ficou a 2 dias ou menos.
- `loadDemandas` não filtra status, então as agendadas chegam ao estado; dashboard só conta concluídas, sem impacto.
- Observação (não bloqueia): `demandas.length > 0` nas mensagens de "busca sem resultado" conta agendadas; efeito só em texto.

## T6 | APROVADO
- `testar-agendadas.mjs` igual ao passo 1 da Tarefa 6; `node --check` passa. Seletores batem com a UI: botão "Agendar" do cabeçalho e do diálogo, placeholder "O que precisa ser feito?", `input[type=date]`, toast "Agendada para", botão "Agendadas", `li` do painel, botão "Excluir" (aria-label) e "Remover" do alertdialog. Não executado (fica com a sessão principal).

RESULTADO: aprovados 6, ajustados 0, refazer 0
