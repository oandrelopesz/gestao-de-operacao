# Instagram, etapas 2 e 3 + editar agendado + excluir publicado — desenho

Data: 2026-10-03. Desenho aprovado pelo André no chat em 2026-10-03. Continua a spec `2026-10-02-instagram-posts-design.md` (etapa 1, no ar).

## 1. Escopo

- **Etapa 2, ajustar formato (só imagens):** botão "Ajustar" em cada imagem da tela de postagem (e no aviso de proporção): proporções 1:1, 4:5, 1,91:1 e 9:16, arrastar para posicionar e zoom; sai JPG com 1080 px de largura e substitui a imagem. "Deixar todas em…": recorte centralizado de todas as imagens na mesma proporção. Vídeo sem recorte (exigiria processar na VPS): só aviso.
- **Etapa 3:**
  - **Stories (Instagram):** formato "Feed" ou "Story". Story aceita foto ou vídeo (3 a 60 s), sem legenda, localização nem comentário; várias mídias = vários stories na ordem. Proporção livre, aviso fora de 9:16.
  - **Facebook:** caixinhas "Instagram" e "Facebook" (a página ligada à conta, `ig_contas.pagina_id`). Foto, várias fotos (álbum; só fotos) e vídeo (publicado como vídeo normal da página; reels do Facebook fica para depois). Sem story e sem localização no Facebook.
  - **Primeiro comentário** (feed, nas duas redes): comentado logo depois de publicar; se falhar, o post continua publicado e o aviso aparece na linha.
  - **Calendário:** aba com o mês e os posts (agendados, na fila, publicados) em cada dia; clicar abre as ações do post.
- **Editar agendado:** "Editar" abre a tela de postagem preenchida; salva só nas linhas que ainda estão `agendado` (as redes do grupo não mudam na edição).
- **Excluir publicado:** "Excluir" (com confirmação) apaga na rede (Instagram: `DELETE /{media-id}`; Facebook: `DELETE /{post-id}` com o token da página) e a linha fica `excluido`. Cancelado, com erro ou excluído: "Remover da lista" (apaga a linha).

**Fora:** recorte de vídeo, reels e stories no Facebook, localização no Facebook, prévia específica do Facebook, mudar as redes de um post já agendado.

## 2. Pré-requisito (André, guiado por prints)

O token atual não tem estas permissões: `pages_manage_posts`, `pages_manage_engagement` (Facebook e comentário no Facebook), `instagram_manage_comments` (primeiro comentário) e `instagram_manage_contents` (excluir no Instagram). O André adiciona no app PostBooster, gera um token novo do usuário do sistema ("Nunca expira", com as permissões antigas e as novas) e troca o valor do segredo `META_TOKEN`. As páginas dos clientes precisam estar atribuídas ao usuário do sistema com permissão de criar conteúdo. Até lá, essas funções mostram "Sem permissão na Meta: …".

## 3. Dados

`ig_posts` ganha: `rede` (`instagram` | `facebook`, padrão `instagram`), `grupo` uuid (as linhas criadas juntas: uma por rede e, no story, uma por mídia), `primeiro_comentario`, `aviso` (texto, post publicado com ressalva), `excluido_em`. `tipo` aceita `story`; `status` aceita `excluido`. No Facebook, `media_id` guarda o id do post (ou do vídeo) e `permalink` o `permalink_url`.

## 4. Publicação (função `instagram`)

- **Instagram:** igual à etapa 1; story = contêiner `media_type=STORIES` com `image_url` ou `video_url`. Depois do `media_publish`, se houver `primeiro_comentario`: `POST /{media-id}/comments`; falha vira `aviso`.
- **Facebook** (síncrono, sem contêiner): `agendado → enviando`; token da página por `GET /{pagina_id}?fields=access_token`; foto: `POST /{pagina}/photos` (`url`, `message`); álbum: cada foto `POST /{pagina}/photos` com `published=false`, depois `POST /{pagina}/feed` com `message` e `attached_media[i]={"media_fbid":"…"}`; vídeo: `POST /{pagina}/videos` (`file_url`, `description`). Grava `media_id` e `publicado`; busca o `permalink_url`; comentário em `POST /{post-id}/comments`.
- **`POST {acao: "excluir", id}`:** só `publicado`; apaga na rede; `status = excluido`, `excluido_em`.
- O `passo` processa na ordem `agendado_para`, depois `created_at` (stories em sequência).

## 5. Tela

- Tela de postagem: formato (Feed/Story), redes (Instagram/Facebook), mídias com "Ajustar", legenda, primeiro comentário, localização (Instagram), reels, quando; prévia no celular (estilo Instagram). Modo edição: mesma tela, preenchida.
- Aba Posts: ícone da rede em cada linha; Editar e Cancelar (agendado), Ver e Excluir (publicado), Tentar de novo e Remover (erro), Remover (cancelado, excluído); `aviso` em amarelo.
- Aba Calendário: mês, navegação, até 3 posts por dia e "+N"; clique abre a linha do post com as ações.

## 6. Testes

- Automáticos: recorte (centralizado, pela tela, tamanho de saída), conferências com formato e redes, parâmetros de story e do Facebook.
- Tela local (Playwright): Ajustar, Story, redes, calendário, editar.
- Reais (autorizados, @kobegrowth e a página dela): excluir os 2 posts de teste de 03/10; story; post com Facebook e primeiro comentário depois do token novo.

## 7. Pedidos do André em 03/10 (aprovados no chat)

- **Editor de foto:** recorte (original, 1:1, 4:5, 1,91:1, 9:16), arrastar, zoom, girar 90°; filtros prontos com intensidade; ajustes (brilho, contraste, saturação, calor, esmaecer, realces, sombras, vinheta); texto por cima (cor, tamanho, arrastar).
- **Editor de vídeo** (no navegador, Mediabunny/WebCodecs, carregada da CDN só ao abrir): cortar início e fim, recorte de proporção com posição, os mesmos filtros e ajustes, texto por cima, sem som; MP4 H.264/AAC com 1080 px.
- **Localização livre:** busca pelo nome (`GET /pages/search`; se a Meta exigir a aprovação "Page Public Metadata Access", a tela avisa), páginas da BM com endereço, colar link ou id da página do lugar, lugares já usados (`ig_locais`).
- **Opções avançadas:** desativar comentários (`POST /{media-id}?comment_enabled=false` depois de publicar), texto alternativo (`alt_text`, imagens), colaboradores (até 3, `collaborators`), marcar pessoas na foto (`user_tags` com x/y), reels com capa por imagem (`cover_url`) e nome do áudio (`audio_name`).
- **Fora (a API não permite):** ocultar curtidas e visualizações (só no app, depois de publicado), música da biblioteca, figurinhas/enquetes, privacidade (perfil comercial e página são públicos).
