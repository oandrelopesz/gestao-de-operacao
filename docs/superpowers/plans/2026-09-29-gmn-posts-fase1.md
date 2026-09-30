# Posts no Google Meu Negócio — Fase 1: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba `/gmn` com perfis criados à mão, briefing (com "Gerar com IA") e **prévia de post** (texto da OpenAI com checagem + imagem do Drive ou gerada por IA, salva no Cloudflare R2), sem publicar nada no Google.

**Architecture:** Regras puras num único módulo `supabase/functions/gmn/regras.ts`, usado pela edge function (Deno), pelo navegador e testado com `node --test`. Uma edge function `gmn` com duas ações (`briefing`, `previa`) e um `GET` de status; ela fala com OpenAI, Drive (token da contato@ em `google_oauth_tokens`) e R2 (`aws4fetch`). O front (`src/lib/gmn.ts` + `src/routes/_authenticated/gmn.tsx` + `src/components/gmn/*`) lê e grava as tabelas pelo Supabase JS e chama a função com o mesmo cabeçalho de acesso do swipe file.

**Tech Stack:** TanStack Start/Router, React 19, Supabase JS (Lovable Cloud), shadcn/ui, sonner, Deno (edge functions), OpenAI (Chat Completions com JSON Schema + Images), Cloudflare R2 (API S3).

**Spec:** `docs/superpowers/specs/2026-09-29-gmn-posts-design.md` (seção 7.1 = esta fase)

## Global Constraints

- **Nada vai ao ar nesta fase.** Não adicionar item no menu (`src/lib/nav.tsx`), não criar crons, não publicar no Lovable. Nenhum perfil pode ser ativado: `PUBLICACAO_LIBERADA = false` em `src/lib/gmn.ts` deixa o liga/desliga desabilitado. A aba é aberta digitando `/gmn`.
- Nenhuma dependência nova no `package.json` (o `bun.lockb` não pode ser regenerado nesta máquina). Na edge function, imports só por URL (`https://esm.sh/...`).
- `supabase/functions/gmn/regras.ts`: sem imports, sem APIs do Node ou do Deno, sem `enum`; tipos exportados com `export interface`/`export type`. Os testes ficam em `src/lib/gmnRegras.test.ts` (o `npm test` roda `node --test src/lib/*.test.ts`) e importam com extensão `.ts`.
- Tabelas novas não estão em `src/integrations/supabase/types.ts`: usar `supabase.from("..." as any) as any` na camada de dados.
- Textos da interface em português do Brasil, com acentos. Nunca `window.confirm`/`alert`: usar `AlertDialog`. Cor nunca é o único sinal.
- Segredos (chave da OpenAI e do R2) **nunca** entram no repositório, no chat ou em arquivos: o usuário cola os valores direto no painel de secrets do Lovable Cloud.
- Migration aplicada pelo editor SQL do Lovable (memória `supabase-migrations-manual`); edge function publicada pelo chat do Lovable depois do push (memória `swipe-file-google`). `git push` para a main é bloqueado pelo classificador: pedir ao usuário `! git push origin main`.
- Commits em português, terminando com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Não commitar `CRM-Evoluir-Kids-Funcionalidades.md`, `evoluir-kids-crm-codigo.zip` nem a captura de tela solta.
- `routeTree.gen.ts` é regenerado pelo plugin do router no dev server/build; commitar a versão regenerada.
- Ajustes da spec feitos por este plano (registrar na spec na Task 1): testes com `node --test` (não Vitest); fotos do Drive aceitas só em JPG/PNG (WebP ignorado, sem conversão); a coluna `finalidade` de `google_oauth_tokens` fica para a Fase 2.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260929120000_gmn.sql` | Tabelas `gmn_perfis`, `gmn_posts`, `gmn_imagens_uso` + RLS |
| `supabase/functions/gmn/regras.ts` | Regras puras: briefing, temas, palavras-chave, checagem, imagem, UTM, pasta do Drive, prompts |
| `src/lib/gmnRegras.test.ts` | Testes das regras |
| `supabase/functions/gmn/acesso.ts` | Libera a chamada por ID token do Google ou chave do swipe |
| `supabase/functions/gmn/google.ts` | Token do Google da contato@ (renovação) + Drive (listar imagens, baixar) |
| `supabase/functions/gmn/openai.ts` | JSON estruturado e geração de imagem |
| `supabase/functions/gmn/r2.ts` | Upload para o R2 e URL pública |
| `supabase/functions/gmn/conteudo.ts` | Monta um post: tema → texto → checagem → imagem |
| `supabase/functions/gmn/index.ts` | Rotas: `GET` status, `POST {acao:"briefing"}`, `POST {acao:"previa"}` |
| `supabase/config.toml` | `[functions.gmn] verify_jwt = false` |
| `src/lib/googleDrive.ts` | Extrai `cabecalhosDeAcesso()` (reuso pelo gmn) |
| `src/lib/gmn.ts` | Camada de dados da aba |
| `src/routes/_authenticated/gmn.tsx` | Página: lista de perfis, filtros, novo perfil |
| `src/components/gmn/PerfilGaveta.tsx` | Gaveta com abas Briefing / Agenda / Posts |
| `src/components/gmn/BriefingForm.tsx` | Campos do briefing |
| `src/components/gmn/GerarBriefingDialog.tsx` | Escolhe briefing de Dados internos e chama a IA |
| `src/components/gmn/PostsLista.tsx` | Botão "Gerar prévia" e lista de posts |

**Como os blocos de código viram arquivos:** cada bloco precedido de `<!-- arquivo: caminho -->` é o conteúdo **completo** daquele arquivo.

---

### Task 1: Migration e ajustes da spec

> **Emenda de 2026-09-30 (agenda de dias e horários, aprovada pelo André):** a migration commitada em 140eaa3 troca `posts_semana` + `dias` por `agenda` (o bloco do Step 1 abaixo já está emendado). Os ajustes da spec desta emenda foram feitos pelo controlador. Implementador: deixar o arquivo da migration idêntico ao bloco do Step 1 e commitar; não mexer na spec.

**Files:**
- Create: `supabase/migrations/20260929120000_gmn.sql`
- Modify: `docs/superpowers/specs/2026-09-29-gmn-posts-design.md`

**Interfaces:**
- Produces: tabelas `gmn_perfis`, `gmn_posts`, `gmn_imagens_uso` com as colunas abaixo (usadas por todas as tasks seguintes).

- [ ] **Step 1: Escrever a migration**

<!-- arquivo: supabase/migrations/20260929120000_gmn.sql -->
```sql
-- Posts automáticos no Google Meu Negócio (spec 2026-09-29-gmn-posts-design.md).
-- Idempotente. Aplicar pelo editor SQL do Lovable.

CREATE TABLE IF NOT EXISTS public.gmn_perfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name TEXT UNIQUE,
  account_name TEXT,
  nome TEXT NOT NULL,
  endereco TEXT,
  categoria TEXT,
  site TEXT,
  telefone TEXT,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT false,
  sem_acesso BOOLEAN NOT NULL DEFAULT false,
  agenda JSONB NOT NULL DEFAULT '[{"dia": 2, "hora": "09:00"}, {"dia": 4, "hora": "09:00"}]'::jsonb
    CHECK (jsonb_typeof(agenda) = 'array'),
  cta_tipo TEXT NOT NULL DEFAULT 'LEARN_MORE' CHECK (cta_tipo IN ('LEARN_MORE', 'CALL', 'BOOK')),
  cta_url TEXT,
  drive_pasta_url TEXT,
  usa_ia_imagem BOOLEAN NOT NULL DEFAULT true,
  saude BOOLEAN NOT NULL DEFAULT false,
  briefing JSONB NOT NULL DEFAULT '{}'::jsonb,
  briefing_salvo_em TIMESTAMPTZ,
  sincronizado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gmn_perfis_ativo_exige_briefing CHECK (NOT ativo OR briefing_salvo_em IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS gmn_perfis_cliente_idx ON public.gmn_perfis(cliente_id);

CREATE TABLE IF NOT EXISTS public.gmn_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id UUID NOT NULL REFERENCES public.gmn_perfis(id) ON DELETE CASCADE,
  agendado_para TIMESTAMPTZ NOT NULL DEFAULT now(),
  dia DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  origem TEXT NOT NULL CHECK (origem IN ('agenda', 'manual', 'previa')),
  status TEXT NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'gerando', 'gerado', 'publicado', 'erro', 'pulado')),
  tema TEXT,
  palavras_chave TEXT[] NOT NULL DEFAULT '{}',
  texto TEXT,
  imagem_origem TEXT CHECK (imagem_origem IN ('drive', 'google', 'ia')),
  imagem_ref TEXT,
  imagem_url TEXT,
  google_post_name TEXT,
  google_url TEXT,
  google_estado TEXT,
  conferir_em TIMESTAMPTZ,
  tentativas SMALLINT NOT NULL DEFAULT 0,
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gmn_posts_agenda_dia ON public.gmn_posts(perfil_id, dia) WHERE origem = 'agenda';
CREATE INDEX IF NOT EXISTS gmn_posts_fila_idx ON public.gmn_posts(status, agendado_para) WHERE status = 'agendado';
CREATE INDEX IF NOT EXISTS gmn_posts_perfil_idx ON public.gmn_posts(perfil_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.gmn_imagens_uso (
  perfil_id UUID NOT NULL REFERENCES public.gmn_perfis(id) ON DELETE CASCADE,
  origem TEXT NOT NULL CHECK (origem IN ('drive', 'google')),
  ref TEXT NOT NULL,
  usado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (perfil_id, origem, ref)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['gmn_perfis', 'gmn_posts', 'gmn_imagens_uso'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_all') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)', t || '_all', t);
    END IF;
  END LOOP;
END $$;

-- Status dos posts ao vivo na aba (spec §3.3).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'gmn_posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gmn_posts;
  END IF;
END $$;
```

- [ ] **Step 2: Registrar na spec os ajustes deste plano**

Em `docs/superpowers/specs/2026-09-29-gmn-posts-design.md`:
- seção 3.5: acrescentar ao fim "(Fase 2 — na Fase 1 a função usa a linha mais recente, que é a da contato@.)";
- seção 6.2, passo 5.1: trocar "(jpg/png/webp, até 5 MB)" por "(JPG ou PNG, até 5 MB; WebP é ignorado)" e remover "converte webp para jpg se necessário e";
- seção 6.3: trocar "testada com Vitest" e "(`src/lib/gmnChecagem.ts`)" por "fica em `supabase/functions/gmn/regras.ts` e é testada com `node --test` (`src/lib/gmnRegras.test.ts`)";
- seção 8: trocar "**Vitest:**" por "**`node --test`:**".

- [ ] **Step 3: Aplicar a migration no banco**

Pelo editor SQL do Lovable (projeto `b894ed2e-2f0d-4ef8-9bd0-7cb1ffbcdf51`, método da memória `supabase-migrations-manual`). Conferir com:

```sql
SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'gmn_%' ORDER BY 1;
```
Expected: `gmn_imagens_uso`, `gmn_perfis`, `gmn_posts`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260929120000_gmn.sql docs/superpowers/specs/2026-09-29-gmn-posts-design.md
git commit -m "GMN: tabelas de perfis, posts e uso de imagens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Regras puras + testes

**Files:**
- Create: `supabase/functions/gmn/regras.ts`
- Test: `src/lib/gmnRegras.test.ts`

**Interfaces:**
- Produces (todas exportadas de `regras.ts`):
  - `interface Briefing { contexto; objetivo; posicionamento; publico; tom_de_voz: string; servicos; bairros; palavras_chave; diferenciais; termos_proibidos: string[]; cidade: string }`
  - `BRIEFING_VAZIO: Briefing`, `CAMPOS_TEXTO`, `CAMPOS_LISTA`, `normalizarBriefing(v: unknown): Briefing`
  - `TEMAS`, `type Tema`, `ROTULO_TEMA: Record<Tema, string>`, `proximoTema(recentes: (string | null)[]): Tema`
  - `escolherPalavras(palavras: string[], historico: string[][], n = 2): string[]`
  - `checarTexto(texto: string, o: { termosProibidos: string[]; saude: boolean }): { ok: boolean; motivos: string[] }`
  - `escolherImagem(candidatos: string[], usos: Record<string, string>): string | null`
  - Agenda: `interface ItemAgenda { dia: number; hora: string }`, `DIAS_CURTOS`, `HORA_PADRAO`, `AGENDA_PADRAO`, `HORARIOS` (06:00 a 22:00, de 30 em 30 min), `normalizarAgenda(v: unknown): ItemAgenda[]`, `alternarDia(agenda: ItemAgenda[], dia: number): ItemAgenda[]`, `mudarHora(agenda: ItemAgenda[], dia: number, hora: string): ItemAgenda[]`, `mesmoHorario(agenda: ItemAgenda[], hora: string): ItemAgenda[]`, `resumoAgenda(agenda: ItemAgenda[]): string`
  - `comUtm(url: string): string | null`, `idPastaDrive(link: string): string | null`
  - `montarMensagensPost(e: EntradaPost): Mensagens`, `montarMensagensBriefing(e: EntradaBriefing): Mensagens`, `montarPromptImagem(e: { nome: string; categoria: string | null; briefing: Briefing; tema: Tema }): string`
  - `ESQUEMA_POST`, `ESQUEMA_BRIEFING` (JSON Schema estrito para a OpenAI)

- [ ] **Step 1: Escrever os testes (falham: o módulo ainda não existe)**

<!-- arquivo: src/lib/gmnRegras.test.ts -->
```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENDA_PADRAO, BRIEFING_VAZIO, HORARIOS, TEMAS, alternarDia, checarTexto, comUtm, escolherImagem, escolherPalavras,
  idPastaDrive, mesmoHorario, montarMensagensBriefing, montarMensagensPost, montarPromptImagem, mudarHora, normalizarAgenda,
  normalizarBriefing, proximoTema, resumoAgenda,
} from "../../supabase/functions/gmn/regras.ts";

const textoBom =
  "Na Brazilian Car você encontra seminovos revisados em Brasília, com procedência conferida e atendimento " +
  "sem pressa. Venha conhecer nosso estoque no SIA e faça sua avaliação de troca com a nossa equipe.";

test("normalizarBriefing aceita lixo, texto com quebras e listas", () => {
  assert.deepEqual(normalizarBriefing(null), BRIEFING_VAZIO);
  const b = normalizarBriefing({ contexto: "  Loja ", servicos: "compra\n venda \n\n", bairros: ["SIA", "", 3], extra: 1 });
  assert.equal(b.contexto, "Loja");
  assert.deepEqual(b.servicos, ["compra", "venda"]);
  assert.deepEqual(b.bairros, ["SIA"]);
  assert.equal("extra" in b, false);
});

test("proximoTema segue a ordem e não repete os 3 últimos", () => {
  assert.equal(proximoTema([]), "servico");
  assert.equal(proximoTema(["servico"]), "duvida");
  assert.equal(proximoTema(["bastidores", "diferencial", "regiao"]), "servico");
  assert.equal(proximoTema(["duvida", "bastidores", "servico"]), "regiao");
  assert.equal(proximoTema([null, "tema-velho"]), "servico");
  assert.equal(TEMAS.length, 5);
});

test("escolherPalavras prefere as nunca usadas e depois as usadas há mais tempo", () => {
  const palavras = ["seminovos brasília", "carros usados df", "troca de carro", "financiamento"];
  const historico = [["carros usados df"], ["Seminovos Brasília", "financiamento"]]; // mais novo primeiro
  assert.deepEqual(escolherPalavras(palavras, historico), ["troca de carro", "seminovos brasília"]);
  assert.deepEqual(escolherPalavras([], historico), []);
  assert.deepEqual(escolherPalavras(["a", "b", "c"], [], 2), ["a", "b"]);
});

test("checarTexto aprova texto limpo", () => {
  assert.deepEqual(checarTexto(textoBom, { termosProibidos: [], saude: false }), { ok: true, motivos: [] });
});

test("checarTexto reprova tamanho, telefone, link e termo proibido", () => {
  assert.equal(checarTexto("curto", { termosProibidos: [], saude: false }).ok, false);
  assert.equal(checarTexto("x".repeat(1501), { termosProibidos: [], saude: false }).ok, false);
  const tel = checarTexto(textoBom + " Ligue (61) 99999-1234.", { termosProibidos: [], saude: false });
  assert.equal(tel.ok, false);
  assert.match(tel.motivos.join(), /telefone/);
  assert.equal(checarTexto(textoBom + " Acesse www.brazilian.com.br", { termosProibidos: [], saude: false }).ok, false);
  const proib = checarTexto(textoBom + " Carro de LEILÃO não entra.", { termosProibidos: ["leilao"], saude: false });
  assert.equal(proib.ok, false);
  assert.match(proib.motivos.join(), /leilao/);
});

test("checarTexto só aplica as regras de saúde em perfil de saúde", () => {
  const t = textoBom + " Somos a melhor clínica, resultado garantido e preço de R$ 200.";
  assert.equal(checarTexto(t, { termosProibidos: [], saude: false }).ok, true);
  const r = checarTexto(t, { termosProibidos: [], saude: true });
  assert.equal(r.ok, false);
  assert.ok(r.motivos.length >= 3);
});

test("escolherImagem: nunca usada primeiro, depois a usada há mais tempo", () => {
  assert.equal(escolherImagem([], {}), null);
  assert.equal(escolherImagem(["a", "b"], { a: "2026-09-01T00:00:00Z" }), "b");
  assert.equal(escolherImagem(["a", "b"], { a: "2026-09-02T00:00:00Z", b: "2026-09-01T00:00:00Z" }), "b");
});

test("normalizarAgenda: um item por dia, ordenado, descarta lixo", () => {
  assert.deepEqual(normalizarAgenda(null), []);
  assert.deepEqual(
    normalizarAgenda([
      { dia: 4, hora: "14:30" }, { dia: 2, hora: "09:00" }, { dia: 4, hora: "10:00" }, { dia: 7, hora: "09:00" },
      { dia: 1, hora: "25:00" }, "x", null,
    ]),
    [{ dia: 2, hora: "09:00" }, { dia: 4, hora: "14:30" }],
  );
  assert.deepEqual(normalizarAgenda(AGENDA_PADRAO), [{ dia: 2, hora: "09:00" }, { dia: 4, hora: "09:00" }]);
});

test("alternarDia liga com o horário do primeiro dia ligado e desliga", () => {
  const a = [{ dia: 2, hora: "14:30" }];
  assert.deepEqual(alternarDia(a, 5), [{ dia: 2, hora: "14:30" }, { dia: 5, hora: "14:30" }]);
  assert.deepEqual(alternarDia(a, 2), []);
  assert.deepEqual(alternarDia([], 0), [{ dia: 0, hora: "09:00" }]);
  assert.deepEqual(alternarDia(alternarDia([], 3), 1), [{ dia: 1, hora: "09:00" }, { dia: 3, hora: "09:00" }]);
});

test("mudarHora, mesmoHorario, resumoAgenda e HORARIOS", () => {
  const a = [{ dia: 2, hora: "09:00" }, { dia: 4, hora: "09:00" }];
  const b = mudarHora(a, 4, "14:30");
  assert.deepEqual(b, [{ dia: 2, hora: "09:00" }, { dia: 4, hora: "14:30" }]);
  assert.deepEqual(mesmoHorario(b, "10:00"), [{ dia: 2, hora: "10:00" }, { dia: 4, hora: "10:00" }]);
  assert.equal(resumoAgenda(b), "Ter 09:00 · Qui 14:30");
  assert.equal(resumoAgenda([]), "Sem dias");
  assert.equal(HORARIOS.length, 33);
  assert.equal(HORARIOS[0], "06:00");
  assert.equal(HORARIOS[1], "06:30");
  assert.equal(HORARIOS[HORARIOS.length - 1], "22:00");
});

test("comUtm acrescenta a UTM sem apagar parâmetros e recusa lixo", () => {
  assert.equal(
    comUtm("https://site.com/?a=1"),
    "https://site.com/?a=1&utm_source=google&utm_medium=organic&utm_campaign=gmn-post",
  );
  assert.equal(comUtm("site.com")?.startsWith("https://site.com/"), true);
  assert.equal(comUtm("https://site.com/?utm_source=x")?.includes("utm_source=x"), true);
  assert.equal(comUtm(""), null);
  assert.equal(comUtm("não é link"), null);
});

test("idPastaDrive lê os formatos de link do Drive", () => {
  assert.equal(idPastaDrive("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing"), "1AbCdEfGhIjKlMnOp");
  assert.equal(idPastaDrive("https://drive.google.com/drive/u/1/folders/1AbCdEfGhIjKlMnOp"), "1AbCdEfGhIjKlMnOp");
  assert.equal(idPastaDrive("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp"), "1AbCdEfGhIjKlMnOp");
  assert.equal(idPastaDrive("1AbCdEfGhIjKlMnOpQrStUv"), "1AbCdEfGhIjKlMnOpQrStUv");
  assert.equal(idPastaDrive("https://exemplo.com"), null);
});

test("montarMensagensPost leva briefing, tema, palavras, anteriores e regras de saúde", () => {
  const briefing = { ...BRIEFING_VAZIO, posicionamento: "a melhor loja de Brasília", cidade: "Brasília" };
  const m = montarMensagensPost({
    nome: "Brazilian Car", categoria: "Concessionária", briefing, saude: false, tema: "regiao",
    palavras: ["seminovos brasília"], anteriores: ["Post antigo"], motivoReprovacao: null,
  });
  assert.match(m.user, /Brazilian Car/);
  assert.match(m.user, /a melhor loja de Brasília/);
  assert.match(m.user, /Bairro ou região atendida/);
  assert.match(m.user, /seminovos brasília/);
  assert.match(m.user, /Post antigo/);
  assert.match(m.system, /telefone/i);
  assert.doesNotMatch(m.system, /CFM/);
  const s = montarMensagensPost({
    nome: "Clínica", categoria: null, briefing, saude: true, tema: "servico", palavras: [], anteriores: [],
    motivoReprovacao: "contém telefone",
  });
  assert.match(s.system, /CFM/);
  assert.match(s.user, /contém telefone/);
});

test("montarMensagensBriefing e montarPromptImagem", () => {
  const b = montarMensagensBriefing({
    nome: "Brazilian Car", categoria: null, site: "https://brazilian.com.br", endereco: "SIA", nicho: "automotivo",
    briefingAtual: BRIEFING_VAZIO, textoDadosInternos: "Pergunta 1 - Resposta",
  });
  assert.match(b.user, /Pergunta 1 - Resposta/);
  assert.match(b.user, /automotivo/);
  const p = montarPromptImagem({ nome: "Brazilian Car", categoria: "Loja de carros usados", briefing: BRIEFING_VAZIO, tema: "bastidores" });
  assert.match(p, /sem texto/i);
  assert.match(p, /Loja de carros usados/);
});
```

- [ ] **Step 2: Rodar os testes e ver falharem**

Run: `node --test src/lib/gmnRegras.test.ts`
Expected: FAIL (`Cannot find module .../supabase/functions/gmn/regras.ts`).

- [ ] **Step 3: Implementar as regras**

<!-- arquivo: supabase/functions/gmn/regras.ts -->
```ts
// Regras puras dos posts do Google Meu Negócio (spec 2026-09-29-gmn-posts-design.md).
// Sem imports e sem APIs de ambiente: roda na edge function (Deno), no navegador e no `node --test`.

// ------------------------------------------------------------------ briefing

export interface Briefing {
  contexto: string;
  objetivo: string;
  posicionamento: string;
  publico: string;
  tom_de_voz: string;
  servicos: string[];
  cidade: string;
  bairros: string[];
  palavras_chave: string[];
  diferenciais: string[];
  termos_proibidos: string[];
}

export const CAMPOS_TEXTO = ["contexto", "objetivo", "posicionamento", "publico", "tom_de_voz", "cidade"] as const;
export const CAMPOS_LISTA = ["servicos", "bairros", "palavras_chave", "diferenciais", "termos_proibidos"] as const;

export const BRIEFING_VAZIO: Briefing = {
  contexto: "", objetivo: "", posicionamento: "", publico: "", tom_de_voz: "", servicos: [], cidade: "",
  bairros: [], palavras_chave: [], diferenciais: [], termos_proibidos: [],
};

function lista(v: unknown): string[] {
  const itens = Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [];
  return itens.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

/** Qualquer valor (jsonb do banco, resposta da IA) → Briefing completo, só com os campos conhecidos. */
export function normalizarBriefing(v: unknown): Briefing {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const b: Briefing = { ...BRIEFING_VAZIO };
  for (const c of CAMPOS_TEXTO) b[c] = typeof o[c] === "string" ? (o[c] as string).trim() : "";
  for (const c of CAMPOS_LISTA) b[c] = lista(o[c]);
  return b;
}

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ------------------------------------------------------------------ temas e palavras-chave

export const TEMAS = ["servico", "duvida", "regiao", "diferencial", "bastidores"] as const;
export type Tema = (typeof TEMAS)[number];

export const ROTULO_TEMA: Record<Tema, string> = {
  servico: "Serviço ou produto em destaque",
  duvida: "Dúvida frequente de clientes",
  regiao: "Bairro ou região atendida",
  diferencial: "Diferencial da empresa",
  bastidores: "Bastidores e dia a dia",
};

/** Próximo tema do rodízio, depois do último usado e fora dos 3 últimos. `recentes`: mais novo primeiro. */
export function proximoTema(recentes: (string | null)[]): Tema {
  const ultimos = recentes.slice(0, 3);
  const ult = TEMAS.indexOf(recentes[0] as Tema);
  for (let i = 1; i <= TEMAS.length; i++) {
    const t = TEMAS[(ult + i + TEMAS.length) % TEMAS.length];
    if (!ultimos.includes(t)) return t;
  }
  return TEMAS[(ult + 1 + TEMAS.length) % TEMAS.length];
}

/**
 * Até `n` palavras-chave do briefing: primeiro as nunca usadas (na ordem do briefing), depois as usadas há
 * mais tempo. `historico`: palavras de cada post, do mais novo para o mais velho.
 */
export function escolherPalavras(palavras: string[], historico: string[][], n = 2): string[] {
  const ultimoUso = (p: string) => {
    const k = semAcento(p);
    const i = historico.findIndex((h) => h.some((x) => semAcento(x) === k));
    return i === -1 ? Infinity : i;
  };
  return palavras
    .map((p, ordem) => ({ p, u: ultimoUso(p), ordem }))
    .sort((a, b) => (a.u === b.u ? a.ordem - b.ordem : b.u - a.u))
    .slice(0, n)
    .map((x) => x.p);
}

// ------------------------------------------------------------------ checagem do texto

export const TEXTO_MIN = 100;
export const TEXTO_MAX = 1500;

const RE_TELEFONE = /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?9?\d{4}[\s.-]?\d{4}\b/;
const RE_LINK = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|br|digital|app|site|online|store)\b/i;

// Aplicadas ao texto sem acento e em minúsculas (perfis de saúde: CFM/CFO).
const REGRAS_SAUDE: { re: RegExp; motivo: string }[] = [
  { re: /garantid/, motivo: "promessa de resultado (garantido)" },
  { re: /100\s?%/, motivo: "promessa de resultado (100%)" },
  { re: /resultado definitivo/, motivo: "promessa de resultado definitivo" },
  { re: /\bcura(r|mos)?\b/, motivo: "promessa de cura" },
  { re: /antes e depois/, motivo: "antes e depois" },
  { re: /r\$\s?\d/, motivo: "preço de procedimento" },
  { re: /promoc/, motivo: "promoção" },
  { re: /\b(o|a) melhor\b/, motivo: "superlativo (o melhor)" },
  { re: /\b(o|a) unic[oa]\b/, motivo: "superlativo (o único)" },
  { re: /numero 1|\bn[o°º]\.?\s?1\b/, motivo: "superlativo (número 1)" },
  { re: /mais barat/, motivo: "superlativo (mais barato)" },
];

export function checarTexto(
  texto: string,
  o: { termosProibidos: string[]; saude: boolean },
): { ok: boolean; motivos: string[] } {
  const motivos: string[] = [];
  const t = texto.trim();
  if (t.length < TEXTO_MIN) motivos.push(`texto curto (${t.length} caracteres, mínimo ${TEXTO_MIN})`);
  if (t.length > TEXTO_MAX) motivos.push(`texto longo (${t.length} caracteres, máximo ${TEXTO_MAX})`);
  if (RE_TELEFONE.test(t)) motivos.push("contém telefone");
  if (RE_LINK.test(t)) motivos.push("contém link ou site");
  const n = semAcento(t);
  for (const termo of o.termosProibidos) {
    if (termo.trim() && n.includes(semAcento(termo.trim()))) motivos.push(`termo proibido: ${termo.trim()}`);
  }
  if (o.saude) for (const r of REGRAS_SAUDE) if (r.re.test(n)) motivos.push(r.motivo);
  return { ok: motivos.length === 0, motivos };
}

// ------------------------------------------------------------------ imagem, agenda e links

/** Imagem nunca usada (na ordem recebida) ou a usada há mais tempo. `usos`: ref → ISO do último uso. */
export function escolherImagem(candidatos: string[], usos: Record<string, string>): string | null {
  if (!candidatos.length) return null;
  const nunca = candidatos.find((c) => !usos[c]);
  if (nunca) return nunca;
  return [...candidatos].sort((a, b) => Date.parse(usos[a]) - Date.parse(usos[b]))[0];
}

// ------------------------------------------------------------------ agenda (dias e horários dos posts)

/** Um dia da semana com o horário do post. `dia`: 0 = domingo … 6 = sábado; `hora`: "HH:MM" (horário de Brasília). */
export interface ItemAgenda { dia: number; hora: string }

export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const HORA_PADRAO = "09:00";
export const AGENDA_PADRAO: ItemAgenda[] = [{ dia: 2, hora: HORA_PADRAO }, { dia: 4, hora: HORA_PADRAO }];

/** Horários oferecidos na tela: de 30 em 30 minutos, das 06:00 às 22:00. */
export const HORARIOS: string[] = Array.from({ length: 33 }, (_, i) => {
  const min = 6 * 60 + i * 30;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
});

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Qualquer valor (jsonb do banco, estado da tela) → agenda válida: um item por dia (o primeiro vence), em ordem de dia. */
export function normalizarAgenda(v: unknown): ItemAgenda[] {
  const porDia = new Map<number, string>();
  for (const x of Array.isArray(v) ? v : []) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const dia = typeof o.dia === "number" ? o.dia : Number.NaN;
    const hora = typeof o.hora === "string" ? o.hora.trim() : "";
    if (Number.isInteger(dia) && dia >= 0 && dia <= 6 && RE_HORA.test(hora) && !porDia.has(dia)) porDia.set(dia, hora);
  }
  return [...porDia.entries()].sort((a, b) => a[0] - b[0]).map(([dia, hora]) => ({ dia, hora }));
}

/** Liga ou desliga um dia. Dia novo entra com o horário do primeiro dia já ligado (ou 09:00). */
export function alternarDia(agenda: ItemAgenda[], dia: number): ItemAgenda[] {
  const a = normalizarAgenda(agenda);
  if (a.some((x) => x.dia === dia)) return a.filter((x) => x.dia !== dia);
  return normalizarAgenda([...a, { dia, hora: a[0]?.hora ?? HORA_PADRAO }]);
}

/** Troca o horário de um dia já ligado. */
export function mudarHora(agenda: ItemAgenda[], dia: number, hora: string): ItemAgenda[] {
  return normalizarAgenda(agenda.map((x) => (x.dia === dia ? { dia, hora } : x)));
}

/** O mesmo horário em todos os dias ligados. */
export function mesmoHorario(agenda: ItemAgenda[], hora: string): ItemAgenda[] {
  return normalizarAgenda(agenda.map((x) => ({ dia: x.dia, hora })));
}

/** "Ter 09:00 · Qui 14:30" (sem nenhum dia: "Sem dias"). */
export function resumoAgenda(agenda: ItemAgenda[]): string {
  const a = normalizarAgenda(agenda);
  return a.length ? a.map((x) => `${DIAS_CURTOS[x.dia]} ${x.hora}`).join(" · ") : "Sem dias";
}

export const UTM = { utm_source: "google", utm_medium: "organic", utm_campaign: "gmn-post" };

/** URL do botão com a UTM do GMN (mantém parâmetros e UTM já existentes). `null` se não for link. */
export function comUtm(url: string): string | null {
  const t = url.trim();
  if (!t || /\s/.test(t)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!u.hostname.includes(".")) return null;
    for (const [k, v] of Object.entries(UTM)) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return null;
  }
}

/** Id da pasta a partir do link do Drive (ou o próprio id colado). */
export function idPastaDrive(link: string): string | null {
  const t = link.trim();
  const m = /\/folders\/([\w-]{10,})/.exec(t) ?? /[?&]id=([\w-]{10,})/.exec(t);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(t) ? t : null;
}

// ------------------------------------------------------------------ prompts

export interface Mensagens { system: string; user: string }

export interface EntradaPost {
  nome: string;
  categoria: string | null;
  briefing: Briefing;
  saude: boolean;
  tema: Tema;
  palavras: string[];
  anteriores: string[];
  motivoReprovacao: string | null;
}

function blocoBriefing(b: Briefing): string {
  const linhas: string[] = [];
  const add = (rotulo: string, v: string | string[]) => {
    const s = Array.isArray(v) ? v.join("; ") : v;
    if (s.trim()) linhas.push(`- ${rotulo}: ${s}`);
  };
  add("Contexto", b.contexto);
  add("Objetivo dos posts", b.objetivo);
  add("Posicionamento", b.posicionamento);
  add("Público-alvo", b.publico);
  add("Tom de voz", b.tom_de_voz);
  add("Serviços/produtos", b.servicos);
  add("Cidade", b.cidade);
  add("Bairros/região", b.bairros);
  add("Palavras-chave de SEO local", b.palavras_chave);
  add("Diferenciais", b.diferenciais);
  add("Nunca usar", b.termos_proibidos);
  return linhas.join("\n") || "- (briefing vazio)";
}

export function montarMensagensPost(e: EntradaPost): Mensagens {
  const regras = [
    "Você escreve posts para o Perfil da Empresa no Google (Google Meu Negócio) de negócios locais brasileiros.",
    "Escreva em português do Brasil, entre 150 e 300 palavras, no máximo 1.400 caracteres.",
    "Otimize para SEO local: use a palavra-chave e a cidade ou bairro de forma natural, sem repetir à exaustão.",
    "Não inclua número de telefone, WhatsApp, e-mail, links ou nomes de site: o botão do post já leva ao contato.",
    "No máximo 3 hashtags, só se fizerem sentido. Sem emojis em excesso (no máximo 2).",
    "Siga o tom de voz e o posicionamento do briefing. Não invente preços, prêmios, números ou fatos que não estejam no briefing.",
    "Termine com uma chamada para ação coerente com o objetivo do briefing.",
    'Responda só com JSON: {"texto": "...", "palavras_chave": ["as palavras-chave que você usou"]}.',
  ];
  if (e.saude) {
    regras.push(
      "Este é um perfil da área da saúde: siga as regras de publicidade do CFM e do CFO. Não prometa resultado nem cura, " +
        "não use 'antes e depois', não cite preços, valores ou promoções, não use superlativos ('o melhor', 'o único', 'número 1', 'mais barato').",
    );
  }
  const partes = [
    `Empresa: ${e.nome}${e.categoria ? ` (${e.categoria})` : ""}`,
    `Briefing:\n${blocoBriefing(e.briefing)}`,
    `Tema deste post: ${ROTULO_TEMA[e.tema]}`,
    e.palavras.length ? `Palavras-chave para este post: ${e.palavras.join("; ")}` : "Palavras-chave: use as do briefing.",
    e.anteriores.length
      ? `Posts anteriores (não repita assunto, abertura nem frases):\n${e.anteriores.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "",
    e.motivoReprovacao ? `A versão anterior foi reprovada por: ${e.motivoReprovacao}. Corrija isso.` : "",
  ];
  return { system: regras.join("\n"), user: partes.filter(Boolean).join("\n\n") };
}

export interface EntradaBriefing {
  nome: string;
  categoria: string | null;
  site: string | null;
  endereco: string | null;
  nicho: string | null;
  briefingAtual: Briefing;
  textoDadosInternos: string | null;
}

export function montarMensagensBriefing(e: EntradaBriefing): Mensagens {
  const system = [
    "Você é estrategista de marketing local e monta o briefing de marca de um negócio para posts no Google Meu Negócio.",
    "Use apenas as informações recebidas; quando faltar algo, faça uma sugestão prudente e genérica, sem inventar fatos.",
    "Palavras-chave: de 5 a 10 buscas locais reais que o cliente faria (serviço + cidade/bairro), em minúsculas.",
    "Listas: itens curtos. Termos proibidos: só o que o material pedir para evitar (lista vazia se nada for dito).",
    "Mantenha o que já estiver preenchido no briefing atual, a menos que o material traga algo melhor.",
    "Responda só com o JSON do briefing.",
  ].join("\n");
  const user = [
    `Empresa: ${e.nome}`,
    e.categoria ? `Categoria no Google: ${e.categoria}` : "",
    e.site ? `Site: ${e.site}` : "",
    e.endereco ? `Endereço: ${e.endereco}` : "",
    e.nicho ? `Nicho: ${e.nicho}` : "",
    `Briefing atual:\n${blocoBriefing(e.briefingAtual)}`,
    e.textoDadosInternos ? `Respostas do formulário de briefing do cliente:\n${e.textoDadosInternos.slice(0, 20000)}` : "",
  ];
  return { system, user: user.filter(Boolean).join("\n\n") };
}

export function montarPromptImagem(e: { nome: string; categoria: string | null; briefing: Briefing; tema: Tema }): string {
  const negocio = e.categoria || e.briefing.servicos[0] || e.nome;
  const local = [e.briefing.cidade, ...e.briefing.bairros.slice(0, 1)].filter(Boolean).join(", ");
  return [
    `Fotografia realista e profissional para o post de um negócio local: ${negocio}${local ? ` em ${local}` : ""}.`,
    `Assunto: ${ROTULO_TEMA[e.tema]}${e.briefing.servicos.length ? ` — ${e.briefing.servicos.slice(0, 3).join(", ")}` : ""}.`,
    "Luz natural, cores agradáveis, composição limpa, aparência de foto real tirada no local.",
    "Sem texto, sem letras, sem logotipos, sem marcas d'água e sem rostos em destaque.",
  ].join(" ");
}

// ------------------------------------------------------------------ esquemas da OpenAI (strict)

export const ESQUEMA_POST = {
  type: "object",
  additionalProperties: false,
  required: ["texto", "palavras_chave"],
  properties: {
    texto: { type: "string" },
    palavras_chave: { type: "array", items: { type: "string" } },
  },
};

const TEXTO = { type: "string" };
const LISTA = { type: "array", items: { type: "string" } };

export const ESQUEMA_BRIEFING = {
  type: "object",
  additionalProperties: false,
  required: [...CAMPOS_TEXTO, ...CAMPOS_LISTA],
  properties: {
    contexto: TEXTO, objetivo: TEXTO, posicionamento: TEXTO, publico: TEXTO, tom_de_voz: TEXTO, cidade: TEXTO,
    servicos: LISTA, bairros: LISTA, palavras_chave: LISTA, diferenciais: LISTA, termos_proibidos: LISTA,
  },
};
```

- [ ] **Step 4: Rodar os testes e ver passarem**

Run: `node --test src/lib/gmnRegras.test.ts`
Expected: PASS (14 testes). Depois `npm test` inteiro: nenhum teste antigo quebrado.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/gmn/regras.ts src/lib/gmnRegras.test.ts
git commit -m "GMN: regras puras (temas, palavras-chave, checagem, imagem, UTM e prompts)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Edge function `gmn`

**Files:**
- Create: `supabase/functions/gmn/acesso.ts`, `google.ts`, `openai.ts`, `r2.ts`, `conteudo.ts`, `index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: tudo de `regras.ts` (Task 2); tabelas da Task 1; `google_oauth_tokens` (linha mais recente = contato@).
- Produces (HTTP, `https://<projeto>.supabase.co/functions/v1/gmn`):
  - `GET` → `{ openai: boolean, r2: boolean, acesso: boolean }`
  - `POST { acao: "briefing", perfil_id: string, texto_dados_internos?: string | null }` → `{ briefing: Briefing }` (não salva)
  - `POST { acao: "previa", perfil_id: string }` → `{ post: PostGmn }` (linha de `gmn_posts`, `origem='previa'`, status `gerado` | `pulado` | `erro`)
  - Cabeçalhos exigidos no POST: `apikey` + (`x-google-id-token` **ou** `x-swipe-key`). Erros: `{ error: string }` com 4xx/5xx.

Sem teste automatizado aqui (só I/O; a lógica está coberta na Task 2). A verificação é o teste de ponta a ponta da Task 7.

- [ ] **Step 1: Acesso (mesma regra do `google-token`)**

<!-- arquivo: supabase/functions/gmn/acesso.ts -->
```ts
// Libera a chamada como o `google-token`: ID token do Google de um e-mail permitido OU a chave do swipe file.

async function verificarIdToken(idToken: string, clientId: string, permitidos: string[]): Promise<boolean> {
  if (!idToken || !clientId || permitidos.length === 0) return false;
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken));
    if (!r.ok) return false;
    const c = await r.json();
    const issOk = c.iss === "accounts.google.com" || c.iss === "https://accounts.google.com";
    const verificado = c.email_verified === true || c.email_verified === "true";
    return issOk && c.aud === clientId && verificado && Number(c.exp) * 1000 > Date.now() &&
      permitidos.includes(String(c.email || "").toLowerCase());
  } catch {
    return false;
  }
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function acessoConfigurado(): boolean {
  return !!Deno.env.get("SWIPE_KEY") || !!Deno.env.get("ALLOWED_GOOGLE_EMAILS");
}

export async function acessoLiberado(req: Request): Promise<boolean> {
  const chave = Deno.env.get("SWIPE_KEY") || "";
  const enviada = req.headers.get("x-swipe-key") || "";
  if (chave && enviada && iguais(enviada, chave)) return true;
  const permitidos = (Deno.env.get("ALLOWED_GOOGLE_EMAILS") || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return verificarIdToken(req.headers.get("x-google-id-token") || "", Deno.env.get("GOOGLE_CLIENT_ID") || "", permitidos);
}
```

- [ ] **Step 2: Google (token da contato@ e Drive)**

<!-- arquivo: supabase/functions/gmn/google.ts -->
```ts
// Token do Google guardado em google_oauth_tokens (Fase 1: linha mais recente = contato@) e leitura do Drive.
// deno-lint-ignore-file no-explicit-any
type Sb = any;

export async function tokenGoogle(sb: Sb): Promise<string> {
  const { data: row, error } = await sb
    .from("google_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row?.refresh_token) throw new Error("Google não conectado (Admin → Swipe file).");
  const expira = new Date(row.expires_at).getTime();
  if (row.access_token && !Number.isNaN(expira) && expira - Date.now() > 120_000) return row.access_token;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Google recusou renovar o token (${d.error}).`);
  const novo = new Date(Date.now() + Number(d.expires_in || 3600) * 1000).toISOString();
  await sb.from("google_oauth_tokens")
    .update({ access_token: d.access_token, expires_at: novo, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  return d.access_token;
}

export interface ImagemDrive { id: string; name: string; mimeType: string }

const LIMITE_BYTES = 5 * 1024 * 1024;

/** Imagens JPG/PNG de até 5 MB direto na pasta (sem subpastas), mais novas primeiro. */
export async function imagensDaPasta(token: string, pastaId: string): Promise<ImagemDrive[]> {
  const q = `'${pastaId.replace(/'/g, "\\'")}' in parents and trashed = false and (mimeType = 'image/jpeg' or mimeType = 'image/png')`;
  const params = new URLSearchParams({ q, fields: "files(id,name,mimeType,size)", pageSize: "200", orderBy: "createdTime desc" });
  params.set("supportsAllDrives", "true");
  params.set("includeItemsFromAllDrives", "true");
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `Drive respondeu ${r.status} ao listar a pasta`);
  return (d.files ?? []).filter((f: any) => Number(f.size || 0) <= LIMITE_BYTES);
}

export async function baixarDoDrive(token: string, id: string): Promise<Uint8Array> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Drive respondeu ${r.status} ao baixar a foto`);
  return new Uint8Array(await r.arrayBuffer());
}
```

- [ ] **Step 3: OpenAI**

<!-- arquivo: supabase/functions/gmn/openai.ts -->
```ts
// OpenAI: resposta em JSON (Chat Completions + JSON Schema estrito) e geração de imagem.

const BASE = "https://api.openai.com/v1";

export function openaiConfigurada(): boolean {
  return !!Deno.env.get("OPENAI_API_KEY");
}

function cabecalhos(): HeadersInit {
  const chave = Deno.env.get("OPENAI_API_KEY");
  if (!chave) throw new Error("Falta o secret OPENAI_API_KEY.");
  return { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" };
}

async function erroOpenai(r: Response): Promise<Error> {
  const d = await r.json().catch(() => ({}));
  return new Error(`OpenAI respondeu ${r.status}: ${d?.error?.message || "sem detalhe"}`);
}

export async function gerarJson<T>(system: string, user: string, nome: string, schema: object): Promise<T> {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: cabecalhos(),
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODELO_TEXTO") || "gpt-5-mini",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_schema", json_schema: { name: nome, strict: true, schema } },
    }),
  });
  if (!r.ok) throw await erroOpenai(r);
  const d = await r.json();
  const conteudo = d?.choices?.[0]?.message?.content;
  if (!conteudo) throw new Error("OpenAI devolveu resposta vazia.");
  return JSON.parse(conteudo) as T;
}

/** PNG gerado pela OpenAI (paisagem). */
export async function gerarImagem(prompt: string): Promise<Uint8Array> {
  const r = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: cabecalhos(),
    body: JSON.stringify({ model: Deno.env.get("OPENAI_MODELO_IMAGEM") || "gpt-image-1", prompt, size: "1536x1024", n: 1 }),
  });
  if (!r.ok) throw await erroOpenai(r);
  const d = await r.json();
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI não devolveu a imagem.");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
```

- [ ] **Step 4: R2**

<!-- arquivo: supabase/functions/gmn/r2.ts -->
```ts
// Upload no Cloudflare R2 (API S3, assinatura via aws4fetch) e URL pública do bucket.
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE"];

export function r2Configurado(): boolean {
  return VARS.every((v) => !!Deno.env.get(v));
}

/** Envia e devolve a URL pública (`R2_PUBLIC_BASE/chave`). */
export async function enviarR2(chave: string, bytes: Uint8Array, tipo: string): Promise<string> {
  if (!r2Configurado()) throw new Error(`Faltam secrets do R2 (${VARS.join(", ")}).`);
  const aws = new AwsClient({
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
    service: "s3",
    region: "auto",
  });
  const url = `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${Deno.env.get("R2_BUCKET")}/${chave}`;
  const r = await aws.fetch(url, { method: "PUT", body: bytes, headers: { "Content-Type": tipo } });
  if (!r.ok) throw new Error(`R2 respondeu ${r.status} ao enviar a imagem: ${(await r.text()).slice(0, 200)}`);
  return `${Deno.env.get("R2_PUBLIC_BASE")!.replace(/\/+$/, "")}/${chave}`;
}
```

- [ ] **Step 5: Montagem do post**

<!-- arquivo: supabase/functions/gmn/conteudo.ts -->
```ts
// Um post completo, sem publicar: tema → texto (com checagem e 1 nova tentativa) → imagem.
// deno-lint-ignore-file no-explicit-any
import {
  ESQUEMA_POST, checarTexto, escolherImagem, escolherPalavras, idPastaDrive, montarMensagensPost, montarPromptImagem,
  normalizarBriefing, proximoTema, type Tema,
} from "./regras.ts";
import { gerarImagem, gerarJson } from "./openai.ts";
import { enviarR2 } from "./r2.ts";
import { baixarDoDrive, imagensDaPasta, tokenGoogle } from "./google.ts";

type Sb = any;

export interface CamposPost {
  status: "gerado" | "pulado";
  tema: Tema;
  palavras_chave: string[];
  texto: string;
  imagem_origem: "drive" | "ia" | null;
  imagem_ref: string | null;
  imagem_url: string | null;
  erro: string | null;
}

async function imagemDoDrive(sb: Sb, perfil: any, postId: string) {
  const pastaId = perfil.drive_pasta_url ? idPastaDrive(perfil.drive_pasta_url) : null;
  if (!pastaId) return null;
  const token = await tokenGoogle(sb);
  const fotos = await imagensDaPasta(token, pastaId);
  if (!fotos.length) return null;
  const { data: usos } = await sb.from("gmn_imagens_uso").select("ref, usado_em").eq("perfil_id", perfil.id).eq("origem", "drive");
  const mapa: Record<string, string> = Object.fromEntries((usos ?? []).map((u: any) => [u.ref, u.usado_em]));
  const ref = escolherImagem(fotos.map((f) => f.id), mapa);
  const foto = fotos.find((f) => f.id === ref)!;
  const bytes = await baixarDoDrive(token, foto.id);
  const ext = foto.mimeType === "image/png" ? "png" : "jpg";
  const url = await enviarR2(`${perfil.id}/${postId}.${ext}`, bytes, foto.mimeType);
  await sb.from("gmn_imagens_uso").upsert(
    { perfil_id: perfil.id, origem: "drive", ref: foto.id, usado_em: new Date().toISOString() },
    { onConflict: "perfil_id,origem,ref" },
  );
  return { origem: "drive" as const, ref: foto.id, url };
}

async function imagemDaIa(perfil: any, postId: string, tema: Tema) {
  const prompt = montarPromptImagem({ nome: perfil.nome, categoria: perfil.categoria, briefing: normalizarBriefing(perfil.briefing), tema });
  const bytes = await gerarImagem(prompt);
  const chave = `${perfil.id}/${postId}.png`;
  const url = await enviarR2(chave, bytes, "image/png");
  return { origem: "ia" as const, ref: chave, url };
}

export async function gerarConteudo(sb: Sb, perfil: any, postId: string): Promise<CamposPost> {
  const briefing = normalizarBriefing(perfil.briefing);
  const { data: hist } = await sb
    .from("gmn_posts")
    .select("tema, palavras_chave, texto")
    .eq("perfil_id", perfil.id)
    .in("status", ["publicado", "gerado"])
    .neq("id", postId)
    .order("created_at", { ascending: false })
    .limit(10);
  const historico = (hist ?? []) as { tema: string | null; palavras_chave: string[] | null; texto: string | null }[];
  const tema = proximoTema(historico.map((h) => h.tema));
  const palavras = escolherPalavras(briefing.palavras_chave, historico.map((h) => h.palavras_chave ?? []));
  const anteriores = historico.map((h) => h.texto).filter((t): t is string => !!t);

  let motivo: string | null = null;
  let resposta = { texto: "", palavras_chave: [] as string[] };
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const m = montarMensagensPost({
      nome: perfil.nome, categoria: perfil.categoria, briefing, saude: perfil.saude, tema, palavras, anteriores,
      motivoReprovacao: motivo,
    });
    resposta = await gerarJson<{ texto: string; palavras_chave: string[] }>(m.system, m.user, "post_gmn", ESQUEMA_POST);
    const c = checarTexto(resposta.texto, { termosProibidos: briefing.termos_proibidos, saude: perfil.saude });
    motivo = c.ok ? null : c.motivos.join("; ");
    if (c.ok) break;
  }
  const usadas = resposta.palavras_chave?.length ? resposta.palavras_chave : palavras;
  if (motivo) {
    return {
      status: "pulado", tema, palavras_chave: usadas, texto: resposta.texto, imagem_origem: null, imagem_ref: null,
      imagem_url: null, erro: `Texto reprovado na checagem: ${motivo}`,
    };
  }

  let imagem: { origem: "drive" | "ia"; ref: string; url: string } | null = null;
  let aviso: string | null = null;
  try {
    imagem = await imagemDoDrive(sb, perfil, postId);
  } catch (e) {
    aviso = `Pasta do Drive: ${e instanceof Error ? e.message : String(e)}`;
    console.error(aviso);
  }
  if (!imagem && perfil.usa_ia_imagem) imagem = await imagemDaIa(perfil, postId, tema);

  return {
    status: "gerado", tema, palavras_chave: usadas, texto: resposta.texto.trim(), imagem_origem: imagem?.origem ?? null,
    imagem_ref: imagem?.ref ?? null, imagem_url: imagem?.url ?? null, erro: aviso,
  };
}
```

- [ ] **Step 6: Rotas**

<!-- arquivo: supabase/functions/gmn/index.ts -->
```ts
// Posts no Google Meu Negócio — Fase 1 (sem publicar no Google).
//   GET                                          -> { openai, r2, acesso }
//   POST { acao: "briefing", perfil_id, texto_dados_internos? } -> { briefing }   (não salva)
//   POST { acao: "previa", perfil_id }           -> { post }                      (gmn_posts, origem 'previa')
// POST exige x-google-id-token (e-mail em ALLOWED_GOOGLE_EMAILS) ou x-swipe-key, como o google-token.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { acessoConfigurado, acessoLiberado } from "./acesso.ts";
import { gerarJson, openaiConfigurada } from "./openai.ts";
import { r2Configurado } from "./r2.ts";
import { gerarConteudo } from "./conteudo.ts";
import { ESQUEMA_BRIEFING, montarMensagensBriefing, normalizarBriefing } from "./regras.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-swipe-key, x-google-id-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function carregarPerfil(sb: any, id: string) {
  const { data, error } = await sb.from("gmn_perfis").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Perfil não encontrado.");
  return data;
}

async function acaoBriefing(sb: any, body: any): Promise<Response> {
  const perfil = await carregarPerfil(sb, String(body.perfil_id || ""));
  let nicho: string | null = null;
  if (perfil.cliente_id) {
    const { data } = await sb.from("clientes").select("nicho").eq("id", perfil.cliente_id).maybeSingle();
    nicho = data?.nicho ?? null;
  }
  const m = montarMensagensBriefing({
    nome: perfil.nome, categoria: perfil.categoria, site: perfil.site, endereco: perfil.endereco, nicho,
    briefingAtual: normalizarBriefing(perfil.briefing),
    textoDadosInternos: typeof body.texto_dados_internos === "string" ? body.texto_dados_internos : null,
  });
  const r = await gerarJson<unknown>(m.system, m.user, "briefing_gmn", ESQUEMA_BRIEFING);
  return json({ briefing: normalizarBriefing(r) });
}

async function acaoPrevia(sb: any, body: any): Promise<Response> {
  const perfil = await carregarPerfil(sb, String(body.perfil_id || ""));
  if (!perfil.briefing_salvo_em) return json({ error: "Salve o briefing antes de gerar a prévia." }, 400);
  const { data: post, error } = await sb
    .from("gmn_posts")
    .insert({ perfil_id: perfil.id, origem: "previa", status: "gerando" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  let campos: Record<string, unknown>;
  try {
    campos = { ...(await gerarConteudo(sb, perfil, post.id)) };
  } catch (e) {
    campos = { status: "erro", erro: msg(e) };
  }
  const { data: final, error: e2 } = await sb
    .from("gmn_posts")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", post.id)
    .select("*")
    .single();
  if (e2) throw new Error(e2.message);
  return json({ post: final });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET") return json({ openai: openaiConfigurada(), r2: r2Configurado(), acesso: acessoConfigurado() });
  if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);
  if (!(await acessoLiberado(req))) return json({ error: "Acesso não autorizado. Entre com o Google ou informe a chave." }, 403);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  try {
    if (body.acao === "briefing") return await acaoBriefing(sb, body);
    if (body.acao === "previa") return await acaoPrevia(sb, body);
    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: msg(e) }, 500);
  }
});
```

- [ ] **Step 7: `config.toml`**

Acrescentar ao fim de `supabase/config.toml`:

```toml

[functions.gmn]
verify_jwt = false
```

- [ ] **Step 8: Checar o módulo de regras no Deno (se o Deno estiver instalado)**

Run: `deno check supabase/functions/gmn/index.ts` (se `deno` não existir, pular; o deploy do Lovable faz a checagem).
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/gmn supabase/config.toml
git commit -m "GMN: edge function gmn (briefing com IA e prévia de post com imagem no R2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Secrets e deploy da função

**Files:** nenhum no repositório.

**Interfaces:**
- Produces: função `gmn` publicada no Lovable Cloud com os secrets `OPENAI_API_KEY`, `OPENAI_MODELO_TEXTO`, `OPENAI_MODELO_IMAGEM`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE`.

- [ ] **Step 1: Chave do R2 (Chrome, conta Cloudflare da contato@)**

Em `https://dash.cloudflare.com/b4e84eaa8099c0e841a2eb35824027ca/r2/api-tokens` → **Create Account API token**: nome `gmn-midia (sistema)`, permissão **Object Read & Write**, escopo **só o bucket `gmn-midia`**, sem expiração. Ao criar, a Cloudflare mostra **Access Key ID** e **Secret Access Key** uma única vez: **não copiar para o chat nem para arquivo**. Pedir ao usuário que deixe essa tela aberta para colar os dois valores no Step 3.

- [ ] **Step 2: Chave da OpenAI**

O usuário cria em `https://platform.openai.com/api-keys` a chave `gestao-de-operacao gmn` (projeto padrão) e a mantém à vista para o Step 3. Conferir, na página de modelos da OpenAI, os nomes atuais do modelo de texto barato e do modelo de imagem. Os padrões do código são `gpt-5-mini` e `gpt-image-1`; se mudaram, usar os nomes atuais nos secrets `OPENAI_MODELO_TEXTO` e `OPENAI_MODELO_IMAGEM`.

- [ ] **Step 3: Secrets no Lovable Cloud (o usuário cola os valores sensíveis)**

No projeto do Lovable → Cloud → Secrets, criar:

| Secret | Valor | Quem preenche |
|---|---|---|
| `OPENAI_API_KEY` | chave do Step 2 | usuário |
| `OPENAI_MODELO_TEXTO` | nome conferido no Step 2 | agente |
| `OPENAI_MODELO_IMAGEM` | nome conferido no Step 2 | agente |
| `R2_ACCOUNT_ID` | `b4e84eaa8099c0e841a2eb35824027ca` | agente |
| `R2_ACCESS_KEY_ID` | do Step 1 | usuário |
| `R2_SECRET_ACCESS_KEY` | do Step 1 | usuário |
| `R2_BUCKET` | `gmn-midia` | agente |
| `R2_PUBLIC_BASE` | `https://pub-ae3cb23015f64d9183be1720f7c52e2e.r2.dev` | agente |

- [ ] **Step 4: Push e deploy**

Pedir ao usuário: `! git push origin main`. Depois, no chat do Lovable (sem publicar o site): "Faça o deploy da edge function `gmn` (pasta supabase/functions/gmn, verify_jwt = false). Não altere nenhum arquivo." Confirmar que o Lovable não mexeu em arquivos (se mexer, trazer com `git pull` e revisar).

- [ ] **Step 5: Verificar**

Run:
```bash
curl -s "$(grep VITE_SUPABASE_URL .env | cut -d= -f2 | tr -d '\"')/functions/v1/gmn" -H "apikey: $(grep VITE_SUPABASE_PUBLISHABLE_KEY .env | cut -d= -f2 | tr -d '\"')"
```
Expected: `{"openai":true,"r2":true,"acesso":true}`.

---

### Task 5: Camada de dados do front

**Files:**
- Modify: `src/lib/googleDrive.ts` (extrair `cabecalhosDeAcesso`)
- Create: `src/lib/gmn.ts`

**Interfaces:**
- Consumes: `regras.ts` (`Briefing`, `normalizarBriefing`, `ItemAgenda`, `normalizarAgenda`); função `gmn` (Task 3).
- Produces (`src/lib/gmn.ts`):
  - `PUBLICACAO_LIBERADA = false`
  - `interface PerfilGmn { id; location_name: string | null; nome: string; endereco; categoria; site; telefone: string | null; cliente_id: string | null; ativo: boolean; sem_acesso: boolean; agenda: ItemAgenda[]; cta_tipo: "LEARN_MORE" | "CALL" | "BOOK"; cta_url: string | null; drive_pasta_url: string | null; usa_ia_imagem: boolean; saude: boolean; briefing: Briefing; briefing_salvo_em: string | null; created_at: string }`
  - `interface PostGmn { id; perfil_id; origem: "agenda" | "manual" | "previa"; status: "agendado" | "gerando" | "gerado" | "publicado" | "erro" | "pulado"; tema: string | null; palavras_chave: string[]; texto: string | null; imagem_origem: "drive" | "google" | "ia" | null; imagem_url: string | null; google_url: string | null; erro: string | null; created_at: string }`
  - `interface ClienteOpcao { id: string; nome: string }`
  - `fetchPerfis(): Promise<PerfilGmn[]>`, `fetchClientesOpcoes(): Promise<ClienteOpcao[]>`, `criarPerfil(nome: string, cliente_id: string | null): Promise<PerfilGmn>`, `salvarPerfil(id: string, patch: Partial<PerfilGmn>): Promise<void>`, `salvarBriefing(id: string, b: Briefing): Promise<string>` (devolve o `briefing_salvo_em`), `excluirPerfil(id: string): Promise<void>`, `fetchPosts(perfilId: string): Promise<PostGmn[]>`, `gerarBriefingIa(perfilId: string, textoDadosInternos: string | null): Promise<Briefing>`, `gerarPrevia(perfilId: string): Promise<PostGmn>`, `traduzErroGmn(e: unknown): string`
  - `googleDrive.ts`: `cabecalhosDeAcesso(): Promise<Record<string, string>>`

- [ ] **Step 1: Extrair `cabecalhosDeAcesso` em `src/lib/googleDrive.ts`**

Substituir, dentro de `getAccessToken()`, o trecho que vai de `// 1) Login Google (funciona em qualquer navegador/dispositivo), quando disponível` até `else headers["x-swipe-key"] = key;` (inclusive) por:

```ts
  const headers = await cabecalhosDeAcesso();
```

e acrescentar, logo antes de `export async function getAccessToken()`:

```ts
/**
 * Cabeçalhos que liberam as edge functions protegidas (google-token, gmn): ID token do login Google
 * (tenta o login silencioso) ou, na falta dele, a chave do swipe file.
 */
export async function cabecalhosDeAcesso(): Promise<Record<string, string>> {
  // 1) Login Google (funciona em qualquer navegador/dispositivo), quando disponível
  let idToken = idTokenEmCache();
  if (!idToken) {
    const st = await statusDoDrive().catch(() => null);
    if (st?.google_login && st.client_id) idToken = await loginSilencioso(st.client_id);
  }

  // 2) Fallback: chave do swipe file (navegadores já configurados)
  const key = getSwipeKey();
  if (!idToken && !key) {
    const st = statusCache?.data;
    throw new DriveAuthError(
      st?.google_login
        ? "Entre com o Google para usar o swipe file."
        : "Informe a chave do swipe file (Admin → Swipe file).",
    );
  }

  const headers: Record<string, string> = { apikey: ANON_KEY, "Content-Type": "application/json" };
  if (idToken) headers["x-google-id-token"] = idToken;
  else headers["x-swipe-key"] = key;
  return headers;
}
```

(O comportamento de `getAccessToken` não muda: mesmos cabeçalhos, mesmos erros.)

- [ ] **Step 2: Escrever `src/lib/gmn.ts`**

<!-- arquivo: src/lib/gmn.ts -->
```ts
// Aba Google Meu Negócio: perfis, posts e chamadas à edge function `gmn`.
// O types.ts gerado ainda não conhece as tabelas novas: por isso `as any` nos `.from(...)`.
import { supabase } from "@/integrations/supabase/client";
import { cabecalhosDeAcesso } from "@/lib/googleDrive";
import { normalizarAgenda, normalizarBriefing, type Briefing, type ItemAgenda } from "../../supabase/functions/gmn/regras.ts";

/** Fase 1: nada é publicado no Google; o liga/desliga fica desabilitado até a API ser aprovada. */
export const PUBLICACAO_LIBERADA = false;

export type CtaTipo = "LEARN_MORE" | "CALL" | "BOOK";

export interface PerfilGmn {
  id: string;
  location_name: string | null;
  nome: string;
  endereco: string | null;
  categoria: string | null;
  site: string | null;
  telefone: string | null;
  cliente_id: string | null;
  ativo: boolean;
  sem_acesso: boolean;
  agenda: ItemAgenda[];
  cta_tipo: CtaTipo;
  cta_url: string | null;
  drive_pasta_url: string | null;
  usa_ia_imagem: boolean;
  saude: boolean;
  briefing: Briefing;
  briefing_salvo_em: string | null;
  created_at: string;
}

export interface PostGmn {
  id: string;
  perfil_id: string;
  origem: "agenda" | "manual" | "previa";
  status: "agendado" | "gerando" | "gerado" | "publicado" | "erro" | "pulado";
  tema: string | null;
  palavras_chave: string[];
  texto: string | null;
  imagem_origem: "drive" | "google" | "ia" | null;
  imagem_url: string | null;
  google_url: string | null;
  erro: string | null;
  created_at: string;
}

export interface ClienteOpcao { id: string; nome: string }

const perfis = () => supabase.from("gmn_perfis" as any) as any;
const posts = () => supabase.from("gmn_posts" as any) as any;
const FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmn`;

const CAMPOS_PERFIL =
  "id, location_name, nome, endereco, categoria, site, telefone, cliente_id, ativo, sem_acesso, agenda, " +
  "cta_tipo, cta_url, drive_pasta_url, usa_ia_imagem, saude, briefing, briefing_salvo_em, created_at";
const CAMPOS_POST = "id, perfil_id, origem, status, tema, palavras_chave, texto, imagem_origem, imagem_url, google_url, erro, created_at";

function comBriefing(p: any): PerfilGmn {
  return { ...p, briefing: normalizarBriefing(p.briefing), agenda: normalizarAgenda(p.agenda) } as PerfilGmn;
}

/** Tabela ainda não criada no banco (migration pendente) vira uma mensagem clara. */
export function traduzErroGmn(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? "");
  if (/gmn_/i.test(msg) && /schema cache|does not exist|not find/i.test(msg)) {
    return "As tabelas do Google Meu Negócio ainda não existem no banco (migration 20260929120000_gmn.sql).";
  }
  return msg || "Erro inesperado";
}

export async function fetchPerfis(): Promise<PerfilGmn[]> {
  const { data, error } = await perfis().select(CAMPOS_PERFIL).order("nome");
  if (error) throw error;
  return (data || []).map(comBriefing);
}

export async function fetchClientesOpcoes(): Promise<ClienteOpcao[]> {
  const { data, error } = await supabase.from("clientes").select("id, nome, arquivado").order("nome");
  if (error) throw error;
  return (data || []).filter((c: any) => !c.arquivado).map((c: any) => ({ id: c.id, nome: c.nome }));
}

export async function criarPerfil(nome: string, cliente_id: string | null): Promise<PerfilGmn> {
  const { data, error } = await perfis().insert([{ nome: nome.trim(), cliente_id }]).select(CAMPOS_PERFIL).single();
  if (error) throw error;
  return comBriefing(data);
}

export async function salvarPerfil(id: string, patch: Partial<PerfilGmn>): Promise<void> {
  const { error } = await perfis().update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function salvarBriefing(id: string, b: Briefing): Promise<string> {
  const agora = new Date().toISOString();
  const { error } = await perfis().update({ briefing: normalizarBriefing(b), briefing_salvo_em: agora, updated_at: agora }).eq("id", id);
  if (error) throw error;
  return agora;
}

export async function excluirPerfil(id: string): Promise<void> {
  const { error } = await perfis().delete().eq("id", id);
  if (error) throw error;
}

export async function fetchPosts(perfilId: string): Promise<PostGmn[]> {
  const { data, error } = await posts().select(CAMPOS_POST).eq("perfil_id", perfilId).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []) as PostGmn[];
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const headers = await cabecalhosDeAcesso();
  const r = await fetch(FUNCAO, { method: "POST", headers, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `A função gmn respondeu ${r.status}`);
  return d as T;
}

export async function gerarBriefingIa(perfilId: string, textoDadosInternos: string | null): Promise<Briefing> {
  const d = await chamar<{ briefing: unknown }>({ acao: "briefing", perfil_id: perfilId, texto_dados_internos: textoDadosInternos });
  return normalizarBriefing(d.briefing);
}

export async function gerarPrevia(perfilId: string): Promise<PostGmn> {
  const d = await chamar<{ post: PostGmn }>({ acao: "previa", perfil_id: perfilId });
  return d.post;
}
```

- [ ] **Step 3: Checar tipos e testes**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/lib/(gmn|googleDrive)\.ts" ; npm test`
Expected: nenhuma linha do `grep` (sem erros novos nesses arquivos) e todos os testes passando.

- [ ] **Step 4: Commit**

```bash
git add src/lib/googleDrive.ts src/lib/gmn.ts
git commit -m "GMN: camada de dados da aba e cabeçalho de acesso reutilizável

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Tela da aba `/gmn`

**Files:**
- Create: `src/routes/_authenticated/gmn.tsx`, `src/components/gmn/PerfilGaveta.tsx`, `src/components/gmn/BriefingForm.tsx`, `src/components/gmn/GerarBriefingDialog.tsx`, `src/components/gmn/PostsLista.tsx`
- Modify: `src/routeTree.gen.ts` (regenerado)

**Interfaces:**
- Consumes: `src/lib/gmn.ts` (Task 5); `regras.ts` (`Briefing`, `DIAS_CURTOS`, `HORARIOS`, `alternarDia`, `mudarHora`, `mesmoHorario`, `normalizarAgenda`, `resumoAgenda`, `ROTULO_TEMA`, `comUtm`, `idPastaDrive`); `listarPasta`, `baixarOriginal` (`src/lib/driveLeitura.ts`); `FORMULARIOS`, `rotuloDoItem`, `formatarDataHora`, `extensao` (`src/lib/dadosInternos.ts`).
- Produces: rota `/gmn`; `PerfilGaveta({ perfil, clientes, aberto, onFechar, onMudou })`; `BriefingForm({ valor, onChange })`; `GerarBriefingDialog({ perfil, aberto, onFechar, onGerado })`; `PostsLista({ perfil })`.

- [ ] **Step 1: Formulário do briefing**

<!-- arquivo: src/components/gmn/BriefingForm.tsx -->
```tsx
// Campos do briefing do perfil. Listas são editadas uma por linha.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Briefing } from "../../../supabase/functions/gmn/regras.ts";

type CampoTexto = "contexto" | "objetivo" | "posicionamento" | "publico" | "tom_de_voz" | "cidade";
type CampoLista = "servicos" | "bairros" | "palavras_chave" | "diferenciais" | "termos_proibidos";

const TEXTOS: { campo: CampoTexto; rotulo: string; dica: string; linhas: number }[] = [
  { campo: "contexto", rotulo: "Contexto", dica: "Quem é o negócio ou o especialista e sua história.", linhas: 3 },
  { campo: "objetivo", rotulo: "Objetivo dos posts", dica: "Agendamentos, ligações, visitas, autoridade…", linhas: 2 },
  { campo: "posicionamento", rotulo: "Posicionamento", dica: "Como a marca quer ser vista.", linhas: 2 },
  { campo: "publico", rotulo: "Público-alvo", dica: "", linhas: 2 },
  { campo: "tom_de_voz", rotulo: "Tom de voz", dica: "Ex.: próximo e confiável, sem gírias.", linhas: 2 },
];

const LISTAS: { campo: CampoLista; rotulo: string; dica: string }[] = [
  { campo: "servicos", rotulo: "Serviços ou produtos em destaque", dica: "Um por linha." },
  { campo: "bairros", rotulo: "Bairros ou região atendida", dica: "Um por linha." },
  { campo: "palavras_chave", rotulo: "Palavras-chave de SEO local", dica: "Uma por linha, como o cliente buscaria." },
  { campo: "diferenciais", rotulo: "Diferenciais", dica: "Um por linha." },
  { campo: "termos_proibidos", rotulo: "Termos proibidos", dica: "O post que tiver algum destes não é publicado." },
];

export function BriefingForm({ valor, onChange }: { valor: Briefing; onChange: (b: Briefing) => void }) {
  return (
    <div className="space-y-4">
      {TEXTOS.map((t) => (
        <div key={t.campo} className="space-y-1.5">
          <Label htmlFor={`gmn-${t.campo}`}>{t.rotulo}</Label>
          <Textarea
            id={`gmn-${t.campo}`}
            rows={t.linhas}
            value={valor[t.campo]}
            onChange={(e) => onChange({ ...valor, [t.campo]: e.target.value })}
          />
          {t.dica && <p className="text-xs text-muted-foreground">{t.dica}</p>}
        </div>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="gmn-cidade">Cidade</Label>
        <Input id="gmn-cidade" value={valor.cidade} onChange={(e) => onChange({ ...valor, cidade: e.target.value })} />
      </div>
      {LISTAS.map((l) => (
        <div key={l.campo} className="space-y-1.5">
          <Label htmlFor={`gmn-${l.campo}`}>{l.rotulo}</Label>
          <Textarea
            id={`gmn-${l.campo}`}
            rows={4}
            value={valor[l.campo].join("\n")}
            onChange={(e) => onChange({ ...valor, [l.campo]: e.target.value.split("\n") })}
          />
          <p className="text-xs text-muted-foreground">{l.dica}</p>
        </div>
      ))}
    </div>
  );
}
```

(As listas guardam linhas vazias enquanto o usuário digita; `salvarBriefing` passa por `normalizarBriefing`, que remove as vazias.)

- [ ] **Step 2: Diálogo "Gerar com IA"**

<!-- arquivo: src/components/gmn/GerarBriefingDialog.tsx -->
```tsx
// "Gerar com IA": opcionalmente usa um briefing de Dados internos (.txt no Drive) e pede à função gmn um rascunho.
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { baixarOriginal, listarPasta } from "@/lib/driveLeitura";
import { FORMULARIOS, extensao, formatarDataHora, rotuloDoItem, type FormularioId } from "@/lib/dadosInternos";
import { gerarBriefingIa, traduzErroGmn, type PerfilGmn } from "@/lib/gmn";
import type { Briefing } from "../../../supabase/functions/gmn/regras.ts";

const NENHUM = "__nenhum__";
interface OpcaoBriefing { id: string; rotulo: string; data: number }

export function GerarBriefingDialog({ perfil, aberto, onFechar, onGerado }: {
  perfil: PerfilGmn; aberto: boolean; onFechar: () => void; onGerado: (b: Briefing) => void;
}) {
  const [opcoes, setOpcoes] = useState<OpcaoBriefing[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState(NENHUM);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (!aberto || opcoes) return;
    (async () => {
      try {
        const ids: FormularioId[] = ["negocios", "estrategia"];
        const listas = await Promise.all(ids.map(async (fid) => {
          const f = FORMULARIOS.find((x) => x.id === fid)!;
          const itens = await listarPasta(f.pastaId!);
          return itens.filter((i) => extensao(i.name) === "txt").map((i) => {
            const r = rotuloDoItem(i, fid);
            return { id: i.id, rotulo: `${f.pastaNome}: ${r.titulo} (${formatarDataHora(r.data)})`, data: r.data.getTime() };
          });
        }));
        setOpcoes(listas.flat().sort((a, b) => b.data - a.data));
      } catch (e) {
        setErroLista(traduzErroGmn(e));
        setOpcoes([]);
      }
    })();
  }, [aberto, opcoes]);

  async function gerar() {
    setGerando(true);
    try {
      const texto = escolhido === NENHUM ? null : await (await baixarOriginal(escolhido)).text();
      const b = await gerarBriefingIa(perfil.id, texto);
      onGerado(b);
      toast.success("Rascunho do briefing preenchido. Revise e salve.");
      onFechar();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !gerando && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar briefing com IA</DialogTitle>
          <DialogDescription>
            A IA usa os dados do perfil, o nicho do cliente ligado e, se você escolher, as respostas de um briefing de Dados
            internos. Nada é salvo até você clicar em Salvar briefing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Briefing de Dados internos (opcional)</Label>
          <Select value={escolhido} onValueChange={setEscolhido} disabled={!opcoes || gerando}>
            <SelectTrigger><SelectValue placeholder={opcoes ? "Nenhum" : "Carregando…"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NENHUM}>Nenhum</SelectItem>
              {(opcoes || []).map((o) => <SelectItem key={o.id} value={o.id}>{o.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>
          {erroLista && <p className="text-xs text-destructive">Não foi possível listar os briefings: {erroLista}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={gerando}>Cancelar</Button>
          <Button onClick={gerar} disabled={gerando}>
            {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {gerando ? "Gerando…" : "Gerar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Lista de posts e prévia**

<!-- arquivo: src/components/gmn/PostsLista.tsx -->
```tsx
// Posts do perfil (prévias nesta fase) e o botão "Gerar prévia".
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchPosts, gerarPrevia, traduzErroGmn, type PerfilGmn, type PostGmn } from "@/lib/gmn";
import { ROTULO_TEMA, type Tema } from "../../../supabase/functions/gmn/regras.ts";

const STATUS: Record<PostGmn["status"], string> = {
  agendado: "Agendado", gerando: "Gerando", gerado: "Prévia pronta", publicado: "Publicado", erro: "Erro", pulado: "Pulado",
};
const ORIGEM_IMAGEM: Record<string, string> = { drive: "Foto do Drive", google: "Foto do Google", ia: "Imagem de IA" };

export function PostsLista({ perfil }: { perfil: PerfilGmn }) {
  const [posts, setPosts] = useState<PostGmn[] | null>(null);
  const [gerando, setGerando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setPosts(await fetchPosts(perfil.id));
    } catch (e) {
      toast.error(traduzErroGmn(e));
      setPosts([]);
    }
  }, [perfil.id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function previa() {
    setGerando(true);
    try {
      const p = await gerarPrevia(perfil.id);
      if (p.status === "gerado") toast.success("Prévia pronta.");
      else toast.warning(`Prévia ${STATUS[p.status].toLowerCase()}: ${p.erro ?? ""}`);
      await carregar();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={previa} disabled={gerando || !perfil.briefing_salvo_em}>
          {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          {gerando ? "Gerando (até 1 min)…" : "Gerar prévia"}
        </Button>
        {!perfil.briefing_salvo_em && <span className="text-sm text-muted-foreground">Salve o briefing primeiro.</span>}
        <span className="text-xs text-muted-foreground">A prévia não é publicada no Google.</span>
      </div>
      {posts === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {posts?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum post ainda.</p>}
      {posts?.map((p) => (
        <Card key={p.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={p.status === "erro" || p.status === "pulado" ? "destructive" : "secondary"}>{STATUS[p.status]}</Badge>
              {p.tema && <span>{ROTULO_TEMA[p.tema as Tema] ?? p.tema}</span>}
              {p.imagem_origem && <span className="text-muted-foreground">· {ORIGEM_IMAGEM[p.imagem_origem]}</span>}
              <span className="text-muted-foreground">· {new Date(p.created_at).toLocaleString("pt-BR")}</span>
              {p.google_url && (
                <a href={p.google_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  Ver no Google <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {p.imagem_url && <img src={p.imagem_url} alt="Imagem do post" className="max-h-72 w-full rounded-md object-cover" />}
            {p.texto && <p className="whitespace-pre-wrap text-sm">{p.texto}</p>}
            {p.palavras_chave.length > 0 && (
              <p className="text-xs text-muted-foreground">Palavras-chave: {p.palavras_chave.join(", ")}</p>
            )}
            {p.erro && <p className="text-xs text-destructive">{p.erro}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Gaveta do perfil**

<!-- arquivo: src/components/gmn/PerfilGaveta.tsx -->
```tsx
// Gaveta do perfil: Briefing, Agenda e Posts.
import { useEffect, useState } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  excluirPerfil, salvarBriefing, salvarPerfil, traduzErroGmn, type ClienteOpcao, type CtaTipo, type PerfilGmn,
} from "@/lib/gmn";
import {
  DIAS_CURTOS, HORARIOS, alternarDia, comUtm, idPastaDrive, mesmoHorario, mudarHora, normalizarAgenda, type Briefing,
} from "../../../supabase/functions/gmn/regras.ts";
import { BriefingForm } from "./BriefingForm";
import { GerarBriefingDialog } from "./GerarBriefingDialog";
import { PostsLista } from "./PostsLista";

const SEM_CLIENTE = "__sem__";
const CTAS: { v: CtaTipo; rotulo: string }[] = [
  { v: "LEARN_MORE", rotulo: "Saiba mais (abre o link)" },
  { v: "BOOK", rotulo: "Agendar (abre o link)" },
  { v: "CALL", rotulo: "Ligar (usa o telefone do perfil)" },
];

export function PerfilGaveta({ perfil, clientes, aberto, onFechar, onMudou }: {
  perfil: PerfilGmn | null; clientes: ClienteOpcao[]; aberto: boolean; onFechar: () => void; onMudou: () => void;
}) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [dados, setDados] = useState<PerfilGmn | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [iaAberto, setIaAberto] = useState(false);
  const [excluir, setExcluir] = useState(false);

  useEffect(() => {
    setBriefing(perfil ? perfil.briefing : null);
    setDados(perfil);
  }, [perfil]);

  if (!perfil || !dados || !briefing) return null;

  async function gravarBriefing() {
    setSalvando(true);
    try {
      await salvarBriefing(perfil!.id, briefing!);
      toast.success("Briefing salvo.");
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setSalvando(false);
    }
  }

  async function gravarAgenda() {
    const d = dados!;
    if (d.cta_tipo !== "CALL" && d.cta_url && !comUtm(d.cta_url)) return toast.error("O link do botão não parece um endereço válido.");
    if (d.drive_pasta_url && !idPastaDrive(d.drive_pasta_url)) return toast.error("O link da pasta do Drive não foi reconhecido.");
    if (!d.agenda.length) return toast.error("Escolha pelo menos um dia da semana.");
    setSalvando(true);
    try {
      await salvarPerfil(d.id, {
        nome: d.nome.trim(), categoria: d.categoria || null, site: d.site || null, endereco: d.endereco || null,
        cliente_id: d.cliente_id, saude: d.saude, agenda: normalizarAgenda(d.agenda), cta_tipo: d.cta_tipo,
        cta_url: d.cta_url || null, drive_pasta_url: d.drive_pasta_url || null, usa_ia_imagem: d.usa_ia_imagem,
      });
      toast.success("Configurações salvas.");
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    try {
      await excluirPerfil(perfil!.id);
      toast.success("Perfil excluído.");
      setExcluir(false);
      onFechar();
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    }
  }

  const set = (patch: Partial<PerfilGmn>) => setDados({ ...dados, ...patch });

  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{perfil.nome}</SheetTitle>
          <SheetDescription>
            {perfil.location_name ? "Perfil sincronizado com o Google." : "Perfil criado à mão (ainda sem ligação com o Google)."}
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="briefing" className="mt-4">
          <TabsList>
            <TabsTrigger value="briefing">Briefing</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
          </TabsList>

          <TabsContent value="briefing" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setIaAberto(true)}><Sparkles className="mr-2 h-4 w-4" />Gerar com IA</Button>
              <Button onClick={gravarBriefing} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar briefing
              </Button>
            </div>
            {perfil.briefing_salvo_em && (
              <p className="text-xs text-muted-foreground">Salvo em {new Date(perfil.briefing_salvo_em).toLocaleString("pt-BR")}.</p>
            )}
            <BriefingForm valor={briefing} onChange={setBriefing} />
          </TabsContent>

          <TabsContent value="agenda" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gmn-nome">Nome</Label>
                <Input id="gmn-nome" value={dados.nome} onChange={(e) => set({ nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Cliente do sistema (opcional)</Label>
                <Select value={dados.cliente_id ?? SEM_CLIENTE} onValueChange={(v) => set({ cliente_id: v === SEM_CLIENTE ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_CLIENTE}>Sem cliente</SelectItem>
                    {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gmn-categoria">Categoria</Label>
                <Input id="gmn-categoria" value={dados.categoria ?? ""} onChange={(e) => set({ categoria: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gmn-site">Site</Label>
                <Input id="gmn-site" value={dados.site ?? ""} onChange={(e) => set({ site: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="gmn-endereco">Endereço</Label>
                <Input id="gmn-endereco" value={dados.endereco ?? ""} onChange={(e) => set({ endereco: e.target.value })} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={dados.saude} onCheckedChange={(v) => set({ saude: v === true })} />
              Perfil da área da saúde (aplica as regras do CFM/CFO)
            </label>

            <div className="space-y-2">
              <Label>Dias e horários dos posts</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Dias da semana">
                {DIAS_CURTOS.map((rotulo, d) => {
                  const ligado = dados.agenda.some((x) => x.dia === d);
                  return (
                    <Button key={d} type="button" size="sm" variant={ligado ? "default" : "outline"} aria-pressed={ligado}
                      onClick={() => set({ agenda: alternarDia(dados.agenda, d) })}>
                      {rotulo}
                    </Button>
                  );
                })}
              </div>
              {dados.agenda.map((item) => (
                <div key={item.dia} className="flex items-center gap-3">
                  <span className="w-10 text-sm font-medium">{DIAS_CURTOS[item.dia]}</span>
                  <Select value={item.hora} onValueChange={(h) => set({ agenda: mudarHora(dados.agenda, item.dia, h) })}>
                    <SelectTrigger className="w-28" aria-label={`Horário de ${DIAS_CURTOS[item.dia]}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(HORARIOS.includes(item.hora) ? HORARIOS : [item.hora, ...HORARIOS]).map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {new Set(dados.agenda.map((x) => x.hora)).size > 1 && (
                <Button type="button" size="sm" variant="outline" onClick={() => set({ agenda: mesmoHorario(dados.agenda, dados.agenda[0].hora) })}>
                  Usar {dados.agenda[0].hora} em todos
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {dados.agenda.length === 0
                  ? "Nenhum dia escolhido: ligue pelo menos um."
                  : `${dados.agenda.length} ${dados.agenda.length === 1 ? "post" : "posts"} por semana, no horário de Brasília.`}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Botão do post</Label>
                <Select value={dados.cta_tipo} onValueChange={(v) => set({ cta_tipo: v as CtaTipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CTAS.map((c) => <SelectItem key={c.v} value={c.v}>{c.rotulo}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {dados.cta_tipo !== "CALL" && (
                <div className="space-y-1.5">
                  <Label htmlFor="gmn-cta">Link do botão</Label>
                  <Input id="gmn-cta" placeholder="https://…" value={dados.cta_url ?? ""} onChange={(e) => set({ cta_url: e.target.value })} />
                  <p className="text-xs text-muted-foreground">A UTM do Google Meu Negócio é acrescentada ao publicar.</p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gmn-drive">Pasta do Drive com fotos</Label>
              <Input id="gmn-drive" placeholder="https://drive.google.com/drive/folders/…" value={dados.drive_pasta_url ?? ""}
                onChange={(e) => set({ drive_pasta_url: e.target.value })} />
              <p className="text-xs text-muted-foreground">
                Fotos JPG ou PNG de até 5 MB. A pasta precisa estar acessível para contato@andrelopes.digital.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={dados.usa_ia_imagem} onCheckedChange={(v) => set({ usa_ia_imagem: v })} />
              Gerar imagem com IA quando não houver foto
            </label>

            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button variant="outline" className="text-destructive" onClick={() => setExcluir(true)}>
                <Trash2 className="mr-2 h-4 w-4" />Excluir perfil
              </Button>
              <Button onClick={gravarAgenda} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar configurações
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="posts">
            <PostsLista perfil={perfil} />
          </TabsContent>
        </Tabs>

        <GerarBriefingDialog perfil={perfil} aberto={iaAberto} onFechar={() => setIaAberto(false)} onGerado={setBriefing} />
        <AlertDialog open={excluir} onOpenChange={setExcluir}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {perfil.nome}?</AlertDialogTitle>
              <AlertDialogDescription>O briefing e o histórico de posts deste perfil somem do sistema. Nada muda no Google.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmarExclusao}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 5: Página**

<!-- arquivo: src/routes/_authenticated/gmn.tsx -->
```tsx
// Aba Google Meu Negócio (Fase 1: perfis à mão, briefing e prévias; nada é publicado).
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  PUBLICACAO_LIBERADA, criarPerfil, fetchClientesOpcoes, fetchPerfis, salvarPerfil, traduzErroGmn,
  type ClienteOpcao, type PerfilGmn,
} from "@/lib/gmn";
import { PerfilGaveta } from "@/components/gmn/PerfilGaveta";
import { resumoAgenda } from "../../../supabase/functions/gmn/regras.ts";

export const Route = createFileRoute("/_authenticated/gmn")({ component: GmnPage });

type Filtro = "todos" | "ativos" | "desligados" | "saude" | "sem_briefing";
const FILTROS: { v: Filtro; rotulo: string }[] = [
  { v: "todos", rotulo: "Todos" }, { v: "ativos", rotulo: "Ativos" }, { v: "desligados", rotulo: "Desligados" },
  { v: "saude", rotulo: "Saúde" }, { v: "sem_briefing", rotulo: "Sem briefing" },
];
const SEM_CLIENTE = "__sem__";

function GmnPage() {
  const [perfis, setPerfis] = useState<PerfilGmn[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ nome: string; cliente_id: string | null } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([fetchPerfis(), fetchClientesOpcoes()]);
      setPerfis(p);
      setClientes(c);
      setErro(null);
    } catch (e) {
      setErro(traduzErroGmn(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => perfis.filter((p) =>
    filtro === "ativos" ? p.ativo : filtro === "desligados" ? !p.ativo : filtro === "saude" ? p.saude
      : filtro === "sem_briefing" ? !p.briefing_salvo_em : true), [perfis, filtro]);
  const nomeCliente = (id: string | null) => clientes.find((c) => c.id === id)?.nome ?? null;
  const aberto = perfis.find((p) => p.id === abertoId) ?? null;

  async function alternar(p: PerfilGmn, ativo: boolean) {
    if (ativo && !p.briefing_salvo_em) {
      toast.error("Salve o briefing antes de ligar o perfil.");
      setAbertoId(p.id);
      return;
    }
    try {
      await salvarPerfil(p.id, { ativo });
      await carregar();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    }
  }

  async function criar() {
    if (!novo?.nome.trim()) return toast.error("Informe o nome do perfil.");
    try {
      const p = await criarPerfil(novo.nome, novo.cliente_id);
      setNovo(null);
      await carregar();
      setAbertoId(p.id);
    } catch (e) {
      toast.error(traduzErroGmn(e));
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><MapPin className="h-6 w-6" />Google Meu Negócio</h1>
          <p className="text-sm text-muted-foreground">
            Posts automáticos nos perfis dos clientes.
            {!PUBLICACAO_LIBERADA && " Publicação liberada quando a API do Google for aprovada — por enquanto, só prévias."}
          </p>
        </div>
        <Button onClick={() => setNovo({ nome: "", cliente_id: null })}><Plus className="mr-2 h-4 w-4" />Novo perfil</Button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro">
        {FILTROS.map((f) => (
          <Button key={f.v} size="sm" variant={filtro === f.v ? "default" : "outline"} aria-pressed={filtro === f.v} onClick={() => setFiltro(f.v)}>
            {f.rotulo}
          </Button>
        ))}
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {carregando && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {!carregando && !erro && visiveis.length === 0 && <p className="text-sm text-muted-foreground">Nenhum perfil neste filtro.</p>}

      <div className="space-y-2">
        {visiveis.map((p) => (
          <Card key={p.id} className={cn("cursor-pointer transition-colors hover:bg-muted/50", p.sem_acesso && "opacity-60")} onClick={() => setAbertoId(p.id)}>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {nomeCliente(p.cliente_id) ?? "Sem cliente"} · {resumoAgenda(p.agenda)}
                  {p.briefing_salvo_em ? "" : " · sem briefing"}
                </p>
              </div>
              {p.saude && <Badge variant="outline">Saúde</Badge>}
              {p.sem_acesso && <Badge variant="destructive">Sem acesso</Badge>}
              <label className="flex items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
                <Switch checked={p.ativo} disabled={!PUBLICACAO_LIBERADA} onCheckedChange={(v) => alternar(p, v)} aria-label={`Posts de ${p.nome}`} />
                {p.ativo ? "Ligado" : "Desligado"}
              </label>
            </CardContent>
          </Card>
        ))}
      </div>

      <PerfilGaveta perfil={aberto} clientes={clientes} aberto={!!aberto} onFechar={() => setAbertoId(null)} onMudou={carregar} />

      <Dialog open={!!novo} onOpenChange={(v) => !v && setNovo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo perfil</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="gmn-novo-nome">Nome (como está no Google)</Label>
              <Input id="gmn-novo-nome" autoFocus value={novo?.nome ?? ""} onChange={(e) => novo && setNovo({ ...novo, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Cliente do sistema (opcional)</Label>
              <Select value={novo?.cliente_id ?? SEM_CLIENTE} onValueChange={(v) => novo && setNovo({ ...novo, cliente_id: v === SEM_CLIENTE ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CLIENTE}>Sem cliente</SelectItem>
                  {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(null)}>Cancelar</Button>
            <Button onClick={criar}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 6: Regenerar a árvore de rotas e checar**

Run: `npx vite build 2>&1 | tail -5` (regenera `src/routeTree.gen.ts`), depois `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "gmn" ; npm test`
Expected: build sem erro; nenhuma linha do `grep`; testes passando. Conferir `git diff --stat src/routeTree.gen.ts` (só a rota `/gmn` entra).

- [ ] **Step 7: Commit**

```bash
git add src/routes/_authenticated/gmn.tsx src/components/gmn src/routeTree.gen.ts
git commit -m "GMN: aba /gmn com perfis, briefing com IA e prévia de posts (sem publicar)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Teste de ponta a ponta com a Brazilian Car (dev server local)

**Files:** nenhum (só dados de teste no banco).

- [ ] **Step 1: Subir o dev server limpo**

Matar vites antigos (memória `dev-server-local`) e rodar `npm run dev`. Abrir `http://localhost:<porta>/gmn` no Chrome do usuário. Como o login Google (GIS) não funciona em localhost, as chamadas à função usam a chave do swipe já gravada no navegador; se faltar, pedir ao usuário para abrir o link de configuração da chave (Admin → Swipe file).

- [ ] **Step 2: Criar o perfil e o briefing**

- "Novo perfil" → nome `Brazilian Car`, cliente correspondente se existir em `clientes`.
- Agenda: categoria `Loja de carros usados`, endereço `SCIA Quadra 15 Conjunto 10 loja 03, Cidade do Automóvel, Brasília - DF`, botão Saiba mais com o site da loja (perguntar ao usuário) → Salvar configurações.
- Dias e horários (só cliques): conferir o padrão terça e quinta às 09:00; ligar sexta (entra às 09:00); mudar quinta para 14:30 (aparece "Usar 09:00 em todos"); clicar nele; desligar sexta; desligar todos e conferir que "Salvar configurações" recusa sem nenhum dia; voltar para terça e quinta e salvar. Na lista, a linha mostra "Ter 09:00 · Qui 09:00"; reabrir a gaveta mostra o salvo.
- Briefing → "Gerar com IA" (sem briefing de Dados internos, a menos que exista um da Brazilian Car). Conferir que o rascunho aparece e **incluir no Posicionamento**: "a melhor loja de Brasília para comprar e vender carros seminovos". Salvar briefing.

- [ ] **Step 3: Prévias**

- Sem pasta do Drive: "Gerar prévia" → esperar status "Prévia pronta" com **Imagem de IA** exibida (URL `pub-…r2.dev`), texto de 150–300 palavras sem telefone/link, tema "Serviço ou produto em destaque".
- Segunda prévia: tema diferente ("Dúvida frequente de clientes") e texto que não repete o primeiro.
- Com pasta do Drive: pedir ao usuário um link de pasta com fotos da loja (acessível pela contato@), salvar e gerar prévia → **Foto do Drive**; a seguinte usa outra foto.
- Checagem: acrescentar temporariamente um termo proibido que certamente aparecerá (ex.: "seminovos") → prévia termina **Pulado** com o motivo; remover o termo e salvar de novo.

- [ ] **Step 4: Mostrar ao usuário e registrar**

Mostrar os textos e imagens das prévias ao usuário e anotar os ajustes que ele pedir (tom, tamanho, estilo da imagem). Atualizar a memória `gbp-posts-automacao` com o estado da Fase 1 (o que está pronto, o que falta para a Fase 2). As prévias da Brazilian Car ficam no banco como histórico de teste (não publicadas; `origem='previa'`).

- [ ] **Step 5: Push**

Pedir ao usuário `! git push origin main` para guardar o trabalho no GitHub. **Não** clicar em Publicar no Lovable (a aba só vai ao ar na Fase 2).
