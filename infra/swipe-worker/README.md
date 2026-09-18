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
