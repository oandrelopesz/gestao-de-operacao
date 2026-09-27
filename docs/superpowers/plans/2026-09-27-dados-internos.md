# Dados internos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba "Dados internos" (somente leitura) que mostra as respostas dos 4 formulários públicos direto do Google Drive, com visualização, downloads, .zip de pastas e contador de novidades avisado pelos próprios formulários.

**Architecture:** O Drive é a fonte dos conteúdos, lido pelo navegador com o token da edge function `google-token` (escopo novo `drive.readonly`). Os formulários chamam a RPC `registrar_envio_formulario` no banco do sistema (Contrato e Catálogo pelo Apps Script; Estratégia e Negócios por gatilho `pg_net` no banco deles); a tabela `formularios_envios` chega ao navegador pelo Realtime e alimenta o contador do menu, os selos "Novo" e a recarga da lista aberta.

**Tech Stack:** TanStack Start/Router + React 19 + shadcn/ui (este repo), Supabase (Lovable Cloud) com Realtime, Google Drive API v3 via `fetch`, `fflate` (zip), `node --test` (libs puras deste repo), Apps Script + esbuild + vitest + clasp (repos dos formulários), `pg_net` (bancos dos briefings).

**Spec:** `docs/superpowers/specs/2026-09-27-dados-internos-design.md`

## Global Constraints

- Somente leitura: a aba nunca envia, renomeia, move, exclui nem cria nada no Drive.
- Nada consulta o Drive periodicamente; o Drive só é lido ao abrir uma sub-aba/pasta/arquivo, ao clicar "Atualizar" e quando chega um aviso do formulário da sub-aba aberta.
- O aviso **nunca** derruba um envio de formulário: toda chamada ao sistema fica em `try/catch` (Apps Script) ou é assíncrona com `EXCEPTION WHEN OTHERS` (pg_net).
- Pastas `_rascunhos` e `_teste` nunca aparecem na aba nem entram no .zip.
- "Original" = `files.get?alt=media` (mesmos bytes, mesmo nome). Doc → Word (.docx) ou PDF; Planilha → Excel (.xlsx) ou CSV.
- "Abrir no Google" sempre com `?authuser=contato@andrelopes.digital`.
- Sub-abas, na ordem: Dados para contrato · Briefing – Negócios · Briefing – Estratégia · Catálogos – E-Commerce. Botões de copiar link, na ordem: Contrato · Estratégia · Negócios · Catálogo.
- Menu: item "Dados internos" no grupo **Comercial**, logo depois de CRM, rota `/dados-internos`.
- Libs puras deste repo não importam nada (nem umas das outras) e são testadas com `npm test` (`node --test src/lib/*.test.ts`).
- Não escrever `\u` + dígitos em código novo (as ferramentas de edição transformam em caractere literal): usar `\p{M}`, `\p{Cc}` com flag `u`, `charCodeAt` ou o próprio caractere.
- Arquivos do repo usam CRLF; migrations deste repo são aplicadas à mão pelo SQL editor do Lovable Cloud (ver memória `supabase-migrations-manual`).
- Chave pública do banco do sistema (usada pelos formulários): valor de `VITE_SUPABASE_PUBLISHABLE_KEY` em `gestao-de-operacao/.env`. URL da RPC: `https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/rpc/registrar_envio_formulario`.
- Apps Script com escopo novo: `gas:push` → usuário roda `testarAviso()` no editor e autoriza → só então `clasp update-deployment`. Nunca inverter.

## Mapa de arquivos

**Este repo (`gestao-de-operacao`)**

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260927120000_formularios_envios.sql` (novo) | tabela de avisos, RPC, política aberta, Realtime |
| `src/lib/dadosInternos.ts` (novo) + `.test.ts` | formulários/pastas, ordenação, nome e data do briefing, selo "Novo", aba inicial, modo de visualização, formatos de download, nomes e caminhos do .zip, links do Google |
| `src/lib/briefingTexto.ts` (novo) + `.test.ts` | `.txt` do briefing → perguntas e respostas |
| `src/lib/csv.ts` (novo) + `.test.ts` | CSV exportado pelo Google → linhas |
| `src/lib/googleDrive.ts` (alterar) | escopo `drive.readonly`; exportar `driveFetch` |
| `src/lib/driveLeitura.ts` (novo) | listar pasta, item, trilha, baixar original, exportar, salvar no computador |
| `src/lib/driveZip.ts` (novo) | .zip de uma pasta (fflate, sem recompressão) |
| `src/lib/formulariosEnvios.ts` (novo) | avisos não vistos (Realtime), marcar vistos |
| `src/lib/nav.tsx`, `src/components/NavLateral.tsx`, `src/routes/_authenticated.tsx` (alterar) | item do menu e contador |
| `src/routes/_authenticated/dados-internos.tsx` (novo) | página: busca/URL, sub-abas, .zip com progresso |
| `src/components/dadosInternos/BotoesLinks.tsx` (novo) | 4 botões de copiar link |
| `src/components/dadosInternos/AcessoGoogle.tsx` (novo) | hook `useAcessoDrive` + cartões "entrar"/"conectar leitura do Drive" |
| `src/components/dadosInternos/NavegadorPasta.tsx` (novo) | trilha, busca, lista com selo "Novo", ações por item |
| `src/components/dadosInternos/Visualizador.tsx` (novo) | tela cheia: briefing formatado, texto, imagem, PDF, Doc, planilha |
| `src/components/dadosInternos/GaleriaFotos.tsx` (novo) | fotos agrupadas por produto, miniaturas sob demanda, ampliar com setas |
| `src/routeTree.gen.ts`, `tools/auditoria-mobile/rotas.mjs`, `package.json` (alterar) | rota nova, auditoria mobile, dependência `fflate` |

**Repo `Sistemas/Contratos`** — `server/handler.ts`, `server/handler.test.ts`, `server/gas.test.ts`, `apps-script/Code.js`, `apps-script/appsscript.json`.

**Repo `Sistemas/Briefing E-Commerce`** — `server/handler.ts`, `server/handler.test.ts`, `server/gas.test.ts`, `apps-script/Code.js`, `apps-script/appsscript.json`.

**Repos dos briefings** — `Sistemas/Briefing Negócios/briefingdenegocios/supabase/migrations/20260927130000_avisar_sistema_gestao.sql` e `Sistemas/Briefing Estratégia/briefingestrategia/supabase/migrations/20260927130000_avisar_sistema_gestao.sql`.

---

## Parte 1 — Banco do sistema

### Task 1: Tabela `formularios_envios` e RPC

**Files:**
- Create: `supabase/migrations/20260927120000_formularios_envios.sql`

**Interfaces:**
- Produces: tabela `public.formularios_envios(id uuid, formulario text, chave text unique, titulo text, drive_id text, recebido_em timestamptz, visto_em timestamptz)`; RPC `registrar_envio_formulario(p_formulario text, p_chave text, p_titulo text, p_drive_id text default null) returns void` (POST `/rest/v1/rpc/registrar_envio_formulario`, resposta 204).

- [ ] **Step 1: Escrever a migration**

```sql
-- Aba Dados internos: avisos de envio dos formulários públicos (contrato, briefings, catálogo).
-- Os formulários chamam a RPC registrar_envio_formulario; o app lê a tabela pelo Realtime.
CREATE TABLE IF NOT EXISTS public.formularios_envios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario  text NOT NULL CHECK (formulario IN ('contrato', 'estrategia', 'negocios', 'catalogo')),
  chave       text NOT NULL UNIQUE,
  titulo      text NOT NULL,
  drive_id    text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  visto_em    timestamptz
);
CREATE INDEX IF NOT EXISTS formularios_envios_nao_vistos ON public.formularios_envios (formulario) WHERE visto_em IS NULL;

ALTER TABLE public.formularios_envios ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'formularios_envios' AND policyname = 'formularios_envios_all') THEN
    CREATE POLICY formularios_envios_all ON public.formularios_envios FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Único ponto de entrada dos formulários. Reenvio (mesma chave) não duplica.
CREATE OR REPLACE FUNCTION public.registrar_envio_formulario(
  p_formulario text, p_chave text, p_titulo text, p_drive_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_formulario IS NULL OR p_formulario NOT IN ('contrato', 'estrategia', 'negocios', 'catalogo') THEN
    RAISE EXCEPTION 'formulário desconhecido: %', p_formulario;
  END IF;
  IF coalesce(btrim(p_chave), '') = '' THEN
    RAISE EXCEPTION 'chave vazia';
  END IF;
  INSERT INTO public.formularios_envios (formulario, chave, titulo, drive_id)
  VALUES (
    p_formulario,
    left(btrim(p_chave), 200),
    left(coalesce(nullif(btrim(p_titulo), ''), 'Sem nome'), 200),
    nullif(btrim(p_drive_id), '')
  )
  ON CONFLICT (chave) DO NOTHING;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.registrar_envio_formulario(text, text, text, text) TO anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'formularios_envios') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.formularios_envios;
  END IF;
END $$;
```

- [ ] **Step 2: Aplicar no Lovable Cloud**

Abrir `https://lovable.dev/projects/b894ed2e-2f0d-4ef8-9bd0-7cb1ffbcdf51?view=more&subview=cloud&section=sql`, colar o SQL (método da memória `supabase-migrations-manual`: dispatch no EditorView, clique no fim da 1ª linha + End + espaço, Run por `ref`, "Run anyway" se aparecer). Esperado: "Query succeeded".

- [ ] **Step 3: Conferir pela API pública (chamar duas vezes: só uma linha)**

```bash
cd "C:/Users/Andre/Sistemas/Gestão de Operação/gestao-de-operacao"
KEY=$(grep VITE_SUPABASE_PUBLISHABLE_KEY .env | cut -d'"' -f2); URL=$(grep VITE_SUPABASE_URL .env | cut -d'"' -f2)
for i in 1 2; do curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL/rest/v1/rpc/registrar_envio_formulario" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"p_formulario":"contrato","p_chave":"contrato:teste-plano","p_titulo":"[TESTE] Plano"}'; done
curl -s "$URL/rest/v1/formularios_envios?chave=eq.contrato:teste-plano&select=formulario,titulo,drive_id,visto_em" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL/rest/v1/rpc/registrar_envio_formulario" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"p_formulario":"outro","p_chave":"x","p_titulo":"x"}'
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$URL/rest/v1/formularios_envios?chave=eq.contrato:teste-plano" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Esperado: `204`, `204`; `[{"formulario":"contrato","titulo":"[TESTE] Plano","drive_id":null,"visto_em":null}]` (uma linha só); `400` para o formulário desconhecido; `204` no DELETE.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260927120000_formularios_envios.sql
git commit -m "Dados internos: tabela de avisos dos formulários e RPC registrar_envio_formulario"
```

---

## Parte 2 — A aba no sistema

### Task 2: Regras puras da aba (`dadosInternos.ts`)

**Files:**
- Create: `src/lib/dadosInternos.ts`
- Test: `src/lib/dadosInternos.test.ts`

**Interfaces:**
- Produces (todos exportados de `src/lib/dadosInternos.ts`):
  - `type FormularioId = "contrato" | "negocios" | "estrategia" | "catalogo"`
  - `interface Formulario { id; aba; botao; link; pastaId; pastaNome }`, `FORMULARIOS: Formulario[]`, `ORDEM_BOTOES: FormularioId[]`, `formularioPorId(id): Formulario`, `ehFormularioId(v): v is FormularioId`
  - `MIME_PASTA`, `MIME_DOC`, `MIME_PLANILHA`, `PASTAS_OCULTAS`
  - `interface ItemDrive { id; name; mimeType; createdTime; modifiedTime; size?; parents? }`
  - `interface AvisoFormulario { id; formulario: FormularioId; chave; titulo; drive_id: string | null; recebido_em; visto_em: string | null }`
  - `ehPasta(i)`, `visivel(i)`, `extensao(nome)`, `ehImagem(i)`, `ordenarItens(itens)`
  - `lerNomeBriefing(nome): { titulo: string; data: Date | null }`, `formatarDataHora(d): string`, `rotuloDoItem(i, formulario): { titulo: string; data: Date }`
  - `normalizarNome(s)`, `novosNaLista(itens, avisos): Map<string, string[]>`, `abaInicial(naoVistos, ultima): FormularioId`, `contarPorFormulario(avisos): Record<FormularioId, number>`
  - `type ModoVer = "briefing" | "texto" | "imagem" | "pdf" | "doc" | "planilha" | "nenhum"`, `modoDoItem(i, formulario): ModoVer`
  - `interface FormatoDownload { rotulo; exportMime: string | null; extensao: string | null }`, `formatosDeDownload(mimeType): FormatoDownload[]`, `nomeSeguro(nome)`, `nomeDoDownload(nome, formato)`
  - `linkNoGoogle(i): string`, `idDeLinkDoGoogle(url): string | null`
  - `caminhoUnico(caminho, usados: Set<string>): string`, `entradaDoZip(dir, item, usados): { caminho; formato } | null`, `nomeDoProduto(nomeArquivo): string`

- [ ] **Step 1: Escrever o teste**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  FORMULARIOS, ORDEM_BOTOES, abaInicial, caminhoUnico, contarPorFormulario, ehFormularioId, entradaDoZip,
  formatarDataHora, formatosDeDownload, idDeLinkDoGoogle, lerNomeBriefing, linkNoGoogle, modoDoItem, nomeDoDownload,
  nomeDoProduto, nomeSeguro, normalizarNome, novosNaLista, ordenarItens, rotuloDoItem, visivel,
  MIME_DOC, MIME_PASTA, MIME_PLANILHA, type AvisoFormulario, type ItemDrive,
} from "./dadosInternos.ts";

const item = (p: Partial<ItemDrive> & { id: string; name: string }): ItemDrive => ({
  mimeType: "text/plain", createdTime: "2026-09-27T12:00:00Z", modifiedTime: "2026-09-27T12:00:00Z", ...p,
});
const aviso = (p: Partial<AvisoFormulario> & { id: string }): AvisoFormulario => ({
  formulario: "negocios", chave: `negocios:${p.id}`, titulo: "", drive_id: null, recebido_em: "2026-09-27T12:00:00Z", visto_em: null, ...p,
});

test("formulários: ordem das sub-abas, dos botões e ids", () => {
  assert.deepEqual(FORMULARIOS.map((f) => f.aba), ["Dados para contrato", "Briefing – Negócios", "Briefing – Estratégia", "Catálogos – E-Commerce"]);
  assert.deepEqual(ORDEM_BOTOES, ["contrato", "estrategia", "negocios", "catalogo"]);
  assert.equal(FORMULARIOS.find((f) => f.id === "catalogo")?.pastaId, "1oLF5CdjoFhHotF9JYbykqiumUUy82fKm");
  assert.equal(ehFormularioId("negocios"), true);
  assert.equal(ehFormularioId("outro"), false);
});

test("pastas de controle do catálogo ficam escondidas", () => {
  assert.equal(visivel({ name: "_rascunhos", mimeType: MIME_PASTA }), false);
  assert.equal(visivel({ name: "_teste", mimeType: MIME_PASTA }), false);
  assert.equal(visivel({ name: "_teste", mimeType: "text/plain" }), true);
  assert.equal(visivel({ name: "Loja - Ana", mimeType: MIME_PASTA }), true);
});

test("ordem: planilhas, pastas (modificação mais recente) e arquivos (mais novo primeiro)", () => {
  const r = ordenarItens([
    item({ id: "a1", name: "velho.txt", createdTime: "2026-07-01T00:00:00Z" }),
    item({ id: "p1", name: "Loja A", mimeType: MIME_PASTA, modifiedTime: "2026-08-01T00:00:00Z" }),
    item({ id: "s1", name: "Respostas", mimeType: MIME_PLANILHA }),
    item({ id: "a2", name: "novo.txt", createdTime: "2026-09-01T00:00:00Z" }),
    item({ id: "p2", name: "Loja B", mimeType: MIME_PASTA, modifiedTime: "2026-09-10T00:00:00Z" }),
  ]);
  assert.deepEqual(r.map((i) => i.id), ["s1", "p2", "p1", "a2", "a1"]);
});

test("nome do briefing: título e horário de Brasília; fora do padrão usa o nome inteiro", () => {
  const b = lerNomeBriefing("JAO BOEIRA - 2026-08-25 15-26-20.txt");
  assert.equal(b.titulo, "JAO BOEIRA");
  assert.equal(b.data?.toISOString(), "2026-08-25T18:26:20.000Z");
  assert.equal(formatarDataHora(b.data!), "25/08/2026 15:26");
  const nea = lerNomeBriefing("NEA - Cardio - 2026-07-19 17-22-47.txt");
  assert.equal(nea.titulo, "NEA - Cardio");
  assert.deepEqual(lerNomeBriefing("Instituto Hoeckele (1).txt"), { titulo: "Instituto Hoeckele (1)", data: null });
});

test("rótulo do item: briefing usa o nome do arquivo; outros, nome e data do Drive", () => {
  const txt = item({ id: "t", name: "SEDALLE - 2026-07-06 20-02-43.txt" });
  assert.equal(rotuloDoItem(txt, "negocios").titulo, "SEDALLE");
  assert.equal(formatarDataHora(rotuloDoItem(txt, "negocios").data), "06/07/2026 20:02");
  const doc = item({ id: "d", name: "2026-09-27 — Clínica — Maria", mimeType: MIME_DOC, createdTime: "2026-09-27T15:00:00Z" });
  assert.deepEqual(rotuloDoItem(doc, "contrato"), { titulo: "2026-09-27 — Clínica — Maria", data: new Date("2026-09-27T15:00:00Z") });
});

test("normalizarNome ignora acento, caixa e símbolos", () => {
  assert.equal(normalizarNome("  Clínica Garoñe / Ltda. "), "clinica garone ltda");
});

test("selo Novo: contrato e catálogo pelo id do Drive", () => {
  const itens = [item({ id: "doc1", name: "x", mimeType: MIME_DOC }), item({ id: "doc2", name: "y", mimeType: MIME_DOC })];
  const r = novosNaLista(itens, [
    aviso({ id: "a1", formulario: "contrato", drive_id: "doc2" }),
    aviso({ id: "a2", formulario: "contrato", drive_id: "fora-da-lista" }),
    aviso({ id: "a3", formulario: "contrato", drive_id: "doc1", visto_em: "2026-09-27T13:00:00Z" }),
  ]);
  assert.deepEqual([...r.entries()], [["doc2", ["a1"]]]);
});

test("selo Novo: briefing pelo nome (acento/símbolo) dentro da janela; senão o mais recente da janela", () => {
  const itens = [
    item({ id: "t1", name: "Clínica Garone - 2026-09-27 08-58-00.txt", createdTime: "2026-09-27T11:58:00Z" }),
    item({ id: "t2", name: "Outra - 2026-09-27 08-59-00.txt", createdTime: "2026-09-27T11:59:00Z" }),
    item({ id: "t3", name: "Antiga - 2026-07-01 10-00-00.txt", createdTime: "2026-07-01T13:00:00Z" }),
  ];
  assert.deepEqual([...novosNaLista(itens, [aviso({ id: "a1", titulo: "Clinica Garone" })])], [["t1", ["a1"]]]);
  assert.deepEqual([...novosNaLista(itens, [aviso({ id: "a2", titulo: "Nome que mudou" })])], [["t2", ["a2"]]]);
  assert.deepEqual([...novosNaLista(itens, [aviso({ id: "a3", titulo: "X", recebido_em: "2026-09-20T12:00:00Z" })])], []);
  // 2 min depois do aviso ainda vale; 16 min antes, não
  assert.deepEqual([...novosNaLista([item({ id: "t4", name: "A - 2026-09-27 09-01-00.txt", createdTime: "2026-09-27T12:01:30Z" })], [aviso({ id: "a4", titulo: "A" })])], [["t4", ["a4"]]]);
  assert.deepEqual([...novosNaLista([item({ id: "t5", name: "A - 2026-09-27 08-44-00.txt", createdTime: "2026-09-27T11:44:00Z" })], [aviso({ id: "a5", titulo: "A" })])], []);
});

test("aba inicial: primeira com novidade (ordem das sub-abas), senão a última usada, senão a primeira", () => {
  assert.equal(abaInicial([aviso({ id: "1", formulario: "catalogo" }), aviso({ id: "2", formulario: "negocios" })], "contrato"), "negocios");
  assert.equal(abaInicial([], "estrategia"), "estrategia");
  assert.equal(abaInicial([], null), "contrato");
  assert.deepEqual(contarPorFormulario([aviso({ id: "1" }), aviso({ id: "2" }), aviso({ id: "3", formulario: "catalogo" })]), { contrato: 0, negocios: 2, estrategia: 0, catalogo: 1 });
});

test("modo de visualização", () => {
  assert.equal(modoDoItem({ name: "A - 2026-09-27 08-58-00.txt", mimeType: "text/plain" }, "estrategia"), "briefing");
  assert.equal(modoDoItem({ name: "notas.txt", mimeType: "text/plain" }, "catalogo"), "texto");
  assert.equal(modoDoItem({ name: "grande.txt", mimeType: "text/plain", size: String(3 * 1024 * 1024) }, "negocios"), "nenhum");
  assert.equal(modoDoItem({ name: "Contrato", mimeType: MIME_DOC }, "contrato"), "doc");
  assert.equal(modoDoItem({ name: "Catálogo - Loja", mimeType: MIME_PLANILHA }, "catalogo"), "planilha");
  assert.equal(modoDoItem({ name: "Caneca.png", mimeType: "image/png" }, "catalogo"), "imagem");
  assert.equal(modoDoItem({ name: "rg.pdf", mimeType: "application/pdf" }, "contrato"), "pdf");
  assert.equal(modoDoItem({ name: "proposta.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, "contrato"), "nenhum");
});

test("formatos de download e nomes", () => {
  assert.deepEqual(formatosDeDownload("image/jpeg").map((f) => f.rotulo), ["Original"]);
  assert.deepEqual(formatosDeDownload(MIME_DOC).map((f) => f.extensao), ["docx", "pdf"]);
  assert.deepEqual(formatosDeDownload(MIME_PLANILHA).map((f) => f.extensao), ["xlsx", "csv"]);
  assert.deepEqual(formatosDeDownload("application/vnd.google-apps.form"), []);
  assert.equal(nomeDoDownload("2026-09-27 — Clínica / Filial — Maria", formatosDeDownload(MIME_DOC)[0]), "2026-09-27 — Clínica - Filial — Maria.docx");
  assert.equal(nomeDoDownload("Caneca.png", formatosDeDownload("image/png")[0]), "Caneca.png");
  assert.equal(nomeSeguro('a:b*c?"d<e>f|g.'), "a-b-c--d-e-f-g");
  assert.equal(nomeSeguro("   "), "sem nome");
});

test("links do Google na conta contato@ e id a partir de link", () => {
  assert.equal(linkNoGoogle({ id: "abc", mimeType: MIME_PASTA }), "https://drive.google.com/drive/folders/abc?authuser=contato%40andrelopes.digital");
  assert.equal(linkNoGoogle({ id: "abc", mimeType: MIME_DOC }), "https://docs.google.com/document/d/abc/edit?authuser=contato%40andrelopes.digital");
  assert.equal(linkNoGoogle({ id: "abc", mimeType: MIME_PLANILHA }), "https://docs.google.com/spreadsheets/d/abc/edit?authuser=contato%40andrelopes.digital");
  assert.equal(linkNoGoogle({ id: "abc", mimeType: "image/png" }), "https://drive.google.com/file/d/abc/view?authuser=contato%40andrelopes.digital");
  assert.equal(idDeLinkDoGoogle("https://docs.google.com/document/d/1AbCdEfGhIjK_lm-no/edit"), "1AbCdEfGhIjK_lm-no");
  assert.equal(idDeLinkDoGoogle("https://exemplo.com/document/d/1AbCdEfGhIjK/edit"), null);
});

test("caminhos do .zip: pastas, repetidos, Doc/Planilha convertidos e tipos sem conversão fora", () => {
  const usados = new Set<string>();
  assert.equal(caminhoUnico("Loja/Fotos/a.jpg", usados), "Loja/Fotos/a.jpg");
  assert.equal(caminhoUnico("Loja/Fotos/A.jpg", usados), "Loja/Fotos/A (2).jpg");
  assert.equal(caminhoUnico("Loja/Fotos/a.jpg", usados), "Loja/Fotos/a (3).jpg");
  assert.deepEqual(entradaDoZip("Loja/", { name: "Catálogo - Loja", mimeType: MIME_PLANILHA }, usados)?.caminho, "Loja/Catálogo - Loja.xlsx");
  assert.equal(entradaDoZip("Loja/", { name: "Formulário", mimeType: "application/vnd.google-apps.form" }, usados), null);
  assert.equal(nomeDoProduto("Camiseta - 01.jpg"), "Camiseta");
  assert.equal(nomeDoProduto("Caneca.png"), "Caneca");
  assert.equal(nomeDoProduto("Kit - Verão - 12.webp"), "Kit - Verão");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module ... dadosInternos.ts`.

- [ ] **Step 3: Implementar**

```ts
// Aba "Dados internos": os 4 formulários públicos, as pastas deles no Drive e as regras puras da aba
// (nome e data do briefing, selo "Novo", modo de visualização, formatos de download e caminhos do .zip).
// Sem dependências: roda no navegador e no `node --test`.

export type FormularioId = "contrato" | "negocios" | "estrategia" | "catalogo";

export interface Formulario {
  id: FormularioId;
  /** Rótulo da sub-aba */
  aba: string;
  /** Rótulo do botão que copia o link */
  botao: string;
  link: string;
  /** Pasta do Drive onde o formulário grava (raiz da sub-aba) */
  pastaId: string;
  /** Nome da raiz na trilha */
  pastaNome: string;
}

/** Na ordem das sub-abas. */
export const FORMULARIOS: Formulario[] = [
  { id: "contrato", aba: "Dados para contrato", botao: "Contrato", link: "https://contrato.andrelopes.digital/", pastaId: "1YmeAImZbMPZn-ulPNdmPBovEI5spME9w", pastaNome: "Dados de contrato" },
  { id: "negocios", aba: "Briefing – Negócios", botao: "Negócios", link: "https://negocios.andrelopes.digital/", pastaId: "1DhKMgqex14a-RuMof3Jht5Jx7nEQDYuP", pastaNome: "Negócios" },
  { id: "estrategia", aba: "Briefing – Estratégia", botao: "Estratégia", link: "https://estrategia.andrelopes.digital/", pastaId: "1gH_-_h9Al1jSiO2zzPSh9gbwhkpR6ZIZ", pastaNome: "Estratégia" },
  { id: "catalogo", aba: "Catálogos – E-Commerce", botao: "Catálogo", link: "https://catalogo.andrelopes.digital/", pastaId: "1oLF5CdjoFhHotF9JYbykqiumUUy82fKm", pastaNome: "E-Commerce" },
];

/** Ordem dos botões de copiar link no topo da aba. */
export const ORDEM_BOTOES: FormularioId[] = ["contrato", "estrategia", "negocios", "catalogo"];

export function formularioPorId(id: FormularioId): Formulario {
  return FORMULARIOS.find((f) => f.id === id) ?? FORMULARIOS[0];
}

export function ehFormularioId(v: unknown): v is FormularioId {
  return typeof v === "string" && FORMULARIOS.some((f) => f.id === v);
}

export const MIME_PASTA = "application/vnd.google-apps.folder";
export const MIME_DOC = "application/vnd.google-apps.document";
export const MIME_PLANILHA = "application/vnd.google-apps.spreadsheet";
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Pastas de controle do formulário do Catálogo: nunca aparecem na aba nem entram no .zip. */
export const PASTAS_OCULTAS = ["_rascunhos", "_teste"];

export interface ItemDrive {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
  parents?: string[];
}

export interface AvisoFormulario {
  id: string;
  formulario: FormularioId;
  chave: string;
  titulo: string;
  drive_id: string | null;
  recebido_em: string;
  visto_em: string | null;
}

export const ehPasta = (i: Pick<ItemDrive, "mimeType">): boolean => i.mimeType === MIME_PASTA;

export function visivel(i: Pick<ItemDrive, "name" | "mimeType">): boolean {
  return !(ehPasta(i) && PASTAS_OCULTAS.includes(i.name));
}

export function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

const EXT_IMAGEM = ["jpg", "jpeg", "png", "webp", "gif"];
export function ehImagem(i: Pick<ItemDrive, "name" | "mimeType">): boolean {
  return /^image\/(jpeg|png|webp|gif)$/.test(i.mimeType) || EXT_IMAGEM.includes(extensao(i.name));
}

/**
 * Planilhas primeiro (a "Respostas — Dados de contrato" fica fixa no topo), depois pastas (modificação
 * mais recente primeiro: reenvio do catálogo sobe a loja) e por fim arquivos (mais novo primeiro).
 */
export function ordenarItens(itens: ItemDrive[]): ItemDrive[] {
  const grupo = (i: ItemDrive) => (i.mimeType === MIME_PLANILHA ? 0 : ehPasta(i) ? 1 : 2);
  return [...itens].sort((a, b) => {
    const g = grupo(a) - grupo(b);
    if (g) return g;
    const campo = grupo(a) === 1 ? "modifiedTime" : "createdTime";
    return Date.parse(b[campo]) - Date.parse(a[campo]);
  });
}

// ------------------------------------------------------------ nome e data dos briefings

const RE_BRIEFING = /^(.*) - (\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})\.txt$/i;

/** "JAO BOEIRA - 2026-08-25 15-26-20.txt" → título e data (o nome vem no horário de Brasília, UTC−3). */
export function lerNomeBriefing(nome: string): { titulo: string; data: Date | null } {
  const m = RE_BRIEFING.exec(nome.trim());
  if (!m) return { titulo: nome.trim().replace(/\.txt$/i, ""), data: null };
  const [, titulo, a, me, d, h, mi, s] = m;
  return { titulo: titulo.trim(), data: new Date(Date.UTC(+a, +me - 1, +d, +h + 3, +mi, +s)) };
}

const FORMATO_BR = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** "25/08/2026 15:26", sempre no horário de Brasília. */
export function formatarDataHora(d: Date): string {
  const p = Object.fromEntries(FORMATO_BR.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

const ehBriefing = (f: FormularioId) => f === "negocios" || f === "estrategia";

/** Título e data que a lista mostra para um item. */
export function rotuloDoItem(i: ItemDrive, formulario: FormularioId): { titulo: string; data: Date } {
  if (ehBriefing(formulario) && !ehPasta(i) && extensao(i.name) === "txt") {
    const b = lerNomeBriefing(i.name);
    return { titulo: b.titulo, data: b.data ?? new Date(i.createdTime) };
  }
  return { titulo: i.name, data: new Date(ehPasta(i) ? i.modifiedTime : i.createdTime) };
}

// ------------------------------------------------------------ selo "Novo" e contador

/** Sem acento, minúsculo, só letras e números separados por um espaço. */
export function normalizarNome(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const JANELA_ANTES_MS = 15 * 60_000;
const JANELA_DEPOIS_MS = 2 * 60_000;

/**
 * Itens da lista que ganham o selo "Novo": id do item → ids dos avisos não vistos que apontam para ele.
 * Contrato e catálogo apontam pelo id no Drive. Briefings (sem id) pelo nome do .txt criado entre 15 min
 * antes e 2 min depois do aviso; sem nome igual, o .txt mais recente dessa janela.
 */
export function novosNaLista(itens: ItemDrive[], avisos: AvisoFormulario[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  const marcar = (itemId: string, avisoId: string) => mapa.set(itemId, [...(mapa.get(itemId) ?? []), avisoId]);
  for (const a of avisos) {
    if (a.visto_em) continue;
    if (a.drive_id) {
      if (itens.some((i) => i.id === a.drive_id)) marcar(a.drive_id, a.id);
      continue;
    }
    const t = Date.parse(a.recebido_em);
    const naJanela = itens.filter((i) => {
      if (ehPasta(i)) return false;
      const c = Date.parse(i.createdTime);
      return c >= t - JANELA_ANTES_MS && c <= t + JANELA_DEPOIS_MS;
    });
    const alvo = normalizarNome(a.titulo);
    const peloNome = naJanela.filter((i) => normalizarNome(lerNomeBriefing(i.name).titulo) === alvo);
    const candidatos = peloNome.length ? peloNome : naJanela;
    const escolhido = candidatos.reduce<ItemDrive | null>(
      (m, i) => (!m || Date.parse(i.createdTime) > Date.parse(m.createdTime) ? i : m),
      null,
    );
    if (escolhido) marcar(escolhido.id, a.id);
  }
  return mapa;
}

/** Sub-aba que abre quando o endereço não diz qual: a primeira com novidade; senão a última usada. */
export function abaInicial(naoVistos: AvisoFormulario[], ultima: FormularioId | null): FormularioId {
  const comNovidade = FORMULARIOS.find((f) => naoVistos.some((a) => a.formulario === f.id && !a.visto_em));
  return comNovidade?.id ?? ultima ?? FORMULARIOS[0].id;
}

export function contarPorFormulario(avisos: AvisoFormulario[]): Record<FormularioId, number> {
  const c: Record<FormularioId, number> = { contrato: 0, negocios: 0, estrategia: 0, catalogo: 0 };
  for (const a of avisos) if (!a.visto_em && a.formulario in c) c[a.formulario]++;
  return c;
}

// ------------------------------------------------------------ ver e baixar

export type ModoVer = "briefing" | "texto" | "imagem" | "pdf" | "doc" | "planilha" | "nenhum";
const LIMITE_TEXTO = 2 * 1024 * 1024;

export function modoDoItem(i: Pick<ItemDrive, "name" | "mimeType" | "size">, formulario: FormularioId): ModoVer {
  if (i.mimeType === MIME_DOC) return "doc";
  if (i.mimeType === MIME_PLANILHA) return "planilha";
  const ext = extensao(i.name);
  if (i.mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (ehImagem(i)) return "imagem";
  const ehTexto = i.mimeType.startsWith("text/") || ["txt", "md", "csv", "json"].includes(ext);
  if (!ehTexto || Number(i.size ?? 0) > LIMITE_TEXTO) return "nenhum";
  return ehBriefing(formulario) && ext === "txt" ? "briefing" : "texto";
}

export interface FormatoDownload {
  rotulo: string;
  /** null = baixar o original (alt=media) */
  exportMime: string | null;
  /** extensão acrescentada ao nome (Docs e Planilhas não têm) */
  extensao: string | null;
}

/**
 * O primeiro é o padrão (usado no .zip). Arquivos comuns: o original. Docs/Planilhas: o Google converte.
 * Outros tipos do Google (formulário, desenho…): nenhum — só "Abrir no Google".
 */
export function formatosDeDownload(mimeType: string): FormatoDownload[] {
  if (mimeType === MIME_DOC) {
    return [
      { rotulo: "Word (.docx)", exportMime: MIME_DOCX, extensao: "docx" },
      { rotulo: "PDF", exportMime: "application/pdf", extensao: "pdf" },
    ];
  }
  if (mimeType === MIME_PLANILHA) {
    return [
      { rotulo: "Excel (.xlsx)", exportMime: MIME_XLSX, extensao: "xlsx" },
      { rotulo: "CSV", exportMime: "text/csv", extensao: "csv" },
    ];
  }
  if (mimeType.startsWith("application/vnd.google-apps.")) return [];
  return [{ rotulo: "Original", exportMime: null, extensao: null }];
}

/** Nome que o Windows aceita, para arquivo/pasta no computador e no .zip. */
export function nomeSeguro(nome: string): string {
  const limpo = nome.replace(/[\\/:*?"<>|\p{Cc}]/gu, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  return limpo || "sem nome";
}

export function nomeDoDownload(nome: string, formato: FormatoDownload): string {
  return nomeSeguro(formato.extensao ? `${nome}.${formato.extensao}` : nome);
}

const CONTA_GOOGLE = "contato@andrelopes.digital";

/** Link para abrir o item no Google já na conta contato@ (o Chrome do usuário abre por padrão em outra). */
export function linkNoGoogle(i: Pick<ItemDrive, "id" | "mimeType">): string {
  const base =
    i.mimeType === MIME_PASTA ? `https://drive.google.com/drive/folders/${i.id}`
    : i.mimeType === MIME_DOC ? `https://docs.google.com/document/d/${i.id}/edit`
    : i.mimeType === MIME_PLANILHA ? `https://docs.google.com/spreadsheets/d/${i.id}/edit`
    : `https://drive.google.com/file/d/${i.id}/view`;
  return `${base}?authuser=${encodeURIComponent(CONTA_GOOGLE)}`;
}

/** Id do arquivo num link do Google (coluna "Documento" da planilha do contrato). */
export function idDeLinkDoGoogle(url: string): string | null {
  const m = /^https:\/\/(?:docs|drive)\.google\.com\/(?:document|spreadsheets|file)\/d\/([\w-]{10,})/.exec(url.trim());
  return m ? m[1] : null;
}

// ------------------------------------------------------------ .zip e fotos do catálogo

/** Caminho ainda não usado no .zip ("a.jpg" repetido vira "a (2).jpg"; sem diferenciar caixa); registra em `usados`. */
export function caminhoUnico(caminho: string, usados: Set<string>): string {
  if (!usados.has(caminho.toLowerCase())) {
    usados.add(caminho.toLowerCase());
    return caminho;
  }
  const barra = caminho.lastIndexOf("/");
  const dir = caminho.slice(0, barra + 1);
  const arquivo = caminho.slice(barra + 1);
  const ponto = arquivo.lastIndexOf(".");
  const base = ponto > 0 ? arquivo.slice(0, ponto) : arquivo;
  const ext = ponto > 0 ? arquivo.slice(ponto) : "";
  for (let n = 2; ; n++) {
    const outro = `${dir}${base} (${n})${ext}`;
    if (!usados.has(outro.toLowerCase())) {
      usados.add(outro.toLowerCase());
      return outro;
    }
  }
}

/** Entrada do .zip para um arquivo (formato padrão); null = não entra (tipo do Google sem conversão). */
export function entradaDoZip(
  dir: string,
  item: Pick<ItemDrive, "name" | "mimeType">,
  usados: Set<string>,
): { caminho: string; formato: FormatoDownload } | null {
  const formato = formatosDeDownload(item.mimeType)[0];
  if (!formato) return null;
  return { caminho: caminhoUnico(`${dir}${nomeDoDownload(item.name, formato)}`, usados), formato };
}

/** Nome do produto a partir do nome da foto do Catálogo: "Camiseta - 01.jpg" → "Camiseta". */
export function nomeDoProduto(nomeArquivo: string): string {
  return nomeArquivo.replace(/\.[^.]+$/, "").replace(/ - \d{2,}$/, "").trim();
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS em todos (os testes antigos continuam passando).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dadosInternos.ts src/lib/dadosInternos.test.ts
git commit -m "Dados internos: regras puras (formulários, briefing, selo Novo, downloads e .zip)"
```

### Task 3: Briefing em perguntas e respostas (`briefingTexto.ts`)

**Files:**
- Create: `src/lib/briefingTexto.ts`
- Test: `src/lib/briefingTexto.test.ts`

**Interfaces:**
- Produces: `interface BlocoBriefing { numero: number; pergunta: string; resposta: string; semResposta: boolean }`, `interface BriefingLido { titulo: string | null; blocos: BlocoBriefing[] }`, `lerBriefing(texto: string): BriefingLido | null`.

- [ ] **Step 1: Escrever o teste** (formato real: `Briefing - Nome`, blocos `N - Pergunta` / resposta, separados por linha de 20 sublinhados)

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { lerBriefing } from "./briefingTexto.ts";

const SEP = "____________________";
const real = [
  "Briefing - JAO BOEIRA", "",
  "1 - Qual o seu nome?", "", "JAO BOEIRA", "", SEP, "",
  "2 - Me conta a sua história. Como você chegou até aqui?", "", "Comecei no design em 2020.  ", "Depois, branding.", "", SEP, "",
  "3 - Qual o seu WhatsApp?", "", "(sem resposta)", "", SEP, "",
].join("\n");

test("lê título e blocos do formato gravado no Drive", () => {
  const r = lerBriefing(real);
  assert.ok(r);
  assert.equal(r.titulo, "JAO BOEIRA");
  assert.deepEqual(r.blocos, [
    { numero: 1, pergunta: "Qual o seu nome?", resposta: "JAO BOEIRA", semResposta: false },
    { numero: 2, pergunta: "Me conta a sua história. Como você chegou até aqui?", resposta: "Comecei no design em 2020.\nDepois, branding.", semResposta: false },
    { numero: 3, pergunta: "Qual o seu WhatsApp?", resposta: "(sem resposta)", semResposta: true },
  ]);
});

test("aceita CRLF e arquivo sem cabeçalho", () => {
  const r = lerBriefing(["1 - Pergunta?", "", "Resposta", SEP].join("\r\n"));
  assert.deepEqual(r, { titulo: null, blocos: [{ numero: 1, pergunta: "Pergunta?", resposta: "Resposta", semResposta: false }] });
});

test("resposta vazia conta como sem resposta", () => {
  assert.equal(lerBriefing(["1 - P?", "", "", SEP].join("\n"))?.blocos[0].semResposta, true);
});

test("fora do formato devolve null (a tela mostra o texto original)", () => {
  assert.equal(lerBriefing("Qualquer texto\nsem numeração"), null);
  assert.equal(lerBriefing(""), null);
  assert.equal(lerBriefing(["1 - P?", "", "R", SEP, "", "texto solto", SEP].join("\n")), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — módulo `briefingTexto.ts` não encontrado.

- [ ] **Step 3: Implementar**

```ts
// Briefings (Estratégia e Negócios) chegam ao Drive como .txt: "Briefing - Nome", depois blocos
// "N - Pergunta" + resposta separados por uma linha de sublinhados. Aqui viram perguntas e respostas.
// Sem dependências: roda no navegador e no `node --test`.

export interface BlocoBriefing {
  numero: number;
  pergunta: string;
  resposta: string;
  semResposta: boolean;
}

export interface BriefingLido {
  titulo: string | null;
  blocos: BlocoBriefing[];
}

const SEPARADOR = /^\s*_{5,}\s*$/;
const PERGUNTA = /^(\d+)\s*-\s*(.+)$/;
const CABECALHO = /^briefing\s*-\s*/i;

/** null quando o texto não segue o formato (a tela mostra o texto original). */
export function lerBriefing(texto: string): BriefingLido | null {
  const grupos: string[][] = [[]];
  for (const linha of texto.replace(/\r\n?/g, "\n").split("\n")) {
    if (SEPARADOR.test(linha)) grupos.push([]);
    else grupos[grupos.length - 1].push(linha.trimEnd());
  }
  let titulo: string | null = null;
  const blocos: BlocoBriefing[] = [];
  for (const grupo of grupos) {
    let linhas = grupo.join("\n").trim().split("\n");
    if (!linhas[0]) continue;
    if (blocos.length === 0 && titulo === null && CABECALHO.test(linhas[0])) {
      titulo = linhas[0].replace(CABECALHO, "").trim() || null;
      linhas = linhas.slice(1).join("\n").trim().split("\n");
    }
    const m = PERGUNTA.exec(linhas[0]?.trim() ?? "");
    if (!m) return null;
    const resposta = linhas.slice(1).join("\n").trim();
    blocos.push({
      numero: Number(m[1]),
      pergunta: m[2].trim(),
      resposta,
      semResposta: resposta === "" || resposta === "(sem resposta)",
    });
  }
  return blocos.length ? { titulo, blocos } : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/briefingTexto.ts src/lib/briefingTexto.test.ts
git commit -m "Dados internos: briefing .txt vira perguntas e respostas"
```

### Task 4: Leitor de CSV (`csv.ts`)

**Files:**
- Create: `src/lib/csv.ts`
- Test: `src/lib/csv.test.ts`

**Interfaces:**
- Produces: `lerCsv(texto: string): string[][]`.

- [ ] **Step 1: Escrever o teste**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { lerCsv } from "./csv.ts";

test("linhas simples, CRLF e BOM", () => {
  const bom = String.fromCharCode(0xfeff);
  assert.deepEqual(lerCsv(`${bom}Produto,Preço\r\nCaneca,"R$ 12,00"\r\n`), [["Produto", "Preço"], ["Caneca", "R$ 12,00"]]);
});

test("aspas escapadas, vírgula e quebra de linha dentro da célula", () => {
  assert.deepEqual(lerCsv('a,"diz ""oi""","linha 1\nlinha 2"\nb,,'), [["a", 'diz "oi"', "linha 1\nlinha 2"], ["b", "", ""]]);
});

test("texto vazio não tem linhas", () => {
  assert.deepEqual(lerCsv(""), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — módulo `csv.ts` não encontrado.

- [ ] **Step 3: Implementar**

```ts
// CSV exportado pelo Google (planilhas do contrato e do catálogo) → linhas de células.
// Sem dependências: roda no navegador e no `node --test`.

export function lerCsv(texto: string): string[][] {
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c !== '"') campo += c;
      else if (t[i + 1] === '"') { campo += '"'; i++; }
      else aspas = false;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts src/lib/csv.test.ts
git commit -m "Dados internos: leitor de CSV das planilhas"
```

### Task 5: Leitura do Drive e .zip

**Files:**
- Modify: `src/lib/googleDrive.ts:15-21` (escopos) e `:178` (`async function driveFetch` → `export async function driveFetch`)
- Create: `src/lib/driveLeitura.ts`
- Create: `src/lib/driveZip.ts`
- Modify: `package.json` (dependência `fflate`)

**Interfaces:**
- Consumes: `ItemDrive`, `FormatoDownload`, `nomeDoDownload`, `entradaDoZip`, `ehPasta`, `nomeSeguro`, `visivel` (Task 2).
- Produces:
  - `googleDrive.ts`: `DRIVE_LEITURA_SCOPE`, `export driveFetch(path, init?, base?)`.
  - `driveLeitura.ts`: `class DriveEscopoError`, `class ExportGrandeError`, `listarPasta(pastaId): Promise<ItemDrive[]>`, `obterItem(id): Promise<ItemDrive>`, `trilhaAte(pastaId, raizId): Promise<ItemDrive[]>`, `baixarOriginal(id, sinal?): Promise<Blob>`, `exportar(id, mime, sinal?): Promise<Blob>`, `baixarNoFormato(item, formato, sinal?): Promise<Blob>`, `salvarBlob(blob, nome): void`, `salvarItem(item, formato): Promise<void>`.
  - `driveZip.ts`: `interface ProgressoZip { feitos: number; total: number; fase: "listando" | "baixando" }`, `interface ResultadoZip { blob: Blob; falhas: string[]; total: number }`, `zipDaPasta(pasta: Pick<ItemDrive,"id"|"name">, aoProgredir, sinal): Promise<ResultadoZip>`.

- [ ] **Step 1: Escopo de leitura e `driveFetch` exportado**

Em `src/lib/googleDrive.ts`, trocar o bloco dos escopos por:

```ts
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
/** Leitura de todo o Drive (aba Dados internos: pastas onde os formulários gravam). */
export const DRIVE_LEITURA_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
/** Tudo que a conexão do Google pede: Drive (swipe file e leitura), Agenda. */
export const GOOGLE_SCOPES = [DRIVE_SCOPE, DRIVE_LEITURA_SCOPE, ...CALENDAR_SCOPES];
```

e na declaração `async function driveFetch(` acrescentar `export ` na frente (nada mais muda).

- [ ] **Step 2: Dependência do zip**

Em `package.json`, em `"dependencies"`, acrescentar (ordem alfabética) `"fflate": "^0.8.2",`. Ela já está em `node_modules` (vem com o Excalidraw); conferir com `node -e "console.log(require('fflate/package.json').version)"` → `0.8.x`. O Lovable atualiza o `bun.lockb` ao sincronizar.

- [ ] **Step 3: Criar `src/lib/driveLeitura.ts`**

```ts
// Leitura do Drive para a aba Dados internos — só leitura: listar pasta, ler item, baixar o original,
// exportar Docs/Planilhas e salvar no computador. Usa o token do Google do app (googleDrive.ts).
import { driveFetch } from "@/lib/googleDrive";
import { nomeDoDownload, type FormatoDownload, type ItemDrive } from "@/lib/dadosInternos";

const CAMPOS = "id,name,mimeType,createdTime,modifiedTime,size,parents";

/** O token não pode ler o Drive: falta reconectar o Google com o escopo drive.readonly. */
export class DriveEscopoError extends Error {}
/** O Google não converte Docs/Planilhas grandes (limite de 10 MB na exportação). */
export class ExportGrandeError extends Error {}

async function erroDoDrive(r: Response, acao: string): Promise<Error> {
  const data = await r.json().catch(() => ({}));
  const razao = String(data?.error?.errors?.[0]?.reason ?? "");
  const texto = `${razao} ${data?.error?.status ?? ""} ${data?.error?.message ?? ""}`;
  if (razao === "exportSizeLimitExceeded") return new ExportGrandeError("Grande demais para visualizar aqui.");
  if (r.status === 403 && /insufficient|scope/i.test(texto)) {
    return new DriveEscopoError("A conexão com o Google ainda não pode ler o Drive.");
  }
  if (r.status === 404) return new Error("Não encontrado no Drive (pode ter sido apagado).");
  return new Error(data?.error?.message || `Google Drive respondeu ${r.status} ao ${acao}`);
}

/** Filhos de uma pasta (fora da Lixeira), todas as páginas. */
export async function listarPasta(pastaId: string): Promise<ItemDrive[]> {
  const itens: ItemDrive[] = [];
  let pageToken = "";
  do {
    const q = `'${pastaId.replace(/'/g, "\\'")}' in parents and trashed = false`;
    const params = new URLSearchParams({ q, fields: `nextPageToken,files(${CAMPOS})`, pageSize: "1000", orderBy: "createdTime desc" });
    if (pageToken) params.set("pageToken", pageToken);
    const r = await driveFetch(`/files?${params}`);
    if (!r.ok) throw await erroDoDrive(r, "listar a pasta");
    const data = await r.json();
    itens.push(...((data.files ?? []) as ItemDrive[]));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return itens;
}

export async function obterItem(id: string): Promise<ItemDrive> {
  const r = await driveFetch(`/files/${encodeURIComponent(id)}?fields=${CAMPOS}`);
  if (!r.ok) throw await erroDoDrive(r, "abrir o item");
  return r.json();
}

/** Pastas entre a raiz da sub-aba (exclusive) e `pastaId` (inclusive), para a trilha. */
export async function trilhaAte(pastaId: string, raizId: string): Promise<ItemDrive[]> {
  const trilha: ItemDrive[] = [];
  let atual = pastaId;
  for (let i = 0; i < 8 && atual !== raizId; i++) {
    const item = await obterItem(atual);
    trilha.unshift(item);
    const pai = item.parents?.[0];
    if (!pai) break;
    atual = pai;
  }
  return trilha;
}

/** Os mesmos bytes que estão no Drive. */
export async function baixarOriginal(id: string, sinal?: AbortSignal): Promise<Blob> {
  const r = await driveFetch(`/files/${encodeURIComponent(id)}?alt=media`, { signal: sinal });
  if (!r.ok) throw await erroDoDrive(r, "baixar o arquivo");
  return r.blob();
}

/** Doc/Planilha convertido pelo Google (docx, xlsx, pdf, csv). */
export async function exportar(id: string, mime: string, sinal?: AbortSignal): Promise<Blob> {
  const r = await driveFetch(`/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mime)}`, { signal: sinal });
  if (!r.ok) throw await erroDoDrive(r, "converter o arquivo");
  return r.blob();
}

export function baixarNoFormato(item: Pick<ItemDrive, "id">, formato: FormatoDownload, sinal?: AbortSignal): Promise<Blob> {
  return formato.exportMime ? exportar(item.id, formato.exportMime, sinal) : baixarOriginal(item.id, sinal);
}

export function salvarBlob(blob: Blob, nome: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export async function salvarItem(item: Pick<ItemDrive, "id" | "name">, formato: FormatoDownload): Promise<void> {
  salvarBlob(await baixarNoFormato(item, formato), nomeDoDownload(item.name, formato));
}
```

- [ ] **Step 4: Criar `src/lib/driveZip.ts`**

```ts
// Baixar uma pasta do Drive inteira em .zip, no navegador: percorre a árvore (sem _rascunhos/_teste),
// baixa os originais (Doc → .docx, Planilha → .xlsx) e grava sem recompressão, com a mesma estrutura.
import { Zip, ZipPassThrough } from "fflate";
import { ehPasta, entradaDoZip, nomeSeguro, visivel, type FormatoDownload, type ItemDrive } from "@/lib/dadosInternos";
import { baixarNoFormato, listarPasta } from "@/lib/driveLeitura";

export interface ProgressoZip {
  feitos: number;
  total: number;
  fase: "listando" | "baixando";
}

export interface ResultadoZip {
  blob: Blob;
  /** Caminhos que ficaram de fora depois de 3 tentativas */
  falhas: string[];
  total: number;
}

interface Entrada {
  item: ItemDrive;
  caminho: string;
  formato: FormatoDownload;
}

const cancelado = () => new DOMException("Cancelado", "AbortError");
const ehCancelamento = (e: unknown) => (e as Error)?.name === "AbortError";

async function coletar(pastaId: string, dir: string, usados: Set<string>, saida: Entrada[], sinal: AbortSignal): Promise<void> {
  for (const item of await listarPasta(pastaId)) {
    if (sinal.aborted) throw cancelado();
    if (!visivel(item)) continue;
    if (ehPasta(item)) {
      await coletar(item.id, `${dir}${nomeSeguro(item.name)}/`, usados, saida, sinal);
      continue;
    }
    const e = entradaDoZip(dir, item, usados);
    if (e) saida.push({ item, ...e });
  }
}

async function comTentativas<T>(fn: () => Promise<T>, sinal: AbortSignal, vezes = 3): Promise<T> {
  let erro: unknown;
  for (let i = 0; i < vezes; i++) {
    if (sinal.aborted) throw cancelado();
    try {
      return await fn();
    } catch (e) {
      if (ehCancelamento(e)) throw e;
      erro = e;
    }
  }
  throw erro;
}

export async function zipDaPasta(
  pasta: Pick<ItemDrive, "id" | "name">,
  aoProgredir: (p: ProgressoZip) => void,
  sinal: AbortSignal,
): Promise<ResultadoZip> {
  aoProgredir({ feitos: 0, total: 0, fase: "listando" });
  const entradas: Entrada[] = [];
  await coletar(pasta.id, "", new Set(), entradas, sinal);

  const partes: Uint8Array[] = [];
  let terminar!: () => void;
  let falhar!: (e: unknown) => void;
  const pronto = new Promise<void>((resolve, reject) => { terminar = resolve; falhar = reject; });
  const zip = new Zip((err, chunk, final) => {
    if (err) { falhar(err); return; }
    partes.push(chunk);
    if (final) terminar();
  });

  const falhas: string[] = [];
  let feitos = 0;
  let proxima = 0;
  aoProgredir({ feitos, total: entradas.length, fase: "baixando" });
  // 3 downloads ao mesmo tempo; cada arquivo entra no .zip inteiro (add + push juntos, sem await no meio)
  const trabalhador = async () => {
    while (proxima < entradas.length) {
      const e = entradas[proxima++];
      try {
        const blob = await comTentativas(() => baixarNoFormato(e.item, e.formato, sinal), sinal);
        const dados = new Uint8Array(await blob.arrayBuffer());
        const arquivo = new ZipPassThrough(e.caminho);
        zip.add(arquivo);
        arquivo.push(dados, true);
      } catch (erro) {
        if (ehCancelamento(erro)) throw erro;
        falhas.push(e.caminho);
      }
      aoProgredir({ feitos: ++feitos, total: entradas.length, fase: "baixando" });
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  zip.end();
  await pronto;
  return { blob: new Blob(partes as BlobPart[], { type: "application/zip" }), falhas, total: entradas.length };
}
```

- [ ] **Step 5: Conferir tipos e testes**

Run: `npx tsc --noEmit` e `npm test`
Expected: nenhum erro; testes PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/googleDrive.ts src/lib/driveLeitura.ts src/lib/driveZip.ts package.json
git commit -m "Dados internos: leitura do Drive (escopo drive.readonly), downloads e .zip de pasta"
```

### Task 6: Avisos em tempo real e contador no menu

**Files:**
- Create: `src/lib/formulariosEnvios.ts`
- Modify: `src/lib/nav.tsx` (import `Inbox`; link no grupo Comercial)
- Modify: `src/components/NavLateral.tsx` (prop `contadores`, selo nos links e no grupo recolhido)
- Modify: `src/routes/_authenticated.tsx:66` e `:217`

**Interfaces:**
- Consumes: `AvisoFormulario`, `FormularioId` (Task 2); tabela da Task 1.
- Produces: `buscarNaoVistos()`, `marcarVistos(ids: string[])`, `marcarTodosVistos(formulario: FormularioId)`, `useAvisosFormularios(): { naoVistos: AvisoFormulario[]; carregado: boolean; recarregar: () => Promise<void> }`; `NavLateral` aceita `contadores?: Record<string, number>`.

- [ ] **Step 1: Criar `src/lib/formulariosEnvios.ts`**

```ts
// Avisos que os formulários públicos gravam em formularios_envios (RPC registrar_envio_formulario).
// Alimentam o contador do menu, os selos "Novo" e a recarga da sub-aba aberta. Tempo real via Realtime.
import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AvisoFormulario, FormularioId } from "@/lib/dadosInternos";

// O types.ts gerado ainda não conhece a tabela nova: por isso `as any`.
const tabela = () => supabase.from("formularios_envios" as any) as any;

export async function buscarNaoVistos(): Promise<AvisoFormulario[]> {
  const { data, error } = await tabela().select("*").is("visto_em", null).order("recebido_em", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as AvisoFormulario[];
}

export async function marcarVistos(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await tabela().update({ visto_em: new Date().toISOString() }).in("id", ids);
  if (error) throw error;
}

export async function marcarTodosVistos(formulario: FormularioId): Promise<void> {
  const { error } = await tabela().update({ visto_em: new Date().toISOString() }).eq("formulario", formulario).is("visto_em", null);
  if (error) throw error;
}

/** Avisos não vistos, sempre atualizados: Realtime + recarga ao voltar para a janela (só o banco do app). */
export function useAvisosFormularios(): { naoVistos: AvisoFormulario[]; carregado: boolean; recarregar: () => Promise<void> } {
  const [naoVistos, setNaoVistos] = useState<AvisoFormulario[]>([]);
  const [carregado, setCarregado] = useState(false);
  const canal = `formularios-envios-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const recarregar = useCallback(async () => {
    try {
      setNaoVistos(await buscarNaoVistos());
    } catch {
      // tabela ainda não aplicada ou rede fora: mantém o que tinha
    } finally {
      setCarregado(true);
    }
  }, []);

  useEffect(() => {
    void recarregar();
    const ch = supabase
      .channel(canal)
      .on("postgres_changes", { event: "*", schema: "public", table: "formularios_envios" }, () => void recarregar())
      .subscribe();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void recarregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [canal, recarregar]);

  return { naoVistos, carregado, recarregar };
}
```

- [ ] **Step 2: Item no menu (`src/lib/nav.tsx`)**

Acrescentar `Inbox,` à lista de ícones importados de `lucide-react` e, no grupo `"Comercial"`, logo depois da linha do CRM:

```tsx
      { label: "Dados internos", icon: <Inbox size={17} />, to: "/dados-internos", palavras: ["briefing", "contrato", "catálogo", "formulários", "respostas", "drive", "e-commerce"] },
```

- [ ] **Step 3: Contador no `NavLateral`**

Em `src/components/NavLateral.tsx`:

1. Na interface `NavLateralProps`, acrescentar:
```ts
  /** Número ao lado do link (ex.: respostas não vistas em "/dados-internos") */
  contadores?: Record<string, number>;
```
2. Assinatura: `export function NavLateral({ grupos, onNavegar, onAbrirMenu, contadores }: NavLateralProps) {`
3. Antes de `export function NavLateral`, acrescentar:
```tsx
function Contador({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span aria-label={`${n} novos`} className="ml-auto shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-primary-foreground">
      {n > 99 ? "99+" : n}
    </span>
  );
}
```
4. Nos resultados da busca, depois de `<span className="min-w-0 flex-1 truncate">{link.label}</span>`, acrescentar `<Contador n={contadores?.[link.to]} />`.
5. Nos links dos grupos, trocar `{link.label}` por:
```tsx
                        <span className="min-w-0 flex-1 truncate">{link.label}</span>
                        <Contador n={contadores?.[link.to]} />
```
6. No cabeçalho do grupo recolhido, dentro do `<span className="normal-case tracking-normal …">`, depois de `{temAtual ? " · aba atual" : ""}`, acrescentar:
```tsx
                      {(() => { const n = group.links.reduce((s, l) => s + (contadores?.[l.to] ?? 0), 0); return n ? ` · ${n} novo${n > 1 ? "s" : ""}` : ""; })()}
```

- [ ] **Step 4: Ligar no layout (`src/routes/_authenticated.tsx`)**

Importar `import { useAvisosFormularios } from "@/lib/formulariosEnvios";`. Depois da linha 66 (`const grupos = …`):

```ts
  const { naoVistos: avisosNaoVistos } = useAvisosFormularios();
  const contadoresMenu = useMemo(() => ({ "/dados-internos": avisosNaoVistos.length }), [avisosNaoVistos]);
```

e na linha 217: `<NavLateral grupos={grupos} onNavegar={fecharMenuCelular} onAbrirMenu={abrirMenu} contadores={contadoresMenu} />`.

- [ ] **Step 5: Conferir tipos e testes**

Run: `npx tsc --noEmit` e `npm test`
Expected: nenhum erro; PASS (o teste do menu não muda: item novo vai para o fim da ordem salva).

- [ ] **Step 6: Commit**

```bash
git add src/lib/formulariosEnvios.ts src/lib/nav.tsx src/components/NavLateral.tsx src/routes/_authenticated.tsx
git commit -m "Dados internos: avisos em tempo real e contador no menu"
```

### Task 7: Página, botões de link, acesso ao Google e lista de pastas

**Files:**
- Create: `src/components/dadosInternos/BotoesLinks.tsx`
- Create: `src/components/dadosInternos/AcessoGoogle.tsx`
- Create: `src/components/dadosInternos/NavegadorPasta.tsx`
- Create: `src/routes/_authenticated/dados-internos.tsx`
- Modify: `src/routeTree.gen.ts` (gerado), `tools/auditoria-mobile/rotas.mjs`

**Interfaces:**
- Consumes: Tasks 2, 5, 6; `statusDoDrive`, `getAccessToken`, `oauthUrl`, `DriveAuthError`, `DRIVE_LEITURA_SCOPE` (`googleDrive.ts`); `BotaoGoogleLogin`; `getUserId`, `FALLBACK_USER_ID` (`clientesService.ts`); `IconeArquivo` (`components/pdfs/IconeArquivo.tsx`).
- Produces:
  - `useAcessoDrive(): { estado: "verificando" | "sem_login" | "sem_permissao" | "pronto" | "erro"; clientId: string | null; erro: string | null; verificar: (forcar?: boolean) => Promise<void>; semPermissao: () => void }` e `<AcessoGoogle acesso={...} />`.
  - `<NavegadorPasta formulario pastaId avisos onAbrirPasta(item, avisoIds) onAbrirArquivo(item, avisoIds) onIrPara(pastaId) onMarcarTudo() onBaixarZip(pasta) onSemPermissao() />`. Nesta task a pasta com fotos ainda aparece como lista; a galeria entra na Task 9.
  - Rota `/dados-internos` com busca `{ aba?: FormularioId; pasta?: string; arquivo?: string }`. O `Visualizador` entra na Task 8 (nesta task, `?arquivo=` ainda não abre nada).

- [ ] **Step 1: `BotoesLinks.tsx`**

```tsx
// Topo da aba Dados internos: um clique copia o link público de cada formulário.
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ORDEM_BOTOES, formularioPorId, type FormularioId } from "@/lib/dadosInternos";

export function BotoesLinks() {
  const [copiado, setCopiado] = useState<FormularioId | null>(null);
  const copiar = async (id: FormularioId) => {
    const { link } = formularioPorId(id);
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(id);
      toast.success("Link copiado");
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500);
    } catch {
      toast.error(`Não consegui copiar. O link é ${link}`);
    }
  };
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {ORDEM_BOTOES.map((id) => (
        <Button key={id} variant="outline" size="sm" className="gap-1.5" onClick={() => void copiar(id)} title={`Copiar ${formularioPorId(id).link}`}>
          {copiado === id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          {formularioPorId(id).botao}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `AcessoGoogle.tsx`**

```tsx
// Antes de ler o Drive: o navegador precisa do login Google e a conexão precisa do escopo drive.readonly.
import { useCallback, useEffect, useState } from "react";
import { FolderLock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BotaoGoogleLogin } from "@/components/swipe/BotaoGoogleLogin";
import { DRIVE_LEITURA_SCOPE, DriveAuthError, getAccessToken, oauthUrl, statusDoDrive } from "@/lib/googleDrive";
import { FALLBACK_USER_ID, getUserId } from "@/lib/clientesService";

export type EstadoAcesso = "verificando" | "sem_login" | "sem_permissao" | "pronto" | "erro";
export interface AcessoDrive {
  estado: EstadoAcesso;
  clientId: string | null;
  erro: string | null;
  verificar: (forcar?: boolean) => Promise<void>;
  semPermissao: () => void;
}

export function useAcessoDrive(): AcessoDrive {
  const [estado, setEstado] = useState<EstadoAcesso>("verificando");
  const [clientId, setClientId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const verificar = useCallback(async (forcar = false) => {
    setEstado("verificando");
    try {
      const st = await statusDoDrive(forcar);
      setClientId(st.client_id);
      // Só com drive.file a listagem das pastas volta vazia (sem erro): por isso a checagem vem antes
      if (!st.connected || !(st.scope ?? "").split(/\s+/).includes(DRIVE_LEITURA_SCOPE)) {
        setEstado("sem_permissao");
        return;
      }
      await getAccessToken();
      setEstado("pronto");
    } catch (e) {
      if (e instanceof DriveAuthError) { setEstado("sem_login"); return; }
      setErro(e instanceof Error ? e.message : "Não consegui falar com o Google");
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    // Volta do consentimento do Google (?google_connected=1 / ?google_error=...)
    const p = new URLSearchParams(window.location.search);
    if (p.get("google_connected")) toast.success("Google reconectado: a aba já pode ler o Drive");
    else if (p.get("google_error")) toast.error(`Google recusou a conexão: ${p.get("google_error")}`);
    void verificar(p.has("google_connected"));
  }, [verificar]);

  // Estável: o NavegadorPasta usa em dependência de efeito (uma função nova a cada render relistaria em loop)
  const semPermissao = useCallback(() => setEstado("sem_permissao"), []);

  return { estado, clientId, erro, verificar, semPermissao };
}

async function conectarLeitura() {
  try {
    const st = await statusDoDrive(true);
    if (!st.client_id || !st.redirect_uri) { toast.error("Credenciais do Google não configuradas no projeto"); return; }
    const userId = (await getUserId()) || FALLBACK_USER_ID;
    window.location.href = oauthUrl(st.client_id, st.redirect_uri, userId, `${window.location.origin}/dados-internos`);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a conexão");
  }
}

export function AcessoGoogle({ acesso }: { acesso: AcessoDrive }) {
  if (acesso.estado === "verificando") {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 size={18} className="animate-spin" /> Conectando ao Drive…
      </div>
    );
  }
  if (acesso.estado === "sem_permissao") {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FolderLock size={26} /></span>
          <p className="text-base font-semibold">Libere a leitura do Drive</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Autorize uma vez com a conta contato@andrelopes.digital. Swipe file e Agenda continuam funcionando como antes.
          </p>
          <Button className="mt-1" onClick={() => void conectarLeitura()}>Conectar leitura do Drive</Button>
        </CardContent>
      </Card>
    );
  }
  if (acesso.estado === "sem_login") {
    return (
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="space-y-3 p-4 text-sm">
          <p className="font-medium">Entre com o Google neste navegador para ver as respostas</p>
          {acesso.clientId
            ? <BotaoGoogleLogin clientId={acesso.clientId} onEntrou={() => void acesso.verificar(true)} />
            : <p className="text-muted-foreground">Configure o login Google no Admin.</p>}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm">
        <p className="text-destructive">{acesso.erro}</p>
        <Button variant="outline" onClick={() => void acesso.verificar(true)}>Tentar de novo</Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: `NavegadorPasta.tsx`**

```tsx
// Uma pasta do Drive dentro da aba Dados internos: trilha, busca, lista com selo "Novo" e ações por item.
// Só leitura. Recarrega quando chega aviso novo do formulário desta sub-aba.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCheck, ChevronRight, Download, ExternalLink, Eye, Folder, FolderArchive, Home, Loader2, MoreVertical, RefreshCw, Search, Sheet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconeArquivo } from "@/components/pdfs/IconeArquivo";
import { cn } from "@/lib/utils";
import {
  MIME_DOC, MIME_PASTA, MIME_PLANILHA, ehPasta, formatarDataHora, formatosDeDownload, linkNoGoogle, normalizarNome, novosNaLista, ordenarItens,
  rotuloDoItem, visivel, type AvisoFormulario, type Formulario, type ItemDrive,
} from "@/lib/dadosInternos";
import { DriveEscopoError, listarPasta, salvarItem, trilhaAte } from "@/lib/driveLeitura";

export interface NavegadorPastaProps {
  formulario: Formulario;
  pastaId: string;
  /** Avisos não vistos deste formulário */
  avisos: AvisoFormulario[];
  onAbrirPasta: (item: ItemDrive, avisoIds: string[]) => void;
  onAbrirArquivo: (item: ItemDrive, avisoIds: string[]) => void;
  onIrPara: (pastaId: string) => void;
  onMarcarTudo: () => void;
  onBaixarZip: (pasta: Pick<ItemDrive, "id" | "name">) => void;
  onSemPermissao: () => void;
}

/** Nome com extensão só para escolher o ícone (Docs e Planilhas não têm extensão). */
function nomeParaIcone(i: ItemDrive): string {
  if (i.mimeType === MIME_DOC) return `${i.name}.docx`;
  if (i.mimeType === MIME_PLANILHA) return `${i.name}.xlsx`;
  return i.name;
}

export function NavegadorPasta(p: NavegadorPastaProps) {
  const [itens, setItens] = useState<ItemDrive[] | null>(null);
  const [trilha, setTrilha] = useState<ItemDrive[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const temLista = useRef(false);
  const naRaiz = p.pastaId === p.formulario.pastaId;
  const { onSemPermissao } = p;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, caminho] = await Promise.all([
        listarPasta(p.pastaId),
        naRaiz ? Promise.resolve([] as ItemDrive[]) : trilhaAte(p.pastaId, p.formulario.pastaId),
      ]);
      setItens(ordenarItens(lista.filter(visivel)));
      setTrilha(caminho);
      setErro(null);
      temLista.current = true;
    } catch (e) {
      if (e instanceof DriveEscopoError) { onSemPermissao(); return; }
      const msg = e instanceof Error ? e.message : "Não consegui ler o Drive";
      if (temLista.current) toast.error(msg, { action: { label: "Tentar de novo", onClick: () => void carregar() } });
      else setErro(msg);
    } finally {
      setCarregando(false);
    }
  }, [p.pastaId, p.formulario.pastaId, naRaiz, onSemPermissao]);

  useEffect(() => {
    temLista.current = false;
    setItens(null);
    setErro(null);
    setBusca("");
    void carregar();
  }, [carregar]);

  // Chegou aviso novo deste formulário com a sub-aba aberta: relista a pasta
  const conhecidos = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(p.avisos.map((a) => a.id));
    const antes = conhecidos.current;
    conhecidos.current = ids;
    if (antes && [...ids].some((id) => !antes.has(id))) void carregar();
  }, [p.avisos, carregar]);

  const novos = useMemo(() => novosNaLista(itens ?? [], p.avisos), [itens, p.avisos]);
  const visiveis = useMemo(() => {
    const q = normalizarNome(busca);
    if (!q) return itens ?? [];
    return (itens ?? []).filter((i) => normalizarNome(rotuloDoItem(i, p.formulario.id).titulo).includes(q));
  }, [itens, busca, p.formulario.id]);

  const pastaAtual = naRaiz ? { id: p.formulario.pastaId, name: p.formulario.pastaNome } : trilha[trilha.length - 1];

  const baixar = async (item: ItemDrive, indice = 0) => {
    const formato = formatosDeDownload(item.mimeType)[indice];
    if (!formato) return;
    const id = toast.loading(`Baixando ${item.name}…`);
    try {
      await salvarItem(item, formato);
      toast.success("Download pronto", { id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui baixar", { id });
    }
  };

  const abrir = (item: ItemDrive) => {
    const avisoIds = novos.get(item.id) ?? [];
    if (ehPasta(item)) p.onAbrirPasta(item, avisoIds);
    else p.onAbrirArquivo(item, avisoIds);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Pastas" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
          <button type="button" onClick={() => p.onIrPara(p.formulario.pastaId)} className={cn("flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted", naRaiz && "font-semibold")}>
            <Home size={14} /> {p.formulario.pastaNome}
          </button>
          {trilha.map((t, i) => (
            <span key={t.id} className="flex items-center gap-1">
              <ChevronRight size={14} className="text-muted-foreground" />
              <button type="button" onClick={() => p.onIrPara(t.id)} disabled={i === trilha.length - 1} className={cn("truncate rounded px-1.5 py-0.5 hover:bg-muted disabled:hover:bg-transparent", i === trilha.length - 1 && "font-semibold")}>
                {t.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="relative w-full sm:w-56">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome" className="h-8 pl-8 text-sm" />
        </div>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void carregar()} disabled={carregando} title="Atualizar">
          <RefreshCw size={14} className={cn(carregando && "animate-spin")} />
        </Button>
        {pastaAtual && (
          <>
            <Button variant="ghost" size="sm" onClick={() => window.open(linkNoGoogle({ id: pastaAtual.id, mimeType: MIME_PASTA }), "_blank", "noopener")} title="Abrir no Google">
              <ExternalLink size={14} />
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => p.onBaixarZip(pastaAtual)}>
              <FolderArchive size={14} /> Baixar pasta (.zip)
            </Button>
          </>
        )}
        {naRaiz && p.avisos.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={p.onMarcarTudo}>
            <CheckCheck size={14} /> Marcar tudo como visto
          </Button>
        )}
      </div>

      {erro ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm">
          <p className="text-destructive">{erro}</p>
          <Button variant="outline" onClick={() => void carregar()}>Tentar de novo</Button>
        </Card>
      ) : itens === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 size={18} className="animate-spin" /> Lendo o Drive…
        </div>
      ) : visiveis.length === 0 ? (
        <Card className="px-6 py-12 text-center text-sm text-muted-foreground">
          {busca ? "Nada com esse nome." : "Nenhuma resposta ainda."}
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {visiveis.map((item) => {
            const { titulo, data } = rotuloDoItem(item, p.formulario.id);
            const novo = novos.has(item.id);
            const formatos = formatosDeDownload(item.mimeType);
            return (
              <div key={item.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
                <button type="button" onClick={() => abrir(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  {ehPasta(item)
                    ? <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600"><Folder size={18} /></span>
                    : <IconeArquivo nome={nomeParaIcone(item)} tamanho={30} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{titulo}</span>
                      {novo && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">Novo</span>}
                      {item.mimeType === MIME_PLANILHA && <Sheet size={13} className="shrink-0 text-emerald-600" aria-label="Planilha" />}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{formatarDataHora(data)}</span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Ações de ${titulo}`}><MoreVertical size={16} /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => abrir(item)}>
                      {ehPasta(item) ? <><Folder size={14} className="mr-2" /> Abrir</> : <><Eye size={14} className="mr-2" /> Ver</>}
                    </DropdownMenuItem>
                    {ehPasta(item) ? (
                      <DropdownMenuItem onClick={() => p.onBaixarZip(item)}><FolderArchive size={14} className="mr-2" /> Baixar pasta (.zip)</DropdownMenuItem>
                    ) : formatos.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Baixar</DropdownMenuLabel>
                        {formatos.map((f, i) => (
                          <DropdownMenuItem key={f.rotulo} onClick={() => void baixar(item, i)}><Download size={14} className="mr-2" /> {f.rotulo}</DropdownMenuItem>
                        ))}
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => window.open(linkNoGoogle(item), "_blank", "noopener")}>
                      <ExternalLink size={14} className="mr-2" /> Abrir no Google
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rota `src/routes/_authenticated/dados-internos.tsx`**

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FORMULARIOS, abaInicial, contarPorFormulario, ehFormularioId, formularioPorId, nomeSeguro, type FormularioId, type ItemDrive,
} from "@/lib/dadosInternos";
import { marcarTodosVistos, marcarVistos, useAvisosFormularios } from "@/lib/formulariosEnvios";
import { salvarBlob } from "@/lib/driveLeitura";
import { zipDaPasta, type ProgressoZip } from "@/lib/driveZip";
import { BotoesLinks } from "@/components/dadosInternos/BotoesLinks";
import { AcessoGoogle, useAcessoDrive } from "@/components/dadosInternos/AcessoGoogle";
import { NavegadorPasta } from "@/components/dadosInternos/NavegadorPasta";

// Aba "Dados internos": respostas dos formulários públicos, lidas do Drive (somente leitura).
interface Busca {
  aba?: FormularioId;
  pasta?: string;
  arquivo?: string;
}

export const Route = createFileRoute("/_authenticated/dados-internos")({
  validateSearch: (s: Record<string, unknown>): Busca => ({
    ...(ehFormularioId(s.aba) ? { aba: s.aba } : {}),
    ...(typeof s.pasta === "string" && s.pasta ? { pasta: s.pasta } : {}),
    ...(typeof s.arquivo === "string" && s.arquivo ? { arquivo: s.arquivo } : {}),
  }),
  component: DadosInternosPage,
});

const CHAVE_ULTIMA = "dados-internos-aba";
function lerUltima(): FormularioId | null {
  try {
    const v = localStorage.getItem(CHAVE_ULTIMA);
    return ehFormularioId(v) ? v : null;
  } catch {
    return null;
  }
}
function guardarUltima(id: FormularioId) {
  try {
    localStorage.setItem(CHAVE_ULTIMA, id);
  } catch {
    // sem armazenamento: só não lembra a última sub-aba
  }
}

interface ZipEmAndamento {
  nome: string;
  progresso: ProgressoZip;
  cancelar: () => void;
}

function DadosInternosPage() {
  const busca = Route.useSearch();
  const navigate = useNavigate({ from: "/dados-internos" });
  const { naoVistos, carregado } = useAvisosFormularios();
  const acesso = useAcessoDrive();
  const contagem = useMemo(() => contarPorFormulario(naoVistos), [naoVistos]);

  // Sem ?aba=: primeira sub-aba com novidade (ou a última usada), assim que os avisos chegam
  useEffect(() => {
    if (busca.aba || !carregado) return;
    void navigate({ search: { aba: abaInicial(naoVistos, lerUltima()) }, replace: true });
  }, [busca.aba, carregado, naoVistos, navigate]);

  const aba: FormularioId = busca.aba ?? lerUltima() ?? FORMULARIOS[0].id;
  const formulario = formularioPorId(aba);
  useEffect(() => guardarUltima(aba), [aba]);
  const avisosDaAba = useMemo(() => naoVistos.filter((a) => a.formulario === aba), [naoVistos, aba]);

  const vistos = useCallback((ids: string[]) => {
    if (ids.length) marcarVistos(ids).catch(() => toast.error("Não consegui marcar como visto"));
  }, []);

  // Link direto (?pasta= / ?arquivo=): marca os avisos que apontam para esse item pelo id
  useEffect(() => {
    const alvos = [busca.pasta, busca.arquivo].filter(Boolean);
    if (alvos.length) vistos(naoVistos.filter((a) => a.drive_id && alvos.includes(a.drive_id)).map((a) => a.id));
  }, [busca.pasta, busca.arquivo, naoVistos, vistos]);

  const [zip, setZip] = useState<ZipEmAndamento | null>(null);
  const baixarZip = useCallback(async (pasta: Pick<ItemDrive, "id" | "name">) => {
    if (zip) { toast.info("Espere o .zip atual terminar"); return; }
    const controle = new AbortController();
    setZip({ nome: pasta.name, progresso: { feitos: 0, total: 0, fase: "listando" }, cancelar: () => controle.abort() });
    try {
      const r = await zipDaPasta(pasta, (progresso) => setZip((z) => (z ? { ...z, progresso } : z)), controle.signal);
      if (r.total === 0) { toast.info("A pasta está vazia"); return; }
      salvarBlob(r.blob, `${nomeSeguro(pasta.name)}.zip`);
      if (r.falhas.length) {
        toast.warning(`.zip salvo sem ${r.falhas.length} arquivo(s): ${r.falhas.slice(0, 3).join(", ")}${r.falhas.length > 3 ? "…" : ""}`);
      } else toast.success(".zip baixado");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error(e instanceof Error ? e.message : "Não consegui montar o .zip");
    } finally {
      setZip(null);
    }
  }, [zip]);

  const irPara = (pastaId: string) =>
    void navigate({ search: { aba, ...(pastaId !== formulario.pastaId ? { pasta: pastaId } : {}) } });

  return (
    <div className="space-y-5 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <Inbox size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dados internos</h1>
            <p className="text-sm text-muted-foreground">Respostas dos formulários, direto do Drive. Somente leitura.</p>
          </div>
        </div>
        <BotoesLinks />
      </div>

      <Tabs value={aba} onValueChange={(v) => { if (ehFormularioId(v)) void navigate({ search: { aba: v } }); }}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          {FORMULARIOS.map((f) => (
            <TabsTrigger key={f.id} value={f.id} className="gap-2">
              {f.aba}
              {contagem[f.id] > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">{contagem[f.id]}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {acesso.estado !== "pronto" ? (
        <AcessoGoogle acesso={acesso} />
      ) : (
        <NavegadorPasta
          key={formulario.id}
          formulario={formulario}
          pastaId={busca.pasta ?? formulario.pastaId}
          avisos={avisosDaAba}
          onAbrirPasta={(item, avisoIds) => { vistos(avisoIds); void navigate({ search: { aba, pasta: item.id } }); }}
          onAbrirArquivo={(item, avisoIds) => { vistos(avisoIds); void navigate({ search: { aba, pasta: busca.pasta, arquivo: item.id } }); }}
          onIrPara={irPara}
          onMarcarTudo={() => marcarTodosVistos(aba).catch(() => toast.error("Não consegui marcar como visto"))}
          onBaixarZip={(pasta) => void baixarZip(pasta)}
          onSemPermissao={acesso.semPermissao}
        />
      )}

      {zip && (
        <Card className="fixed bottom-20 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] space-y-2 p-3 shadow-lg lg:bottom-4">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 size={14} className="animate-spin" />
            <span className="min-w-0 flex-1 truncate">
              {zip.progresso.fase === "listando" ? `Lendo as pastas de "${zip.nome}"…` : `"${zip.nome}": ${zip.progresso.feitos} de ${zip.progresso.total} arquivos`}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zip.cancelar} aria-label="Cancelar .zip"><X size={14} /></Button>
          </div>
          <Progress value={zip.progresso.total ? (zip.progresso.feitos / zip.progresso.total) * 100 : 0} />
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Rota na árvore e na auditoria mobile**

Rodar `npx vite build --mode development` (gera `src/routeTree.gen.ts` com `/_authenticated/dados-internos`); conferir com `git diff --stat src/routeTree.gen.ts` que só há linhas acrescentadas da rota nova (se houver reordenação do arquivo inteiro, desfazer com `git checkout -- src/routeTree.gen.ts` e acrescentar a rota à mão, copiando o padrão de `/_authenticated/links`). Em `tools/auditoria-mobile/rotas.mjs`, acrescentar `"/dados-internos"` depois de `"/crm"`.

- [ ] **Step 6: Tipos e testes**

Run: `npx tsc --noEmit` e `npm test`
Expected: nenhum erro; PASS.

- [ ] **Step 7: Conferir no navegador (local)**

Matar `vite dev` antigos (memória `dev-server-local`), `npm run dev`, abrir `http://localhost:<porta>/dados-internos`. Esperado: título, 4 botões (clicar "Contrato" → toast "Link copiado"; conferir a área de transferência com `navigator.clipboard.readText()` no console), 4 sub-abas e o cartão "Libere a leitura do Drive" (a conexão ainda não tem o escopo novo). O teste com dados reais fica na Task 10, depois da reconexão.

- [ ] **Step 8: Commit**

```bash
git add src/components/dadosInternos src/routes/_authenticated/dados-internos.tsx src/routeTree.gen.ts tools/auditoria-mobile/rotas.mjs
git commit -m "Dados internos: aba com botões de link, sub-abas, acesso ao Drive e navegação por pastas"
```

### Task 8: Visualizador

**Files:**
- Create: `src/components/dadosInternos/Visualizador.tsx`
- Modify: `src/routes/_authenticated/dados-internos.tsx` (renderizar o visualizador)

**Interfaces:**
- Consumes: `modoDoItem`, `formatosDeDownload`, `linkNoGoogle`, `idDeLinkDoGoogle`, `nomeDoDownload` (Task 2); `lerBriefing` (Task 3); `lerCsv` (Task 4); `obterItem`, `baixarOriginal`, `exportar`, `salvarItem`, `ExportGrandeError` (Task 5).
- Produces: `<Visualizador arquivoId={string | null} formulario={Formulario} onFechar={() => void} onAbrirArquivo={(id: string) => void} />`.

- [ ] **Step 1: Criar `Visualizador.tsx`**

```tsx
// Tela cheia para um arquivo das respostas: briefing em perguntas e respostas, texto, imagem, PDF,
// Doc (convertido em PDF só para exibir) e planilha (tabela). Baixar no original ou no formato escolhido.
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconeArquivo } from "@/components/pdfs/IconeArquivo";
import { cn } from "@/lib/utils";
import {
  formatarDataHora, formatosDeDownload, idDeLinkDoGoogle, linkNoGoogle, modoDoItem, rotuloDoItem, type Formulario, type ItemDrive,
} from "@/lib/dadosInternos";
import { lerBriefing } from "@/lib/briefingTexto";
import { lerCsv } from "@/lib/csv";
import { ExportGrandeError, baixarOriginal, exportar, obterItem, salvarItem } from "@/lib/driveLeitura";

type Conteudo =
  | { tipo: "url"; url: string }
  | { tipo: "texto"; texto: string }
  | { tipo: "tabela"; linhas: string[][] }
  | { tipo: "nada" };

export interface VisualizadorProps {
  arquivoId: string | null;
  formulario: Formulario;
  onFechar: () => void;
  /** Abrir outro arquivo (link de Doc dentro da planilha do contrato) */
  onAbrirArquivo: (id: string) => void;
}

export function Visualizador({ arquivoId, formulario, onFechar, onAbrirArquivo }: VisualizadorProps) {
  const [item, setItem] = useState<ItemDrive | null>(null);
  const [conteudo, setConteudo] = useState<Conteudo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [original, setOriginal] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const modo = item ? modoDoItem(item, formulario.id) : null;

  useEffect(() => {
    setItem(null);
    setConteudo(null);
    setErro(null);
    setOriginal(false);
    if (!arquivoId) return;
    let cancelado = false;
    let objectUrl: string | null = null;
    (async () => {
      const it = await obterItem(arquivoId);
      if (cancelado) return;
      setItem(it);
      const m = modoDoItem(it, formulario.id);
      if (m === "nenhum") { setConteudo({ tipo: "nada" }); return; }
      if (m === "planilha") {
        const texto = await (await exportar(it.id, "text/csv")).text();
        if (!cancelado) setConteudo({ tipo: "tabela", linhas: lerCsv(texto) });
        return;
      }
      if (m === "briefing" || m === "texto") {
        const texto = await (await baixarOriginal(it.id)).text();
        if (!cancelado) setConteudo({ tipo: "texto", texto });
        return;
      }
      const blob = m === "doc" ? await exportar(it.id, "application/pdf") : await baixarOriginal(it.id);
      if (cancelado) return;
      // O iframe/img só mostra com o tipo certo
      const tipo = m === "doc" || m === "pdf" ? "application/pdf" : blob.type || it.mimeType;
      objectUrl = URL.createObjectURL(new Blob([blob], { type: tipo }));
      setConteudo({ tipo: "url", url: objectUrl });
    })().catch((e) => {
      if (cancelado) return;
      setErro(e instanceof ExportGrandeError ? "Grande demais para visualizar aqui. Use \"Abrir no Google\"." : e instanceof Error ? e.message : "Não consegui abrir");
    });
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [arquivoId, formulario.id]);

  const briefing = useMemo(
    () => (modo === "briefing" && conteudo?.tipo === "texto" ? lerBriefing(conteudo.texto) : null),
    [modo, conteudo],
  );
  const formatos = item ? formatosDeDownload(item.mimeType) : [];
  const rotulo = item ? rotuloDoItem(item, formulario.id) : null;

  const baixar = async (indice: number) => {
    if (!item) return;
    setBaixando(true);
    try {
      await salvarItem(item, formatos[indice]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui baixar");
    } finally {
      setBaixando(false);
    }
  };

  return (
    <Dialog open={!!arquivoId} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden p-0 w-[calc(100vw-1rem)] h-[calc(100dvh-1rem)] max-w-none sm:max-w-none sm:w-[calc(100vw-3rem)] sm:h-[calc(100dvh-3rem)] [&>button:last-child]:hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-3 border-b px-3 py-2 sm:px-4">
          <IconeArquivo nome={item?.name ?? "arquivo"} tamanho={30} />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold leading-tight">{rotulo?.titulo ?? "Abrindo…"}</DialogTitle>
            <DialogDescription className="truncate text-[11px]">
              {[formulario.aba, rotulo ? formatarDataHora(rotulo.data) : null].filter(Boolean).join(" · ")}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {modo === "briefing" && briefing && (
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => setOriginal((o) => !o)}>
                {original ? "Perguntas e respostas" : "Texto original"}
              </Button>
            )}
            {item && (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => window.open(linkNoGoogle(item), "_blank", "noopener")} title="Abrir no Google">
                <ExternalLink size={14} /> <span className="hidden sm:inline">Abrir no Google</span>
              </Button>
            )}
            {formatos.length === 1 && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void baixar(0)} disabled={baixando}>
                {baixando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Baixar
              </Button>
            )}
            {formatos.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={baixando}>
                    {baixando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Baixar <ChevronDown size={13} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {formatos.map((f, i) => <DropdownMenuItem key={f.rotulo} onClick={() => void baixar(i)}>{f.rotulo}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="sm" className="gap-1.5" onClick={onFechar}><X size={14} /> Fechar</Button>
          </div>
        </div>

        <div className="relative flex-1 bg-muted/40">
          {erro ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-destructive">{erro}</p>
              <Button variant="outline" size="sm" onClick={onFechar}>Fechar</Button>
            </div>
          ) : !conteudo ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={18} className="animate-spin" /> Carregando…
            </div>
          ) : conteudo.tipo === "nada" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <IconeArquivo nome={item?.name ?? ""} tamanho={64} />
              <p className="text-sm font-medium">{item?.name}</p>
              <p className="max-w-sm text-xs text-muted-foreground">Esse formato não abre aqui dentro. Baixe para abrir no programa certo.</p>
            </div>
          ) : conteudo.tipo === "texto" ? (
            <div className="absolute inset-0 overflow-auto bg-background">
              {briefing && !original ? (
                <div className="mx-auto max-w-3xl space-y-5 p-5 sm:p-8">
                  {briefing.titulo && <h2 className="text-lg font-semibold">{briefing.titulo}</h2>}
                  {briefing.blocos.map((b) => (
                    <section key={b.numero} className="space-y-1.5 border-b pb-4 last:border-0">
                      <p className="text-sm font-semibold">
                        <span className="mr-2 font-mono text-xs text-muted-foreground">{b.numero}</span>
                        {b.pergunta}
                      </p>
                      <p className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed", b.semResposta && "italic text-muted-foreground")}>
                        {b.semResposta ? "Sem resposta" : b.resposta}
                      </p>
                    </section>
                  ))}
                </div>
              ) : (
                <pre className="mx-auto max-w-4xl whitespace-pre-wrap break-words p-6 font-mono text-[13px] leading-relaxed">{conteudo.texto}</pre>
              )}
            </div>
          ) : conteudo.tipo === "tabela" ? (
            <div className="absolute inset-0 overflow-auto bg-background">
              <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>{(conteudo.linhas[0] ?? []).map((c, j) => <th key={j} className="whitespace-nowrap border-b px-3 py-2 text-left font-semibold">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {conteudo.linhas.slice(1).map((linha, i) => (
                    <tr key={i} className="border-b hover:bg-muted/40">
                      {linha.map((c, j) => {
                        const docId = idDeLinkDoGoogle(c);
                        return (
                          <td key={j} className="max-w-[28rem] whitespace-pre-wrap break-words px-3 py-2 align-top">
                            {docId ? (
                              <Button variant="link" size="sm" className="h-auto gap-1 p-0" onClick={() => onAbrirArquivo(docId)}><FileText size={13} /> Ver documento</Button>
                            ) : /^https?:\/\//.test(c) ? (
                              <a href={c} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">{c}</a>
                            ) : c}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : modo === "imagem" ? (
            <img src={conteudo.url} alt={item?.name ?? ""} className="absolute inset-0 h-full w-full object-contain p-4" />
          ) : (
            <iframe key={conteudo.url} src={conteudo.url} title={item?.name ?? "arquivo"} className="absolute inset-0 h-full w-full border-0" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Renderizar na página**

Em `src/routes/_authenticated/dados-internos.tsx`: `import { Visualizador } from "@/components/dadosInternos/Visualizador";` e, logo antes do bloco `{zip && (…)}`:

```tsx
      <Visualizador
        arquivoId={acesso.estado === "pronto" ? busca.arquivo ?? null : null}
        formulario={formulario}
        onFechar={() => void navigate({ search: { aba, pasta: busca.pasta } })}
        onAbrirArquivo={(id) => void navigate({ search: { aba, pasta: busca.pasta, arquivo: id } })}
      />
```

- [ ] **Step 3: Tipos e testes**

Run: `npx tsc --noEmit` e `npm test`
Expected: nenhum erro; PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dadosInternos/Visualizador.tsx src/routes/_authenticated/dados-internos.tsx
git commit -m "Dados internos: visualizador (briefing formatado, texto, imagem, PDF, Doc e planilha) com downloads"
```

### Task 9: Galeria de fotos do catálogo

**Files:**
- Create: `src/components/dadosInternos/GaleriaFotos.tsx`
- Modify: `src/components/dadosInternos/NavegadorPasta.tsx` (usar a galeria quando a pasta só tem fotos e subpastas)

**Interfaces:**
- Consumes: `ehImagem`, `ehPasta`, `nomeDoProduto`, `formatosDeDownload`, `ItemDrive` (Task 2); `listarPasta`, `baixarOriginal`, `salvarItem` (Task 5).
- Produces: `<GaleriaFotos itens={ItemDrive[]} onBaixarZip={(pasta) => void} onAbrirPasta={(item: ItemDrive) => void} />`.

- [ ] **Step 1: Criar `GaleriaFotos.tsx`**

```tsx
// Pasta de fotos do Catálogo: uma seção por produto (subpasta com 2+ fotos, ou foto solta "Produto.jpg"),
// miniaturas baixadas só quando aparecem na tela (4 por vez) e ampliação com setas e download.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FolderArchive, ImageOff, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ehImagem, ehPasta, formatosDeDownload, nomeDoProduto, type ItemDrive } from "@/lib/dadosInternos";
import { baixarOriginal, listarPasta, salvarItem } from "@/lib/driveLeitura";

// Fila compartilhada: no máximo 4 chamadas ao Drive ao mesmo tempo
const fila: Array<() => void> = [];
let ativos = 0;
function naFila<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const rodar = () => {
      ativos++;
      fn().then(resolve, reject).finally(() => {
        ativos--;
        fila.shift()?.();
      });
    };
    if (ativos < 4) rodar();
    else fila.push(rodar);
  });
}

interface Grupo {
  nome: string;
  /** Subpasta do produto (2+ fotos); null = foto solta na pasta */
  pasta: ItemDrive | null;
  fotos: ItemDrive[] | null;
}

const porNome = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR", { numeric: true });

export interface GaleriaFotosProps {
  itens: ItemDrive[];
  onBaixarZip: (pasta: Pick<ItemDrive, "id" | "name">) => void;
  onAbrirPasta: (item: ItemDrive) => void;
}

export function GaleriaFotos({ itens, onBaixarZip, onAbrirPasta }: GaleriaFotosProps) {
  const urls = useRef(new Map<string, Promise<string>>());
  const [subpastas, setSubpastas] = useState<Record<string, ItemDrive[] | "erro">>({});
  const [ampliada, setAmpliada] = useState<{ fotos: ItemDrive[]; indice: number } | null>(null);

  // Revoga as miniaturas ao sair da pasta
  useEffect(() => {
    const mapa = urls.current;
    return () => {
      for (const p of mapa.values()) void p.then((u) => URL.revokeObjectURL(u)).catch(() => {});
      mapa.clear();
    };
  }, []);

  const obterUrl = useCallback((item: ItemDrive): Promise<string> => {
    let p = urls.current.get(item.id);
    if (!p) {
      p = naFila(() => baixarOriginal(item.id)).then((b) => URL.createObjectURL(b));
      p.catch(() => urls.current.delete(item.id));
      urls.current.set(item.id, p);
    }
    return p;
  }, []);

  const pastas = useMemo(() => itens.filter(ehPasta), [itens]);
  useEffect(() => {
    let cancelado = false;
    for (const pasta of pastas) {
      naFila(() => listarPasta(pasta.id))
        .then((lista) => { if (!cancelado) setSubpastas((s) => ({ ...s, [pasta.id]: lista.filter(ehImagem).sort(porNome) })); })
        .catch(() => { if (!cancelado) setSubpastas((s) => ({ ...s, [pasta.id]: "erro" })); });
    }
    return () => { cancelado = true; };
  }, [pastas]);

  const grupos = useMemo<Grupo[]>(() => {
    const soltas = new Map<string, ItemDrive[]>();
    for (const f of itens.filter(ehImagem).sort(porNome)) {
      const nome = nomeDoProduto(f.name);
      soltas.set(nome, [...(soltas.get(nome) ?? []), f]);
    }
    const lista: Grupo[] = [...soltas].map(([nome, fotos]) => ({ nome, pasta: null, fotos }));
    for (const pasta of pastas) {
      const s = subpastas[pasta.id];
      lista.push({ nome: pasta.name, pasta, fotos: s === "erro" ? [] : s ?? null });
    }
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  }, [itens, pastas, subpastas]);

  const baixarFoto = async (foto: ItemDrive) => {
    try {
      await salvarItem(foto, formatosDeDownload(foto.mimeType)[0]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui baixar");
    }
  };

  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <Card key={g.pasta?.id ?? `solta-${g.nome}`} className="space-y-3 p-3">
          <div className="flex items-center gap-2">
            <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline disabled:hover:no-underline" disabled={!g.pasta} onClick={() => g.pasta && onAbrirPasta(g.pasta)}>
              {g.nome}
            </button>
            <span className="text-[11px] text-muted-foreground">{g.fotos ? `${g.fotos.length} foto${g.fotos.length === 1 ? "" : "s"}` : "…"}</span>
            {g.pasta ? (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onBaixarZip(g.pasta!)}><FolderArchive size={14} /> .zip</Button>
            ) : g.fotos?.length === 1 ? (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void baixarFoto(g.fotos![0])}><Download size={14} /> Baixar</Button>
            ) : null}
          </div>
          {g.fotos === null ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Lendo as fotos…</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
              {g.fotos.map((f, i) => (
                <Miniatura key={f.id} item={f} obterUrl={obterUrl} onClick={() => setAmpliada({ fotos: g.fotos!, indice: i })} />
              ))}
            </div>
          )}
        </Card>
      ))}
      <Ampliar estado={ampliada} obterUrl={obterUrl} onMudar={setAmpliada} onBaixar={(f) => void baixarFoto(f)} />
    </div>
  );
}

function Miniatura({ item, obterUrl, onClick }: { item: ItemDrive; obterUrl: (i: ItemDrive) => Promise<string>; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelado = false;
    const obs = new IntersectionObserver((entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      obterUrl(item).then((u) => { if (!cancelado) setUrl(u); }).catch(() => { if (!cancelado) setFalhou(true); });
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => { cancelado = true; obs.disconnect(); };
  }, [item, obterUrl]);
  return (
    <button ref={ref} type="button" onClick={onClick} title={item.name} className="relative aspect-square overflow-hidden rounded-md bg-muted">
      {url ? <img src={url} alt={item.name} className="h-full w-full object-cover" />
        : falhou ? <ImageOff size={18} className="absolute inset-0 m-auto text-muted-foreground" />
        : <Loader2 size={16} className="absolute inset-0 m-auto animate-spin text-muted-foreground" />}
    </button>
  );
}

function Ampliar({ estado, obterUrl, onMudar, onBaixar }: {
  estado: { fotos: ItemDrive[]; indice: number } | null;
  obterUrl: (i: ItemDrive) => Promise<string>;
  onMudar: (e: { fotos: ItemDrive[]; indice: number } | null) => void;
  onBaixar: (f: ItemDrive) => void;
}) {
  const foto = estado ? estado.fotos[estado.indice] : null;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!foto) return;
    let cancelado = false;
    obterUrl(foto).then((u) => { if (!cancelado) setUrl(u); }).catch(() => {});
    return () => { cancelado = true; };
  }, [foto, obterUrl]);
  const ir = (delta: number) => estado && onMudar({ ...estado, indice: (estado.indice + delta + estado.fotos.length) % estado.fotos.length });
  useEffect(() => {
    if (!estado) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "ArrowLeft") ir(-1); if (e.key === "ArrowRight") ir(1); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });
  return (
    <Dialog open={!!estado} onOpenChange={(o) => { if (!o) onMudar(null); }}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 p-0 sm:max-w-none [&>button:last-child]:hidden">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold">{foto?.name}</DialogTitle>
            <DialogDescription className="text-[11px]">{estado ? `${estado.indice + 1} de ${estado.fotos.length}` : ""}</DialogDescription>
          </div>
          {foto && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onBaixar(foto)}><Download size={14} /> Baixar</Button>}
          <Button size="sm" className="gap-1.5" onClick={() => onMudar(null)}><X size={14} /> Fechar</Button>
        </div>
        <div className="relative flex-1 bg-black/90">
          {url ? <img src={url} alt={foto?.name ?? ""} className="absolute inset-0 h-full w-full object-contain p-2" />
            : <Loader2 size={22} className="absolute inset-0 m-auto animate-spin text-white/70" />}
          {estado && estado.fotos.length > 1 && (
            <>
              <Button variant="secondary" size="icon" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full" onClick={() => ir(-1)} aria-label="Anterior"><ChevronLeft size={18} /></Button>
              <Button variant="secondary" size="icon" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full" onClick={() => ir(1)} aria-label="Próxima"><ChevronRight size={18} /></Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Usar a galeria no `NavegadorPasta`**

Importar `import { GaleriaFotos } from "@/components/dadosInternos/GaleriaFotos";` e `ehImagem` de `@/lib/dadosInternos`. Depois do `useMemo` de `visiveis`, acrescentar:

```ts
  // Pasta só de fotos e subpastas (a pasta "Fotos" do Catálogo e as de cada produto): vira galeria
  const galeria = !!itens && itens.some(ehImagem) && itens.every((i) => ehImagem(i) || ehPasta(i));
```

e no JSX trocar a condição `) : visiveis.length === 0 ? (` por:

```tsx
      ) : galeria && !busca ? (
        <GaleriaFotos itens={itens} onBaixarZip={p.onBaixarZip} onAbrirPasta={(item) => abrir(item)} />
      ) : visiveis.length === 0 ? (
```

- [ ] **Step 3: Tipos e testes**

Run: `npx tsc --noEmit` e `npm test`
Expected: nenhum erro; PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dadosInternos/GaleriaFotos.tsx src/components/dadosInternos/NavegadorPasta.tsx
git commit -m "Dados internos: galeria de fotos do catálogo agrupada por produto, com ampliar e .zip por produto"
```

### Task 10: Conferência com dados reais, publicação e reconexão

**Files:** nenhum novo (ajustes que aparecerem vão no arquivo do componente, com commit próprio).

- [ ] **Step 1: Reconectar o Google (usuário)**

Com `npm run dev` rodando, abrir `/dados-internos` e pedir ao usuário que clique "Conectar leitura do Drive" e aprove com a conta contato@. De volta à aba: toast "Google reconectado…" e a lista aparece.

- [ ] **Step 2: Conferir cada sub-aba com os dados reais**

Esperado:
- **Briefing – Negócios**: 9 itens, mais novo primeiro ("Lead · 17/08/2026 12:41" no topo). Abrir "Clínica Garone" mostra as perguntas e respostas; "Texto original" alterna; "Baixar" salva `Clínica Garone - 2026-07-12 22-32-20.txt` com o mesmo tamanho do Drive (5586 bytes).
- **Briefing – Estratégia**: 3 itens ("Vinicius Dias" no topo).
- **Dados para contrato**: a planilha "Respostas — Dados de contrato" (só o cabeçalho) abre como tabela; baixar como Excel gera `.xlsx` que abre no Excel.
- **Catálogos – E-Commerce**: "Nenhuma resposta ainda." (sem `_rascunhos`/`_teste`).
- "Baixar pasta (.zip)" em Negócios gera `Negócios.zip` com os 9 `.txt`; conferir com `unzip -l` (ou abrir no Windows) nomes e tamanhos.
- "Abrir no Google" abre o item na conta contato@.
- Menu: "Dados internos" no grupo Comercial, sem contador (ainda não há avisos).

- [ ] **Step 3: Contador e recarga ao vivo (simulado pela RPC)**

Com a sub-aba Negócios aberta, rodar a chamada da RPC da Task 1, Step 3, com `{"p_formulario":"negocios","p_chave":"negocios:teste-ao-vivo","p_titulo":"Lead"}`. Esperado, sem recarregar a página: contador "1" no menu e na sub-aba Negócios; lista relida; nenhum selo "Novo" (nenhum `.txt` criado nos últimos 15 min). "Marcar tudo como visto" zera os contadores. Depois apagar a linha (`DELETE …?chave=eq.negocios:teste-ao-vivo`).

- [ ] **Step 4: Publicar**

`git push`; no Lovable, **Publicar → Publicar alterações** (memória `lovable-build-falhando`). Conferir em `https://gestao.andrelopes.digital/dados-internos` que a aba abre com a lista (a conexão com o escopo novo vale para todos os navegadores).

- [ ] **Step 5: Commit de ajustes (se houver)**

```bash
git add -A src
git commit -m "Dados internos: ajustes da conferência com dados reais"
```

---

## Parte 3 — Formulário de Contrato (repo `C:\Users\Andre\Sistemas\Contratos`)

### Task 11: Aviso ao sistema no Apps Script do Contrato

**Files:**
- Modify: `server/handler.ts`
- Modify: `server/handler.test.ts`
- Modify: `server/gas.test.ts`
- Modify: `apps-script/Code.js`
- Modify: `apps-script/appsscript.json`

**Interfaces:**
- Produces: `Store.createDoc(content): { id: string; url: string }`, `Store.notify(aviso: Aviso): void`, `interface Aviso { chave: string; titulo: string; driveId: string }`; em `Code.js`, `testarAviso()` e `avisarSistema_(aviso)`; payload da RPC `{ p_formulario: "contrato", p_chave: "contrato:<idEnvio ou protocolo>", p_titulo: <empresa>, p_drive_id: <id do Doc> }`.

- [ ] **Step 1: Testes do handler (falham)**

Em `server/handler.test.ts`:
1. Importar `type Aviso` junto de `handleSubmission, type Store`.
2. No `fakeStore()`, acrescentar `const avisos: Aviso[] = [];`, trocar o `createDoc` por
```ts
    createDoc: (content) => {
      docs.push(content);
      return { id: 'doc1', url: 'https://docs.google.com/document/d/doc1/edit' };
    },
```
acrescentar `notify: (aviso) => { avisos.push(aviso); },` e devolver `avisos` no `return { rows, docs, seen, store, avisos }`.
3. Acrescentar no `describe('handleSubmission'`:
```ts
  it('avisa o sistema uma vez por envio novo, com o id do Doc', () => {
    const { avisos } = send(VALID_PAYLOAD);
    expect(avisos).toEqual([{ chave: `contrato:${VALID_PAYLOAD.idEnvio}`, titulo: 'Clínica Exemplo Ltda', driveId: 'doc1' }]);
  });

  it('reenvio do mesmo idEnvio não avisa de novo', () => {
    const s = fakeStore();
    handleSubmission(JSON.stringify(VALID_PAYLOAD), CTX, s.store);
    handleSubmission(JSON.stringify(VALID_PAYLOAD), CTX, s.store);
    expect(s.avisos).toHaveLength(1);
  });

  it('sem idEnvio, a chave do aviso é o protocolo', () => {
    const { avisos } = send(withPatch((p) => { delete (p as { idEnvio?: string }).idEnvio; }));
    expect(avisos[0].chave).toBe('contrato:CT-20260925-1432-ABCD');
  });

  it('falha no aviso não derruba o envio', () => {
    const s = fakeStore();
    s.store.notify = () => { throw new Error('sistema fora do ar'); };
    const result = handleSubmission(JSON.stringify(VALID_PAYLOAD), CTX, s.store);
    expect(result).toEqual({ ok: true, protocolo: 'CT-20260925-1432-ABCD' });
    expect(s.rows).toHaveLength(1);
  });

  it('honeypot não avisa', () => {
    const { avisos } = send({ ...VALID_PAYLOAD, hp: 'robô' });
    expect(avisos).toEqual([]);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/handler.test.ts`
Expected: FAIL (tipo `Aviso` inexistente / `avisos` vazio).

- [ ] **Step 3: Implementar no handler**

Em `server/handler.ts`, trocar a interface `Store` por:

```ts
export interface Aviso {
  chave: string;
  titulo: string;
  driveId: string;
}

export interface Store {
  appendRow(row: string[]): void;
  /** Cria o Google Doc na pasta de destino e devolve id e URL. */
  createDoc(content: DocContent): { id: string; url: string };
  /** Protocolo já gerado para este idEnvio, se houver. */
  recall(idEnvio: string): string | null;
  remember(idEnvio: string, protocolo: string): void;
  /** Avisa o sistema de gestão que chegou um envio (pode lançar erro: quem chama engole). */
  notify(aviso: Aviso): void;
}
```

e o fim de `handleSubmission` por:

```ts
  const doc = store.createDoc(buildDocContent(result.data, protocolo, ctx));
  store.appendRow(buildRow(result.data, protocolo, ctx.receivedAt, doc.url));
  if (idEnvio) store.remember(idEnvio, protocolo);
  try {
    store.notify({ chave: `contrato:${idEnvio ?? protocolo}`, titulo: result.data.empresa.nome, driveId: doc.id });
  } catch {
    // O envio já está gravado; sem o aviso só o contador do sistema de gestão não sobe.
  }
  return { ok: true, protocolo };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run server/handler.test.ts`
Expected: PASS.

- [ ] **Step 5: Teste do Apps Script (falha)**

Em `server/gas.test.ts`:
1. Na interface `GasGlobals`, acrescentar `testarAviso(): void;`.
2. Em `loadGas`, receber `opcoes: { avisoFalha?: boolean } = {}`, criar `const avisos: Array<{ url: string; payload: Record<string, unknown>; headers: Record<string, string> }> = [];` e acrescentar ao `sandbox`:
```ts
    UrlFetchApp: {
      fetch: (url: string, options: { payload: string; headers: Record<string, string> }) => {
        if (opcoes.avisoFalha) throw new Error('Address unavailable');
        avisos.push({ url, payload: JSON.parse(options.payload), headers: options.headers });
        return { getResponseCode: () => 204, getContentText: () => '' };
      },
    },
```
e devolver `avisos` no `return { gas: …, header, rows, docs, moves, avisos }`.
3. Acrescentar ao `describe`:
```ts
  it('avisa o sistema de gestão depois de gravar', () => {
    const { gas, avisos } = loadGas();
    const out = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(TEST_PAYLOAD) } }).text);
    expect(out.ok).toBe(true);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].url).toBe('https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/rpc/registrar_envio_formulario');
    expect(avisos[0].payload).toEqual({ p_formulario: 'contrato', p_chave: `contrato:${TEST_PAYLOAD.idEnvio}`, p_titulo: '[TESTE] Empresa Exemplo', p_drive_id: 'doc1' });
    expect(avisos[0].headers.apikey).toMatch(/^eyJ/);
  });

  it('sistema fora do ar não derruba o envio', () => {
    const { gas, rows } = loadGas({ avisoFalha: true });
    const out = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(TEST_PAYLOAD) } }).text);
    expect(out.ok).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it('testarAviso manda o aviso de teste de autorização', () => {
    const { gas, avisos } = loadGas();
    gas.testarAviso();
    expect(avisos[0].payload).toMatchObject({ p_formulario: 'contrato', p_chave: 'contrato:teste-autorizacao' });
  });
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run server/gas.test.ts`
Expected: FAIL (`avisos` vazio; `testarAviso` não existe).

- [ ] **Step 7: Implementar no `Code.js` e no manifesto**

Em `apps-script/Code.js`, depois de `var TZ = …;`:

```js
// Sistema de gestão (aba Dados internos): cada envio gravado vira um aviso lá. A chave é pública (anon).
var SISTEMA_RPC = 'https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/rpc/registrar_envio_formulario';
var SISTEMA_CHAVE = '<colar aqui o valor de VITE_SUPABASE_PUBLISHABLE_KEY do .env do gestao-de-operacao>';
```

(colar a chave de verdade, começando com `eyJ`). Depois da função `doPost`:

```js
/** Rode pelo editor depois de publicar código novo: autoriza o acesso externo e testa o aviso ao sistema. */
function testarAviso() {
  avisarSistema_({ chave: 'contrato:teste-autorizacao', titulo: '[TESTE] autorização', driveId: '' });
  console.log('Aviso de teste enviado ao sistema de gestão.');
}

function avisarSistema_(aviso) {
  var resposta = UrlFetchApp.fetch(SISTEMA_RPC, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SISTEMA_CHAVE, Authorization: 'Bearer ' + SISTEMA_CHAVE },
    payload: JSON.stringify({ p_formulario: 'contrato', p_chave: aviso.chave, p_titulo: aviso.titulo, p_drive_id: aviso.driveId || null }),
    muteHttpExceptions: true,
  });
  var codigo = resposta.getResponseCode();
  if (codigo >= 300) throw new Error('Sistema respondeu ' + codigo + ': ' + resposta.getContentText().slice(0, 200));
}
```

Em `store_()`, no `createDoc`, trocar `return url;` por `return { id: doc.getId(), url: url };` e acrescentar ao objeto devolvido:

```js
    notify: function (aviso) {
      try {
        avisarSistema_(aviso);
      } catch (err) {
        console.warn('Aviso ao sistema de gestão falhou: ' + (err && err.message ? err.message : err));
      }
    },
```

Em `apps-script/appsscript.json`, acrescentar `"https://www.googleapis.com/auth/script.external_request"` ao fim de `oauthScopes`.

- [ ] **Step 8: Rodar tudo**

Run: `npm test` e `npm run typecheck`
Expected: PASS; sem erros de tipo.

- [ ] **Step 9: Commit**

```bash
git add server apps-script/Code.js apps-script/appsscript.json
git commit -m "Aviso ao sistema de gestão a cada envio (aba Dados internos), sem afetar o envio"
```

### Task 12: Publicar o Apps Script do Contrato e teste de ponta a ponta

- [ ] **Step 1: Enviar o código (o endereço em uso continua na versão antiga)**

Run: `cd C:/Users/Andre/Sistemas/Contratos && npm run gas:push`
Expected: `Pushed 3 files`. Se o clasp pedir login, pedir ao usuário `! npx clasp login` (conta contato@).

- [ ] **Step 2: Autorização (usuário)**

Pedir ao usuário: abrir `https://script.google.com/d/1YCcS56t2hT6xzOoEf2mGFOAc8vLjLJw3hnhWftZg5TD0kYykw1qh7YhT/edit`, escolher `testarAviso` e clicar **Executar** → aprovar "Conectar a um serviço externo" com a conta contato@. Conferir o aviso:

```bash
curl -s "$URL/rest/v1/formularios_envios?chave=eq.contrato:teste-autorizacao&select=titulo" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```
Expected: `[{"titulo":"[TESTE] autorização"}]`. Apagar em seguida (`-X DELETE` na mesma URL, sem `select`).

- [ ] **Step 3: Trocar a versão no ar (mesmo endereço)**

Run: `npx clasp update-deployment AKfycbzbU6Aj1qc01Rc11pOucdczcveW2zeSnAYt7Ic146VV5QAEkHvNv3GLVmwfnZR82k4igQ --description "Aviso ao sistema de gestão"`
Expected: deployment atualizado com versão nova.

- [ ] **Step 4: Envio de teste real**

Com `/dados-internos?aba=contrato` aberto no navegador, rodar `node scripts/smoke-submit.mjs https://script.google.com/macros/s/AKfycbzbU6Aj1qc01Rc11pOucdczcveW2zeSnAYt7Ic146VV5QAEkHvNv3GLVmwfnZR82k4igQ/exec`. Esperado, sem recarregar: contador "1" no menu e na sub-aba; o Doc `[TESTE] …` aparece com selo "Novo"; abrir mostra o Doc; baixar Word/PDF funciona; a planilha mostra a linha com "Ver documento" abrindo o mesmo Doc; ao abrir, o contador zera.

- [ ] **Step 5: Limpeza**

Pedir ao usuário (ou fazer pelo editor, se ele autorizar) rodar `limparTestes()` no editor do Apps Script. Apagar a linha do aviso: `curl -s -X DELETE "$URL/rest/v1/formularios_envios?titulo=like.%5BTESTE%5D*" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"`.

- [ ] **Step 6: Push do repo**

```bash
git push
```

---

## Parte 4 — Formulário de Catálogo (repo `C:\Users\Andre\Sistemas\Briefing E-Commerce`)

### Task 13: Aviso ao sistema no Apps Script do Catálogo

**Files:**
- Modify: `server/handler.ts`
- Modify: `server/handler.test.ts`
- Modify: `server/gas.test.ts`
- Modify: `apps-script/Code.js`
- Modify: `apps-script/appsscript.json`

**Interfaces:**
- Produces: `Store.id: string` (pasta da loja), `Backend.notify(aviso: Aviso): void`, `interface Aviso { chave: string; titulo: string; driveId: string }`; `registrar(…, lojaId: string)`; em `Code.js`, `testarAviso()` e `avisarSistema_(aviso)`; payload `{ p_formulario: "catalogo", p_chave: "catalogo:<idEnvio>", p_titulo: "<Loja> - <Cliente>", p_drive_id: <id da pasta da loja> }`.

- [ ] **Step 1: Testes do handler (falham)**

Em `server/handler.test.ts`:
1. Importar `type Aviso` junto dos tipos de `./handler`.
2. Em `fake(clock)`: `const avisos: Aviso[] = [];`; no objeto `store` de `openStore`, acrescentar `id: folderName,`; no `backend`, acrescentar `notify(aviso) { avisos.push(aviso); },`; devolver `avisos` no `return { backend, …, state, avisos }`.
3. Acrescentar testes (usam os helpers `setup`, `envio`, `produto`, `ENVIO_1` e o fluxo `tresFotos`/`preparar`/`lote`/`concluir` que já existem no arquivo):
```ts
describe('aviso ao sistema de gestão', () => {
  it('envio antigo (enviar) avisa uma vez com a pasta da loja', () => {
    const s = setup();
    const body = envio(null, ENVIO_1, [produto('Caneca', [], 'https://loja.com/caneca')]);
    expect(s.call(body)).toMatchObject({ ok: true });
    expect(s.call(body)).toMatchObject({ ok: true }); // reenvio: resultado guardado, sem novo aviso
    expect(s.t.avisos).toEqual([{ chave: `catalogo:${ENVIO_1}`, titulo: 'Ateliê da Ana - Ana Souza', driveId: 'Ateliê da Ana - Ana Souza' }]);
  });

  it('etapas (preparar → organizar → concluir) avisam só no concluir', () => {
    const s = setup();
    const d = s.iniciar();
    const { produtos, itens } = tresFotos(s, d);
    s.call(preparar(d, ENVIO_1, produtos));
    s.call(lote(d, ENVIO_1, itens));
    expect(s.t.avisos).toEqual([]);
    expect(s.call(concluir(d, ENVIO_1, produtos, ['Camiseta', 'Caneca']))).toMatchObject({ ok: true });
    expect(s.t.avisos).toHaveLength(1);
  });

  it('falha no aviso não derruba o envio', () => {
    const s = setup();
    s.t.backend.notify = () => { throw new Error('sistema fora do ar'); };
    expect(s.call(envio(null, ENVIO_1, [produto('Caneca', [], 'https://loja.com/caneca')]))).toMatchObject({ ok: true, produtos: 1 });
  });
});
```
Se `tresFotos` estiver declarado dentro de outro `describe`, mover a declaração para o nível do arquivo (sem mudar o corpo) para reutilizar.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/handler.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar no handler**

Em `server/handler.ts`:
1. Antes de `export interface Store`, acrescentar:
```ts
export interface Aviso {
  chave: string;
  titulo: string;
  driveId: string;
}
```
2. Em `Store`, primeira propriedade: `/** Pasta da loja no Drive. */ id: string;`
3. Em `Backend`, acrescentar: `/** Avisa o sistema de gestão que chegou um catálogo (pode lançar erro: quem chama engole). */ notify(aviso: Aviso): void;`
4. Nas duas chamadas `return registrar(data, rows.length, nomes, rascunhoId, env, backend);`, acrescentar o argumento `store.id` no fim.
5. Assinatura e fim de `registrar`:
```ts
function registrar(data: Catalogo, produtos: number, nomes: string[], rascunhoId: string | null, env: Env, backend: Backend, lojaId: string): EnviarResponse {
```
e, logo antes do `return result;`:
```ts
  try {
    backend.notify({ chave: `catalogo:${data.idEnvio}`, titulo: storeFolderName(data.loja, data.cliente), driveId: lojaId });
  } catch {
    // O catálogo já foi gravado; sem o aviso só o contador do sistema de gestão não sobe.
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run server/handler.test.ts`
Expected: PASS.

- [ ] **Step 5: Teste do Apps Script (falha)**

Em `server/gas.test.ts`:
1. Na interface do `gas` (bloco com `doPost`, `setup`, …), acrescentar `testarAviso(): void;`.
2. Em `loadGas`, receber `opcoes: { avisoFalha?: boolean } = {}`, criar `const avisos: Array<{ url: string; payload: Record<string, unknown> }> = [];`, acrescentar ao sandbox:
```ts
    UrlFetchApp: {
      fetch: (url: string, options: { payload: string }) => {
        if (opcoes.avisoFalha) throw new Error('Address unavailable');
        avisos.push({ url, payload: JSON.parse(options.payload) });
        return { getResponseCode: () => 204, getContentText: () => '' };
      },
    },
```
e devolver `avisos` no objeto de retorno.
3. Testes:
```ts
  it('avisa o sistema de gestão com a pasta da loja', () => {
    const g = loadGas();
    g.post(envio(null, ENVIOS[0], [produto('Caneca', [], 'https://loja.com/caneca')]));
    expect(g.avisos).toHaveLength(1);
    expect(g.avisos[0].url).toBe('https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/rpc/registrar_envio_formulario');
    expect(g.avisos[0].payload).toEqual({
      p_formulario: 'catalogo', p_chave: `catalogo:${ENVIOS[0]}`, p_titulo: 'Ateliê da Ana - Ana Souza', p_drive_id: g.byPath(LOJA)!.id,
    });
  });

  it('sistema fora do ar não derruba o envio', () => {
    const g = loadGas({ avisoFalha: true });
    expect(g.post(envio(null, ENVIOS[0], [produto('Caneca', [], 'https://loja.com/caneca')]))).toMatchObject({ ok: true });
  });

  it('testarAviso manda o aviso de teste de autorização', () => {
    const g = loadGas();
    g.gas.testarAviso();
    expect(g.avisos[0].payload).toMatchObject({ p_formulario: 'catalogo', p_chave: 'catalogo:teste-autorizacao' });
  });
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run server/gas.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implementar no `Code.js` e no manifesto**

Em `apps-script/Code.js`, depois de `var CAMPOS = …;`:

```js
// Sistema de gestão (aba Dados internos): cada catálogo concluído vira um aviso lá. A chave é pública (anon).
var SISTEMA_RPC = 'https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/rpc/registrar_envio_formulario';
var SISTEMA_CHAVE = '<colar aqui o valor de VITE_SUPABASE_PUBLISHABLE_KEY do .env do gestao-de-operacao>';
```

Depois de `doPost`:

```js
/** Rode pelo editor depois de publicar código novo: autoriza o acesso externo e testa o aviso ao sistema. */
function testarAviso() {
  avisarSistema_({ chave: 'catalogo:teste-autorizacao', titulo: '[TESTE] autorização', driveId: '' });
  console.log('Aviso de teste enviado ao sistema de gestão.');
}

function avisarSistema_(aviso) {
  var resposta = UrlFetchApp.fetch(SISTEMA_RPC, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SISTEMA_CHAVE, Authorization: 'Bearer ' + SISTEMA_CHAVE },
    payload: JSON.stringify({ p_formulario: 'catalogo', p_chave: aviso.chave, p_titulo: aviso.titulo, p_drive_id: aviso.driveId || null }),
    muteHttpExceptions: true,
  });
  var codigo = resposta.getResponseCode();
  if (codigo >= 300) throw new Error('Sistema respondeu ' + codigo + ': ' + resposta.getContentText().slice(0, 200));
}
```

Em `backend_()`, acrescentar ao objeto devolvido:

```js
    notify: function (aviso) {
      try {
        avisarSistema_(aviso);
      } catch (err) {
        console.warn('Aviso ao sistema de gestão falhou: ' + (err && err.message ? err.message : err));
      }
    },
```

Em `abrirLoja_`, no objeto devolvido, primeira propriedade: `id: loja.getId(),`.

Em `apps-script/appsscript.json`, acrescentar `"https://www.googleapis.com/auth/script.external_request"` a `oauthScopes`.

- [ ] **Step 8: Rodar tudo**

Run: `npm test` e `npx tsc --noEmit`
Expected: PASS; sem erros.

- [ ] **Step 9: Commit**

```bash
git add server apps-script/Code.js apps-script/appsscript.json
git commit -m "Aviso ao sistema de gestão a cada catálogo concluído (aba Dados internos), sem afetar o envio"
```

### Task 14: Publicar o Apps Script do Catálogo e teste de ponta a ponta

- [ ] **Step 1: Enviar o código**

Run: `cd "C:/Users/Andre/Sistemas/Briefing E-Commerce" && npm run gas:push`
Expected: `Pushed 3 files`.

- [ ] **Step 2: Autorização (usuário)**

Pedir ao usuário: abrir `https://script.google.com/d/1MqQp3F-qCPp38wWR5fngmdVv_CqVTMUTjUGEu8Q1J2fE-OeGZMMRD5yx/edit`, executar `testarAviso` e aprovar. Conferir e apagar a linha `catalogo:teste-autorizacao` como na Task 12, Step 2.

- [ ] **Step 3: Trocar a versão no ar**

Run: `npx clasp update-deployment AKfycbzW1zwYg_u8fGkVeis0k1ycBHcN2I1NaxM9NNk5fAEGty7hKD_Qh6-YDkw5Oc9Ozhf-dg --description "Aviso ao sistema de gestão"`

- [ ] **Step 4: Envio de teste real**

Com `/dados-internos?aba=catalogo` aberto, rodar `node scripts/smoke.mjs https://script.google.com/macros/s/AKfycbzW1zwYg_u8fGkVeis0k1ycBHcN2I1NaxM9NNk5fAEGty7hKD_Qh6-YDkw5Oc9Ozhf-dg/exec` (lojas `[TESTE]` vão para `_teste`). Esperado: contador sobe no menu e na sub-aba; a lista da raiz não mostra `_teste`. Abrir a loja de teste pelo link direto: pegar o `drive_id` do aviso (`curl "$URL/rest/v1/formularios_envios?formulario=eq.catalogo&select=drive_id,titulo"`) e abrir `/dados-internos?aba=catalogo&pasta=<drive_id>`. Conferir: planilha como tabela, pasta Fotos em galeria agrupada por produto, ampliar com setas, ".zip" do produto e "Baixar pasta (.zip)" da loja (abrir o .zip: planilha `.xlsx` + `Fotos/…` com os originais).

- [ ] **Step 5: Limpeza**

`limparTestes()` no editor do Apps Script (usuário) e `DELETE` das linhas `[TESTE]` em `formularios_envios` (Task 12, Step 5).

- [ ] **Step 6: Push do repo**

```bash
git push
```

---

## Parte 5 — Briefings Estratégia e Negócios

### Task 15: Gatilho de aviso nos bancos dos briefings

**Files:**
- Create: `C:\Users\Andre\Sistemas\Briefing Negócios\briefingdenegocios\supabase\migrations\20260927130000_avisar_sistema_gestao.sql`
- Create: `C:\Users\Andre\Sistemas\Briefing Estratégia\briefingestrategia\supabase\migrations\20260927130000_avisar_sistema_gestao.sql`

**Interfaces:**
- Consumes: RPC da Task 1.
- Produces: gatilho `briefings_avisar_sistema_gestao` (AFTER UPDATE OF `exportado_drive_em`) → POST na RPC com `p_formulario` `negocios`/`estrategia`, `p_chave` `<formulario>:<briefings.id>`, `p_titulo` = nome base do `.txt`.

- [ ] **Step 1: Migration do Negócios**

```sql
-- Avisa o sistema de gestão (aba Dados internos) quando um briefing termina de ir para o Drive.
-- Assíncrono (pg_net): se o sistema estiver fora do ar, o briefing não é afetado.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.avisar_sistema_gestao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net'
AS $function$
DECLARE
  v_url    text := 'https://bnpvzguapunsztsdvmrs.supabase.co/rest/v1/rpc/registrar_envio_formulario';
  v_chave  text := '<colar aqui o valor de VITE_SUPABASE_PUBLISHABLE_KEY do .env do gestao-de-operacao>';
  v_titulo text;
BEGIN
  IF OLD.exportado_drive_em IS NULL AND NEW.exportado_drive_em IS NOT NULL THEN
    -- Mesmo nome base que processar-briefing usa no .txt deste projeto
    v_titulo := coalesce(nullif(btrim(NEW.empresa), ''), nullif(btrim(NEW.nome), ''), 'briefing-' || NEW.id::text);
    BEGIN
      PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_chave, 'Authorization', 'Bearer ' || v_chave),
        body    := jsonb_build_object('p_formulario', 'negocios', 'p_chave', 'negocios:' || NEW.id::text, 'p_titulo', v_titulo, 'p_drive_id', NULL)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'avisar_sistema_gestao falhou: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS briefings_avisar_sistema_gestao ON public.briefings;
CREATE TRIGGER briefings_avisar_sistema_gestao
  AFTER UPDATE OF exportado_drive_em ON public.briefings
  FOR EACH ROW EXECUTE FUNCTION public.avisar_sistema_gestao();
```

- [ ] **Step 2: Migration da Estratégia**

O mesmo arquivo, com três trocas: `'negocios'` → `'estrategia'` (duas vezes: `p_formulario` e o prefixo da `p_chave`) e o fim do `coalesce` do título `'briefing-' || NEW.id::text` → `'Lead'` (nome base do `processar-briefing` da Estratégia).

- [ ] **Step 3: Aplicar nos dois projetos Lovable**

Descobrir o id de cada projeto Lovable (página inicial do Lovable, projetos "briefingdenegocios" e "briefingestrategia") e aplicar cada SQL em `…?view=more&subview=cloud&section=sql` (mesmo método da Task 1; aparece "Run anyway" por causa do `DROP TRIGGER`). Conferir em cada um:

```sql
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.briefings'::regclass AND NOT tgisinternal;
```
Expected: lista inclui `briefings_avisar_sistema_gestao` (além dos gatilhos antigos).

- [ ] **Step 4: Commit e push em cada repo**

```bash
cd "C:/Users/Andre/Sistemas/Briefing Negócios/briefingdenegocios" && git add supabase/migrations/20260927130000_avisar_sistema_gestao.sql && git commit -m "Avisa o sistema de gestão quando o briefing chega ao Drive" && git push
cd "C:/Users/Andre/Sistemas/Briefing Estratégia/briefingestrategia" && git add supabase/migrations/20260927130000_avisar_sistema_gestao.sql && git commit -m "Avisa o sistema de gestão quando o briefing chega ao Drive" && git push
```

### Task 16: Teste de ponta a ponta dos briefings

- [ ] **Step 1: Envio de teste em cada formulário**

Com `/dados-internos?aba=negocios` aberto, preencher `https://negocios.andrelopes.digital/` no Chrome com nome/empresa `[TESTE] Claude` (só os campos obrigatórios) e concluir. Esperado em até ~1 min (o fluxo deles leva alguns segundos até o Drive): `.txt` `[TESTE] Claude - AAAA-MM-DD HH-MM-SS.txt` no topo com selo "Novo"; contador no menu e na sub-aba; abrir mostra perguntas e respostas e zera o contador. Repetir em `https://estrategia.andrelopes.digital/` com `/dados-internos?aba=estrategia`.

- [ ] **Step 2: Limpeza (só com o ok do usuário)**

Perguntar ao usuário antes. Com o ok: mandar os dois `.txt` `[TESTE] Claude …` para a lixeira (Drive, conta contato@), apagar as linhas de teste de `briefings` nos dois projetos (SQL editor: `DELETE FROM public.briefings WHERE empresa = '[TESTE] Claude' OR nome = '[TESTE] Claude';`) e as linhas `[TESTE]` de `formularios_envios` do sistema.

- [ ] **Step 3: Registrar**

Atualizar a memória `dados-internos` (tudo no ar, como testar, onde ficam os gatilhos) e o `MEMORY.md`.
