# Agendador de posts do Instagram (etapa 1) — desenho

Data: 2026-10-02. Pedido do André: uma aba "cópia" da área de postagens do Business Suite para publicar e agendar posts no Instagram dos clientes. Desenho aprovado no chat em 2026-10-02.

## 1. Escopo

**Etapa 1 (esta spec):** Instagram dos clientes; foto, carrossel e reels; legenda; localização; publicar agora ou agendar; lista de posts com situação; prévia no estilo do celular.

**Fora (próximas etapas):** editor de formato (cortar e redimensionar; etapa 2); Facebook, stories, primeiro comentário e calendário (etapa 3); marcar pessoas, colaboradores, busca livre de localização.

**Decisões do André:**
- Caminho: API oficial da Meta por um app do André dentro da BM dele, com um **usuário do sistema** e token "Nunca expira". Todas as contas de clientes estão como parceiros nessa BM.
- O Claude **nunca acessa a Meta** (regra global): o André cria o app e o token guiado por prints; quem chama a API é só o sistema.
- Aba **"Instagram"** no menu Operação, **logo acima de "Google Meu Negócio"**.
- **Sem chave de publicação**: publica de qualquer aparelho, como o resto do sistema. A segurança do projeto inteiro será feita depois, de uma vez.
- O Facebook fica para a etapa 3.

## 2. Pré-requisito (André, guiado por prints)

1. App da Meta (tipo Empresa) criado em nome da BM.
2. Usuário do sistema (admin) na BM, com o app e com as contas de Instagram e páginas do Facebook dos clientes atribuídas.
3. Token gerado pelo usuário do sistema, **"Nunca expira"**, com as permissões: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`.
4. Token cadastrado como segredo `META_TOKEN` no Lovable (nunca no chat, no código ou no cofre).
5. Recomendado: 2 admins na BM e no app (se a conta pessoal do André cair, alguém ainda consegue mexer na BM).

**Prova antes do resto:** a primeira entrega é só a função e o botão "Sincronizar contas". O André clica e manda o print; se as contas dos **parceiros** aparecerem, segue. Se a Meta exigir revisão do app, para tudo e avisa.

## 3. Dados

Migration `ig_contas` e `ig_posts`, RLS aberta como o resto do sistema (`FOR ALL USING (true) WITH CHECK (true)`), `ig_posts` no realtime.

**`ig_contas`**
| Coluna | Tipo | Nota |
|---|---|---|
| `id` | text PK | id da conta de Instagram na Meta |
| `usuario` | text | @ sem a arroba |
| `nome` | text | |
| `foto_url` | text | pode expirar; só para mostrar |
| `pagina_id` | text | página do Facebook ligada (serve de localização) |
| `pagina_tem_local` | boolean | a página tem endereço (pode ser usada como localização) |
| `cliente_id` | uuid null → `clientes(id)` ON DELETE SET NULL | escolhido na tela |
| `ativa` | boolean default true | some da sincronização = `false` (nunca apaga) |
| `sincronizada_em` | timestamptz | |

**`ig_posts`**
| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `conta_id` | text → `ig_contas(id)` | |
| `tipo` | text check `foto`, `carrossel`, `reels` | |
| `midias` | jsonb | `[{chave, tipo: "imagem"|"video", largura, altura, duracao?}]`, em ordem; arquivos no R2 |
| `legenda` | text | até 2.200 caracteres, até 30 hashtags |
| `local_id` | text null | id da página do lugar |
| `local_nome` | text null | só para mostrar |
| `reels_no_feed` | boolean default true | |
| `capa_ms` | int null | quadro da capa do reels, em milissegundos |
| `agendado_para` | timestamptz | "agora" = horário do clique |
| `status` | text check `agendado`, `enviando`, `processando`, `publicando`, `publicado`, `erro`, `cancelado` | |
| `containers` | jsonb null | ids dos contêineres na Meta (filhos e principal) |
| `media_id`, `permalink` | text null | post publicado |
| `erro` | text null | mensagem em português |
| `tentativas` | int default 0 | |
| `publicado_em`, `created_at`, `updated_at` | timestamptz | |

**Arquivos:** módulo novo `instagram` no R2 (`MODULOS_R2` e na função `r2`), chave `instagram/<uuid>.<ext>`. Envio pelo `r2` existente (URL assinada de PUT).

## 4. Publicação (função `instagram` + relógio)

**Função `instagram`** (Deno, segredo `META_TOKEN`, Graph API numa constante de versão):
- `POST {acao: "sincronizar"}`: lê da Meta as páginas e contas de Instagram que o token enxerga e grava em `ig_contas` (novas entram, as que sumiram ficam `ativa = false`).
- `POST {acao: "limite", conta}`: posts por API usados nas últimas 24 h e o teto da conta.
- `POST {acao: "passo"}`: chamado pelo relógio a cada minuto (e pelo "Publicar agora" para não esperar). Para cada post da hora, avança **uma** etapa:
  1. `agendado` → **enviando**: pede ao `r2` um link de leitura (1 h) de cada mídia e cria os contêineres na Meta (foto: `image_url`; reels: `media_type=REELS`, `video_url`, `share_to_feed`, `thumb_offset`; carrossel: um filho por item com `is_carousel_item`, depois o principal `CAROUSEL` com `children`). Legenda e `location_id` no principal. Vai para `processando`.
  2. `processando`: consulta o `status_code` de cada contêiner. Todos `FINISHED` → `publicando`. `ERROR`/`EXPIRED` → `erro`. Senão, espera o próximo minuto (desiste com erro depois de 30 min).
  3. `publicando` → `media_publish` → guarda `media_id` e `permalink`, `status = publicado`.
- **Nunca publicar duas vezes:** cada etapa só anda se o `status` no banco ainda for o esperado (`UPDATE ... WHERE id = ? AND status = ?`); o `media_publish` só roda uma vez por post.
- Erros da Meta viram mensagem em português (formato não aceito, proporção, link do arquivo não abriu, limite diário, token inválido), com o texto original junto; "Tentar de novo" volta o post para `agendado`.

**Relógio:** `pg_cron` a cada minuto chamando a função por `net.http_post` (padrão já usado no banco de leads).

## 5. Tela `/instagram`

- **Item no menu** Operação, acima de "Google Meu Negócio".
- **Cabeçalho:** "Sincronizar contas" e, por conta, cliente ligado (seletor de cliente com busca que já existe) e o uso do limite diário.
- **Lista de posts:** agendados (próximos primeiro), publicados e com erro, com filtro por cliente/conta; cada linha com miniatura, tipo, legenda resumida, quando e a situação. Agendado: editar ou cancelar. Erro: mensagem e "Tentar de novo". Publicado: "Ver no Instagram" (permalink). Atualiza sozinha (realtime).
- **"Criar post"** (estilo Business Suite): à esquerda conta, tipo, mídias (arrastar para ordenar), legenda com contadores, localização ("Localização do cliente" quando a página tem endereço, ou colar o id de um lugar), reels (aparecer no feed, quadro da capa por um controle deslizante sobre o vídeo), "Publicar agora" ou data e hora (Brasília); à direita a prévia no celular (feed, carrossel com pontinhos, reels 9:16).
- **Conferências no navegador antes de salvar:** imagem PNG/WEBP/HEIC aceita pelo navegador vira **JPG** (o Instagram só aceita JPG); proporção da imagem entre 4:5 e 1.91:1 (feed e carrossel); reels 9:16 recomendado (aviso se não for); carrossel de 2 a 10 itens; vídeo MP4 ou MOV; legenda até 2.200 caracteres e 30 hashtags; horário no futuro. Fora disso, aviso claro e não salva (o editor de formato é a etapa 2).

## 6. Testes

- Regras puras com testes automáticos: conferências de formato e legenda, montagem dos parâmetros dos contêineres, decisão da próxima etapa do post, tradução dos erros da Meta.
- Teste real: "Sincronizar contas" (print do André) e um post de teste numa conta escolhida por ele, pela tela, antes de qualquer cliente.

## 7. Riscos e limites conhecidos

- Se a Meta exigir revisão do app para contas de parceiros, a etapa 1 para no passo de prova.
- Limite diário de posts por API por conta (a função mostra quanto resta).
- A API não tem música da biblioteca, filtros, figurinhas nem marcação de produto.
- O sistema segue sem login até o projeto de segurança: qualquer pessoa com o endereço e a chave pública consegue agendar posts.
