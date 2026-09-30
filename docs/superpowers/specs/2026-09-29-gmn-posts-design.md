# Posts automáticos no Google Meu Negócio — desenho

Data: 29/09/2026. Status: aprovado no brainstorming, aguardando revisão da spec.

## 1. Objetivo

Publicar de 1 a 3 posts por semana, sem intervenção, nos perfis do Google Meu Negócio (GMN) dos clientes. Cada post segue
o briefing de marca do perfil e é escrito para SEO local. Uma aba nova do sistema concentra tudo: liga/desliga por perfil,
briefing, pasta de fotos, fila e histórico. Perfis novos que aparecem na conta gerente entram sozinhos na aba, desligados.

Fora do escopo: Instagram, TikTok, YouTube, LinkedIn e Facebook (adiados pelo usuário); posts de Oferta e de Evento;
aceitar pelo sistema os convites de gerente; aviso por WhatsApp; aprovação humana dos posts.

## 2. Decisões

| Tema | Decisão |
|---|---|
| Conta gerente dos perfis | `andfalopes@gmail.com`: segunda conexão OAuth, separada da `contato@andrelopes.digital` (Drive/Agenda) |
| Projeto Google Cloud | `gestao-de-operacao-509002` (número 992656410238). Pedido de acesso básico à API do GBP enviado em 29/09/2026, caso **2-9335000041887** (7 a 10 dias úteis) |
| Aprovação dos posts | Nenhuma: tudo automático. Proteção por checagem automática (seção 6.3) |
| IA | OpenAI para texto e imagem. Modelos definidos por secret (`OPENAI_MODELO_TEXTO`, `OPENAI_MODELO_IMAGEM`) |
| Imagens | Pasta do Drive do perfil → fotos do próprio perfil no Google → imagem gerada pela OpenAI |
| Armazenamento de imagens | Cloudflare R2 (bucket público pelo `r2.dev`; troca para `midia.andrelopes.digital` se o DNS for para a Cloudflare). Nenhum arquivo no Supabase |
| Dados | Tabelas no Supabase (Lovable Cloud) do sistema. Sem Cloudflare D1 |
| Ligação com `clientes` | Opcional (`cliente_id` nulo permitido); um cliente pode ter vários perfis |
| Motor | `pg_cron` + edge functions, um post por chamada. Sem n8n e sem worker da VPS |
| Frequência | 1, 2 ou 3 posts/semana por perfil (padrão 2). Dias padrão: ter/qui (2) e seg/qua/sex (3); 1 post = qua; editáveis |
| Horário | Sorteado entre 9h e 11h (America/Sao_Paulo) |
| Tipo de post | `STANDARD` ("Novidade") com botão: Saiba mais (`LEARN_MORE` + URL com UTM), Ligar (`CALL`) ou Agendar (`BOOK` + URL) |
| Temas | Rodízio: serviço em destaque, dúvida frequente, bairro/região, diferencial, bastidores |

## 3. Dados (Supabase)

Migration nova, aplicada pelo editor SQL do Lovable (ver memória `supabase-migrations-manual`). RLS segue o padrão
atual do sistema.

### 3.1 `gmn_perfis`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `location_name` | text UNIQUE NULL | `locations/{id}` do Google; nulo em perfil criado à mão (seção 7.3) |
| `account_name` | text NULL | `accounts/{id}` usado nas chamadas v4 |
| `nome`, `endereco`, `categoria`, `site`, `telefone` | text | copiados do Google na sincronização |
| `cliente_id` | uuid NULL → `clientes(id)` ON DELETE SET NULL | |
| `ativo` | bool default false | o liga/desliga |
| `sem_acesso` | bool default false | perfil sumiu da conta gerente |
| `posts_semana` | smallint 1–3 default 2 | CHECK |
| `dias` | smallint[] | 0=dom … 6=sáb; preenchido pelo padrão da frequência |
| `cta_tipo` | text: `LEARN_MORE` \| `CALL` \| `BOOK` | default `LEARN_MORE` |
| `cta_url` | text NULL | obrigatório para LEARN_MORE e BOOK; a UTM é aplicada na publicação (`utm_source=google&utm_medium=organic&utm_campaign=gmn-post`) |
| `drive_pasta_url` | text NULL | link da pasta de fotos |
| `usa_ia_imagem` | bool default true | |
| `saude` | bool default false | liga as regras de CFM/CFO |
| `briefing` | jsonb default `{}` | ver 3.2 |
| `briefing_salvo_em` | timestamptz NULL | o perfil só pode ser ativado com este campo preenchido (CHECK `NOT ativo OR briefing_salvo_em IS NOT NULL`) |
| `sincronizado_em`, `created_at`, `updated_at` | timestamptz | |

### 3.2 Formato do `briefing`

```json
{
  "contexto": "quem é o negócio/especialista e sua história",
  "objetivo": "agendamentos | ligações | visitas | autoridade — em texto livre",
  "posicionamento": "como a marca quer ser vista",
  "publico": "público-alvo",
  "tom_de_voz": "…",
  "servicos": ["…"],
  "cidade": "…",
  "bairros": ["…"],
  "palavras_chave": ["…"],
  "diferenciais": ["…"],
  "termos_proibidos": ["…"]
}
```

### 3.3 `gmn_posts` (fila + histórico)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `perfil_id` | uuid → `gmn_perfis(id)` ON DELETE CASCADE | |
| `agendado_para` | timestamptz | |
| `dia` | date | UNIQUE (`perfil_id`, `dia`) quando `origem = 'agenda'`, para o planejamento não duplicar |
| `origem` | text: `agenda` \| `manual` \| `previa` | prévia nunca publica |
| `status` | text: `agendado` \| `gerando` \| `gerado` \| `publicado` \| `erro` \| `pulado` | `gerado` = prévia pronta |
| `tema` | text | |
| `palavras_chave` | text[] | usadas neste post |
| `texto` | text | |
| `imagem_origem` | text: `drive` \| `google` \| `ia` \| NULL | |
| `imagem_ref` | text | id do arquivo no Drive, nome da mídia no Google ou chave no R2 |
| `imagem_url` | text | URL pública usada na publicação |
| `google_post_name` | text NULL | `accounts/…/locations/…/localPosts/…` |
| `google_url` | text NULL | `searchUrl` devolvido pelo Google |
| `google_estado` | text NULL | `PROCESSING` \| `LIVE` \| `REJECTED` |
| `conferir_em` | timestamptz NULL | publicação + 1 h |
| `tentativas` | smallint default 0 | |
| `erro` | text NULL | motivo legível |
| `created_at`, `updated_at` | timestamptz | |

Índice parcial em (`status`, `agendado_para`) WHERE `status = 'agendado'`. Tabela incluída na publicação do realtime,
para a aba mostrar o status ao vivo.

### 3.4 Controle de uso de imagens

Tabela `gmn_imagens_uso` (`perfil_id`, `origem`, `ref`, `usado_em`), com PK (`perfil_id`, `origem`, `ref`). Guarda quando
cada foto do Drive ou do Google foi usada pela última vez. Não há cópia da lista de fotos: a lista é lida da fonte a cada post.

### 3.5 Conexão da andfalopes@

A conexão da andfalopes@ ganha uma linha própria em `google_oauth_tokens`, identificada por uma coluna nova
`finalidade text default 'geral'` (`'gmn'` para esta conta). A linha atual da contato@ continua como `geral`. Os escopos
pedidos na conexão GMN são `business.manage` e `drive.readonly`. As funções `google-oauth-exchange` e `google-token`
passam a aceitar `finalidade` (no `state` e como parâmetro); sem ela, o comportamento atual não muda. (Fase 2 — na Fase 1 a função usa a linha mais recente, que é a da contato@.)

## 4. Imagens no Cloudflare R2

- Bucket `gmn-midia` (criado em 29/09/2026 na conta Cloudflare da contato@, id `b4e84eaa8099c0e841a2eb35824027ca`,
  região ENAM), acesso público em `https://pub-ae3cb23015f64d9183be1720f7c52e2e.r2.dev`. A chave de API é criada na
  implementação e vai direto para os secrets, sem passar pelo repositório. Chave de API do R2 só com escrita nesse bucket. Secrets:
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE`.
- Chave do objeto: `{perfil_id}/{post_id}.{jpg|png}`. Só entram imagens de fato usadas em post: foto do Drive
  copiada ou imagem da IA. Fotos do perfil no Google usam a `googleUrl` do próprio Google, sem cópia.
- Upload feito pela edge function com assinatura S3 (SigV4). O front nunca recebe credenciais.
- Pré-requisito do usuário: ativar o R2 na conta Cloudflare (a Cloudflare exige cartão cadastrado).

## 5. Aba "Google Meu Negócio" (`/gmn`)

Item novo no grupo **Operação** de `src/lib/nav.tsx`. Palavras de busca: gmn, google meu negócio, perfil da empresa,
posts, seo local.

- **Topo:** status da conexão ("Conectado como andfalopes@gmail.com" / botão **Conectar** / aviso **Reconectar** quando o
  token falha), botão **Sincronizar agora**, alternância **Perfis** / **Fila da semana**.
- **Perfis:** uma linha por perfil com nome, cliente ligado, **liga/desliga**, posts por semana, próximo post e resultado
  do último. Filtros: ativos, desligados, com erro, saúde, sem acesso. Ao tentar ligar sem briefing salvo, o sistema
  explica o motivo e abre o briefing.
- **Fila da semana:** posts dos próximos 7 dias de todos os perfis, com status ao vivo (realtime).
- **Gaveta do perfil** (padrão da gaveta de Demandas), em abas:
  - **Briefing:** os campos de 3.2, a marcação "saúde", o cliente ligado (opcional) e o botão **Gerar com IA** (seção 6.5).
  - **Agenda:** posts por semana, dias, tipo de botão e URL, pasta do Drive e imagem de IA ligada ou desligada.
  - **Posts:** próximos e histórico, com texto, miniatura, origem da imagem, estado no Google, link e erro. Ações:
    **Gerar prévia**, **Publicar agora** e **Tentar de novo** (em `erro` ou `pulado`).

## 6. Motor (edge functions + pg_cron)

### 6.1 Crons

| Job | Quando (UTC) | O que faz |
|---|---|---|
| `gmn-sincronizar` | diário 08:30 (05:30 BRT) | chama a função `gmn-sincronizar` |
| `gmn-planejar-dia` | diário 09:00 (06:00 BRT) | função SQL `gmn_planejar_dia()`: para cada perfil `ativo AND NOT sem_acesso` cujo `dias` contém o dia da semana de hoje (BRT), insere um `gmn_posts` `origem='agenda'` com horário sorteado entre 9h e 11h BRT (`ON CONFLICT DO NOTHING`) |
| `gmn-processar` | a cada 10 min | chama a função `gmn-processar` |

As chamadas usam `net.http_post`, no padrão de `20260429023356_…sql`.

### 6.2 Função `gmn-processar`

1. **Pegar trabalho:** uma RPC `gmn_pegar_proximo()` faz `UPDATE … SET status='gerando' WHERE id = (SELECT … WHERE
   status='agendado' AND agendado_para <= now() ORDER BY agendado_para LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`. Sem
   post pendente, a função segue para a conferência (passo 7).
2. **Tema e palavras-chave:** o próximo tema do rodízio que não esteja entre os 3 últimos do perfil. Em seguida, até 2
   palavras-chave do briefing, as usadas há mais tempo (pelo histórico de `gmn_posts.palavras_chave`).
3. **Texto:** chamada à OpenAI com saída em JSON (`{ "texto": "…", "palavras_chave": ["…"] }`). O prompt leva o briefing,
   o tema, as palavras-chave, os textos dos últimos 10 posts do perfil e as regras:
   - português do Brasil, de 150 a 300 palavras, no máximo 1.500 caracteres;
   - palavra-chave e bairro ou cidade aparecem de forma natural, sem repetição forçada;
   - sem telefone, sem URL e sem hashtags em excesso;
   - se `saude`, as regras de 6.3.
4. **Checagem** (seção 6.3). Se reprovar, gera de novo uma vez com o motivo no prompt. Se reprovar outra vez, o post vira
   `pulado` com o motivo e entra um aviso no sino.
5. **Imagem:**
   1. Pasta do Drive do perfil (link → id da pasta): lista as imagens (JPG ou PNG, até 5 MB; WebP é ignorado) com o token GMN e, se
      falhar, com o token geral. Escolhe a usada há mais tempo (ou nunca usada) em `gmn_imagens_uso`, baixa e envia ao R2.
   2. Fotos do perfil no Google (`GET v4/{account}/{location}/media`): a usada há mais tempo; usa a `googleUrl`.
   3. Se `usa_ia_imagem`: gera a imagem com a OpenAI (foto realista do tipo de negócio e do tema, sem texto na arte) e
      envia ao R2.
   4. Sem nenhuma imagem: publica só o texto.
6. **Publicar** (exceto `origem='previa'`, que termina em `gerado`): `POST
   https://mybusiness.googleapis.com/v4/{account}/{location}/localPosts` com `languageCode: "pt-BR"`, `summary`,
   `topicType: "STANDARD"`, `callToAction` e `media: [{ mediaFormat: "PHOTO", sourceUrl }]`. Grava `google_post_name`,
   `google_url`, `google_estado`, `status='publicado'` e `conferir_em = now() + 1h`, e registra o uso da imagem.
7. **Conferência:** em toda chamada, até 5 posts `publicado` com `conferir_em <= now()` e `google_estado <> 'LIVE'`
   passam por `GET` no post. `REJECTED` → `status='erro'` + aviso. `LIVE` → apenas grava. `PROCESSING` → `conferir_em`
   mais 1 h, até 24 h depois da publicação.

Um post por chamada mantém cada execução bem abaixo do limite de tempo das edge functions. A prévia e o "Publicar agora"
chamam a mesma função com `post_id` explícito.

### 6.3 Checagem do texto (função pura, testada)

Reprova quando:
- o texto contém algum item de `termos_proibidos` (comparação sem acentos e sem diferenciar maiúsculas);
- o texto contém telefone (regex de números BR) ou URL/domínio;
- o texto tem menos de 100 ou mais de 1.500 caracteres;
- o perfil é `saude` e o texto casa com a lista fixa: promessa de resultado ("garantid", "100%", "resultado
  definitivo", "cura"), "antes e depois", preço/valor/desconto de procedimento (`R$`, "promoção"), superlativos
  ("o melhor", "o único", "número 1", "mais barato").

A lista fixa de saúde fica em `supabase/functions/gmn/regras.ts` e é testada com `node --test` (`src/lib/gmnRegras.test.ts`).

### 6.4 Erros e novas tentativas

- Erro 429 ou 5xx do Google ou da OpenAI, ou falha de rede: `tentativas++` e volta a `agendado` com `agendado_para = now() +
  30 min`, até 3 tentativas. Depois disso, `erro` + aviso.
- 401 do Google, ou refresh token inválido: o post volta a `agendado` sem contar tentativa, a conexão GMN é marcada como
  inválida e a aba mostra **Reconectar**. Todo o processamento para até reconectar.
- 400 ou 403 do Google (conteúdo recusado, perfil sem permissão): `erro` com a mensagem do Google.
- Avisos entram no sino de notificações que o sistema já tem.

### 6.5 Funções auxiliares

- **`gmn-sincronizar`:** lista as contas (`mybusinessaccountmanagement v1 accounts`) e as locations de cada conta
  (`mybusinessbusinessinformation v1 …/locations`, readMask `name,title,storefrontAddress,categories,websiteUri,
  phoneNumbers,profile`). Faz upsert por `location_name`:
  - perfis novos entram com `ativo=false` e geram um aviso ("Novo perfil do Google Meu Negócio: X — preencha o briefing
    para ativar");
  - perfis que não vieram na lista ficam `sem_acesso=true, ativo=false`;
  - perfis que voltaram ficam `sem_acesso=false` e continuam desligados.
- **`gmn-briefing-ia`:** recebe `perfil_id` e, opcionalmente, o id de um envio de briefing de Dados internos
  (`formularios_envios`; o `.txt` é lido no Drive como o visualizador de Dados internos já faz). Junta os dados do Google
  (descrição, categorias, site e endereço), o nicho do cliente ligado e o briefing escolhido, e devolve o JSON de 3.2 para
  o front preencher. Não salva nada: o usuário revisa e salva.

## 7. Entregas

### 7.1 Fase 1: não depende da aprovação do Google

- Migration (seção 3), R2 (seção 4) e secrets da OpenAI.
- Aba `/gmn` completa, com perfis criados **à mão** (nome + cliente opcional, `location_name` nulo) para testar.
- `gmn-briefing-ia` (sem dados do Google), **Gerar prévia** (texto + imagem do Drive ou da IA + R2) e checagem.
- **Nada vai ao ar na Fase 1** (decisão do usuário, 29/09/2026). A aba não é publicada no Lovable, os crons não são
  criados e nenhum perfil é ativado. Os testes rodam no dev server local; as tabelas novas existem no banco, mas ficam
  sem uso.
- **Perfil de teste: Brazilian Car** (Brasília, compra e venda de seminovos). Objetivo do cliente: fortalecer a
  percepção de "a melhor loja de Brasília para comprar e vender seminovos". Não é perfil de saúde, então o
  superlativo é permitido; a IA deve usá-lo com naturalidade, e não em todos os posts.

### 7.2 Fase 2: depois da aprovação (quota de 300 QPM no Cloud Console)

- Ativar no projeto as APIs My Business Account Management, Business Information e My Business (v4).
- Conexão GMN da andfalopes@ (3.5), `gmn-sincronizar`, publicação, conferência e crons.
- Só então a aba é publicada no Lovable e os perfis começam a ser ativados.
- Primeiro post real num perfil escolhido pelo usuário; depois os demais são ativados aos poucos.

### 7.3 Perfis manuais × sincronizados

Na primeira sincronização, o perfil manual cujo `nome` coincide com o de uma location (comparação normalizada) recebe o
`location_name`. Um perfil manual sem par mostra na gaveta um seletor para ligar a uma location sincronizada; ao ligar,
o briefing e o histórico ficam no manual e a linha sincronizada duplicada é removida.

## 8. Testes

- **`node --test`:** checagem do texto (6.3), rodízio de tema e palavras-chave, escolha da imagem usada há mais tempo, dias
  padrão por frequência, montagem da URL com UTM e extração do id da pasta a partir do link do Drive.
- **Fase 1, manual:** prévia em um perfil manual com pasta do Drive, em outro sem pasta (imagem da IA) e em um perfil
  `saude` com termo proibido no briefing (tem de pular ou regenerar).
- **Fase 2, manual:** sincronização, um post publicado de verdade, conferência do estado `LIVE`, erro de conexão simulado
  (reconectar) e desligar um perfil (não pode gerar mais posts).

## 9. Pontos a verificar na implementação

- **Status do app OAuth no Google Cloud:** se estiver em "Teste", os refresh tokens expiram em 7 dias e a andfalopes@
  precisa estar como usuária de teste. Nesse caso, publicar o app ("Em produção") antes da Fase 2. O aviso de app não
  verificado é aceitável para uso próprio.
- Confirmar os nomes atuais dos modelos da OpenAI no momento de configurar os secrets.
- Limites do Google para a imagem do post (mínimo de 250×250, JPG/PNG, até 5 MB) na conversão das fotos do Drive.

## 10. Custos estimados

25 perfis × 2 posts/semana ≈ 220 posts/mês.
- Texto: cerca de US$ 0,01 por post, até US$ 3/mês.
- Imagem de IA, só quando falta foto: US$ 0,04 a 0,07 cada, no pior caso cerca de US$ 15/mês.
- R2: grátis até 10 GB. Supabase e API do Google: sem custo adicional.
