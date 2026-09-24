# Transcritor + Cancelar/seleção em massa no Swipe — Implementation Plan

> Executado inline pelo Claude (executing-plans). Cada tarefa: teste que falha → implementação → teste passa → commit.

**Goal:** Aba Transcritor (links e arquivos → texto, fila com pausar/cancelar/reordenar e seleção em massa, validade 1–15 dias) e Cancelar + seleção em massa na fila do Swipe file.

**Architecture:** Speaches (imagem pública, faster-whisper large-v3-turbo) numa stack nova na VPS; orquestrador = novo modo do `worker/` (mesma imagem `swipe-worker`) que lê a tabela `transcricoes`, baixa/recebe mídia, extrai áudio, chama o Speaches com stream e grava texto/progresso. App fala com o banco (PostgREST) e manda arquivos direto ao orquestrador (`transcritor.minuanoai.com.br`) autenticado por ID token Google.

**Spec:** `docs/superpowers/specs/2026-09-24-transcritor-design.md`

## Global Constraints

- Nada pago; nada no Google Drive; mídia apagada ao terminar; texto apagado em definitivo ao vencer.
- Modelo `deepdml/faster-whisper-large-v3-turbo-ct2`; idioma automático; glossário em `app_config.transcritor_glossario`.
- Tabelas novas com RLS `USING (true)` (padrão do app). Status da fila: `enviando|aguardando|baixando|transcrevendo|pronta|falhou|pausada`.
- Validade padrão 3 dias; escolha 1–15 (a partir de agora), renovável.
- Worker em Node 24 ESM, sem dependências novas; testes `node --test` em `worker/test`. App: `npm test`.
- Arquivos do repo em CRLF: scripts de patch normalizam e devolvem CRLF.

---

### Task 1: Banco
- Create `supabase/migrations/20260924160000_transcricoes.sql`: tabela `transcricoes` (colunas da spec, CHECK de status/origem, índice `(status, posicao, created_at)`), RLS aberta, `app_config` `transcritor_glossario` com a lista inicial de termos, função `limpar_transcricoes_vencidas()` + `cron.schedule('limpar-transcricoes', '17 * * * *', ...)`, trigger `transcricoes_validade` (BEFORE UPDATE OF status: ao virar `pronta`/`falhou` preenche `expira_em = now() + validade_dias` se nulo; `concluido_em`).
- Aplicar no SQL editor do Lovable; verificar por REST.

### Task 2: Regras puras do app — `src/lib/transcritorTexto.ts` (+ test)
- `detectarPlataforma(link): string` (instagram, tiktok, meta_ads, facebook, youtube, kwai, x, linkedin, threads, pinterest, outro) — reaproveita `detectarRede` de `swipeRedes.ts` se couber.
- `tipoDeArquivo(nome, mime): "audio"|"video"|null` (aceita mp3,m4a,wav,ogg,opus,aac,flac,wma,amr,mp4,mov,mkv,webm,avi,m4v,3gp,mpeg; rejeita o resto).
- `nomeExibido(t)`: nome ou "Sem nome · dd/mm hh:mm".
- `rotuloValidade(expira_em, agora)`: "expira hoje às hh:mm" / "expira amanhã" / "expira em N dias (dd/mm)".
- `ordenarProntas(lista, modo: "recentes"|"az"|"za")`.
- `formatarDuracao(seg)`: "1h 02min", "3min 20s", "45s".

### Task 3: Worker — parada por job apagado (swipe) e por status genérico
- `parada.js`: `vigiarPausa` aceita `{ tabela, statusDeParada }` (padrão `swipe_jobs` / `["pausado"]`) e pede parada também quando a linha **não existe mais** (cancelado). Testes em `test/parada.test.js`: status pausado para; linha sumida para; erro de rede não para.

### Task 4: Worker — texto e SSE (`src/transcritor/texto.js`, `src/transcritor/sse.js` + tests)
- `lerEventosSSE(stream, aoEvento)`: parser de `data: {...}\n\n` (ignora `[DONE]`, comentários, linhas vazias; junta pedaços partidos entre chunks).
- `montarTexto(segmentos)`: segmentos `{start,end,text}` → texto com parágrafos (pausa ≥1,5 s e fim de frase, ou ≥120 palavras no fim de frase), espaços normalizados, sem quebras soltas; parágrafos separados por uma linha em branco.
- `glossarioParaPrompt(termos)` / `glossarioParaHotwords(termos)`.

### Task 5: Worker — orquestrador (`src/transcritor/*.js`)
- `config.js` (`lerConfigTranscritor`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SPEACHES_URL`, `MODELO`, `GOOGLE_CLIENT_ID`, `EMAILS_PERMITIDOS`, `ORIGENS` (CORS), `PASTA` (/dados/transcritor), `PORTA`.
- `banco.js`: PostgREST mínimo (`proxima()`, `atualizar(id, campos, soSeStatus?)`, `linha(id)`, `glossario()`).
- `uploads.js`: HTTP `POST /uploads/:id` (cria/consulta offset), `PUT /uploads/:id?offset=` (anexa parte, confere offset), `POST /uploads/:id/fim` (confere tamanho, status `aguardando`); valida ID token (tokeninfo: aud, exp, email verificado e permitido) com cache de 5 min; CORS.
- `processar.js`: etapa link (`yt-dlp -x --audio-format opus` com cookies de `cookiesDe`) ou arquivo enviado → `ffmpeg -i ... -ac 1 -ar 16000 -c:a libopus -b:a 24k` → `ffprobe` duração → POST multipart stream ao Speaches (`AbortController` registrado na parada) → progresso a cada 3 s → texto final.
- `main.js`: sobe HTTP + laço (3 s) que processa um por vez com `vigiarPausa({tabela:"transcricoes", statusDeParada:["pausada"]})`; faxina a cada 30 min (apaga pastas sem linha e com >24 h).
- Tests: `uploads.test.js` (offset, conferência de tamanho, auth recusada), `processar.test.js` com deps falsas (link → yt-dlp chamado com cookies; arquivo → ffmpeg; Speaches SSE falso → texto e progresso; parada no meio → JobPausado e limpeza).

### Task 6: Infra — `infra/transcritor/stack.yml` + README
- `speaches`: `ghcr.io/speaches-ai/speaches:latest-cpu`, env `PRELOAD_MODELS=["deepdml/faster-whisper-large-v3-turbo-ct2"]`, `STT_MODEL_TTL=-1`, `WHISPER__COMPUTE_TYPE=int8`, `WHISPER__CPU_THREADS=3`, `ENABLE_UI=false`, `LOG_LEVEL=info`; volume `transcritor_hf:/home/ubuntu/.cache/huggingface/hub`; limites 3 CPU / 6G; rede ALDigitalNet.
- `orquestrador`: imagem `swipe-worker:latest`, `command: ["node","src/transcritor/main.js"]`, env da Task 5, configs de cookies do swipe (`_v2`), volume `transcritor_dados:/dados/transcritor`, Traefik `Host(transcritor.minuanoai.com.br)` porta 8090, limites 1 CPU / 1G.

### Task 7: App — dados (`src/lib/transcritor.ts`)
- `fetchTranscricoes()`, `criarDeLinks(links: {link,nome?}[])`, `criarDeArquivo(file, nome?, onProgresso) → Promise` (cria linha `enviando`, envia partes de 8 MB com retomada e ID token, finaliza), `pausar(ids)`, `retomar(ids)`, `cancelar(ids)` (apaga), `renomear(id,nome)`, `definirValidade(ids, dias)` (`expira_em = agora + dias`, `validade_dias`), `reordenar(aguardando, ids)`, `mover(ids, "topo"|"fim")`, `excluir(ids)`, `glossario()`/`salvarGlossario()`.
- Reuso das funções puras de fila de `swipeFila.ts` (`novasPosicoes`, `posicaoNoTopo`).

### Task 8: App — telas
- `src/routes/_authenticated/transcritor.tsx`; `src/components/transcritor/{TranscreverDialog,FilaTranscricoes,ListaTranscricoes,ValidadeDialog}.tsx`; Admin: `TranscritorGlossarioCard` (seção "Transcritor"); menu Ferramentas: Transcritor primeiro.
- Seleção em massa (mesmo padrão de Links/PDFs): fila → Pausar/Retomar/Cancelar/Topo/Fim; prontas → Validade/Excluir/.txt.

### Task 9: Swipe — Cancelar + seleção em massa
- `src/lib/swipe.ts`: `cancelarItens(itens)` (manda `drive_file_id` parcial para a Lixeira se houver, apaga os itens → jobs em cascade), `pausarItens`, `retomarItens`, `moverJobs(ids, "topo"|"fim")`.
- `FilaDownloads.tsx`: checkbox por linha, botão Cancelar por linha (confirmação), barra de seleção (Pausar/Retomar/Cancelar/Topo/Fim).

### Task 10: Deploy e testes reais
1. DNS Cloudflare `transcritor` A → 2.25.127.182 (DNS only).
2. Build da imagem `swipe-worker` pelo Portainer (tar em hex) + update do serviço do swipe (parada por job apagado).
3. Stack `transcritor` (speaches + orquestrador); acompanhar download do modelo; health.
4. Migration (Task 1) aplicada; publicar no Lovable.
5. Testes reais da spec; limpeza de tudo que for teste.
