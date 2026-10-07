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
