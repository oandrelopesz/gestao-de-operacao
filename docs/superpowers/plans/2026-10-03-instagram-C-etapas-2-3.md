# Instagram, plano C (etapas 2 e 3, editar, excluir, editores, localização, opções avançadas)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** completar a aba Instagram com stories, Facebook, primeiro comentário, calendário, editar agendado, excluir publicado, editor de foto e de vídeo (recorte, girar, filtros, ajustes, texto, corte de trecho, sem som), localização livre e opções avançadas (comentários desativados, texto alternativo, colaboradores, marcar pessoas, capa e nome do áudio do reels).

**Architecture:** o banco ganha colunas em `ig_posts` (`rede`, `grupo`, `primeiro_comentario`, `opcoes`, `aviso`, `excluido_em`) e a tabela `ig_locais`; por mídia, `alt_text` e `marcacoes` dentro de `midias`. A função `instagram` publica story e Facebook, faz o comentário e desativa comentários depois de publicar, e ganha `excluir`, `locais` e `local`. Na tela, os editores rodam no navegador: foto em canvas (pixels com funções puras testadas) e vídeo com a Mediabunny (WebCodecs) carregada da CDN só quando o editor abre (sem mexer no `package.json`/`bun.lockb`).

**Tech Stack:** Deno + Graph API v23.0, Postgres, React, canvas 2D, Mediabunny 1.61.0 (CDN jsdelivr, `+esm`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-03-instagram-etapas-2-3-design.md` (+ seção 7 com os pedidos de 03/10: editores, localização livre e opções avançadas).

## Global Constraints

- Português em tudo que o André lê; o Claude nunca acessa a Meta.
- Sem dependência nova no `package.json` (o `bun.lockb` não é regenerado aqui): Mediabunny por `import()` de `https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/+esm`.
- O que a API não permite aparece explicado na tela: ocultar curtidas/visualizações, música, figurinhas, privacidade.
- Facebook, primeiro comentário, desativar comentários e excluir dependem do token novo (`pages_manage_posts`, `pages_manage_engagement`, `instagram_manage_comments`, `instagram_manage_contents`); até lá o erro em português diz a permissão que falta.
- Ponytail: menor código que resolve; arquivos focados.

---

### Entrega 1 — banco, função e regras puras

- [ ] Migration `20261003020000_instagram_etapas_2_3.sql`: colunas novas, checks de `rede`/`tipo` (+`story`)/`status` (+`excluido`), índice por `grupo`, tabela `ig_locais`.
- [ ] `meta.ts`: `Midia` com `alt_text`/`marcacoes`; `PostIg` com `opcoes`; story, alt text, marcações, colaboradores, capa (`cover_url`), nome do áudio; Facebook (`fbFoto`, `fbFotoSolta`, `fbAlbum`, `fbVideo`, `linkFacebook`); `refDaPagina`; `graph` com DELETE. Testes em `src/lib/instagramMeta.test.ts`.
- [ ] `passo.ts`: Facebook síncrono (token da página), extras depois de publicar (primeiro comentário, depois desativar comentários; falha vira `aviso`), ordem por `created_at`, `excluir`, `locais`, `local`.
- [ ] Tipos; testes; commit; migration aplicada; deploy da função.

### Entrega 2 — tela

- [ ] `conferirPost` com formato (feed/story), redes, comentário e colaboradores (testes).
- [ ] Tela de postagem: Feed/Story, Instagram/Facebook, primeiro comentário, localização (`EscolherLocal`: busca, páginas da BM, link/id, usados), "Opções avançadas" (comentários, colaboradores, texto alternativo, marcar pessoas, capa e áudio do reels, o que a API não permite), modo edição.
- [ ] Lista: rede, Editar/Cancelar, Ver/Excluir (confirmação), Tentar de novo/Remover, aviso. Aba Calendário.
- [ ] Teste local (Playwright); commit; publicar.

### Entrega 3 — editores

- [ ] Funções puras com testes: `instagramRecorte.ts` (recorte central, pela tela, tamanho de saída, rotação) e `instagramFiltros.ts` (filtros prontos e ajustes em pixels, texto).
- [ ] `EditorMidia.tsx`: abas Recorte, Filtros, Ajustes, Texto e (vídeo) Trecho/Som; foto exporta JPG 1080; vídeo exporta MP4 com a Mediabunny (girar/recortar/redimensionar na conversão, filtros e texto no `process`).
- [ ] Teste local; commit; publicar; testes reais na @kobegrowth (story, editar, excluir os 2 posts de teste; Facebook e comentário depois do token novo).
- [ ] Cofre: módulo, decisão, histórico, estado atual.
