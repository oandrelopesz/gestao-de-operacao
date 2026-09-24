# Transcritor + Cancelar/seleção em massa na fila do Swipe — design

Data: 24/09/2026 · Aprovado pelo usuário no chat ("ok, pode executar tudo isso"; respostas: modelo turbo, idioma automático, aviso só na aba, fila igual ao swipe, cancelar irreversível, seleção em massa nas duas filas, cancelar no swipe apaga o item).

## Objetivo

Aba **Transcritor** (grupo Ferramentas, primeira) que transcreve **links** (Instagram, TikTok, biblioteca de anúncios, outros sites que o yt-dlp/gallery-dl baixam) e **arquivos** (mp3, mp4, mov, m4a, wav, webm, ogg… qualquer áudio/vídeo que o ffmpeg lê), sem limite de duração, gratuito (tudo na VPS do usuário), bom com termos em inglês, siglas e jargão de marketing. E, na fila do **Swipe file**: botão **Cancelar** e **seleção em massa** (pausar, retomar, cancelar, reordenar).

## Decisões

- **Motor:** [Speaches](https://github.com/speaches-ai/speaches) (MIT) — imagem pública `ghcr.io/speaches-ai/speaches:latest-cpu`, API compatível com OpenAI, faster-whisper por baixo. Modelo `deepdml/faster-whisper-large-v3-turbo-ct2` (int8), pré-carregado e sem descarregar (`STT_MODEL_TTL=-1`). Idioma detectado sozinho. Glossário enviado em `prompt` e `hotwords`. `stream=true` devolve segmentos → progresso.
- **Orquestrador:** novo modo do código `worker/` (mesma imagem `swipe-worker`, que já tem yt-dlp, gallery-dl, ffmpeg e os cookies), rodando como **serviço separado** `transcritor_orquestrador` (`node src/transcritor/main.js`). Lê a fila direto da tabela `transcricoes` (sem n8n), uma por vez.
- **Envio de arquivos:** direto do navegador para o orquestrador em `https://transcritor.minuanoai.com.br` (registro DNS na Cloudflare **sem proxy**, Traefik + Let's Encrypt), em partes de 8 MB com retomada. Autenticação pelo ID token do "Entrar com Google" (mesmo e-mail permitido do swipe), validado no orquestrador.
- **Nada no Drive.** A mídia fica só no volume da VPS e é apagada assim que a transcrição termina (ou falha/cancela). No banco fica só o texto.
- **Speaches** fica só na rede interna `ALDigitalNet` (sem Traefik), limites de CPU/memória para não sufocar n8n/Evolution: 3 CPU / 6 GB; orquestrador 1 CPU / 1 GB.

## Dados (`transcricoes`)

`id uuid`, `nome text null` (opcional), `origem text` (`link`|`arquivo`), `link text null`, `arquivo_nome text null`, `plataforma text null` (detectada: instagram, tiktok, meta_ads, youtube, audio, video…), `tamanho bigint null`, `status text` (`enviando`, `aguardando`, `baixando`, `transcrevendo`, `pronta`, `falhou`, `pausada`), `posicao bigint` (default epoch ms — ordem da fila), `progresso real 0–1`, `texto text null`, `idioma text null`, `duracao_seg real null`, `erro text null`, `tentativas int`, `validade_dias int default 3`, `expira_em timestamptz null` (preenchido ao ficar `pronta`/`falhou` = agora + validade_dias), `created_at`, `iniciado_em`, `concluido_em`. RLS aberta como o resto do app. Glossário em `app_config` chave `transcritor_glossario` (lista de termos), editável no Admin.

Limpeza: `pg_cron` de hora em hora apaga as linhas com `expira_em < now()` — exclusão definitiva, sem lixeira. Cancelar = apagar a linha. O orquestrador apaga do disco tudo que não tem mais linha e qualquer arquivo com mais de 24 h.

## Orquestrador (worker/src/transcritor)

- `main.js`: servidor HTTP (upload + health) e laço da fila (a cada 3 s): pega `aguardando` de menor `posicao` → `baixando` → `transcrevendo` → `pronta`/`falhou`.
- **Link:** `yt-dlp -x` (só áudio) com os cookies do swipe por plataforma; carrossel/post de imagem sem áudio → erro claro. YouTube provavelmente bloqueado ("baixe e envie como arquivo").
- **Arquivo:** `POST /uploads/:id` (cria/retoma, devolve bytes recebidos), `PUT /uploads/:id?offset=N` (parte), `POST /uploads/:id/fim` (confere tamanho → `aguardando`).
- **Áudio:** `ffmpeg` → mono 16 kHz opus (arquivo pequeno), `ffprobe` para a duração.
- **Transcrição:** POST para `http://speaches:8000/v1/audio/transcriptions` (model, stream=true, response_format=verbose_json, prompt e hotwords do glossário); cada segmento atualiza `progresso = fim/duração` (no máximo a cada 3 s).
- **Pausar/cancelar:** vigia o status a cada 3 s (mesmo padrão de `parada.js`); `pausada` ou linha apagada → mata o processo/aborta a requisição, limpa arquivos. Pausada que volta: recomeça do zero (arquivo enviado é mantido enquanto a linha existir).
- **Texto final:** frases corridas; parágrafo novo só em pausa ≥ 1,5 s **e** fim de frase, ou a cada ~120 palavras no fim de frase. Sem quebras soltas. Função pura testada.
- **Falha:** até 2 tentativas automáticas; erro legível na linha.

## Aba Transcritor (lista, não cards)

- Botão **Transcrever** → diálogo: "Link" ou "Arquivo" (arrastar/escolher, vários de uma vez), nome opcional (um por item). Plataforma/formato detectados sozinhos.
- **Fila** (mesmo visual do Swipe): em andamento (com etapa e %), aguardando (arrastar/setas/"Transcrever em seguida"), pausadas. Ações: Pausar, Retomar, Cancelar (confirmação, irreversível).
- **Transcrições** (lista): nome (ou "Sem nome · dd/mm hh:mm", renomear no lugar), origem/plataforma, duração, idioma, "expira em N dias (dd/mm)", ações Copiar · .txt · Ver texto · Validade (1–15 dias a partir de hoje) · Excluir. Ordenar: mais recentes · A→Z · Z→A.
- **Seleção em massa:** checkbox + "Selecionar"; na fila: Pausar, Retomar, Cancelar, Mover para o topo, Mover para o fim; nas prontas: Validade, Excluir, Baixar .txt (um arquivo por transcrição).
- Aviso só na aba (atualização a cada 5 s enquanto houver algo na fila).

## Swipe file — Cancelar e seleção em massa

- **Cancelar** (em andamento, aguardando ou pausado): confirmação → apaga o item (o job vai junto pelo cascade). O worker passa a tratar "job sumiu" como parada (além de `pausado`), mata o processo e limpa o disco. Itens no meio de publicação de carrossel/LP podem deixar arquivos parciais no Drive: o cancelamento manda a pasta/arquivo parcial para a Lixeira quando o item já tem `drive_file_id`.
- **Seleção em massa** na "Fila de downloads": checkbox por linha + barra: Pausar, Retomar, Cancelar, Mover para o topo, Mover para o fim.

## Configuração (feita pelo Claude, com o usuário logando/colando segredos)

1. Cloudflare: registro A `transcritor` → IP da VPS, **DNS only**.
2. Portainer: nova stack `transcritor` (speaches + orquestrador), rebuild da imagem `swipe-worker` (worker com o modo transcritor e a parada por job apagado), update do serviço do swipe. Pode exigir sair do auto mode (histórico).
3. Banco: migration `transcricoes` + cron de limpeza + chave do glossário (SQL editor do Lovable).
4. Publicar no Lovable.

## Testes

- `node --test`: parágrafos do texto, detecção de plataforma/formato, validade/expiração, reordenação da fila (app); parser de SSE e montagem do texto (worker).
- Real: arquivo mp3 curto com termos (CTR, ROAS, lookalike), vídeo do Instagram e do TikTok por link, arquivo grande (>100 MB) com envio retomado, pausar/retomar/cancelar no meio, validade e expiração (forçando `expira_em` no passado), seleção em massa nas duas filas, cancelar download no swipe.
