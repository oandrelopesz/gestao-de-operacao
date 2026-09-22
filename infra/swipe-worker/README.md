# Worker do swipe file — infraestrutura

## Ordem de instalação
1. **Cookies** — Os três configs de cookies já foram criados no Portainer com um placeholder Netscape válido:
   - `swipe_cookies_instagram`
   - `swipe_cookies_tiktok`
   - `swipe_cookies_facebook`
   
   Para colocar os cookies de verdade quando tiver, não é possível editar um config que está em uso. A solução é criar um novo config com o sufixo `_v2` (por exemplo, `swipe_cookies_instagram_v2`), atualizá-lo com o `cookies.txt` exportado pela extensão "Get cookies.txt LOCALLY" no formato Netscape, depois apontar a stack para o config novo e dar *Update the stack*.

2. **Stack** (Portainer → Stacks → Add stack → Web editor, nome `swipe`): colar `stack.yml` e preencher em *Environment variables*:
   - `SWIPE_KEY` — a mesma do secret `SWIPE_KEY` no Lovable Cloud
   - `WORKER_KEY` — segredo novo, gerar com `openssl rand -base64 24`

3. **Workflow do n8n**: importar `n8n-workflow.json`, conferir as credenciais e publicar.

## Recapturar uma LP que mudou

O worker é idempotente por nome de arquivo: ao reprocessar um job ele reaproveita a pasta no Google Drive e pula os arquivos que já estão lá. Esse comportamento evita que um job reagendado por falha de infraestrutura duplique os cards de um carrossel.

A consequência é que o botão "Tentar de novo" do app **não** atualiza uma LP que mudou de conteúdo — o worker vê os arquivos antigos e não faz nada. Para recapturar de verdade, apague a pasta do item no Google Drive antes de mandar o job de novo.

## Job preso em `rodando`

Se um item fica em "baixando" por mais de 40 min, o job correspondente em `swipe_jobs` está preso em
`rodando`: a execução do n8n morreu depois do nó "Marcar rodando" (referência quebrada numa expressão,
n8n reiniciado no meio, etc.). Conferir em n8n → Executions o erro exato, corrigir, e devolver o job
para a fila: `swipe_jobs.status = 'aguardando'` (valores aceitos: `aguardando|rodando|ok|erro`) e
`swipe_itens.status = 'pendente'`. O gatilho de 1 min pega o job de novo.

**Armadilha ao editar o workflow no n8n:** colar/reimportar nós com o mesmo nome faz o n8n renomeá-los
com sufixo `1` (`Tem job?1`, `Decidir1`) e reescrever as expressões; se depois os nomes voltam, as
expressões ficam apontando para nós que não existem e a execução morre em "Item baixando". Depois de
qualquer edição, rodar uma execução manual e conferir que ela chega ao worker (`job.inicio` nos logs).

## Sites que só carregam o player depois de uma interação

Sites com WP Rocket "Delay JavaScript execution" (scripts `type="rocketlazyloadscript"`) e similares
só executam os scripts — inclusive o carregador do player da VSL (VTurb/converteai etc.) — depois de
mousemove/wheel/tecla. O worker simula essa interação (`interagirComoUsuario` em `src/jobs/lp.js`)
antes de escutar a rede. Sintoma de regressão: LP capturada sem `- VSL 01.mp4`, print mostrando só o
placeholder preto do player e html sem nenhum `<script>`.

## O que conta como VSL

O worker escuta a rede da página e manda para o `yt-dlp` as URLs de vídeo (`.mp4`, `.m3u8`, `.mpd`) e
de embeds (YouTube, Vimeo, Wistia...). Três filtros existem porque cada um já quebrou de verdade
na LP da A2 Digital (VTurb) em 21/09/2026:

- **Script do player não é vídeo.** `player.js`/`smartplayer.js` do converteai casavam com o domínio
  do player e o extrator genérico do `yt-dlp` salvava o JavaScript cru como `VSL 01.mp4`.
  `.js/.css/imagem` nunca vão para o `yt-dlp`; o player, ao rodar, pede as `.m3u8` de verdade.
- **Uma playlist HLS por pasta.** A master `main.m3u8` lista `video_0/1/2.m3u8` na mesma pasta, e o
  player pede a master e depois uma rendição — sem o filtro a VSL vinha em 720p e em 360p.
  Fica a primeira URL da pasta (a master), que o `yt-dlp` resolve na melhor qualidade.
- **Tamanho mínimo de 100 KB.** Players baixam um MP4 de 2x2 px e 0,12 s (1,6 KB) para testar se
  o navegador deixa dar autoplay; ele passa na checagem de cabeçalho. 3 s no bitrate mais baixo já
  passam de 100 KB, então nenhuma VSL real fica de fora.

Se uma LP vier sem VSL, conferir nos logs se apareceu `job.fim` com `ok: true` e testar a URL do vídeo
com `yt-dlp` à mão; se vier com VSL duplicada ou minúscula, é um destes filtros que precisa de ajuste.

## O zip do espelho "não abre" no Windows

O `wget --mirror` grava cada URL como nome de arquivo; sem `--restrict-file-names=windows` ficam nomes
com `?` e `|` (query strings), que o Windows proíbe — o Explorer recusa o zip inteiro como "pasta
inválida", embora ele seja válido (abre no Linux/Mac). A flag está no `wget` de `src/jobs/lp.js`; se
voltar a acontecer, confira `unzip -l` procurando `?` nos nomes.

## Anúncios da Biblioteca de Anúncios do Facebook

Link `facebook.com/ads/library/?id=<n>` de um anúncio: nem o yt-dlp nem o gallery-dl conhecem a
página, então o worker abre com o Chromium (a página é pública, sem login), acha o card pelo número
do id e baixa o criativo (`src/jobs/adslibrary.js`). Anúncio de vídeo vira `.mp4`; estático vira
`.jpg`; vários criativos viram carrossel. Funciona sem os cookies de Facebook.

Duas limitações honestas: a Ads Library serve a imagem no tamanho de exibição (não o arquivo
original em alta), e se o anúncio for removido/inativado o card não aparece — o erro é claro
("Anúncio não encontrado na Ads Library") e o job segue a retentativa normal.

## Ver o que o worker está fazendo

Os logs do serviço saem em JSON (uma linha por evento) no Portainer. Para ver os eventos, abra:
**Portainer → Services → `swipe_swipe_worker` → Logs**

O worker emite os seguintes eventos:
- `worker.pronto` — serviço subiu e está esperando jobs
- `job.inicio` — começou um job (traz `id`, `tipo` e `link`)
- `job.fim` — job terminou; o campo `ok` diz se deu certo, e `erro` traz o motivo quando não
- `job.erro` — o job estourou uma exceção; `infra: true` significa problema de infraestrutura
  (Drive fora do ar, rede), que devolve 503 e **não** consome tentativa
- `lp.orcamento_estourado` — a LP tinha mais VSLs do que coube nos 12 min de orçamento; o html,
  o espelho e o print foram entregues e o resto dos vídeos ficou de fora
- `lp.espelho_falhou` — o `wget`/`zip` do espelho não produziu nada (site bloqueou, robots.txt);
  a captura seguiu sem o `- mirror.zip`
- `tmp.limpeza_falhou` — **este é o alarme de disco**: a pasta temporária do job não foi apagada.
  Se repetir, o disco da VPS vai encher.
- `publicar.stat_falhou` — não foi possível ler o tamanho de um arquivo em disco (`stat`) na hora
  de publicar; o tamanho gravado no catálogo fica subcontado, mas o arquivo sobe normalmente

## Trocar os cookies quando vencerem
Portainer não edita config em uso: criar `swipe_cookies_instagram_v2`, apontar a stack para ele
e dar *Update the stack*. O sintoma de cookie vencido é item `falhou` com erro de login.

## Construir e atualizar a imagem
O repositório é **privado**, então a imagem não é publicada num registry público. Ela é construída
no próprio Docker da VPS, e como o Swarm tem um nó só, a imagem local basta.

Para construir (primeira vez ou a cada mudança em `worker/`):

1. Empacotar a pasta do worker, a partir da raiz do repositório:
   ```bash
   tar -czf worker.tar.gz -C worker .
   ```
   O `-C worker .` é importante: o `Dockerfile` precisa ficar na raiz do arquivo, não dentro de
   uma subpasta.
2. Portainer → **Images** → *Build a new image*
   - *Naming*: `swipe-worker:latest`
   - *Build method*: **Upload**, e selecione o `worker.tar.gz`
   - *Deploy*
3. Depois do build, Portainer → **Services** → `swipe_swipe_worker` → *Update the service*
   (deixe *Pull latest image* **desmarcado** — a imagem é local, não há de onde puxar).

O GitHub Actions continua rodando os 58 testes a cada push em `worker/`, o que é a rede de
segurança que importa; ele também publica a imagem no GHCR, mas esse pacote fica privado e não é
usado pela VPS. Se um dia o repositório virar público, ou se você cadastrar um token
`read:packages` em Portainer → Registries, basta trocar o `image:` da stack de volta para
`ghcr.io/oandrelopesz/swipe-worker:latest` e a atualização volta a ser automática.

## Importar o workflow no n8n

`n8n-workflow.json` é um **template**: o header `x-worker-key` do nó "Executar no worker" vem com
o placeholder `SUBSTITUIR_PELA_WORKER_KEY`. A chave de verdade é a mesma `WORKER_KEY` da stack
`swipe` (Portainer → Stacks → swipe → Environment variables) e nunca deve ser commitada aqui.

1. n8n → Workflows → *Import from File* → `n8n-workflow.json`
2. Abrir o nó **Executar no worker** e substituir `SUBSTITUIR_PELA_WORKER_KEY` pelo valor real
3. Conferir que as duas credenciais foram reconhecidas (Supabase anon e Evolution)
4. *Execute workflow* uma vez para testar
5. Botão **Publish** para ativar (o `PATCH active:true` pela API REST não ativa; tem que ser o botão)

Se um dia a `WORKER_KEY` for trocada, ela muda em dois lugares: na stack e nesse nó do workflow.
