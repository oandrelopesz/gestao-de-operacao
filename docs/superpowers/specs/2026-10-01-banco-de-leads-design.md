# Banco de leads — design (planilha "Planilha CRM Mestra" integrada ao CRM)

Data: 01/10/2026. Aprovado em conversa, parte por parte.

## 1. Objetivo

Integrar a planilha de leads do André (`Planilha CRM Mestra`, id `176k4WPiMeOU1Va8AxSCsGdpzkA1F0lST0m4mbXQrZak`,
dona contato@andrelopes.digital) ao sistema:

- Uma visão nova **Banco de leads** dentro da aba CRM, com uma sub-aba por aba de leads da planilha, mostrando só as
  colunas visíveis (as ocultas ficam ocultas, como na planilha).
- **Sincronização nos dois sentidos**: o que muda na planilha aparece no sistema e o que muda no sistema aparece na
  planilha, em segundos.
- A aba **CRM** da planilha deixa de ter regras próprias e vira **espelho editável do CRM do sistema**.
- **Nada muda no funcionamento do CRM do sistema.** Os únicos toques no código do CRM são o botão da visão nova e uma
  escuta de mudanças (Realtime).

## 2. Decisões do André

1. A aba CRM da planilha é um **espelho editável**: mesmos leads, coluna "Etapa" com as colunas do sistema; mudou lá,
   muda aqui, e vice-versa. Os 33 leads de hoje entram no CRM do sistema na etapa equivalente.
2. Entrada e saída **iguais a hoje**: "Primeira mensagem enviada = Sim" cria o lead no CRM do sistema, na coluna
   **Primeiro contato**; "Não" tira o lead do CRM (apagado com o histórico) e manda a linha para "CRM - lixeira".
   "Lead válido = Não" impede a entrada. Vale marcando na planilha ou no Banco de leads.
3. Visual do Banco de leads: **tabela + ficha lateral**, sub-abas com contagem, edição na célula, cores da planilha.
4. A tela do CRM se atualiza **sozinha** (Realtime) quando algo muda pela planilha.
5. Reunião marcada pela planilha **cria o evento na hora**, com Meet e convite ao e-mail do card. Dados do card
   (e-mail, observações etc.) vão para a planilha e voltam dela.
6. **Um lead só**: os campos em comum ficam iguais na aba de origem, na aba CRM da planilha e no card do sistema.
7. Caminho técnico **A**: cópia no banco do sistema, Apps Script como ponte, edge function com as regras do CRM,
   conferência a cada 5 minutos.

## 3. Como as peças conversam

```
Planilha (Apps Script)                       Sistema (Lovable Cloud)
───────────────────────                      ─────────────────────────────────────────
gatilho de edição  ──── POST ação ─────────▶ edge function `planilha`
gatilho de mudança                             │ regras do CRM (libs puras copiadas)
relógio de 5 min   ◀─── operações ───────────  │ agenda pelo servidor (token da contato@)
                                               ▼
Web App (doPost)   ◀─── pg_net "tem fila" ─── gatilhos em banco_leads / prospeccao
   │                                           (gravam em planilha_fila)
   └── POST fila ─────────────────────────▶  edge `planilha` devolve as operações da fila
                                               ▲
Tela Banco de leads e CRM (navegador) ────────┘ grava direto nas tabelas (chave pública)
```

- **Planilha → sistema:** o gatilho de edição manda a linha alterada para a edge function, que grava e devolve as
  **operações** que a planilha precisa aplicar em outras linhas (ex.: a linha do lead na aba CRM, a lixeira).
- **Sistema → planilha:** gravações vindas do sistema passam por gatilhos no banco que registram o que mudou em
  `planilha_fila` e avisam o Web App do Apps Script (pg_net). O Web App pede a fila à edge function, aplica as
  operações e confirma.
- **Sem eco:** gravações feitas pela edge function em nome da planilha levam o cabeçalho `x-origem: planilha`; os
  gatilhos leem `current_setting('request.headers')` e não registram fila para elas. A edge function devolve, na
  resposta, tudo o que a planilha precisa atualizar.
- **Em fila:** o Apps Script usa `LockService` em todas as execuções (edição, mudança, relógio, Web App). Nunca duas
  gravam ao mesmo tempo. Cada edição lê o valor **atual** da célula na hora de enviar (não o `e.value`), para que a
  última edição sempre vença.

## 4. Banco de dados

Migration `supabase/migrations/20261001200000_banco_de_leads.sql`, idempotente, aplicada pelo editor SQL do Lovable.

### 4.1 Tabelas novas

- **`planilha_config`** (uma linha, `id = 'principal'`): `planilha_id`, `chave` (senha da ponte), `webapp_url`,
  `ultima_conferencia_em`, `ultima_conferencia_ok boolean`, `ultima_conferencia_erro`, `updated_at`.
  **RLS sem política** (a chave pública não lê nem grava); a edge function usa a service role. O front lê o estado da
  conferência pela função `planilha_status()` (security definer, devolve só `ultima_conferencia_*` e `planilha_id`).
- **`banco_leads_abas`**: `id text PK` (gid da aba), `nome`, `ordem int`, `colunas jsonb` (lista na ordem da
  planilha: `{ chave, titulo, indice, oculta, papel }`), `updated_at`. RLS aberta (padrão do projeto).
- **`banco_leads`**: `id uuid PK default gen_random_uuid()`, `aba_id text not null references banco_leads_abas(id) on
  delete cascade`, `posicao int not null default 0` (linha na planilha), `dados jsonb not null default '{}'` (todas as
  colunas da linha, inclusive as ocultas, por `chave`; células vazias não entram), `hash text` (calculado por
  gatilho, 4.3), `lead_crm_id uuid references prospeccao(id) on delete set null`, `na_planilha boolean not null default
  false`, `created_at`, `updated_at`. Índices `(aba_id, posicao)` e `(lead_crm_id)`. RLS aberta.
- **`planilha_fila`**: `id bigserial PK`, `entidade text` (`lead` | `crm`), `registro_id text`, `op text`
  (`upsert` | `delete`), `campos text[]`, `dados jsonb` (retrato da linha apagada), `criado_em`. RLS sem política:
  só a edge function lê (service role) e só os gatilhos gravam (funções `SECURITY DEFINER`).
- **`planilha_pendencias`**: `lead_id uuid PK references prospeccao(id) on delete cascade`, `etapa_desejada text`,
  `falta text`, `criado_em`. Etapa escolhida na planilha que ainda espera dado (5.4). RLS sem política.

`prospeccao`, `crm_colunas` e `crm_eventos` não ganham colunas.

### 4.2 Chaves e papéis das colunas

- `chave` = título da coluna sem espaços nas pontas; títulos repetidos ganham sufixo ` (2)`, ` (3)`.
- `papel` é descoberto pelo título (lista em `src/lib/bancoLeads.ts`):

| papel | títulos aceitos |
|---|---|
| `nome` | Nome, Nome do cliente, Lead |
| `empresa` | Empresa, Nome da empresa |
| `telefone` | Telefone |
| `instagram` | Instagram |
| `link_instagram` | Link Instagram, Link do Instagram |
| `faturamento` | Faturamento mensal |
| `cidade` | Cidade / UF, Região / Cidade, Cidade |
| `nicho` | Nicho, Especialidade, Tipo de Negócio |
| `site` | Site / LP, Link da LP, Site |
| `data_chegada` | Data de chegada |
| `valido` | Lead válido |
| `primeira_msg` | Primeira mensagem enviada |
| `id` | ID (sistema) |

- É **aba de leads** toda aba com a coluna "Primeira mensagem enviada", fora `Resumo`, `CRM`, `CRM - lixeira` e as
  abas de apoio (Duplicatas removidas, Excluidos nesta rodada, Sem Instagram, Empresa não identificada). Mesma regra do
  script atual.

### 4.3 Gatilhos e funções

- **`banco_leads_hash`** (BEFORE INSERT/UPDATE em `banco_leads`): `hash = md5(string_agg(chave || chr(31) || valor,
  chr(30) ORDER BY chave COLLATE "C"))` sobre `jsonb_each_text(dados)` com valor não vazio. O Apps Script calcula o
  mesmo md5 (UTF-8, chaves em ordem de código) para comparar sem baixar os dados.
- **`planilha_registrar`** (AFTER INSERT/UPDATE/DELETE em `banco_leads` e em `prospeccao`): se o cabeçalho
  `x-origem` da requisição é `planilha`, não faz nada. Senão grava em `planilha_fila` os campos que mudaram (em
  `prospeccao`, só os campos mostrados na aba CRM, 5.2; mudanças só de `ordem`, por exemplo, não contam) e, se não há
  outro aviso nos últimos 3 s, chama o Web App (`net.http_post` para `planilha_config.webapp_url`). Em DELETE de
  `prospeccao`, grava o retrato da linha em `dados`.
- **Um lead só** (AFTER UPDATE): quando muda um campo em comum (nome, empresa, telefone, instagram, cidade, nicho,
  site) em `prospeccao`, o gatilho copia para `banco_leads.dados` do lead ligado (na `chave` do papel daquela aba); e o
  contrário quando muda em `banco_leads`. A cópia leva a mesma origem da gravação original e marca
  `set_config('app.propagando','1', true)` para não voltar.
- **Saída do CRM** (BEFORE DELETE em `prospeccao`): põe "Não" em "Primeira mensagem enviada" do lead ligado.
- **Pendência obsoleta**: mudança de `coluna_id` em `prospeccao` apaga a linha de `planilha_pendencias`.
- **`planilha_resumo(aba)`** (security definer): por aba, `count` e `md5(string_agg(id::text || ':' || hash || ':' ||
  posicao, ',' ORDER BY id::text COLLATE "C"))`; e para o CRM, `md5` de `id` + `updated_at` de todos os leads.
- `prospeccao`, `crm_eventos`, `banco_leads` e `banco_leads_abas` entram na publicação `supabase_realtime`.

## 5. A planilha

### 5.1 Abas de leads

- Ganham a coluna **"ID (sistema)"** no fim, **oculta**. Linha sem ID (digitada, colada, colada com ID repetido)
  ganha um UUID na hora.
- Continuam iguais: listas Sim/Não em "Lead válido" e "Primeira mensagem enviada", linha verde (no CRM) e vermelha
  (inválido), fonte Poppins, cabeçalho congelado.
- "Primeira mensagem enviada = Sim" com "Lead válido = Não": a célula volta para "Não" e aparece o aviso.

### 5.2 Aba CRM (nova estrutura)

Antes da troca, a aba atual é guardada como **"CRM antigo (backup)"** (oculta) e a planilha inteira é copiada no Drive.

| # | Coluna | Campo no sistema | Edita na planilha |
|---|---|---|---|
| 1 | Lead | `nome` | sim (em comum) |
| 2 | Empresa | `empresa` | sim (em comum) |
| 3 | Telefone | `telefone` | sim (em comum) |
| 4 | E-mail | `email` | sim; com reunião futura manda convite |
| 5 | Instagram | `instagram` | sim (em comum) |
| 6 | Aba de origem | nome da aba do lead ligado, ou "Sistema" | não |
| 7 | Etapa | `coluna_id` (título da coluna) | sim, pelas regras do CRM (5.4) |
| 8 | Na etapa desde | `coluna_desde` | não |
| 9 | Tentativas | `follow_up` | sim, só em etapa de follow-up |
| 10 | Tentativas da proposta | `follow_up_proposta` | sim, só em follow-up de proposta |
| 11 | Próximo contato | `proximo_contato_em` (dd/mm/aaaa hh:mm) | sim |
| 12 | Reunião (data) | `reuniao_em` | sim |
| 13 | Reunião (hora) | `reuniao_em` | sim |
| 14 | Duração (min) | `reuniao_duracao_min` | sim (15/30/45/60/90) |
| 15 | Link do Meet | `evento_meet_link` | não |
| 16 | Situação | "Evento criado", "Evento não criado: …", "Falta preencher: …" | não |
| 17 | Valor da proposta | `valor_proposta` | sim |
| 18 | Valor fechado | `valor_fechamento` | sim |
| 19 | Motivo | `motivo_perda` / `motivo_desqualificacao` / `motivo_remarcacao`, pela etapa | sim |
| 20 | Orgânico/Pago | `trafego` | sim |
| 21 | Nicho | `nicho` | sim (em comum) |
| 22 | Cidade | `cidade` | sim (em comum) |
| 23 | Faturamento | texto da aba de origem; sem origem, a faixa do CRM | sim (5.5) |
| 24 | Observações | `observacoes` (descrição do lead) | sim |
| 25 | Entrou no CRM | `created_at` | não |
| 26 | ID (sistema) | `id` | oculta |

- Listas: Etapa (títulos das colunas do CRM, na ordem), Motivo (muda conforme a etapa: motivos de perda, de
  desqualificação ou de remarcação; aceita texto livre, que vira "Outro"), Orgânico/Pago, Duração, Hora (07:00 a
  22:00 de 15 em 15 min).
- Cores: Fechamento verde; Perdido e Desqualificado vermelho; etapas de reunião (tipos `reuniao`, `confirmacao`,
  `remarcacao`) amarelo; **âmbar** quando a Situação começa com "Falta preencher". Colunas que não se editam ficam com
  fundo cinza-claro.
- Editar uma coluna que não se edita: a célula volta ao valor do sistema.
- **Apagar uma linha da aba CRM não apaga o lead**: ela volta na próxima conferência. Para tirar do CRM, "Não" na aba de
  origem ou "Excluir" no sistema. Aviso na hora explicando isso.

### 5.3 Lixeira

"CRM - lixeira" passa a ter as mesmas colunas da aba CRM (sem a de ID). Recebe a linha quando o lead sai do CRM por
"Não" ou é excluído no sistema. As 7 linhas antigas são convertidas para as colunas novas.

### 5.4 Etapa pela planilha

A edição manda à edge function a **linha inteira** e qual coluna mudou. A função compara com o lead no banco:

1. **Etapa diferente da do banco** → tenta o movimento com `validarMovimento` + `planejarMovimento`, usando a linha
   como "janela":
   - `reuniao` (e `confirmacao` sem reunião): Reunião (data) + (hora) + Duração (padrão 30);
   - `remarcacao`: Motivo (Não compareceu / Não confirmou / Pediu para remarcar); "Pediu para remarcar" exige data e
     hora **diferentes** da reunião atual; nos outros, data e hora diferentes viram a nova reunião;
   - `proposta`: Valor da proposta (opcional);
   - `ganho`: Valor fechado > 0;
   - `perdido` / `desqualificado`: Motivo.
   Se falta dado: grava em `planilha_pendencias` e a linha mostra a etapa escolhida em âmbar com "Falta preencher: …;
   no sistema o lead continua em <etapa atual>". Quando o dado é preenchido, a próxima edição completa o movimento.
   Voltar a Etapa para a do sistema apaga a pendência.
2. **Mesma etapa, reunião diferente** (data, hora ou duração) → `planejarReuniao` (marca, move ou ajusta), como o campo
   de reunião da ficha do sistema.
3. **Tentativas maiores que no banco** (em etapa do tipo certo) → `registrarTentativa` uma vez por unidade, até o
   teto. Menor que no banco, ou fora da etapa: volta ao valor do sistema com aviso.
4. **Demais campos** → patch simples com evento `edicao` no histórico. E-mail novo com reunião futura → ação de agenda
   `convidar`.

Todo evento de histórico gravado pela planilha termina com " (pela planilha)".

### 5.5 Faturamento

- Texto da planilha → faixa do CRM quando os limites batem exatamente (ex.: "De R$50 mil a R$100 mil por mês" →
  `50k_100k`; "Até R$10 mil" → `ate_10k`). Valores em euro ou faixas sem equivalente (100 a 500 mil) deixam a faixa
  vazia. Tabela em `src/lib/bancoLeads.ts`, com teste.
- Na aba CRM, editar Faturamento de lead com origem muda o texto da aba de origem (e a faixa, se houver
  equivalente); sem origem, só aceita uma faixa do CRM (a célula volta com aviso se não for).

### 5.6 Menu CRM

- **Configurar planilha**: o que já faz hoje (fonte, listas, cores, abas de apoio ocultas) + as colunas ID e a aba CRM
  nova.
- **Sincronizar agora**: roda a conferência na hora e mostra o resultado.
- **Mostrar abas de apoio**.
- **Preparar sincronização** (uso único, feito pelo Claude): IDs, carga inicial, migração do CRM antigo, gatilhos e
  registro do Web App.

## 6. Edge function `planilha`

`supabase/functions/planilha/index.ts` (`verify_jwt = false`). Toda chamada traz `x-planilha-chave`, comparada com
`planilha_config.chave` em tempo constante, e `planilha_id`, que precisa bater com a configurada. Cliente Supabase com
service role e cabeçalho global `x-origem: planilha`.

| Ação | Faz |
|---|---|
| `registrar` | Primeira vez (chave vazia): grava `chave`, `webapp_url`, `planilha_id`. Depois só atualiza `webapp_url` com a chave certa. |
| `abas` | Grava a lista de abas e colunas; apaga do banco abas que não existem mais. Devolve colunas do CRM, motivos e tetos (para as listas da aba CRM). |
| `leads` | Grava linhas das abas de leads; trata Sim/Não de "Primeira mensagem enviada" (entrar/sair do CRM) e "Lead válido = Não"; devolve operações. |
| `excluir_leads` | Apaga leads cujas linhas sumiram da planilha. |
| `crm` | Edição na aba CRM (5.4); devolve operações e avisos. |
| `fila` | Devolve as operações pendentes de `planilha_fila`, já formatadas. |
| `fila_ok` | Apaga as entradas aplicadas; marca `na_planilha` dos leads escritos. |
| `conferir` | Devolve o resumo por aba e do CRM (4.3) e grava `ultima_conferencia_*`. |
| `aba_detalhe` | `id`, `hash`, `posicao`, `na_planilha` dos leads de uma aba. |
| `linhas` | Linhas formatadas (leads ou CRM) por id. |
| `importar_crm_antigo` | Migração única dos leads da aba CRM antiga (seção 9). |

**Operação** (o que a planilha aplica): `{ tipo: "linha", aba: "<gid>" | "CRM", id, valores: { titulo: texto } }`,
`{ tipo: "remover", aba, id }`, `{ tipo: "lixeira", valores }`, `{ tipo: "aviso", id, aba, texto }` e
`{ tipo: "reverter", aba, id, valores }`. A planilha escreve só as células que diferem.

**Regras do CRM no servidor:** as libs puras `crmTipos`, `crmColunas`, `crmFormato`, `crmTentativas`, `crmPontos`,
`crmMovimento`, `crmAgenda`, mais `bancoLeads` e `planilhaCrm`, são copiadas para `supabase/functions/_shared/` por
`scripts/copiar-libs-edge.mjs`; um teste confere que as cópias são idênticas às de `src/lib/`.

**Agenda pelo servidor** (`supabase/functions/planilha/agenda.ts`): token da contato@ como em `gmn/google.ts`
(`google_oauth_tokens`, renovando com o refresh token). Mesmas ações do navegador, com os corpos de `crmAgenda.ts`:

| Ação | Chamada |
|---|---|
| `criar` | POST `calendars/primary/events?conferenceDataVersion=1&sendUpdates=all|none` com `corpoNovoEvento`; grava `evento_google_id`, `evento_meet_link` (`linkMeetDoEvento`), `evento_status = 'ok'`. |
| `mover` | GET do evento + PATCH `corpoMoverEvento`; 404/410 → `criar`. |
| `convidar` | GET + PATCH `corpoConvidar`. |
| `cancelar` | DELETE com `sendUpdates=all` se havia convidado; limpa `evento_google_id` e `evento_meet_link`. |

Falha → `evento_status = 'erro'` e `evento_erro` com a mensagem (o card do sistema já mostra "Evento não criado —
Tentar de novo"). Reunião com data passada não cria evento.

## 7. Apps Script

Código no repositório em `infra/planilha-crm/` (arquivos `.gs`, `appsscript.json`, `.clasp.json` com o script
`1xDQ4rcAWhkAQ7dkzH8HXxeuInC0Jg_BmzotPEadz2-R_w3H9DYRKeel0`), enviado com `clasp push` (ou colado no editor).

- **Escopos:** planilha atual, `script.external_request`, `script.scriptapp`, `script.container.ui`.
- **Web App:** executa como a contato@, acesso "Qualquer pessoa". O `doPost` ignora o corpo: só pede a fila à edge
  function e aplica. Quem chama não manda em nada.
- **Gatilhos instaláveis:** edição (`aoEditar`), mudança de estrutura (`aoMudar`: linhas inseridas/apagadas, colunas,
  ordenação), relógio de 5 min (`conferir`). `onOpen` simples monta o menu.
- **Propriedades do script:** `chave` (gerada no Preparar, nunca exibida), URL da edge function.
- **Aplicar operações:** acha a linha pelo ID (mapa ID → linha lido uma vez por execução), escreve só células
  diferentes, acrescenta no fim quando não acha, remove pela linha.
- **Conferência (relógio e "Sincronizar agora"):**
  1. aplica a fila;
  2. abas: compara a lista e as colunas (título/oculta) com as do banco e manda `abas` se mudou (coluna nova,
     renomeada ou ocultada reenvia a aba inteira);
  3. leads: calcula o resumo de cada aba e compara com `conferir`; nas abas diferentes, pede `aba_detalhe` e:
     - linha com hash ou posição diferente → `leads` (**a planilha vale** nas abas de leads);
     - id no banco que sumiu da planilha: com `na_planilha` → `excluir_leads`; sem → pede `linhas` e acrescenta;
     - id repetido na planilha → novo ID na repetida;
  4. CRM: se o resumo do CRM mudou desde a última conferência, pede todas as linhas e reescreve as diferentes (**o
     sistema vale** na aba CRM); linhas apagadas voltam.
- **Ritmo:** leitura em bloco (`getDisplayValues` da aba inteira), escrita em bloco por linha.

## 8. Tela no sistema

### 8.1 Toques no CRM

- `src/components/crm/CrmTopo.tsx`: `VisaoCrm` ganha `"banco"` ("Banco de leads", ícone `Database`). Com ela ativa,
  somem período, critério, filtro Orgânico/Pago, Novo lead, Colunas e Exportar.
- `src/routes/_authenticated/crm.tsx`: `{visao === "banco" && <BancoLeads />}` e o gancho `useCrmTempoReal()`.
- `src/components/crm/useCrmTempoReal.ts` (novo): escuta `prospeccao` e `crm_eventos` e chama `recarregar()` do
  `useCrm` com 1 s de espera, juntando avisos em rajada.

### 8.2 Banco de leads (`src/components/crm/banco/`)

- **`BancoLeads.tsx`**: carrega abas e leads (`src/lib/bancoLeadsDados.ts`), assina Realtime de `banco_leads` e
  `banco_leads_abas`.
- **Sub-abas** com contagem, na ordem da planilha, e **Todas** (colunas em comum: nome, empresa, telefone, Instagram,
  aba, válido, no CRM). Sub-aba escolhida fica salva no navegador.
- **Barra:** busca tolerante (`useBusca`), filtros Lead válido (Todos/Sim/Não), No CRM (Todos/Sim/Não) e "Mais
  filtros" (colunas visíveis com até 15 valores diferentes), botões "+ Lead" e "Abrir planilha" (link com `#gid=`),
  aviso "Sincronizado com a planilha há X min" (âmbar se passar de 15 min ou se a última conferência falhou).
- **Tabela** (`BancoTabela.tsx`): colunas visíveis na ordem, nome fixo à esquerda, título ordena, célula editável
  (Enter salva, Esc cancela; Sim/Não com seletor), WhatsApp no telefone (`crmWhatsapp`), links clicáveis, texto longo
  cortado com o completo no `title`. Linha verde (no CRM) e vermelha (inválido). Mostra 200 linhas e "Mostrar mais".
  Seleção em massa no padrão `SelecaoBarra`: Enviar ao CRM · Lead válido Sim/Não · Excluir.
- **Ficha** (`BancoFicha.tsx`, painel lateral; tela cheia no celular): todos os campos visíveis da aba, editáveis;
  atalhos WhatsApp/Instagram/site; "Lead válido" e "Primeira mensagem enviada"; bloco "No CRM: <etapa> desde <data>"
  com **Abrir no CRM** (muda para o Kanban e abre a ficha do lead com `abrirFicha`); Excluir lead (AlertDialog; avisa
  que o lead continua no CRM se estiver lá).
- **Novo lead** (`BancoNovoLead.tsx`): campos visíveis da aba atual; grava com `posicao` no fim.
- **Gravações pelo sistema** (`bancoLeadsDados.ts`): `atualizarCampo(id, chave, valor)` (merge em `dados`),
  `criarLeadBanco`, `excluirLeadsBanco`.
  - **Enviar ao CRM** ("Primeira mensagem enviada = Sim"): bloqueia inválido; cria o lead com `dados.criarLead` do CRM
    na coluna `primeiro_contato` com `leadCrmDoBanco()` (mesma função da edge), `primeiro_contato_em = agora`; grava
    `lead_crm_id` e "Sim".
  - **"Não"**: `excluirLeads([lead_crm_id])` do `useCrm` (cancela reunião futura e apaga); o gatilho põe "Não" e a
    fila leva a linha à lixeira.

### 8.3 Libs puras novas (com teste)

- `src/lib/bancoLeads.ts`: papéis pelos títulos, chaves únicas, faturamento → faixa, `leadCrmDoBanco(lead, aba)`,
  canonização + filtros, ordenação e opções de "Mais filtros", textos Sim/Não.
- `src/lib/planilhaCrm.ts`: colunas da aba CRM, `linhaCrm(lead, colunas, origem, pendencia)` (texto de cada célula),
  leitura das células editadas (datas `dd/mm/aaaa`, hora, valores em reais, duração), `interpretarLinhaCrm()` (5.4) e
  `migrarLinhaAntiga()` (seção 9).

## 9. Primeira carga e migração

Feita pelo Claude, pela ordem:

1. Cópia da planilha no Drive ("Planilha CRM Mestra — backup 01-10-2026").
2. Colunas "ID (sistema)" ocultas e IDs em todas as abas de leads (1.151 linhas).
3. `abas` + `leads` em lotes de 300.
4. CRM antigo → `importar_crm_antigo`:

| Situação na aba CRM antiga | Coluna no sistema | Detalhe |
|---|---|---|
| Lead Fechado = Sim | Fechamento | (hoje nenhum) |
| Lead Perdido = Sim | Lead perdido | motivo "Outro: registrado no CRM antigo da planilha" |
| Reunião Agendada = Sim | Reunião marcada | `reuniao_em` da data/hora; data passada não cria evento; `reuniao_marcada_em = agora` (pontos "não se aplica") |
| Desenvolvendo conversa = Sim | Desenvolvendo conversa | |
| Lead respondeu = Sim | Respondeu | |
| Follow Up N = Sim (maior N) | Follow-up | `follow_up = N`, evento de tentativa na "Data FUP N" |
| Só a 1ª mensagem | Primeiro contato | |

   Em todas: `primeiro_contato_em` e `created_at` = Data 1ª mensagem (10h de Brasília); `data_lead` = Data de chegada
   da aba de origem; nome, empresa, telefone, Instagram, nicho, faturamento (faixa quando houver), observações;
   evento "Importado do CRM antigo da planilha"; ligação com a linha da aba de origem pelo telefone (ou nome +
   empresa, como o script atual).
5. Aba CRM antiga → "CRM antigo (backup)" oculta; aba CRM nova montada a partir do banco; lixeira convertida.
6. Gatilhos instalados, Web App publicado e registrado; primeira conferência.

## 10. Arquivos

- `supabase/migrations/20261001200000_banco_de_leads.sql`
- `supabase/functions/planilha/{index.ts, acoes.ts, agenda.ts, operacoes.ts}` e `supabase/functions/_shared/*.ts`
  (cópias); `supabase/config.toml` ganha `[functions.planilha] verify_jwt = false`
- `scripts/copiar-libs-edge.mjs`; `src/lib/libsEdge.test.ts`
- `src/lib/bancoLeads.ts`, `src/lib/planilhaCrm.ts` (+ testes); `src/lib/bancoLeadsDados.ts`
- `src/components/crm/banco/*`, `src/components/crm/useCrmTempoReal.ts`; ajustes em `CrmTopo.tsx` e
  `routes/_authenticated/crm.tsx`
- `infra/planilha-crm/` (Apps Script + README)

## 11. Testes e verificação

- Unitários (`npm test`): papéis, chaves únicas, faturamento → faixa, `leadCrmDoBanco`, `linhaCrm`, leitura de datas e
  valores, `interpretarLinhaCrm` (cada tipo de etapa, pendência, tentativas, reunião, e-mail), `migrarLinhaAntiga`
  (os casos reais), operações, cópias idênticas, md5 canônico igual ao do Postgres (vetor conferido no banco).
- `npx tsc --noEmit`, `npm test`, `npx vite build`.
- Ponta a ponta numa **cópia da planilha** com poucas linhas, configurada como a planilha do sistema durante o teste:
  editar nos dois sentidos, Sim/Não, cada etapa (inclusive âmbar), reunião com Meet e convite ("TESTE CLAUDE",
  convidado oandrelopesz@gmail.com, apagada no fim), troca de e-mail, perdido cancelando evento, colagem em massa,
  linha apagada, aba nova, coluna ocultada, exclusão no sistema, Kanban atualizando sozinho. Tudo "TESTE CLAUDE" é
  apagado; depois a configuração aponta para a planilha verdadeira.

## 12. Riscos e limites

- **Google desconectado:** o movimento acontece; a agenda fica com o aviso de erro e "Tentar de novo".
- **Quotas do Google:** gatilhos instaláveis somam até 6 h/dia; a conferência usa ~10 min/dia.
- **Aviso perdido** (pg_net, rede): a conferência corrige em até 5 min.
- **Edição simultânea do mesmo campo** nos dois lados em segundos: vale a última gravação.
- **Linhas copiadas com o ID oculto** viram duplicadas no ID: a conferência dá ID novo à repetida.
- **Edge function só publica pelo chat do Lovable**; migration pelo editor SQL; site pelo botão Publicar.

## 13. Fora do escopo

Criar aba de leads pelo sistema · pontos de contato na planilha · "Cadastrar como cliente" pela planilha · mudar as
colunas do CRM pela planilha · histórico do lead na planilha.
