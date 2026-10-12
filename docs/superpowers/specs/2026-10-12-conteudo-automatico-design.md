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
| Aprovação | Nada vai ao ar sem aprovação. Aprovar cria um `ig_posts` agendado; o relógio atual publica |

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
  - **Logos:** principal, ícone, clara (para fundo escuro) e escura (para fundo claro); pelo menos uma. Qualquer formato vira PNG no navegador (reaproveitar `src/lib/gmnImagem.ts`). Guardadas no R2 em `conteudo/logos/`. A logo é sempre colada como está; a IA nunca a desenha.
  - **Tom de voz** e **Design system:** campos de texto; cada um com "Puxar do cofre" (lista os arquivos do cliente cujo nome tem "Design System" ou "tom de voz"/"tom-de-voz").
  - **Fontes:** nome de fonte do Google Fonts, ou arquivo de fonte enviado (R2 `conteudo/fontes/`).
  - **Saúde:** liga as regras do CFM/CFO no texto (reaproveitar a checagem de termos de `supabase/functions/gmn/regras.ts`).
  - **IA pode gerar pessoas:** desligado por padrão (mesma regra do GMN).
  - **Drive:** link da pasta-mãe; "Ler pastas" lista as subpastas (qualquer profundidade, nome como caminho "Pai / Filho"; imagens soltas na raiz viram "Geral") com a quantidade de imagens.
- **Pilares e agenda:** pilares (nome e descrição curta); dias da semana com horário (de 30 em 30 min) e formato do dia (carrossel ou estático). Carrossel: capa, de 3 a 6 lâminas de conteúdo (a IA decide) e CTA.
- **Moldes:** "Criar moldes" gera capa, texto, foto, CTA e estático, mostrados com texto de exemplo. Cada molde: Aprovar ou Pedir mudança. Sem os cinco aprovados, o cliente não gera posts e a gaveta diz o que falta.
- **Cofre:** "Cofre sincronizado há X" (última sincronização das notas do cliente).

### 3.2 Aprovação

Fila dos posts em `aguardando`, um card por post: lâminas em tamanho real (passar uma a uma), legenda, dia e horário, pilar e tema. Ações:

- **Aprovar:** cria o `ig_posts` (seção 5.5). Dia e horário podem ser mudados antes de aprovar; se o horário já passou, pede um novo.
- **Pedir mudança:** texto livre. A IA devolve o que trocar e só isso é refeito (seção 5.4). Se a mudança mexeu no layout, aparece a caixa "Usar este ajuste nos próximos posts" (salva no molde do cliente).
- **Editar à mão:** texto de uma lâmina, legenda, ou trocar a foto por outra da subpasta do Drive (miniaturas) ou por um arquivo enviado. Refaz só a lâmina, sem IA.
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
| `agendado_para` | timestamptz | da agenda; no "Gerar post agora", o próximo horário da agenda ou, sem agenda, o dia seguinte às 09:00 |
| `laminas` | jsonb | `[{molde, campos, imagem: {origem: "drive" \| "ia" \| "envio", drive_id?, chave, descricao}, ajuste_css?, jpg_chave}]` |
| `legenda` | text | |
| `pedidos` | jsonb | `[{texto, em, resultado}]` |
| `status` | text | `na_fila`, `texto`, `imagens`, `montando`, `aguardando`, `ajustando`, `aprovado`, `descartado`, `erro` |
| `etapa_em` | timestamptz | quando entrou no status atual (detecta post parado) |
| `tentativas` | integer | |
| `erro`, `aviso` | text | |
| `ig_post_id` | uuid único | `ig_posts.id` depois de aprovado |
| `created_at`, `updated_at` | timestamptz | |

**`conteudo_cofre`**: `pasta`, `caminho` (relativo à pasta do cliente), `hash`, `conteudo`, `atualizado_em`; PK (`pasta`, `caminho`). Mais uma linha especial com a lista de pastas.

R2: novo módulo `conteudo` em `MODULOS` de `supabase/functions/r2/index.ts` e em `src/lib/r2Chaves.ts` (logos, fontes, fotos copiadas do Drive, imagens geradas). Os JPGs finais vão em `instagram/conteudo/<post>/<n>-<versao>.jpg`, onde o agendador já os encontra.

## 5. Motor (edge function `conteudo`)

Mesmo padrão da função `instagram`: ações por POST, relógio do pg_cron, cada etapa numa chamada, sempre `UPDATE ... WHERE status = <esperado>`.

### 5.1 Relógios
- `conteudo-semana` (fase 2): domingo às 06:00 de Brasília (`0 9 * * 0` UTC). Cria um `conteudo_posts` em `na_fila` para cada dia da agenda da semana seguinte, em cada cliente `ativo` com os cinco moldes aprovados.
- `conteudo-passo`: a cada minuto, **só se houver** post em `na_fila`, `texto`, `imagens`, `montando` ou `ajustando`. Avança um lote pequeno de posts uma etapa cada.
- "Gerar post agora" (fase 1) cria o post em `na_fila` direto da tela.

### 5.2 Etapas
1. **Texto** (`na_fila → texto → imagens`): Claude recebe a nota central, os documentos `.md` e o Log recente do cofre, o tom de voz, o pilar da vez (rodízio pelo menos usado), os temas das últimas 8 semanas (para não repetir), os campos e limites de caracteres de cada molde, e as regras de saúde quando ligadas. Devolve, em JSON estruturado, o tema, as lâminas (molde e campos) com a descrição da imagem de cada uma e a legenda. O código confere os limites; se estourar, pede uma versão mais curta uma vez; se continuar, erro.
2. **Imagens** (`imagens → montando`): para cada lâmina com imagem, Claude escolhe a subpasta do Drive pelo nome; o sistema pega até 3 fotos menos usadas nas últimas 8 semanas e o Claude confere por visão se combina com a descrição. Foto aceita é copiada para o R2 (`conteudo/fotos/`). Sem foto que sirva: imagem gerada pela OpenAI (sem texto; sem pessoas, a menos que o kit permita), em `conteudo/ia/`. Se a geração falhar, a lâmina troca para o molde de texto e o post ganha `aviso`. Reaproveitar a leitura do Drive e a chamada de imagem de `supabase/functions/gmn/`.
3. **Montagem** (`montando → aguardando`): o código preenche o molde (texto escapado; imagens, logos e fontes por endereço do R2 via `functions/v1/r2?c=`), aplica o `ajuste_css` da lâmina se houver, manda o HTML ao Cloudflare (viewport 1080x1350, JPEG qualidade 90) e guarda o JPG no R2.

### 5.3 Moldes
Ação `moldes`: Claude recebe o design system, as logos (variantes e proporções) e as fontes e devolve, para cada tipo, um documento HTML/CSS de 1080x1350 com campos marcados (`{{titulo}}`, `{{texto}}`, `{{foto}}`, `{{logo_clara}}` etc.) e a lista `campos` (`nome`, `tipo` texto/imagem/logo, `max` caracteres). O texto se ajusta com CSS (tamanho por faixa e corte de linhas) e o limite garante que cabe. A prévia usa texto de exemplo e passa pelo mesmo caminho de montagem. Pedir mudança num molde gera nova `versao`, que precisa de nova aprovação.

### 5.4 Pedir mudança
Ação `ajustar` (`aguardando → ajustando → montando`): Claude recebe o post e o pedido e devolve uma lista de alterações: `{alvo: "campo", lamina, campo, valor}`, `{alvo: "imagem", lamina, descricao}` (busca imagem só daquela lâmina, pela mesma regra da etapa 2), `{alvo: "legenda", valor}` ou `{alvo: "layout", lamina, ajuste_css}`. A passada do relógio em `ajustando` aplica as alterações e busca as imagens pedidas; depois só as lâminas tocadas são remontadas. O pedido fica em `pedidos`.

Ação `editar` (edição à mão, sem IA): grava campos, legenda ou a imagem escolhida (foto do Drive ou arquivo enviado) e manda só as lâminas tocadas para `montando`.

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

- Etapa que falha: até 2 novas tentativas; depois `erro` com motivo em português e "Tentar de novo".
- Post parado há mais de 10 min numa etapa intermediária (`etapa_em`) volta para a mesma etapa na próxima passada.
- Cloudflare no limite do dia (429): o post fica em `montando` com `aviso` e tenta de novo depois.
- Drive inacessível: imagens pela IA, com aviso. Cofre nunca sincronizado ou moldes não aprovados: o cliente não gera e a gaveta diz o que falta.
- Recusa ou erro do Claude: `erro` com mensagem fixa por tipo.
- Prazos por chamada externa (Claude, OpenAI, Drive, Cloudflare, R2), para nenhuma execução passar do limite da função.

## 8. Testes

- Unidade (regras puras, sem rede): preencher molde (escape, campos, ajuste), limites de caracteres, rodízio de pilares e temas, agenda para datas da semana no horário de Brasília, transições de status, escolha das fotos menos usadas, montagem do `ig_posts`, recorte do Log de 60 dias e diferença de hashes do script.
- Tela no servidor local com a função simulada, em 1440 e 390 px.
- Real com a **Kobe Growth** (design system no cofre, pasta no Drive, conta @kobegrowth autorizada para testes): moldes, um carrossel e um estático pelo "Gerar post agora", um pedido de mudança, aprovar um carrossel, publicação pelo relógio e exclusão depois.

## 9. Fases

- **Fase 1:** migration, módulo `conteudo` no R2, script do cofre, kit da marca, moldes (criar, aprovar, pedir mudança), "Gerar post agora", fila de aprovação (aprovar, pedir mudança, editar à mão, descartar), relógio `conteudo-passo`. Pronta quando o teste real da Kobe passar.
- **Fase 2:** relógio `conteudo-semana`, pilares e agenda valendo, contador de posts aguardando no menu, "Aprovar todos", histórico.

## 10. Pré-requisitos

Secrets novos no Supabase: `ANTHROPIC_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_BROWSER_TOKEN` (token com permissão de Browser Rendering), `COFRE_SYNC_KEY`. O Claude cria e guarda (autorização permanente do André). OpenAI e R2 já existem.

## 11. Fora, de propósito

Stories, reels, Facebook, Figma, Pinterest, fotos do site do cliente, aviso no WhatsApp, enviar reuniões do cofre. Dá para entrar depois.
