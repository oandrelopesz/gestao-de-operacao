# Aba Ideias — design

**Data:** 2026-09-21

## Objetivo

Uma aba `/ideias` para centralizar ideias de implementação — neste sistema, em outro sistema ou para um cliente — com visualização em cards, filtros e um botão que transforma a ideia em uma demanda do Kanban.

## Requisitos (do pedido do usuário)

1. Botão "Adicionar ideia" abre um formulário com:
   - **Tipo** (obrigatório): *Este sistema*, *Outro sistema* ou *Para cliente*.
   - Se **Para cliente**: dropdown de **agência** e depois dropdown de **cliente** (filtrado pela agência escolhida).
   - **Nome** (obrigatório).
   - **Descrição** (opcional).
   - **Links de referência** (opcional, vários).
2. A aba mostra as ideias em cards, com **filtro por tipo** e **filtro por agência**.
3. Cada card tem o botão **"Enviar para demandas"**. Ao clicar, o app pergunta **em qual coluna** do Kanban a demanda entra e cria a demanda já com descrição e links preenchidos.
4. As colunas oferecidas nesse diálogo são **sempre as colunas atuais** da aba Demandas: se o usuário criar/renomear/apagar colunas lá, a lista aqui reflete na hora.

## Decisões

| Ponto | Decisão | Por quê |
|---|---|---|
| Posição no menu | Grupo **Operação**, logo abaixo de "Demandas", ícone `Lightbulb` | Ideias viram demandas; ficam perto |
| Tabela | `public.ideias` (id, tipo, titulo, descricao, links `TEXT[]`, agencia, cliente_id, demanda_id, created_at, updated_at) | Mesmo modelo simples das outras abas (`ver_depois`) |
| Vínculo com a demanda criada | `ideias.demanda_id` (FK `ON DELETE SET NULL`) | O card mostra "Já está nas demandas"; permite reenviar se a demanda for apagada |
| Links na demanda | A tabela `demandas` só tem `descricao`; a descrição da demanda = descrição da ideia + bloco `Links de referência:` com um link por linha | Não mexer no schema de demandas |
| Cliente na demanda | `demandas.cliente_id` = `ideias.cliente_id` quando tipo = cliente | A demanda já nasce ligada ao cliente |
| Prioridade / ordem | `prioridade = 'media'`, `ordem` = maior ordem da coluna + 1 (consulta no momento do envio) | Igual ao "quick add" do Kanban |
| Colunas sempre atualizadas | O diálogo "Enviar para demandas" chama `fetchDemandaColunas()` **toda vez que abre**, sem cache | Garante o requisito 4 sem realtime extra |
| Coluna padrão no diálogo | `fazer_hoje` se existir; senão a primeira coluna não-sistema; senão a primeira | Corresponde ao default do `DemandaForm` |
| Agência gravada na ideia | `ideias.agencia` (id da agência) além de `cliente_id` | O filtro por agência não depende de join, e a ideia continua filtrável se o cliente for arquivado |
| Testes | Regras puras (normalizar links, montar descrição, filtrar) em `src/lib/ideiasTexto.ts` sem imports, testadas com `node --test` (Node 24 executa `.ts` direto) | O projeto não tem test runner; não adicionar dependências |
| RLS | Policy `FOR ALL USING (true) WITH CHECK (true)` como todas as tabelas do app | O app usa a chave pública com usuário fixo |
| Migration | `supabase/migrations/20260921120000_ideias.sql`, aplicada manualmente no SQL editor do Lovable Cloud | Não há CLI (ver memória `supabase-migrations-manual`) |

## Fora de escopo

- Comentários, votos, status de ideia (aprovada/descartada), anexos.
- Sincronizar edições da ideia com a demanda depois de enviada (a demanda é uma cópia no momento do envio).
