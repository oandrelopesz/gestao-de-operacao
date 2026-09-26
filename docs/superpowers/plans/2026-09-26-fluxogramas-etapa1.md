# Fluxogramas — Etapa 1 (base, quadro, formas extras, salvamento) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba Fluxogramas com lista de quadros e editor Excalidraw (traço limpo, pt-BR, tema do app), formas extras (funil, cone, cilindro, pirâmide, trapézio, triângulo, hexágono, estrela, chevron, nuvem) e cards prontos num painel, imagens no Storage e salvamento automático no banco.

**Architecture:** Regras puras em `src/lib/fluxo*.ts` (geometria das formas e serialização da cena), camada de dados `src/lib/fluxosDados.ts` (Supabase + Storage), editor em `src/components/fluxos/` carregado só no navegador (`import()` dinâmico do Excalidraw), rotas `/fluxogramas` (lista) e `/fluxogramas/$id` (editor).

**Tech Stack:** @excalidraw/excalidraw 0.18.1, React 19, TanStack Router, Supabase JS, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-26-fluxogramas-design.md` (§3, §4, §5; etapas 2–5 têm planos próprios)

## Global Constraints

- Dependências: só as instaladas pelo Lovable (`@excalidraw/excalidraw@0.18.1`, `jspdf@4.2.1`, `svg2pdf.js@2.8.1`, `pptxgenjs@4.0.1`, `docx@9.7.2`). Nada mais no `package.json`.
- Excalidraw nunca no SSR nem no pacote principal: só via `import("@excalidraw/excalidraw")` dentro de efeito/componente cliente; o CSS `@excalidraw/excalidraw/index.css` é importado no mesmo módulo carregado sob demanda.
- Libs puras: sem `@/`, imports relativos com `.ts`, `import type` para tipos, sem enum e sem parameter properties (o Node tira os tipos sem transpilar).
- Tabelas novas fora do `types.ts`: usar `supabase as any`.
- Textos em pt-BR; nada de `window.confirm` (AlertDialog); celular sem rolagem lateral.
- Commits em português com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Migration

**Files:** Create `supabase/migrations/20260926210000_fluxogramas.sql`

- [ ] **Step 1: Escrever**

<!-- arquivo: supabase/migrations/20260926210000_fluxogramas.sql -->
```sql
-- Aba Fluxogramas: quadros (cena do Excalidraw), temas, vínculos com Demandas/Roadmap e bucket das imagens.
CREATE TABLE IF NOT EXISTS public.fluxo_temas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  hex TEXT NOT NULL DEFAULT '#64748b',
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.fluxos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL DEFAULT 'Sem título',
  tema_id UUID REFERENCES public.fluxo_temas(id) ON DELETE SET NULL,
  cena JSONB NOT NULL DEFAULT '{}'::jsonb,
  textos TEXT NOT NULL DEFAULT '',
  miniatura TEXT,
  modelo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fluxos_tema_idx ON public.fluxos(tema_id);
CREATE TABLE IF NOT EXISTS public.fluxo_vinculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id UUID NOT NULL REFERENCES public.fluxos(id) ON DELETE CASCADE,
  elemento_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('demanda', 'roadmap_passo')),
  alvo_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fluxo_vinculos_unico ON public.fluxo_vinculos(fluxo_id, elemento_id, tipo, alvo_id);
CREATE INDEX IF NOT EXISTS fluxo_vinculos_alvo_idx ON public.fluxo_vinculos(tipo, alvo_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fluxo_temas', 'fluxos', 'fluxo_vinculos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_all') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)', t || '_all', t);
    END IF;
  END LOOP;
END $$;

-- Imagens coladas nos quadros (privado; o editor lê por URL assinada)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('fluxogramas', 'fluxogramas', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fluxogramas_select') THEN
    CREATE POLICY "fluxogramas_select" ON storage.objects FOR SELECT USING (bucket_id = 'fluxogramas');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fluxogramas_insert') THEN
    CREATE POLICY "fluxogramas_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'fluxogramas');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fluxogramas_update') THEN
    CREATE POLICY "fluxogramas_update" ON storage.objects FOR UPDATE USING (bucket_id = 'fluxogramas') WITH CHECK (bucket_id = 'fluxogramas');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fluxogramas_delete') THEN
    CREATE POLICY "fluxogramas_delete" ON storage.objects FOR DELETE USING (bucket_id = 'fluxogramas');
  END IF;
END $$;
```

- [ ] **Step 2:** Aplicar pelo editor SQL do Lovable (método da memória `supabase-migrations-manual`) e conferir pela API REST (`fluxos?select=id&limit=1` → `[]`). Commit.

---

### Task 2: Geometria das formas extras

**Files:** Create `src/lib/fluxoFormas.ts`, Test `src/lib/fluxoFormas.test.ts`

**Interfaces (Produces):** `type FormaExtra`, `FORMAS_EXTRAS: { id; rotulo; largura; altura; etapas? }[]`, `type Peca = { tipo: "poligono"; x; y; pontos: [number, number][] } | { tipo: "elipse"; x; y; largura; altura } | { tipo: "texto"; x; y; largura; texto }`, `pecasDa(forma, x, y, opcoes?: { largura?; altura?; etapas?; rotulos? }): Peca[]`.

- [ ] **Step 1: Testes**

<!-- arquivo: src/lib/fluxoFormas.test.ts -->
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { FORMAS_EXTRAS, pecasDa, type Peca } from "./fluxoFormas.ts";

const poligonos = (p: Peca[]) => p.filter((x): x is Extract<Peca, { tipo: "poligono" }> => x.tipo === "poligono");

test("todo polígono é fechado, começa em (0,0) e fica dentro da caixa", () => {
  for (const f of FORMAS_EXTRAS) {
    const x0 = 100, y0 = 50;
    const pecas = pecasDa(f.id, x0, y0);
    assert.ok(pecas.length > 0, f.id);
    for (const p of poligonos(pecas)) {
      assert.deepEqual(p.pontos[0], [0, 0], `${f.id}: 1º ponto`);
      assert.deepEqual(p.pontos[p.pontos.length - 1], [0, 0], `${f.id}: fechado`);
      for (const [px, py] of p.pontos) {
        assert.ok(p.x + px >= x0 - 0.01 && p.x + px <= x0 + f.largura + 0.01, `${f.id}: x fora`);
        assert.ok(p.y + py >= y0 - 0.01 && p.y + py <= y0 + f.altura + 0.01, `${f.id}: y fora`);
      }
    }
  }
});

test("funil: N etapas cada vez mais estreitas, com rótulos", () => {
  const pecas = pecasDa("funil", 0, 0, { largura: 400, altura: 300, etapas: 5, rotulos: ["Atrair", "Captar"] });
  const ps = poligonos(pecas);
  assert.equal(ps.length, 5);
  const larguraTopo = (p: (typeof ps)[number]) => Math.abs(p.pontos[1][0] - p.pontos[0][0]);
  for (let i = 1; i < ps.length; i++) assert.ok(larguraTopo(ps[i]) < larguraTopo(ps[i - 1]));
  const textos = pecas.filter((p) => p.tipo === "texto").map((p) => (p as { texto: string }).texto);
  assert.deepEqual(textos, ["Atrair", "Captar", "Etapa 3", "Etapa 4", "Etapa 5"]);
});

test("pirâmide começa em ponta; cone e cilindro têm elipse", () => {
  const pir = poligonos(pecasDa("piramide", 0, 0, { etapas: 3 }));
  assert.equal(pir.length, 3);
  assert.equal(pir[0].pontos.length, 4); // triângulo: 3 pontos + fechamento
  assert.ok(pecasDa("cone", 0, 0).some((p) => p.tipo === "elipse"));
  assert.ok(pecasDa("cilindro", 0, 0).some((p) => p.tipo === "elipse"));
});

test("estrela tem 5 pontas e tamanho próprio respeita as opções", () => {
  const [estrela] = poligonos(pecasDa("estrela", 0, 0, { largura: 200, altura: 200 }));
  assert.equal(estrela.pontos.length, 11);
  const [tri] = poligonos(pecasDa("triangulo", 10, 10, { largura: 80, altura: 60 }));
  const xs = tri.pontos.map(([x]) => tri.x + x);
  assert.equal(Math.max(...xs) - Math.min(...xs), 80);
});
```

- [ ] **Step 2:** `npm test` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

<!-- arquivo: src/lib/fluxoFormas.ts -->
```ts
// Formas extras do quadro (funil, cone, cilindro…): geometria pura em "peças" que o editor converte em elementos do
// Excalidraw — polígono fechado (linha cujo último ponto repete o primeiro, preenchível), elipse e texto. Sem dependências.

export type FormaExtra =
  | "funil" | "piramide" | "cone" | "cilindro" | "trapezio" | "triangulo" | "hexagono" | "estrela" | "chevron" | "nuvem";

export type Peca =
  | { tipo: "poligono"; x: number; y: number; pontos: [number, number][] }
  | { tipo: "elipse"; x: number; y: number; largura: number; altura: number }
  | { tipo: "texto"; x: number; y: number; largura: number; texto: string };

export const FORMAS_EXTRAS: { id: FormaExtra; rotulo: string; largura: number; altura: number; etapas?: number }[] = [
  { id: "funil", rotulo: "Funil", largura: 360, altura: 300, etapas: 4 },
  { id: "piramide", rotulo: "Pirâmide", largura: 320, altura: 280, etapas: 3 },
  { id: "cone", rotulo: "Cone", largura: 180, altura: 220 },
  { id: "cilindro", rotulo: "Cilindro", largura: 160, altura: 200 },
  { id: "trapezio", rotulo: "Trapézio", largura: 220, altura: 120 },
  { id: "triangulo", rotulo: "Triângulo", largura: 200, altura: 170 },
  { id: "hexagono", rotulo: "Hexágono", largura: 200, altura: 170 },
  { id: "estrela", rotulo: "Estrela", largura: 200, altura: 190 },
  { id: "chevron", rotulo: "Etapa (chevron)", largura: 220, altura: 100 },
  { id: "nuvem", rotulo: "Nuvem", largura: 240, altura: 150 },
];

type P = [number, number];

/** Polígono em coordenadas da caixa → peça com o 1º ponto em (0,0) e fechada. */
function poligono(x0: number, y0: number, pts: P[]): Peca {
  const [ax, ay] = pts[0];
  const rel = pts.map(([px, py]) => [round(px - ax), round(py - ay)] as P);
  return { tipo: "poligono", x: round(x0 + ax), y: round(y0 + ay), pontos: [...rel, [0, 0]] };
}

const round = (n: number) => Math.round(n * 100) / 100;

function elipseAmostrada(cx: number, cy: number, rx: number, ry: number, de: number, ate: number, passos: number): P[] {
  return Array.from({ length: passos + 1 }, (_, i) => {
    const a = de + ((ate - de) * i) / passos;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as P;
  });
}

/** Faixas empilhadas de um triângulo cortado (funil = ponta embaixo; pirâmide = ponta em cima). */
function faixas(x0: number, y0: number, W: number, H: number, n: number, pontaEmCima: boolean, rotulos: string[]): Peca[] {
  const vao = 6;
  const h = (H - vao * (n - 1)) / n;
  const largura = (yFrac: number) => (pontaEmCima ? W * yFrac : W * (1 - 0.72 * yFrac));
  const pecas: Peca[] = [];
  for (let i = 0; i < n; i++) {
    const topo = i * (h + vao);
    const base = topo + h;
    const wT = largura(topo / H);
    const wB = largura(base / H);
    const pts: P[] = wT < 0.5
      ? [[W / 2, topo], [(W + wB) / 2, base], [(W - wB) / 2, base]]
      : [[(W - wT) / 2, topo], [(W + wT) / 2, topo], [(W + wB) / 2, base], [(W - wB) / 2, base]];
    pecas.push(poligono(x0, y0, pts));
  }
  for (let i = 0; i < n; i++) {
    const topo = i * (h + vao);
    pecas.push({ tipo: "texto", x: round(x0), y: round(y0 + topo + h / 2 - 10), largura: W, texto: rotulos[i] ?? `Etapa ${i + 1}` });
  }
  return pecas;
}

export function pecasDa(
  forma: FormaExtra,
  x0: number,
  y0: number,
  opcoes: { largura?: number; altura?: number; etapas?: number; rotulos?: string[] } = {},
): Peca[] {
  const padrao = FORMAS_EXTRAS.find((f) => f.id === forma)!;
  const W = opcoes.largura ?? padrao.largura;
  const H = opcoes.altura ?? padrao.altura;
  const n = Math.max(2, Math.min(8, opcoes.etapas ?? padrao.etapas ?? 4));
  const rotulos = opcoes.rotulos ?? [];
  switch (forma) {
    case "funil":
      return faixas(x0, y0, W, H, n, false, rotulos);
    case "piramide":
      return faixas(x0, y0, W, H, n, true, rotulos);
    case "cone": {
      const eh = H * 0.18;
      return [
        poligono(x0, y0, [[W / 2, 0], [W, H - eh / 2], [0, H - eh / 2]]),
        { tipo: "elipse", x: round(x0), y: round(y0 + H - eh), largura: W, altura: round(eh) },
      ];
    }
    case "cilindro": {
      const eh = H * 0.2;
      const fundo = elipseAmostrada(W / 2, H - eh / 2, W / 2, eh / 2, Math.PI, 0, 16).reverse();
      return [
        poligono(x0, y0, [[0, eh / 2], [0, H - eh / 2], ...fundo.slice(1, -1), [W, H - eh / 2], [W, eh / 2]]),
        { tipo: "elipse", x: round(x0), y: round(y0), largura: W, altura: round(eh) },
      ];
    }
    case "trapezio":
      return [poligono(x0, y0, [[W * 0.2, 0], [W * 0.8, 0], [W, H], [0, H]])];
    case "triangulo":
      return [poligono(x0, y0, [[W / 2, 0], [W, H], [0, H]])];
    case "hexagono":
      return [poligono(x0, y0, [[W * 0.25, 0], [W * 0.75, 0], [W, H / 2], [W * 0.75, H], [W * 0.25, H], [0, H / 2]])];
    case "estrela": {
      const pts: P[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 1 : 0.42;
        pts.push([W / 2 + (W / 2) * r * Math.cos(a), H * 0.53 + H * 0.5 * r * Math.sin(a)]);
      }
      // Encaixa na caixa (a estrela não encosta embaixo)
      const ys = pts.map(([, y]) => y);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      return [poligono(x0, y0, pts.map(([x, y]) => [x, ((y - minY) / (maxY - minY)) * H] as P))];
    }
    case "chevron":
      return [poligono(x0, y0, [[0, 0], [W * 0.8, 0], [W, H / 2], [W * 0.8, H], [0, H], [W * 0.2, H / 2]])];
    case "nuvem": {
      const pts: P[] = [];
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const r = 0.86 + 0.14 * Math.abs(Math.sin(4 * a));
        pts.push([W / 2 + (W / 2) * r * Math.cos(a), H / 2 + (H / 2) * r * Math.sin(a)]);
      }
      return [poligono(x0, y0, pts)];
    }
  }
}
```

- [ ] **Step 4:** `npm test` → PASS. **Step 5:** Commit.

---

### Task 3: Serialização da cena

**Files:** Create `src/lib/fluxoCena.ts`, Test `src/lib/fluxoCena.test.ts`

**Interfaces (Produces):** `interface ArquivoSalvo { caminho: string; mimeType: string }`, `interface CenaSalva { elements: ElementoMinimo[]; appState: { viewBackgroundColor?: string; gridSize?: number | null; gridModeEnabled?: boolean }; arquivos: Record<string, ArquivoSalvo> }`, `type ElementoMinimo = { id: string; type: string; version: number; isDeleted?: boolean; text?: string; fileId?: string | null; [k: string]: unknown }`, `cenaVazia()`, `lerCena(json: unknown): CenaSalva`, `montarCena(elements, appState, arquivos): CenaSalva`, `arquivosUsados(elements): Set<string>`, `arquivosParaSubir(files: Record<string, { mimeType: string }>, salvos, usados): string[]`, `arquivosParaApagar(salvos, usados): { id; caminho }[]`, `textosDaCena(elements): string`, `assinaturaDaCena(elements): string`, `extensaoDoMime(mime): string`, `centroDaTela(appState): { x; y }`.

- [ ] **Step 1: Testes**

<!-- arquivo: src/lib/fluxoCena.test.ts -->
```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  arquivosParaApagar, arquivosParaSubir, arquivosUsados, assinaturaDaCena, centroDaTela, extensaoDoMime, lerCena, montarCena, textosDaCena,
} from "./fluxoCena.ts";

const els = [
  { id: "a", type: "rectangle", version: 3 },
  { id: "b", type: "text", version: 2, text: "Olá mundo" },
  { id: "c", type: "image", version: 1, fileId: "f1" },
  { id: "d", type: "image", version: 5, fileId: "f2", isDeleted: true },
  { id: "e", type: "text", version: 1, text: "apagado", isDeleted: true },
];

test("montarCena tira apagados e guarda só o essencial do appState", () => {
  const c = montarCena(els, { viewBackgroundColor: "#fff", gridSize: 20, zoom: { value: 2 }, scrollX: 10 }, { f1: { caminho: "x/f1.png", mimeType: "image/png" } });
  assert.deepEqual(c.elements.map((e) => e.id), ["a", "b", "c"]);
  assert.deepEqual(c.appState, { viewBackgroundColor: "#fff", gridSize: 20, gridModeEnabled: false });
  assert.deepEqual(Object.keys(c.arquivos), ["f1"]);
});

test("lerCena aceita vazio e lixo", () => {
  assert.deepEqual(lerCena(null), { elements: [], appState: {}, arquivos: {} });
  assert.deepEqual(lerCena({ elements: "x" }), { elements: [], appState: {}, arquivos: {} });
  assert.equal(lerCena({ elements: [{ id: "a", type: "text", version: 1 }] }).elements.length, 1);
});

test("arquivos: usados, a subir e a apagar", () => {
  const usados = arquivosUsados(els);
  assert.deepEqual([...usados], ["f1"]);
  assert.deepEqual(arquivosParaSubir({ f1: { mimeType: "image/png" }, f3: { mimeType: "image/png" } }, {}, new Set(["f1", "f3"])), ["f1", "f3"]);
  assert.deepEqual(arquivosParaSubir({ f1: { mimeType: "image/png" } }, { f1: { caminho: "q/f1.png", mimeType: "image/png" } }, usados), []);
  assert.deepEqual(arquivosParaApagar({ f1: { caminho: "q/f1.png", mimeType: "image/png" }, f9: { caminho: "q/f9.png", mimeType: "image/png" } }, usados), [{ id: "f9", caminho: "q/f9.png" }]);
});

test("textos para busca, assinatura e utilidades", () => {
  assert.equal(textosDaCena(els), "Olá mundo");
  assert.notEqual(assinaturaDaCena(els), assinaturaDaCena([...els, { id: "z", type: "text", version: 1 }]));
  assert.equal(assinaturaDaCena(els), assinaturaDaCena(els.map((e) => ({ ...e }))));
  assert.equal(extensaoDoMime("image/jpeg"), "jpg");
  assert.equal(extensaoDoMime("image/svg+xml"), "svg");
  assert.equal(extensaoDoMime("application/x"), "bin");
  assert.deepEqual(centroDaTela({ scrollX: -100, scrollY: -50, width: 800, height: 600, zoom: { value: 2 } }), { x: 300, y: 200 });
});
```

- [ ] **Step 2:** `npm test` → FAIL.

- [ ] **Step 3: Implementar**

<!-- arquivo: src/lib/fluxoCena.ts -->
```ts
// Cena dos quadros (formato do Excalidraw) ↔ o que vai para o banco: elementos vivos, poucas opções de tela e o mapa
// das imagens guardadas no Storage (o conteúdo das imagens nunca vai para o JSON). Sem dependências.

export type ElementoMinimo = {
  id: string;
  type: string;
  version: number;
  isDeleted?: boolean;
  text?: string;
  fileId?: string | null;
  [k: string]: unknown;
};

export interface ArquivoSalvo {
  caminho: string;
  mimeType: string;
}

export interface CenaSalva {
  elements: ElementoMinimo[];
  appState: { viewBackgroundColor?: string; gridSize?: number | null; gridModeEnabled?: boolean };
  arquivos: Record<string, ArquivoSalvo>;
}

export function cenaVazia(): CenaSalva {
  return { elements: [], appState: {}, arquivos: {} };
}

export function lerCena(json: unknown): CenaSalva {
  const c = (json && typeof json === "object" ? json : {}) as Partial<CenaSalva>;
  return {
    elements: Array.isArray(c.elements) ? (c.elements as ElementoMinimo[]) : [],
    appState: c.appState && typeof c.appState === "object" ? c.appState : {},
    arquivos: c.arquivos && typeof c.arquivos === "object" ? c.arquivos : {},
  };
}

export function arquivosUsados(elements: readonly ElementoMinimo[]): Set<string> {
  return new Set(elements.filter((e) => !e.isDeleted && e.type === "image" && e.fileId).map((e) => e.fileId as string));
}

export function montarCena(
  elements: readonly ElementoMinimo[],
  appState: { viewBackgroundColor?: string; gridSize?: number | null; gridModeEnabled?: boolean; [k: string]: unknown },
  arquivos: Record<string, ArquivoSalvo>,
): CenaSalva {
  const usados = arquivosUsados(elements);
  return {
    elements: elements.filter((e) => !e.isDeleted),
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridSize: appState.gridSize ?? null,
      gridModeEnabled: !!appState.gridModeEnabled,
    },
    arquivos: Object.fromEntries(Object.entries(arquivos).filter(([id]) => usados.has(id))),
  };
}

/** Imagens que estão no quadro e ainda não foram para o Storage. */
export function arquivosParaSubir(
  files: Record<string, { mimeType: string }>,
  salvos: Record<string, ArquivoSalvo>,
  usados: Set<string>,
): string[] {
  return Object.keys(files).filter((id) => usados.has(id) && !salvos[id]);
}

/** Imagens guardadas que saíram do quadro. */
export function arquivosParaApagar(salvos: Record<string, ArquivoSalvo>, usados: Set<string>): { id: string; caminho: string }[] {
  return Object.entries(salvos).filter(([id]) => !usados.has(id)).map(([id, a]) => ({ id, caminho: a.caminho }));
}

/** Textos do quadro (para a busca da lista). */
export function textosDaCena(elements: readonly ElementoMinimo[]): string {
  return elements
    .filter((e) => !e.isDeleted && typeof e.text === "string" && e.text.trim())
    .map((e) => (e.text as string).trim())
    .join("\n");
}

/** Muda quando algum elemento muda (para saber se precisa salvar). */
export function assinaturaDaCena(elements: readonly ElementoMinimo[]): string {
  let soma = 0;
  for (const e of elements) soma += (e.version ?? 0) * (e.isDeleted ? 3 : 1);
  return `${elements.length}:${soma}`;
}

export function extensaoDoMime(mime: string): string {
  const mapa: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif",
  };
  return mapa[mime] ?? "bin";
}

/** Centro da parte visível do quadro, em coordenadas da cena. */
export function centroDaTela(a: { scrollX: number; scrollY: number; width: number; height: number; zoom: { value: number } }): { x: number; y: number } {
  return { x: -a.scrollX + a.width / 2 / a.zoom.value, y: -a.scrollY + a.height / 2 / a.zoom.value };
}
```

- [ ] **Step 4:** `npm test` → PASS. **Step 5:** Commit.

---

### Task 4: Dependências do Lovable e camada de dados

**Files:** Create `src/lib/fluxosDados.ts`; `git pull` do commit do Lovable.

- [ ] **Step 1:** Esperar o Lovable terminar a instalação pedida no chat; `git pull`; conferir que o diff do commit dele só tocou `package.json`/`bun.lockb` (se tocou outro arquivo, reverter aquele arquivo e registrar). `npm install --package-lockfile=false` localmente para ter os pacotes em `node_modules` (sem commitar lock do npm). Ler `node_modules/@excalidraw/excalidraw/dist/types/excalidraw/index.d.ts` para confirmar os nomes: `Excalidraw`, `convertToExcalidrawElements`, `exportToBlob`, `exportToSvg`, `Sidebar`, `MainMenu`, `WelcomeScreen`, `CaptureUpdateAction`, `FONT_FAMILY`.
- [ ] **Step 2: `fluxosDados.ts`** — funções (todas com `supabase as any`):
  - `listarFluxos(): Promise<FluxoResumo[]>` (`id, titulo, tema_id, miniatura, textos, updated_at, created_at`, ordem `updated_at desc`).
  - `carregarFluxo(id): Promise<Fluxo>` (tudo, `cena` passada por `lerCena`).
  - `criarFluxo({ titulo, tema_id, cena?, modelo? }): Promise<Fluxo>`.
  - `salvarFluxo(id, { cena, textos, miniatura? }, updatedAtCarregado): Promise<{ updated_at: string } | { conflito: true }>` — antes de gravar, lê o `updated_at` atual; se for mais novo que o carregado, devolve `{ conflito: true }`.
  - `renomearFluxo`, `moverFluxo(id, tema_id)`, `duplicarFluxo(id)` (copia cena; imagens copiadas no Storage com `copy`), `excluirFluxo(id)` (apaga a pasta `<id>/` do bucket e a linha).
  - `subirImagem(fluxoId, fileId, dataURL, mimeType): Promise<ArquivoSalvo>` (bucket `fluxogramas`, caminho `<fluxoId>/<fileId>.<ext>`, `upsert: true`).
  - `baixarImagens(arquivos): Promise<{ id; dataURL; mimeType }[]>` (URL assinada 60 s → fetch → dataURL; falha de uma não derruba as outras).
  - `apagarImagens(caminhos)`.
  - Temas: `listarTemasFluxo`, `salvarTemaFluxo`, `excluirTemaFluxo` (mesmo formato dos temas de Links/Notas).
- [ ] **Step 3:** `npx tsc --noEmit` → 0 erros. Commit.

---

### Task 5: Editor (Excalidraw) com salvamento automático

**Files:** Create `src/components/fluxos/EditorFluxo.tsx` (carregado por `import()`), `src/components/fluxos/QuadroExcalidraw.tsx` (módulo que importa o Excalidraw e o CSS), `src/routes/_authenticated/fluxogramas.$id.tsx`.

- [ ] **Step 1: `QuadroExcalidraw.tsx`** — `import { Excalidraw, ... } from "@excalidraw/excalidraw"; import "@excalidraw/excalidraw/index.css";` e exporta o componente `QuadroExcalidraw({ inicial, tema, onPronto, onMudou, painel })`:
  - `initialData = { elements: inicial.elements, appState: { ...inicial.appState, currentItemRoughness: 0, currentItemFontFamily: FONT_FAMILY.Nunito, currentItemStrokeWidth: 2, currentItemRoundness: "round" }, files: {} , scrollToContent: true }`.
  - `langCode="pt-BR"`, `theme={tema}` (`useTheme()` do app), `excalidrawAPI={onPronto}`, `onChange={(elements, appState, files) => onMudou(elements, appState, files)}`.
  - `UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } }}` (a exportação é nossa, etapa 3).
  - `renderTopRightUI` com o botão que abre o painel "Gestor Pro" (Task 6) e o `<Sidebar name="gestor">` como filho.
- [ ] **Step 2: `EditorFluxo.tsx`** — recebe `fluxoId`:
  - Carrega o fluxo (`carregarFluxo`) e as imagens (`baixarImagens`), mostra esqueleto enquanto isso; quando a API do Excalidraw fica pronta, `api.addFiles(imagens)`.
  - Barra superior própria (48 px): voltar (`/fluxogramas`), título editável (salva ao sair do campo), estado "Salvando…/Salvo às hh:mm/Erro — tentar de novo", botão Tela cheia (`document.documentElement.requestFullscreen()` no contêiner do editor), botões Exportar e Apresentar desabilitados com dica "Na próxima etapa".
  - Salvamento: a cada `onChange`, se `assinaturaDaCena` mudou, agenda salvar em 1,5 s (debounce); salvar = sobe imagens novas (`arquivosParaSubir`), monta `montarCena`, `textosDaCena`, chama `salvarFluxo`; apaga imagens que saíram (`arquivosParaApagar`) depois de salvar; miniatura (`exportToBlob` PNG, `maxWidthOrHeight: 480`, dataURL) no máximo a cada 20 s e ao sair. Também salva em `visibilitychange` (oculta) e no desmontar. Conflito → AlertDialog "Este quadro foi alterado em outro aparelho" com "Recarregar" e "Manter o meu e salvar por cima".
  - Contêiner ocupa a área do conteúdo sem o padding do layout: `-m-4 lg:-m-8 h-[calc(100dvh-3.5rem)] max-lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-5.5rem-env(safe-area-inset-bottom))]`.
- [ ] **Step 3: Rota** `src/routes/_authenticated/fluxogramas.$id.tsx`: `createFileRoute("/_authenticated/fluxogramas/$id")`, componente que faz `lazy(() => import("@/components/fluxos/EditorFluxo"))` dentro de `Suspense` e só no cliente (`typeof window !== "undefined"` + estado montado).
- [ ] **Step 4:** `npx tsc --noEmit`, `npx vite build` (conferir que o Excalidraw ficou num chunk separado e fora do `main-*.js`). Commit.

---

### Task 6: Painel "Gestor Pro" (formas extras e cards)

**Files:** Create `src/components/fluxos/PainelGestor.tsx`, `src/components/fluxos/inserir.ts`

- [ ] **Step 1: `inserir.ts`** — `pecasParaEsqueletos(pecas, estilo)` converte `Peca[]` em esqueletos do Excalidraw: polígono → `{ type: "line", x, y, points, backgroundColor, fillStyle: "solid", strokeColor, strokeWidth: 2, roughness: 0 }`; elipse → `{ type: "ellipse", ... }`; texto → `{ type: "text", x, y, text, fontSize: 18, textAlign: "center", width }`. Todas as peças de uma forma recebem o mesmo `groupIds: [uuid]`. `inserirNoCentro(api, esqueletos)`: `convertToExcalidrawElements`, desloca para `centroDaTela(api.getAppState())` (centro da caixa da forma no centro da tela), `api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...novos], appState: { selectedElementIds: {...} }, captureUpdate: CaptureUpdateAction.IMMEDIATELY })`.
- [ ] **Step 2: `PainelGestor.tsx`** (dentro do `<Sidebar name="gestor" docked>`), abas:
  - **Formas**: grade com miniatura (SVG desenhado a partir de `pecasDa` em escala) e nome de cada `FORMAS_EXTRAS`; funil e pirâmide com seletor de etapas (2–8). Clique insere no centro. Cor de preenchimento escolhida num seletor de 8 cores (padrão azul claro) antes de inserir.
  - **Cards**: card arredondado, card quadrado, post-it (fundo `#fff3a3`, sem borda), card de etapa (título + descrição agrupados), rótulo/etiqueta (pílula). Usam retângulo nativo com `label` (texto dentro) e `roundness` redonda ou reta.
  - Abas **Mapa mental**, **Modelos**, **Vínculos**: texto "Chega nas próximas etapas" (etapas 2, 4 e 5).
- [ ] **Step 3:** Commit.

---

### Task 7: Lista, temas, menu e rotas

**Files:** Create `src/routes/_authenticated/fluxogramas.index.tsx`, `src/components/fluxos/TemasFluxo.tsx`; Modify `src/lib/nav.tsx`, `src/lib/buscaAbas.test.ts` (se preciso), regenerar `src/routeTree.gen.ts`.

- [ ] **Step 1:** Menu: grupo Ferramentas, `{ label: "Fluxogramas", icon: <Workflow size={17} />, to: "/fluxogramas", palavras: ["mapa mental", "miro", "quadro", "board", "funil", "diagrama", "canvas"] }`.
- [ ] **Step 2: Lista** (`/fluxogramas`) no estilo da aba Notas: cabeçalho "Fluxogramas / Quadros, funis e mapas mentais", botões "Temas" e "Novo quadro"; busca (título + `textos`); chips de tema; grade `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` de cards com miniatura (`aspect-video object-contain bg-muted`), título, tema, "editado há…"; menu ⋮ com Abrir, Renomear, Duplicar, Mover de tema, Excluir (AlertDialog "Excluir o quadro e as imagens dele?"). Vazio: ícone + "Nenhum quadro ainda" + botão.
- [ ] **Step 3: Novo quadro**: janela com nome (opcional → "Sem título"), tema e modelo (nesta etapa: "Em branco"); cria e navega para `/fluxogramas/<id>`.
- [ ] **Step 4:** `TemasFluxo.tsx` reaproveita o componente de temas de Notas/Links (`TemasLista`) com as funções `listarTemasFluxo/salvarTemaFluxo/excluirTemaFluxo`.
- [ ] **Step 5:** `npx vite build` (regenera `routeTree.gen.ts`), `npx tsc --noEmit`, `npm test`. Commit.

---

### Task 8: Verificação e publicação

- [ ] **Step 1: Navegador (servidor local, banco real):** criar quadro "TESTE CLAUDE — fluxo"; inserir cada forma extra (funil 5 etapas, pirâmide, cone, cilindro, trapézio, triângulo, hexágono, estrela, chevron, nuvem) e cada card; redimensionar uma com o mouse; ligar dois cards com seta (presa) e mover um card (seta acompanha); desenhar com a caneta; colar uma imagem; esperar "Salvo"; recarregar a página → tudo igual e a imagem aparece; miniatura aparece na lista; renomear, duplicar (imagem copiada), excluir o duplicado; tema escuro e claro; celular 390 px (auditoria) sem rolagem lateral.
- [ ] **Step 2:** Apagar o quadro de teste (e a pasta dele no bucket).
- [ ] **Step 3:** `git push`; publicar no Lovable; conferir no site que `/fluxogramas` abre e que o Excalidraw carrega.
- [ ] **Step 4:** Memória `fluxogramas.md` + linha no `MEMORY.md`.
