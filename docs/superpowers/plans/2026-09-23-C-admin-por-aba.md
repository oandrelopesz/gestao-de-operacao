# Plano C — Admin por aba e menu lateral configurável

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A página Admin passa a controlar cada aba do sistema. Cada aba tem sua seção, o menu lateral fica configurável e passam a ser editáveis os tipos do Ver depois, a meta de leitura dos Livros e o tamanho máximo dos PDFs. As configurações de Onboarding e Roadmap entram na seção de cada um.

**Architecture:**
- **Configurações:** ficam na tabela `app_config` (Plano A), lidas com `useConfig`/`getConfig` de `src/lib/appConfig.ts`.
- **Admin:** o `admin.tsx` (hoje ~1080 linhas) vira uma casca com `Tabs`. Os cards existentes são movidos, sem reescrever, para seções, e os novos entram como componentes em `src/components/admin/`.
- **Ver depois:** os tipos passam para a tabela `ver_depois_tipos`.
- **Menu:** a lógica pura do menu fica em `src/lib/menuConfig.ts`, com testes.

**Tech Stack:** React 19, TanStack Router, shadcn (Tabs, Card, Switch, Input, Button), Supabase, node --test.

**Spec:** `docs/superpowers/specs/2026-09-23-onboarding-roadmap-design.md` (Adendo › C). Depende dos Planos A (`appConfig.ts`, `app_config`) e B (`TemplatesView`, chaves `onboarding_janela_dias` e `onboarding_ativa_trafego`).

## Global Constraints

- **Chaves em `app_config`:**
  - `menu` → `{ ocultas: string[]; ordem: Record<string, string[]> }`, em que `ordem` é por título de grupo, com a lista de `to` na ordem desejada;
  - `pdf_tamanho_max_mb` → number, padrão 50;
  - `livros_meta_anual` → number, padrão 12;
  - `virada_ativa`, `onboarding_janela_dias` e `onboarding_ativa_trafego` já existem.
- **Admin e Demandas nunca podem ser ocultados** (`"/admin"` e `"/"`).
- **Migrations:** o controlador aplica no Lovable.
- **Arquivos:** preserve os finais de linha.
- **Verificação:** testes com `npm test`; tipos com `npx tsc --noEmit`.
- **Commits:** duas `-m`, a segunda `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **UI:** em português.

---

### Task 1: Migration — tipos do Ver depois e configurações padrão

**Files:**
- Create: `supabase/migrations/20260924120000_admin_config.sql`
- Modify: `src/integrations/supabase/types.ts` (tabela `ver_depois_tipos`)

- [ ] **Step 1: Migration**
```sql
-- Admin por aba: tipos de link do "Ver depois" editáveis e configurações padrão.
CREATE TABLE IF NOT EXISTS public.ver_depois_tipos (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  hex TEXT NOT NULL DEFAULT '#64748b',
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ver_depois_tipos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ver_depois_tipos' AND policyname = 'ver_depois_tipos_all') THEN
    CREATE POLICY "ver_depois_tipos_all" ON public.ver_depois_tipos FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
INSERT INTO public.ver_depois_tipos (id, label, hex, ordem) VALUES
  ('youtube', 'Vídeo do YouTube', '#ef4444', 0),
  ('reel', 'Reel', '#ec4899', 1),
  ('post', 'Post', '#a855f7', 2),
  ('lp', 'Landing page', '#f59e0b', 3),
  ('site', 'Site', '#3b82f6', 4),
  ('outro', 'Outro link', '#64748b', 5)
ON CONFLICT (id) DO NOTHING;

-- O tipo deixa de ser uma lista fixa
ALTER TABLE public.ver_depois DROP CONSTRAINT IF EXISTS ver_depois_tipo_check;

-- Tipo excluído: os itens dele viram "outro" ('outro' não pode ser excluído)
CREATE OR REPLACE FUNCTION public.ver_depois_tipo_excluido()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id = 'outro' THEN RAISE EXCEPTION 'O tipo "Outro link" não pode ser excluído'; END IF;
  UPDATE public.ver_depois SET tipo = 'outro' WHERE tipo = OLD.id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS ver_depois_tipo_excluido ON public.ver_depois_tipos;
CREATE TRIGGER ver_depois_tipo_excluido BEFORE DELETE ON public.ver_depois_tipos
  FOR EACH ROW EXECUTE FUNCTION public.ver_depois_tipo_excluido();

INSERT INTO public.app_config (chave, valor) VALUES
  ('menu', '{"ocultas": [], "ordem": {}}'::jsonb),
  ('pdf_tamanho_max_mb', '50'::jsonb),
  ('livros_meta_anual', '12'::jsonb)
ON CONFLICT (chave) DO NOTHING;
```
- [ ] **Step 2:** coloque `ver_depois_tipos` no `types.ts` (Row, Insert e Update, na ordem alfabética) e rode `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — "Admin: tipos do Ver depois editáveis e configurações padrão (banco)".
- [ ] **Step 4 (controlador):** aplique no Lovable e confira o nome real da constraint de `ver_depois.tipo` com `SELECT conname FROM pg_constraint WHERE conrelid='public.ver_depois'::regclass AND contype='c'`. Se não for `ver_depois_tipo_check`, faça o `DROP` pelo nome real.

---

### Task 2: Menu lateral configurável

**Files:**
- Create: `src/lib/menuConfig.ts`, `src/lib/menuConfig.test.ts`, `src/components/admin/MenuAdminCard.tsx`
- Modify: `src/routes/_authenticated.tsx`. Exporte `NAV_GROUPS` e use a config.

**Interfaces:**
- Produces:
  - `interface MenuConfig { ocultas: string[]; ordem: Record<string, string[]> }`
  - `MENU_FIXOS = ["/", "/admin"]`
  - `aplicarMenu<L extends { to: string }>(grupos: { title: string; links: L[] }[], cfg: MenuConfig | null): { title: string; links: L[] }[]`
  - `moverNoGrupo(cfg: MenuConfig, grupo: string, tos: string[], to: string, delta: -1 | 1): MenuConfig`
  - `alternarOculta(cfg: MenuConfig, to: string): MenuConfig`

- [ ] **Step 1: Testes**
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { aplicarMenu, moverNoGrupo, alternarOculta, MENU_FIXOS } from "./menuConfig.ts";

const grupos = [
  { title: "Operação", links: [{ to: "/" }, { to: "/onboarding" }, { to: "/roadmap" }, { to: "/ideias" }] },
  { title: "Sistema", links: [{ to: "/admin" }] },
];

test("sem config, menu igual ao padrão", () => {
  assert.deepEqual(aplicarMenu(grupos, null), grupos);
});

test("oculta abas, mas nunca Demandas e Admin; grupo vazio some", () => {
  const r = aplicarMenu(grupos, { ocultas: ["/roadmap", "/", "/admin"], ordem: {} });
  assert.deepEqual(r[0].links.map((l) => l.to), ["/", "/onboarding", "/ideias"]);
  assert.deepEqual(r[1].links.map((l) => l.to), ["/admin"]);
  assert.deepEqual(MENU_FIXOS, ["/", "/admin"]);
  const soOcultaveis = [{ title: "X", links: [{ to: "/ideias" }] }];
  assert.deepEqual(aplicarMenu(soOcultaveis, { ocultas: ["/ideias"], ordem: {} }), []);
});

test("ordem por grupo; abas novas (fora da ordem salva) vão para o fim", () => {
  const r = aplicarMenu(grupos, { ocultas: [], ordem: { "Operação": ["/ideias", "/"] } });
  assert.deepEqual(r[0].links.map((l) => l.to), ["/ideias", "/", "/onboarding", "/roadmap"]);
});

test("moverNoGrupo e alternarOculta", () => {
  const tos = ["/", "/onboarding", "/roadmap"];
  const c1 = moverNoGrupo({ ocultas: [], ordem: {} }, "Operação", tos, "/roadmap", -1);
  assert.deepEqual(c1.ordem["Operação"], ["/", "/roadmap", "/onboarding"]);
  assert.deepEqual(moverNoGrupo(c1, "Operação", c1.ordem["Operação"], "/", -1).ordem["Operação"], ["/", "/roadmap", "/onboarding"]);
  const c2 = alternarOculta({ ocultas: [], ordem: {} }, "/ideias");
  assert.deepEqual(c2.ocultas, ["/ideias"]);
  assert.deepEqual(alternarOculta(c2, "/ideias").ocultas, []);
  assert.deepEqual(alternarOculta(c2, "/admin").ocultas, ["/ideias"]);
});
```
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Implementar**
```ts
// Menu lateral configurável pelo Admin: esconder abas e mudar a ordem dentro de cada grupo.
export interface MenuConfig { ocultas: string[]; ordem: Record<string, string[]> }

/** Demandas e Admin nunca somem do menu. */
export const MENU_FIXOS = ["/", "/admin"];

export function aplicarMenu<L extends { to: string }>(
  grupos: { title: string; links: L[] }[],
  cfg: MenuConfig | null,
): { title: string; links: L[] }[] {
  if (!cfg) return grupos;
  return grupos
    .map((g) => {
      const visiveis = g.links.filter((l) => MENU_FIXOS.includes(l.to) || !cfg.ocultas.includes(l.to));
      const ordem = cfg.ordem[g.title] ?? [];
      const pos = (to: string) => { const i = ordem.indexOf(to); return i < 0 ? ordem.length + g.links.findIndex((l) => l.to === to) : i; };
      return { title: g.title, links: [...visiveis].sort((a, b) => pos(a.to) - pos(b.to)) };
    })
    .filter((g) => g.links.length > 0);
}

export function moverNoGrupo(cfg: MenuConfig, grupo: string, tos: string[], to: string, delta: -1 | 1): MenuConfig {
  const lista = [...tos];
  const i = lista.indexOf(to);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return { ...cfg, ordem: { ...cfg.ordem, [grupo]: lista } };
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return { ...cfg, ordem: { ...cfg.ordem, [grupo]: lista } };
}

export function alternarOculta(cfg: MenuConfig, to: string): MenuConfig {
  if (MENU_FIXOS.includes(to)) return cfg;
  const ocultas = cfg.ocultas.includes(to) ? cfg.ocultas.filter((x) => x !== to) : [...cfg.ocultas, to];
  return { ...cfg, ocultas };
}
```
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Sidebar** (`_authenticated.tsx`)
  - `export const NAV_GROUPS`, com o mesmo conteúdo.
  - No componente: `const [menuCfg] = useConfig<MenuConfig | null>("menu", null);` e `const grupos = useMemo(() => aplicarMenu(NAV_GROUPS, menuCfg), [menuCfg]);`. Renderize `grupos` no lugar de `NAV_GROUPS` no JSX do menu.
  - `ALL_LINKS`, usado no preload, continua com todos.
  - Para o menu atualizar logo depois de salvar no Admin, `MenuAdminCard` dispara `window.dispatchEvent(new Event("menu-config"))`. O layout escuta esse evento e recarrega com `getConfig("menu", null)`. Implemente com um `useEffect` que guarda o valor num estado local, sem depender só do `useConfig`.
- [ ] **Step 6: `MenuAdminCard`**
  - Card "Menu lateral", com a descrição "Escolha quais abas aparecem e a ordem de cada grupo. Demandas e Admin ficam sempre visíveis."
  - Para cada grupo de `NAV_GROUPS` (na ordem já aplicada da config, **incluindo as ocultas**): o título do grupo e, em cada link, ícone, label, `Switch` "visível" (desabilitado em `MENU_FIXOS`) e os botões ↑ ↓ (`moverNoGrupo`).
  - Cada alteração salva na hora com `setConfig("menu", novo)`, dispara o evento e mostra um toast de erro se falhar.
- [ ] **Step 7:** `npx tsc --noEmit` e depois commit — "Admin: menu lateral configurável (mostrar/ocultar e ordem)".

---

### Task 3: Admin em abas por seção do sistema

**Files:**
- Modify: `src/routes/_authenticated/admin.tsx`
- Create: `src/components/admin/OnboardingAdminSecao.tsx`, `src/components/admin/RoadmapAdminSecao.tsx`, `src/components/admin/PdfsLimiteCard.tsx`

**Comportamento obrigatório:**
- **Casca:** no topo, `Tabs`, com `?secao=` na URL via `validateSearch` e padrão `geral`, rolagem horizontal no mobile e as seções **Geral · Demandas · Onboarding · Roadmap · PDFs · Ver depois · Livros · Cursos · Swipe file · Habilidades**.
- **Mover os cards existentes, sem reescrever o conteúdo:**
  - **Geral:** `MenuAdminCard` (Task 2), Agências, Plataformas de ads, Aparência, Dados, Zona de perigo.
  - **Demandas:** o card "Colunas do Kanban", com o switch da virada (Plano A).
  - **Cursos:** "Categorias de cursos".
  - **Swipe file:** `SwipeAdminCard` e `SwipeNichosAdminCard`.
  - **Habilidades:** `HabilidadesAdminCard`.
  - **PDFs:** `PdfsAdminCard` e `PdfsLimiteCard`.
- **Ver depois e Livros:** placeholders ocupados pelas Tasks 4 e 5. Nesta task, renderize nelas um `Card` com o texto "Em breve" **somente** se a Task 4/5 ainda não existir. Ao terminar as três tasks, nenhum "Em breve" pode sobrar. Para evitar ida e volta, implemente as Tasks 3, 4 e 5 **em sequência pelo mesmo implementador** se o controlador assim instruir.
- **`OnboardingAdminSecao`:**
  - `<TemplatesView tipo="onboarding" />` (Plano B);
  - card "Envio para Demandas" com um Select 0/1/2 dias, rotulado "Enviar passos com data até: Hoje / Amanhã / Depois de amanhã" (`useConfig("onboarding_janela_dias", 2)`);
  - Switch "Ativar tráfego automaticamente ao concluir o onboarding" (`useConfig("onboarding_ativa_trafego", true)`).
- **`RoadmapAdminSecao`:** `<TemplatesView tipo="roadmap" />`.
- **`PdfsLimiteCard`:** input numérico em MB (1 a 200), salvo em `pdf_tamanho_max_mb`. Em `src/lib/pdfs.ts`, troque a constante por `export const PDF_TAMANHO_MAX_PADRAO_MB = 50` e passe o limite ao `enviarPdf` e ao filtro da página. A página `pdfs.tsx` lê `useConfig("pdf_tamanho_max_mb", 50)`, e as mensagens usam o valor atual ("maior que o limite de N MB").
- [ ] **Step 1:** implemente.
- [ ] **Step 2:** `npx tsc --noEmit` e `npm test`.
- [ ] **Step 3: Commit** — "Admin: seções por aba do sistema".

---

### Task 4: Ver depois — tipos configuráveis

**Files:**
- Create: `src/lib/verDepoisTipos.ts`, `src/components/admin/VerDepoisTiposCard.tsx`
- Modify: `src/routes/_authenticated/ver-depois.tsx`, `src/routes/_authenticated/admin.tsx` (seção "Ver depois")

**Interfaces:**
- `interface TipoVerDepois { id: string; label: string; hex: string; ordem: number }`
- `fetchTiposVerDepois(): Promise<TipoVerDepois[]>`, `salvarTipoVerDepois(t: { id?: string; label: string; hex: string }): Promise<void>` (id novo = slug do label com sufixo aleatório, como `slugifyColumnId`), `excluirTipoVerDepois(id)`, `moverTipoVerDepois(tipos, id, delta)`
- `iconeDoTipo(id: string): React.ReactNode`: youtube → Youtube, reel/post → Instagram, lp → LayoutTemplate, site → Globe, demais → Link2. Todos com `size={14}`.

**Comportamento obrigatório:**
- **`ver-depois.tsx`:**
  - troque a constante `TIPOS` pelos tipos da tabela, com fallback para os 6 padrões se a tabela falhar, mantendo o `type Tipo = string`;
  - `tipoMeta(id)` procura na lista (fallback "Outro link");
  - os filtros e o select de tipo do formulário listam os tipos em ordem;
  - a detecção automática pelo link continua devolvendo os ids padrão.
- **`VerDepoisTiposCard`:**
  - lista com bolinha de cor, label, ↑ ↓, editar (Dialog com nome e cor, reaproveitando o `ColorPicker`/cores do admin) e excluir (confirmação: "Os links deste tipo passam para 'Outro link'"; desabilitado para `outro`);
  - botão "Novo tipo".
- [ ] **Step 1:** implemente. **Step 2:** `npx tsc --noEmit`. **Step 3: Commit** — "Ver depois: tipos de link editáveis no Admin".

---

### Task 5: Livros — meta anual

**Files:**
- Create: `src/components/admin/LivrosMetaCard.tsx`
- Modify: `src/routes/_authenticated/livros.tsx`, `src/routes/_authenticated/admin.tsx` (seção "Livros")

**Comportamento obrigatório:**
- **`LivrosMetaCard`:** "Meta de livros lidos por ano", input numérico (0 = sem meta), salvo em `livros_meta_anual`.
- **`livros.tsx`:** o card "Lidos em AAAA" mostra "X de META", com um `Progress` fino embaixo, quando meta > 0. Se X ≥ META: texto "Meta batida 🎉". Leia com `useConfig("livros_meta_anual", 12)`.
- [ ] **Step 1:** implemente. **Step 2:** `npx tsc --noEmit`. **Step 3: Commit** — "Livros: meta anual configurável no Admin".

---

### Task 6 (controlador): verificação no navegador
1. Admin › Geral › Menu: ocultar "Livros" faz a aba sumir do menu na hora. Reexibir.
2. Admin › Demandas: mudar a regra de uma coluna nova para "Dias da semana" (Seg) faz a coluna mostrar a seção. Excluir a coluna de teste.
3. Admin › Ver depois: criar o tipo "Teste", usar num link e excluir o tipo. O link vira "Outro link". Limpar.
4. Admin › Livros: meta 12 mostra "X de 12" na aba Livros.
5. Admin › PDFs: limite de 10 MB e a mensagem certa ao tentar enviar um arquivo maior (só a validação no front; não é preciso enviar de verdade). Voltar para 50.
6. Admin › Onboarding: janela 1 faz um passo com data de depois de amanhã sair de Demandas. Voltar para 2.

---

### Task 7: Ideias — categorias configuráveis (pedido do usuário em 23/09, noite)

"Quero poder adicionar novas categorias além de Este sistema / Outro sistema / Para cliente — no formulário da ideia, num botão no topo da aba e no Admin."

**Files:**
- Create: `supabase/migrations/20260924130000_ideias_categorias.sql`, `src/lib/ideiasCategorias.ts`, `src/components/ideias/CategoriasIdeiasDialog.tsx`, `src/components/admin/IdeiasCategoriasCard.tsx`
- Modify: `src/lib/ideiasTexto.ts`, `src/components/ideias/IdeiaDialog.tsx`, `src/routes/_authenticated/ideias.tsx`, `src/routes/_authenticated/admin.tsx` (nova seção **"Ideias"** nas abas do Admin, logo após "Demandas"), `src/integrations/supabase/types.ts`

- [ ] **Step 1: Migration** (o controlador aplica)
```sql
-- Categorias de ideias editáveis. 'cliente' é fixa: ela liga os campos de agência/cliente.
CREATE TABLE IF NOT EXISTS public.ideia_categorias (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  hex TEXT NOT NULL DEFAULT '#64748b',
  ordem INTEGER NOT NULL DEFAULT 0,
  sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ideia_categorias ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ideia_categorias' AND policyname = 'ideia_categorias_all') THEN
    CREATE POLICY "ideia_categorias_all" ON public.ideia_categorias FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
INSERT INTO public.ideia_categorias (id, label, hex, ordem, sistema) VALUES
  ('este_sistema', 'Este sistema', '#8b5cf6', 0, false),
  ('outro_sistema', 'Outro sistema', '#06b6d4', 1, false),
  ('cliente', 'Para cliente', '#f59e0b', 2, true)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.ideias DROP CONSTRAINT IF EXISTS ideias_tipo_check;

-- Categoria excluída: as ideias dela vão para a primeira categoria restante que não seja 'cliente' (ou 'cliente')
CREATE OR REPLACE FUNCTION public.ideia_categoria_excluida()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE destino TEXT;
BEGIN
  IF OLD.sistema THEN RAISE EXCEPTION 'A categoria "%" é fixa e não pode ser excluída', OLD.label; END IF;
  SELECT id INTO destino FROM public.ideia_categorias WHERE id <> OLD.id AND id <> 'cliente' ORDER BY ordem LIMIT 1;
  UPDATE public.ideias SET tipo = COALESCE(destino, 'cliente') WHERE tipo = OLD.id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS ideia_categoria_excluida ON public.ideia_categorias;
CREATE TRIGGER ideia_categoria_excluida BEFORE DELETE ON public.ideia_categorias
  FOR EACH ROW EXECUTE FUNCTION public.ideia_categoria_excluida();
```
Controlador: confirmar o nome real da CHECK de `ideias.tipo` (`SELECT conname FROM pg_constraint WHERE conrelid='public.ideias'::regclass AND contype='c'`) e dropar pelo nome real se diferente.

- [ ] **Step 2: `src/lib/ideiasCategorias.ts`**
  - `interface CategoriaIdeia { id: string; label: string; hex: string; ordem: number; sistema: boolean }`
  - `fetchCategoriasIdeias()` (ordenado por ordem; fallback aos 3 padrões de `TIPOS_IDEIA` se a tabela falhar)
  - `criarCategoriaIdeia(label, hex): Promise<CategoriaIdeia>` (id = slug + sufixo aleatório, como `slugifyColumnId`; ordem = maior + 1)
  - `atualizarCategoriaIdeia(id, { label?, hex? })`, `excluirCategoriaIdeia(id)`, `moverCategoriaIdeia(lista, id, delta)` (troca ordens)
  - hook `useCategoriasIdeias()` → `{ categorias, recarregar }`, que escuta `window` evento `"ideias-categorias"` para recarregar quando outra tela alterar
  - Em `ideiasTexto.ts`: `TipoIdeia` vira `string`; `tipoIdeiaMeta(id, categorias?)` procura na lista passada (fallback: `{ id, label: id, hex: "#64748b" }`); `TIPOS_IDEIA` continua exportado como padrão/fallback. Ajuste o teste existente `ideiasTexto.test.ts` se depender do tipo literal.

- [ ] **Step 3: UI**
  - **Aba Ideias:** as abas/filtros de tipo no topo passam a listar as categorias da tabela. Ao lado delas vai um botão **"+ Categoria"**, que abre o `CategoriasIdeiasDialog`, uma lista para criar, renomear, trocar a cor, reordenar e excluir (exclusão confirmada, desabilitada para `sistema`).
  - **`IdeiaDialog`:** o seletor de tipo lista as categorias e tem uma opção final **"+ Nova categoria…"**. Ela abre um mini-form inline (nome + cor) e, ao criar, já seleciona a nova categoria. Os campos agência/cliente continuam aparecendo só quando `tipo === "cliente"`.
  - **Admin › Ideias:** o `IdeiasCategoriasCard` reusa o mesmo conteúdo do dialog, embutido num Card.
  - Cada criação ou alteração dispara `window.dispatchEvent(new Event("ideias-categorias"))`.

- [ ] **Step 4:** `npx tsc --noEmit` e `npm test`. **Commit:** "Ideias: categorias configuráveis (na aba e no Admin)".

Na Task 6 (verificação), acrescente: criar a categoria "Teste" pelo formulário da ideia, ver o filtro novo e excluí-la pelo Admin.
