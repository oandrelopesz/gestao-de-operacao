# Swipe File integrado ao Google Drive — design

Data: 2026-09-18. Aprovado pelo usuário em chat.

## Objetivo
Aba `/swipe` para guardar referências (ofertas, vídeos orgânicos, vídeos de anúncio, anúncios estáticos,
posts estáticos, carrosséis, landing pages, sites) organizadas automaticamente no Google Drive do usuário,
com catálogo pesquisável no sistema. Uso no PC e no celular, com o PC desligado.

## Estrutura no Drive
- Raiz: pasta `Swipe File` (id guardado em `swipe_config`).
- `Swipe File/<Nicho>/[<Subnicho>/]<Categoria>/` — pastas criadas sob demanda.
- Categorias (nome da pasta): Ofertas, Vídeos orgânicos, Vídeos de anúncio, Anúncios estáticos,
  Posts estáticos, Carrosséis, Landing pages, Sites.
- Nome do arquivo: `<Categoria singular> - <Nicho> - [<Subnicho> - ]<Player>` + extensão.
  Carrossel: pasta com esse nome e cards `01.jpg`, `02.jpg`… LP/site: `.html` único (recursos embutidos)
  + `.png` de página inteira. Download falhou: Google Docs com o mesmo nome contendo o link.

## Dados (Supabase)
- `swipe_config` (1 linha): `root_folder_id`, `chave_hash` (chave de acesso ao token), `conectado_em`.
- `swipe_nichos`: `id`, `nome`, `nome_normalizado`, `pai_id` (subnicho → nicho), `drive_folder_id`, `ordem`.
- `swipe_itens`: `id`, `categoria` (enum texto), `nicho_id`, `subnicho_id`, `rede` (instagram, youtube, tiktok,
  facebook, linkedin, internet, outro), `link`, `player`, `nota`, `tags text[]`, `drive_file_id`,
  `drive_folder_id`, `drive_web_link`, `thumbnail_link`, `mime`, `tamanho`, `status`
  (pendente | baixando | pronto | falhou | manual), `erro`, `created_at`, `updated_at`.
- `swipe_jobs`: fila para o serviço — `id`, `item_id`, `tipo` (download | lp), `payload jsonb`,
  `status` (aguardando | rodando | ok | erro), `tentativas`, `erro`, timestamps.
- RLS aberta como as demais tabelas (app sem login). O token do Google fica em `google_oauth_tokens`
  (já existe) e nunca é lido pelo navegador direto.

## Fluxos
1. **Conectar Google (Admin)**: botão abre OAuth (escopo `drive.file` + `documents`); a edge function
   `google-oauth-exchange` (já existe) troca o code e grava o refresh token. Cria a pasta raiz.
2. **Token para o navegador**: edge function `google-token` exige header `x-swipe-key` (chave definida
   pelo usuário, hash em `swipe_config`); devolve access token válido (refresh automático).
3. **Adicionar por arquivo**: formulário → resolve/cria pastas (nicho/subnicho/categoria) via Drive API
   no navegador → upload resumível direto ao Drive (até 5 GB, progresso, retomada) → grava `swipe_itens`.
4. **Adicionar por link**: grava item `pendente` + `swipe_jobs`; o serviço na nuvem processa; o app
   atualiza por realtime. Falha → Docs na pasta + status `falhou` + aviso (toast e badge).
5. **Nicho similar**: autocomplete pelos existentes; se o nome normalizado for parecido
   (distância pequena) de um existente, confirmar "usar X?" antes de criar.
6. **Navegar/buscar**: árvore Nicho → Subnicho → Categoria à esquerda; busca por texto (player, nicho,
   tags, nota), filtros por categoria/rede/tag/status; card com miniatura do Drive, "Abrir no Drive",
   "Copiar link"; itens `falhou` mostram "Enviar arquivo" que completa o registro.

## Serviço (`worker/`, Docker no Railway)
Node 20 + yt-dlp + ffmpeg + Chromium (Playwright). Loop: pega jobs `aguardando`, marca `rodando`,
executa, sobe no Drive com o token (refresh próprio, service-side), atualiza item/job. Tipos:
- vídeo/imagem/carrossel (YouTube, Instagram, TikTok, Facebook, URL direta) via yt-dlp/gallery-dl;
- LP/site via Playwright + single-file (HTML único) + screenshot full page.
Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_ID/SECRET, SWIPE_KEY.
Instagram/TikTok podem exigir cookies; falha cai no fluxo do Docs.

## Fases
1. Google Cloud (projeto, OAuth client, tela de consentimento), conectar Drive no Admin, pasta raiz.
2. Tabelas, tela `/swipe`, adicionar por arquivo, catálogo, busca, abrir no Drive.
3. Serviço + adicionar por link + Docs de falha (usuário cria conta Railway).
4. Miniaturas, filtros, avaliação (se quiser).
