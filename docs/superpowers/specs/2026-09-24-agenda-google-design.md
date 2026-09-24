# Agenda (Google Calendar) — design

Data: 24/09/2026 · Aprovado pelo usuário no chat.

## Objetivo

Aba **Agenda** no sistema que mostra e edita a agenda real do Google de `contato@andrelopes.digital` pela API do Google Calendar (não é embed). Tudo que é criado/alterado aqui aparece no Google na hora, e vice-versa (ao recarregar/navegar).

## Decisões

- **Conta:** `contato@andrelopes.digital` (Workspace). Mesmo projeto Google Cloud (`gestao-de-operacao-509002`, app OAuth interno) e mesma conexão OAuth do swipe file.
- **Arquitetura A — direto na API, sem cópia no banco.** O navegador chama `https://www.googleapis.com/calendar/v3` com o access token que já vem da edge function `google-token` (`getAccessToken()` em `src/lib/googleDrive.ts`). Nenhuma tabela nova, nenhuma edge function nova.
- **Permissões:** o `oauthUrl` passa a pedir `drive.file` + `calendar.events` + `calendar.calendarlist.readonly`. Reconectar uma vez (Admin ou botão na própria Agenda, que volta para `/agenda`). A Agenda detecta a permissão pelo `scope` devolvido em `google-token?action=status`.
- **Grade:** FullCalendar v6 (MIT: `@fullcalendar/react`, `core`, `daygrid`, `timegrid`, `interaction`), locale pt-br, estilizado com as variáveis de tema do sistema. Renderizado só no cliente (import dinâmico).
- **Fuso:** America/Sao_Paulo (UTC-3 fixo, sem horário de verão). Eventos com horário vão com `timeZone: "America/Sao_Paulo"`.
- **Menu:** "Agenda" no grupo Operação, logo após Demandas, rota `/agenda`.
- **Sem integração** com clientes/demandas nesta versão.

## Tela `/agenda`

- Cabeçalho: Hoje, ‹ ›, título do período, Dia / Semana / Mês (abre em Semana; a visão fica lembrada no navegador), "Novo evento", atualizar.
- Coluna lateral: todas as agendas da conta (cor do Google, caixinha para esconder; escolha lembrada no navegador).
- Grade: faixa de dia inteiro, linha da hora atual, eventos sobrepostos lado a lado, "+N mais" no mês.
- Clicar/arrastar num horário vazio → "Novo evento" com o horário. Clicar num evento → formulário de edição.
- Eventos buscados por período visível (`singleEvents=true`), recarregados ao navegar, ao salvar e ao voltar para a aba.

## Formulário do evento

Nome · Agenda (só as que dá para escrever; a principal por padrão; fixa ao editar) · Dia inteiro · Início/fim (mudar o início mantém a duração) · Repetição · Participantes (e-mails em chips, valida) · Google Meet (liga/desliga; o Google gera o link; link com copiar/entrar) · Notificações (até 5; Notificação ou E-mail; minutos/horas/dias/semanas; ou "padrão da agenda"; novo evento = 10 min Notificação) · Local · Descrição · "Abrir no Google Agenda".

- **Repetição:** presets do Google (Não se repete, Todos os dias, Semanal: cada <dia>, Mensal: no dia N, Mensal: na <ordinal> <dia>, Anual, Dias úteis) + **Personalizado** (a cada N dias/semanas/meses/anos, dias da semana, mensal por dia ou posição, termina nunca / em data / após N). RRULE que o formulário não sabe editar é preservada intacta e mostrada como "Repetição personalizada do Google".
- **Convites:** ao salvar/excluir evento com participantes, pergunta "Enviar convite/atualização por e-mail?" (`sendUpdates=all|none`).
- **Evento recorrente** (editar/excluir): "Só este evento / Este e os seguintes / Todos os eventos".
  - Só este: altera/exclui a ocorrência (id da instância). Não é oferecido se a repetição foi mudada.
  - Todos: altera a série (id mestre); o deslocamento de dias feito na ocorrência é aplicado ao início da série.
  - Este e os seguintes: encerra a série antiga no dia anterior (UNTIL) e cria série nova a partir da ocorrência (COUNT recalculado; Meet reaproveitado). Na 1ª ocorrência equivale a "Todos".
- **Somente leitura:** agenda sem permissão de escrita ou evento de outro organizador → formulário só leitura + "Abrir no Google Agenda".
- Respostas dos participantes (responseStatus) são preservadas ao salvar.

## Erros

- 401 → invalida o token, busca outro e repete uma vez.
- Sem permissão de Agenda (escopo) → tela "Conectar a Agenda do Google".
- Sem login Google no navegador → botão "Entrar com Google" (mesmo do swipe file).
- API desativada no Cloud → mensagem explicando.
- 412 (evento mudou no Google) → aviso + recarrega.
- Outros → toast com a mensagem; o formulário não fecha.

## Testes

- `node --test`: `src/lib/recorrencia.test.ts` (RRULE ida/volta, presets, UNTIL, encerrarAntesDe, descrição) e `src/lib/agendaEvento.test.ts` (evento ⇄ formulário, dia inteiro, Meet, lembretes, participantes, validação, deslocamento de série).
- E2E no site publicado: criar evento com repetição, participante, Meet e notificações; conferir na API; editar só este / seguintes / todos; excluir; limpar tudo que foi criado.

## Configuração (feita pelo Claude no navegador do usuário)

1. Ativar a Google Calendar API no projeto `gestao-de-operacao-509002`.
2. Reconectar o Google (consentimento com as novas permissões).
3. Publicar no Lovable (Publicar → Publicar alterações).
