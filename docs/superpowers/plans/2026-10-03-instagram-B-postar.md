# Instagram, plano B (postar e agendar) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** na aba `/instagram`, uma lista das contas com o botão **Postar** em cada uma, que abre a tela de postagem (foto, carrossel ou reels, legenda, localização, publicar agora ou agendar, prévia no celular); a lista dos posts com a situação; e chaves para ocultar e mostrar contas (na aba e no Admin).

**Architecture:** o post é gravado em `ig_posts` pela tela (mídias já enviadas ao R2, módulo `instagram`). A função `instagram` ganha a ação `passo`, uma máquina de estados que avança cada post da hora uma etapa por vez (`agendado → enviando → processando → publicando → publicado`), sempre com `UPDATE ... WHERE status = <esperado>`, para nunca publicar duas vezes. Um `pg_cron` chama `passo` a cada minuto quando há post na fila; "Publicar agora" chama na hora.

**Tech Stack:** Supabase (Lovable Cloud), Deno, Graph API da Meta, Cloudflare R2, React + TanStack Router + shadcn/ui, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-02-instagram-posts-design.md` (seções 3, 4 e 5), com as mudanças pedidas pelo André em 03/10/2026:
- a tela é uma **lista de contas com "Postar" em cada linha** (a postagem abre com a conta já escolhida), em vez de um "Criar post" com seletor de conta;
- **sem atribuir cliente** a cada conta (a coluna `cliente_id` fica sem uso na tela);
- **ocultar e mostrar contas com chaves**, na aba Instagram e numa seção Instagram do Admin (coluna `ig_contas.oculta`).

## Global Constraints

- Textos em português; o Claude nunca acessa a Meta (só a função `instagram` chama a Graph API, com `META_TOKEN`).
- Sem chave de publicação e sem login (a segurança do projeto vem depois).
- RLS aberta como o resto; `ig_posts` no realtime.
- Imagem sempre vira **JPG** no navegador (`normalizarFoto` de `src/lib/gmnImagem.ts`: lado até 2.048 px, até 5 MB).
- Feed e carrossel: proporção de 4:5 (0,8) a 1,91:1; carrossel de 2 a 10 itens; legenda até 2.200 caracteres e 30 hashtags. Fora disso, não salva (o editor de formato é a etapa 2).
- Tipo do post sai das mídias: 1 imagem = foto, 1 vídeo = reels, 2 ou mais = carrossel.
- Ponytail: sem dependência nova; o que ficou de fora vai no fim deste plano.

---

### Task 1: Regras puras (Meta e tela) com testes

**Files:**
- Modify: `supabase/functions/instagram/meta.ts` (tipos `Midia`/`PostIg`, `paramsFilho`, `paramsUnico`, `paramsCarrossel`, `decidir`, `erroDoContainer`, subcódigos em `erroMeta`, `graph`)
- Create: `src/lib/instagramPost.ts` (`tipoDoPost`, `contarHashtags`, `conferirPost`)
- Test: `src/lib/instagramMeta.test.ts`, `src/lib/instagramPost.test.ts`

**Interfaces (produz):**
- `type Midia = { chave: string; tipo: "imagem" | "video"; largura: number; altura: number; duracao?: number }`
- `interface PostIg { tipo: "foto" | "carrossel" | "reels"; midias: Midia[]; legenda: string; local_id: string | null; reels_no_feed: boolean; capa_ms: number | null }`
- `paramsFilho(m: Midia, url: string): Record<string,string>`; `paramsUnico(p: PostIg, url: string)`; `paramsCarrossel(p: PostIg, filhos: string[])`
- `decidir(filhos: StatusContainer[], principal: StatusContainer | null): { acao: "esperar" } | { acao: "criar_carrossel" } | { acao: "publicar" } | { acao: "erro"; erro: string }`
- `erroDoContainer(s: StatusContainer): string`; `graph(metodo, caminho, token, params?)`
- `tipoDoPost(midias): "foto" | "carrossel" | "reels" | null`; `contarHashtags(t): number`; `conferirPost(midias, legenda, agendarPara: Date | null, agora?: Date): { erros: string[]; avisos: string[] }`

- [ ] **Step 1: Testes que falham** (acrescentar em `src/lib/instagramMeta.test.ts`):

```ts
test("paramsUnico/paramsFilho/paramsCarrossel: legenda e local só quando há; reels com feed e capa", () => {
  const base = { midias: [], legenda: "", local_id: null, reels_no_feed: true, capa_ms: null };
  assert.deepEqual(paramsUnico({ ...base, tipo: "foto" }, "https://u/1.jpg"), { image_url: "https://u/1.jpg" });
  assert.deepEqual(paramsUnico({ ...base, tipo: "reels", legenda: "oi", local_id: "77", reels_no_feed: false, capa_ms: 1500 }, "https://u/v.mp4"),
    { caption: "oi", location_id: "77", media_type: "REELS", video_url: "https://u/v.mp4", share_to_feed: "false", thumb_offset: "1500" });
  assert.deepEqual(paramsFilho({ chave: "k", tipo: "video", largura: 1, altura: 1 }, "https://u/v.mp4"), { media_type: "VIDEO", video_url: "https://u/v.mp4", is_carousel_item: "true" });
  assert.deepEqual(paramsFilho({ chave: "k", tipo: "imagem", largura: 1, altura: 1 }, "https://u/1.jpg"), { image_url: "https://u/1.jpg", is_carousel_item: "true" });
  assert.deepEqual(paramsCarrossel({ ...base, tipo: "carrossel", legenda: "L" }, ["a", "b"]), { caption: "L", media_type: "CAROUSEL", children: "a,b" });
});

test("decidir: erro primeiro, espera filhos, cria o carrossel, espera o principal, publica", () => {
  const F = { status_code: "FINISHED" }, P = { status_code: "IN_PROGRESS" };
  assert.equal(decidir([F, { status_code: "ERROR", status: "Error: ... 2207026" }], null).acao, "erro");
  assert.deepEqual(decidir([F, P], null), { acao: "esperar" });
  assert.deepEqual(decidir([F, F], null), { acao: "criar_carrossel" });
  assert.deepEqual(decidir([F, F], P), { acao: "esperar" });
  assert.deepEqual(decidir([], F), { acao: "publicar" });
  assert.match(erroDoContainer({ status_code: "ERROR", status: "Error: Media upload has failed with error code 2207026" }), /MP4 ou MOV/);
  assert.match(erroDoContainer({ status_code: "EXPIRED" }), /expirou/);
  assert.match(erroMeta({ error: { code: 9, error_subcode: 2207042, message: "x" } }, 400), /limite diário/);
});
```

E `src/lib/instagramPost.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { conferirPost, contarHashtags, tipoDoPost } from "./instagramPost.ts";

const img = (largura: number, altura: number) => ({ chave: "k", tipo: "imagem" as const, largura, altura });
const vid = (largura: number, altura: number, duracao: number) => ({ chave: "k", tipo: "video" as const, largura, altura, duracao });

test("tipoDoPost sai das mídias", () => {
  assert.equal(tipoDoPost([]), null);
  assert.equal(tipoDoPost([img(1080, 1350)]), "foto");
  assert.equal(tipoDoPost([vid(1080, 1920, 10)]), "reels");
  assert.equal(tipoDoPost([img(1080, 1080), vid(1080, 1080, 10)]), "carrossel");
});

test("contarHashtags conta só as palavras com #", () => {
  assert.equal(contarHashtags("#a texto #b_2 e#c ##"), 2);
});

test("conferirPost: proporção, quantidade, legenda, reels e horário", () => {
  const agora = new Date("2026-10-03T12:00:00Z");
  assert.deepEqual(conferirPost([img(1080, 1350)], "ok", null, agora), { erros: [], avisos: [] });
  assert.match(conferirPost([img(1080, 1920)], "", null, agora).erros[0], /proporção 0,56:1/);
  assert.match(conferirPost(Array(11).fill(img(1080, 1080)), "", null, agora).erros[0], /até 10/);
  assert.match(conferirPost([img(1080, 1080)], "x".repeat(2201), null, agora).erros[0], /2201/);
  assert.match(conferirPost([img(1080, 1080)], Array(31).fill("#a").join(" "), null, agora).erros[0], /31 hashtags/);
  assert.match(conferirPost([vid(1080, 1080, 10)], "", null, agora).avisos[0], /9:16/);
  assert.match(conferirPost([vid(1080, 1920, 2)], "", null, agora).erros[0], /3 segundos/);
  assert.match(conferirPost([img(1080, 1080)], "", new Date("2026-10-03T12:00:30Z"), agora).erros[0], /futuro/);
  assert.match(conferirPost([], "", null, agora).erros[0], /Adicione/);
});
```

- [ ] **Step 2:** `node --test src/lib/instagramMeta.test.ts src/lib/instagramPost.test.ts` → FAIL (funções não existem).

- [ ] **Step 3: Implementar** (meta.ts):

```ts
export type Midia = { chave: string; tipo: "imagem" | "video"; largura: number; altura: number; duracao?: number };
export interface PostIg { tipo: "foto" | "carrossel" | "reels"; midias: Midia[]; legenda: string; local_id: string | null; reels_no_feed: boolean; capa_ms: number | null }
export interface StatusContainer { status_code?: string; status?: string }

const comuns = (p: PostIg) => ({ ...(p.legenda ? { caption: p.legenda } : {}), ...(p.local_id ? { location_id: p.local_id } : {}) });
export const paramsFilho = (m: Midia, url: string): Record<string, string> =>
  m.tipo === "video" ? { media_type: "VIDEO", video_url: url, is_carousel_item: "true" } : { image_url: url, is_carousel_item: "true" };
export function paramsUnico(p: PostIg, url: string): Record<string, string> {
  if (p.tipo !== "reels") return { ...comuns(p), image_url: url };
  return { ...comuns(p), media_type: "REELS", video_url: url, share_to_feed: String(p.reels_no_feed), ...(p.capa_ms != null ? { thumb_offset: String(p.capa_ms) } : {}) };
}
export const paramsCarrossel = (p: PostIg, filhos: string[]): Record<string, string> => ({ ...comuns(p), media_type: "CAROUSEL", children: filhos.join(",") });

const SUBCODIGOS: Record<number, string> = {
  2207001: "O Instagram teve um erro temporário. Clique em Tentar de novo.",
  2207003: "A Meta demorou demais para baixar o arquivo. Clique em Tentar de novo.",
  2207004: "A imagem passou de 8 MB.",
  2207005: "Formato de imagem não aceito: o Instagram só aceita JPG.",
  2207009: "Proporção não aceita: o feed aceita de 4:5 (em pé) a 1,91:1 (deitada).",
  2207026: "Vídeo em formato não aceito: use MP4 ou MOV (H.264 e AAC).",
  2207042: "Esta conta atingiu o limite diário de posts pela API (100 em 24 horas).",
  2207052: "A Meta não conseguiu baixar o arquivo do sistema. Clique em Tentar de novo.",
};
export function erroDoContainer(s: StatusContainer): string {
  if (s.status_code === "EXPIRED") return "O envio expirou na Meta (24 h sem publicar). Clique em Tentar de novo.";
  const codigo = Number(/(\d{7})/.exec(s.status ?? "")?.[1]);
  return SUBCODIGOS[codigo] ?? `A Meta recusou a mídia: ${s.status ?? "sem detalhe"}`;
}
export function decidir(filhos: StatusContainer[], principal: StatusContainer | null) {
  const ruim = [...filhos, ...(principal ? [principal] : [])].find((s) => s.status_code === "ERROR" || s.status_code === "EXPIRED");
  if (ruim) return { acao: "erro" as const, erro: erroDoContainer(ruim) };
  if (filhos.some((s) => s.status_code !== "FINISHED")) return { acao: "esperar" as const };
  if (!principal) return { acao: "criar_carrossel" as const };
  return principal.status_code === "FINISHED" ? { acao: "publicar" as const } : { acao: "esperar" as const };
}
// erroMeta: antes do código genérico, `if (SUBCODIGOS[e.error_subcode]) return SUBCODIGOS[e.error_subcode];`
// e `if (e.code === 4 || e.code === 32 || e.code === 613) return "Muitas chamadas à Meta agora; o sistema tenta de novo no próximo minuto.";`
export async function graph(metodo: "GET" | "POST", caminho: string, token: string, params: Record<string, string> = {}): Promise<any> {
  const corpo = new URLSearchParams({ ...params, access_token: token });
  const r = metodo === "GET"
    ? await fetch(`${GRAPH}/${caminho}?${corpo}`, { signal: AbortSignal.timeout(30_000) })
    : await fetch(`${GRAPH}/${caminho}`, { method: "POST", body: corpo, signal: AbortSignal.timeout(60_000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.error) throw new Error(erroMeta(j, r.status));
  return j;
}
```

`src/lib/instagramPost.ts`: implementação direta dos testes acima (tipo pelas mídias; proporção de 0,8 a 1,91 com folga de 0,01; reels de 3 a 900 s e aviso fora de 9:16 com folga de 0,02; vídeo de carrossel de 3 a 60 s; legenda até 2.200; hashtags `/(^|\s)#[\p{L}\p{N}_]+/gu` até 30; horário agendado precisa passar de agora + 1 min).

- [ ] **Step 4:** testes passando; `npm test` inteiro passando.
- [ ] **Step 5:** commit `Instagram: regras do post (contêineres, etapas, conferências da tela)`.

---

### Task 2: Banco (`ig_posts`, `oculta`, relógio) e função `passo`

**Files:**
- Create: `supabase/migrations/20261003010000_instagram_posts.sql`
- Create: `supabase/functions/instagram/passo.ts`
- Modify: `supabase/functions/instagram/index.ts` (ação `passo`)
- Modify: `supabase/functions/r2/index.ts` e `src/lib/r2Chaves.ts` (+ teste): módulo `instagram`; o endereço fixo `GET ?c=` passa a valer também para `instagram/`
- Modify: `src/integrations/supabase/types.ts` (`ig_posts` e `ig_contas.oculta`)

- [ ] **Step 1: Migration:**

```sql
-- Instagram, plano B: posts agendados e publicados, contas ocultas e o relógio que publica.
ALTER TABLE public.ig_contas ADD COLUMN IF NOT EXISTS oculta boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.ig_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id text NOT NULL REFERENCES public.ig_contas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('foto', 'carrossel', 'reels')),
  midias jsonb NOT NULL DEFAULT '[]'::jsonb,
  legenda text NOT NULL DEFAULT '',
  local_id text,
  local_nome text,
  reels_no_feed boolean NOT NULL DEFAULT true,
  capa_ms integer,
  agendado_para timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'enviando', 'processando', 'publicando', 'publicado', 'erro', 'cancelado')),
  containers jsonb,
  media_id text,
  permalink text,
  erro text,
  tentativas integer NOT NULL DEFAULT 0,
  publicado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_posts_fila ON public.ig_posts (agendado_para)
  WHERE status IN ('agendado', 'enviando', 'processando', 'publicando');
ALTER TABLE public.ig_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ig_posts' AND policyname = 'ig_posts_all') THEN
    CREATE POLICY "ig_posts_all" ON public.ig_posts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ig_posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ig_posts;
  END IF;
END $$;

-- Relógio: a cada minuto, só chama a função quando há post na hora (sem fila, não gasta chamada)
SELECT cron.schedule('instagram-passo', '* * * * *', $c$
  SELECT net.http_post(
    url := 'https://bnpvzguapunsztsdvmrs.supabase.co/functions/v1/instagram',
    body := '{"acao":"passo"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000)
  WHERE EXISTS (SELECT 1 FROM public.ig_posts
                WHERE status IN ('agendado', 'enviando', 'processando', 'publicando') AND agendado_para <= now())
$c$);
```

- [ ] **Step 2: `passo.ts`** — `mudar(sb, id, de, campos)` (UPDATE condicional, devolve a linha ou null), `linkR2(chave)` (GET `r2?c=` com `redirect: "manual"`, devolve o `Location`), `avancar(sb, token, post)` e `passo(sb, token, ate = 40_000)`:
  - `agendado`: troca para `enviando` (+1 tentativa); cria os contêineres (carrossel: um filho por mídia, principal depois; foto/reels: só o principal); grava `containers = {filhos, principal}` e vai para `processando`. Falha = `erro`.
  - `processando`: consulta `status_code` de filhos e principal e segue `decidir`: `esperar` (erro depois de 30 min parado), `criar_carrossel` (grava o principal), `erro`, ou `publicar`: troca para `publicando` (só uma execução ganha) e chama `media_publish` uma vez; grava `media_id`, depois busca o `permalink` (falha no permalink não vira erro).
  - `enviando`/`publicando` parados há mais de 5 min: `erro` com aviso ("O envio foi interrompido" / "A publicação não confirmou: confira no Instagram antes de tentar de novo"). Nunca republica sozinho.
  - `passo`: até 10 posts da hora, cada um avançando em laço dentro de 40 s (espera 4 s quando a Meta ainda processa; sai quando outra execução está com o post).
- [ ] **Step 3:** `index.ts`: `if (corpo?.acao === "passo") return json(await passo(sb, token));`
- [ ] **Step 4:** R2: `MODULOS` da função `r2` e `MODULOS_R2` com `instagram: "instagram"` (o teste de `r2Chaves` acompanha); no `GET ?c=`, aceitar `notas/` e `instagram/`.
- [ ] **Step 5:** tipos; `npx tsc --noEmit -p .`; `npm test`; commit `Instagram: posts (ig_posts), relógio e publicação passo a passo`.

---

### Task 3: Tela (lista com Postar, criar post, posts, contas visíveis, Admin)

**Files:**
- Modify: `src/lib/instagram.ts` (`fetchPosts`, `criarPost`, `cancelarPost`, `tentarDeNovo`, `alternarOculta`, `enviarMidia`, `urlDaMidia`, `avancarFila`; sai `vincularCliente`)
- Create: `src/components/instagram/CriarPost.tsx` (diálogo: mídias, legenda, localização, reels, quando, prévia no celular)
- Create: `src/components/instagram/ContasVisiveis.tsx` (lista com chave "Visível" por conta; `ContasInstagramCard` para o Admin)
- Modify: `src/routes/_authenticated/instagram.tsx` (abas "Contas" e "Posts"; sai o seletor de cliente)
- Modify: `src/routes/_authenticated/admin.tsx` (seção `instagram`)

Comportamento:
- **Contas:** busca tolerante (`useBusca` por nome e @), só as visíveis (`ativa && !oculta`), cada linha com foto, nome, @, "N agendados" e o botão **Postar**. Cabeçalho: "Contas visíveis" (diálogo com as chaves) e "Sincronizar contas".
- **Criar post (diálogo largo):** à esquerda, mídias (escolher ou soltar arquivos; imagem vira JPG; vídeo MP4/MOV; envio ao R2 na hora, com progresso; arrastar para reordenar; remover), legenda com contadores (caracteres e hashtags), "Marcar a localização do perfil" (quando a página tem endereço), reels ("Mostrar também no feed", capa por controle deslizante), "Publicar agora" ou "Agendar" (data e hora de Brasília), erros e avisos do `conferirPost`. À direita, a prévia no celular (cabeçalho com @, mídia com setas e pontinhos no carrossel, reels 9:16, legenda).
- **Posts:** realtime; miniatura (endereço fixo `r2?c=`), conta, tipo, legenda resumida, quando, situação. Agendado: Cancelar. Erro: a mensagem e "Tentar de novo". Publicado: "Ver no Instagram". Enviando/processando/publicando: "Enviando…".
- **Admin → Instagram:** o mesmo `ContasVisiveis` (todas as contas, chaves).

- [ ] Steps: implementar; `tsc`; `npm test`; teste local com Playwright (lista, busca, diálogo abre, conferências, chaves; o envio ao R2 só funciona no site por causa do CORS); commit `Instagram: lista com Postar, criar post com prévia, posts e contas visíveis`.

---

### Task 4: Ir ao ar e teste real na Kobe Growth

- [ ] Aplicar a migration (ensaio + aplicação, editor SQL do Lovable).
- [ ] Push; deploy pelo chat do Lovable das funções `instagram` e `r2`; publicar o site.
- [ ] Teste real, autorizado pelo André (03/10), na conta **@kobegrowth** com o material da pasta do Drive "Posts/Carrossel": um carrossel em "Publicar agora" e uma foto agendada para alguns minutos depois (testa o relógio). Sem legenda inventada.
- [ ] Registrar no cofre (módulo `instagram`, decisão das mudanças de tela, histórico, estado atual).

## Fora deste plano (de propósito)

- Editar um post agendado (hoje: cancelar e criar de novo). Colar o id de outro lugar como localização. Uso do limite diário na tela (100 posts em 24 h por conta, longe do uso real). Limpeza das mídias no R2 de posts cancelados. Facebook, stories, primeiro comentário e calendário: etapa 3.
