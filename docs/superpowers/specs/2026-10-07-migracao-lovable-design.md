# Migração para fora do Lovable (site na Cloudflare, banco no Supabase próprio)

**Data:** 2026-10-07 · **Pedido:** André · **Exigência dele:** "nada pode se perder, nada pode perder a funcionalidade, quero uma migração EXCELENTE". O Claude conduz tudo (criar projetos, configurar, transferir chaves); o André não quer mexer em nada.

## 1. Decisões do André

- Site na **Cloudflare (Workers) da conta dele**; banco, funções, chaves, arquivos e tempo real num **projeto Supabase próprio e separado**, no **plano gratuito**.
- Segurança (login + banco trancado) fica para uma **fase 2**, depois da migração estável.
- Virada: pode ser assim que tudo estiver pronto ("agora mesmo"), com parada curta.
- O Claude gerencia chaves, projetos e configurações.

## 2. Arquitetura final

| Peça | Hoje | Depois |
|---|---|---|
| Site (TanStack Start, build Cloudflare) | Lovable publica na Cloudflare dele | Worker na conta Cloudflare do André, deploy a cada push na `main` |
| Banco Postgres 17 + funções Deno + chaves + Storage + Realtime | Lovable Cloud (`bnpvzguapunsztsdvmrs`), sem acesso direto | Projeto Supabase do André, região **São Paulo (sa-east-1)**, gratuito |
| Domínio `gestao.andrelopes.digital` | DNS na Hostinger apontando para o Lovable | DNS de `andrelopes.digital` na Cloudflare (gratuito), domínio próprio ligado ao Worker |
| Worker do Swipe, Transcritor, n8n, Evolution | VPS (Swarm/Portainer) | Iguais; só trocam endereço e chave pública do banco |
| Backup | nenhum controlado pelo André | `pg_dump` diário na VPS para o R2 (30 dias) |
| Lovable | produção | reserva intacta por 30 dias; depois o André decide |

Ganho de velocidade esperado: hoje cada consulta ao banco leva 0,37 a 0,55 s (banco longe); em São Paulo a meta é perto de 0,05 a 0,1 s (medir depois de criar o projeto).

## 3. Inventário (levantado em 2026-10-07 pelo editor SQL, papel postgres)

- Banco: 25 MB; Postgres 17.6; 55 funções em `public`; 106 migrations no repositório.
- Extensões: plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault, pg_cron 1.6.4, pg_net 0.20.
- `cron.job` (6): `notificacao-matinal-diaria` (0 11 * * *, chama a função pelo endereço do projeto), `virar-dia-demandas` (0 3), `sincronizar-passos-onboarding` (1 3), `limpar-transcricoes` (17 *), `materializar-recorrentes` (0 3), `instagram-passo` (* * * * *, chama a função pelo endereço).
- Realtime (`supabase_realtime`): prospeccao, curso_categorias, plataformas_ads, swipe_itens, demanda_conclusoes, crm_eventos, formularios_envios, gmn_posts, banco_leads_abas, banco_leads, ig_posts.
- `auth.users`: 1 (o usuário padrão `b34bdae5-7a67-4b63-a46f-8aad43a06c63`, dono de `user_id` em várias tabelas, com FK).
- Vault: segredos usados por agendamentos (conferir quantidade e nomes na execução).
- Storage: `fireflies` (privado, 608 arquivos, 27 MB), `pdfs` (privado, 12 arquivos, 4,7 MB, reserva até 30/10), `notas` (público, vazio), `fluxogramas` (privado, vazio). Políticas de `storage.objects` vão junto.
- Funções (9 + `_shared`): gmn, google-oauth-exchange, google-token, instagram, materializar-recorrentes, notificacao-matinal-tarefas, planilha, r2, verificar-saldos-baixos (legado). `verify_jwt = false` nas declaradas em `supabase/config.toml`.
- Chaves lidas pelas funções: ALLOWED_GOOGLE_EMAILS, APP_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, META_TOKEN, OPENAI_API_KEY, OPENAI_MODELO_IMAGEM, OPENAI_MODELO_TEXTO, OPENAI_MODELO_VISAO, R2_ACCESS_KEY_ID, R2_ACCOUNT_ID, R2_BUCKET (e R2_BUCKET_ARQUIVOS), R2_PUBLIC_BASE, R2_SECRET_ACCESS_KEY, SWIPE_KEY. As `SUPABASE_*` o Supabase injeta sozinho.
- Fora do site, apontam para o projeto atual: workflows do n8n (alerta de saldo, fila do Swipe, 3 do Fireflies; credencial `Supabase - Gestão de Operação (anon)`), stacks da VPS `swipe-worker` e `transcritor` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`), Apps Script da Planilha CRM Mestra (`infra/planilha-crm/Codigo.gs`), Apps Script dos formulários de dados internos, Google Cloud (URI de retorno do OAuth = função `google-oauth-exchange`), os 2 agendamentos que chamam funções, `GOOGLE_REDIRECT_URI`/`APP_URL`. Instagram: sem endereço de retorno na Meta (nada muda lá).
- Abas (29 rotas): acessos, admin, agenda, arquivos, clientes, crm, cursos, dados-internos, dashboard, financeiro, fireflies, fluxogramas (lista e editor), gmn, habilidades, ideias, demandas (index), instagram, links, livros, notas, nps, onboarding, pdfs, prospeccao, roadmap, saldo, swipe, transcritor, ver-depois; mais `/login` e `/privacidade`.

## 4. Estratégia peça por peça

### 4.1 Projeto novo
Criado pelo Claude na organização do André (gratuita, São Paulo), nome "gestao-de-operacao". Senha do banco gerada aleatoriamente no próprio terminal e guardada só num arquivo local fora do repositório (`%USERPROFILE%\.gestao\`), nunca exibida. Acesso do CLI pelo `supabase login` (aprovação no navegador).

### 4.2 Estrutura do banco
1. Aplicar as 106 migrations em ordem no projeto novo.
2. Comparar o catálogo dos dois bancos por consultas idênticas (tabelas e colunas com tipos e padrões, constraints, índices, funções com definição, views com definição, gatilhos, políticas RLS, grants, sequências, publicação do realtime, extensões, tipos enum). Diferença = migration de correção, até a comparação dar zero.

### 4.3 Dados
1. Exportar todas as tabelas de `public` (e `auth.users` do usuário padrão, `vault`) pelo editor SQL do projeto antigo (papel postgres, ignora RLS) para arquivos locais fora do repositório.
2. Importar no projeto novo pela conexão direta (com gatilhos de negócio desligados durante a carga, para não disparar efeitos colaterais) e acertar as sequências.
3. Conferência: por tabela, contagem de linhas e hash do conteúdo ordenado pela chave primária, nos dois bancos. Tem que bater 100%.
4. `cron.job_run_details` (histórico) não precisa ir; os agendamentos são recriados.

### 4.4 Storage
Copiar os 620 objetos (download no antigo, upload no novo, mesmo caminho e tipo) e conferir quantidade e tamanho por objeto. Políticas e buckets iguais.

### 4.5 Funções e chaves
- Deploy das 9 funções pelo Supabase CLI, com o mesmo `config.toml`.
- Chaves: transferência servidor a servidor. Uma função temporária no projeto antigo (deploy pelo chat do Lovable) lê as próprias variáveis (menos as `SUPABASE_*`) e grava no projeto novo pela API de gestão do Supabase; o token de gestão vai no cabeçalho direto do arquivo do CLI. Nenhum valor passa pelo chat, por arquivo ou pelo Claude. A função é apagada logo depois. As chaves que dependem do endereço (`GOOGLE_REDIRECT_URI`, `APP_URL`) são regravadas com os valores novos.

### 4.6 Agendamentos, vault e realtime
Recriar os 6 agendamentos (os 2 que chamam funções com o endereço novo e a chave do vault novo), vault com os mesmos nomes, publicação do realtime com as 11 tabelas.

### 4.7 Site
- Deploy do build atual (`@lovable.dev/vite-tanstack-config`, preset Cloudflare, `wrangler.jsonc`) na conta Cloudflare do André, com `VITE_SUPABASE_*` e `SUPABASE_*` apontando para o projeto novo (valores públicos).
- Deploy automático: Workers Builds ligado ao GitHub (`main`).
- O pacote de build do Lovable fica (é um pacote npm comum); trocar por config própria só se der problema.

### 4.8 Domínio
Mover o DNS de `andrelopes.digital` da Hostinger para a Cloudflare: a Cloudflare importa os registros; o Claude confere um por um contra a Hostinger (MX, SPF, DKIM e DMARC do Google Workspace da contato@, verificação do Google, `_lovable`, demais subdomínios) antes de trocar os nameservers. Depois, `gestao` vira domínio próprio do Worker. O e-mail da contato@ é testado depois da troca.

### 4.9 Integrações
Na virada, trocar para o projeto novo: credencial e URLs do n8n (5 workflows), variáveis das stacks `swipe-worker` e `transcritor` (Portainer), Apps Script da planilha e dos formulários, URI de retorno no Google Cloud, `GOOGLE_REDIRECT_URI`/`APP_URL`. Scripts de teste em `tools/` passam a ler a URL do `.env`.

## 5. Virada (parada estimada de 20 a 30 min)

Pré-requisito: projeto novo completo e ensaiado (estrutura com diferença zero, um ensaio de cópia de dados conferido, funções no ar, site novo abrindo no endereço de teste do Worker com o banco novo).
1. Pausar os 6 agendamentos (antigo) e os workflows do n8n que escrevem no banco.
2. Exportação final e importação (truncar o ensaio antes).
3. Conferência 100% (contagem e hash por tabela, objetos do Storage).
4. Trocar integrações (n8n, VPS, Apps Script, Google Cloud) e religar os agendamentos no novo.
5. Ligar o domínio ao Worker novo (DNS já na Cloudflare).
6. Testes de fumaça e checklist por módulo.
7. Projeto antigo fica congelado (agendamentos pausados) como reserva.

## 6. Prova de que nada se perdeu

- Automática: diferença zero no catálogo; contagem e hash iguais em todas as tabelas; Storage igual; 9 funções respondendo; 6 agendamentos ativos; realtime com as 11 tabelas.
- Por módulo, no site novo, contra o antigo (números e listas iguais) e com um registro TESTE criado, editado e apagado onde grava: as 29 abas da seção 3.
- Integrações de ponta a ponta: alerta de saldo no WhatsApp (n8n manual), fila do Swipe (download real), Fireflies (webhook e PDFs do bucket), Transcritor, GMN (prévia), Instagram (só @kobegrowth, agendado), Drive e Agenda (token renova), arquivos e notas no R2, Planilha CRM (ida e volta), formulários de dados internos, virada das demandas (rodar a função à mão no teste e conferir a execução real à meia-noite), notificação matinal.
- Velocidade: medir o tempo por consulta e o tempo de troca de aba antes e depois.

## 7. Caminho de volta

Até religar tudo no novo, voltar é só não trocar nada. Depois da virada, se algo grave aparecer: apontar `gestao` de volta para o Lovable (registro no DNS da Cloudflare), voltar as integrações para o endereço antigo e religar os agendamentos antigos; o que foi gravado no novo depois da virada é copiado de volta pela mesma rotina de exportação. O Lovable fica intacto por 30 dias.

## 8. Backup

Serviço na VPS (Swarm) com `pg_dump` diário do projeto novo para o R2 (prefixo `backups/`), guardando 30 arquivos; restauração testada uma vez.

## 9. Limites que o Claude mantém

- Não digita valores de chaves em páginas da web (chaves vão servidor a servidor).
- Senha, código por e-mail ou digital (passkey) pedidos por algum site ficam com o André.
- Meta: nada é acessado pelo Claude; nada precisa mudar lá (sem endereço de retorno).

## 10. Riscos e cuidados

- E-mail da contato@ na troca de DNS: conferência registro a registro antes e teste depois.
- Gatilhos de negócio disparando na importação: carga com gatilhos de usuário desligados (`session_replication_role = replica`), religados depois.
- Diferenças entre as migrations e o banco real (mudanças feitas fora delas): resolvidas pela comparação de catálogo.
- `pg_net` e chave do vault dos agendamentos: recriados no novo com a chave nova.
- Plano gratuito: sem backup (coberto pela seção 8); pausa por inatividade não acontece (n8n consulta a cada minuto).
- Fora do escopo: login e banco trancado (fase 2); cancelar o Lovable (depois de 30 dias, decisão do André).
