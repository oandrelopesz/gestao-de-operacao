# Plano D — Dashboard de demandas por cliente, atribuir cliente/Pessoal e Demanda → Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
1. Aba **Dashboard**, logo acima do Admin: quantas demandas foram concluídas por cliente (e "Pessoal") num período, e quanto cada um representa do total, em %.
2. Botão rápido no card para atribuir cliente, com busca e a opção "Pessoal".
3. Mandar uma demanda para o Roadmap (criar um roadmap novo ou ligar a um existente), com a tag Roadmap no card.

**Spec:** pedido do usuário em 23/09/2026 (noite), confirmado com os padrões abaixo:
- **Conta no Dashboard** toda demanda que **entra em Feito**, a partir desta implementação, na data em que entrou.
- **Sair de Feito** tira a contagem na hora. Voltar para Feito conta de novo, com a nova data.
- **Excluir ou "Zerar" a coluna Feito** não apaga o histórico do Dashboard: o registro fica no log.
- **Cliente:** nenhuma demanda recebe cliente automaticamente, exceto as do onboarding (Plano B), que já vêm com o cliente.
- **Botão de atribuir:** lista com **busca**, com as opções "Pessoal" e "Sem cliente".
- **Grupos no Dashboard:**
  - demanda concluída **sem cliente** e sem "Pessoal" aparece como **"Sem cliente"**;
  - todos os clientes ativos aparecem, mesmo com 0.
- **Onboarding e roadmap:** demandas do onboarding contam. **Passos de roadmap nunca contam**, porque não são demandas. Uma demanda comum ligada a um roadmap e concluída no Kanban **conta**.
- **Períodos:** 7, 14, 30, 60 e 90 dias, "Tudo" e "Personalizado" (de/até). O painel atualiza sozinho quando uma demanda entra ou sai de Feito.
- **Demanda → Roadmap:**
  - no menu ⋯ do card e no painel: "Enviar para o Roadmap";
  - o diálogo oferece "Criar roadmap" (nome = título da demanda, cliente = o da demanda, "Pessoal" ou a escolher; sem passos, que são preenchidos depois) ou "Ligar a um roadmap existente";
  - a demanda ganha a tag Roadmap, e clicar nela abre `/roadmap?id=…` (Plano B, Task 9);
  - roadmaps podem ser **Pessoais**, sem cliente.

**Depende de:** Plano A (`hojeBrasilia`, colunas) e Plano B (`processos`, aba Roadmap, tag Roadmap no card, `criarProcesso`, `fetchProcessos`).

## Global Constraints
- **Log de conclusões:** tabela `demanda_conclusoes`, uma linha por demanda que está em Feito, mantida por trigger. Conta = linhas com `concluida_em` no período.
- **"Hoje" e períodos:** "hoje" é a data de Brasília (`hojeBrasilia()`). "Últimos N dias" = de hoje-(N-1) até hoje.
- **Migrations:** o controlador aplica no Lovable.
- **Verificação:** testes com `npm test`; tipos com `npx tsc --noEmit`.
- **Arquivos:** preserve os finais de linha.
- **Commits:** duas `-m`, com o trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Texto:** UI em português.

---

### Task 1: Migration — Pessoal, log de conclusões, roadmaps pessoais

**Files:** Create `supabase/migrations/20260924140000_dashboard_conclusoes.sql`; Modify `src/integrations/supabase/types.ts`.

```sql
-- Dashboard: log de demandas concluídas (entrou em Feito) por cliente/Pessoal; roadmaps pessoais.
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS pessoal BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.demanda_conclusoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demanda_id UUID UNIQUE REFERENCES public.demandas(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  pessoal BOOLEAN NOT NULL DEFAULT false,
  titulo TEXT,
  concluida_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demanda_conclusoes_data_idx ON public.demanda_conclusoes(concluida_em);
ALTER TABLE public.demanda_conclusoes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'demanda_conclusoes' AND policyname = 'demanda_conclusoes_all') THEN
    CREATE POLICY "demanda_conclusoes_all" ON public.demanda_conclusoes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'demanda_conclusoes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.demanda_conclusoes;
  END IF;
END $$;

-- Entrou em Feito → registra; saiu de Feito → apaga o registro; cliente/Pessoal/título mudam → acompanha.
-- Excluir a demanda (ou "Zerar" a coluna) NÃO apaga o registro: o FK vira NULL e a contagem fica.
CREATE OR REPLACE FUNCTION public.demandas_registra_conclusao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'feito' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'feito') THEN
    INSERT INTO demanda_conclusoes (demanda_id, cliente_id, pessoal, titulo, concluida_em)
    VALUES (NEW.id, NEW.cliente_id, NEW.pessoal, NEW.titulo, now())
    ON CONFLICT (demanda_id) DO UPDATE SET cliente_id = EXCLUDED.cliente_id, pessoal = EXCLUDED.pessoal,
      titulo = EXCLUDED.titulo, concluida_em = now();
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'feito' AND NEW.status IS DISTINCT FROM 'feito' THEN
    DELETE FROM demanda_conclusoes WHERE demanda_id = NEW.id;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'feito'
        AND (NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.pessoal IS DISTINCT FROM OLD.pessoal OR NEW.titulo IS DISTINCT FROM OLD.titulo) THEN
    UPDATE demanda_conclusoes SET cliente_id = NEW.cliente_id, pessoal = NEW.pessoal, titulo = NEW.titulo WHERE demanda_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_40_conclusao ON public.demandas;
CREATE TRIGGER demandas_40_conclusao AFTER INSERT OR UPDATE OF status, cliente_id, pessoal, titulo ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_registra_conclusao();

-- Pessoal e cliente são exclusivos
CREATE OR REPLACE FUNCTION public.demandas_pessoal_exclusivo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pessoal AND NEW.cliente_id IS NOT NULL THEN
    IF TG_OP = 'UPDATE' AND NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN NEW.pessoal := false;
    ELSE NEW.cliente_id := NULL; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_05_pessoal ON public.demandas;
CREATE TRIGGER demandas_05_pessoal BEFORE INSERT OR UPDATE OF cliente_id, pessoal ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_pessoal_exclusivo();

-- Roadmaps pessoais (sem cliente)
ALTER TABLE public.processos ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE public.processos ADD COLUMN IF NOT EXISTS pessoal BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'processos_cliente_ou_pessoal') THEN
    ALTER TABLE public.processos ADD CONSTRAINT processos_cliente_ou_pessoal
      CHECK (tipo = 'roadmap' OR cliente_id IS NOT NULL);
  END IF;
END $$;
```
- **Tipos:** atualize o `types.ts`:
  - `demandas.pessoal: boolean`;
  - a tabela `demanda_conclusoes`;
  - `processos.cliente_id: string | null` e `processos.pessoal: boolean`.
- **Commit:** "Dashboard: log de conclusões por cliente, Pessoal e roadmaps pessoais (banco)".
- **Controlador:** aplica e testa num bloco `DO … RAISE` com estes casos:
  1. uma demanda de teste vai para feito → 1 linha no log;
  2. volta para hoje → 0 linhas;
  3. vai de novo para feito e depois é **excluída** → a linha continua, com `demanda_id` NULL.

---

### Task 2: Lógica pura do Dashboard

**Files:** Create `src/lib/dashboard.ts`, `src/lib/dashboard.test.ts`.

**Interfaces:**
```ts
export type PeriodoId = "7" | "14" | "30" | "60" | "90" | "tudo" | "personalizado";
export function intervaloDoPeriodo(p: PeriodoId, hoje: string, de?: string, ate?: string): { de: string | null; ate: string | null }
//  "N" → de = hoje-(N-1), ate = hoje; "tudo" → nulls; "personalizado" → {de, ate} dados (null se vazio)
export interface Conclusao { cliente_id: string | null; pessoal: boolean; concluida_em: string }
export interface LinhaDashboard { chave: string; nome: string; total: number; percentual: number }  // chave = cliente id | "pessoal" | "sem_cliente"
export function agregar(conclusoes: Conclusao[], clientes: { id: string; nome: string }[]): { total: number; linhas: LinhaDashboard[] }
//  todos os clientes aparecem (0 inclusive); "Pessoal" e "Sem cliente" só aparecem se > 0;
//  percentual = round(total*1000/geral)/10 (uma casa); ordenado por total desc, depois nome asc.
export function dataLocalBrasilia(iso: string): string   // "2026-09-24T02:00:00Z" → "2026-09-23"
```
- **Testes:**
  - `intervaloDoPeriodo("7","2026-09-23")` → `{de:"2026-09-17",ate:"2026-09-23"}`;
  - "tudo";
  - personalizado vazio;
  - `agregar` com 3 conclusões do cliente A, 1 pessoal e 1 sem cliente, mais o cliente B sem nada. Esperado:
    - A: 3 (60%), Pessoal 1 (20%), Sem cliente 1 (20%), B: 0 (0%);
    - a ordem é A, Pessoal, Sem cliente, B (desempate por nome: "Pessoal" < "Sem cliente");
  - `dataLocalBrasilia` na virada de UTC.
- **Commit:** "Dashboard: agregação por cliente e períodos".

---

### Task 3: Atribuir cliente rápido (card e painel) com busca e "Pessoal"

**Files:**
- Create: `src/components/demandas/ClientePicker.tsx`
- Modify: `src/components/KanbanCard.tsx`, `src/components/KanbanColumn.tsx`, `src/components/demandas/DemandaDrawer.tsx`, `src/routes/_authenticated/index.tsx`

**Comportamento:**
- **`ClientePicker`:** `Popover` + `Command` (cmdk, `@/components/ui/command`), com `CommandInput` "Buscar cliente…".
  - Itens: "Pessoal" (ícone `User`), "Sem cliente" e os clientes em ordem alfabética, com o cliente atual marcado com ✓.
  - `onEscolher({ cliente_id: string | null, pessoal: boolean })`.
- **Card:** botão pequeno de ícone (`UserPlus`) na linha do título, visível no hover **e sempre visível quando o card não tem cliente nem Pessoal**.
  - Abre o `ClientePicker` e salva via prop nova `onAtribuirCliente?: (id, { cliente_id, pessoal }) => void`, repassada pela coluna.
  - O clique não abre o painel nem inicia o arrasto: use `stopPropagation` e `onPointerDown` stop.
- **Selo "Pessoal":** `demanda.pessoal` mostra o selo **"Pessoal"** (`bg-violet-500/10 text-violet-600`) no lugar da tag de cliente.
- **Página:** `onAtribuirCliente` chama `handleUpdateDemanda(id, { cliente_id, pessoal })`, que já retorna a linha com o join de cliente.
- **Painel:** o seletor de cliente atual passa a usar o mesmo `ClientePicker`, com "Pessoal" e "Sem cliente".
- **Commit:** "Demandas: atribuir cliente rápido no card (busca) e opção Pessoal".

---

### Task 4: Aba Dashboard

**Files:**
- Create: `src/routes/_authenticated/dashboard.tsx`
- Modify: `src/routes/_authenticated.tsx`:
  - link `{ label: "Dashboard", icon: <BarChart3 size={17} />, to: "/dashboard" }` no grupo "Sistema", **antes** do Admin;
  - se o Plano C já tiver `MENU_FIXOS`, nada muda lá.
- Modify: `src/routeTree.gen.ts` (regenerado).

**Comportamento:**
- **Cabeçalho:** "Dashboard" e o subtítulo "Demandas concluídas por cliente".
- **Filtros de período:** chips 7, 14, 30, 60 e 90 dias, "Tudo" e "Personalizado" (dois inputs `type="date"`). O padrão é 30 dias e fica guardado em localStorage.
- **Dados:**
  - `demanda_conclusoes` filtrado por `concluida_em`, comparando pela data local de Brasília com `dataLocalBrasilia`. Busque no intervalo com uma folga de um dia em UTC e filtre no cliente;
  - clientes não arquivados (`id, nome`).
- **Tempo real:** `supabase.channel("dashboard-conclusoes").on("postgres_changes", { event: "*", schema: "public", table: "demanda_conclusoes" }, recarregar)`. Também recarrega ao voltar para a aba (`visibilitychange`), para o caso de o realtime não estar ligado.
- **Cartões de resumo:** "Concluídas no período" (total), "Clientes atendidos" (clientes com mais de 0) e "Pessoal".
- **Gráfico:** barras horizontais (recharts `BarChart layout="vertical"`) com os 10 maiores.
- **Tabela:** Cliente, Demandas, % do total (com barra fina de progresso), com todos os clientes. Clicar numa linha mostra, embaixo, a lista das demandas concluídas daquele cliente no período (título + data).
- **Estado vazio:** "Nenhuma demanda concluída neste período. As demandas passam a contar quando vão para Feito."
- **Commit:** "Dashboard: demandas concluídas por cliente com filtros de período".

---

### Task 5: Demanda → Roadmap

**Files:**
- Create: `src/components/demandas/EnviarParaRoadmapDialog.tsx`
- Modify:
  - `src/components/KanbanCard.tsx` (item "Enviar para o Roadmap" no menu ⋯ quando `!roadmap_id`, e "Abrir roadmap" quando houver);
  - `src/components/demandas/DemandaDrawer.tsx` (mesmo botão);
  - `src/routes/_authenticated/index.tsx`;
  - `src/lib/processosService.ts` (`criarProcesso` aceita `cliente_id: string | null` e `pessoal?: boolean`; `ClienteResumo` pode ser null em processos pessoais);
  - `src/routes/_authenticated/roadmap.tsx` e `src/components/processos/NovoRoadmapDialog.tsx`: o grupo **"Pessoal"** na lista e a opção "Pessoal" no seletor de cliente.

**Comportamento:**
- **O diálogo tem duas abas:**
  - **"Criar roadmap":** nome (padrão: título da demanda), cliente (padrão: o da demanda; "Pessoal" se a demanda for pessoal; seletor `ClientePicker` se não tiver) e template opcional. Ao criar:
    1. `criarProcesso({ tipo:"roadmap", ... })`;
    2. depois `demandas.update({ roadmap_id: novoId })`;
    3. toast "Roadmap criado — defina os passos quando quiser", com a ação "Abrir", que navega para `/roadmap?id=`.
  - **"Ligar a existente":** lista de roadmaps ativos, com busca, filtrada pelo cliente da demanda, com "Mostrar todos". Gravar define `roadmap_id`.
- **Desligar:** no menu, "Desligar do roadmap" zera `roadmap_id`.
- **Exceção:** demandas de passo de onboarding (`processo_passo_id`) não mostram essas opções, porque o roadmap delas vem do passo.
- **Commit:** "Demandas: enviar demanda para o Roadmap (criar ou ligar)".

---

### Task 6 (controlador): verificação no navegador
1. Atribuir "Pessoal" a um card de teste e movê-lo para Feito: o Dashboard mostra Pessoal = 1, em tempo real.
2. Tirar de Feito: Pessoal some.
3. Atribuir um cliente pela busca e concluir: conta para o cliente e o % confere.
4. "Enviar para o Roadmap" em outro card: o roadmap aparece na aba Roadmap, a tag abre o roadmap, e os passos são preenchidos depois.
5. Excluir as demandas e roadmaps de teste. O log do Dashboard das demandas de teste pode ser apagado pelo controlador com `DELETE FROM demanda_conclusoes WHERE titulo LIKE 'TESTE%'`.
