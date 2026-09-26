# Fireflies no Gestor Pro — robô automático nas reuniões da contato@ e aba "Fireflies"

Data: 26/09/2026 · Status: aprovado pelo usuário em chat (plano B da entrada automática, arquivos gerados pelo
sistema com o mesmo conteúdo, histórico completo, renomear/excluir espelhados no Fireflies, cards de largura total)

## Contexto verificado
- Fireflies: conta **and.alcantaralopes@gmail.com**, plano **Pro** (API: 500 chamadas/dia; `addToLiveMeeting`:
  3 a cada 20 min). Nenhuma agenda conectada; o Fireflies aceita **uma agenda por conta**, a do e-mail de cadastro
  (guide.fireflies.ai/articles/4246295295) — por isso a agenda da **contato@** não pode ser conectada nele.
- O download do app (Transcript / Summary: PDF, DOCX…) não existe na API; a API entrega o conteúdo
  (título, data, duração, participantes, link, resumo, itens de ação, palavras-chave, frases com falante e tempo).
- Webhook "Transcription completed" em Settings → Developer settings, com `x-hub-signature` (HMAC SHA-256).
- O worker da VPS já obtém o token Google da contato@ (Drive + `calendar.events`) pela função `google-token` com a
  `SWIPE_KEY`.

## Desenho
### 1. Robô nas reuniões (plano B)
Cron do n8n **a cada minuto** → `POST http://swipe_worker:8080/fireflies/agenda` (header `x-worker-key`). O worker lista
os eventos da agenda `primary` da contato@ que começam entre **agora − 5 min e agora + 2 min**, com link do Meet
(`hangoutLink` ou `conferenceData`), e para cada um ainda não enviado chama `addToLiveMeeting(meeting_link, title)`.
Registro em `fireflies_convites` (evento_id + início) evita reenvio; falha fica registrada com erro. Eventos
cancelados, recusados por mim ou dia inteiro são ignorados.

### 2. Importação
- `POST /fireflies/webhook` (n8n repassa corpo cru + `x-hub-signature`; o worker confere com
  `FIREFLIES_WEBHOOK_SECRET`) → importa aquele `meetingId`.
- `POST /fireflies/sincronizar` (cron **a cada hora**): lista as reuniões do Fireflies e importa as que faltam,
  **até 40 por execução** (histórico inteiro em poucas horas, dentro de 500/dia).
- Importar = 1 chamada GraphQL (transcrição completa) → gera **4 arquivos** (Transcrição e Resumo × PDF e DOCX) →
  sobe no bucket privado **`fireflies`** do Supabase (`<id>/transcricao.pdf`, `<id>/transcricao.docx`,
  `<id>/resumo.pdf`, `<id>/resumo.docx`) → grava/atualiza `fireflies_reunioes`. PDF pelo Chromium do worker
  (HTML → `page.pdf`), DOCX pela lib `docx` (dependência nova **só do worker**).

### 3. Renomear e excluir espelhados
A aba grava a intenção na linha (`titulo_pendente` / `excluir = true`); o cron de 1 min
(`POST /fireflies/pendencias`) aplica no Fireflies (`updateMeetingTitle` / `deleteTranscript`), regera os arquivos
com o nome novo ou apaga arquivos e linha. A chave da API nunca vai ao navegador.

### 4. Aba "Fireflies" (`/fireflies`, grupo Ferramentas)
Cards de largura total, um embaixo do outro, mais recente primeiro: nome, data, início–fim, duração, participantes,
"Abrir no Fireflies"; Transcrição e Resumo com **Ver** (prévia PDF no sistema, como a aba Arquivos), **PDF** e
**DOCX**; menu Renomear / Excluir (confirmação: "apaga também no Fireflies"). Busca por nome. Estados:
"Importando…", "Renomeando…", "Excluindo…", erro. Responsiva (celular).

## Modelo de dados
```sql
fireflies_reunioes(
  id text primary key,            -- id do Fireflies (transcript)
  titulo text not null,
  titulo_pendente text,           -- renomear pedido pela aba, ainda não aplicado no Fireflies
  excluir boolean not null default false,
  data_hora timestamptz,          -- início
  duracao_min numeric,
  participantes text[] not null default '{}',
  organizador text,
  link_meet text,
  link_fireflies text,            -- https://app.fireflies.ai/view/<id>
  arquivos jsonb not null default '{}'::jsonb,  -- {transcricao_pdf, transcricao_docx, resumo_pdf, resumo_docx}: caminhos no bucket
  status text not null default 'pronto' check (status in ('importando','pronto','erro')),
  erro text,
  created_at timestamptz default now(), updated_at timestamptz default now()
)
fireflies_convites(evento_id text, inicio timestamptz, link_meet text, titulo text, enviado_em timestamptz default now(),
  ok boolean, erro text, primary key (evento_id, inicio))
bucket fireflies (privado, até 50 MB, pdf e docx) com policies anon (padrão do app sem login)
```

## Segredos (colados pelo usuário no Portainer, stack `swipe`)
`FIREFLIES_API_KEY`, `FIREFLIES_WEBHOOK_SECRET`. O stack file passa a repassar os dois ao serviço `swipe_worker`.

## Fora do escopo
Arquivo idêntico ao do app do Fireflies; áudio/vídeo; notificações.
