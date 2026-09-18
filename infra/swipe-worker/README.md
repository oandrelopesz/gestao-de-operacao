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
- `worker.pronto` — serviço iniciou e aguarda jobs
- `job.inicio` — começou a processar um job
- `job.fim` — job processado com sucesso
- `job.erro` — job falhou
- `lp.orcamento_estourado` — item foi pulado porque o orçamento de requisições acabou
- `lp.espelho_falhou` — erro ao tentar espelhar uma LP
- `tmp.limpeza_falhou` — erro ao limpar os arquivos temporários
- `publicar.stat_falhou` — erro ao publicar estatísticas

## Trocar os cookies quando vencerem
Portainer não edita config em uso: criar `swipe_cookies_instagram_v2`, apontar a stack para ele
e dar *Update the stack*. O sintoma de cookie vencido é item `falhou` com erro de login.

## Atualizar a imagem
Push em `worker/` no GitHub → o Actions publica → Portainer → Services → `swipe_swipe_worker`
→ *Update* com *Pull latest image* marcado.
