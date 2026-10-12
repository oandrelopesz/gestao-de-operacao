# Conteúdo automático para o Instagram (posts semanais com aprovação): desenho

Data: 2026-10-12. Pedido do André: uma aba que gera sozinha os posts semanais dos clientes (carrossel ou estático), já diagramados com logo e design system, usando o cofre de clientes do Obsidian e IA; ele aprova ou pede mudança na própria aba, e o post aprovado entra no agendador do Instagram que já existe. Desenho aprovado no chat em 2026-10-12, em três partes.

## 1. Decisões do André

| Tema | Decisão |
|---|---|
| Figma | **Fora.** A API do Figma só lê; criar design exige plugin com o Figma aberto. A diagramação é feita pelo sistema |
| Pinterest | **Fora.** Sem busca aberta na API e com direito autoral nas imagens |
| Diagramação | **Moldes por cliente**: o Claude cria uma vez os moldes (HTML/CSS) a partir do design system e das logos; o André aprova; toda semana o sistema só preenche os moldes |
| IA | Claude Sonnet 5.5 para moldes, textos e ajustes; OpenAI (gpt-image-2.5, já configurada no GMN) para imagens geradas |
| HTML → imagem | Cloudflare Browser Rendering (API REST de screenshot), JPG 1080x1350 |
| Banco de imagens | Pasta do Google Drive por cliente; as subpastas são contextos (ex.: "Espaço", "Eventos", "Equipe") |
| Pauta | IA escolhe os temas dentro de **pilares fixos** por cliente, em rodízio, sem repetir o que já saiu |
| Kit da marca na aba | Logos (várias versões), tom de voz, design system e link do Drive, como no GMN |
| Agenda | Por cliente: dias, horário e formato de cada dia (carrossel ou estático), configurados uma vez; a semana é gerada por ela. A agenda muda quando o André quiser, e o dia, o horário e o formato de cada post também podem ser trocados antes de aprovar |
| Aprovação | Visão da semana no sistema: o André abre o post, vê as lâminas e a legenda e dá ok. Nada vai ao ar sem aprovação. Aprovar cria um `ig_posts` agendado; o relógio atual publica |

## 2. Custo estimado (preços de 2026-10-12)

Base: 10 clientes, 3 posts por semana cada (2 carrosséis e 1 estático), cerca de 130 posts por mês, dólar a cerca de R$ 5,50.

| Item | Mês |
|---|---|
| Textos (Sonnet 5.5, US$ 2 / US$ 10 por 1M tokens) | ~US$ 6,50 |
| Imagens geradas (gpt-image-2.5 média, ~US$ 0,013 cada, só quando o Drive não serve) | ~US$ 3,50 |
| Cloudflare (10 min de navegador por dia no plano grátis; ~8 min por semana de uso) | US$ 0 |
| **Total** | **~US$ 10 (~R$ 55)** |
| Moldes (uma vez por cliente) | ~US$ 0,50 por cliente |

Cresce proporcional ao volume (30 clientes: ~R$ 165 por mês). Pedidos de mudança custam centavos.

## 3. A aba "Conteúdo"

Rota `/conteudo`, menu Operação, ao lado de "Instagram". Três áreas:

### 3.1 Clientes

Só os clientes ligados. Botão "Ligar cliente" escolhe o cliente do sistema (`clientes`), a pasta dele no cofre (lista vinda da sincronização) e a conta do Instagram (`ig_contas`). Cada cliente abre uma gaveta com:

- **Kit da marca**
  - **Logos:** principal, ícone, clara (para fundo escuro) e escura (para fundo claro); pelo menos uma. Qualquer formato vira PNG no navegador (reaproveitar `src/lib/gmnImagem.ts`). Guardadas no R2 em `instagram/conteudo/logos/`. A logo é sempre colada como está; a IA nunca a desenha.
  - **Tom de voz** e **Design system:** campos de texto; cada um com "Puxar do cofre" (lista os arquivos do cliente cujo nome tem "Design System" ou "tom de voz"/"tom-de-voz").
  - **Fontes:** nome de fonte do Google Fonts, ou arquivo de fonte enviado (R2 `instagram/conteudo/fontes/`).
  - **Saúde:** liga as regras do CFM/CFO no texto (reaproveitar a checagem de termos de `supabase/functions/gmn/regras.ts`).
  - **IA pode gerar pessoas:** desligado por padrão (mesma regra do GMN).
  - **Drive:** link da pasta-mãe; "Ler pastas" lista as subpastas (qualquer profundidade, nome como caminho "Pai / Filho"; imagens soltas na raiz viram "Geral") com a quantidade de imagens.
- **Pilares e agenda:** pilares (nome e descrição curta); dias da semana com horário (de 30 em 30 min) e formato do dia (carrossel ou estático). Carrossel: capa, de 3 a 6 lâminas de conteúdo (a IA decide) e CTA.
- **Moldes:** "Criar moldes" gera capa, texto, foto, CTA e estático, mostrados com texto de exemplo. Cada molde: Aprovar ou Pedir mudança. Sem os cinco aprovados, o cliente não gera posts e a gaveta diz o que falta.
- **Cofre:** "Cofre sincronizado há X" (última sincronização das notas do cliente).

### 3.2 Semana (aprovação)

Visão da semana, de segunda a domingo, com setas para a semana anterior e a seguinte e filtro por cliente. Cada dia mostra os posts dele: miniatura da capa, cliente, formato e situação. Botões no topo: **Gerar a semana** (para todos os clientes ligados ou só o filtrado; não recria dia da agenda que já tem post) e **Novo post** (cliente, dia, horário e formato, fora da agenda).

Abrir um post mostra as lâminas em tamanho real (passar uma a uma), a legenda, o dia e o horário, o pilar e o tema. Ações:

- **Aprovar:** cria o `ig_posts` (seção 5.5). Se o horário já passou, pede um novo.
- **Trocar dia e horário:** só muda a data do post.
- **Trocar formato:** carrossel para estático ou o contrário; o post é refeito no outro formato, mantendo o tema.
- **Pedir mudança:** texto livre. A IA devolve o que trocar e só isso é refeito (seção 5.4). Se a mudança mexeu no layout, aparece a caixa "Usar este ajuste nos próximos posts" (salva no molde do cliente).
- **Editar à mão:** texto de uma lâmina, legenda, ou trocar a foto por um arquivo enviado (escolher numa lista do Drive fica para a fase 2; até lá, "Pedir mudança" troca a foto pela IA). Refaz só a lâmina, sem IA.
- **Descartar.**
- **Aprovar todos** (fase 2), com confirmação.

Posts em andamento aparecem com a etapa ("escrevendo", "buscando imagens", "montando"); com erro, mostram o motivo e "Tentar de novo".

### 3.3 Histórico (fase 2)

Aprovados e descartados, com o link para o post agendado ou publicado.

## 4. Dados

Migration nova. `conteudo_clientes` e `conteudo_posts` com RLS aberta como o resto do sistema; `conteudo_posts` no realtime. `conteudo_cofre` com RLS ligada e **sem política** (só a função lê, com a chave de serviço).

**`conteudo_clientes`**
| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `cliente_id` | uuid único | `clientes.id` |
| `pasta_cofre` | text | nome da pasta em `01 Clientes/` |
| `ig_conta_id` | text | `ig_contas.id` |
| `ativo` | boolean | padrão falso; liga a geração semanal (fase 2) |
| `logos` | jsonb | `[{variante, chave, largura, altura}]` |
| `tom_de_voz`, `design_system` | text | |
| `fontes` | jsonb | `[{familia, origem: "google" \| "arquivo", chave?}]` |
| `saude`, `ia_pode_pessoas` | boolean | padrão falso |
| `drive_url` | text | |
| `drive_pastas` | jsonb | `[{id, caminho, quantidade}]`, cache da última leitura |
| `pilares` | jsonb | `[{nome, descricao}]` |
| `agenda` | jsonb | `[{dia, hora, formato}]` |
| `moldes` | jsonb | `{capa, texto, foto, cta, estatico}`: cada um `{html, campos, versao, aprovado_em}` |
| `created_at`, `updated_at` | timestamptz | |

**`conteudo_posts`**
| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `conteudo_cliente_id` | uuid | |
| `formato` | text | `carrossel` \| `estatico` |
| `pilar`, `tema` | text | |
| `agendado_para` | timestamptz | da agenda, ou o escolhido no "Novo post" |
| `origem_data` | date | dia da agenda que gerou o post (nulo no "Novo post"); único com o cliente, para "Gerar a semana" não recriar um dia, mesmo que o post tenha sido descartado ou mudado de dia |
| `laminas` | jsonb | `[{molde, campos, imagem?: {descricao, pasta_id?, pendente?, origem?: "drive" \| "ia" \| "envio", drive_id?, chave?}, ajuste_css?, jpg_chave}]`; `imagem.pendente` = falta buscar a imagem; `jpg_chave` nulo = falta montar a lâmina |
| `legenda` | text | |
| `pedidos` | jsonb | `[{texto, em, resultado}]` |
| `status` | text | `texto` (falta escrever), `imagens`, `montando`, `aguardando`, `aprovado`, `descartado`, `erro` |
| `processando_desde` | timestamptz | trava da etapa: nulo = livre; uma execução só pega o post livre ou travado há mais de 10 min |
| `erro_etapa` | text | etapa em que parou, para o "Tentar de novo" voltar a ela |
| `tentativas` | integer | |
| `erro`, `aviso` | text | |
| `ig_post_id` | uuid único | `ig_posts.id` depois de aprovado |
| `created_at`, `updated_at` | timestamptz | |

**`conteudo_cofre`**: `pasta`, `caminho` (relativo à pasta do cliente), `hash`, `conteudo`, `atualizado_em`; PK (`pasta`, `caminho`). Mais uma linha especial com a lista de pastas.

R2: tudo no bucket de arquivos do sistema, dentro do módulo `instagram` que já existe (a função `r2` e `src/lib/r2Chaves.ts` não mudam): `instagram/conteudo/logos/`, `fontes/`, `fotos/` (copiadas do Drive), `ia/` (geradas) e `posts/<post>/<n>-<carimbo>.jpg` (lâminas finais, onde o agendador já as encontra).

## 5. Motor (edge function `conteudo`)

Mesmo padrão da função `instagram`: ações por POST, relógio do pg_cron, cada etapa numa chamada, sempre `UPDATE ... WHERE status = <esperado>`.

### 5.1 Relógios
- "Gerar a semana" (ação `semana`, fase 1): cria um `conteudo_posts` em `texto` para cada dia da agenda da semana escolhida, em cada cliente ligado com os moldes do formato aprovados; `origem_data` único impede recriar um dia. "Novo post" é gravado direto pela tela, em `texto`.
- `conteudo-semana` (fase 2): domingo às 06:00 de Brasília (`0 9 * * 0` UTC), a mesma geração para a semana seguinte, só nos clientes `ativo`.
- `conteudo-passo`: a cada minuto, **só se houver** post livre em `texto`, `imagens` ou `montando`. Pega até 3 posts e avança cada um uma etapa, em paralelo.

### 5.2 Etapas
1. **Texto** (`texto → imagens`): Claude recebe a nota central, os documentos `.md` e o Log recente do cofre (até 100 mil caracteres, nessa ordem), o tom de voz, o pilar da vez (rodízio pelo menos usado), o tema já escolhido (troca de formato) ou os temas das últimas 8 semanas (para não repetir), os campos e limites de caracteres de cada molde, as subpastas do Drive e as regras de saúde quando ligadas. Devolve, em JSON estruturado, o tema, as lâminas (molde e campos; para lâmina com foto, a descrição da imagem e a subpasta escolhida ou nenhuma) e a legenda. O código confere os limites e, na saúde, os termos; se reprovar, pede de novo uma vez com os motivos; se continuar, erro.
2. **Imagens** (`imagens → montando`): para cada lâmina com `imagem.pendente`, o sistema pega até 3 fotos da subpasta escolhida, as menos usadas pelo cliente (`ordemDeTentativa` do GMN), baixa a miniatura grande do Google e o Claude confere por visão qual combina com a descrição. Foto aceita vai para o R2 (`instagram/conteudo/fotos/`). Sem foto que sirva: imagem gerada pela OpenAI em retrato (sem texto; sem pessoas, a menos que o kit permita), em `instagram/conteudo/ia/`. Se a geração falhar, a lâmina troca para o molde de texto e o post ganha `aviso`. Reaproveitar `supabase/functions/gmn/google.ts`, `openai.ts` e `regras.ts`.
3. **Montagem** (`montando → aguardando`): só as lâminas sem `jpg_chave`. O código preenche o molde (texto escapado; imagens, logos e fontes embutidas como `data:` lidas do R2, sem depender de CORS; Google Fonts por `<link>`), aplica o `ajuste_css` da lâmina se houver, espera as fontes carregarem, manda o HTML ao Cloudflare (viewport 1080x1350, JPEG qualidade 90) e guarda o JPG no R2.

### 5.3 Moldes
Ação `moldes`: Claude recebe o design system, as logos (variantes e proporções) e as fontes e devolve, para cada tipo, um documento HTML/CSS de 1080x1350 com campos marcados (`{{titulo}}`, `{{texto}}`, `{{foto}}`, `{{logo_clara}}` etc.) e a lista `campos` (`nome`, `tipo` texto/imagem/logo, `max` caracteres). O texto se ajusta com CSS (tamanho por faixa e corte de linhas) e o limite garante que cabe. A prévia usa o texto de exemplo que o Claude devolve em cada campo e passa pelo mesmo caminho de montagem. Um molde por chamada (a tela chama os cinco em sequência, mostrando o progresso), para cada chamada caber no tempo da função; os moldes já criados vão junto, para manter o mesmo estilo. Ação `molde_ajustar`: pedido de mudança num molde gera nova `versao`, que precisa de nova aprovação.

### 5.4 Pedir mudança
Ação `ajustar` (só com o post em `aguardando`, na hora): Claude recebe o post e o pedido e devolve uma lista de alterações: `{alvo: "campo", lamina, campo, valor}`, `{alvo: "imagem", lamina, descricao, pasta}` (busca imagem só daquela lâmina, pela regra da etapa 2), `{alvo: "legenda", valor}` ou `{alvo: "layout", lamina, ajuste_css}`. As alterações são aplicadas, as lâminas tocadas perdem o `jpg_chave` e o post vai para `imagens` (se alguma imagem mudou) ou `montando`. O pedido fica em `pedidos`.

Sem IA, gravado direto pela tela (RLS aberta, sempre com `WHERE status = 'aguardando'`): editar o texto de uma lâmina ou a legenda (lâmina tocada perde o `jpg_chave` e o post vai para `montando`; só a legenda não remonta nada), trocar a foto por um arquivo enviado (vai ao R2 pelo navegador), trocar dia e horário, trocar formato (`laminas` vazio e `status = 'texto'`, mantendo o tema), descartar e "Tentar de novo" (`status = erro_etapa`). Escolher a foto numa lista do Drive fica para depois.

### 5.5 Aprovar
Ação `aprovar`, pela função SQL `conteudo_aprovar(post, agendado_para)` (uma transação): `UPDATE conteudo_posts SET status = 'aprovado' WHERE id = ? AND status = 'aguardando'` e insere o `ig_posts` (`conta_id` do cliente, `rede` instagram, `tipo` `foto` para estático e `carrossel` para carrossel, `midias` com as chaves dos JPGs no mesmo formato que `CriarPost.tsx` grava, `legenda`, `agendado_para`). `ig_post_id` único impede dois agendamentos. O relógio `instagram-passo` publica.

### 5.6 IA
- Claude: SDK oficial `@anthropic-ai/sdk` no Deno, modelo pelo secret `CLAUDE_MODELO` (padrão `claude-sonnet-5-5`), saída estruturada (`output_config.format`), fallback do servidor ligado (`fallbacks: "default"`), contexto do cliente em cache (prompt caching) entre os posts da mesma semana.
- OpenAI: `OPENAI_MODELO_IMAGEM` já existente, qualidade média, retrato.

## 6. Sincronização do cofre

- Script `tools/cofre-sync/sync.mjs`, rodado pelo Agendador de Tarefas do Windows de hora em hora e ao entrar no Windows (tarefa "Gestao - Sincronizar cofre").
- Cofre: `C:\Users\Andre\06. Obsidian Clientes\Clientes`. Só leitura; o script nunca escreve no cofre.
- Fluxo sem estado local: pede à função (`cofre_hashes`) os hashes guardados e as pastas ligadas; envia (`cofre_sync`) a lista de pastas e, das pastas ligadas, só o que mudou: nota central, `Documentos/*.md` e um arquivo derivado "Log (60 dias)" com as entradas dos últimos 60 dias. Arquivo apagado no cofre é removido da cópia. Reuniões, relatórios, anexos e campanhas não vão.
- Autenticação: cabeçalho `x-cofre-key` (secret `COFRE_SYNC_KEY`); a chave local fica em `%USERPROFILE%\.gestao\`.
- "Puxar do cofre" (ação `cofre_ler`) só lista e devolve arquivos do cliente cujo nome tem "Design System" ou "tom de voz"/"tom-de-voz"; o resto da cópia só é lido pela própria função.
- PC desligado: o sistema usa a última cópia.

## 7. Erros

- Etapa que falha: até 2 novas tentativas; depois `erro` com motivo em português, `erro_etapa` e "Tentar de novo".
- Post travado há mais de 10 min (`processando_desde`, execução cortada no meio) é pego de novo na próxima passada.
- Ações que gastam IA (`molde`, `molde_ajustar`, `ajustar`, `semana`, `drive_pastas`) exigem o mesmo acesso da função `gmn` (login Google ou chave do swipe); `passo` fica aberta, como a do Instagram; as do cofre exigem `x-cofre-key`.
- Cloudflare no limite do dia (429): o post fica em `montando` com `aviso` e tenta de novo depois.
- Drive inacessível: imagens pela IA, com aviso. Cofre nunca sincronizado ou moldes não aprovados: o cliente não gera e a gaveta diz o que falta.
- Recusa ou erro do Claude: `erro` com mensagem fixa por tipo.
- Prazos por chamada externa (Claude, OpenAI, Drive, Cloudflare, R2), para nenhuma execução passar do limite da função.

## 8. Testes

- Unidade (regras puras, sem rede): preencher molde (escape, campos, ajuste), limites de caracteres, rodízio de pilares e temas, agenda para datas da semana no horário de Brasília, transições de status, escolha das fotos menos usadas, montagem do `ig_posts`, recorte do Log de 60 dias e diferença de hashes do script.
- Tela no servidor local com a função simulada, em 1440 e 390 px.
- Real com a **Kobe Growth** (design system no cofre, pasta no Drive, conta @kobegrowth autorizada para testes): moldes, agenda com um carrossel e um estático, "Gerar a semana", um pedido de mudança, uma troca de formato, aprovar um carrossel, publicação pelo relógio e exclusão depois.

## 9. Fases

- **Fase 1:** migration, script do cofre, kit da marca, pilares e agenda, moldes (criar, aprovar, pedir mudança), "Gerar a semana" e "Novo post", visão da semana com aprovar, pedir mudança, editar à mão, trocar dia e formato, descartar; relógio `conteudo-passo`. Pronta quando o teste real da Kobe passar.
- **Fase 2:** relógio `conteudo-semana` (geração sozinha no domingo), contador de posts aguardando no menu, "Aprovar todos", histórico, escolher foto do Drive numa lista.

## 10. Pré-requisitos

Secrets novos no Supabase: `ANTHROPIC_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_BROWSER_TOKEN` (token com permissão de Browser Rendering), `COFRE_SYNC_KEY`. O Claude cria e guarda (autorização permanente do André). OpenAI e R2 já existem.

## 11. Fora, de propósito

Stories, reels, Facebook, Figma, Pinterest, fotos do site do cliente, aviso no WhatsApp, enviar reuniões do cofre. Dá para entrar depois.
