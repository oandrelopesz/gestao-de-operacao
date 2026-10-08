# Migração para fora do Lovable: plano de execução

> **CONCLUÍDA em 07/10/2026 (~23h, Brasília).** Diferenças em relação a este plano: o backup diário ficou no GitHub Actions (não na VPS nem no R2); a virada foi adiantada para antes da meia-noite; a chave pública nova foi colada pelo André em lugares "de espera" e religada na virada. Diário completo, testes e caminho de volta em `tools/migracao/README.md`.

> **Para agentes:** executar com superpowers:executing-plans (inline, nesta sessão): quase todos os passos usam o navegador do André, aprovações dele (passkey, código) e CLIs logados nesta máquina, o que não funciona bem com subagentes. Passos com checkbox (`- [ ]`).

**Objetivo:** tirar o sistema do Lovable sem perder dado nem funcionalidade: site na Cloudflare do André, banco/funções/chaves/arquivos/realtime num Supabase próprio em São Paulo, backup diário, e virada com conferência 100%.

**Arquitetura:** o projeto novo é montado e ensaiado inteiro enquanto o antigo segue em produção; a virada congela o antigo, copia os dados finais, confere por contagem e hash, troca as integrações e o domínio e religa tudo no novo. O antigo fica intacto 30 dias como caminho de volta.

**Ferramentas:** Supabase CLI (`npx supabase`, 2.120), wrangler (`npx wrangler`, 4.141), Node 24 com `pg` (pasta `tools/migracao`, pacote próprio), editor SQL do Lovable (chamada `cloud/query` de dentro da página), Chrome do André, API do Portainer, REST do n8n.

**Spec:** `docs/superpowers/specs/2026-10-07-migracao-lovable-design.md`

## Regras globais

- Nada se perde: toda tabela confere em contagem e hash; todo objeto do Storage confere em caminho e tamanho; nenhuma diferença de catálogo fica sem explicação.
- O projeto antigo (`bnpvzguapunsztsdvmrs`) não é alterado até a virada, exceto pela função temporária `migrar-chaves` (criada e apagada).
- Valores de chave nunca aparecem em saída de ferramenta, chat, arquivo do repositório ou cofre. Segredos locais só em `%USERPROFILE%\.gestao\` (fora do repositório). Página web nunca recebe chave digitada pelo Claude.
- Agendamentos do projeto novo ficam **desligados** até a virada (senão o Instagram publicaria em dobro e as viradas rodariam duas vezes).
- Senha, código por e-mail ou passkey pedidos por sites: o André confirma.
- Meta: nunca acessada (nada a mudar lá).
- `package.json` do site não muda.
- Cada etapa termina registrada no cofre (histórico curto) e com commit quando há arquivo.

---

### Tarefa 1: Ferramentas da migração (`tools/migracao`)

**Arquivos:**
- Criar: `tools/migracao/package.json`, `tools/migracao/conexao.mjs`, `tools/migracao/catalogo.sql`, `tools/migracao/hashes.sql`, `tools/migracao/comparar.mjs`, `tools/migracao/comparar.test.mjs`, `tools/migracao/README.md`

**Interfaces produzidas:**
- `conexao.mjs`: `export async function conectar(): Promise<pg.Client>` lendo `%USERPROFILE%\.gestao\db.json` (`{ ref, senha, host }`), sem imprimir nada.
- `catalogo.sql`: uma consulta que devolve `{ tabelas, colunas, constraints, indices, funcoes, views, gatilhos, politicas, grants, sequencias, realtime, extensoes, enums, buckets }` como JSON (mesma saída nos dois bancos).
- `hashes.sql`: uma consulta que devolve `[{ tabela, linhas, hash }]` para todas as tabelas de `public`, com `hash = md5(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text))`.
- `comparar.mjs`: `export function compararCatalogos(antigo, novo) => { faltando: string[], sobrando: string[], diferentes: string[] }` e `export function compararHashes(antigo, novo) => string[]` (lista de divergências legíveis).

- [ ] **Passo 1:** escrever `comparar.test.mjs` (node --test) cobrindo: catálogos iguais dão listas vazias; objeto só no antigo vai em `faltando`; só no novo em `sobrando`; mesma chave com definição diferente em `diferentes`; hashes iguais dão `[]`; contagem ou hash diferentes dão uma linha por tabela; tabela ausente num dos lados aparece.
- [ ] **Passo 2:** rodar `node --test tools/migracao/comparar.test.mjs` e ver falhar.
- [ ] **Passo 3:** implementar `comparar.mjs` (normaliza cada item como `tipo:nome` e compara a definição em texto).
- [ ] **Passo 4:** rodar o teste e ver passar.
- [ ] **Passo 5:** escrever `catalogo.sql` e `hashes.sql`; rodar os dois no banco antigo pela `cloud/query` (só leitura) e conferir que devolvem JSON válido.
- [ ] **Passo 6:** `package.json` próprio com `pg`; `npm install` dentro de `tools/migracao` (não toca o `package.json` do site); `README.md` com o uso.
- [ ] **Passo 7:** procurar outras referências ao projeto antigo fora do repositório: `grep -rl bnpvzguapunsztsdvmrs "C:/Users/Andre/Sistemas"` (sem `node_modules`), listando os projetos de formulários e Apps Scripts para a Tarefa 12.
- [ ] **Passo 8:** commit.

### Tarefa 2: Projeto Supabase novo

- [ ] **Passo 1:** `npx supabase login` (abre o navegador; aprovar a autorização; se pedir senha ou passkey, o André confirma).
- [ ] **Passo 2:** `npx supabase orgs list` e escolher a organização do André (a mesma do projeto do banco de leads); conferir no painel se o plano gratuito permite mais um projeto ativo.
- [ ] **Passo 3:** gerar a senha do banco e criar o projeto sem exibir a senha:
```bash
mkdir -p "$USERPROFILE/.gestao" && PW=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))") && npx supabase projects create gestao-de-operacao --org-id <ORG> --region sa-east-1 --db-password "$PW" > "$USERPROFILE/.gestao/criar.log" 2>&1; node -e "require('fs').writeFileSync(process.env.USERPROFILE+'/.gestao/db.json', JSON.stringify({senha: process.argv[1]}))" "$PW"; grep -o 'ref[^ ]*' "$USERPROFILE/.gestao/criar.log" | head -1
```
- [ ] **Passo 4:** completar `db.json` com `ref` e `host` do pooler de sessão (porta 5432) pegos em `npx supabase projects list` e no painel; testar `conectar()` com `SELECT version()` (tem que ser Postgres 17).
- [ ] **Passo 5:** `npx supabase link --project-ref <REF>` (senha via `SUPABASE_DB_PASSWORD` lida do arquivo, sem imprimir).
- [ ] **Passo 6:** medir o tempo por consulta no projeto novo (mesmo método de 07/10: `curl -w %{time_starttransfer}` numa tabela pequena, 5 vezes) e anotar contra 0,37 a 0,55 s do antigo.

### Tarefa 3: Estrutura do banco idêntica

**Arquivos:** possíveis migrations de correção `supabase/migrations/2026100XXXXXXX_correcao_*.sql`.

- [ ] **Passo 1:** `SUPABASE_DB_PASSWORD=... npx supabase db push` (aplica as 106 migrations em ordem). Erro em alguma: entender a causa (diferença de ambiente do Lovable, ordem, objeto que já existe no Supabase novo) e corrigir com a menor mudança possível, sem alterar o efeito final; anotar cada caso.
- [ ] **Passo 2:** gerar o catálogo do antigo (`catalogo.sql` pela `cloud/query`, salvo como download `catalogo-antigo.json`) e do novo (`node tools/migracao/catalogo.mjs > catalogo-novo.json`, pasta `%USERPROFILE%\.gestao\`).
- [ ] **Passo 3:** `node tools/migracao/comparar.mjs catalogo ...` e listar as diferenças.
- [ ] **Passo 4:** para cada diferença, escrever a correção (migration nova) que deixa o novo igual ao antigo; aplicar; repetir os Passos 2 a 4 até `faltando`, `sobrando` e `diferentes` vazios (diferenças inerentes ao ambiente, como objetos internos do Lovable, ficam documentadas no README com o motivo).
- [ ] **Passo 5:** commit das migrations de correção.

### Tarefa 4: Funções no projeto novo

- [ ] **Passo 1:** `npx supabase functions deploy --project-ref <REF>` das 9 funções (gmn, google-oauth-exchange, google-token, instagram, materializar-recorrentes, notificacao-matinal-tarefas, planilha, r2, verificar-saldos-baixos), com o `supabase/config.toml` atual (`verify_jwt = false` onde já está).
- [ ] **Passo 2:** `npx supabase functions list` mostra as 9 ativas; `GET` em `gmn` e `google-token` responde (sem as chaves ainda, os campos de chave vêm falsos: esperado).

### Tarefa 5: Chaves de servidor para servidor

**Arquivos:** criar `supabase/functions/migrar-chaves/index.ts` (temporária; apagada no Passo 7).

Comportamento da função (roda no projeto **antigo**):
- `POST` com cabeçalhos `x-token-gestao` (token de gestão do Supabase do André) e `x-ref-novo`.
- Lê `Deno.env.toObject()`, descarta nomes que começam com `SUPABASE_`, `DENO_`, `SB_` e variáveis do ambiente de execução, e envia o resto para `POST https://api.supabase.com/v1/projects/{ref}/secrets` (corpo `[{ name, value }]`).
- Devolve só `{ nomes: string[], resumo: { nome: sha256(valor) } }`, nunca valores. CORS liberado só para `https://supabase.com`.

- [ ] **Passo 1:** escrever a função; commit e push; pedir no chat do Lovable: "Faça apenas o deploy da edge function migrar-chaves. Não altere, crie nem apague nenhum arquivo, não mexa no banco e não publique o site."
- [ ] **Passo 2:** no painel do Supabase (aba do Chrome), criar um token de gestão temporário (nome "migracao-temporaria", validade curta) e, **na mesma chamada de JavaScript da página**, ler o token do elemento da tela e chamar a função antiga com ele no cabeçalho; devolver ao Claude só a resposta da função (nomes e resumos). O token não sai da página.
- [ ] **Passo 3:** `npx supabase secrets list --project-ref <REF>` mostra os mesmos nomes; os resumos (sha256) do Supabase batem com os da função.
- [ ] **Passo 4:** regravar com os valores do projeto novo (públicos): `GOOGLE_REDIRECT_URI=https://<REF>.supabase.co/functions/v1/google-oauth-exchange` e `APP_URL=https://gestao.andrelopes.digital` (conferir o valor antigo de `APP_URL` pelo resumo antes).
- [ ] **Passo 5:** Google Cloud (projeto `gestao-de-operacao-509002`, conta contato@): **acrescentar** o novo endereço de retorno no cliente OAuth (o antigo fica, para o caminho de volta).
- [ ] **Passo 6:** revogar o token de gestão temporário no painel.
- [ ] **Passo 7:** apagar a função `migrar-chaves` do projeto antigo (pedido ao chat do Lovable) e do repositório; commit.

### Tarefa 6: Ensaio de cópia dos dados

**Arquivos:** criar `tools/migracao/exportar.js` (trecho colado na página do editor SQL do Lovable), `tools/migracao/importar.mjs`.

- [ ] **Passo 1:** `exportar.js`: na página do editor SQL antigo, para cada tabela de `public` (lista do catálogo), `SELECT json_agg(t) FROM public."<tabela>" t`; mais `SELECT row_to_json(u) FROM auth.users u` e o resultado de `hashes.sql`; junta tudo num objeto `{ tabelas: {...}, auth_users: [...], hashes: [...], quando }` e baixa como `export-gestao-<data-hora>.json` (um arquivo, ~30 MB, pasta Downloads; o André já autorizou downloads da migração).
- [ ] **Passo 2:** `importar.mjs <arquivo>`: conecta no novo, numa transação: `SET session_replication_role = replica` (se o papel não permitir, `ALTER TABLE ... DISABLE TRIGGER USER` em cada tabela), `TRUNCATE` de todas as tabelas de `public` com `CASCADE`, insere cada tabela com `INSERT ... SELECT * FROM json_populate_recordset(NULL::public."<t>", $1)` em lotes de 500 linhas, insere o usuário padrão em `auth.users` se faltar, acerta todas as sequências (`setval` para o máximo da coluna), religa os gatilhos e faz commit.
- [ ] **Passo 3:** rodar `hashes.sql` no novo e `compararHashes(export.hashes, novo)`; tem que dar `[]`. Divergência: achar a causa (tipo, fuso, ordem de json) e corrigir o import, nunca o dado.
- [ ] **Passo 4:** anotar o tempo total exportação + importação + conferência (é a base da parada da virada).
- [ ] **Passo 5:** commit dos scripts.

### Tarefa 7: Arquivos do Storage

- [ ] **Passo 1:** conferir no catálogo que os 4 buckets (`fireflies`, `pdfs`, `notas`, `fluxogramas`) e as políticas de `storage.objects` existem no novo (criados pelas migrations; senão, migration de correção).
- [ ] **Passo 2:** acrescentar à função temporária da Tarefa 5 (antes de apagá-la) a ação `copiar-storage`: lista os objetos de cada bucket com a chave de serviço do antigo, baixa cada um e sobe no novo com a chave de serviço do novo (lida na mesma chamada de página do painel do Supabase, como o token da Tarefa 5), mesmo caminho e `contentType`, sem sobrescrever o que já existe com o mesmo tamanho; devolve `{ bucket, total, copiados, iguais, erros }`.
- [ ] **Passo 3:** conferir no novo, por SQL, a lista `(bucket_id, name, metadata->>'size')` igual à do antigo (620 objetos, 27 MB + 4,7 MB).

### Tarefa 8: Agendamentos, vault e realtime no novo

- [ ] **Passo 1:** ler no antigo os comandos completos dos 6 agendamentos e os nomes dos segredos do vault que eles usam (sem valores).
- [ ] **Passo 2:** no novo, criar os segredos do vault com os mesmos nomes e os valores do projeto novo, por script que lê as chaves do novo pela API de gestão (`/v1/projects/{ref}/api-keys`) e grava via SQL, sem imprimir.
- [ ] **Passo 3:** criar os 6 agendamentos no novo com o mesmo horário e comando (endereço trocado para o novo) e **desligar** todos (`cron.alter_job(job_id, active := false)`).
- [ ] **Passo 4:** conferir a publicação `supabase_realtime` com as 11 tabelas (catálogo da Tarefa 3).

### Tarefa 9: Site na Cloudflare

**Arquivos:** modificar `wrangler.jsonc` (nome do Worker `gestao-de-operacao`, `vars` com `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` do novo, que são públicos); `.env` só na virada (Tarefa 12).

- [ ] **Passo 1:** `npx wrangler login` (aprovar no navegador; se pedir senha ou passkey, o André confirma).
- [ ] **Passo 2:** build com o banco novo sem tocar o `.env` versionado: `VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... VITE_SUPABASE_PROJECT_ID=... npx vite build` e `npx wrangler deploy` (configuração gerada pelo plugin da Cloudflare em `dist/`); endereço de teste `gestao-de-operacao.<conta>.workers.dev`.
- [ ] **Passo 3:** no endereço de teste, abrir as 29 abas e conferir que carregam os dados do ensaio (sem erro no console); `/privacidade` responde.
- [ ] **Passo 4:** ligar o Workers Builds ao GitHub (repositório `oandrelopesz/gestao-de-operacao`, ramo `main`) para deploy a cada push; conferir um build automático.
- [ ] **Passo 5:** commit do `wrangler.jsonc`.

### Tarefa 10: DNS de andrelopes.digital na Cloudflare

- [ ] **Passo 1:** ler a zona inteira na Hostinger (painel de DNS) e salvar a lista em `%USERPROFILE%\.gestao\dns-hostinger.json`.
- [ ] **Passo 2:** adicionar o site `andrelopes.digital` na Cloudflare (plano gratuito); comparar os registros importados com a lista da Hostinger, um por um (MX, SPF, DKIM e DMARC do Google Workspace, verificações do Google, `gestao` A e `_lovable.gestao` TXT do Lovable, demais); completar o que faltar; registros de e-mail e de verificação sem proxy.
- [ ] **Passo 3:** trocar os nameservers na Hostinger para os da Cloudflare (o login da Hostinger pede código por e-mail: o André confirma).
- [ ] **Passo 4:** esperar a zona ficar "Ativa"; conferir com `nslookup` contra um DNS público: MX, SPF e o `gestao` ainda apontando para o Lovable (nada muda para o usuário).
- [ ] **Passo 5:** teste de e-mail: mensagem da andfalopes@ para a contato@ (Gmail) chega; resposta volta.

### Tarefa 11: Backup diário

**Arquivos:** criar `infra/backup-banco/stack.yml`, `infra/backup-banco/backup.sh`, `infra/backup-banco/README.md`.

- [ ] **Passo 1:** serviço no Swarm com imagem `postgres:17-alpine`: todo dia às 04:00 (horário de Brasília) `pg_dump --format=custom` do projeto novo para um volume `backups`, guardando os 30 mais recentes; a senha do banco entra como secret do Docker criado pela API do Portainer por script que lê `%USERPROFILE%\.gestao\db.json` (sem imprimir).
- [ ] **Passo 2:** cópia para o R2: enviar o arquivo do dia pela função `r2` do projeto novo (que já tem as chaves do R2), em `backups/AAAA-MM-DD.dump`, autenticando como o worker do Swipe autentica; se a função não aceitar esse uso, acrescentar uma ação `backup` mínima nela.
- [ ] **Passo 3:** rodar um backup manual e restaurar num banco descartável (container `postgres:17` na VPS) conferindo as contagens com `hashes.sql`.
- [ ] **Passo 4:** commit.

### Tarefa 12: Virada

Pré-requisitos: Tarefas 1 a 11 concluídas; ensaio de dados conferido; site de teste ok; DNS na Cloudflare ativo.

- [ ] **Passo 1:** avisar o André do início (o sistema fica parado de 20 a 30 minutos).
- [ ] **Passo 2:** congelar o antigo: desligar os 6 agendamentos (`cron.alter_job(..., active := false)`) e despublicar no n8n os workflows que escrevem no banco (fila do Swipe, alerta de saldo, os 3 do Fireflies); conferir que a fila de jobs e os posts agendados do Instagram não têm nada rodando.
- [ ] **Passo 3:** exportação final (Tarefa 6, Passo 1) e importação (Passo 2) no novo; conferência de hashes `[]`; Storage conferido de novo (novos arquivos desde o ensaio).
- [ ] **Passo 4:** trocar para o novo: credencial `Supabase - Gestão de Operação (anon)` e URLs nos 5 workflows do n8n (REST do n8n) e republicar pelo botão Publish; variáveis `SUPABASE_URL` e `SUPABASE_ANON_KEY` das stacks `swipe-worker` e `transcritor` (API do Portainer, `service update`); Apps Script da Planilha CRM e dos formulários (lista da Tarefa 1, Passo 7); `.env` do repositório com os valores públicos do novo (commit e push; o Workers Builds publica).
- [ ] **Passo 5:** ligar os 6 agendamentos no novo.
- [ ] **Passo 6:** apontar `gestao.andrelopes.digital` para o Worker (domínio próprio do Worker na Cloudflare; remover o A do Lovable); conferir o site no domínio servindo pela Cloudflare do André.
- [ ] **Passo 7:** testes de fumaça: abrir Demandas, Saldo, Clientes, Swipe, Agenda e Arquivos no domínio; Drive conectado (token renova); uma recarga TESTE criada e apagada.
- [ ] **Caminho de volta (se qualquer passo de 3 a 7 falhar sem correção rápida):** apontar `gestao` de novo para o Lovable (registro A e TXT `_lovable.gestao` na Cloudflare), voltar a credencial e as URLs do n8n e as variáveis das stacks para o antigo, religar os agendamentos antigos, voltar o `.env`; se o novo chegou a receber gravações, exportá-las com `exportar.js` apontado para o novo e importar no antigo pela `cloud/query`. Avisar o André e registrar a causa antes de tentar de novo.

### Tarefa 13: Prova completa e encerramento

- [ ] **Passo 1:** checklist por módulo, no domínio, contra o export final (números e listas iguais) e com registro TESTE criado, editado e apagado onde grava: acessos, admin, agenda, arquivos, clientes, crm, cursos, dados-internos, dashboard, financeiro, fireflies, fluxogramas (lista e editor), gmn, habilidades, ideias, demandas, instagram, links, livros, notas, nps, onboarding, pdfs, prospeccao, roadmap, saldo, swipe, transcritor, ver-depois, privacidade.
- [ ] **Passo 2:** integrações de ponta a ponta: alerta de saldo (execução manual no n8n, mensagem no grupo); fila do Swipe (um download real); Fireflies (PDFs abrem do bucket novo; próximo webhook gravado); Transcritor (uma transcrição curta); GMN (uma prévia); Instagram (um agendado na @kobegrowth, publicado pelo agendamento novo e apagado); Drive e Agenda; arquivos e notas do R2; Planilha CRM (uma edição de ida e volta, revertida); formulário de dados internos (envio de teste, apagado); `virar_dia_demandas` rodada à mão e a execução real da meia-noite conferida em `cron.job_run_details`; notificação matinal do dia seguinte.
- [ ] **Passo 3:** medir velocidade (tempo por consulta e troca de aba) contra os números de antes.
- [ ] **Passo 4:** atualizar o cofre: reescrever [[publicar-e-deploy]] (push = deploy; migrations e funções pelo CLI; chaves no painel do Supabase), [[editor-sql-e-migrations]], [[banco-de-dados]], [[codigo]], [[seguranca]], [[n8n-e-evolution]], [[vps-portainer]], [[google-cloud-e-oauth]], notas de módulo afetadas, decisão e histórico; memórias do Claude (supabase-migrations-manual, lovable-build-falhando e afins).
- [ ] **Passo 5:** deixar o Lovable congelado; anotar no cofre a data (30 dias) para o André decidir cancelar.
