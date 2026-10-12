# Aba Conteúdo, Fase 1: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto a execução padrão é pelo `/jev-plano` (CLAUDE.md global do André).

**Goal:** aba `/conteudo` que, a partir do cofre de clientes, do kit da marca e de moldes por cliente, gera os posts da semana (carrossel e estático) já diagramados, mostra na visão da semana para o André aprovar ou pedir mudança e, ao aprovar, agenda no Instagram pelo agendador que já existe.

**Architecture:** edge function `conteudo` (Deno) com ações por POST e uma fila em `conteudo_posts` avançada pelo pg_cron (`texto → imagens → montando → aguardando`), com trava `processando_desde`. O Claude escreve moldes (HTML/CSS 1080x1350 com `{{campos}}`), textos e ajustes; a OpenAI gera imagens quando o Drive não serve; o Cloudflare Browser Rendering transforma o HTML em JPG; tudo fica no R2 em `instagram/conteudo/...`. Aprovar chama a função SQL `conteudo_aprovar`, que cria o `ig_posts`. Um script no PC do André copia o cofre do Obsidian para `conteudo_cofre`.

**Tech Stack:** React + TanStack Router + shadcn/ui (front), Supabase (Postgres, pg_cron, edge functions Deno), `npm:@anthropic-ai/sdk@0.133.0`, OpenAI (código do GMN), Cloudflare Browser Rendering (REST), Cloudflare R2 (aws4fetch), Node 24 (`node --test`, script do cofre).

**Spec:** `docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md`

## Global Constraints

- Tudo o que o André lê, em português do Brasil; sem travessão nos textos da tela e nas notas do cofre.
- Projeto Supabase `uajusldnvzgakffofkhl` (produção; o servidor local também usa ele). Migration idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`), aplicada com `npx supabase db push --db-url <url do %USERPROFILE%\.gestao\db.json>`; se o verificador barrar, o André roda.
- Funções: `npx supabase functions deploy <nome> --project-ref uajusldnvzgakffofkhl --use-api`. Secrets: `npx supabase secrets set ... --project-ref uajusldnvzgakffofkhl`. Valores de chave nunca no repositório, no chat ou no cofre; só em `%USERPROFILE%\.gestao\` e nos secrets.
- Tabelas novas não estão no `src/integrations/supabase/types.ts`: no front, `supabase.from("x" as any) as any` com interfaces próprias.
- Toda tabela nova acessada pela tela tem a policy `FOR ALL USING (true) WITH CHECK (true)`; `conteudo_cofre` fica **sem** policy (só a função lê).
- Sem dependência nova no `package.json` (o SDK do Claude é importado só na função, por `npm:`).
- Código compartilhado entre função, tela e testes (`supabase/functions/conteudo/regras.ts` e `prompts.ts`) usa só sintaxe de tipos que o Node apaga sozinho: nada de `enum`, `namespace` ou parameter properties.
- Teste real publica de verdade: só na conta @kobegrowth, e o post é apagado depois.
- Nunca acessar a Meta pelo navegador; o Instagram é só pela função `instagram` que já existe.
- Modelo do Claude pelo secret `CLAUDE_MODELO`, padrão `claude-sonnet-5-5`; imagens pelo `OPENAI_MODELO_IMAGEM` existente, retrato `1024x1536`, JPEG, qualidade média.
- Lâmina: 1080x1350 px, JPG. Carrossel: capa, de 3 a 6 lâminas (texto ou foto) e CTA. Legenda até 2.200 caracteres.
- R2: tudo no bucket de arquivos (`R2_BUCKET_ARQUIVOS`), dentro de `instagram/conteudo/` (a função `r2` e `src/lib/r2Chaves.ts` não mudam).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261012120000_conteudo.sql` | tabelas, policies, realtime, `conteudo_aprovar`, relógio `conteudo-passo` |
| `supabase/functions/conteudo/regras.ts` | tipos e regras puras (molde, datas, cofre, alterações, conferências) |
| `supabase/functions/conteudo/prompts.ts` | textos para o Claude e esquemas JSON |
| `supabase/functions/conteudo/arquivos.ts` | ler e gravar no R2 (bucket de arquivos) |
| `supabase/functions/conteudo/claude.ts` | chamada ao Claude com saída estruturada |
| `supabase/functions/conteudo/render.ts` | Cloudflare (HTML para JPG) e CSS do Google Fonts |
| `supabase/functions/conteudo/drive.ts` | subpastas do Drive com quantidade de imagens |
| `supabase/functions/conteudo/montagem.ts` | fontes e logos embutidas e o HTML final da lâmina |
| `supabase/functions/conteudo/etapas.ts` | a fila (`passo`): texto, imagens e montagem |
| `supabase/functions/conteudo/moldes.ts` | criar e ajustar molde com prévia |
| `supabase/functions/conteudo/index.ts` | rotas, acesso, cofre, Drive, semana e pedido de mudança |
| `supabase/functions/gmn/openai.ts` | `gerarImagem` ganha tamanho e formato opcionais |
| `supabase/functions/gmn/regras.ts` | exporta `motivosSaude` |
| `supabase/config.toml` | `[functions.conteudo] verify_jwt = false` |
| `src/lib/conteudoRegras.test.ts` | testes das regras e dos prompts |
| `tools/cofre-sync/sync.mjs` | script do cofre (Agendador de Tarefas do Windows) |
| `src/lib/conteudo.ts` | dados e chamadas da tela |
| `src/routes/_authenticated/conteudo.tsx` | página com as abas Semana e Clientes |
| `src/components/conteudo/Clientes.tsx` | lista e "Ligar cliente" |
| `src/components/conteudo/GavetaCliente.tsx` | gaveta com Kit, Pilares e agenda, Moldes |
| `src/components/conteudo/AbaKit.tsx` | kit da marca |
| `src/components/conteudo/AbaAgenda.tsx` | pilares e agenda |
| `src/components/conteudo/AbaMoldes.tsx` | moldes |
| `src/components/conteudo/Semana.tsx` | visão da semana, Gerar a semana, Novo post |
| `src/components/conteudo/PostDialog.tsx` | um post: lâminas, edição e ações |
| `src/lib/nav.tsx`, `src/routeTree.gen.ts` | item no menu e rota |

---

### Task 1: Migration (tabelas, aprovação e relógio)

**Exec:** sonnet (migration de banco)

**Files:**
- Create: `supabase/migrations/20261012120000_conteudo.sql`

**Interfaces:**
- Produces: tabelas `conteudo_clientes`, `conteudo_posts`, `conteudo_cofre`; função `public.conteudo_aprovar(p_post uuid, p_quando timestamptz) RETURNS uuid`; job `conteudo-passo`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Aba Conteúdo (spec docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md).
-- Clientes ligados com kit e moldes, posts gerados, cópia do cofre de clientes (fechada para a chave pública),
-- aprovação que vira ig_posts e o relógio da fila.
CREATE TABLE IF NOT EXISTS public.conteudo_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  pasta_cofre text,
  ig_conta_id text REFERENCES public.ig_contas(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT false,
  logos jsonb NOT NULL DEFAULT '[]'::jsonb,
  tom_de_voz text NOT NULL DEFAULT '',
  design_system text NOT NULL DEFAULT '',
  fontes jsonb NOT NULL DEFAULT '[]'::jsonb,
  saude boolean NOT NULL DEFAULT false,
  ia_pode_pessoas boolean NOT NULL DEFAULT false,
  drive_url text NOT NULL DEFAULT '',
  drive_pastas jsonb NOT NULL DEFAULT '[]'::jsonb,
  pilares jsonb NOT NULL DEFAULT '[]'::jsonb,
  agenda jsonb NOT NULL DEFAULT '[]'::jsonb,
  moldes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conteudo_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conteudo_cliente_id uuid NOT NULL REFERENCES public.conteudo_clientes(id) ON DELETE CASCADE,
  formato text NOT NULL CHECK (formato IN ('carrossel', 'estatico')),
  pilar text,
  tema text,
  agendado_para timestamptz NOT NULL,
  origem_data date,
  laminas jsonb NOT NULL DEFAULT '[]'::jsonb,
  legenda text NOT NULL DEFAULT '',
  pedidos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'texto'
    CHECK (status IN ('texto', 'imagens', 'montando', 'aguardando', 'aprovado', 'descartado', 'erro')),
  processando_desde timestamptz,
  erro_etapa text,
  tentativas integer NOT NULL DEFAULT 0,
  erro text,
  aviso text,
  ig_post_id uuid UNIQUE REFERENCES public.ig_posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conteudo_posts_dia_da_agenda UNIQUE (conteudo_cliente_id, origem_data)
);
CREATE INDEX IF NOT EXISTS conteudo_posts_quando ON public.conteudo_posts (agendado_para);
CREATE INDEX IF NOT EXISTS conteudo_posts_fila ON public.conteudo_posts (created_at)
  WHERE status IN ('texto', 'imagens', 'montando');

-- Cópia do cofre do Obsidian (script do PC). Sem policy: a chave pública não lê; só a função (chave de serviço).
CREATE TABLE IF NOT EXISTS public.conteudo_cofre (
  pasta text NOT NULL,
  caminho text NOT NULL,
  hash text NOT NULL,
  conteudo text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pasta, caminho)
);

ALTER TABLE public.conteudo_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteudo_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteudo_cofre ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conteudo_clientes' AND policyname = 'conteudo_clientes_all') THEN
    CREATE POLICY "conteudo_clientes_all" ON public.conteudo_clientes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conteudo_posts' AND policyname = 'conteudo_posts_all') THEN
    CREATE POLICY "conteudo_posts_all" ON public.conteudo_posts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'conteudo_posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conteudo_posts;
  END IF;
END $$;

-- Aprovar: numa transação, o post sai de 'aguardando' e vira um ig_posts agendado (o relógio do Instagram publica).
CREATE OR REPLACE FUNCTION public.conteudo_aprovar(p_post uuid, p_quando timestamptz)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_post public.conteudo_posts;
  v_conta text;
  v_ig uuid;
BEGIN
  SELECT * INTO v_post FROM public.conteudo_posts WHERE id = p_post AND status = 'aguardando' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'O post não está aguardando aprovação.'; END IF;
  IF p_quando <= now() THEN RAISE EXCEPTION 'Escolha um dia e horário no futuro.'; END IF;
  SELECT ig_conta_id INTO v_conta FROM public.conteudo_clientes WHERE id = v_post.conteudo_cliente_id;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'O cliente não tem conta do Instagram ligada.'; END IF;
  IF jsonb_array_length(v_post.laminas) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_post.laminas) l WHERE coalesce(l->>'jpg_chave', '') = '') THEN
    RAISE EXCEPTION 'Há lâminas ainda sem imagem montada.';
  END IF;
  INSERT INTO public.ig_posts (conta_id, rede, tipo, midias, legenda, agendado_para)
  VALUES (
    v_conta, 'instagram',
    CASE WHEN jsonb_array_length(v_post.laminas) = 1 THEN 'foto' ELSE 'carrossel' END,
    (SELECT jsonb_agg(jsonb_build_object('chave', l->>'jpg_chave', 'tipo', 'imagem', 'largura', 1080, 'altura', 1350) ORDER BY n)
       FROM jsonb_array_elements(v_post.laminas) WITH ORDINALITY AS t(l, n)),
    v_post.legenda, p_quando)
  RETURNING id INTO v_ig;
  UPDATE public.conteudo_posts
     SET status = 'aprovado', ig_post_id = v_ig, agendado_para = p_quando, updated_at = now()
   WHERE id = p_post;
  RETURN v_ig;
END $$;

-- Relógio: a cada minuto, só chama a função quando há post livre na fila (livre = sem trava ou travado há 10 min).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'conteudo-passo') THEN
    PERFORM cron.schedule('conteudo-passo', '* * * * *', $c$
      SELECT net.http_post(
        url := 'https://uajusldnvzgakffofkhl.supabase.co/functions/v1/conteudo',
        body := '{"acao":"passo"}'::jsonb,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 150000)
      WHERE EXISTS (SELECT 1 FROM public.conteudo_posts
                    WHERE status IN ('texto', 'imagens', 'montando')
                      AND (processando_desde IS NULL OR processando_desde < now() - interval '10 minutes'))
    $c$);
  END IF;
END $$;
```

- [ ] **Step 2: Aplicar no banco**

Run (Git Bash, na raiz do repositório; a URL com a senha não é impressa):

```bash
npx supabase db push --db-url "$(node -e "const c=require(require('path').join(process.env.USERPROFILE,'.gestao','db.json'));process.stdout.write('postgresql://postgres.'+c.ref+':'+encodeURIComponent(c.senha)+'@'+c.host+':5432/postgres')")"
```

Expected: `Applying migration 20261012120000_conteudo.sql... Finished supabase db push.` Se o verificador barrar, pedir ao André para rodar o mesmo comando com `!` na frente.

- [ ] **Step 3: Conferir pela API**

```bash
source .env 2>/dev/null; K="$VITE_SUPABASE_PUBLISHABLE_KEY"; U="$VITE_SUPABASE_URL"
curl -s "$U/rest/v1/conteudo_clientes?select=id&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K"; echo
curl -s "$U/rest/v1/conteudo_posts?select=id&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K"; echo
curl -s "$U/rest/v1/conteudo_cofre?select=pasta&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K"; echo
```

Expected: `[]`, `[]` e `[]` (a última vazia porque não há policy: a chave pública não vê linhas; não pode dar `PGRST205`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261012120000_conteudo.sql
git commit -m "feat: aba Conteudo, migration (clientes, posts, copia do cofre, aprovacao e relogio)"
```

---

### Task 2: Regras puras e testes

**Exec:** haiku (código e testes dados; check objetivo)

**Files:**
- Modify: `supabase/functions/gmn/regras.ts` (acrescentar `motivosSaude` logo depois de `checarTexto`)
- Create: `supabase/functions/conteudo/regras.ts`
- Test: `src/lib/conteudoRegras.test.ts`

**Interfaces:**
- Produces (de `supabase/functions/conteudo/regras.ts`): tipos `Formato`, `TipoMolde`, `VarianteLogo`, `StatusPost`, `Logo`, `Fonte`, `Pilar`, `ItemAgenda`, `PastaDrive`, `CampoMolde`, `Molde`, `Moldes`, `ImagemLamina`, `Lamina`, `Alteracao`, `RespostaTexto`; constantes `TIPOS_MOLDE`, `MOLDES_DO_FORMATO`, `ROTULO_MOLDE`, `ROTULO_FORMATO`, `VARIANTES_LOGO`, `ROTULO_VARIANTE`, `ROTULO_STATUS`, `ETAPAS_DA_FILA`, `LARGURA`, `ALTURA`, `CAMPO_FOTO`, `ARQUIVO_LOG`, `LEGENDA_MAX`, `CAMPOS_OBRIGATORIOS`, `IMAGEM_EXEMPLO`; classe `ErroHttp(status, mensagem)`; funções `escaparHtml`, `preencherMolde(html, campos, valores)`, `conferirCampos(campos, valores)`, `conferirEstrutura(formato, moldes)`, `validarMolde(tipo, html, campos, variantes)`, `proximoPilar(pilares, usados)`, `somarDias(dia, n)`, `segundaDaSemana(dia)`, `instanteBrasilia(dia, hora)`, `postsDaSemana(segunda, agenda)`, `recortarLog(texto, hoje, dias?)`, `montarContexto(arquivos, limite?)`, `mudancasCofre(locais, remotos)`, `aplicarAlteracoes(laminas, legenda, alteracoes)`, `usosDeFotos(posts)`, `faltaParaGerar(cliente, formato)`, `htmlParaRender(html, {cssFontes, ajusteCss?})`, `extensaoFonte(chave)`, `fontFace(familia, ext, base64, peso?)`, `motivosDoTexto(resposta, formato, {moldes, saude})`, `laminasDaResposta(resposta, moldes)`.
- Produces (de `supabase/functions/gmn/regras.ts`): `motivosSaude(texto: string): string[]`.

- [ ] **Step 1: Escrever os testes**

`src/lib/conteudoRegras.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  ARQUIVO_LOG, aplicarAlteracoes, conferirCampos, conferirEstrutura, faltaParaGerar, fontFace, htmlParaRender,
  instanteBrasilia, laminasDaResposta, montarContexto, motivosDoTexto, mudancasCofre, postsDaSemana, preencherMolde,
  proximoPilar, recortarLog, segundaDaSemana, usosDeFotos, validarMolde,
} from "../../supabase/functions/conteudo/regras.ts";
import { motivosSaude } from "../../supabase/functions/gmn/regras.ts";

const campos = [
  { nome: "titulo", tipo: "texto", max: 20, exemplo: "" },
  { nome: "foto", tipo: "imagem", max: 0, exemplo: "" },
];
const alt = (a) => ({ alvo: "campo", lamina: null, campo: null, valor: null, descricao: null, pasta_id: null, ajuste_css: null, ...a });
const molde = (c, aprovado = true) => ({ html: "", campos: c, versao: 1, aprovado_em: aprovado ? "2026-10-12T00:00:00Z" : null, previa_chave: null });
const t30 = { nome: "titulo", tipo: "texto", max: 30, exemplo: "" };
const moldesC = {
  capa: molde([t30]),
  texto: molde([t30, { nome: "texto", tipo: "texto", max: 200, exemplo: "" }]),
  foto: molde([t30, { nome: "texto", tipo: "texto", max: 200, exemplo: "" }, { nome: "foto", tipo: "imagem", max: 0, exemplo: "" }]),
  cta: molde([t30]),
};
const lam = (m, c, imagem_descricao = null) =>
  ({ molde: m, campos: Object.entries(c).map(([nome, valor]) => ({ nome, valor })), imagem_descricao, pasta_id: null });

test("preencherMolde escapa texto, quebra linha e só aceita imagem data: ou https:", () => {
  assert.equal(
    preencherMolde('<h1>{{titulo}}</h1><img src="{{foto}}">', campos, { titulo: 'A <b> & "c"\nd', foto: "data:image/png;base64,AAA" }),
    '<h1>A &lt;b&gt; &amp; &quot;c&quot;<br>d</h1><img src="data:image/png;base64,AAA">',
  );
  assert.equal(preencherMolde('<img src="{{foto}}">{{nada}}', campos, { foto: "javascript:alert(1)" }), '<img src="">');
  assert.equal(preencherMolde('<img src="{{logo_clara}}">', [], { logo_clara: "data:image/png;base64,B" }), '<img src="data:image/png;base64,B">');
});

test("conferirCampos aponta vazio e acima do limite", () => {
  assert.deepEqual(conferirCampos(campos, { titulo: "x".repeat(21) }), ["titulo: 21 caracteres (máximo 20)"]);
  assert.deepEqual(conferirCampos(campos, { titulo: "  " }), ["titulo: vazio"]);
  assert.deepEqual(conferirCampos(campos, { titulo: "ok" }), []);
});

test("conferirEstrutura do carrossel e do estático", () => {
  assert.deepEqual(conferirEstrutura("carrossel", ["capa", "texto", "foto", "texto", "cta"]), []);
  assert.equal(conferirEstrutura("carrossel", ["capa", "texto", "cta"]).length, 1);
  assert.equal(conferirEstrutura("carrossel", ["texto", "texto", "texto", "texto", "cta"]).length, 1);
  assert.deepEqual(conferirEstrutura("estatico", ["estatico"]), []);
  assert.equal(conferirEstrutura("estatico", ["capa"]).length, 1);
});

test("validarMolde", () => {
  const ok = [{ nome: "titulo", tipo: "texto", max: 60, exemplo: "Oi" }, { nome: "logo_clara", tipo: "logo", max: 0, exemplo: "" }];
  assert.deepEqual(validarMolde("capa", '<html><body><h1>{{titulo}}</h1><img src="{{logo_clara}}"></body></html>', ok, ["clara"]), []);
  assert.deepEqual(validarMolde("capa", '<h1>{{titulo}}</h1><img src="{{logo_clara}}">', ok, ["escura"]), ["logo logo_clara não existe no kit"]);
  assert.ok(validarMolde("texto", "<h1>{{titulo}}</h1>", [ok[0]], []).includes("falta o campo texto"));
  assert.ok(validarMolde("capa", "<h1>{{titulo}}</h1><script>x</script>", [ok[0]], []).includes("o molde não pode ter script"));
  assert.ok(validarMolde("capa", '<h1>{{titulo}}</h1><img src="https://x.com/a.png">', [ok[0]], []).includes("o molde não pode carregar nada de fora"));
  assert.deepEqual(validarMolde("capa", '<svg xmlns="http://www.w3.org/2000/svg"></svg><h1>{{titulo}}</h1>', [ok[0]], []), []);
});

test("proximoPilar: nunca usado primeiro, senão o usado há mais tempo", () => {
  const pilares = [{ nome: "Dica", descricao: "" }, { nome: "Prova", descricao: "" }, { nome: "Oferta", descricao: "" }];
  assert.equal(proximoPilar(pilares, ["Dica", "Prova"])?.nome, "Oferta");
  assert.equal(proximoPilar(pilares, ["Oferta", "Dica", "Prova", "Dica"])?.nome, "Prova");
  assert.equal(proximoPilar([], []), null);
});

test("datas da semana em Brasília", () => {
  assert.equal(segundaDaSemana("2026-10-18"), "2026-10-12");
  assert.equal(segundaDaSemana("2026-10-12"), "2026-10-12");
  assert.equal(segundaDaSemana("2026-10-11"), "2026-10-05");
  assert.equal(instanteBrasilia("2026-10-13", "09:00"), "2026-10-13T12:00:00.000Z");
  assert.deepEqual(postsDaSemana("2026-10-12", [{ dia: 0, hora: "18:30", formato: "estatico" }, { dia: 2, hora: "09:00", formato: "carrossel" }]), [
    { origem_data: "2026-10-13", agendado_para: "2026-10-13T12:00:00.000Z", formato: "carrossel" },
    { origem_data: "2026-10-18", agendado_para: "2026-10-18T21:30:00.000Z", formato: "estatico" },
  ]);
});

test("recortarLog fica só com os últimos 60 dias", () => {
  const log = "---\ntipo: log\n---\n# Log\n\n### 2026-07-01\n- velho (memória)\n\n### 2026-09-01\n- recente (memória)\n\n### 2026-10-10\n- novo (memória)\n";
  assert.equal(recortarLog(log, "2026-10-12"), "### 2026-09-01\n- recente (memória)\n\n### 2026-10-10\n- novo (memória)");
});

test("montarContexto: nota central, Log, documentos; corta no limite", () => {
  const r = montarContexto([
    { caminho: "Documentos/B.md", conteudo: "b" }, { caminho: ARQUIVO_LOG, conteudo: "log" },
    { caminho: "Kobe.md", conteudo: "central" }, { caminho: "Documentos/A.md", conteudo: "a" },
  ]);
  assert.equal(r, "=== Kobe.md ===\ncentral\n\n=== Log (60 dias) ===\nlog\n\n=== Documentos/A.md ===\na\n\n=== Documentos/B.md ===\nb");
  assert.ok(montarContexto([{ caminho: "X.md", conteudo: "1234567890" }], 12).length <= 12);
  assert.equal(montarContexto([]), "");
});

test("mudancasCofre envia novos e mudados, remove os que sumiram", () => {
  assert.deepEqual(mudancasCofre({ a: "1", b: "2" }, { a: "1", b: "x", c: "3" }), { enviar: ["b"], remover: ["c"] });
});

test("aplicarAlteracoes mexe só no pedido e não altera o original", () => {
  const laminas = [
    { molde: "capa", campos: { titulo: "A" }, jpg_chave: "k1" },
    { molde: "texto", campos: { titulo: "B", texto: "b" }, jpg_chave: "k2" },
    { molde: "cta", campos: { titulo: "C" }, jpg_chave: "k3" },
  ];
  const r = aplicarAlteracoes(laminas, "L1", [
    alt({ alvo: "campo", lamina: 1, campo: "titulo", valor: "Novo" }),
    alt({ alvo: "imagem", lamina: 2, descricao: "salão", pasta_id: "p1" }),
    alt({ alvo: "legenda", valor: "L2" }),
    alt({ alvo: "campo", lamina: 9, campo: "titulo", valor: "x" }),
  ]);
  assert.equal(r.laminas[0].campos.titulo, "Novo");
  assert.equal(r.laminas[0].jpg_chave, null);
  assert.equal(r.laminas[1].molde, "foto");
  assert.deepEqual(r.laminas[1].imagem, { descricao: "salão", pasta_id: "p1", pendente: true });
  assert.equal(r.laminas[2].jpg_chave, "k3");
  assert.equal(r.legenda, "L2");
  assert.equal(r.imagens, true);
  assert.equal(laminas[0].campos.titulo, "A");
});

test("usosDeFotos guarda o uso mais recente de cada foto do Drive", () => {
  assert.deepEqual(usosDeFotos([
    { created_at: "2026-10-01T00:00:00Z", laminas: [{ molde: "foto", campos: {}, imagem: { descricao: "", drive_id: "a" }, jpg_chave: null }] },
    { created_at: "2026-10-05T00:00:00Z", laminas: [{ molde: "foto", campos: {}, imagem: { descricao: "", drive_id: "a" }, jpg_chave: null }, { molde: "capa", campos: {}, jpg_chave: null }] },
  ]), { a: "2026-10-05T00:00:00Z" });
});

test("faltaParaGerar", () => {
  const base = { pasta_cofre: "Kobe Growth", ig_conta_id: "1", logos: [{ variante: "principal", chave: "k", largura: 1, altura: 1 }],
    moldes: { capa: molde([]), texto: molde([]), foto: molde([]), cta: molde([], false) } };
  assert.deepEqual(faltaParaGerar(base, "carrossel"), ["moldes aprovados (CTA final)"]);
  assert.deepEqual(faltaParaGerar({ ...base, ig_conta_id: null, logos: [] }, "estatico"), ["conta do Instagram", "logo", "moldes aprovados (Post estático)"]);
});

test("htmlParaRender: tamanho fixo, ajuste depois do molde e aviso de pronto no fim", () => {
  const doc = htmlParaRender("<html><head><style>h1{}</style></head><body><h1>x</h1></body></html>", { cssFontes: "@font-face{}", ajusteCss: "h1{color:red}" });
  assert.ok(doc.includes("width:1080px;height:1350px"));
  assert.ok(doc.indexOf("h1{color:red}") > doc.indexOf("h1{}"));
  assert.ok(doc.indexOf("data-pronto") > doc.indexOf("<h1>x</h1>"));
  assert.ok(htmlParaRender("<h1>y</h1>", { cssFontes: "" }).startsWith("<!doctype html>"));
});

test("fontFace embute a fonte com o peso", () => {
  assert.equal(fontFace('Clash "Display"', "woff2", "QUJD", 700),
    '@font-face{font-family:"Clash Display";src:url(data:font/woff2;base64,QUJD) format("woff2");font-weight:700;font-display:block}');
});

test("motivosDoTexto confere estrutura, limites, legenda e saúde", () => {
  const r = { tema: "t", legenda: "Legenda", laminas: [lam("capa", { titulo: "Oi" }), lam("texto", { titulo: "A", texto: "b" }),
    lam("texto", { titulo: "A", texto: "b" }), lam("texto", { titulo: "A", texto: "100% garantido" }), lam("cta", { titulo: "Fale" })] };
  assert.deepEqual(motivosDoTexto(r, "carrossel", { moldes: moldesC, saude: false }), []);
  assert.ok(motivosDoTexto(r, "carrossel", { moldes: moldesC, saude: true }).some((m) => m.startsWith("saúde:")));
  assert.deepEqual(motivosSaude("Resultado garantido"), ["promessa de resultado (garantido)"]);
});

test("laminasDaResposta marca a foto como pendente, com o título como reserva da descrição", () => {
  const ls = laminasDaResposta({ tema: "t", legenda: "l", laminas: [lam("foto", { titulo: "Salão", texto: "x" }), lam("texto", { titulo: "A", texto: "b" })] }, moldesC);
  assert.deepEqual(ls[0].imagem, { descricao: "Salão", pasta_id: null, pendente: true });
  assert.equal(ls[1].imagem, undefined);
  assert.equal(ls[0].jpg_chave, null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test src/lib/conteudoRegras.test.ts`
Expected: FAIL (módulo `supabase/functions/conteudo/regras.ts` não existe).

- [ ] **Step 3: `motivosSaude` no GMN**

Em `supabase/functions/gmn/regras.ts`, logo depois do fim de `checarTexto`:

```ts
/** Só as regras do CFM/CFO (sem tamanho, telefone ou link), para os textos de outras abas. */
export function motivosSaude(texto: string): string[] {
  const n = semAcento(texto);
  return REGRAS_SAUDE.filter((r) => r.re.test(n)).map((r) => r.motivo);
}
```

- [ ] **Step 4: Escrever `supabase/functions/conteudo/regras.ts`**

```ts
// Aba Conteúdo (spec docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md): tipos e regras puras, sem rede.
// Rodam na função `conteudo` (Deno), na tela, no script do cofre e no `node --test`. Só sintaxe de tipos que o Node apaga
// sozinho (sem enum, namespace ou parameter properties).
import { motivosSaude } from "../gmn/regras.ts";

export type Formato = "carrossel" | "estatico";
export type TipoMolde = "capa" | "texto" | "foto" | "cta" | "estatico";
export type VarianteLogo = "principal" | "icone" | "clara" | "escura";
export type StatusPost = "texto" | "imagens" | "montando" | "aguardando" | "aprovado" | "descartado" | "erro";

export const TIPOS_MOLDE: TipoMolde[] = ["capa", "texto", "foto", "cta", "estatico"];
export const MOLDES_DO_FORMATO: Record<Formato, TipoMolde[]> = { carrossel: ["capa", "texto", "foto", "cta"], estatico: ["estatico"] };
export const ROTULO_MOLDE: Record<TipoMolde, string> = {
  capa: "Capa", texto: "Lâmina de texto", foto: "Lâmina com foto", cta: "CTA final", estatico: "Post estático",
};
export const ROTULO_FORMATO: Record<Formato, string> = { carrossel: "Carrossel", estatico: "Estático" };
export const VARIANTES_LOGO: VarianteLogo[] = ["principal", "icone", "clara", "escura"];
export const ROTULO_VARIANTE: Record<VarianteLogo, string> = {
  principal: "Principal", icone: "Ícone", clara: "Clara (para fundo escuro)", escura: "Escura (para fundo claro)",
};
export const ROTULO_STATUS: Record<StatusPost, string> = {
  texto: "Escrevendo", imagens: "Buscando imagens", montando: "Montando", aguardando: "Aguardando aprovação",
  aprovado: "Aprovado", descartado: "Descartado", erro: "Erro",
};
export const ETAPAS_DA_FILA: StatusPost[] = ["texto", "imagens", "montando"];
export const LARGURA = 1080;
export const ALTURA = 1350;
export const CAMPO_FOTO = "foto";
export const ARQUIVO_LOG = "Log (60 dias)";
export const LEGENDA_MAX = 2200;

export interface Logo { variante: VarianteLogo; chave: string; largura: number; altura: number }
export interface Fonte { familia: string; origem: "google" | "arquivo"; chave?: string; peso?: number }
export interface Pilar { nome: string; descricao: string }
/** dia: 0 = domingo ... 6 = sábado (como no GMN); hora "HH:MM" de Brasília. */
export interface ItemAgenda { dia: number; hora: string; formato: Formato }
export interface PastaDrive { id: string; caminho: string; quantidade: number }
export interface CampoMolde { nome: string; tipo: "texto" | "imagem" | "logo"; max: number; exemplo: string }
export interface Molde { html: string; campos: CampoMolde[]; versao: number; aprovado_em: string | null; previa_chave: string | null }
export type Moldes = Partial<Record<TipoMolde, Molde>>;
export interface ImagemLamina {
  descricao: string;
  pasta_id?: string | null;
  pendente?: boolean;
  origem?: "drive" | "ia" | "envio";
  drive_id?: string;
  chave?: string;
}
export interface Lamina { molde: TipoMolde; campos: Record<string, string>; imagem?: ImagemLamina; ajuste_css?: string; jpg_chave: string | null }
export interface Alteracao {
  alvo: "campo" | "imagem" | "legenda" | "layout";
  lamina: number | null; // começa em 1, como o André conta
  campo: string | null;
  valor: string | null;
  descricao: string | null;
  pasta_id: string | null;
  ajuste_css: string | null;
}
export interface RespostaTexto {
  tema: string;
  legenda: string;
  laminas: { molde: TipoMolde; campos: { nome: string; valor: string }[]; imagem_descricao: string | null; pasta_id: string | null }[];
}

/** Erro com o status HTTP que a função devolve (400, 404, 409...). */
export class ErroHttp extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

/** Campos obrigatórios por molde. Texto e foto têm os mesmos textos: a lâmina de foto vira de texto se a imagem falhar. */
export const CAMPOS_OBRIGATORIOS: Record<TipoMolde, string[]> = {
  capa: ["titulo"], texto: ["titulo", "texto"], foto: ["titulo", "texto", CAMPO_FOTO], cta: ["titulo"], estatico: ["titulo"],
};
const NOME_LOGO = /^logo_(principal|icone|clara|escura)$/;

/** Imagem cinza usada na prévia dos moldes. */
export const IMAGEM_EXEMPLO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGURA}" height="${ALTURA}"><rect width="100%" height="100%" fill="#9ca3af"/><text x="50%" y="50%" font-family="sans-serif" font-size="64" fill="#f3f4f6" text-anchor="middle">foto</text></svg>`,
)}`;

export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Troca cada {{campo}} pelo valor: texto escapado (quebra de linha vira <br>); imagem e logo só com `data:` ou `https:`.
 * Marcação sem valor some.
 */
export function preencherMolde(html: string, campos: CampoMolde[], valores: Record<string, string>): string {
  const tipos = new Map(campos.map((c) => [c.nome, c.tipo]));
  return html.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, nome: string) => {
    const v = valores[nome] ?? "";
    const tipo = tipos.get(nome) ?? (NOME_LOGO.test(nome) ? "logo" : "texto");
    if (tipo === "texto") return escaparHtml(v).replace(/\r?\n/g, "<br>");
    return /^(data:image\/|https:\/\/)/.test(v) ? escaparHtml(v) : "";
  });
}

/** Motivos para recusar os textos de uma lâmina: campo de texto vazio ou acima do limite do molde. */
export function conferirCampos(campos: CampoMolde[], valores: Record<string, string>): string[] {
  const motivos: string[] = [];
  for (const c of campos) {
    if (c.tipo !== "texto") continue;
    const v = (valores[c.nome] ?? "").trim();
    if (!v) motivos.push(`${c.nome}: vazio`);
    else if (v.length > c.max) motivos.push(`${c.nome}: ${v.length} caracteres (máximo ${c.max})`);
  }
  return motivos;
}

/** Carrossel: capa, de 3 a 6 lâminas de texto ou foto e o CTA. Estático: uma lâmina do molde estatico. */
export function conferirEstrutura(formato: Formato, moldes: TipoMolde[]): string[] {
  if (formato === "estatico") {
    return moldes.length === 1 && moldes[0] === "estatico" ? [] : ["o post estático tem uma lâmina só, do molde estatico"];
  }
  const meio = moldes.slice(1, -1);
  const ok = moldes[0] === "capa" && moldes[moldes.length - 1] === "cta" && meio.length >= 3 && meio.length <= 6 &&
    meio.every((m) => m === "texto" || m === "foto");
  return ok ? [] : ["o carrossel precisa de capa, de 3 a 6 lâminas de texto ou foto e o CTA no fim"];
}

/** Molde devolvido pela IA: obrigatórios, nomes únicos, logos do kit, cada campo marcado, sem script nem nada de fora. */
export function validarMolde(tipo: TipoMolde, html: string, campos: CampoMolde[], variantes: VarianteLogo[]): string[] {
  const motivos: string[] = [];
  const nomes = campos.map((c) => c.nome);
  if (new Set(nomes).size !== nomes.length) motivos.push("campos com nome repetido");
  for (const n of CAMPOS_OBRIGATORIOS[tipo]) if (!nomes.includes(n)) motivos.push(`falta o campo ${n}`);
  for (const c of campos) {
    if (!html.includes(`{{${c.nome}}}`)) motivos.push(`o campo ${c.nome} não está marcado no HTML`);
    if (c.tipo === "logo") {
      const m = NOME_LOGO.exec(c.nome);
      if (!m || !variantes.includes(m[1] as VarianteLogo)) motivos.push(`logo ${c.nome} não existe no kit`);
    }
    if (c.tipo === "imagem" && c.nome !== CAMPO_FOTO) motivos.push(`a imagem se chama ${CAMPO_FOTO}`);
    if (c.tipo === "texto" && !(c.max > 0)) motivos.push(`o campo ${c.nome} precisa de um limite`);
  }
  if (/<script/i.test(html)) motivos.push("o molde não pode ter script");
  if (/\bhttps?:\/\//i.test(html.replace(/http:\/\/www\.w3\.org\/[^"'\s]*/g, ""))) motivos.push("o molde não pode carregar nada de fora");
  return motivos;
}

/** Pilar da vez: o primeiro nunca usado; senão o usado há mais tempo. `usados`: do post mais novo para o mais velho. */
export function proximoPilar(pilares: Pilar[], usados: (string | null)[]): Pilar | null {
  if (!pilares.length) return null;
  const nunca = pilares.find((p) => !usados.includes(p.nome));
  if (nunca) return nunca;
  return [...pilares].sort((a, b) => usados.indexOf(b.nome) - usados.indexOf(a.nome))[0];
}

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira (AAAA-MM-DD) da semana do dia dado. */
export function segundaDaSemana(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  return somarDias(dia, -((d.getUTCDay() + 6) % 7));
}

/** Instante UTC de um dia e hora de Brasília (UTC-3; sem horário de verão desde 2019). */
export function instanteBrasilia(dia: string, hora: string): string {
  return new Date(`${dia}T${hora}:00-03:00`).toISOString();
}

/** Posts da agenda na semana que começa na segunda `segunda`, em ordem de horário. */
export function postsDaSemana(segunda: string, agenda: ItemAgenda[]): { origem_data: string; agendado_para: string; formato: Formato }[] {
  return agenda
    .map((a) => {
      const dia = somarDias(segunda, (a.dia + 6) % 7);
      return { origem_data: dia, agendado_para: instanteBrasilia(dia, a.hora), formato: a.formato };
    })
    .sort((x, y) => x.agendado_para.localeCompare(y.agendado_para));
}

/** Só as entradas do Log (cabeçalhos "### AAAA-MM-DD") dos últimos `dias` dias até `hoje`. */
export function recortarLog(texto: string, hoje: string, dias = 60): string {
  const limite = somarDias(hoje, -dias);
  return texto
    .split(/^(?=### \d{4}-\d{2}-\d{2})/m)
    .filter((parte) => {
      const m = /^### (\d{4}-\d{2}-\d{2})/.exec(parte);
      return m !== null && m[1] >= limite;
    })
    .join("")
    .trim();
}

/** Contexto do cliente para a IA: nota central, Log recente e documentos, nessa ordem, até `limite` caracteres. */
export function montarContexto(arquivos: { caminho: string; conteudo: string }[], limite = 100_000): string {
  const peso = (c: string) => (c === ARQUIVO_LOG ? 1 : c.includes("/") ? 2 : 0);
  const ordem = [...arquivos].sort((a, b) => peso(a.caminho) - peso(b.caminho) || a.caminho.localeCompare(b.caminho));
  let saida = "";
  for (const a of ordem) {
    const bloco = `\n\n=== ${a.caminho} ===\n${a.conteudo.trim()}`;
    if (saida.length + bloco.length > limite) {
      saida += bloco.slice(0, Math.max(0, limite - saida.length));
      break;
    }
    saida += bloco;
  }
  return saida.trim();
}

/** O que o script do cofre envia e remove: arquivos novos ou com hash diferente; os que sumiram do cofre. */
export function mudancasCofre(locais: Record<string, string>, remotos: Record<string, string>): { enviar: string[]; remover: string[] } {
  return {
    enviar: Object.keys(locais).filter((c) => remotos[c] !== locais[c]).sort(),
    remover: Object.keys(remotos).filter((c) => !(c in locais)).sort(),
  };
}

/**
 * Aplica o pedido de mudança: só as lâminas tocadas perdem o JPG (são remontadas). Foto pedida numa lâmina de texto
 * troca o molde para foto. Lâmina inexistente é ignorada. Não altera as listas recebidas.
 */
export function aplicarAlteracoes(laminas: Lamina[], legenda: string, alteracoes: Alteracao[]): { laminas: Lamina[]; legenda: string; imagens: boolean } {
  const novas: Lamina[] = laminas.map((l) => ({ ...l, campos: { ...l.campos }, ...(l.imagem ? { imagem: { ...l.imagem } } : {}) }));
  let novaLegenda = legenda;
  let imagens = false;
  for (const a of alteracoes) {
    if (a.alvo === "legenda") {
      if (a.valor !== null) novaLegenda = a.valor;
      continue;
    }
    const l = a.lamina !== null ? novas[a.lamina - 1] : undefined;
    if (!l) continue;
    if (a.alvo === "campo" && a.campo && a.campo !== CAMPO_FOTO && a.valor !== null) l.campos[a.campo] = a.valor;
    else if (a.alvo === "imagem" && a.descricao) {
      if (l.molde === "texto") l.molde = "foto";
      l.imagem = { descricao: a.descricao, pasta_id: a.pasta_id, pendente: true };
      imagens = true;
    } else if (a.alvo === "layout" && a.ajuste_css !== null) l.ajuste_css = a.ajuste_css;
    else continue;
    l.jpg_chave = null;
  }
  return { laminas: novas, legenda: novaLegenda, imagens };
}

/** Último uso de cada foto do Drive nos posts dados (id da foto → data do post). */
export function usosDeFotos(posts: { created_at: string; laminas: Lamina[] }[]): Record<string, string> {
  const usos: Record<string, string> = {};
  for (const p of posts) {
    for (const l of p.laminas ?? []) {
      const id = l?.imagem?.drive_id;
      if (id && (!usos[id] || usos[id] < p.created_at)) usos[id] = p.created_at;
    }
  }
  return usos;
}

/** O que falta para o cliente gerar posts de um formato. */
export function faltaParaGerar(
  c: { pasta_cofre: string | null; ig_conta_id: string | null; logos: Logo[]; moldes: Moldes },
  formato: Formato,
): string[] {
  const falta: string[] = [];
  if (!c.ig_conta_id) falta.push("conta do Instagram");
  if (!c.pasta_cofre) falta.push("pasta do cofre");
  if (!c.logos.length) falta.push("logo");
  const sem = MOLDES_DO_FORMATO[formato].filter((t) => !c.moldes[t]?.aprovado_em);
  if (sem.length) falta.push(`moldes aprovados (${sem.map((t) => ROTULO_MOLDE[t]).join(", ")})`);
  return falta;
}

/** Documento final para o navegador da Cloudflare: tamanho fixo, fontes, ajuste da lâmina e o aviso de pronto. */
export function htmlParaRender(html: string, o: { cssFontes: string; ajusteCss?: string }): string {
  const base = `<style>html,body{margin:0;padding:0;width:${LARGURA}px;height:${ALTURA}px;overflow:hidden}</style>`;
  const ajuste = o.ajusteCss ? `<style>${o.ajusteCss.replace(/<\/style/gi, "")}</style>` : "";
  const cabeca = `${base}<style>${o.cssFontes}</style>${ajuste}`;
  const pronto = `<script>Promise.all([document.fonts.ready,...Array.from(document.images).map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r}))]).then(()=>document.body.setAttribute("data-pronto","1"))</script>`;
  let doc = /<html[\s>]/i.test(html) ? html : `<!doctype html><html><head></head><body>${html}</body></html>`;
  doc = /<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, `${cabeca}</head>`) : doc.replace(/<body[^>]*>/i, (m) => `${m}${cabeca}`);
  return /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, `${pronto}</body>`) : doc + pronto;
}

const FORMATO_FONTE: Record<string, [string, string]> = {
  woff2: ["font/woff2", "woff2"], woff: ["font/woff", "woff"], ttf: ["font/ttf", "truetype"], otf: ["font/otf", "opentype"],
};

export function extensaoFonte(chave: string): string | null {
  const e = (chave.split(".").pop() ?? "").toLowerCase();
  return e in FORMATO_FONTE ? e : null;
}

export function fontFace(familia: string, ext: string, base64: string, peso = 400): string {
  const [mime, formato] = FORMATO_FONTE[ext];
  return `@font-face{font-family:"${familia.replace(/["\\]/g, "")}";src:url(data:${mime};base64,${base64}) format("${formato}");font-weight:${peso};font-display:block}`;
}

/** Motivos para recusar o texto que a IA devolveu: estrutura, limites, legenda e, na saúde, as regras do CFM/CFO. */
export function motivosDoTexto(r: RespostaTexto, formato: Formato, c: { moldes: Moldes; saude: boolean }): string[] {
  const motivos = conferirEstrutura(formato, r.laminas.map((l) => l.molde));
  r.laminas.forEach((l, i) => {
    const m = c.moldes[l.molde];
    if (!m) {
      motivos.push(`lâmina ${i + 1}: molde ${l.molde} não existe`);
      return;
    }
    const valores = Object.fromEntries(l.campos.map((y) => [y.nome, y.valor]));
    for (const x of conferirCampos(m.campos, valores)) motivos.push(`lâmina ${i + 1}, ${x}`);
  });
  if (!r.legenda.trim()) motivos.push("legenda vazia");
  if (r.legenda.length > LEGENDA_MAX) motivos.push(`legenda com ${r.legenda.length} caracteres (máximo ${LEGENDA_MAX})`);
  if (c.saude) {
    const todo = [r.legenda, ...r.laminas.flatMap((l) => l.campos.map((x) => x.valor))].join("\n");
    motivos.push(...motivosSaude(todo).map((m) => `saúde: ${m}`));
  }
  return motivos;
}

/** Lâminas a partir da resposta da IA: molde com foto sempre ganha imagem pendente (descrição ou, na falta, o título). */
export function laminasDaResposta(r: RespostaTexto, moldes: Moldes): Lamina[] {
  return r.laminas.map((l) => {
    const campos = Object.fromEntries(l.campos.map((x) => [x.nome, x.valor]));
    const temFoto = !!moldes[l.molde]?.campos.some((c) => c.tipo === "imagem");
    const lamina: Lamina = { molde: l.molde, campos, jpg_chave: null };
    if (temFoto) lamina.imagem = { descricao: l.imagem_descricao?.trim() || campos.titulo || "foto do negócio", pasta_id: l.pasta_id, pendente: true };
    return lamina;
  });
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test src/lib/conteudoRegras.test.ts`
Expected: todos PASS.

Run: `npm test`
Expected: todos PASS (os do GMN continuam passando).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/conteudo/regras.ts supabase/functions/gmn/regras.ts src/lib/conteudoRegras.test.ts
git commit -m "feat: aba Conteudo, regras puras (moldes, semana, cofre, ajustes) com testes"
```

---

### Task 3: Prompts e esquemas

**Exec:** haiku

**Files:**
- Create: `supabase/functions/conteudo/prompts.ts`
- Test: `src/lib/conteudoRegras.test.ts` (acrescentar no fim)

**Interfaces:**
- Consumes: tipos e constantes da Task 2.
- Produces: `ESQUEMA_MOLDE`, `ESQUEMA_TEXTO`, `ESQUEMA_AJUSTE`, `ESQUEMA_ESCOLHA`, `interface Mensagens { system; user }`, `promptMolde(o): Mensagens`, `promptTexto(o): { system; pedido }`, `promptAjuste(o): Mensagens`, `SYSTEM_ESCOLHA`, `pedidoEscolha(descricao, n)`, `promptImagem(descricao, pessoas)`.

- [ ] **Step 1: Acrescentar os testes**

No fim de `src/lib/conteudoRegras.test.ts` (e acrescentar o import no topo):

```ts
import { ESQUEMA_TEXTO, promptAjuste, promptMolde, promptTexto } from "../../supabase/functions/conteudo/prompts.ts";

test("promptTexto leva limites, tema fixo e subpastas", () => {
  const p = promptTexto({ formato: "carrossel", pilar: { nome: "Dica", descricao: "ensina" }, tema: "Buffet em julho", temasRecentes: ["x"],
    tomDeVoz: "direto", moldes: moldesC, pastas: [{ id: "p1", caminho: "Espaço", quantidade: 3 }], saude: false });
  assert.ok(p.pedido.includes("titulo (até 30 caracteres)"));
  assert.ok(p.pedido.includes('Use exatamente este tema: "Buffet em julho"'));
  assert.ok(p.pedido.includes('id "p1"'));
  assert.ok(!p.system.includes("CFM"));
  assert.ok(promptTexto({ formato: "estatico", pilar: null, tema: null, temasRecentes: [], tomDeVoz: "", moldes: { estatico: molde([t30]) }, pastas: [], saude: true }).system.includes("CFM"));
});

test("promptMolde cobra os campos do tipo e manda os moldes já criados", () => {
  const m = promptMolde({ tipo: "foto", designSystem: "azul", tomDeVoz: "", logos: [{ variante: "clara", chave: "k", largura: 600, altura: 200 }],
    fontes: [{ familia: "Satoshi", origem: "google" }], outros: [{ tipo: "capa", html: "<h1>capa</h1>" }] });
  assert.ok(m.user.includes("titulo, texto, foto"));
  assert.ok(m.user.includes("logo_clara"));
  assert.ok(m.user.includes("<h1>capa</h1>"));
});

test("promptAjuste numera as lâminas a partir de 1", () => {
  const m = promptAjuste({ laminas: [{ molde: "capa", campos: { titulo: "Oi" }, jpg_chave: "k" }], legenda: "L", moldes: moldesC, pastas: [], pedido: "mais curto" });
  assert.ok(m.user.includes('1. capa: titulo = "Oi" (até 30)'));
});

test("esquema do texto pede tema, legenda e lâminas", () => {
  assert.deepEqual(ESQUEMA_TEXTO.required, ["tema", "legenda", "laminas"]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test src/lib/conteudoRegras.test.ts`
Expected: FAIL (`prompts.ts` não existe).

- [ ] **Step 3: Escrever `supabase/functions/conteudo/prompts.ts`**

```ts
// Aba Conteúdo: o que vai para o Claude e os esquemas JSON das respostas (saída estruturada). Puro, sem rede.
import {
  ALTURA, CAMPOS_OBRIGATORIOS, LARGURA, MOLDES_DO_FORMATO, ROTULO_MOLDE, ROTULO_VARIANTE,
  type Fonte, type Formato, type Lamina, type Logo, type Molde, type Moldes, type PastaDrive, type Pilar, type TipoMolde,
} from "./regras.ts";

const textoOuNulo = { anyOf: [{ type: "string" }, { type: "null" }] };
const inteiroOuNulo = { anyOf: [{ type: "integer" }, { type: "null" }] };
const objeto = (props: Record<string, unknown>) =>
  ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });

export const ESQUEMA_MOLDE = objeto({
  html: { type: "string" },
  campos: {
    type: "array",
    items: objeto({ nome: { type: "string" }, tipo: { type: "string", enum: ["texto", "imagem", "logo"] }, max: { type: "integer" }, exemplo: { type: "string" } }),
  },
});

export const ESQUEMA_TEXTO = objeto({
  tema: { type: "string" },
  legenda: { type: "string" },
  laminas: {
    type: "array",
    items: objeto({
      molde: { type: "string", enum: ["capa", "texto", "foto", "cta", "estatico"] },
      campos: { type: "array", items: objeto({ nome: { type: "string" }, valor: { type: "string" } }) },
      imagem_descricao: textoOuNulo,
      pasta_id: textoOuNulo,
    }),
  },
});

export const ESQUEMA_AJUSTE = objeto({
  resposta: { type: "string" },
  alteracoes: {
    type: "array",
    items: objeto({
      alvo: { type: "string", enum: ["campo", "imagem", "legenda", "layout"] },
      lamina: inteiroOuNulo, campo: textoOuNulo, valor: textoOuNulo, descricao: textoOuNulo, pasta_id: textoOuNulo, ajuste_css: textoOuNulo,
    }),
  },
});

export const ESQUEMA_ESCOLHA = objeto({ escolhida: { type: "integer" } });

export interface Mensagens { system: string; user: string }

const REGRAS_TIPO: Record<TipoMolde, string> = {
  capa: "primeira lâmina do carrossel. Título forte que faz parar a rolagem ({{titulo}}, curto); pode ter {{subtitulo}} e {{foto}}; logo pequena.",
  texto: "lâmina de conteúdo só com texto: {{titulo}} e {{texto}} (até cerca de 280 caracteres), com o elemento gráfico do design system.",
  foto: "lâmina de conteúdo com foto: {{foto}} em destaque, {{titulo}} e {{texto}} com os mesmos limites da lâmina de texto.",
  cta: "última lâmina do carrossel: chamada para ação ({{titulo}}, e {{texto}} se quiser) e a logo em destaque.",
  estatico: "post de uma imagem só: {{titulo}}, pode ter {{texto}} e {{foto}}, com a logo.",
};

const SYSTEM_MOLDE = [
  "Você é diretor de arte e escreve moldes de posts de Instagram em HTML e CSS.",
  `Cada molde é um documento HTML completo de exatamente ${LARGURA}x${ALTURA} px (retrato 4:5), com o CSS dentro de <style>. Sem JavaScript e sem carregar nada de fora: sem links, @import, url() externa ou imagens de outros sites.`,
  "Siga o design system do cliente à risca: cores, tipografia, espaçamento, elementos gráficos e as regras de logo e de foto.",
  "Marque o que muda a cada post com {{nome}}: textos, a foto ({{foto}}, sempre como src de <img> com object-fit: cover) e as logos ({{logo_principal}}, {{logo_icone}}, {{logo_clara}}, {{logo_escura}}; só as variantes disponíveis, sempre como src de <img>, sem distorcer, recortar nem recolorir).",
  "O texto precisa caber sempre: dê a cada campo de texto um limite de caracteres (max) e use tamanhos de fonte que comportem esse limite; em último caso, corte linhas com line-clamp.",
  "Use só as famílias de fonte informadas, pelo nome (font-family), com uma fonte genérica de reserva.",
  "Em cada campo, dê um exemplo realista em português do Brasil, dentro do limite. Campos de imagem e de logo têm max 0 e exemplo vazio.",
].join("\n");

export function promptMolde(o: {
  tipo: TipoMolde; designSystem: string; tomDeVoz: string; logos: Logo[]; fontes: Fonte[];
  outros: { tipo: TipoMolde; html: string }[]; atual?: Molde; pedido?: string;
}): Mensagens {
  const partes = [
    `Molde: ${o.tipo} (${ROTULO_MOLDE[o.tipo]}): ${REGRAS_TIPO[o.tipo]}`,
    `Campos obrigatórios: ${CAMPOS_OBRIGATORIOS[o.tipo].join(", ")}. Pode criar outros campos de texto se o layout pedir (nomes em minúsculas, sem acento).`,
    `Logos disponíveis: ${o.logos.map((l) => `logo_${l.variante} (${ROTULO_VARIANTE[l.variante]}, ${l.largura}x${l.altura} px)`).join("; ")}.`,
    `Fontes: ${o.fontes.length ? o.fontes.map((f) => `${f.familia}${f.peso ? ` ${f.peso}` : ""}`).join(", ") : "nenhuma informada; use as do design system com reserva sans-serif"}.`,
    `Design system do cliente:\n${o.designSystem.trim()}`,
  ];
  if (o.tomDeVoz.trim()) partes.push(`Tom de voz (para os exemplos):\n${o.tomDeVoz.trim()}`);
  if (o.outros.length) partes.push(`Moldes já criados deste cliente (mantenha o mesmo estilo):\n${o.outros.map((m) => `### ${m.tipo}\n${m.html}`).join("\n\n")}`);
  if (o.atual && o.pedido) {
    partes.push(`Molde atual:\n${o.atual.html}\n\nCampos atuais: ${JSON.stringify(o.atual.campos)}\n\nPedido de mudança: ${o.pedido.trim()}\nMude só o que foi pedido.`);
  }
  return { system: SYSTEM_MOLDE, user: partes.join("\n\n") };
}

const descreverCampos = (m: Molde) =>
  m.campos.filter((c) => c.tipo === "texto").map((c) => `${c.nome} (até ${c.max} caracteres)`).join(", ");

export function promptTexto(o: {
  formato: Formato; pilar: Pilar | null; tema: string | null; temasRecentes: string[]; tomDeVoz: string;
  moldes: Moldes; pastas: PastaDrive[]; saude: boolean;
}): { system: string; pedido: string } {
  const system = [
    "Você é social media sênior e escreve posts de Instagram para o cliente do contexto, em português do Brasil, no tom de voz dele.",
    "Use só fatos do contexto do cliente; nunca invente preço, número, depoimento, prêmio, prazo ou promessa.",
    "Respeite o limite de caracteres de cada campo e preencha todos os campos de texto do molde de cada lâmina, e só eles.",
    "Legenda: gancho na primeira linha, desenvolve o tema, fecha com chamada para ação e até 5 hashtags relevantes; até 2.200 caracteres.",
    ...(o.saude ? ["Cliente da área da saúde: siga as regras do CFM e do CFO. Sem promessa de resultado, cura, antes e depois, preço, promoção, desconto, brinde ou superlativo (o melhor, o único, número 1)."] : []),
  ].join("\n");
  const tipos = MOLDES_DO_FORMATO[o.formato];
  const ordem = o.formato === "carrossel"
    ? "Formato: carrossel. Monte as lâminas nesta ordem: capa, de 3 a 6 lâminas de conteúdo (molde texto ou foto) e cta no fim."
    : "Formato: post estático. Uma lâmina só, do molde estatico.";
  const pedido = [
    ordem,
    `Moldes e campos:\n${tipos.map((t) => `- ${t}: ${descreverCampos(o.moldes[t]!)}${o.moldes[t]!.campos.some((c) => c.tipo === "imagem") ? "; tem foto" : ""}`).join("\n")}`,
    o.pilar ? `Pilar deste post: ${o.pilar.nome}${o.pilar.descricao ? ` (${o.pilar.descricao})` : ""}.` : "Sem pilar definido: escolha um assunto útil para o público do cliente.",
    o.tema
      ? `Use exatamente este tema: "${o.tema}".`
      : `Escolha um tema novo dentro do pilar.${o.temasRecentes.length ? ` Não repita estes temas recentes: ${o.temasRecentes.map((t) => `"${t}"`).join(", ")}.` : ""}`,
    "Em cada lâmina com foto, diga em imagem_descricao, numa frase, o que a foto deve mostrar, e em pasta_id o id da subpasta do Drive que mais combina (ou null se nenhuma servir). Nas lâminas sem foto, os dois ficam null.",
    o.pastas.length
      ? `Subpastas do Drive:\n${o.pastas.map((p) => `- id "${p.id}": ${p.caminho} (${p.quantidade} imagens)`).join("\n")}`
      : "O cliente não tem fotos no Drive: pasta_id sempre null.",
    o.tomDeVoz.trim() ? `Tom de voz:\n${o.tomDeVoz.trim()}` : "",
  ].filter(Boolean).join("\n\n");
  return { system, pedido };
}

export function promptAjuste(o: { laminas: Lamina[]; legenda: string; moldes: Moldes; pastas: PastaDrive[]; pedido: string }): Mensagens {
  const system = [
    "Você ajusta um post de Instagram já montado, conforme o pedido do dono da agência. Mude só o que foi pedido.",
    "Responda com a lista de alterações (os campos que não se aplicam ficam null):",
    "- campo: troca o texto de um campo de uma lâmina (lamina = número da lâmina, começando em 1; campo = nome do campo; valor = texto novo, dentro do limite);",
    "- imagem: troca a foto de uma lâmina (descricao = o que a nova foto deve mostrar; pasta_id = id da subpasta do Drive que combina, ou null);",
    "- legenda: valor = a legenda nova, inteira;",
    "- layout: ajuste visual de uma lâmina (ajuste_css = regras CSS que se sobrepõem ao molde, usando os seletores do HTML do molde).",
    "Em resposta, diga numa frase curta, em português, o que foi feito.",
  ].join("\n");
  const usados = [...new Set(o.laminas.map((l) => l.molde))];
  const linhas = o.laminas.map((l, i) => {
    const limites = Object.fromEntries((o.moldes[l.molde]?.campos ?? []).map((c) => [c.nome, c.max]));
    const textos = Object.entries(l.campos).map(([k, v]) => `${k} = "${v}" (até ${limites[k] ?? "?"})`).join("; ");
    return `${i + 1}. ${l.molde}: ${textos}${l.imagem ? `; foto: ${l.imagem.descricao}` : ""}`;
  });
  const user = [
    `Pedido: ${o.pedido.trim()}`,
    `Lâminas:\n${linhas.join("\n")}`,
    `Legenda atual:\n${o.legenda}`,
    o.pastas.length ? `Subpastas do Drive:\n${o.pastas.map((p) => `- id "${p.id}": ${p.caminho}`).join("\n")}` : "Sem fotos no Drive: pasta_id null.",
    `HTML dos moldes usados (para ajustes de layout):\n${usados.map((t) => `### ${t}\n${o.moldes[t]?.html ?? ""}`).join("\n\n")}`,
  ].join("\n\n");
  return { system, user };
}

export const SYSTEM_ESCOLHA = "Você escolhe fotos reais de um negócio para posts de Instagram.";

export function pedidoEscolha(descricao: string, n: number): string {
  return `Estas são ${n} fotos, na ordem (índices de 0 a ${n - 1}). Qual combina com: "${descricao}"? Responda o índice da que combina melhor, ou -1 se nenhuma servir (sem relação com a descrição, borrada, escura, com texto grande por cima ou com pessoas em situação constrangedora).`;
}

export function promptImagem(descricao: string, pessoas: boolean): string {
  return `Foto realista para um post de Instagram, em retrato: ${descricao}. ${pessoas ? "" : "Sem pessoas. "}Sem texto, letras, números, logos ou marca d'água. Luz natural, composição limpa, com área livre para texto por cima.`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test src/lib/conteudoRegras.test.ts`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/conteudo/prompts.ts src/lib/conteudoRegras.test.ts
git commit -m "feat: aba Conteudo, prompts e esquemas do Claude com testes"
```

---

### Task 4: Serviços da função (R2, Claude, Cloudflare, Drive, montagem) e imagem retrato no GMN

**Exec:** sonnet

**Files:**
- Modify: `supabase/functions/gmn/openai.ts` (`gerarImagem`)
- Create: `supabase/functions/conteudo/arquivos.ts`, `claude.ts`, `render.ts`, `drive.ts`, `montagem.ts`

**Interfaces:**
- Consumes: Task 2 (`ErroHttp`, `LARGURA`, `ALTURA`, `extensaoFonte`, `fontFace`, `htmlParaRender`, `preencherMolde`, tipos); `../gmn/google.ts` (`tokenGoogle`, `imagensDaPasta`); `../gmn/regras.ts` (`idPastaDrive`).
- Produces:
  - `gerarImagem(prompt, total?, o?: { size?: string; formato?: "png" | "jpeg" }): Promise<string>` (base64; chamadas antigas iguais).
  - `arquivos.ts`: `arquivosConfigurados()`, `guardar(chave, bytes, tipo)`, `ler(chave): {bytes, tipo}`, `base64(bytes)`, `dataUri(chave)`.
  - `claude.ts`: `claudeConfigurado()`, `gerarJson<T>({ system, conteudo, esquema, esforco, maxTokens? }): Promise<T>`.
  - `render.ts`: `class LimiteCloudflare`, `cloudflareConfigurado()`, `renderizar(html): Promise<Uint8Array>`, `cssGoogle(familia): Promise<string>`.
  - `drive.ts`: `lerPastas(sb, link): Promise<PastaDrive[]>`.
  - `montagem.ts`: `interface Recursos { cssFontes; logos }`, `carregarRecursos(c)`, `montarLamina(html, campos, valores, recursos, ajusteCss?)`.

- [ ] **Step 1: `gerarImagem` com tamanho e formato**

Em `supabase/functions/gmn/openai.ts`, trocar a função `gerarImagem` por:

```ts
/**
 * Imagem gerada pela OpenAI, em base64, como a OpenAI devolveu. Padrão: PNG paisagem, sempre sem a logo (o GMN aplica a
 * logo depois, por cima, em compor.ts, para nunca ser redesenhada). A aba Conteúdo pede retrato em JPEG.
 */
export async function gerarImagem(
  prompt: string, total?: AbortSignal, o: { size?: string; formato?: "png" | "jpeg" } = {},
): Promise<string> {
  const model = Deno.env.get("OPENAI_MODELO_IMAGEM") || "gpt-image-1";
  // quality "medium": o padrão ("auto") pode sair em "high", mais lento e caro.
  const d = await chamar("/images/generations", {
    model, prompt, size: o.size ?? "1536x1024", quality: "medium", n: 1, output_format: o.formato ?? "png",
  }, PRAZO.imagem, total, "imagem");
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== "string") throw new Error("OpenAI não devolveu a imagem.");
  return b64;
}
```

- [ ] **Step 2: `supabase/functions/conteudo/arquivos.ts`**

```ts
// Arquivos da aba Conteúdo no bucket de arquivos do sistema (R2, dentro de instagram/conteudo/), lidos e gravados pela função.
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_ARQUIVOS"];
export const arquivosConfigurados = () => VARS.every((v) => !!Deno.env.get(v));

function r2() {
  const faltam = VARS.filter((v) => !Deno.env.get(v));
  if (faltam.length) throw new Error(`Faltam secrets do R2: ${faltam.join(", ")}.`);
  return {
    // retries: 2 (o padrão do aws4fetch é 10, com espera crescente: estouraria o tempo da função)
    aws: new AwsClient({
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!, secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
      service: "s3", region: "auto", retries: 2,
    }),
    base: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${Deno.env.get("R2_BUCKET_ARQUIVOS")}`,
  };
}

const codificar = (chave: string) => chave.split("/").map(encodeURIComponent).join("/");

export async function guardar(chave: string, bytes: Uint8Array, tipo: string): Promise<void> {
  const { aws, base } = r2();
  const r = await aws.fetch(`${base}/${codificar(chave)}`, {
    method: "PUT", body: bytes as unknown as BodyInit, headers: { "Content-Type": tipo }, signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    console.error("R2 PUT", r.status, (await r.text().catch(() => "")).slice(0, 300));
    throw new Error(`Não foi possível guardar o arquivo (R2 respondeu ${r.status}).`);
  }
}

export async function ler(chave: string): Promise<{ bytes: Uint8Array; tipo: string }> {
  const { aws, base } = r2();
  const r = await aws.fetch(`${base}/${codificar(chave)}`, { method: "GET", signal: AbortSignal.timeout(30_000) });
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error(`Arquivo não encontrado no R2 (${r.status}): ${chave}`);
  }
  return { bytes: new Uint8Array(await r.arrayBuffer()), tipo: r.headers.get("content-type") || "application/octet-stream" };
}

export const base64 = (bytes: Uint8Array): string => encodeBase64(bytes);

export async function dataUri(chave: string): Promise<string> {
  const a = await ler(chave);
  return `data:${a.tipo};base64,${base64(a.bytes)}`;
}
```

- [ ] **Step 3: `supabase/functions/conteudo/claude.ts`**

```ts
// Claude na aba Conteúdo: resposta em JSON pela saída estruturada (output_config.format), com o fallback do servidor
// ligado (fallbacks "default": se o modelo recusar por política, a própria API tenta outro modelo na mesma chamada).
// deno-lint-ignore-file no-explicit-any
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";

let cliente: Anthropic | null = null;
export const claudeConfigurado = () => !!Deno.env.get("ANTHROPIC_API_KEY");

function api(): Anthropic {
  if (!claudeConfigurado()) throw new Error("Falta o secret ANTHROPIC_API_KEY.");
  return (cliente ??= new Anthropic({ maxRetries: 1, timeout: 120_000 }));
}

const modelo = () => Deno.env.get("CLAUDE_MODELO") || "claude-sonnet-5-5";

function erroClaude(e: any): Error {
  const status = Number(e?.status ?? 0);
  console.error("Claude:", status, e?.message);
  if (status === 401) return new Error("A chave do Claude foi recusada (confira o secret ANTHROPIC_API_KEY).");
  if (status === 429) return new Error("Limite de uso do Claude atingido; tenta de novo em instantes.");
  if (status === 400) return new Error("O Claude recusou o pedido (parâmetros).");
  if (status >= 500) return new Error("O Claude está com problema agora; tenta de novo em alguns minutos.");
  return new Error("Não foi possível falar com o Claude.");
}

/** `conteudo`: texto ou blocos (texto com cache_control, imagens em base64). Devolve o JSON já lido. */
export async function gerarJson<T>(o: {
  system: string; conteudo: string | any[]; esquema: object; esforco: "low" | "medium" | "high"; maxTokens?: number;
}): Promise<T> {
  const params: any = {
    model: modelo(),
    max_tokens: o.maxTokens ?? 16000,
    system: o.system,
    messages: [{ role: "user", content: o.conteudo }],
    output_config: { effort: o.esforco, format: { type: "json_schema", schema: o.esquema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
  let r: any;
  try {
    r = await api().beta.messages.create(params);
  } catch (e) {
    throw erroClaude(e);
  }
  if (r.stop_reason === "refusal") throw new Error("O Claude recusou o pedido.");
  if (r.stop_reason === "max_tokens") throw new Error("A resposta do Claude ficou longa demais.");
  const texto = (r.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  try {
    return JSON.parse(texto) as T;
  } catch {
    console.error("Claude devolveu JSON ilegível:", texto.slice(0, 300));
    throw new Error("O Claude devolveu uma resposta que não deu para ler.");
  }
}
```

- [ ] **Step 4: `supabase/functions/conteudo/render.ts`**

```ts
// HTML para JPG pelo Cloudflare Browser Rendering (API REST de screenshot) e o CSS das fontes do Google.
import { ALTURA, LARGURA } from "./regras.ts";

/** Limite de uso do Cloudflare (429): a montagem espera e tenta de novo, sem contar como tentativa. */
export class LimiteCloudflare extends Error {}

export const cloudflareConfigurado = () => !!Deno.env.get("CLOUDFLARE_ACCOUNT_ID") && !!Deno.env.get("CLOUDFLARE_BROWSER_TOKEN");

export async function renderizar(html: string): Promise<Uint8Array> {
  if (!cloudflareConfigurado()) throw new Error("Faltam os secrets CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_BROWSER_TOKEN.");
  const conta = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${conta}/browser-rendering/screenshot`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("CLOUDFLARE_BROWSER_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      html,
      viewport: { width: LARGURA, height: ALTURA },
      screenshotOptions: { type: "jpeg", quality: 90 },
      gotoOptions: { waitUntil: "load", timeout: 30000 },
      waitForSelector: { selector: "body[data-pronto]", timeout: 20000 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const tipo = r.headers.get("content-type") ?? "";
  if (r.ok && tipo.startsWith("image/")) return new Uint8Array(await r.arrayBuffer());
  const corpo = await r.text().catch(() => "");
  console.error("Cloudflare", r.status, corpo.slice(0, 300));
  if (r.status === 429) throw new LimiteCloudflare("Limite do Cloudflare atingido; a montagem tenta de novo em 10 minutos.");
  throw new Error(`O Cloudflare não conseguiu montar a lâmina (${r.status}).`);
}

const NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0 Safari/537.36";

/** CSS das fontes do Google: tenta os pesos comuns e, se a família não tiver todos, menos pesos. */
export async function cssGoogle(familia: string): Promise<string> {
  const f = encodeURIComponent(familia.trim()).replace(/%20/g, "+");
  for (const pesos of [":wght@300;400;500;600;700;800", ":wght@400;700", ""]) {
    const r = await fetch(`https://fonts.googleapis.com/css2?family=${f}${pesos}&display=block`, {
      headers: { "User-Agent": NAVEGADOR }, signal: AbortSignal.timeout(15_000),
    });
    if (r.ok) return await r.text();
    await r.body?.cancel();
  }
  throw new Error(`A fonte "${familia}" não existe no Google Fonts.`);
}
```

- [ ] **Step 5: `supabase/functions/conteudo/drive.ts`**

```ts
// Subpastas do Drive do cliente (até 4 níveis e 60 pastas), com a quantidade de imagens de cada uma. A raiz vira "Geral".
// deno-lint-ignore-file no-explicit-any
import { imagensDaPasta, tokenGoogle } from "../gmn/google.ts";
import { idPastaDrive } from "../gmn/regras.ts";
import { ErroHttp, type PastaDrive } from "./regras.ts";

async function listarPastas(token: string, paiId: string): Promise<{ id: string; name: string }[]> {
  const params = new URLSearchParams({
    q: `'${paiId.replace(/'/g, "\\'")}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
    fields: "files(id,name)", pageSize: "100", orderBy: "name", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
  });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
  });
  const corpo: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Drive respondeu", r.status, String(corpo?.error?.message ?? "").slice(0, 300));
    throw new Error("Não foi possível ler as pastas do Drive (confira o link e se a conta contato@ tem acesso).");
  }
  return corpo.files ?? [];
}

export async function lerPastas(sb: any, link: string): Promise<PastaDrive[]> {
  const raiz = idPastaDrive(link);
  if (!raiz) throw new ErroHttp(400, "Link da pasta do Drive não reconhecido.");
  const token = await tokenGoogle(sb);
  const saida: PastaDrive[] = [];
  let nivel = [{ id: raiz, caminho: "Geral" }];
  for (let i = 0; i < 4 && nivel.length && saida.length < 60; i++) {
    const proximo: { id: string; caminho: string }[] = [];
    for (const p of nivel) {
      const quantidade = (await imagensDaPasta(token, p.id)).length;
      if (quantidade) saida.push({ id: p.id, caminho: p.caminho, quantidade });
      for (const f of await listarPastas(token, p.id)) proximo.push({ id: f.id, caminho: i === 0 ? f.name : `${p.caminho} / ${f.name}` });
    }
    nivel = proximo;
  }
  return saida;
}
```

- [ ] **Step 6: `supabase/functions/conteudo/montagem.ts`**

```ts
// Montagem das lâminas: recursos do cliente (fontes e logos embutidas como data:, sem depender de CORS) e o HTML final.
import { base64, dataUri, ler } from "./arquivos.ts";
import { cssGoogle } from "./render.ts";
import { extensaoFonte, fontFace, htmlParaRender, preencherMolde, type CampoMolde, type Fonte, type Logo } from "./regras.ts";

/** cssFontes: @font-face e CSS do Google; logos: logo_<variante> → data: */
export interface Recursos { cssFontes: string; logos: Record<string, string> }

export async function carregarRecursos(c: { fontes: Fonte[]; logos: Logo[] }): Promise<Recursos> {
  const css: string[] = [];
  for (const f of c.fontes ?? []) {
    if (f.origem === "google") css.push(await cssGoogle(f.familia));
    else if (f.chave) {
      const ext = extensaoFonte(f.chave);
      if (!ext) continue;
      const a = await ler(f.chave);
      css.push(fontFace(f.familia, ext, base64(a.bytes), f.peso ?? 400));
    }
  }
  const logos: Record<string, string> = {};
  for (const l of c.logos ?? []) logos[`logo_${l.variante}`] = await dataUri(l.chave);
  return { cssFontes: css.join("\n"), logos };
}

export function montarLamina(html: string, campos: CampoMolde[], valores: Record<string, string>, r: Recursos, ajusteCss?: string): string {
  return htmlParaRender(preencherMolde(html, campos, { ...r.logos, ...valores }), { cssFontes: r.cssFontes, ajusteCss });
}
```

- [ ] **Step 7: Conferir os tipos com o Deno**

Run: `npx -y deno@2 check supabase/functions/conteudo/montagem.ts supabase/functions/conteudo/claude.ts supabase/functions/conteudo/drive.ts`
Expected: sem erro de tipo. (Se o `npx` não conseguir baixar o Deno, anotar no relatório e seguir; a Task 11 publica a função e o deploy acusa erro de sintaxe.)

Run: `npm test`
Expected: todos PASS (o GMN não mudou de comportamento).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/gmn/openai.ts supabase/functions/conteudo/arquivos.ts supabase/functions/conteudo/claude.ts supabase/functions/conteudo/render.ts supabase/functions/conteudo/drive.ts supabase/functions/conteudo/montagem.ts
git commit -m "feat: aba Conteudo, servicos da funcao (R2, Claude, Cloudflare, Drive, montagem)"
```

---

### Task 5: A fila (`passo`): texto, imagens e montagem

**Exec:** sonnet

**Files:**
- Create: `supabase/functions/conteudo/etapas.ts`

**Interfaces:**
- Consumes: Tasks 2, 3 e 4; `../gmn/google.ts` (`tokenGoogle`, `imagensDaPasta`, `baixarMiniatura`); `../gmn/openai.ts` (`gerarImagem`); `../gmn/regras.ts` (`ordemDeTentativa`).
- Produces: `passo(sb): Promise<{ posts: { id: string; status: string; erro?: string }[] }>`.

- [ ] **Step 1: Escrever `supabase/functions/conteudo/etapas.ts`**

```ts
// Fila dos posts: cada passada pega até 3 posts livres e avança cada um uma etapa (texto → imagens → montando → aguardando).
// Trava: `processando_desde` (só pega post livre ou travado há mais de 10 min); toda gravação confere o status.
// Imagens e montagem gravam a cada lâmina e param perto de 90 s: a próxima passada continua de onde parou.
// deno-lint-ignore-file no-explicit-any
import { decodeBase64, encodeBase64 } from "jsr:@std/encoding@1/base64";
import { baixarMiniatura, imagensDaPasta, tokenGoogle } from "../gmn/google.ts";
import { gerarImagem } from "../gmn/openai.ts";
import { ordemDeTentativa } from "../gmn/regras.ts";
import { dataUri, guardar } from "./arquivos.ts";
import { gerarJson } from "./claude.ts";
import { carregarRecursos, montarLamina } from "./montagem.ts";
import { ESQUEMA_ESCOLHA, ESQUEMA_TEXTO, SYSTEM_ESCOLHA, pedidoEscolha, promptImagem, promptTexto } from "./prompts.ts";
import { LimiteCloudflare, renderizar } from "./render.ts";
import {
  CAMPO_FOTO, MOLDES_DO_FORMATO, laminasDaResposta, montarContexto, motivosDoTexto, proximoPilar, usosDeFotos,
  type Formato, type Lamina, type Molde, type RespostaTexto, type StatusPost,
} from "./regras.ts";

const TRAVA_MS = 10 * 60_000;
const ORCAMENTO_MS = 90_000;
const MAX_TENTATIVAS = 3;
const msg = (e: any) => String(e?.message ?? e);
const livre = () => `processando_desde.is.null,processando_desde.lt."${new Date(Date.now() - TRAVA_MS).toISOString()}"`;

export async function passo(sb: any): Promise<{ posts: { id: string; status: string; erro?: string }[] }> {
  const { data, error } = await sb.from("conteudo_posts").select("id, status")
    .in("status", ["texto", "imagens", "montando"]).or(livre()).order("created_at").limit(3);
  if (error) throw new Error(error.message);
  const feitos = await Promise.all((data ?? []).map((p: any) => avancar(sb, p.id, p.status)));
  return { posts: feitos.filter((x) => x !== null) as { id: string; status: string; erro?: string }[] };
}

async function gravar(sb: any, id: string, status: string, campos: Record<string, unknown>): Promise<void> {
  const { error } = await sb.from("conteudo_posts").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id).eq("status", status);
  if (error) throw new Error(error.message);
}

async function avancar(sb: any, id: string, status: StatusPost): Promise<{ id: string; status: string; erro?: string } | null> {
  const { data: post } = await sb.from("conteudo_posts").update({ processando_desde: new Date().toISOString() })
    .eq("id", id).eq("status", status).or(livre()).select("*").maybeSingle();
  if (!post) return null; // outra passada pegou primeiro
  try {
    const { data: cliente, error } = await sb.from("conteudo_clientes").select("*").eq("id", post.conteudo_cliente_id).single();
    if (error) throw new Error(error.message);
    const campos = status === "texto" ? await etapaTexto(sb, post, cliente)
      : status === "imagens" ? await etapaImagens(sb, post, cliente)
      : await etapaMontagem(sb, post, cliente);
    await gravar(sb, id, status, { ...campos, processando_desde: null, tentativas: 0, erro: null, erro_etapa: null });
    return { id, status: String(campos.status) };
  } catch (e) {
    console.error("conteudo", status, id, e);
    // Limite do Cloudflare: não conta tentativa; a trava (processando_desde) segura o post por 10 minutos
    if (e instanceof LimiteCloudflare) {
      await gravar(sb, id, status, { aviso: msg(e) });
      return { id, status, erro: msg(e) };
    }
    const tentativas = (post.tentativas ?? 0) + 1;
    const fim = tentativas >= MAX_TENTATIVAS;
    await gravar(sb, id, status, fim
      ? { status: "erro", erro_etapa: status, erro: msg(e), tentativas, processando_desde: null }
      : { erro: msg(e), tentativas, processando_desde: null });
    return { id, status: fim ? "erro" : status, erro: msg(e) };
  }
}

async function etapaTexto(sb: any, post: any, c: any): Promise<Record<string, unknown>> {
  const formato = post.formato as Formato;
  const sem = MOLDES_DO_FORMATO[formato].filter((t) => !c.moldes?.[t]?.aprovado_em);
  if (sem.length) throw new Error(`Faltam moldes aprovados: ${sem.join(", ")}.`);
  const { data: arquivos, error } = await sb.from("conteudo_cofre").select("caminho, conteudo").eq("pasta", c.pasta_cofre ?? "");
  if (error) throw new Error(error.message);
  const contexto = montarContexto(arquivos ?? []);
  if (!contexto) throw new Error("O cofre deste cliente ainda não foi sincronizado.");
  const { data: recentes } = await sb.from("conteudo_posts").select("pilar, tema").eq("conteudo_cliente_id", c.id)
    .neq("id", post.id).not("tema", "is", null).order("created_at", { ascending: false }).limit(30);
  const pilares = c.pilares ?? [];
  const pilar = post.pilar
    ? pilares.find((p: any) => p.nome === post.pilar) ?? { nome: post.pilar, descricao: "" }
    : proximoPilar(pilares, (recentes ?? []).map((r: any) => r.pilar));
  const p = promptTexto({
    formato, pilar, tema: post.tema, temasRecentes: (recentes ?? []).map((r: any) => r.tema), tomDeVoz: c.tom_de_voz,
    moldes: c.moldes, pastas: c.drive_pastas ?? [], saude: c.saude,
  });
  // O contexto do cliente vai num bloco com cache: os posts do mesmo cliente na mesma semana reaproveitam
  const blocos: any[] = [
    { type: "text", text: `Contexto do cliente (cofre do Obsidian):\n\n${contexto}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: p.pedido },
  ];
  let r = await gerarJson<RespostaTexto>({ system: p.system, conteudo: blocos, esquema: ESQUEMA_TEXTO, esforco: "medium" });
  let motivos = motivosDoTexto(r, formato, c);
  if (motivos.length) {
    r = await gerarJson<RespostaTexto>({
      system: p.system, esquema: ESQUEMA_TEXTO, esforco: "medium",
      conteudo: [...blocos, { type: "text", text: `Uma versão anterior foi recusada por: ${motivos.join("; ")}. Corrija esses pontos.` }],
    });
    motivos = motivosDoTexto(r, formato, c);
  }
  if (motivos.length) throw new Error(`O texto veio com problema: ${motivos.join("; ")}.`);
  const laminas = laminasDaResposta(r, c.moldes);
  return {
    status: laminas.some((l) => l.imagem?.pendente) ? "imagens" : "montando",
    tema: r.tema, pilar: pilar?.nome ?? null, laminas, legenda: r.legenda,
  };
}

async function usosDoCliente(sb: any, clienteId: string): Promise<Record<string, string>> {
  const desde = new Date(Date.now() - 56 * 86_400_000).toISOString();
  const { data, error } = await sb.from("conteudo_posts").select("laminas, created_at").eq("conteudo_cliente_id", clienteId).gte("created_at", desde);
  if (error) throw new Error(error.message);
  return usosDeFotos(data ?? []);
}

/** Até 3 fotos da subpasta, as menos usadas; o Claude olha e escolhe a que combina (ou nenhuma). */
async function fotoDoDrive(sb: any, descricao: string, pastaId: string | null, usos: Record<string, string>): Promise<{ drive_id: string; chave: string } | null> {
  if (!pastaId) return null;
  const token = await tokenGoogle(sb);
  const lista = (await imagensDaPasta(token, pastaId)).filter((f) => f.thumbnailLink);
  const fotos: { id: string; bytes: Uint8Array; tipo: "image/jpeg" | "image/png" }[] = [];
  for (const id of ordemDeTentativa(lista.map((f) => f.id), usos, 3)) {
    const f = lista.find((x) => x.id === id)!;
    try {
      fotos.push({ id, ...(await baixarMiniatura(token, f.thumbnailLink!)) });
    } catch (e) {
      console.error("miniatura do Drive", id, e);
    }
  }
  if (!fotos.length) return null;
  const r = await gerarJson<{ escolhida: number }>({
    system: SYSTEM_ESCOLHA, esquema: ESQUEMA_ESCOLHA, esforco: "low", maxTokens: 4000,
    conteudo: [
      ...fotos.map((f) => ({ type: "image", source: { type: "base64", media_type: f.tipo, data: encodeBase64(f.bytes) } })),
      { type: "text", text: pedidoEscolha(descricao, fotos.length) },
    ],
  });
  const f = fotos[r.escolhida];
  if (!f) return null;
  const chave = `instagram/conteudo/fotos/${f.id}.${f.tipo === "image/png" ? "png" : "jpg"}`;
  await guardar(chave, f.bytes, f.tipo);
  usos[f.id] = new Date().toISOString();
  return { drive_id: f.id, chave };
}

async function etapaImagens(sb: any, post: any, c: any): Promise<Record<string, unknown>> {
  const inicio = Date.now();
  const laminas: Lamina[] = post.laminas;
  const usos = await usosDoCliente(sb, c.id);
  let aviso: string | null = post.aviso;
  for (let i = 0; i < laminas.length; i++) {
    const l = laminas[i];
    if (!l.imagem?.pendente) continue;
    if (Date.now() - inicio > ORCAMENTO_MS) return { status: "imagens", laminas, aviso };
    const drive = await fotoDoDrive(sb, l.imagem.descricao, l.imagem.pasta_id ?? null, usos).catch((e) => {
      console.error("foto do Drive", e);
      return null;
    });
    if (drive) laminas[i] = { ...l, imagem: { ...l.imagem, pendente: false, origem: "drive", ...drive }, jpg_chave: null };
    else {
      try {
        const b64 = await gerarImagem(promptImagem(l.imagem.descricao, c.ia_pode_pessoas), undefined, { size: "1024x1536", formato: "jpeg" });
        const chave = `instagram/conteudo/ia/${crypto.randomUUID()}.jpg`;
        await guardar(chave, decodeBase64(b64), "image/jpeg");
        laminas[i] = { ...l, imagem: { ...l.imagem, pendente: false, origem: "ia", chave }, jpg_chave: null };
      } catch (e) {
        if (l.molde !== "foto") throw e; // capa e estático com foto não montam sem ela: a etapa tenta de novo
        laminas[i] = { molde: "texto", campos: l.campos, jpg_chave: null };
        aviso = `A imagem da lâmina ${i + 1} falhou (${msg(e)}); ela saiu só com texto.`;
      }
    }
    await gravar(sb, post.id, "imagens", { laminas, aviso });
  }
  return { status: "montando", laminas, aviso };
}

async function etapaMontagem(sb: any, post: any, c: any): Promise<Record<string, unknown>> {
  const inicio = Date.now();
  const laminas: Lamina[] = post.laminas;
  const recursos = await carregarRecursos(c);
  for (let i = 0; i < laminas.length; i++) {
    const l = laminas[i];
    if (l.jpg_chave) continue;
    if (Date.now() - inicio > ORCAMENTO_MS) return { status: "montando", laminas };
    const molde: Molde | undefined = c.moldes?.[l.molde];
    if (!molde) throw new Error(`O molde ${l.molde} não existe mais.`);
    const valores: Record<string, string> = { ...l.campos };
    if (l.imagem?.chave) valores[CAMPO_FOTO] = await dataUri(l.imagem.chave);
    const jpg = await renderizar(montarLamina(molde.html, molde.campos, valores, recursos, l.ajuste_css));
    const chave = `instagram/conteudo/posts/${post.id}/${i + 1}-${Date.now()}.jpg`;
    await guardar(chave, jpg, "image/jpeg");
    laminas[i] = { ...l, jpg_chave: chave };
    await gravar(sb, post.id, "montando", { laminas });
  }
  return { status: "aguardando", laminas };
}
```

- [ ] **Step 2: Conferir os tipos com o Deno**

Run: `npx -y deno@2 check supabase/functions/conteudo/etapas.ts`
Expected: sem erro de tipo (mesma ressalva da Task 4 se o Deno não baixar).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/conteudo/etapas.ts
git commit -m "feat: aba Conteudo, fila de posts (texto, imagens do Drive ou da IA, montagem)"
```

---

### Task 6: Moldes e o roteador da função

**Exec:** sonnet

**Files:**
- Create: `supabase/functions/conteudo/moldes.ts`, `supabase/functions/conteudo/index.ts`
- Modify: `supabase/config.toml` (acrescentar no fim)

**Interfaces:**
- Consumes: Tasks 2 a 5; `../gmn/acesso.ts` (`acessoLiberado`).
- Produces: `gerarMolde(sb, clienteId, tipo, pedido?): Promise<Molde>`; endpoint `POST /functions/v1/conteudo` com as ações `passo`, `cofre_hashes`, `cofre_sync`, `cofre_ler`, `drive_pastas`, `molde`, `molde_ajustar`, `semana`, `ajustar` (contratos no comentário do topo do `index.ts`).

- [ ] **Step 1: `supabase/functions/conteudo/moldes.ts`**

```ts
// Moldes do cliente: o Claude escreve um molde por chamada (HTML/CSS 1080x1350 com campos {{nome}}) e a prévia é montada
// com os textos de exemplo, pelo mesmo caminho das lâminas. Pedido de mudança gera nova versão, que volta a pedir aprovação.
// deno-lint-ignore-file no-explicit-any
import { guardar } from "./arquivos.ts";
import { gerarJson } from "./claude.ts";
import { carregarRecursos, montarLamina } from "./montagem.ts";
import { ESQUEMA_MOLDE, promptMolde } from "./prompts.ts";
import { renderizar } from "./render.ts";
import { ErroHttp, IMAGEM_EXEMPLO, TIPOS_MOLDE, validarMolde, type CampoMolde, type Molde, type TipoMolde } from "./regras.ts";

export async function gerarMolde(sb: any, clienteId: string, tipo: TipoMolde, pedido?: string): Promise<Molde> {
  if (!TIPOS_MOLDE.includes(tipo)) throw new ErroHttp(400, "Tipo de molde inválido.");
  const { data: c, error } = await sb.from("conteudo_clientes").select("*").eq("id", clienteId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new ErroHttp(404, "Cliente não encontrado.");
  if (!c.design_system.trim()) throw new ErroHttp(400, "Preencha o design system do cliente antes de criar os moldes.");
  if (!c.logos.length) throw new ErroHttp(400, "Envie pelo menos uma logo antes de criar os moldes.");
  const atual: Molde | undefined = c.moldes?.[tipo];
  if (pedido !== undefined && !atual) throw new ErroHttp(400, "Este molde ainda não existe.");
  const outros = TIPOS_MOLDE.filter((t) => t !== tipo && c.moldes?.[t]).map((t) => ({ tipo: t, html: c.moldes[t].html as string }));
  const variantes = c.logos.map((l: any) => l.variante);
  const m = promptMolde({ tipo, designSystem: c.design_system, tomDeVoz: c.tom_de_voz, logos: c.logos, fontes: c.fontes, outros, atual, pedido });
  const inicio = Date.now();
  const pedir = (extra = "") => gerarJson<{ html: string; campos: CampoMolde[] }>({
    system: m.system, conteudo: m.user + extra, esquema: ESQUEMA_MOLDE, esforco: "medium", maxTokens: 32000,
  });
  let r = await pedir();
  let motivos = validarMolde(tipo, r.html, r.campos, variantes);
  // Uma nova tentativa só se ainda sobra tempo na função
  if (motivos.length && Date.now() - inicio < 60_000) {
    r = await pedir(`\n\nA versão anterior foi recusada por: ${motivos.join("; ")}. Corrija.`);
    motivos = validarMolde(tipo, r.html, r.campos, variantes);
  }
  if (motivos.length) throw new Error(`O molde veio com problema: ${motivos.join("; ")}. Tente de novo.`);
  const recursos = await carregarRecursos(c);
  const exemplo = Object.fromEntries(r.campos.filter((x) => x.tipo !== "logo").map((x) => [x.nome, x.tipo === "imagem" ? IMAGEM_EXEMPLO : x.exemplo]));
  const jpg = await renderizar(montarLamina(r.html, r.campos, exemplo, recursos));
  const previa = `instagram/conteudo/moldes/${c.id}-${tipo}-${Date.now()}.jpg`;
  await guardar(previa, jpg, "image/jpeg");
  const molde: Molde = { html: r.html, campos: r.campos, versao: (atual?.versao ?? 0) + 1, aprovado_em: null, previa_chave: previa };
  // Relê os moldes antes de gravar: outro molde pode ter sido aprovado na tela enquanto este era feito
  const { data: fresco, error: e2 } = await sb.from("conteudo_clientes").select("moldes").eq("id", c.id).single();
  if (e2) throw new Error(e2.message);
  const { error: e3 } = await sb.from("conteudo_clientes")
    .update({ moldes: { ...(fresco.moldes ?? {}), [tipo]: molde }, updated_at: new Date().toISOString() }).eq("id", c.id);
  if (e3) throw new Error(e3.message);
  return molde;
}
```

`IMAGEM_EXEMPLO` é `data:image/svg+xml,...` e `preencherMolde` aceita `data:image/`.

- [ ] **Step 2: `supabase/functions/conteudo/index.ts`**

```ts
// Aba Conteúdo (spec docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md).
//   GET                                                     -> { claude, cloudflare, r2, cofre }   secrets configurados?
//   POST { acao: "passo" }                                  -> { posts }            relógio (aberta, como a do Instagram)
//   POST { acao: "cofre_hashes" }                (x-cofre-key) -> { pastas, hashes } pastas ligadas e hashes guardados
//   POST { acao: "cofre_sync", pastas?, arquivos, remover } (x-cofre-key) -> { gravados, removidos }
//   POST { acao: "cofre_ler", pasta? }                      -> { pastas, sincronizado_em } | { arquivos, total, sincronizado_em }
//        com pasta: só os arquivos do kit (nome com "Design System" ou "tom de voz")
//   POST { acao: "drive_pastas", cliente_id }               -> { pastas }           lê as subpastas do Drive e grava no cliente
//   POST { acao: "molde", cliente_id, tipo }                -> { molde }            cria (ou refaz) um molde com prévia
//   POST { acao: "molde_ajustar", cliente_id, tipo, pedido } -> { molde }           nova versão do molde pelo pedido
//   POST { acao: "semana", segunda, cliente_id? }           -> { criados, pulados } posts da agenda da semana
//   POST { acao: "ajustar", post_id, pedido }               -> { resposta, status } pedido de mudança num post aguardando
// Fora passo e cofre_*, exige x-google-id-token (e-mail em ALLOWED_GOOGLE_EMAILS) ou x-swipe-key, como a função gmn.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { acessoLiberado } from "../gmn/acesso.ts";
import { arquivosConfigurados } from "./arquivos.ts";
import { claudeConfigurado, gerarJson } from "./claude.ts";
import { lerPastas } from "./drive.ts";
import { passo } from "./etapas.ts";
import { gerarMolde } from "./moldes.ts";
import { ESQUEMA_AJUSTE, promptAjuste } from "./prompts.ts";
import { cloudflareConfigurado } from "./render.ts";
import { ErroHttp, aplicarAlteracoes, faltaParaGerar, postsDaSemana, segundaDaSemana, type Alteracao } from "./regras.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-swipe-key, x-google-id-token, x-cofre-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const agora = () => new Date().toISOString();
const texto = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
const DO_KIT = /design system|tom[\s_-]*de[\s_-]*voz/i;

function chaveDoCofre(req: Request): boolean {
  const chave = Deno.env.get("COFRE_SYNC_KEY") ?? "";
  const enviada = req.headers.get("x-cofre-key") ?? "";
  if (!chave || chave.length !== enviada.length) return false;
  let d = 0;
  for (let i = 0; i < chave.length; i++) d |= chave.charCodeAt(i) ^ enviada.charCodeAt(i);
  return d === 0;
}

async function cofreHashes(sb: any) {
  const { data: ligados, error } = await sb.from("conteudo_clientes").select("pasta_cofre").not("pasta_cofre", "is", null);
  if (error) throw new Error(error.message);
  const pastas = [...new Set((ligados ?? []).map((x: any) => x.pasta_cofre as string))];
  const hashes: Record<string, Record<string, string>> = {};
  if (pastas.length) {
    const { data, error: e2 } = await sb.from("conteudo_cofre").select("pasta, caminho, hash").in("pasta", pastas);
    if (e2) throw new Error(e2.message);
    for (const r of data ?? []) (hashes[r.pasta] ??= {})[r.caminho] = r.hash;
  }
  return { pastas, hashes };
}

async function cofreSync(sb: any, corpo: any) {
  const quando = agora();
  if (Array.isArray(corpo.pastas)) {
    const pastas = corpo.pastas.filter((p: unknown) => texto(p, 200));
    const { error } = await sb.from("conteudo_cofre")
      .upsert({ pasta: "", caminho: "__pastas__", hash: "", conteudo: JSON.stringify(pastas), atualizado_em: quando });
    if (error) throw new Error(error.message);
  }
  const arquivos = (Array.isArray(corpo.arquivos) ? corpo.arquivos : [])
    .filter((a: any) => texto(a?.pasta, 200) && texto(a?.caminho, 300) && texto(a?.hash, 128) && typeof a?.conteudo === "string" && a.conteudo.length <= 1_000_000)
    .map((a: any) => ({ pasta: a.pasta, caminho: a.caminho, hash: a.hash, conteudo: a.conteudo, atualizado_em: quando }));
  if (arquivos.length) {
    const { error } = await sb.from("conteudo_cofre").upsert(arquivos, { onConflict: "pasta,caminho" });
    if (error) throw new Error(error.message);
  }
  let removidos = 0;
  for (const r of Array.isArray(corpo.remover) ? corpo.remover : []) {
    if (!texto(r?.pasta, 200) || !texto(r?.caminho, 300)) continue;
    const { error } = await sb.from("conteudo_cofre").delete().eq("pasta", r.pasta).eq("caminho", r.caminho);
    if (error) throw new Error(error.message);
    removidos++;
  }
  return { gravados: arquivos.length, removidos };
}

async function cofreLer(sb: any, pasta: string | null) {
  const { data: lista, error } = await sb.from("conteudo_cofre").select("conteudo, atualizado_em").eq("pasta", "").eq("caminho", "__pastas__").maybeSingle();
  if (error) throw new Error(error.message);
  const sincronizado_em = lista?.atualizado_em ?? null;
  if (pasta === null) return { pastas: lista ? JSON.parse(lista.conteudo) : [], sincronizado_em };
  const { data, error: e2 } = await sb.from("conteudo_cofre").select("caminho, conteudo").eq("pasta", pasta);
  if (e2) throw new Error(e2.message);
  const linhas = data ?? [];
  return {
    arquivos: linhas.filter((l: any) => DO_KIT.test(l.caminho.split("/").pop() ?? "")).map((l: any) => ({ caminho: l.caminho, conteudo: l.conteudo })),
    total: linhas.length,
    sincronizado_em,
  };
}

async function drivePastas(sb: any, clienteId: string) {
  const { data: c, error } = await sb.from("conteudo_clientes").select("id, drive_url").eq("id", clienteId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new ErroHttp(404, "Cliente não encontrado.");
  if (!c.drive_url.trim()) throw new ErroHttp(400, "Cole o link da pasta do Drive antes.");
  const pastas = await lerPastas(sb, c.drive_url);
  const { error: e2 } = await sb.from("conteudo_clientes").update({ drive_pastas: pastas, updated_at: agora() }).eq("id", c.id);
  if (e2) throw new Error(e2.message);
  return { pastas };
}

async function gerarSemana(sb: any, segunda: string, clienteId: string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(segunda) || segundaDaSemana(segunda) !== segunda) {
    throw new ErroHttp(400, "Informe a segunda-feira da semana (AAAA-MM-DD).");
  }
  let q = sb.from("conteudo_clientes").select("*, clientes(nome)");
  if (clienteId) q = q.eq("id", clienteId);
  const { data: clientes, error } = await q;
  if (error) throw new Error(error.message);
  let criados = 0;
  const pulados: { cliente: string; motivo: string }[] = [];
  for (const c of clientes ?? []) {
    const nome = c.clientes?.nome ?? "Cliente";
    const itens = postsDaSemana(segunda, c.agenda ?? []);
    if (!itens.length) {
      pulados.push({ cliente: nome, motivo: "sem dias na agenda" });
      continue;
    }
    const faltas = [...new Set(itens.flatMap((p) => faltaParaGerar(c, p.formato)))];
    if (faltas.length) pulados.push({ cliente: nome, motivo: `falta ${faltas.join(", ")}` });
    const prontos = itens.filter((p) => !faltaParaGerar(c, p.formato).length);
    if (!prontos.length) continue;
    const { data, error: e2 } = await sb.from("conteudo_posts")
      .upsert(prontos.map((p) => ({ ...p, conteudo_cliente_id: c.id, status: "texto" })), { onConflict: "conteudo_cliente_id,origem_data", ignoreDuplicates: true })
      .select("id");
    if (e2) throw new Error(e2.message);
    criados += data?.length ?? 0;
  }
  return { criados, pulados };
}

async function ajustar(sb: any, postId: string, pedido: string) {
  if (!pedido.trim()) throw new ErroHttp(400, "Escreva o que mudar.");
  const { data: post, error } = await sb.from("conteudo_posts").select("*").eq("id", postId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!post) throw new ErroHttp(404, "Post não encontrado.");
  if (post.status !== "aguardando") throw new ErroHttp(409, "O post não está aguardando aprovação.");
  const { data: c, error: e2 } = await sb.from("conteudo_clientes").select("moldes, drive_pastas").eq("id", post.conteudo_cliente_id).single();
  if (e2) throw new Error(e2.message);
  const m = promptAjuste({ laminas: post.laminas, legenda: post.legenda, moldes: c.moldes, pastas: c.drive_pastas ?? [], pedido });
  const r = await gerarJson<{ resposta: string; alteracoes: Alteracao[] }>({ system: m.system, conteudo: m.user, esquema: ESQUEMA_AJUSTE, esforco: "low" });
  const novo = aplicarAlteracoes(post.laminas, post.legenda, r.alteracoes);
  const remontar = novo.laminas.some((l) => !l.jpg_chave);
  const status = novo.imagens ? "imagens" : remontar ? "montando" : "aguardando";
  const pedidos = [...(post.pedidos ?? []), { texto: pedido.trim(), em: agora(), resultado: r.resposta }];
  const { data: gravado, error: e3 } = await sb.from("conteudo_posts")
    .update({ laminas: novo.laminas, legenda: novo.legenda, status, pedidos, tentativas: 0, erro: null, updated_at: agora() })
    .eq("id", post.id).eq("status", "aguardando").select("id").maybeSingle();
  if (e3) throw new Error(e3.message);
  if (!gravado) throw new ErroHttp(409, "O post mudou enquanto o pedido era feito; abra de novo.");
  return { resposta: r.resposta, status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method === "GET") {
    return json({ claude: claudeConfigurado(), cloudflare: cloudflareConfigurado(), r2: arquivosConfigurados(), cofre: !!Deno.env.get("COFRE_SYNC_KEY") });
  }
  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "Corpo inválido." }, 400);
  }
  const acao = String(corpo?.acao ?? "");
  const doCofre = acao === "cofre_hashes" || acao === "cofre_sync";
  const liberado = doCofre ? chaveDoCofre(req) : acao === "passo" || (await acessoLiberado(req));
  if (!liberado) return json({ erro: "Acesso negado." }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    switch (acao) {
      case "passo": return json(await passo(sb));
      case "cofre_hashes": return json(await cofreHashes(sb));
      case "cofre_sync": return json(await cofreSync(sb, corpo));
      case "cofre_ler": return json(await cofreLer(sb, corpo.pasta ? String(corpo.pasta) : null));
      case "drive_pastas": return json(await drivePastas(sb, String(corpo.cliente_id ?? "")));
      case "molde": return json({ molde: await gerarMolde(sb, String(corpo.cliente_id ?? ""), corpo.tipo) });
      case "molde_ajustar": {
        const pedido = String(corpo.pedido ?? "").trim();
        if (!pedido) throw new ErroHttp(400, "Escreva o que mudar no molde.");
        return json({ molde: await gerarMolde(sb, String(corpo.cliente_id ?? ""), corpo.tipo, pedido) });
      }
      case "semana": return json(await gerarSemana(sb, String(corpo.segunda ?? ""), corpo.cliente_id ? String(corpo.cliente_id) : null));
      case "ajustar": return json(await ajustar(sb, String(corpo.post_id ?? ""), String(corpo.pedido ?? "")));
      default: return json({ erro: `Ação desconhecida: ${acao}` }, 400);
    }
  } catch (e: any) {
    if (e instanceof ErroHttp) return json({ erro: e.message }, e.status);
    console.error(acao, e);
    return json({ erro: String(e?.message ?? e) }, 502);
  }
});
```

- [ ] **Step 3: `supabase/config.toml`**

Acrescentar no fim:

```toml

[functions.conteudo]
verify_jwt = false
```

- [ ] **Step 4: Conferir os tipos com o Deno**

Run: `npx -y deno@2 check supabase/functions/conteudo/index.ts`
Expected: sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/conteudo/moldes.ts supabase/functions/conteudo/index.ts supabase/config.toml
git commit -m "feat: aba Conteudo, funcao conteudo (moldes, cofre, Drive, semana, pedido de mudanca)"
```

---

### Task 7: Script do cofre

**Exec:** sonnet (lida com chave)

**Files:**
- Create: `tools/cofre-sync/sync.mjs`

**Interfaces:**
- Consumes: `ARQUIVO_LOG`, `mudancasCofre`, `recortarLog` (Task 2); ações `cofre_hashes` e `cofre_sync` (Task 6).
- Produces: comando `node tools/cofre-sync/sync.mjs` que lê `%USERPROFILE%\.gestao\cofre-sync.json` = `{ "url": "https://uajusldnvzgakffofkhl.supabase.co/functions/v1/conteudo", "chave": "<COFRE_SYNC_KEY>", "cofre": "C:\\Users\\Andre\\06. Obsidian Clientes\\Clientes" }`.

- [ ] **Step 1: Escrever `tools/cofre-sync/sync.mjs`**

```js
// Copia o cofre de clientes do Obsidian para a aba Conteúdo (spec docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md).
// Só lê o cofre. Envia, das pastas ligadas na aba, só o que mudou: nota central, Documentos/*.md e o Log dos últimos 60 dias.
// Uso: node tools/cofre-sync/sync.mjs   (o Agendador de Tarefas do Windows roda de hora em hora)
// Config (fora do repositório): %USERPROFILE%\.gestao\cofre-sync.json = { url, chave, cofre }
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ARQUIVO_LOG, mudancasCofre, recortarLog } from "../../supabase/functions/conteudo/regras.ts";

const cfg = JSON.parse(readFileSync(join(homedir(), ".gestao", "cofre-sync.json"), "utf8"));
const CLIENTES = join(cfg.cofre, "01 Clientes");
const LOTE_MAX = 1_500_000;
const hash = (s) => createHash("sha256").update(s).digest("hex");
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function chamar(corpo) {
  const r = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cofre-key": cfg.chave },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `a função respondeu ${r.status}`);
  return j;
}

function arquivosDaPasta(pasta) {
  const dir = join(CLIENTES, pasta);
  const saida = {};
  const central = join(dir, `${pasta}.md`);
  if (existsSync(central)) saida[`${pasta}.md`] = readFileSync(central, "utf8");
  const log = join(dir, "Log.md");
  if (existsSync(log)) saida[ARQUIVO_LOG] = recortarLog(readFileSync(log, "utf8"), hoje);
  const docs = join(dir, "Documentos");
  if (existsSync(docs)) {
    for (const f of readdirSync(docs)) if (f.toLowerCase().endsWith(".md")) saida[`Documentos/${f}`] = readFileSync(join(docs, f), "utf8");
  }
  return saida;
}

const pastas = readdirSync(CLIENTES).filter((p) => statSync(join(CLIENTES, p)).isDirectory()).sort();
const remoto = await chamar({ acao: "cofre_hashes" });
let lote = { acao: "cofre_sync", pastas, arquivos: [], remover: [] };
let tamanho = 0;
let enviados = 0;
let removidos = 0;
async function enviar() {
  const r = await chamar(lote);
  enviados += r.gravados;
  removidos += r.removidos;
  lote = { acao: "cofre_sync", arquivos: [], remover: [] };
  tamanho = 0;
}
for (const pasta of remoto.pastas) {
  if (!pastas.includes(pasta)) continue; // pasta renomeada ou apagada: a cópia fica até a pasta ser trocada na aba
  const locais = arquivosDaPasta(pasta);
  const hashes = Object.fromEntries(Object.entries(locais).map(([c, t]) => [c, hash(t)]));
  const { enviar: novos, remover } = mudancasCofre(hashes, remoto.hashes[pasta] ?? {});
  for (const caminho of remover) lote.remover.push({ pasta, caminho });
  for (const caminho of novos) {
    lote.arquivos.push({ pasta, caminho, hash: hashes[caminho], conteudo: locais[caminho] });
    tamanho += locais[caminho].length;
    if (tamanho > LOTE_MAX) await enviar();
  }
}
await enviar();
console.log(`${new Date().toISOString()} cofre: ${pastas.length} pastas, ${enviados} arquivos enviados, ${removidos} removidos`);
```

- [ ] **Step 2: Commit** (o teste do script é na Task 11, com a função no ar)

```bash
git add tools/cofre-sync/sync.mjs
git commit -m "feat: aba Conteudo, script que sincroniza o cofre de clientes"
```

---

### Task 8: Dados da tela (`src/lib/conteudo.ts`)

**Exec:** haiku

**Files:**
- Create: `src/lib/conteudo.ts`

**Interfaces:**
- Consumes: Task 2 (tipos, `instanteBrasilia`, `somarDias`); `cabecalhosDeAcesso` (`@/lib/googleDrive`); `normalizarLogo`, `normalizarFoto` (`@/lib/gmnImagem`); `enviarR2` (`@/lib/r2`); RPC `conteudo_aprovar` (Task 1).
- Produces: `ClienteConteudo`, `PostConteudo`, `PedidoMudanca`, `CamposCliente`; `urlArquivo(chave)`, `haQuanto(iso)`, `fetchClientes()`, `ligarCliente(v)`, `salvarCliente(id, campos)`, `desligarCliente(id)`, `enviarLogo(clienteId, variante, arquivo)`, `enviarFonte(clienteId, arquivo, familia, peso)`, `cofrePastas()`, `cofreArquivos(pasta)`, `lerPastasDrive(clienteId)`, `criarMolde(clienteId, tipo)`, `ajustarMolde(clienteId, tipo, pedido)`, `aprovarMolde(clienteId, tipo)`, `usarAjusteNoMolde(clienteId, tipo, css)`, `avancarFila()`, `gerarSemana(segunda, clienteId?)`, `novoPost(v)`, `fetchPostsDaSemana(segunda)`, `pedirMudanca(postId, pedido)`, `aprovarPost(postId, quando)`, `descartarPost(id)`, `trocarData(id, quando)`, `trocarFormato(post, formato)`, `salvarTextos(post, laminas, legenda)`, `trocarFoto(post, indice, arquivo)`, `tentarDeNovo(post)`.

- [ ] **Step 1: Escrever `src/lib/conteudo.ts`**

```ts
// Aba Conteúdo (spec docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md): clientes ligados, posts, arquivos
// no R2 (módulo instagram, pasta conteudo/) e chamadas à função conteudo. As tabelas novas não estão no types.ts gerado.
import { supabase } from "@/integrations/supabase/client";
import { cabecalhosDeAcesso } from "@/lib/googleDrive";
import { normalizarFoto, normalizarLogo } from "@/lib/gmnImagem";
import { enviarR2 } from "@/lib/r2";
import {
  instanteBrasilia, somarDias, type Fonte, type Formato, type ItemAgenda, type Lamina, type Logo, type Molde, type Moldes,
  type PastaDrive, type Pilar, type StatusPost, type TipoMolde, type VarianteLogo,
} from "../../supabase/functions/conteudo/regras.ts";

export interface ClienteConteudo {
  id: string; cliente_id: string; pasta_cofre: string | null; ig_conta_id: string | null; ativo: boolean; logos: Logo[];
  tom_de_voz: string; design_system: string; fontes: Fonte[]; saude: boolean; ia_pode_pessoas: boolean; drive_url: string;
  drive_pastas: PastaDrive[]; pilares: Pilar[]; agenda: ItemAgenda[]; moldes: Moldes; created_at: string; updated_at: string;
  clientes: { nome: string } | null;
}
export interface PedidoMudanca { texto: string; em: string; resultado: string }
export interface PostConteudo {
  id: string; conteudo_cliente_id: string; formato: Formato; pilar: string | null; tema: string | null; agendado_para: string;
  origem_data: string | null; laminas: Lamina[]; legenda: string; pedidos: PedidoMudanca[]; status: StatusPost;
  processando_desde: string | null; erro_etapa: StatusPost | null; tentativas: number; erro: string | null; aviso: string | null;
  ig_post_id: string | null; created_at: string; updated_at: string;
}
export type CamposCliente = Partial<Omit<ClienteConteudo, "id" | "cliente_id" | "created_at" | "updated_at" | "clientes">>;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCAO = `${SUPABASE_URL}/functions/v1/conteudo`;
const clientesTab = () => supabase.from("conteudo_clientes" as any) as any;
const postsTab = () => supabase.from("conteudo_posts" as any) as any;

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(FUNCAO, { method: "POST", headers: await cabecalhosDeAcesso(), body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.erro ?? `A função conteudo respondeu ${r.status}.`);
  return j as T;
}

/** Endereço fixo de um arquivo do R2 (a função r2 redireciona para um link assinado). */
export const urlArquivo = (chave: string) => `${SUPABASE_URL}/functions/v1/r2?c=${encodeURIComponent(chave)}`;

export function haQuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

// ------------------------------------------------------------------ clientes

export async function fetchClientes(): Promise<ClienteConteudo[]> {
  const { data, error } = await clientesTab().select("*, clientes(nome)").order("created_at");
  if (error) throw error;
  return (data ?? []) as ClienteConteudo[];
}

export async function ligarCliente(v: { cliente_id: string; pasta_cofre: string | null; ig_conta_id: string | null }): Promise<void> {
  const { error } = await clientesTab().insert([v]);
  if (error) throw error;
}

export async function salvarCliente(id: string, campos: CamposCliente): Promise<void> {
  const { error } = await clientesTab().update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function desligarCliente(id: string): Promise<void> {
  const { error } = await clientesTab().delete().eq("id", id);
  if (error) throw error;
}

async function medidas(b: Blob): Promise<{ largura: number; altura: number }> {
  const img = await createImageBitmap(b);
  const m = { largura: img.width, altura: img.height };
  img.close();
  return m;
}

export async function enviarLogo(clienteId: string, variante: VarianteLogo, arquivo: File): Promise<Logo> {
  const png = await normalizarLogo(arquivo);
  const caminho = `conteudo/logos/${clienteId}-${variante}-${Date.now()}.png`;
  await enviarR2("instagram", caminho, png, "image/png");
  return { variante, chave: `instagram/${caminho}`, ...(await medidas(png)) };
}

export async function enviarFonte(clienteId: string, arquivo: File, familia: string, peso: number): Promise<Fonte> {
  const ext = (arquivo.name.split(".").pop() ?? "").toLowerCase();
  if (!["woff2", "woff", "ttf", "otf"].includes(ext)) throw new Error("Envie a fonte em WOFF2, WOFF, TTF ou OTF.");
  const caminho = `conteudo/fontes/${clienteId}-${Date.now()}.${ext}`;
  await enviarR2("instagram", caminho, arquivo, arquivo.type || `font/${ext}`);
  return { familia: familia.trim(), origem: "arquivo", chave: `instagram/${caminho}`, peso };
}

// ------------------------------------------------------------------ cofre e Drive

export const cofrePastas = () => chamar<{ pastas: string[]; sincronizado_em: string | null }>({ acao: "cofre_ler" });
export const cofreArquivos = (pasta: string) =>
  chamar<{ arquivos: { caminho: string; conteudo: string }[]; total: number; sincronizado_em: string | null }>({ acao: "cofre_ler", pasta });
export const lerPastasDrive = (clienteId: string) => chamar<{ pastas: PastaDrive[] }>({ acao: "drive_pastas", cliente_id: clienteId });

// ------------------------------------------------------------------ moldes

export const criarMolde = (clienteId: string, tipo: TipoMolde) => chamar<{ molde: Molde }>({ acao: "molde", cliente_id: clienteId, tipo });
export const ajustarMolde = (clienteId: string, tipo: TipoMolde, pedido: string) =>
  chamar<{ molde: Molde }>({ acao: "molde_ajustar", cliente_id: clienteId, tipo, pedido });

async function moldesAtuais(clienteId: string): Promise<Moldes> {
  const { data, error } = await clientesTab().select("moldes").eq("id", clienteId).single();
  if (error) throw error;
  return (data?.moldes ?? {}) as Moldes;
}

export async function aprovarMolde(clienteId: string, tipo: TipoMolde): Promise<void> {
  const moldes = await moldesAtuais(clienteId);
  const m = moldes[tipo];
  if (!m) throw new Error("O molde não existe mais.");
  await salvarCliente(clienteId, { moldes: { ...moldes, [tipo]: { ...m, aprovado_em: new Date().toISOString() } } });
}

/** O ajuste de layout de uma lâmina passa a valer no molde (próximos posts). O molde segue aprovado. */
export async function usarAjusteNoMolde(clienteId: string, tipo: TipoMolde, css: string): Promise<void> {
  const moldes = await moldesAtuais(clienteId);
  const m = moldes[tipo];
  if (!m) throw new Error("O molde não existe mais.");
  const estilo = `<style>${css.replace(/<\/style/gi, "")}</style>`;
  const html = /<\/head>/i.test(m.html) ? m.html.replace(/<\/head>/i, `${estilo}</head>`) : estilo + m.html;
  await salvarCliente(clienteId, { moldes: { ...moldes, [tipo]: { ...m, html, versao: m.versao + 1 } } });
}

// ------------------------------------------------------------------ posts

/** Pede à função para avançar a fila agora, sem esperar o relógio (a ação passo é aberta). */
export function avancarFila(): void {
  fetch(FUNCAO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "passo" }) }).catch(() => {});
}

export async function gerarSemana(segunda: string, clienteId?: string): Promise<{ criados: number; pulados: { cliente: string; motivo: string }[] }> {
  const r = await chamar<{ criados: number; pulados: { cliente: string; motivo: string }[] }>({ acao: "semana", segunda, cliente_id: clienteId ?? null });
  if (r.criados) avancarFila();
  return r;
}

export async function novoPost(v: { conteudo_cliente_id: string; formato: Formato; agendado_para: string }): Promise<void> {
  const { error } = await postsTab().insert([{ ...v, status: "texto" }]);
  if (error) throw error;
  avancarFila();
}

export async function fetchPostsDaSemana(segunda: string): Promise<PostConteudo[]> {
  const { data, error } = await postsTab().select("*")
    .gte("agendado_para", instanteBrasilia(segunda, "00:00")).lt("agendado_para", instanteBrasilia(somarDias(segunda, 7), "00:00"))
    .neq("status", "descartado").order("agendado_para");
  if (error) throw error;
  return (data ?? []) as PostConteudo[];
}

export async function pedirMudanca(postId: string, pedido: string): Promise<{ resposta: string; status: string }> {
  const r = await chamar<{ resposta: string; status: string }>({ acao: "ajustar", post_id: postId, pedido });
  if (r.status !== "aguardando") avancarFila();
  return r;
}

export async function aprovarPost(postId: string, quando: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("conteudo_aprovar", { p_post: postId, p_quando: quando });
  if (error) throw new Error(error.message);
}

/** Muda o post só se ele ainda estiver em `de` (outra aba ou a fila podem ter mexido nele). */
async function mudarSe(id: string, de: StatusPost, campos: Record<string, unknown>): Promise<void> {
  const { data, error } = await postsTab().update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id).eq("status", de).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("O post mudou enquanto você mexia nele; abra de novo.");
}

export const descartarPost = (id: string) => mudarSe(id, "aguardando", { status: "descartado" });
export const trocarData = (id: string, quando: string) => mudarSe(id, "aguardando", { agendado_para: quando });

export async function trocarFormato(post: PostConteudo, formato: Formato): Promise<void> {
  await mudarSe(post.id, "aguardando", { formato, laminas: [], status: "texto", tentativas: 0, erro: null, aviso: null });
  avancarFila();
}

/** Textos editados à mão: só as lâminas com texto diferente são remontadas; mudar só a legenda não remonta nada. */
export async function salvarTextos(post: PostConteudo, laminas: Lamina[], legenda: string): Promise<void> {
  const novas = laminas.map((l, i) => (JSON.stringify(l.campos) !== JSON.stringify(post.laminas[i]?.campos) ? { ...l, jpg_chave: null } : l));
  const remontar = novas.some((l) => !l.jpg_chave);
  await mudarSe(post.id, "aguardando", { laminas: novas, legenda, ...(remontar ? { status: "montando" } : {}) });
  if (remontar) avancarFila();
}

export async function trocarFoto(post: PostConteudo, indice: number, arquivo: File): Promise<void> {
  const jpg = await normalizarFoto(arquivo);
  const caminho = `conteudo/fotos/envio-${crypto.randomUUID()}.jpg`;
  await enviarR2("instagram", caminho, jpg, "image/jpeg");
  const laminas = post.laminas.map((l, i) => (i !== indice ? l : {
    ...l, molde: l.molde === "texto" ? "foto" : l.molde,
    imagem: { descricao: l.imagem?.descricao ?? "", origem: "envio" as const, chave: `instagram/${caminho}` }, jpg_chave: null,
  }));
  await mudarSe(post.id, "aguardando", { laminas, status: "montando" });
  avancarFila();
}

export async function tentarDeNovo(post: PostConteudo): Promise<void> {
  await mudarSe(post.id, "erro", { status: post.erro_etapa ?? "texto", erro: null, tentativas: 0, processando_desde: null });
  avancarFila();
}
```

- [ ] **Step 2: Conferir os tipos**

Run: `npx tsc --noEmit -p .`
Expected: sem erro novo em `src/lib/conteudo.ts` (se o projeto já tem erros antigos, comparar a contagem com `git stash` antes; só os deste arquivo importam).

- [ ] **Step 3: Commit**

```bash
git add src/lib/conteudo.ts
git commit -m "feat: aba Conteudo, camada de dados da tela"
```

---

### Task 9: Rota, menu, Clientes e gaveta (Kit da marca, Pilares e agenda)

**Exec:** haiku

**Files:**
- Create: `src/routes/_authenticated/conteudo.tsx`, `src/components/conteudo/Clientes.tsx`, `src/components/conteudo/GavetaCliente.tsx`, `src/components/conteudo/AbaKit.tsx`, `src/components/conteudo/AbaAgenda.tsx`
- Modify: `src/lib/nav.tsx` (import `Sparkles` e item logo depois de "Instagram"), `src/routeTree.gen.ts` (rota)

**Interfaces:**
- Consumes: Task 8; `fetchClientesOpcoes` (`@/lib/gmn`); `fetchContas` (`@/lib/instagram`); `DIAS_CURTOS`, `HORARIOS` (`supabase/functions/gmn/regras.ts`); `ACEITA_IMAGENS` (`@/lib/gmnImagem`).
- Produces: `<Clientes clientes recarregar />`, `<GavetaCliente cliente fechar recarregar />` (usa `AbaMoldes` da Task 10: até ela existir, a aba Moldes mostra "Em breve"; a Task 10 troca), `<AbaKit cliente recarregar />`, `<AbaAgenda cliente recarregar />`; rota `/conteudo` com abas Semana (placeholder até a Task 11) e Clientes.

- [ ] **Step 1: `src/routes/_authenticated/conteudo.tsx`**

```tsx
// Aba Conteúdo: posts semanais gerados a partir do cofre, do kit da marca e dos moldes de cada cliente, com aprovação.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clientes } from "@/components/conteudo/Clientes";
import { fetchClientes, type ClienteConteudo } from "@/lib/conteudo";

export const Route = createFileRoute("/_authenticated/conteudo")({ component: ConteudoPage });

function ConteudoPage() {
  const [clientes, setClientes] = useState<ClienteConteudo[] | null>(null);
  const carregar = () => fetchClientes().then(setClientes).catch((e) => toast.error(e.message));
  useEffect(() => { carregar(); }, []);
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="h-6 w-6" />Conteúdo</h1>
      <Tabs defaultValue="semana">
        <TabsList>
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
        </TabsList>
        <TabsContent value="semana"><p className="text-sm text-muted-foreground">Em breve.</p></TabsContent>
        <TabsContent value="clientes"><Clientes clientes={clientes} recarregar={carregar} /></TabsContent>
      </Tabs>
    </div>
  );
}
```

Antes de escrever, abrir `src/routes/_authenticated/gmn.tsx` e usar o mesmo invólucro externo (classes do `div` de fora) da página do GMN, se for diferente de `space-y-4`.

- [ ] **Step 2: `src/components/conteudo/Clientes.tsx`**

```tsx
// Aba Conteúdo, área Clientes: os clientes ligados, o que falta em cada um e o "Ligar cliente".
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchClientesOpcoes, type ClienteOpcao } from "@/lib/gmn";
import { fetchContas, type ContaInstagram } from "@/lib/instagram";
import { cofrePastas, ligarCliente, type ClienteConteudo } from "@/lib/conteudo";
import { faltaParaGerar, type Formato } from "../../../supabase/functions/conteudo/regras.ts";
import { GavetaCliente } from "./GavetaCliente";

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div className="space-y-1"><Label>{rotulo}</Label>{children}</div>;
}

/** O que falta, olhando os formatos que a agenda usa (sem agenda, conta como carrossel). */
export function faltaDoCliente(c: ClienteConteudo): string[] {
  const formatos: Formato[] = c.agenda.length ? [...new Set(c.agenda.map((a) => a.formato))] : ["carrossel"];
  const falta = new Set(formatos.flatMap((f) => faltaParaGerar(c, f)));
  if (!c.agenda.length) falta.add("dias na agenda");
  return [...falta];
}

export function Clientes({ clientes, recarregar }: { clientes: ClienteConteudo[] | null; recarregar: () => void }) {
  const [ligar, setLigar] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  if (!clientes) return <Loader2 className="h-5 w-5 animate-spin" />;
  const cliente = clientes.find((c) => c.id === aberto) ?? null;
  return (
    <div className="space-y-3">
      <Button onClick={() => setLigar(true)}><Plus className="mr-1 h-4 w-4" />Ligar cliente</Button>
      {!clientes.length && <p className="text-sm text-muted-foreground">Nenhum cliente ligado ainda.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clientes.map((c) => {
          const falta = faltaDoCliente(c);
          return (
            <Card key={c.id} role="button" tabIndex={0} className="cursor-pointer hover:bg-muted/50"
              onClick={() => setAberto(c.id)} onKeyDown={(e) => e.key === "Enter" && setAberto(c.id)}>
              <CardContent className="space-y-2 p-4">
                <div className="font-medium">{c.clientes?.nome ?? "Cliente"}</div>
                <div className="text-xs text-muted-foreground">{c.agenda.length} {c.agenda.length === 1 ? "post" : "posts"} por semana</div>
                {falta.length ? <p className="text-xs text-amber-600">Falta: {falta.join(", ")}</p> : <Badge variant="secondary">Pronto para gerar</Badge>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <LigarCliente aberto={ligar} fechar={() => setLigar(false)} ligados={clientes.map((c) => c.cliente_id)}
        aoLigar={() => { setLigar(false); recarregar(); }} />
      {cliente && <GavetaCliente cliente={cliente} fechar={() => setAberto(null)} recarregar={recarregar} />}
    </div>
  );
}

function LigarCliente({ aberto, fechar, ligados, aoLigar }: { aberto: boolean; fechar: () => void; ligados: string[]; aoLigar: () => void }) {
  const [opcoes, setOpcoes] = useState<ClienteOpcao[]>([]);
  const [pastas, setPastas] = useState<string[]>([]);
  const [contas, setContas] = useState<ContaInstagram[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [pasta, setPasta] = useState("");
  const [conta, setConta] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setClienteId(""); setPasta(""); setConta("");
    fetchClientesOpcoes().then(setOpcoes).catch((e) => toast.error(e.message));
    cofrePastas().then((r) => setPastas(r.pastas)).catch((e) => toast.error(`Cofre: ${e.message}`));
    fetchContas().then((cs) => setContas(cs.filter((c) => c.ativa))).catch((e) => toast.error(e.message));
  }, [aberto]);
  const livres = opcoes.filter((o) => !ligados.includes(o.id));
  function escolherCliente(id: string) {
    setClienteId(id);
    const nome = livres.find((o) => o.id === id)?.nome.toLowerCase();
    const igual = pastas.find((p) => p.toLowerCase() === nome);
    if (igual) setPasta(igual);
  }
  async function salvar() {
    setSalvando(true);
    try {
      await ligarCliente({ cliente_id: clienteId, pasta_cofre: pasta || null, ig_conta_id: conta || null });
      toast.success("Cliente ligado.");
      aoLigar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ligar cliente</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Campo rotulo="Cliente">
            <Select value={clienteId} onValueChange={escolherCliente}>
              <SelectTrigger><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
              <SelectContent>{livres.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo rotulo="Pasta no cofre de clientes">
            <Select value={pasta} onValueChange={setPasta}>
              <SelectTrigger><SelectValue placeholder={pastas.length ? "Escolha a pasta" : "Cofre ainda não sincronizado"} /></SelectTrigger>
              <SelectContent>{pastas.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo rotulo="Conta do Instagram">
            <Select value={conta} onValueChange={setConta}>
              <SelectTrigger><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
              <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={c.id}>@{c.usuario}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
        </div>
        <DialogFooter><Button disabled={!clienteId || salvando} onClick={salvar}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Ligar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: `src/components/conteudo/GavetaCliente.tsx`**

```tsx
// Gaveta do cliente na aba Conteúdo: Kit da marca, Pilares e agenda, Moldes, e desligar o cliente.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cofreArquivos, desligarCliente, haQuanto, type ClienteConteudo } from "@/lib/conteudo";
import { AbaAgenda } from "./AbaAgenda";
import { AbaKit } from "./AbaKit";

export function GavetaCliente({ cliente, fechar, recarregar }: { cliente: ClienteConteudo; fechar: () => void; recarregar: () => void }) {
  const [cofre, setCofre] = useState<string>("carregando...");
  const [confirmar, setConfirmar] = useState(false);
  useEffect(() => {
    if (!cliente.pasta_cofre) { setCofre("sem pasta do cofre"); return; }
    cofreArquivos(cliente.pasta_cofre)
      .then((r) => setCofre(`${r.total} ${r.total === 1 ? "arquivo copiado" : "arquivos copiados"}, sincronizado ${haQuanto(r.sincronizado_em)}`))
      .catch((e) => setCofre(`não deu para ler (${e.message})`));
  }, [cliente.pasta_cofre]);
  async function desligar() {
    try {
      await desligarCliente(cliente.id);
      toast.success("Cliente desligado.");
      fechar();
      recarregar();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  return (
    <Sheet open onOpenChange={(v) => !v && fechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{cliente.clientes?.nome ?? "Cliente"}</SheetTitle>
          <SheetDescription>Cofre: {cofre}</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="kit" className="mt-4">
          <TabsList>
            <TabsTrigger value="kit">Kit da marca</TabsTrigger>
            <TabsTrigger value="agenda">Pilares e agenda</TabsTrigger>
            <TabsTrigger value="moldes">Moldes</TabsTrigger>
          </TabsList>
          <TabsContent value="kit"><AbaKit cliente={cliente} recarregar={recarregar} /></TabsContent>
          <TabsContent value="agenda"><AbaAgenda cliente={cliente} recarregar={recarregar} /></TabsContent>
          <TabsContent value="moldes"><p className="text-sm text-muted-foreground">Em breve.</p></TabsContent>
        </Tabs>
        <div className="mt-8 border-t pt-4">
          {confirmar
            ? <Button variant="destructive" onClick={desligar}>Clique de novo para desligar (os posts gerados deste cliente somem)</Button>
            : <Button variant="ghost" className="text-destructive" onClick={() => setConfirmar(true)}>Desligar cliente</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: `src/components/conteudo/AbaKit.tsx`**

```tsx
// Kit da marca: ligação (pasta do cofre e conta), logos, tom de voz, design system, fontes, saúde e Drive.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderSync, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ACEITA_IMAGENS } from "@/lib/gmnImagem";
import { fetchContas, type ContaInstagram } from "@/lib/instagram";
import {
  cofreArquivos, cofrePastas, enviarFonte, enviarLogo, lerPastasDrive, salvarCliente, urlArquivo, type ClienteConteudo,
} from "@/lib/conteudo";
import { ROTULO_VARIANTE, VARIANTES_LOGO, type VarianteLogo } from "../../../supabase/functions/conteudo/regras.ts";
import { Campo } from "./Clientes";

const formDe = (c: ClienteConteudo) => ({
  pasta_cofre: c.pasta_cofre ?? "", ig_conta_id: c.ig_conta_id ?? "", tom_de_voz: c.tom_de_voz, design_system: c.design_system,
  saude: c.saude, ia_pode_pessoas: c.ia_pode_pessoas, drive_url: c.drive_url,
});
const PESOS = ["300", "400", "500", "600", "700", "800"];

export function AbaKit({ cliente, recarregar }: { cliente: ClienteConteudo; recarregar: () => void }) {
  const [f, setF] = useState(() => formDe(cliente));
  const [pastas, setPastas] = useState<string[]>([]);
  const [contas, setContas] = useState<ContaInstagram[]>([]);
  const [cofre, setCofre] = useState<{ destino: "tom_de_voz" | "design_system"; arquivos: { caminho: string; conteudo: string }[] } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [google, setGoogle] = useState("");
  const [arquivoFonte, setArquivoFonte] = useState({ familia: "", peso: "400" });
  // Rascunho só reinicia ao trocar de cliente (logo e fonte gravam sozinhas e não podem apagar o que está sendo digitado)
  useEffect(() => { setF(formDe(cliente)); }, [cliente.id]);
  useEffect(() => {
    cofrePastas().then((r) => setPastas(r.pastas)).catch(() => {});
    fetchContas().then((cs) => setContas(cs.filter((c) => c.ativa))).catch(() => {});
  }, []);
  const mudou = JSON.stringify(f) !== JSON.stringify(formDe(cliente));

  async function fazer(nome: string, acao: () => Promise<unknown>, ok?: string) {
    setOcupado(nome);
    try {
      await acao();
      if (ok) toast.success(ok);
      recarregar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOcupado(null);
    }
  }
  const salvar = () => fazer("salvar", () => salvarCliente(cliente.id, { ...f, pasta_cofre: f.pasta_cofre || null, ig_conta_id: f.ig_conta_id || null }), "Kit salvo.");
  const trocarLogo = (v: VarianteLogo, arquivo: File) => fazer(`logo-${v}`, async () => {
    const logo = await enviarLogo(cliente.id, v, arquivo);
    await salvarCliente(cliente.id, { logos: [...cliente.logos.filter((l) => l.variante !== v), logo] });
  }, "Logo enviada.");
  const removerLogo = (v: VarianteLogo) => fazer(`logo-${v}`, () => salvarCliente(cliente.id, { logos: cliente.logos.filter((l) => l.variante !== v) }));
  const addGoogle = () => fazer("fonte", async () => {
    await salvarCliente(cliente.id, { fontes: [...cliente.fontes, { familia: google.trim(), origem: "google" }] });
    setGoogle("");
  });
  const addArquivo = (arquivo: File) => fazer("fonte", async () => {
    const fonte = await enviarFonte(cliente.id, arquivo, arquivoFonte.familia, Number(arquivoFonte.peso));
    await salvarCliente(cliente.id, { fontes: [...cliente.fontes, fonte] });
    setArquivoFonte({ familia: "", peso: "400" });
  }, "Fonte enviada.");
  const removerFonte = (i: number) => fazer("fonte", () => salvarCliente(cliente.id, { fontes: cliente.fontes.filter((_, j) => j !== i) }));
  const puxar = (destino: "tom_de_voz" | "design_system") => fazer("cofre", async () => {
    if (!f.pasta_cofre) throw new Error("Escolha a pasta do cofre antes.");
    const r = await cofreArquivos(f.pasta_cofre);
    if (!r.arquivos.length) throw new Error("O cofre deste cliente não tem nota de design system nem de tom de voz.");
    setCofre({ destino, arquivos: r.arquivos });
  });
  const lerDrive = () => fazer("drive", async () => {
    await salvarCliente(cliente.id, { drive_url: f.drive_url.trim() });
    const r = await lerPastasDrive(cliente.id);
    toast.success(`${r.pastas.length} ${r.pastas.length === 1 ? "pasta com imagens" : "pastas com imagens"}.`);
  });

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Pasta no cofre de clientes">
          <Select value={f.pasta_cofre} onValueChange={(v) => setF({ ...f, pasta_cofre: v })}>
            <SelectTrigger><SelectValue placeholder="Escolha a pasta" /></SelectTrigger>
            <SelectContent>{pastas.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </Campo>
        <Campo rotulo="Conta do Instagram">
          <Select value={f.ig_conta_id} onValueChange={(v) => setF({ ...f, ig_conta_id: v })}>
            <SelectTrigger><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
            <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={c.id}>@{c.usuario}</SelectItem>)}</SelectContent>
          </Select>
        </Campo>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Logos</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {VARIANTES_LOGO.map((v) => {
            const logo = cliente.logos.find((l) => l.variante === v);
            return (
              <div key={v} className="space-y-1 rounded border p-2">
                <div className="text-xs text-muted-foreground">{ROTULO_VARIANTE[v]}</div>
                <div className={`flex h-20 items-center justify-center rounded ${v === "clara" ? "bg-neutral-800" : "bg-muted"}`}>
                  {ocupado === `logo-${v}` ? <Loader2 className="h-4 w-4 animate-spin" />
                    : logo ? <img src={urlArquivo(logo.chave)} alt={`Logo ${ROTULO_VARIANTE[v]}`} className="max-h-16 max-w-full object-contain" />
                    : <span className="text-xs text-muted-foreground">Sem logo</span>}
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" asChild>
                    <label className="cursor-pointer">{logo ? "Trocar" : "Enviar"}
                      <input type="file" accept={ACEITA_IMAGENS} className="hidden"
                        onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) trocarLogo(v, a); }} />
                    </label>
                  </Button>
                  {logo && <Button variant="ghost" size="icon" aria-label={`Remover logo ${ROTULO_VARIANTE[v]}`} onClick={() => removerLogo(v)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Tom de voz</h3>
          <Button variant="ghost" size="sm" onClick={() => puxar("tom_de_voz")} disabled={!!ocupado}><FolderSync className="mr-1 h-4 w-4" />Puxar do cofre</Button>
        </div>
        <Textarea rows={6} value={f.tom_de_voz} onChange={(e) => setF({ ...f, tom_de_voz: e.target.value })} />
      </section>

      <section className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Design system</h3>
          <Button variant="ghost" size="sm" onClick={() => puxar("design_system")} disabled={!!ocupado}><FolderSync className="mr-1 h-4 w-4" />Puxar do cofre</Button>
        </div>
        <Textarea rows={10} value={f.design_system} onChange={(e) => setF({ ...f, design_system: e.target.value })} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Fontes</h3>
        {cliente.fontes.map((fonte, i) => (
          <div key={`${fonte.familia}-${i}`} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
            <span>{fonte.familia}{fonte.peso ? ` ${fonte.peso}` : ""} ({fonte.origem === "google" ? "Google Fonts" : "arquivo"})</span>
            <Button variant="ghost" size="icon" aria-label={`Remover fonte ${fonte.familia}`} onClick={() => removerFonte(i)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <Campo rotulo="Do Google Fonts"><Input placeholder="Ex.: Space Grotesk" value={google} onChange={(e) => setGoogle(e.target.value)} /></Campo>
          <Button variant="outline" disabled={!google.trim() || !!ocupado} onClick={addGoogle}>Adicionar</Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Campo rotulo="Arquivo de fonte (família)"><Input placeholder="Ex.: Clash Display" value={arquivoFonte.familia} onChange={(e) => setArquivoFonte({ ...arquivoFonte, familia: e.target.value })} /></Campo>
          <Campo rotulo="Peso">
            <Select value={arquivoFonte.peso} onValueChange={(v) => setArquivoFonte({ ...arquivoFonte, peso: v })}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{PESOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Button variant="outline" asChild disabled={!arquivoFonte.familia.trim() || !!ocupado}>
            <label className={arquivoFonte.familia.trim() ? "cursor-pointer" : "pointer-events-none opacity-50"}>Enviar arquivo
              <input type="file" accept=".woff2,.woff,.ttf,.otf" className="hidden"
                onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) addArquivo(a); }} />
            </label>
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <label className="flex items-center gap-2 text-sm"><Switch checked={f.saude} onCheckedChange={(v) => setF({ ...f, saude: v })} />Cliente da área da saúde (regras do CFM/CFO no texto)</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={f.ia_pode_pessoas} onCheckedChange={(v) => setF({ ...f, ia_pode_pessoas: v })} />A IA pode gerar imagens com pessoas</label>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Banco de imagens (pasta do Google Drive)</h3>
        <div className="flex gap-2">
          <Input placeholder="Link da pasta-mãe do Drive" value={f.drive_url} onChange={(e) => setF({ ...f, drive_url: e.target.value })} />
          <Button variant="outline" onClick={lerDrive} disabled={!f.drive_url.trim() || !!ocupado}>{ocupado === "drive" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Ler pastas</Button>
        </div>
        {cliente.drive_pastas.length > 0 && (
          <ul className="text-sm text-muted-foreground">
            {cliente.drive_pastas.map((p) => <li key={p.id}>{p.caminho} ({p.quantidade} {p.quantidade === 1 ? "imagem" : "imagens"})</li>)}
          </ul>
        )}
      </section>

      <Button onClick={salvar} disabled={!mudou || !!ocupado}>{ocupado === "salvar" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar kit</Button>

      <Dialog open={!!cofre} onOpenChange={(v) => !v && setCofre(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Escolha a nota do cofre</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {cofre?.arquivos.map((a) => (
              <Button key={a.caminho} variant="outline" className="w-full justify-start"
                onClick={() => { setF({ ...f, [cofre.destino]: a.conteudo }); setCofre(null); }}>{a.caminho}</Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 5: `src/components/conteudo/AbaAgenda.tsx`**

```tsx
// Pilares (temas em rodízio) e agenda da semana do cliente: dia, horário e formato.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { salvarCliente, type ClienteConteudo } from "@/lib/conteudo";
import { DIAS_CURTOS, HORARIOS } from "../../../supabase/functions/gmn/regras.ts";
import { ROTULO_FORMATO, type Formato, type ItemAgenda, type Pilar } from "../../../supabase/functions/conteudo/regras.ts";

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

export function AbaAgenda({ cliente, recarregar }: { cliente: ClienteConteudo; recarregar: () => void }) {
  const [pilares, setPilares] = useState<Pilar[]>(cliente.pilares);
  const [agenda, setAgenda] = useState<ItemAgenda[]>(cliente.agenda);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setPilares(cliente.pilares); setAgenda(cliente.agenda); }, [cliente.id]);
  const item = (dia: number) => agenda.find((a) => a.dia === dia);
  const mudar = (dia: number, parcial: Partial<ItemAgenda> | null) => setAgenda((atual) =>
    parcial === null ? atual.filter((a) => a.dia !== dia)
      : atual.some((a) => a.dia === dia) ? atual.map((a) => (a.dia === dia ? { ...a, ...parcial } : a))
      : [...atual, { dia, hora: "09:00", formato: "carrossel", ...parcial }]);

  async function salvar() {
    const limpos = pilares.map((p) => ({ nome: p.nome.trim(), descricao: p.descricao.trim() })).filter((p) => p.nome);
    if (new Set(limpos.map((p) => p.nome.toLowerCase())).size !== limpos.length) { toast.error("Há pilares com o mesmo nome."); return; }
    setSalvando(true);
    try {
      await salvarCliente(cliente.id, { pilares: limpos, agenda: [...agenda].sort((a, b) => ORDEM_DIAS.indexOf(a.dia) - ORDEM_DIAS.indexOf(b.dia)) });
      toast.success("Pilares e agenda salvos.");
      recarregar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Pilares (a IA escolhe os temas dentro deles, em rodízio)</h3>
        {pilares.map((p, i) => (
          <div key={i} className="flex gap-2">
            <Input className="w-40" placeholder="Nome (ex.: Dica)" value={p.nome} onChange={(e) => setPilares(pilares.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
            <Input placeholder="Descrição curta" value={p.descricao} onChange={(e) => setPilares(pilares.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))} />
            <Button variant="ghost" size="icon" aria-label={`Remover pilar ${p.nome || i + 1}`} onClick={() => setPilares(pilares.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setPilares([...pilares, { nome: "", descricao: "" }])}><Plus className="mr-1 h-4 w-4" />Adicionar pilar</Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Agenda da semana</h3>
        {ORDEM_DIAS.map((dia) => {
          const a = item(dia);
          return (
            <div key={dia} className="flex flex-wrap items-center gap-2">
              <label className="flex w-20 items-center gap-2 text-sm"><Switch checked={!!a} onCheckedChange={(v) => mudar(dia, v ? {} : null)} />{DIAS_CURTOS[dia]}</label>
              {a && (
                <>
                  <Select value={a.hora} onValueChange={(v) => mudar(dia, { hora: v })}>
                    <SelectTrigger className="w-24" aria-label={`Horário de ${DIAS_CURTOS[dia]}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{HORARIOS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={a.formato} onValueChange={(v) => mudar(dia, { formato: v as Formato })}>
                    <SelectTrigger className="w-32" aria-label={`Formato de ${DIAS_CURTOS[dia]}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{(["carrossel", "estatico"] as Formato[]).map((f) => <SelectItem key={f} value={f}>{ROTULO_FORMATO[f]}</SelectItem>)}</SelectContent>
                  </Select>
                </>
              )}
            </div>
          );
        })}
      </section>

      <Button onClick={salvar} disabled={salvando}>Salvar pilares e agenda</Button>
    </div>
  );
}
```

- [ ] **Step 6: Menu**

Em `src/lib/nav.tsx`: acrescentar `Sparkles,` na lista do `import { ... } from "lucide-react"` e, logo depois da linha do "Instagram" em `NAV_GROUPS` (grupo Operação):

```tsx
      { label: "Conteúdo", icon: <Sparkles size={17} />, to: "/conteudo", palavras: ["conteúdo", "posts", "carrossel", "design", "aprovação", "semana", "social media", "ia"] },
```

- [ ] **Step 7: Rota no `src/routeTree.gen.ts`**

Não rodar o gerador inteiro (ele reordena o arquivo; ver memória "ping-pong do routeTree"). Acrescentar à mão, ao lado de cada linha do Instagram, a linha equivalente do Conteúdo (11 pontos; procurar `Instagram` no arquivo):

```ts
import { Route as AuthenticatedConteudoRouteImport } from './routes/_authenticated/conteudo'
```
```ts
const AuthenticatedConteudoRoute = AuthenticatedConteudoRouteImport.update({
  id: '/conteudo',
  path: '/conteudo',
  getParentRoute: () => AuthenticatedRoute,
} as any)
```
(copiar o bloco `AuthenticatedInstagramRoute = ...update({...})` inteiro e trocar só os nomes, para manter o `getParentRoute` e o `as any` exatamente como lá)
```ts
  '/conteudo': typeof AuthenticatedConteudoRoute
```
(nas interfaces `FileRoutesByFullPath` e `FileRoutesByTo`)
```ts
  '/_authenticated/conteudo': typeof AuthenticatedConteudoRoute
```
(em `FileRoutesById`)
```ts
    | '/conteudo'
```
(nas uniões `fullPaths` e `to`)
```ts
    | '/_authenticated/conteudo'
```
(na união `id`)
```ts
    '/_authenticated/conteudo': {
      id: '/_authenticated/conteudo'
      path: '/conteudo'
      fullPath: '/conteudo'
      preLoaderRoute: typeof AuthenticatedConteudoRouteImport
      parentRoute: typeof AuthenticatedRoute
    }
```
(copiar o bloco do Instagram dentro de `declare module '@tanstack/react-router'` e trocar os nomes)
```ts
  AuthenticatedConteudoRoute: typeof AuthenticatedConteudoRoute
```
```ts
  AuthenticatedConteudoRoute: AuthenticatedConteudoRoute,
```
(na interface `AuthenticatedRouteChildren` e no objeto `AuthenticatedRouteChildren`)

- [ ] **Step 8: Conferir no navegador**

Run: matar servidores Vite antigos e subir `npm run dev` (ver memória "Dev server local"); abrir `http://localhost:8080/conteudo` (ou a porta que o Vite mostrar).
Expected: menu "Conteúdo" abaixo de "Instagram"; abas Semana e Clientes; "Ligar cliente" abre o diálogo com clientes, pastas (vazia até o cofre sincronizar) e contas; sem erro no console. Conferir que o `git diff src/routeTree.gen.ts` só tem as linhas do Conteúdo.

Run: `npx tsc --noEmit -p .`
Expected: sem erro novo nos arquivos desta task.

- [ ] **Step 9: Commit**

```bash
git add src/routes/_authenticated/conteudo.tsx src/components/conteudo/Clientes.tsx src/components/conteudo/GavetaCliente.tsx src/components/conteudo/AbaKit.tsx src/components/conteudo/AbaAgenda.tsx src/lib/nav.tsx src/routeTree.gen.ts
git commit -m "feat: aba Conteudo no menu, clientes ligados, kit da marca, pilares e agenda"
```

---

### Task 10: Moldes na gaveta

**Exec:** haiku

**Files:**
- Create: `src/components/conteudo/AbaMoldes.tsx`
- Modify: `src/components/conteudo/GavetaCliente.tsx` (trocar o "Em breve" da aba Moldes)

**Interfaces:**
- Consumes: `criarMolde`, `ajustarMolde`, `aprovarMolde`, `urlArquivo` (Task 8); `TIPOS_MOLDE`, `ROTULO_MOLDE` (Task 2).
- Produces: `<AbaMoldes cliente recarregar />`.

- [ ] **Step 1: `src/components/conteudo/AbaMoldes.tsx`**

```tsx
// Moldes do cliente: criar (um por vez, cerca de 1 minuto cada), ver a prévia, aprovar, pedir mudança ou refazer.
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ajustarMolde, aprovarMolde, criarMolde, urlArquivo, type ClienteConteudo } from "@/lib/conteudo";
import { ROTULO_MOLDE, TIPOS_MOLDE, type TipoMolde } from "../../../supabase/functions/conteudo/regras.ts";

export function AbaMoldes({ cliente, recarregar }: { cliente: ClienteConteudo; recarregar: () => void }) {
  const [criando, setCriando] = useState<TipoMolde | null>(null);
  const [aberto, setAberto] = useState<TipoMolde | null>(null);
  const [pedido, setPedido] = useState("");
  const pronto = !!cliente.design_system.trim() && cliente.logos.length > 0;
  const faltam = TIPOS_MOLDE.filter((t) => !cliente.moldes[t]);

  async function criar(tipos: TipoMolde[]) {
    for (const t of tipos) {
      setCriando(t);
      try {
        await criarMolde(cliente.id, t);
        recarregar();
      } catch (e: any) {
        toast.error(`${ROTULO_MOLDE[t]}: ${e.message}`);
        break;
      }
    }
    setCriando(null);
  }
  async function ajustar(t: TipoMolde) {
    setCriando(t);
    try {
      await ajustarMolde(cliente.id, t, pedido);
      setPedido("");
      setAberto(null);
      recarregar();
      toast.success("Nova versão do molde pronta para aprovar.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCriando(null);
    }
  }
  async function aprovar(t: TipoMolde) {
    try {
      await aprovarMolde(cliente.id, t);
      recarregar();
      toast.success(`${ROTULO_MOLDE[t]} aprovado.`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-3">
      {!pronto && <p className="text-sm text-amber-600">Antes dos moldes, preencha o design system e envie pelo menos uma logo (aba Kit da marca).</p>}
      {faltam.length > 0 && (
        <div className="flex items-center gap-2">
          <Button disabled={!pronto || !!criando} onClick={() => criar(faltam)}>
            {criando ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Criando {ROTULO_MOLDE[criando].toLowerCase()}...</> : `Criar moldes (${faltam.length})`}
          </Button>
          <span className="text-xs text-muted-foreground">Cada molde leva cerca de 1 minuto.</span>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {TIPOS_MOLDE.map((t) => {
          const m = cliente.moldes[t];
          return (
            <Card key={t}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{ROTULO_MOLDE[t]}</span>
                  {m && <Badge variant={m.aprovado_em ? "secondary" : "outline"}>{m.aprovado_em ? `Aprovado (v${m.versao})` : `Aguardando aprovação (v${m.versao})`}</Badge>}
                </div>
                {m?.previa_chave && criando !== t
                  ? <img src={urlArquivo(m.previa_chave)} alt={`Prévia: ${ROTULO_MOLDE[t]}`} className="aspect-[4/5] w-full rounded border object-cover" />
                  : <div className="flex aspect-[4/5] w-full items-center justify-center rounded border bg-muted text-sm text-muted-foreground">
                      {criando === t ? <Loader2 className="h-5 w-5 animate-spin" /> : "Ainda não criado"}
                    </div>}
                {m && (
                  <div className="flex flex-wrap gap-2">
                    {!m.aprovado_em && <Button size="sm" onClick={() => aprovar(t)} disabled={!!criando}>Aprovar</Button>}
                    <Button size="sm" variant="outline" onClick={() => { setAberto(aberto === t ? null : t); setPedido(""); }} disabled={!!criando}>Pedir mudança</Button>
                    <Button size="sm" variant="ghost" onClick={() => criar([t])} disabled={!!criando}>Refazer</Button>
                  </div>
                )}
                {aberto === t && (
                  <div className="space-y-2">
                    <Textarea rows={3} placeholder="Ex.: título maior, logo no canto de baixo" value={pedido} onChange={(e) => setPedido(e.target.value)} />
                    <Button size="sm" disabled={!pedido.trim() || !!criando} onClick={() => ajustar(t)}>Enviar pedido</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ligar na gaveta**

Em `src/components/conteudo/GavetaCliente.tsx`: `import { AbaMoldes } from "./AbaMoldes";` e trocar
`<TabsContent value="moldes"><p className="text-sm text-muted-foreground">Em breve.</p></TabsContent>` por
`<TabsContent value="moldes"><AbaMoldes cliente={cliente} recarregar={recarregar} /></TabsContent>`.

- [ ] **Step 3: Conferir**

Run: `npx tsc --noEmit -p .`
Expected: sem erro novo. No navegador, a aba Moldes mostra os 5 cartões "Ainda não criado" e o aviso quando falta design system ou logo.

- [ ] **Step 4: Commit**

```bash
git add src/components/conteudo/AbaMoldes.tsx src/components/conteudo/GavetaCliente.tsx
git commit -m "feat: aba Conteudo, moldes (criar, previa, aprovar, pedir mudanca, refazer)"
```

---

### Task 11: Visão da semana e o post (aprovação)

**Exec:** sonnet

**Files:**
- Create: `src/components/conteudo/Semana.tsx`, `src/components/conteudo/PostDialog.tsx`
- Modify: `src/routes/_authenticated/conteudo.tsx` (trocar o "Em breve" da aba Semana)

**Interfaces:**
- Consumes: Task 8 (posts e ações); `hojeBrasilia` (`@/lib/entrega`); `HORARIOS` (GMN); `ACEITA_IMAGENS`; Task 2 (`ROTULO_FORMATO`, `ROTULO_STATUS`, `instanteBrasilia`, `segundaDaSemana`, `somarDias`, `faltaParaGerar`, `LEGENDA_MAX`).
- Produces: `<Semana clientes />`, `<PostDialog post cliente fechar />`.

- [ ] **Step 1: `src/components/conteudo/Semana.tsx`**

```tsx
// Aba Conteúdo, área Semana: posts de segunda a domingo, Gerar a semana, Novo post e a aprovação de cada post.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Plus, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { hojeBrasilia } from "@/lib/entrega";
import { fetchPostsDaSemana, gerarSemana, novoPost, urlArquivo, type ClienteConteudo, type PostConteudo } from "@/lib/conteudo";
import { HORARIOS } from "../../../supabase/functions/gmn/regras.ts";
import {
  ROTULO_FORMATO, ROTULO_STATUS, faltaParaGerar, instanteBrasilia, segundaDaSemana, somarDias, type Formato,
} from "../../../supabase/functions/conteudo/regras.ts";
import { Campo } from "./Clientes";
import { PostDialog } from "./PostDialog";

const TODOS = "todos";
export const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const rotuloDia = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });

export function Semana({ clientes }: { clientes: ClienteConteudo[] }) {
  const [segunda, setSegunda] = useState(() => segundaDaSemana(hojeBrasilia()));
  const [filtro, setFiltro] = useState(TODOS);
  const [posts, setPosts] = useState<PostConteudo[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [novo, setNovo] = useState(false);
  const carregar = () => fetchPostsDaSemana(segunda).then(setPosts).catch((e) => toast.error(e.message));
  useEffect(() => {
    setPosts(null);
    carregar();
    const canal = supabase.channel(`conteudo-${segunda}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conteudo_posts" }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segunda]);
  const nomes = useMemo(() => new Map(clientes.map((c) => [c.id, c.clientes?.nome ?? "Cliente"])), [clientes]);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
  const visiveis = (posts ?? []).filter((p) => filtro === TODOS || p.conteudo_cliente_id === filtro);
  const post = posts?.find((p) => p.id === aberto) ?? null;

  async function gerar() {
    setGerando(true);
    try {
      const r = await gerarSemana(segunda, filtro === TODOS ? undefined : filtro);
      toast.success(r.criados ? `${r.criados} ${r.criados === 1 ? "post na fila" : "posts na fila"}. Eles aparecem aqui quando ficarem prontos.` : "Nenhum post novo: os dias da agenda já têm post.");
      for (const p of r.pulados) toast.warning(`${p.cliente}: ${p.motivo}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => setSegunda(somarDias(segunda, -7))}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-sm font-medium">Semana de {rotuloDia(segunda)}</span>
        <Button variant="outline" size="icon" aria-label="Próxima semana" onClick={() => setSegunda(somarDias(segunda, 7))}><ChevronRight className="h-4 w-4" /></Button>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-48" aria-label="Filtrar por cliente"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os clientes</SelectItem>
            {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.clientes?.nome ?? "Cliente"}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" onClick={() => setNovo(true)} disabled={!clientes.length}><Plus className="mr-1 h-4 w-4" />Novo post</Button>
          <Button onClick={gerar} disabled={gerando || !clientes.length}>
            {gerando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}Gerar a semana
          </Button>
        </div>
      </div>
      {!posts ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="grid gap-2 md:grid-cols-7">
          {dias.map((dia) => {
            const doDia = visiveis.filter((p) => hojeBrasilia(new Date(p.agendado_para)) === dia);
            return (
              <div key={dia} className="min-h-24 rounded-md border p-2">
                <div className="mb-2 text-xs font-medium capitalize text-muted-foreground">{rotuloDia(dia)}</div>
                <div className="space-y-2">
                  {doDia.map((p) => <CartaoPost key={p.id} post={p} nome={nomes.get(p.conteudo_cliente_id) ?? ""} abrir={() => setAberto(p.id)} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {post && <PostDialog post={post} cliente={clientes.find((c) => c.id === post.conteudo_cliente_id) ?? null} fechar={() => setAberto(null)} />}
      <NovoPost aberto={novo} fechar={() => setNovo(false)} clientes={clientes} segunda={segunda} />
    </div>
  );
}

function CartaoPost({ post, nome, abrir }: { post: PostConteudo; nome: string; abrir: () => void }) {
  const capa = post.laminas[0]?.jpg_chave;
  const andando = post.status === "texto" || post.status === "imagens" || post.status === "montando";
  const cor = post.status === "erro" ? "text-destructive" : post.status === "aguardando" ? "text-amber-600"
    : post.status === "aprovado" ? "text-emerald-600" : "text-muted-foreground";
  return (
    <button type="button" onClick={abrir} className="w-full rounded border bg-card p-1.5 text-left hover:bg-muted/50">
      {capa
        ? <img src={urlArquivo(capa)} alt="" loading="lazy" className="mb-1 aspect-[4/5] w-full rounded object-cover" />
        : <div className="mb-1 flex aspect-[4/5] w-full items-center justify-center rounded bg-muted">{andando && <Loader2 className="h-4 w-4 animate-spin" />}</div>}
      <div className="truncate text-xs font-medium">{nome}</div>
      <div className="text-[11px] text-muted-foreground">{horaDe(post.agendado_para)} · {ROTULO_FORMATO[post.formato]}</div>
      <div className={`text-[11px] ${cor}`}>{ROTULO_STATUS[post.status]}</div>
    </button>
  );
}

function NovoPost({ aberto, fechar, clientes, segunda }: { aberto: boolean; fechar: () => void; clientes: ClienteConteudo[]; segunda: string }) {
  const [cliente, setCliente] = useState("");
  const [dia, setDia] = useState(segunda);
  const [hora, setHora] = useState("09:00");
  const [formato, setFormato] = useState<Formato>("carrossel");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (aberto) setDia(segunda > hojeBrasilia() ? segunda : hojeBrasilia()); }, [aberto, segunda]);
  const c = clientes.find((x) => x.id === cliente);
  const falta = c ? faltaParaGerar(c, formato) : [];
  async function criar() {
    setSalvando(true);
    try {
      const quando = instanteBrasilia(dia, hora);
      if (Date.parse(quando) <= Date.now()) throw new Error("Escolha um dia e horário no futuro.");
      await novoPost({ conteudo_cliente_id: cliente, formato, agendado_para: quando });
      toast.success("Post na fila. Ele aparece aqui quando ficar pronto.");
      fechar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo post</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Campo rotulo="Cliente">
            <Select value={cliente} onValueChange={setCliente}>
              <SelectTrigger><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
              <SelectContent>{clientes.map((x) => <SelectItem key={x.id} value={x.id}>{x.clientes?.nome ?? "Cliente"}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <div className="flex flex-wrap gap-3">
            <Campo rotulo="Dia"><Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></Campo>
            <Campo rotulo="Horário">
              <Select value={hora} onValueChange={setHora}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{HORARIOS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo rotulo="Formato">
              <Select value={formato} onValueChange={(v) => setFormato(v as Formato)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{(["carrossel", "estatico"] as Formato[]).map((f) => <SelectItem key={f} value={f}>{ROTULO_FORMATO[f]}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
          </div>
          {falta.length > 0 && <p className="text-sm text-amber-600">Falta: {falta.join(", ")}.</p>}
        </div>
        <DialogFooter>
          <Button onClick={criar} disabled={!cliente || falta.length > 0 || salvando}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Criar post</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: `src/components/conteudo/PostDialog.tsx`**

```tsx
// Um post da semana: lâminas em tamanho real, legenda e as ações (aprovar, pedir mudança, editar, trocar dia ou formato,
// descartar, tentar de novo). A tela só mexe no post em "aguardando" (ou em "erro", para tentar de novo).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { hojeBrasilia } from "@/lib/entrega";
import { ACEITA_IMAGENS } from "@/lib/gmnImagem";
import {
  aprovarPost, descartarPost, pedirMudanca, salvarTextos, tentarDeNovo, trocarData, trocarFormato, trocarFoto, urlArquivo,
  usarAjusteNoMolde, type ClienteConteudo, type PostConteudo,
} from "@/lib/conteudo";
import { HORARIOS } from "../../../supabase/functions/gmn/regras.ts";
import {
  LEGENDA_MAX, ROTULO_FORMATO, ROTULO_STATUS, faltaParaGerar, instanteBrasilia, type Formato,
} from "../../../supabase/functions/conteudo/regras.ts";
import { horaDe } from "./Semana";

export function PostDialog({ post, cliente, fechar }: { post: PostConteudo; cliente: ClienteConteudo | null; fechar: () => void }) {
  const [i, setI] = useState(0);
  const [laminas, setLaminas] = useState(post.laminas);
  const [legenda, setLegenda] = useState(post.legenda);
  const [dia, setDia] = useState(() => hojeBrasilia(new Date(post.agendado_para)));
  const [hora, setHora] = useState(() => horaDe(post.agendado_para));
  const [pedido, setPedido] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  // A versão do banco mudou (fila andou ou outra aba salvou): o rascunho volta ao que está salvo
  useEffect(() => {
    setLaminas(post.laminas);
    setLegenda(post.legenda);
    setI((x) => Math.min(x, Math.max(0, post.laminas.length - 1)));
  }, [post.updated_at]);

  const aguardando = post.status === "aguardando";
  const l = laminas[i];
  const molde = l && cliente ? cliente.moldes[l.molde] : undefined;
  const camposTexto = molde?.campos.filter((c) => c.tipo === "texto") ?? [];
  const aceitaFoto = !!l && (l.molde === "texto" || !!molde?.campos.some((c) => c.tipo === "imagem"));
  const editado = legenda !== post.legenda || JSON.stringify(laminas) !== JSON.stringify(post.laminas);
  const outro: Formato = post.formato === "carrossel" ? "estatico" : "carrossel";
  const horarios = HORARIOS.includes(hora) ? HORARIOS : [hora, ...HORARIOS];

  async function fazer(nome: string, acao: () => Promise<unknown>, ok?: string) {
    setOcupado(nome);
    setConfirmar(null);
    try {
      await acao();
      if (ok) toast.success(ok);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOcupado(null);
    }
  }
  const quando = () => instanteBrasilia(dia, hora);
  const girando = (nome: string) => ocupado === nome && <Loader2 className="mr-1 h-4 w-4 animate-spin" />;

  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[95vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cliente?.clientes?.nome ?? "Post"} · {ROTULO_FORMATO[post.formato]}</DialogTitle>
          <DialogDescription>{post.tema ?? "Tema em definição"}{post.pilar ? ` (pilar ${post.pilar})` : ""} · {ROTULO_STATUS[post.status]}</DialogDescription>
        </DialogHeader>
        {post.erro && <p className="text-sm text-destructive">{post.erro}</p>}
        {post.aviso && <p className="text-sm text-amber-600">{post.aviso}</p>}
        <div className="grid gap-4 md:grid-cols-[minmax(0,420px)_1fr]">
          <div className="space-y-2">
            {l?.jpg_chave
              ? <img src={urlArquivo(l.jpg_chave)} alt={`Lâmina ${i + 1}`} className="aspect-[4/5] w-full rounded border object-cover" />
              : <div className="flex aspect-[4/5] w-full items-center justify-center rounded border bg-muted text-sm text-muted-foreground">
                  {post.status === "erro" ? "Parou com erro" : laminas.length ? "Montando..." : "Escrevendo..."}
                </div>}
            {laminas.length > 1 && (
              <div className="flex items-center justify-between">
                <Button variant="outline" size="icon" aria-label="Lâmina anterior" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm">{i + 1} de {laminas.length}</span>
                <Button variant="outline" size="icon" aria-label="Próxima lâmina" disabled={i === laminas.length - 1} onClick={() => setI(i + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {aguardando && l && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Lâmina {i + 1}</h3>
                {camposTexto.map((c) => (
                  <div key={c.nome} className="space-y-1">
                    <Label>{c.nome} ({(l.campos[c.nome] ?? "").length}/{c.max})</Label>
                    <Textarea rows={c.max > 120 ? 4 : 2} value={l.campos[c.nome] ?? ""}
                      onChange={(e) => setLaminas(laminas.map((x, j) => (j === i ? { ...x, campos: { ...x.campos, [c.nome]: e.target.value } } : x)))} />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  {aceitaFoto && (
                    <Button variant="outline" size="sm" asChild disabled={!!ocupado}>
                      <label className="cursor-pointer">{girando("foto")}Trocar foto
                        <input type="file" accept={ACEITA_IMAGENS} className="hidden"
                          onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) fazer("foto", () => trocarFoto(post, i, a), "Foto trocada; a lâmina está sendo montada."); }} />
                      </label>
                    </Button>
                  )}
                  {l.ajuste_css && cliente && (
                    <Button variant="outline" size="sm" disabled={!!ocupado}
                      onClick={() => fazer("molde", () => usarAjusteNoMolde(cliente.id, l.molde, l.ajuste_css!), "O ajuste vale para os próximos posts.")}>
                      Usar este ajuste nos próximos posts
                    </Button>
                  )}
                </div>
              </section>
            )}

            <section className="space-y-1">
              <Label>Legenda ({legenda.length}/{LEGENDA_MAX})</Label>
              <Textarea rows={8} value={legenda} disabled={!aguardando} onChange={(e) => setLegenda(e.target.value)} />
            </section>
            {aguardando && editado && (
              <Button onClick={() => fazer("textos", () => salvarTextos(post, laminas, legenda), "Alterações salvas.")} disabled={!!ocupado}>{girando("textos")}Salvar alterações</Button>
            )}

            {aguardando && (
              <section className="space-y-2">
                <Label>Pedir mudança</Label>
                <Textarea rows={3} placeholder="Ex.: capa mais direta, troca a foto da lâmina 3 por uma do salão" value={pedido} onChange={(e) => setPedido(e.target.value)} />
                <Button variant="secondary" disabled={!pedido.trim() || !!ocupado}
                  onClick={() => fazer("pedido", async () => { const r = await pedirMudanca(post.id, pedido); setPedido(""); toast.success(r.resposta); })}>
                  {girando("pedido")}Pedir mudança
                </Button>
              </section>
            )}
            {post.pedidos.length > 0 && (
              <section className="space-y-1 text-sm">
                <h3 className="font-medium">Pedidos anteriores</h3>
                {post.pedidos.map((p, j) => <p key={j} className="text-muted-foreground">"{p.texto}": {p.resultado}</p>)}
              </section>
            )}

            {aguardando && (
              <section className="flex flex-wrap items-end gap-2">
                <div className="space-y-1"><Label>Dia</Label><Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></div>
                <div className="space-y-1">
                  <Label>Horário</Label>
                  <Select value={hora} onValueChange={setHora}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>{horarios.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button variant="outline" disabled={!!ocupado} onClick={() => fazer("data", () => trocarData(post.id, quando()), "Dia e horário trocados.")}>Trocar dia e horário</Button>
              </section>
            )}

            {aguardando && (
              <section className="flex flex-wrap gap-2 border-t pt-4">
                <Button variant="outline" disabled={!!ocupado} onClick={() => {
                  if (confirmar !== "formato") { setConfirmar("formato"); return; }
                  const falta = cliente ? faltaParaGerar(cliente, outro) : [];
                  if (falta.length) { toast.error(`Falta: ${falta.join(", ")}.`); setConfirmar(null); return; }
                  fazer("formato", () => trocarFormato(post, outro), "O post está sendo refeito no outro formato.");
                }}>
                  {confirmar === "formato" ? `Clique de novo: refazer como ${ROTULO_FORMATO[outro].toLowerCase()}` : `Trocar para ${ROTULO_FORMATO[outro].toLowerCase()}`}
                </Button>
                <Button variant="outline" className="text-destructive" disabled={!!ocupado} onClick={() => {
                  if (confirmar !== "descartar") { setConfirmar("descartar"); return; }
                  fazer("descartar", async () => { await descartarPost(post.id); fechar(); }, "Post descartado.");
                }}>{confirmar === "descartar" ? "Clique de novo para descartar" : "Descartar"}</Button>
                <Button disabled={!!ocupado || post.laminas.some((x) => !x.jpg_chave)}
                  onClick={() => fazer("aprovar", async () => {
                    if (editado) throw new Error("Salve as alterações antes de aprovar.");
                    await aprovarPost(post.id, quando());
                    fechar();
                  }, "Aprovado e agendado no Instagram.")}>
                  {girando("aprovar")}Aprovar e agendar
                </Button>
              </section>
            )}

            {post.status === "erro" && <Button disabled={!!ocupado} onClick={() => fazer("tentar", () => tentarDeNovo(post), "Tentando de novo.")}>Tentar de novo</Button>}
            {post.status === "aprovado" && (
              <p className="text-sm text-emerald-600">Aprovado e agendado para {new Date(post.agendado_para).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}. Acompanhe na aba Instagram.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Ligar na página**

Em `src/routes/_authenticated/conteudo.tsx`: `import { Semana } from "@/components/conteudo/Semana";` e trocar
`<TabsContent value="semana"><p className="text-sm text-muted-foreground">Em breve.</p></TabsContent>` por
`<TabsContent value="semana"><Semana clientes={clientes ?? []} /></TabsContent>`.

- [ ] **Step 4: Conferir**

Run: `npx tsc --noEmit -p .` e `npm test`
Expected: sem erro novo; testes PASS. No navegador (1440 e 390 px de largura): a semana mostra 7 colunas no computador e uma embaixo da outra no celular, as setas trocam de semana, "Novo post" e "Gerar a semana" abrem e respondem, sem erro no console.

- [ ] **Step 5: Commit**

```bash
git add src/components/conteudo/Semana.tsx src/components/conteudo/PostDialog.tsx src/routes/_authenticated/conteudo.tsx
git commit -m "feat: aba Conteudo, visao da semana com aprovacao, pedido de mudanca, edicao e troca de dia e formato"
```

---

### Task 12: Chaves, publicação, cofre agendado e teste real com a Kobe

**Exec:** opus (credenciais, produção e teste real; com o André quando o verificador barrar)

**Files:**
- Create (fora do repositório): `%USERPROFILE%\.gestao\conteudo.env`, `%USERPROFILE%\.gestao\cofre-sync.json`
- Modify: nenhum arquivo versionado (salvo correções que o teste real pedir)

- [ ] **Step 1: Chave do cofre**

Gerar a chave sem imprimir e gravar no `.env` local e na config do script:

```bash
node -e "
const fs=require('fs'),p=require('path'),c=require('crypto');
const d=p.join(process.env.USERPROFILE,'.gestao');
const k=c.randomBytes(32).toString('hex');
fs.appendFileSync(p.join(d,'conteudo.env'),'COFRE_SYNC_KEY='+k+'\n');
fs.writeFileSync(p.join(d,'cofre-sync.json'),JSON.stringify({url:'https://uajusldnvzgakffofkhl.supabase.co/functions/v1/conteudo',chave:k,cofre:'C:\\\\Users\\\\Andre\\\\06. Obsidian Clientes\\\\Clientes'},null,2));
console.log('ok');"
```

Expected: `ok` (a chave não aparece).

- [ ] **Step 2: Chave do Claude e do Cloudflare**

- Anthropic: no console.anthropic.com da conta do André (Chrome de automação), criar a chave "gestao-conteudo" e acrescentar `ANTHROPIC_API_KEY=...` ao `%USERPROFILE%\.gestao\conteudo.env` (sem colar no chat).
- Cloudflare: no painel da conta do André (a mesma do site e do R2), criar um token de API com a permissão "Browser Rendering: Edit" (o nome pode aparecer como "Browser Run") e acrescentar `CLOUDFLARE_BROWSER_TOKEN=...` e `CLOUDFLARE_ACCOUNT_ID=...` (o id da conta aparece na página inicial do painel; é o mesmo `R2_ACCOUNT_ID`).
- Se o verificador barrar a criação de chave, pedir ao André, com o passo a passo, e ele cola no arquivo.

- [ ] **Step 3: Secrets e publicação da função**

```bash
npx supabase secrets set --env-file "$USERPROFILE/.gestao/conteudo.env" --project-ref uajusldnvzgakffofkhl
npx supabase functions deploy conteudo --project-ref uajusldnvzgakffofkhl --use-api
npx supabase functions deploy gmn --project-ref uajusldnvzgakffofkhl --use-api
curl -s https://uajusldnvzgakffofkhl.supabase.co/functions/v1/conteudo
```

Expected: `{"claude":true,"cloudflare":true,"r2":true,"cofre":true}`. (O `gmn` sobe de novo porque `openai.ts` mudou; conferir `GET /functions/v1/gmn` → `{"openai":true,"r2":true,"acesso":true}`.)

- [ ] **Step 4: Cofre agendado**

Rodar uma vez à mão: `node tools/cofre-sync/sync.mjs`
Expected: `... cofre: 62 pastas, 0 arquivos enviados, 0 removidos` (ainda não há cliente ligado; a lista de pastas sobe).

Registrar a tarefa do Windows (PowerShell):

```powershell
$node = (Get-Command node).Source
$script = Join-Path (Get-Location) "tools\cofre-sync\sync.mjs"
$log = Join-Path $env:USERPROFILE ".gestao\cofre-sync.log"
$acao = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"`"$node`" `"$script`" >> `"$log`" 2>&1`""
$gatilhos = @(
  (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)),
  (New-ScheduledTaskTrigger -AtLogOn)
)
Register-ScheduledTask -TaskName "Gestao - Sincronizar cofre" -Action $acao -Trigger $gatilhos -Description "Copia o cofre de clientes para a aba Conteudo" -Force
Start-ScheduledTask -TaskName "Gestao - Sincronizar cofre"
```

Expected: a tarefa aparece no Agendador; o `cofre-sync.log` ganha uma linha.

- [ ] **Step 5: Publicar o site**

```bash
git push
```

Expected: a Cloudflare publica (push na `main` = deploy). Conferir `https://gestao.andrelopes.digital/conteudo`.

- [ ] **Step 6: Teste real com a Kobe Growth** (só a @kobegrowth publica)

1. Conferir que a Kobe Growth existe em `clientes`; se não existir, perguntar ao André antes de criar.
2. Ligar a Kobe: pasta `Kobe Growth`, conta @kobegrowth. Rodar `node tools/cofre-sync/sync.mjs`: deve enviar a nota central, o Log recente e os 17 documentos.
3. Kit: "Puxar do cofre" no design system (nota "Design System (Kobe Growth)"); logos da Kobe (pasta do Drive da Kobe; pedir o link ao André se não estiver no cofre); fontes Space Grotesk e Inter do Google (reservas do design system); link do Drive e "Ler pastas".
4. Moldes: "Criar moldes" (5), conferir as prévias, pedir uma mudança num deles, aprovar os 5.
5. Pilares (ex.: Dica, Bastidores, Prova social) e agenda: um carrossel e um estático nesta semana ou na próxima.
6. "Gerar a semana": os 2 posts passam por Escrevendo, Buscando imagens e Montando até "Aguardando aprovação" (conferir em `conteudo_posts` e no log da função se travar).
7. No carrossel: pedir uma mudança ("capa mais direta"), editar um texto à mão, trocar dia e horário. No estático: "Trocar para carrossel" e ver refazer.
8. Aprovar o carrossel para daqui a uns 10 minutos: conferir o `ig_posts` agendado na aba Instagram e a publicação pelo relógio. Depois, excluir o post publicado pela aba Instagram e descartar o outro.
9. Registrar no relatório: tempos de cada etapa, custo aproximado (painel da Anthropic e da OpenAI) e qualquer correção feita.

- [ ] **Step 7: Commit das correções (se houver) e push**

```bash
git add -A supabase/functions/conteudo src/components/conteudo src/lib/conteudo.ts
git commit -m "fix: aba Conteudo, ajustes do teste real com a Kobe"
git push
```

---

### Task 13: Registro no cofre

**Exec:** sonnet

**Files (cofre do sistema, fora do repositório):**
- Create: `_knowledge/modulos/conteudo.md`
- Modify: `_memory/current-state.md` (curto, até 8.000 caracteres), `_memory/historico.md` (entrada no topo), `_knowledge/projects.md` (frente "Conteúdo automático"), `_knowledge/tecnico/banco-de-dados.md` (tabelas e job novos), `_knowledge/tecnico/publicar-e-deploy.md` (secrets novos, só nomes), `_decisions/2026-10-12-conteudo-automatico-moldes-por-cliente.md` (o que mudou na implementação)

- [ ] **Step 1: Nota do módulo** no formato das outras de `_knowledge/modulos/` (Para que serve, Como funciona, Dados, Código, Testes reais, Armadilhas, Pendências, Referências), com: fila e trava, moldes, cofre agendado (tarefa "Gestao - Sincronizar cofre", log em `%USERPROFILE%\.gestao\cofre-sync.log`), secrets (só nomes), custos medidos no teste e a Fase 2 pendente.
- [ ] **Step 2: Estado, histórico, frentes, banco, deploy e decisão** atualizados; sem chave, sem travessão, WikiLinks só para notas que existem.
- [ ] **Step 3: Memória** `conteudo-automatico.md` atualizada (estado da Fase 1).
