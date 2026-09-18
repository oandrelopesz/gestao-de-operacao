# Swipe file — fase 3: worker de download + orquestração no n8n

Data: 2026-09-18. Aprovado pelo usuário em chat. Continua
[o design do swipe file](2026-09-18-swipe-file-design.md), que cobre as fases 1 e 2 (já no ar).

## Objetivo
Toda vez que um link é colado na aba `/swipe`, o conteúdo é baixado, renomeado e organizado
sozinho no Google Drive — vídeo, criativo, post, carrossel, landing page ou site — com o PC do
usuário desligado.

## O que já existe (não refazer)
- Tabelas `swipe_config`, `swipe_nichos`, `swipe_itens`, `swipe_jobs`
  (`supabase/migrations/20260918120000_swipe_file.sql`), RLS aberta, realtime em `swipe_itens`.
- O front já enfileira: `SwipeAddDialog.tsx` cria o item `pendente` e chama
  `enfileirarJob(item.id, tipo, { link, categoria, nome_arquivo, drive_folder_id, rede })`,
  onde `tipo` é `lp` para landing_page/site e `download` para o resto, e `nome_arquivo` já vem
  no padrão `<Categoria singular> - <Nicho> - [<Subnicho> - ]<Player>`.
- Edge function `google-token`: com o header `x-swipe-key` devolve um access token válido do
  Drive, renovando pelo refresh token. **O worker não precisa do client secret do Google.**

## Infraestrutura real (levantada no Portainer em 18/09/2026)
- Portainer CE 2.45.0, ambiente `primary`, **Docker Swarm 28.0**, 1 node (`ALDigital`),
  4 cores, 16,8 GB, 14 containers.
- Rede overlay compartilhada: **`ALDigitalNet`** (10.0.1.0/24). Stacks existentes: traefik,
  portainer, postgres, pgvector, n8n (editor/worker/webhook/redis), evolution, chatwoot.
- Traefik v3.5.3, entrypoint `websecure`, certresolver `letsencryptresolver`.
- n8n em `EXECUTIONS_MODE=queue`, `EXECUTIONS_TIMEOUT=3600`, fuso `America/Sao_Paulo`,
  editor em `test.minuanoai.com.br`, webhooks em `prod.minuanoai.com.br`.
- Nenhum registry privado configurado no Portainer.
- Supabase do app: `bnpvzguapunsztsdvmrs`. (O projeto `ckjvebnhdepcwjqkmnar` é o banco de
  leads do usuário, sem relação com o swipe.)

## Arquitetura
Swarm não aceita `build:` numa stack, então a imagem é construída no GitHub Actions e publicada
no GHCR; o Portainer só puxa. O n8n orquestra (fila, estado, retry, aviso); o worker executa.

```
/swipe (browser) --insert--> swipe_jobs (Supabase)
                                  |
   n8n [SWIPE] Fila de downloads  |  schedule 1 min, PostgREST
                                  v
        POST http://swipe_worker:8080/job  (rede ALDigitalNet, sem domínio público)
                                  |
                 worker: yt-dlp / gallery-dl / Playwright / wget
                                  |
                 google-token -> access token -> upload no Drive
                                  |
        resposta {ok, campos do item}  -> n8n PATCH swipe_itens + swipe_jobs
                                  |
                 falha definitiva -> Docs com o link + WhatsApp (Evolution)
```

O worker é **stateless**: não fala com o banco. Recebe o job, devolve o resultado. Todo o
estado é do n8n, onde ficam visíveis execuções, erros e retentativas.

## Contrato HTTP do worker
Autenticação: header `x-worker-key` (segredo compartilhado com o n8n) em todas as rotas menos
`/health`. Concorrência 1 — se já houver job rodando, responde **409** e o n8n tenta no próximo
minuto.

```
GET  /health -> 200 {"ok":true,"busy":false,"versao":"1.0.0"}

POST /job
  body: { "id":"<uuid do job>", "tipo":"download"|"lp",
          "payload": { "link":"https://...", "categoria":"carrossel",
                       "nome_arquivo":"Carrossel - Médico - Dr Fulano",
                       "drive_folder_id":"1AbC...", "rede":"instagram" },
          "ultima_tentativa": false }

  200 { "ok":true, "resultado": {
          "drive_file_id":"...", "drive_folder_id":"...", "drive_web_link":"https://...",
          "thumbnail_link":null, "mime":"video/mp4", "tamanho":12345678,
          "nome_arquivo":"Vídeo de anúncio - Médico - Dr Fulano" } }

  200 { "ok":false, "erro":"texto curto pro usuário",
        "docs": { "drive_file_id":"...", "drive_web_link":"https://..." } | null }
      (`docs` só vem preenchido quando `ultima_tentativa` era true)

  409 { "ok":false, "erro":"ocupado" }
  401 { "ok":false, "erro":"chave inválida" }
```

Erros de infraestrutura (token do Google, Drive fora do ar) devolvem **503** para o n8n
reagendar sem consumir tentativa.

A classificação é por origem, não só por status:
- **Qualquer** falha da `google-token` é infraestrutura, inclusive `403` (chave errada) e `409`
  (Drive desconectado). São erros de configuração que atingem todos os jobs de uma vez; se
  consumissem tentativa, a fila inteira viraria `falhou` com Docs inúteis por causa de algo que
  se conserta num clique. Ficando na fila, tudo volta a andar sozinho quando o usuário corrige.
- Na **API do Drive**, `401`, `429` e `5xx` são infraestrutura; os demais `4xx` (pasta apagada,
  cota estourada, arquivo inválido) consomem tentativa e terminam no Docs com o motivo.
- Falha de rede antes de qualquer resposta (DNS, recusa de conexão, timeout) é infraestrutura.

## Regras de nome e pasta no Drive
`base` = o `nome_arquivo` que vem no payload. A pasta da categoria (`drive_folder_id`) já existe.

| Situação | Resultado |
|---|---|
| 1 vídeo | `<base>.mp4` na pasta da categoria |
| 1 imagem | `<base>.jpg` (extensão original) na pasta da categoria |
| Carrossel / vários arquivos | pasta `<base>/` com `<base> - 01.jpg`, `<base> - 02.jpg`, … |
| LP ou site | pasta `<base>/` com os arquivos abaixo |

Dentro da pasta de uma LP/site:
- `<base>.html` — página single-file, todos os recursos embutidos, abre offline com 2 cliques
- `<base> - mirror.zip` — espelho completo (html, css, js, imagens separados) para editar
- `<base> - print.png` — screenshot de página inteira
- `<base> - VSL 01.mp4`, `<base> - VSL 02.mp4`… — cada vídeo/VSL encontrado na página,
  baixado em arquivo separado

Todo nome passa por sanitização (`\ / : * ? " < > |` viram `-`), espaços colapsados e corte em
180 caracteres antes da extensão. Nomes repetidos ganham sufixo ` (2)`, ` (3)`…

## Como cada tipo é baixado
**`download`** — `yt-dlp` primeiro (YouTube, TikTok, Facebook, Instagram reels, Vimeo, URL
direta de mídia), com `--no-playlist`, formato `bv*+ba/b` e merge em mp4 pelo ffmpeg. Se o
yt-dlp não reconhecer a URL ou o resultado for imagem/carrossel, cai para `gallery-dl`
(Instagram posts/carrosséis, Pinterest, X). Se a pasta de saída terminar com mais de um arquivo
de mídia, vira carrossel automaticamente — mesmo que a categoria escolhida não fosse essa.

**`lp`** — Playwright/Chromium abre a página, rola até o fim (lazy loading), espera a rede
ficar ociosa e então:
1. `single-file-cli` gera o `.html` embutido;
2. `wget --mirror --convert-links --page-requisites --no-parent` (profundidade 1) gera a pasta
   espelhada, que é zipada;
3. screenshot `fullPage`;
4. durante a navegação, as respostas de rede são inspecionadas: URLs terminando em `.mp4`,
   `.m3u8`, `.webm`, ou de players conhecidos (vturb, panda, vimeo, youtube, wistia) entram numa
   lista; cada uma é baixada depois com `yt-dlp` (que resolve HLS via ffmpeg).

Orçamento de tempo: a captura de LP tem 12 minutos no total e para de baixar VSL quando o tempo
acaba, devolvendo o html/zip/print do que já capturou; o download tem 13 minutos. A chamada HTTP
do n8n espera 30 minutos. O worker é sempre quem desiste primeiro — se fosse o n8n, ele
retentaria um job que ainda está rodando, levaria 409 do worker ocupado e queimaria as três
tentativas do item à toa.

## Cookies
Instagram, TikTok e Facebook bloqueiam download anônimo. O usuário exporta o `cookies.txt`
(formato Netscape, extensão "Get cookies.txt LOCALLY") de cada rede e cola o conteúdo num
**Config do Swarm** pelo Portainer — sem precisar de SSH. A stack monta cada config em
`/cookies/<rede>.txt` e o worker passa `--cookies` quando o arquivo existe para aquela rede.
Cookie vencido cai no fluxo normal de falha (Docs + aviso), que é o sinal para reexportar.

## Retentativas e falha
O n8n tenta cada job até **3 vezes** (`swipe_jobs.tentativas`). Enquanto `tentativas < 3`, a
falha devolve o job para `aguardando` e o item para `pendente`. Na terceira, o worker recebe
`ultima_tentativa: true`, cria na pasta da categoria um **Google Docs** chamado `<base>` com o
link e o motivo do erro, o item vira `falhou` (o app já mostra "Enviar arquivo" nesse estado) e
o n8n manda uma mensagem no WhatsApp pela Evolution API.

## Segurança
- `WORKER_KEY` e `SWIPE_KEY` entram como variáveis de ambiente da stack no Portainer.
- O worker não é exposto no Traefik: só responde dentro da `ALDigitalNet`.
- O worker nunca recebe credencial do Google — pede o token para a `google-token` a cada job.
- A imagem no GHCR é pública, mas não contém nenhum segredo (só binários e código).

## Entregáveis
- `worker/` — imagem Node 20 com yt-dlp, gallery-dl, ffmpeg, wget, single-file-cli e Chromium.
- `.github/workflows/swipe-worker.yml` — build e push para `ghcr.io/oandrelopesz/swipe-worker`.
- `infra/swipe-worker/stack.yml` — stack Swarm para colar no Portainer.
- `infra/swipe-worker/n8n-workflow.json` — workflow `[SWIPE] Fila de downloads`.
- Ajuste no front para o nome dos cards de carrossel ficar igual ao do worker e botão
  "Tentar de novo" nos itens que falharam.

## Fora de escopo
Miniaturas geradas pelo worker, avaliação/nota dos itens, download de bibliotecas de anúncios
inteiras (Facebook Ad Library) e agendamento de recaptura periódica de LPs.
