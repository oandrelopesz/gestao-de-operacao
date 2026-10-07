# Ferramentas da migração para fora do Lovable

Plano: `docs/superpowers/plans/2026-10-07-migracao-lovable.md` · Spec: `docs/superpowers/specs/2026-10-07-migracao-lovable-design.md`

Pacote próprio (não faz parte do site): `npm install` aqui dentro. Segredos locais só em `%USERPROFILE%\.gestao\` (nunca no repositório).

| Arquivo | Para quê |
|---|---|
| `catalogo.sql` | Fotografia da estrutura (tabelas, colunas, constraints, índices, funções, views, gatilhos, políticas, permissões, sequências, realtime, extensões, enums, buckets, cron) como `{ categoria: [{ chave, def }] }`. Roda igual nos dois bancos. |
| `hashes.sql` | Contagem e hash do conteúdo de cada tabela de `public` (UTC fixo). |
| `comparar.mjs` | `node comparar.mjs catalogo <antigo> <novo>` e `node comparar.mjs hashes <antigo> <novo>`; sai com código 1 se houver diferença. Testes: `npm test`. |
| `conexao.mjs` | Conexão `pg` com o banco novo a partir de `db.json` (sem imprimir a senha). |
| `consultar.mjs` | Roda `catalogo.sql` ou `hashes.sql` no banco novo e grava em `.gestao`. |

No banco antigo, as consultas rodam pela chamada `cloud/query` do editor SQL do Lovable (ver a nota `editor-sql-e-migrations` do cofre).

## Referências ao projeto antigo fora do site (trocar na virada)

Levantadas em 2026-10-07 com `grep -rl bnpvzguapunsztsdvmrs C:/Users/Andre/Sistemas`:

- `Briefing E-Commerce/apps-script/Code.js` e `Contratos/apps-script/Code.js`: `SISTEMA_RPC` + `SISTEMA_CHAVE` (RPC `registrar_envio_formulario`, chave pública).
- Bancos dos projetos `Briefing Estratégia` e `Briefing Negócios`: função criada por `20260927130000_avisar_sistema_gestao.sql` com `v_url` + `v_chave` (mesma RPC).
- Deste repositório: n8n (`infra/swipe-worker/n8n-workflow.json` e os workflows do saldo e do Fireflies), stacks `infra/swipe-worker` e `infra/transcritor`, `infra/planilha-crm/Codigo.gs`, scripts de teste em `tools/auditoria-mobile`, `.env`.

## Diário da execução

- **2026-10-07, Tarefa 2:** projeto `gestao-de-operacao` (ref `uajusldnvzgakffofkhl`, São Paulo, Postgres 17.11, gratuito) na organização `awnheqfcqtedyylzfewx`. Pooler `aws-1-sa-east-1.pooler.supabase.com` (5432 sessão). Token de gestão "migracao-gestao" (7 dias, só a organização) e senha do banco em `%USERPROFILE%\.gestao\`. A raiz da API REST responde em ~0,09 s (o antigo ~0,45 s numa consulta).
- **Tarefa 3:** armadilhas: (1) o CLI lê `SUPABASE_PROJECT_ID` do `.env` do repositório e tentou o banco antigo: usar sempre `--db-url` (montada de `db.json`) e `--project-ref`; (2) duas migrations com a mesma versão `20261001200000`: a da isenção virou `20261001200001`; (3) os arquivos de migration são CRLF e o Lovable gravou as funções com LF: 38 funções diferiam só por `\r` e 1 por uma linha em branco; foram recriadas no novo com o texto exato do antigo (`pg_get_functiondef`); (4) `demandas_ajusta_dia_fds()` tinha sido apagada no antigo fora das migrations: `20261007230000_paridade_funcao_orfa.sql`. Resultado: catálogo com diferença zero. Os 6 agendamentos do novo estão **desligados**.
- **Tarefas 4-5:** 9 funções publicadas no novo com `npx supabase functions deploy --project-ref uajusldnvzgakffofkhl --use-api` (sem Docker). Chaves: a função temporária `migrar-chaves` (no antigo, publicada pelo chat do Lovable) copiou 14 chaves direto para a API de gestão; conferidas pelo sha256 (`supabase secrets list` devolve o resumo, não o valor). Fora da cópia: `LOVABLE_API_KEY` (do Lovable, nenhum código usa) e `GOOGLE_REDIRECT_URI` (gravado novo: função `google-oauth-exchange` do projeto novo) + `APP_URL=https://gestao.andrelopes.digital`. No Google Cloud (cliente "Gestao de Operacao Web", conta contato@) o retorno novo foi ACRESCENTADO; o antigo fica até a virada.
- **Tarefas 6-8 (ensaio):** `exportar.js` na página do editor SQL do Lovable baixa tudo (67 tabelas, 2.685 linhas, 1 usuário) com cada tabela como TEXTO JSON (sem passar por número de JavaScript); `importar.mjs` carrega numa transação com `session_replication_role = replica` (3 s). Hashes: 66 tabelas idênticas + `planilha_config` mudou ao vivo (o Apps Script grava `ultima_conferencia_em` a cada 5 min). `demandas.dia_fim_de_semana` está em OUTRA POSIÇÃO no antigo (apagada à mão em 24/09 e recriada pela migration de compatibilidade), nada usa a posição; por isso `hashes.sql` usa `::jsonb::text` (chaves em ordem canônica). Storage: `migrar-chaves` acao `copiar-storage` em lotes de 25 (lote grande passa de 150 s): fireflies 608/608, pdfs 12/12, iguais por nome e tamanho. Vault vazio nos dois. Agendamentos HTTP apontados para o novo pela migration `20261008000000` (seguem desligados).
- **Cuidado até a virada:** escrever em `prospeccao`/`banco_leads` no banco novo dispara `planilha_avisar` para o Apps Script real (que ainda lê o antigo). Testes de escrita no novo são apagados pela cópia final, mas evitar mexer no CRM por lá.

## Backup diário (desde 2026-10-08)

`.github/workflows/backup-banco.yml` roda todo dia às 04:00 (Brasília) e também à mão (Actions → backup-banco → Run workflow):

1. `backup.mjs fazer`: com o usuário **só de leitura** `backup_leitura` (BYPASSRLS, SELECT em `public`, sem escrita; senha só em `%USERPROFILE%\.gestao\backup.json` e no segredo `BACKUP_DB_URL` do GitHub), abre uma transação REPEATABLE READ, exporta o snapshot e tira `hashes.sql` e o `pg_dump` (dados de `public`, formato custom) **no mesmo snapshot**.
2. Guarda `banco.dump` + `hashes.json` + `resumo.json` como artefato `backup-banco-AAAA-MM-DD` (30 dias).
3. `backup.mjs conferir`: sobe um banco descartável com `supabase db start` (todas as migrations do repositório), desliga os agendamentos, limpa as linhas-padrão, restaura o dump e exige hash idêntico em todas as tabelas. Falhou = e-mail do GitHub para o André.

`auth.users` fica fora: o Supabase não deixa o `postgres` repassar leitura do esquema `auth`, e a tabela tem 1 usuário fixo (o sistema não tem login; o usuário está no export da migração). **Na fase 2 (login), o backup tem de passar a incluir `auth`.**

**Restaurar de verdade** (banco perdido ou dado apagado por engano):
1. Baixar o artefato: `gh run download <id da execução> -n backup-banco-AAAA-MM-DD` (lista: `gh run list -w backup-banco`).
2. Num projeto Supabase com as migrations aplicadas (`npx supabase db push --db-url ...`), limpar as tabelas de `public` (`TRUNCATE ... CASCADE`, como em `backup.mjs conferir`) e rodar, com pg_restore 17:
   `PGOPTIONS='-c session_replication_role=replica' pg_restore --dbname="<url do postgres>" --data-only --no-owner --exit-on-error -n public banco.dump`
3. Conferir com `hashes.sql` contra o `hashes.json` do artefato (`node comparar.mjs hashes`). Para recuperar só algumas linhas, restaurar num banco descartável e copiar de lá.
