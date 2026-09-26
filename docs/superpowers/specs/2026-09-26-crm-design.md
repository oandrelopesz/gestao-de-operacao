# CRM — design (aba Prospecção vira CRM)

Data: 26/09/2026. Aprovado em conversa, seção por seção.

## 1. Objetivo

Transformar a aba **Prospecção** num CRM completo, inspirado no CRM que o usuário montou para um cliente
(referência: `CRM-Evoluir-Kids-Funcionalidades.md` + `evoluir-kids-crm-codigo.zip`, na raiz do projeto, fora do
git), com três diferenças:

- **Sem entrada automática de leads** por enquanto (o usuário não roda tráfego para si). Os campos de rastreamento
  já existem para quando isso vier.
- **Sem carteiras separadas**: o lead só recebe a etiqueta **Orgânico** ou **Pago**.
- **Colunas configuráveis**, cada uma com um **tipo** que define as regras.

Mais: reunião marcada no CRM vira evento no Google Agenda (com Meet, convite e notificações), e o Fireflies vai
à reunião pelo mecanismo que já existe.

## 2. Decisões do usuário

1. Colunas iniciais: Novo lead, Primeiro contato, Follow-up (7 tentativas com botão), Respondeu, Desenvolvendo
   conversa, Reunião marcada, Reunião confirmada (5 pontos de contato), Remarcar reunião (no-show, não confirmou,
   pediu para remarcar — este pede data e hora), Reunião realizada, Proposta enviada para avaliação, Follow-up de
   proposta, Fechamento, Lead perdido, Lead desqualificado.
2. Colunas personalizáveis (nome, cor, ordem, tipo; criar e excluir).
3. Dashboard **na mesma aba**, num seletor visível.
4. Sem responsável pelo lead. Arrastar e soltar fácil; mover e mudar em massa.
5. Mover para reunião exige data e hora. O card tem e-mail. Ao marcar: evento no Google Agenda com Meet,
   convite para o e-mail do lead (sem e-mail, o evento é criado sem convidado), notificações 1 h, 30 min e 10 min
   antes, Fireflies sempre na reunião. Remarcar move o evento já criado.
6. Ganho → "Cadastrar como cliente" abre o cadastro da aba **Faturamento** (Financeiro) e, ao salvar, o cadastro
   de **Clientes ativos**.
7. Pontos de confirmação: 5, começando 3 dias antes, com horários que variam pelo período da call.
8. Ficha sem valor estimado; com site/LP, Instagram, Google Meu Negócio, descrição, faturamento etc. (nenhum
   obrigatório); UTMs e rastreamento guardados no lead.
9. Dashboard robusto (jornada, média de follow-ups, histórico, filtro por datas e o que mais for útil).

## 3. Colunas e tipos

### 3.1 Tipos

| Tipo (`tipo`) | Exige ao entrar | Efeito |
|---|---|---|
| `padrao` | — | — |
| `follow_up` | — | Se o contador de prospecção (`follow_up`) está em 0, vira 1 (a entrada conta a 1ª tentativa). Botão "Registrar Nª tentativa" até o teto da coluna (`config.teto`, padrão 7). |
| `reuniao` | data, hora e duração | Define a reunião e cria/move o evento na agenda. |
| `confirmacao` | reunião com data (se o lead não tem, pede como em `reuniao`) | Mostra os pontos de contato em destaque. |
| `remarcacao` | motivo: `no_show`, `nao_confirmou`, `pediu_remarcar` | `pediu_remarcar` exige nova data e hora; nos outros a nova data é opcional. Ver 4.4. |
| `realizada` | — | `compareceu = true`; registra o resultado da reunião (4.5). |
| `proposta` | valor da proposta (opcional) | Grava `proposta_enviada_em` (1ª vez). |
| `follow_up_proposta` | — | Igual a `follow_up`, com o contador `follow_up_proposta` (teto padrão 7). |
| `ganho` | valor fechado > 0 | Grava `fechado_em`, `valor_fechamento`, `follow_ups_ate_fechamento`; oferece "Cadastrar como cliente". |
| `perdido` | motivo (lista da coluna) | Grava `perdido_em`, `motivo_perda`; cancela reunião futura (4.6). |
| `desqualificado` | motivo (lista da coluna) | Grava `desqualificado_em`, `motivo_desqualificacao`; cancela reunião futura; fora da taxa de conversão. |

O lead nasce na **primeira coluna** (menor `ordem`). O mesmo tipo pode aparecer em mais de uma coluna; o
dashboard agrupa por tipo.

### 3.2 Colunas iniciais

| id | Título | Tipo | Cor |
|---|---|---|---|
| `novo_lead` | Novo lead | padrao | #64748b |
| `primeiro_contato` | Primeiro contato | padrao | #3b82f6 |
| `follow_up` | Follow-up | follow_up (teto 7) | #06b6d4 |
| `respondeu` | Respondeu | padrao | #14b8a6 |
| `desenvolvendo` | Desenvolvendo conversa | padrao | #10b981 |
| `reuniao_marcada` | Reunião marcada | reuniao | #8b5cf6 |
| `reuniao_confirmada` | Reunião confirmada | confirmacao | #6366f1 |
| `remarcar` | Remarcar reunião | remarcacao | #f59e0b |
| `reuniao_realizada` | Reunião realizada | realizada | #a855f7 |
| `proposta` | Proposta enviada para avaliação | proposta | #f97316 |
| `follow_up_proposta` | Follow-up de proposta | follow_up_proposta (teto 7) | #fb923c |
| `fechamento` | Fechamento | ganho | #16a34a |
| `perdido` | Lead perdido | perdido | #f43f5e |
| `desqualificado` | Lead desqualificado | desqualificado | #71717a |

Motivos padrão:
- **Perdido:** Não respondeu após as tentativas · Não compareceu · Sem orçamento agora · Achou caro · Escolheu
  outra agência ou profissional · Sem prioridade no momento · Não fechou após a proposta · Outro.
- **Desqualificado:** Fora do perfil ou nicho · Faturamento abaixo do mínimo · Sem verba para anúncios · Só queria
  informação · Contato inválido · Concorrente · Outro.

"Outro" abre um campo de texto; o texto vira o motivo gravado.

### 3.3 Configurar colunas

Janela "Colunas" no topo do CRM: renomear, mudar cor, reordenar (setas), mudar tipo, editar teto (tipos de
follow-up) e motivos (perdido/desqualificado), criar coluna, excluir coluna. Excluir coluna com leads exige
escolher a coluna de destino (os leads vão para lá sem as exigências da coluna destino, com evento no histórico).
Precisa sobrar ao menos uma coluna.

## 4. Movimento

### 4.1 Jeitos de mover

1. Arrastar e soltar no Kanban (no celular, segurando o card — `useSensoresArrastar`).
2. Botão "Mover" no card (lista de colunas).
3. Seletor de coluna na ficha e na Fila do dia.
4. Em massa (seção 9.3).

Antes de mover, se o tipo do destino exige algo, abre a janela correspondente. **Cancelar nunca move nada**: o
card volta e o banco não é tocado. Movimento dentro da mesma coluna só reordena.

### 4.2 O que todo movimento faz

- `coluna_id`, `coluna_desde = agora`, evento `mudanca_coluna` ("Coluna A → Coluna B") no histórico.
- Aplica os efeitos do tipo (3.1).
- Marcos imutáveis (só a 1ª vez; nunca reescritos):

| Marco | Quando |
|---|---|
| `primeiro_contato_em` | 1º movimento para qualquer coluna que não seja perdido/desqualificado, ou 1ª tentativa de follow-up |
| `primeira_reuniao_marcada_em` + `follow_ups_ate_reuniao` (cópia de `follow_up`) | 1ª vez que o lead ganha data de reunião |
| `primeira_reuniao_realizada_em` | 1ª entrada em `realizada` |
| `proposta_enviada_em` | 1ª entrada em `proposta` |
| `fechado_em` + `follow_ups_ate_fechamento` (cópia de `follow_up_proposta`) | 1ª entrada em `ganho` |

A tela muda na hora (otimista); se a gravação falhar, o card volta e aparece o erro.

### 4.3 Janela de reunião (`reuniao`, e `confirmacao` sem data)

Campos: data, hora (obrigatórios), duração (15/30/45/60/90 min, padrão 30 — lembra a última usada), e-mail do
lead (opcional, pré-preenchido do lead; se mudar, grava no lead). Vem preenchida com a reunião atual, se houver.
Confirmar grava `reuniao_em`, `reuniao_duracao_min`, `reuniao_marcada_em = agora` (se a data mudou), reinicia os
pontos de contato (seção 6) e dispara a agenda (seção 7).

### 4.4 Remarcação

Janela "Remarcar reunião — o que aconteceu?":

| Motivo | Efeito |
|---|---|
| **Não compareceu (no-show)** | `no_shows + 1`; registra o resultado da reunião (4.5) como falta. Sem nova data: `reuniao_em = null` (o evento passado fica na agenda). Com nova data: vale a linha de baixo. |
| **Não confirmou** | Sem nova data: reunião e evento ficam como estão. Com nova data: move. |
| **Pediu para remarcar** | Nova data e hora **obrigatórias** (campo vem vazio de propósito). |

Com nova data: `remarcacoes + 1`, `reuniao_em` nova, pontos recalculados, evento **movido** (mesmo evento, mesmo
Meet; se o evento sumiu da agenda, cria outro). O motivo vai para `motivo_remarcacao` e para o histórico.

### 4.5 Resultado da reunião

Ao entrar em `realizada` (compareceu) ou registrar no-show, grava um evento `reuniao_resultado` com
`{ compareceu, reuniao_em, periodo, dia_semana, pontos_feitos, pontos_aplicaveis }`. Isso alimenta os painéis de
comparecimento por período, dia da semana e pontos cumpridos.

### 4.6 Perdido e desqualificado

Motivo obrigatório. Se há reunião futura com evento: o evento é **excluído** com aviso ao convidado
(`sendUpdates=all` se houver convidado) e `reuniao_em = null`.

### 4.7 Ganho

Valor fechado obrigatório (> 0, máscara em reais). Depois de mover, toast com "Cadastrar como cliente" (o botão
também fica na ficha enquanto o lead está em `ganho` sem `cliente_id`). Fluxo:

1. Abre a janela de cadastro de fonte da aba **Faturamento**, extraída para
   `src/components/financeiro/FonteDialog.tsx` (a aba Financeiro passa a usar o mesmo componente, sem mudança de
   comportamento), pré-preenchida com o nome (empresa ou nome do lead) e o valor fechado como valor mensal.
2. Ao salvar, abre a janela de **Clientes ativos** (`ClientForm` + `saveCliente`, como hoje), pré-preenchida com
   nome, nicho e agência de destino.
3. Ao salvar, grava `cliente_id` no lead e evento `cliente_cadastrado`.

Cancelar uma janela encerra a sequência; o que já foi salvo continua salvo.

## 5. Tentativas de follow-up

- Contadores independentes: `follow_up` (prospecção, colunas `follow_up`) e `follow_up_proposta` (colunas
  `follow_up_proposta`). Teto = `config.teto` da coluna atual (padrão 7); o contador nunca passa do teto.
- Entrar na coluna com contador 0 conta a 1ª tentativa. Voltar para a coluna continua de onde parou.
- Botão "Registrar Nª tentativa": soma 1, grava evento `tentativa` datado, grava `primeiro_contato_em` se faltar,
  e agenda o próximo contato pela cadência: após a tentativa N, `proximo_contato_em` = hoje + `CADENCIA[N]` dias
  às 10h, com `CADENCIA = [1, 2, 2, 3, 3, 4]` (a 7ª não agenda). O usuário pode mudar o próximo contato na ficha.
- No teto: botão vira "Limite atingido" e o card diz "As N tentativas acabaram. Mova o lead para a coluna que
  traduz o que aconteceu." Nada se move sozinho.
- Fora da coluna, o card mostra o número congelado: "Respondeu na 3ª tentativa" (ou "Parou na 5ª" em
  perdido/desqualificado).

## 6. Pontos de contato da reunião

### 6.1 Período da call (pelo horário de início, fuso America/Sao_Paulo)

`manha` (até 11h59) · `inicio_tarde` (12h00–14h59) · `fim_dia` (15h00–17h59) · `noite` (18h00 em diante).

### 6.2 Os 5 pontos (D = dia da call)

| # | Ponto | manha | inicio_tarde | fim_dia | noite |
|---|---|---|---|---|---|
| 1 | Aquecimento (3 dias antes) | D-3 10:00 | D-3 11:00 | D-3 15:00 | D-3 18:30 |
| 2 | Confirmação na véspera | D-1 10:00 | D-1 11:00 | D-1 15:00 | D-1 18:30 |
| 3 | Lembrete do dia | D-1 19:00 | D 08:30 | D 09:00 | D 12:00 |
| 4 | Pré-call | início − 1 h, nunca antes de 07:30 | início − 2 h | início − 2 h | início − 2 h |
| 5 | Link do Meet | início − 10 min | início − 10 min | início − 10 min | início − 10 min |

A tabela mora num arquivo só (`src/lib/crmPontos.ts`).

### 6.3 Regras

- Os pontos existem enquanto o lead tem `reuniao_em` (aparecem no card a partir de Reunião marcada e em destaque
  na coluna `confirmacao`).
- **Não se aplica:** ponto cujo horário já tinha passado quando a reunião foi marcada (`reuniao_marcada_em`). Não
  conta como falha.
- Estado de cada ponto: `feito` (com data/hora), `nao_se_aplica`, `atrasado` (horário passou e não foi feito),
  `pendente`.
- Card: "Pontos 2/5 · próximo: Véspera — qua 11:00"; ponto atrasado em amarelo **com texto** ("Atrasado: Lembrete
  do dia, 08:30").
- Marcar/desmarcar um ponto grava evento `ponto_contato` no histórico.
- Nova data (remarcação ou edição) recalcula a tabela e zera os pontos feitos (o histórico guarda os antigos).
- Guardado em `pontos_contato jsonb`: `{ ref: <reuniao_em ISO>, marcada_em: <ISO>, feitos: { "1": <ISO>, ... } }`.

## 7. Agenda, Meet e Fireflies

- Agenda `primary` da contato@ (a mesma que o worker lê para mandar o robô do Fireflies — nada muda no worker; um
  evento movido recebe o robô no novo horário).
- Chamadas pelo navegador com as funções de `src/lib/googleCalendar.ts` (mesmo login do Google da aba Agenda).
- **Corpo do evento** (`src/lib/crmAgenda.ts`, puro e testado):
  - `summary`: "Reunião — {nome}{ (empresa)} · André Lopes"
  - `description`: texto neutro ("Reunião com André Lopes — Estrategista digital. O link do Google Meet está neste
    convite."). Nenhum dado interno do CRM vai para o evento.
  - `start`/`end` com `timeZone: America/Sao_Paulo` e a duração escolhida
  - `attendees`: `[{ email }]` se houver e-mail válido
  - `conferenceData.createRequest` (hangoutsMeet) na criação
  - `reminders: { useDefault: false, overrides: popup 60, 30, 10 }`
  - `extendedProperties.private.crm_lead_id`
  - `sendUpdates=all` quando há convidado, `none` quando não há
- **Ações:**

| Situação | Ação |
|---|---|
| Reunião nova sem evento | Criar; gravar `evento_google_id` e `evento_meet_link` |
| Nova data com evento | PATCH de `start`/`end` (e convidados); se 404/410, criar outro |
| E-mail adicionado/trocado com reunião futura | PATCH de `attendees` com convite |
| Perdido/desqualificado com reunião futura | Excluir o evento (aviso ao convidado) |

- **Falha** (Google desconectado, erro de rede, permissão): o movimento é mantido; `evento_status = 'erro'` e
  `evento_erro` com a mensagem; o card mostra "Evento não criado — tentar de novo" (botão refaz a ação pendente).
  Sucesso grava `evento_status = 'ok'`.
- Link do Meet no card/ficha com "Entrar" (`linkMeetNaConta`) e "Copiar".

## 8. Etiquetas e dados do lead

- `trafego`: `organico` | `pago` (padrão `organico`), mostrado no card e editável em massa.
- Dados (só `nome` obrigatório): empresa, nicho, cidade/UF, telefone/WhatsApp, e-mail, site/LP, Instagram, Google
  Meu Negócio, faturamento mensal (faixas: até 10 mil · 10–30 mil · 30–50 mil · 50–100 mil · 100–300 mil ·
  300 mil–1 mi · acima de 1 mi), investimento atual em anúncios (faixas: não investe · até 1 mil · 1–3 mil ·
  3–10 mil · 10–30 mil · acima de 30 mil), descrição, agência de destino (a que já existe).
- Rastreamento (editável, para o futuro): utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid,
  gclid, página de entrada, referência.
- Sai da tela: valor estimado e probabilidade (as colunas continuam no banco).

## 9. Telas

Rota `/crm` (`src/routes/_authenticated/crm.tsx`); `/prospeccao` redireciona para `/crm`; menu "CRM" (ícone
Target); `ENDERECOS_ANTIGOS` do menu ganha `"/prospeccao": "/crm"`.

### 9.1 Topo

Título "CRM" · botões "Novo lead" e "Colunas" · período (Hoje, Ontem, 7 dias, 30 dias, Este mês, Mês passado,
Máximo, Personalizado de/até) · critério (Data de entrada × Movimentação) · busca (nome, empresa, telefone,
e-mail) · filtro Orgânico/Pago/Todos · seletor **Fila do dia | Kanban | Planilha | Dashboard**. Período, critério,
filtro e visão ficam salvos no navegador. Padrão: período Máximo, visão Kanban.

Critério: **entrada** = `data_lead`/`created_at` no período; **movimentação** = algum evento do histórico no
período.

### 9.2 Kanban e card

- Uma coluna por item de `crm_colunas`, na ordem; cabeçalho com cor, nome, quantidade, total em R$ (só em
  `ganho`: soma de `valor_fechamento`; em `proposta`/`follow_up_proposta`: soma de `valor_proposta`).
- Arrastar entre colunas e reordenar (`useKanbanDnd` + `useSensoresArrastar`).
- Card: tarja de urgência à esquerda **com texto** (sem contato há mais de 24 h na 1ª coluna com
  `follow_up = 0` → vermelho; próximo contato vencido → amarelo; reunião em menos de 24 h → azul), nome, empresa ·
  nicho, etiqueta Orgânico/Pago, etiqueta de origem/campanha (se houver UTM), data da reunião, bloco de
  tentativas (colunas de follow-up) ou número congelado, pontos de contato (se há reunião), aviso de evento com
  erro, rodapé com WhatsApp e "Mover". Clique abre a ficha.
- Caixa de seleção no card (aparece ao passar o mouse, sempre visível no toque e quando há seleção) e "selecionar
  todos" no cabeçalho da coluna.

### 9.3 Ações em massa (Kanban e Planilha)

Barra de seleção (padrão `SelecaoBarra` das Demandas): **Mover para…** (só colunas `padrao`, `follow_up`,
`follow_up_proposta`, `realizada`, `proposta` sem valor; `perdido`/`desqualificado` com um motivo para todos;
`reuniao`, `confirmacao`, `remarcacao` e `ganho` ficam de fora), **Orgânico/Pago**, **Excluir** (AlertDialog),
**Limpar seleção**. Cada lead recebe seus eventos de histórico.

### 9.4 Fila do dia

Blocos, nesta ordem, cada lead em um só: **Atrasados** (próximo contato vencido) · **Pontos de contato
atrasados** · **Novos sem contato** (1ª coluna, `follow_up = 0`) · **Para hoje** (próximo contato hoje) ·
**Reuniões de hoje** (por horário) · **Reuniões de amanhã**. Cada linha: nome, coluna, motivo de estar ali,
WhatsApp, seletor de coluna, "Registrar tentativa" (quando em follow-up) e o próximo ponto de contato
(marcar feito).

### 9.5 Planilha

Colunas: Nome, Empresa, Telefone, E-mail, Etiqueta, Coluna, Tentativas, Próximo contato, Reunião, Valor proposta,
Valor fechado, Origem (utm_source), Campanha, Entrada. Ordenar clicando no título; seleção e ações em massa;
clique no nome abre a ficha.

### 9.6 Ficha do lead (painel lateral; tela cheia no celular)

1. Ações rápidas: WhatsApp (link `https://api.whatsapp.com/send?phone=`; normalização do número como no CRM de
   referência: 10–11 dígitos ganham 55), ligar, copiar telefone, abrir site/Instagram/GMN.
2. Gestão: coluna (move com as janelas), próximo contato (data e hora), reunião (data/hora/duração → mesma lógica
   de 4.3), Meet (entrar/copiar), bloco de tentativas, pontos de contato, resumo (tentativas, remarcações,
   no-shows, valor proposta, valor fechado, motivos).
3. Dados (seção 8), editados na hora ao sair do campo.
4. Rastreamento (seção 8).
5. Notas (texto livre → evento `nota`).
6. Histórico (todos os eventos, mais recentes no topo, em português, com data e hora).
7. Ações: Criar demanda de follow-up (fluxo atual), Cadastrar como cliente (em `ganho`), Excluir lead.

### 9.7 Novo lead

Janela com nome (obrigatório), empresa, telefone, e-mail, etiqueta Orgânico/Pago e descrição; o resto na ficha.
O lead nasce na 1ª coluna com evento `criacao`.

## 10. Dashboard

Mesmos filtros do topo (período, critério, etiqueta). Toda média mostra a amostra ("média entre 12 leads").
Intervalos negativos contam como zero.

**Números:** leads · reuniões marcadas (com `primeira_reuniao_marcada_em`) · reuniões realizadas (`compareceu`) ·
taxa de comparecimento (realizadas ÷ (realizadas + leads com no-show que nunca compareceram)) · propostas
enviadas · fechamentos (em coluna `ganho`) · receita (soma `valor_fechamento`) · ticket médio · conversão
(fechamentos ÷ (leads − desqualificados)).

**Jornada:** tempo até o 1º contato (`primeiro_contato_em − created_at`) · 1º contato → reunião marcada ·
follow-ups até marcar (média `follow_ups_ate_reuniao`) · reunião realizada → proposta · 1º contato → fechamento ·
follow-ups de proposta até fechar (média `follow_ups_ate_fechamento`).

**Painéis:**
- **Funil acumulado** por marcos: Leads → Contatados → Reunião marcada → Reunião realizada → Proposta → Fechado,
  com taxa de passagem e o **maior gargalo** destacado.
- **Em qual tentativa responderam:** distribuição de `follow_ups_ate_reuniao` (0–7) e quantos estão em follow-up
  agora, por número.
- **Orgânico × Pago:** leads, reuniões, realizadas, fechamentos, receita, conversão.
- **Origem e campanha (UTM):** mesma tabela por utm_source e por utm_campaign ("Sem UTM" agrupado).
- **Nicho** e **faixa de faturamento:** leads, reuniões, fechamentos, conversão, ticket.
- **Motivos de perda** e **motivos de desqualificação** (barras).
- **No-show e recuperação:** quantos faltaram, quantos remarcaram, quantos compareceram depois, taxa de
  recuperação.
- **Depois da reunião:** dos que compareceram — fechou na hora (`follow_ups_ate_fechamento = 0`), fechou no
  follow-up, não fechou, em andamento.
- **Comparecimento por período da call, por dia da semana e por pontos de contato cumpridos** (eventos
  `reuniao_resultado`).
- **Tempo médio em cada coluna** (dos eventos `mudanca_coluna`, incluindo a estadia atual).
- **Previsão:** leads em `proposta`/`follow_up_proposta` × taxa histórica (fechados ÷ propostas com desfecho) ×
  ticket médio, com amostra.
- **Parados há mais de 7 dias:** leads fora de `ganho`/`perdido`/`desqualificado` com `coluna_desde` há mais de
  7 dias, por coluna, com os nomes (clique abre a ficha).

Gráficos com Recharts (já no projeto), seguindo o visual do app (claro e escuro).

## 11. Dados

Migration `supabase/migrations/20260926200000_crm.sql`, aplicada pelo editor SQL do Lovable. Segue o padrão
atual do projeto (RLS com política aberta, como as outras tabelas).

- **`crm_colunas`**: `id text PK default gen_random_uuid()::text`, `titulo text not null`, `hex text not null`,
  `ordem int not null`, `tipo text not null check (...)`, `config jsonb not null default '{}'` (`teto`,
  `motivos`), `created_at`. Semeada com as 14 colunas (`ON CONFLICT DO NOTHING`).
- **`crm_eventos`**: `id uuid PK`, `lead_id uuid not null references prospeccao(id) on delete cascade`,
  `tipo text not null`, `descricao text not null`, `dados jsonb not null default '{}'`, `created_at timestamptz
  default now()`; índice `(lead_id, created_at)` e `(created_at)`. Tipos: `criacao`, `mudanca_coluna`,
  `tentativa`, `ponto_contato`, `reuniao`, `remarcacao`, `reuniao_resultado`, `agenda`, `nota`, `edicao`,
  `ganho`, `perda`, `desqualificacao`, `cliente_cadastrado`, `em_massa`.
- **`prospeccao`** ganha: `coluna_id text references crm_colunas(id)`, `coluna_desde timestamptz`,
  `trafego text not null default 'organico' check in ('organico','pago')`, `empresa`, `cidade`, `telefone`,
  `email`, `site`, `instagram`, `google_meu_negocio`, `faturamento_faixa`, `investimento_faixa` (text), UTMs e
  rastreamento (text), `proximo_contato_em timestamptz`, `follow_up int default 0`, `follow_up_proposta int
  default 0`, `reuniao_em timestamptz`, `reuniao_duracao_min int default 30`, `reuniao_marcada_em timestamptz`,
  `evento_google_id`, `evento_meet_link`, `evento_status`, `evento_erro` (text), `pontos_contato jsonb default
  '{}'`, `compareceu boolean default false`, `no_shows int default 0`, `remarcacoes int default 0`,
  `motivo_remarcacao text`, `valor_proposta numeric`, `valor_fechamento numeric`, `motivo_desqualificacao text`,
  `desqualificado_em`, `perdido_em`, `fechado_em`, `primeiro_contato_em`, `primeira_reuniao_marcada_em`,
  `primeira_reuniao_realizada_em`, `proposta_enviada_em` (timestamptz), `follow_ups_ate_reuniao int`,
  `follow_ups_ate_fechamento int`. `observacoes` passa a ser a **descrição**.
- **Backfill:** `coluna_id` a partir de `etapa` (`lead`→novo_lead, `contato_feito`→primeiro_contato,
  `reuniao_agendada`→reuniao_marcada, `proposta_enviada`→proposta, `negociacao`→follow_up_proposta,
  `fechado`→fechamento, `perdido`→perdido); `coluna_desde = updated_at`; `fechado_em`/`perdido_em` das datas
  antigas; `valor_fechamento = valor_estimado` dos fechados; `proximo_contato_em` de `data_proximo_contato`.
  Hoje são 5 leads (3 fechados, 2 perdidos).
- A coluna `etapa` (enum) continua existindo e deixa de ser usada.

## 12. Arquivos

Libs puras (sem imports `@/`, testadas com `npm test`):
- `src/lib/crmColunas.ts` — tipos, colunas padrão, motivos, faixas, exigências por tipo, destinos permitidos em
  massa.
- `src/lib/crmMovimento.ts` — `planejarMovimento(lead, origem, destino, dadosJanela, agora)` → `{ patch, eventos,
  agenda }` (efeitos, marcos, contadores, remarcação, resultado da reunião).
- `src/lib/crmTentativas.ts` — registrar tentativa, teto, cadência, texto congelado.
- `src/lib/crmPontos.ts` — período da call, tabela de pontos, estados, próximo ponto, recálculo.
- `src/lib/crmAgenda.ts` — corpo do evento e decisão da ação na agenda.
- `src/lib/crmPeriodo.ts` — atalhos de período e filtro por critério.
- `src/lib/crmUrgencia.ts` — urgência do card e blocos da Fila do dia.
- `src/lib/crmMetricas.ts` — todas as contas do dashboard.
- `src/lib/crmWhatsapp.ts` — normalização do telefone e link.

Com Supabase/Google (`@/` permitido):
- `src/lib/crmDados.ts` — carregar colunas/leads/eventos, gravar movimento, eventos, massa, config de colunas;
  executar a ação da agenda e gravar o resultado.
- `src/components/crm/*` — `CrmTopo`, `FilaDoDia`, `KanbanCrm`, `ColunaCrm`, `CardLead`, `SelecaoBarraCrm`,
  `PlanilhaCrm`, `FichaLead`, `DialogoMovimento` (reunião, remarcação, proposta, ganho, perdido,
  desqualificado), `BotaoTentativa`, `PontosContato`, `ConfigurarColunas`, `NovoLeadDialog`, `CadastrarCliente`
  (Faturamento → Clientes), `DashboardCrm` e painéis.
- `src/components/financeiro/FonteDialog.tsx` — extraído de `financeiro.tsx`.
- `src/routes/_authenticated/crm.tsx`; `prospeccao.tsx` vira redirecionamento; `src/lib/nav.tsx`,
  `src/lib/menuConfig.ts`, `src/lib/data.ts` (loaders).
- Componentes antigos de `src/components/prospeccao/` são removidos quando nada mais os usar.

## 13. Testes e verificação

- Testes unitários de todas as libs puras (movimento por tipo, marcos só na 1ª vez, cancelar = nada, remarcação
  nos 3 motivos, tentativas e teto, cadência, pontos nos 4 períodos + "não se aplica" + recálculo, corpo do evento
  com e sem e-mail, ações da agenda, métricas com amostras pequenas e intervalos negativos, período e critério,
  urgência, WhatsApp).
- `npx tsc --noEmit` sem erros; `npm test` passando.
- Verificação no navegador (dev server local e depois no site publicado): criar lead, arrastar por todas as
  colunas, janelas, massa, Fila, Planilha, Dashboard, configurar colunas; agenda testada com evento real
  "TESTE CLAUDE" com convidado `oandrelopesz@gmail.com` e "não enviar"/apagado depois (ver memória da Agenda);
  Ganho → Faturamento → Clientes com cadastro de teste apagado depois.

## 14. Fora do escopo agora

Modelos de mensagem de WhatsApp por etapa · modo "Como usar" · exportar CSV · modo discreto/ações sensíveis ·
entrada automática de leads (webhook/formulário) · controle de versão para duas pessoas no mesmo lead (usuário
único).

## 15. Riscos

- **Google desconectado no aparelho:** o movimento acontece e o card avisa; o botão "tentar de novo" resolve
  depois de entrar com o Google.
- **Notificações 60/30/10 min** valem na agenda da contato@; na agenda do lead valem as notificações padrão dele
  (limite do Google).
- **Migration manual:** o código novo depende da migration aplicada antes da publicação.
