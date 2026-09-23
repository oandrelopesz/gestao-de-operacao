# Plano B — Abas Onboarding e Roadmap integradas às Demandas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Duas abas novas para acompanhar a entrada de clientes e projetos de longo prazo:
- **Onboarding:** templates, trilha horizontal, datas opcionais, verba, conclusão que ativa o tráfego e histórico.
- **Roadmap:** o mesmo motor, podendo ser ligado a um passo do onboarding.

Os passos do onboarding viram demandas no Kanban, sincronizados nos dois sentidos.

**Architecture:**
- **Um motor:** as mesmas tabelas servem às duas abas, com `tipo = 'onboarding' | 'roadmap'`.
- **Sincronização no banco:** triggers e funções, mais um cron diário às 03:01 UTC, depois da virada.
- **Front:**
  - lógica pura em `src/lib/processos.ts`, com testes;
  - acesso a dados em `src/lib/processosService.ts`;
  - componentes compartilhados em `src/components/processos/`;
  - duas rotas: `/onboarding` e `/roadmap`.

**Tech Stack:** React 19, TanStack Router (file routes; `src/routeTree.gen.ts` é gerado pelo Vite), dnd-kit (`@dnd-kit/core` + `@dnd-kit/sortable`), shadcn (Card, Sheet, Dialog, AlertDialog, Tabs, Popover, Calendar, Select, Progress, DropdownMenu), sonner, Supabase (Lovable Cloud), node --test.

**Spec:** `docs/superpowers/specs/2026-09-23-onboarding-roadmap-design.md` (corpo + Adendo). Este plano vem **depois** do Plano A e usa o que ele criou:
- `public.hoje_brt()`, `public.proximo_dia_semana(smallint)`;
- `demanda_colunas.regra_data`/`dias_semana`, `demandas.dia_semana`;
- a flag `app.sem_regra_data`, a tabela `app_config`;
- `src/lib/entrega.ts` (`hojeBrasilia`, `diasDeAtraso`, `formatarDataCurta`), `src/lib/appConfig.ts` (`useConfig`, `getConfig`).

## Global Constraints

- **Tipos e status:** `tipo` ∈ `'onboarding' | 'roadmap'`; `status` do processo ∈ `'ativo' | 'concluido' | 'encerrado'`.
- **Datas dos passos:** opcionais; passo **sem data vai para o fim** da trilha. "Hoje" = Brasília.
- **Janela de envio para Demandas:** `app_config.onboarding_janela_dias`, padrão 2. Com 2, entra passo de hoje, amanhã e depois de amanhã; com 0, só hoje (e atrasados).
- **Ao concluir:** `app_config.onboarding_ativa_trafego`, padrão `true`.
- **Só passos de onboarding viram demandas.** Passos de roadmap **nunca**.
- **A demanda de um passo sempre leva:**
  - o `cliente_id` do cliente;
  - título `"<passo> — <cliente>"`;
  - `descricao` = observações;
  - `prazo` = data do passo;
  - `processo_passo_id`;
  - `roadmap_id`, se o passo tiver roadmap ligado.
- **Default user id** das demandas criadas pelo banco: `'b34bdae5-7a67-4b63-a46f-8aad43a06c63'` (o mesmo `FALLBACK_USER_ID` do front).
- **Tabelas novas:** RLS com policy `FOR ALL USING (true) WITH CHECK (true)`.
- **Migrations:** o controlador aplica no Lovable; implementadores só escrevem os arquivos.
- **Arquivos:** preserve os finais de linha (CRLF continua CRLF). Rotas novas: o `src/routeTree.gen.ts` é regenerado pelo Vite. Se não houver `vite dev` rodando, rode `npx vite build` uma vez e commite o `routeTree.gen.ts` atualizado.
- **Verificação:** testes com `npm test` e tipos com `npx tsc --noEmit`.
- **Commits:** mensagem com duas `-m`, a segunda `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Texto e visual:** UI em português; visual limpo e bonito, no estilo das abas existentes (Ideias, PDFs): cards `rounded-xl`, tokens `bg-muted/40`, `border-border/60`, acento por cor.

---

### Task 1: Migration — tabelas de processos, vínculos em demandas e clientes

**Files:**
- Create: `supabase/migrations/20260924100000_processos.sql`
- Modify: `src/integrations/supabase/types.ts`:
  - tabelas `processo_templates`, `processo_template_passos`, `processos`, `processo_passos`;
  - `demandas` + `processo_passo_id: string | null`, `roadmap_id: string | null`;
  - `clientes` + `onboarding_desde: string | null`.

- [ ] **Step 1: Migration**
```sql
-- Abas Onboarding e Roadmap: templates, processos (um por cliente/projeto) e passos.
CREATE TABLE IF NOT EXISTS public.processo_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('onboarding', 'roadmap')),
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.processo_template_passos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.processo_templates(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  observacoes TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.processos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('onboarding', 'roadmap')),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  template_id UUID REFERENCES public.processo_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'encerrado')),
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em TIMESTAMPTZ,
  prazo_final DATE,
  passo_onboarding_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.processo_passos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  observacoes TEXT,
  data DATE,
  ordem INTEGER NOT NULL DEFAULT 0,
  concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'processos_passo_onboarding_fk') THEN
    ALTER TABLE public.processos ADD CONSTRAINT processos_passo_onboarding_fk
      FOREIGN KEY (passo_onboarding_id) REFERENCES public.processo_passos(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS processo_template_passos_template_idx ON public.processo_template_passos(template_id);
CREATE INDEX IF NOT EXISTS processo_passos_processo_idx ON public.processo_passos(processo_id);
CREATE INDEX IF NOT EXISTS processos_cliente_idx ON public.processos(cliente_id);
CREATE UNIQUE INDEX IF NOT EXISTS processos_onboarding_ativo_unico ON public.processos(cliente_id) WHERE tipo = 'onboarding' AND status = 'ativo';
CREATE UNIQUE INDEX IF NOT EXISTS processos_roadmap_passo_unico ON public.processos(passo_onboarding_id) WHERE passo_onboarding_id IS NOT NULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['processo_templates', 'processo_template_passos', 'processos', 'processo_passos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_all') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)', t || '_all', t);
    END IF;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS processo_templates_updated ON public.processo_templates;
CREATE TRIGGER processo_templates_updated BEFORE UPDATE ON public.processo_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS processos_updated ON public.processos;
CREATE TRIGGER processos_updated BEFORE UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS processo_passos_updated ON public.processo_passos;
CREATE TRIGGER processo_passos_updated BEFORE UPDATE ON public.processo_passos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Demandas criadas a partir de passos do onboarding
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS processo_passo_id UUID UNIQUE REFERENCES public.processo_passos(id) ON DELETE SET NULL;
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS roadmap_id UUID REFERENCES public.processos(id) ON DELETE SET NULL;

-- Dia em que o cliente entrou no onboarding
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS onboarding_desde TIMESTAMPTZ;
UPDATE public.clientes SET onboarding_desde = now() WHERE em_onboarding AND onboarding_desde IS NULL;

CREATE OR REPLACE FUNCTION public.clientes_marca_onboarding()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.em_onboarding AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.em_onboarding, false)) THEN
    NEW.onboarding_desde := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS clientes_marca_onboarding ON public.clientes;
CREATE TRIGGER clientes_marca_onboarding BEFORE INSERT OR UPDATE OF em_onboarding ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_marca_onboarding();

INSERT INTO public.app_config (chave, valor) VALUES
  ('onboarding_janela_dias', '2'::jsonb),
  ('onboarding_ativa_trafego', 'true'::jsonb)
ON CONFLICT (chave) DO NOTHING;
```
- [ ] **Step 2:** atualize o `types.ts`:
  - as quatro tabelas, com Row, Insert e Update no formato das outras e `Relationships` conforme as FKs; se preferir, `Relationships: []`;
  - os campos novos em `demandas` e `clientes`.

  Rode `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — `git add` a migration e o `types.ts`; mensagem "Onboarding/Roadmap: tabelas de templates, processos e passos".
- [ ] **Step 4 (controlador):** aplicar no Lovable e conferir a existência das tabelas pela REST (`/rest/v1/processos?select=id&limit=1`).

---

### Task 2: Migration — sincronização passos ⇄ demandas, roadmap ⇄ passo, cliente

**Files:**
- Create: `supabase/migrations/20260924110000_processos_sync.sql`

**Interfaces:**
- Produces:
  - `public.sincronizar_passo(p_passo uuid, p_forcar boolean)`;
  - `public.sincronizar_passos_onboarding()`, rodada pelo cron `sincronizar-passos-onboarding` às `1 3 * * *`;
  - triggers:
    - `processo_passos_sync` (AFTER INSERT/UPDATE);
    - `processo_passos_sync_del` (BEFORE DELETE);
    - `processos_sync` (AFTER UPDATE);
    - `demandas_30_atualiza_passo` (AFTER UPDATE);
    - `clientes_encerra_onboarding` (AFTER UPDATE).

- [ ] **Step 1: Migration**
```sql
-- Sincronização Onboarding/Roadmap ⇄ Demandas. Só passos de onboarding viram demandas.

CREATE OR REPLACE FUNCTION public.onboarding_janela() RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT LEAST(2, GREATEST(0, COALESCE((SELECT (valor #>> '{}')::int FROM public.app_config WHERE chave = 'onboarding_janela_dias'), 2)))
$$;

-- Coluna do Kanban para a data do passo (null = fora da janela / sem data)
CREATE OR REPLACE FUNCTION public.coluna_do_passo(p_data date) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_data IS NULL THEN NULL
    WHEN p_data <= public.hoje_brt() THEN 'fazer_hoje'
    WHEN p_data = public.hoje_brt() + 1 AND public.onboarding_janela() >= 1 THEN 'fazer_amanha'
    WHEN p_data = public.hoje_brt() + 2 AND public.onboarding_janela() >= 2 THEN 'fazer_depois_amanha'
    ELSE NULL
  END
$$;

-- Coloca a demanda do passo no estado certo. p_forcar = a data foi mudada na aba Onboarding:
-- move o card mesmo que ele esteja numa coluna que o usuário escolheu (standby, fim de semana...).
CREATE OR REPLACE FUNCTION public.sincronizar_passo(p_passo uuid, p_forcar boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p RECORD;
  d RECORD;
  alvo TEXT;
  v_titulo TEXT;
  v_ordem INTEGER;
  v_roadmap UUID;
BEGIN
  PERFORM set_config('app.sem_regra_data', 'on', true);
  SELECT ps.*, pr.tipo, pr.status AS proc_status, pr.cliente_id, c.nome AS cliente_nome
    INTO p
    FROM processo_passos ps
    JOIN processos pr ON pr.id = ps.processo_id
    JOIN clientes c ON c.id = pr.cliente_id
   WHERE ps.id = p_passo;
  IF NOT FOUND OR p.tipo <> 'onboarding' THEN
    PERFORM set_config('app.sem_regra_data', 'off', true);
    RETURN;
  END IF;
  SELECT * INTO d FROM demandas WHERE processo_passo_id = p_passo;
  SELECT r.id INTO v_roadmap FROM processos r WHERE r.passo_onboarding_id = p_passo AND r.tipo = 'roadmap' LIMIT 1;
  v_titulo := p.titulo || ' — ' || p.cliente_nome;

  IF p.proc_status <> 'ativo' THEN
    IF d.id IS NOT NULL AND d.status <> 'feito' AND p.proc_status = 'encerrado' THEN
      DELETE FROM demandas WHERE id = d.id;
    END IF;
  ELSIF p.concluido_em IS NOT NULL THEN
    IF d.id IS NOT NULL AND d.status <> 'feito' THEN
      UPDATE demandas SET status = 'feito' WHERE id = d.id;
    END IF;
  ELSE
    alvo := coluna_do_passo(p.data);
    IF d.id IS NULL THEN
      IF alvo IS NOT NULL THEN
        SELECT COALESCE(MAX(ordem), -1) + 1 INTO v_ordem FROM demandas WHERE status = alvo;
        INSERT INTO demandas (user_id, cliente_id, titulo, descricao, status, prazo, ordem, processo_passo_id, roadmap_id)
        VALUES ('b34bdae5-7a67-4b63-a46f-8aad43a06c63', p.cliente_id, v_titulo, p.observacoes, alvo, p.data, v_ordem, p.id, v_roadmap);
      END IF;
    ELSE
      IF d.status IN ('fazer_hoje', 'fazer_amanha', 'fazer_depois_amanha', 'feito') OR p_forcar THEN
        IF alvo IS NULL THEN
          DELETE FROM demandas WHERE id = d.id;
          d.id := NULL;
        ELSIF alvo <> d.status THEN
          SELECT COALESCE(MAX(ordem), -1) + 1 INTO v_ordem FROM demandas WHERE status = alvo;
          UPDATE demandas SET status = alvo, ordem = v_ordem WHERE id = d.id;
        END IF;
      END IF;
      IF d.id IS NOT NULL THEN
        UPDATE demandas
           SET titulo = v_titulo, descricao = p.observacoes, prazo = p.data, cliente_id = p.cliente_id, roadmap_id = v_roadmap
         WHERE id = d.id
           AND (titulo IS DISTINCT FROM v_titulo OR descricao IS DISTINCT FROM p.observacoes OR prazo IS DISTINCT FROM p.data
                OR cliente_id IS DISTINCT FROM p.cliente_id OR roadmap_id IS DISTINCT FROM v_roadmap);
      END IF;
    END IF;
  END IF;
  PERFORM set_config('app.sem_regra_data', 'off', true);
END $$;

-- Roadmap: 100% conclui o processo (e o passo do onboarding ligado); desfazer reabre
CREATE OR REPLACE FUNCTION public.atualizar_conclusao_roadmap(p_processo uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total INT; feitos INT; pr RECORD;
BEGIN
  SELECT * INTO pr FROM processos WHERE id = p_processo;
  IF NOT FOUND OR pr.tipo <> 'roadmap' OR pr.status = 'encerrado' THEN RETURN; END IF;
  SELECT count(*), count(concluido_em) INTO total, feitos FROM processo_passos WHERE processo_id = p_processo;
  IF total > 0 AND total = feitos AND pr.status = 'ativo' THEN
    UPDATE processos SET status = 'concluido', concluido_em = now() WHERE id = p_processo;
    IF pr.passo_onboarding_id IS NOT NULL THEN
      UPDATE processo_passos SET concluido_em = now() WHERE id = pr.passo_onboarding_id AND concluido_em IS NULL;
    END IF;
  ELSIF (total = 0 OR feitos < total) AND pr.status = 'concluido' THEN
    UPDATE processos SET status = 'ativo', concluido_em = NULL WHERE id = p_processo;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.processo_passos_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tipo TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM demandas WHERE processo_passo_id = OLD.id AND status <> 'feito';
    RETURN OLD;
  END IF;
  SELECT tipo INTO v_tipo FROM processos WHERE id = NEW.processo_id;
  IF v_tipo = 'onboarding' THEN
    PERFORM sincronizar_passo(NEW.id, TG_OP = 'UPDATE' AND OLD.data IS DISTINCT FROM NEW.data AND pg_trigger_depth() = 1);
    -- Prazo do roadmap ligado a este passo acompanha a data do passo
    UPDATE processos SET prazo_final = NEW.data
     WHERE passo_onboarding_id = NEW.id AND prazo_final IS DISTINCT FROM NEW.data;
  ELSIF v_tipo = 'roadmap' THEN
    PERFORM atualizar_conclusao_roadmap(NEW.processo_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS processo_passos_sync ON public.processo_passos;
CREATE TRIGGER processo_passos_sync AFTER INSERT OR UPDATE ON public.processo_passos
  FOR EACH ROW EXECUTE FUNCTION public.processo_passos_sync();
DROP TRIGGER IF EXISTS processo_passos_sync_del ON public.processo_passos;
CREATE TRIGGER processo_passos_sync_del BEFORE DELETE ON public.processo_passos
  FOR EACH ROW EXECUTE FUNCTION public.processo_passos_sync();

-- Processo: encerrar tira as demandas abertas; roadmap ligado/desligado a um passo; prazo do roadmap → data do passo
CREATE OR REPLACE FUNCTION public.processos_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_data DATE;
BEGIN
  IF NEW.tipo = 'onboarding' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'encerrado' THEN
    DELETE FROM demandas d USING processo_passos ps
     WHERE d.processo_passo_id = ps.id AND ps.processo_id = NEW.id AND d.status <> 'feito';
  END IF;
  IF NEW.tipo = 'roadmap' THEN
    IF NEW.passo_onboarding_id IS DISTINCT FROM OLD.passo_onboarding_id THEN
      IF OLD.passo_onboarding_id IS NOT NULL THEN PERFORM sincronizar_passo(OLD.passo_onboarding_id); END IF;
      IF NEW.passo_onboarding_id IS NOT NULL THEN
        -- Ao ligar: a data do passo manda; sem data no passo, o prazo do roadmap vira a data do passo
        SELECT data INTO v_data FROM processo_passos WHERE id = NEW.passo_onboarding_id;
        IF v_data IS NOT NULL THEN
          UPDATE processos SET prazo_final = v_data WHERE id = NEW.id AND prazo_final IS DISTINCT FROM v_data;
        ELSIF NEW.prazo_final IS NOT NULL THEN
          UPDATE processo_passos SET data = NEW.prazo_final WHERE id = NEW.passo_onboarding_id;
        END IF;
        PERFORM sincronizar_passo(NEW.passo_onboarding_id);
      END IF;
    ELSIF NEW.prazo_final IS DISTINCT FROM OLD.prazo_final AND NEW.passo_onboarding_id IS NOT NULL AND pg_trigger_depth() = 1 THEN
      UPDATE processo_passos SET data = NEW.prazo_final WHERE id = NEW.passo_onboarding_id AND data IS DISTINCT FROM NEW.prazo_final;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS processos_sync ON public.processos;
CREATE TRIGGER processos_sync AFTER UPDATE ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.processos_sync();

-- Demandas → passo: mover o card atualiza a data/conclusão do passo
CREATE OR REPLACE FUNCTION public.demandas_atualiza_passo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r TEXT; v_fim INT; v_proc UUID;
BEGIN
  IF pg_trigger_depth() > 1 OR NEW.processo_passo_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'feito' AND OLD.status IS DISTINCT FROM 'feito' THEN
    UPDATE processo_passos SET concluido_em = COALESCE(concluido_em, now()) WHERE id = NEW.processo_passo_id;
    RETURN NEW;
  END IF;
  IF NEW.status = 'feito' THEN RETURN NEW; END IF;
  IF OLD.status = 'feito' THEN
    UPDATE processo_passos SET concluido_em = NULL WHERE id = NEW.processo_passo_id;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT regra_data INTO r FROM demanda_colunas WHERE id = NEW.status;
    IF COALESCE(r, 'nenhuma') = 'nenhuma' THEN
      -- Standby / coluna sem regra: passo sem data, no fim da trilha; entrega vazia
      SELECT processo_id INTO v_proc FROM processo_passos WHERE id = NEW.processo_passo_id;
      SELECT COALESCE(MAX(ordem), -1) + 1 INTO v_fim FROM processo_passos WHERE processo_id = v_proc;
      UPDATE processo_passos SET data = NULL, ordem = v_fim WHERE id = NEW.processo_passo_id;
      UPDATE demandas SET prazo = NULL WHERE id = NEW.id AND prazo IS NOT NULL;
      RETURN NEW;
    END IF;
  END IF;
  -- Coluna com regra (a entrega já foi recalculada) ou entrega editada no painel
  UPDATE processo_passos SET data = NEW.prazo WHERE id = NEW.processo_passo_id AND data IS DISTINCT FROM NEW.prazo;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_30_atualiza_passo ON public.demandas;
CREATE TRIGGER demandas_30_atualiza_passo AFTER UPDATE OF status, dia_semana, prazo ON public.demandas
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.dia_semana IS DISTINCT FROM NEW.dia_semana OR OLD.prazo IS DISTINCT FROM NEW.prazo)
  EXECUTE FUNCTION public.demandas_atualiza_passo();

-- Cliente desmarcado de "Em onboarding" com processo ativo → encerrado sem concluir
CREATE OR REPLACE FUNCTION public.clientes_encerra_onboarding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(OLD.em_onboarding, false) AND NOT COALESCE(NEW.em_onboarding, false) THEN
    UPDATE processos SET status = 'encerrado', concluido_em = now()
     WHERE cliente_id = NEW.id AND tipo = 'onboarding' AND status = 'ativo';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS clientes_encerra_onboarding ON public.clientes;
CREATE TRIGGER clientes_encerra_onboarding AFTER UPDATE OF em_onboarding ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_encerra_onboarding();

-- Diário (depois da virada das 03:00 UTC): passos que entraram na janela viram demandas
CREATE OR REPLACE FUNCTION public.sincronizar_passos_onboarding()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT ps.id FROM processo_passos ps JOIN processos pr ON pr.id = ps.processo_id
     WHERE pr.tipo = 'onboarding' AND pr.status = 'ativo'
       AND (ps.data IS NOT NULL OR EXISTS (SELECT 1 FROM demandas d WHERE d.processo_passo_id = ps.id))
  LOOP
    PERFORM sincronizar_passo(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.sincronizar_passos_onboarding() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sincronizar_passo(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atualizar_conclusao_roadmap(uuid) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('sincronizar-passos-onboarding')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sincronizar-passos-onboarding');
SELECT cron.schedule('sincronizar-passos-onboarding', '1 3 * * *', $$SELECT public.sincronizar_passos_onboarding()$$);
```
- [ ] **Step 2: Commit** — mensagem "Onboarding/Roadmap: sincronização com Demandas no banco".
- [ ] **Step 3 (controlador): aplicar e testar** num bloco `DO $$ … RAISE EXCEPTION 'RESULTADO …' $$` (tudo desfeito). O bloco cria um cliente de teste com `em_onboarding = true`, um processo de onboarding e passos:
  - A = hoje+1 → demanda em `fazer_amanha`, com `cliente_id` e `prazo`;
  - B = hoje+10 → sem demanda;
  - C = sem data → sem demanda.

  Depois verifica:
  - mover a demanda de A para `standby` → A sem data e no fim da trilha;
  - mudar a data de A para hoje, pela "aba" (UPDATE direto, profundidade 1) → a demanda vai para `fazer_hoje`;
  - concluir A → demanda em `feito`;
  - mover para `feito` a demanda de um passo D com data de hoje → D concluído;
  - roadmap ligado a B, com 2 passos concluídos → o roadmap fica `concluido` e B fica concluído;
  - desmarcar `em_onboarding` → processo `encerrado` e demandas abertas apagadas;
  - `sincronizar_passos_onboarding()` duas vezes → nenhuma demanda duplicada.

---

### Task 3: Lógica pura `src/lib/processos.ts`

**Files:**
- Create: `src/lib/processos.ts`, `src/lib/processos.test.ts`

**Interfaces:**
- Produces:
  - `type TipoProcesso = "onboarding" | "roadmap"`
  - `interface PassoLogico { id: string; data: string | null; ordem: number; concluido_em: string | null }`
  - `ordenarPassos<T extends PassoLogico>(p: T[]): T[]`: com data primeiro, na ordem manual; depois os sem data, na ordem manual
  - `renumerar<T extends PassoLogico>(p: T[]): T[]`: ordem 0..n
  - `progresso(p: PassoLogico[]): number`: 0–100, inteiro
  - `previsaoTermino(p: PassoLogico[]): string | null`: a maior data
  - `proximoPasso(p: PassoLogico[]): string | null`: id do primeiro não concluído, na ordem já ordenada
  - `ordemValida(p: PassoLogico[]): boolean`
  - `passosEmConflito(depois: PassoLogico[], movidoId: string): string[]`
  - `posicaoParaNovoPasso(p: PassoLogico[], data: string | null): number`
  - `duracaoDias(inicioISO: string, fimISO: string): number`

- [ ] **Step 1: Testes**
```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  ordenarPassos, renumerar, progresso, previsaoTermino, proximoPasso, ordemValida, passosEmConflito,
  posicaoParaNovoPasso, duracaoDias,
} from "./processos.ts";

const p = (id: string, data: string | null, ordem: number, feito = false) => ({ id, data, ordem, concluido_em: feito ? "2026-09-20T10:00:00Z" : null });

test("ordenarPassos: com data na ordem manual, sem data no fim", () => {
  const r = ordenarPassos([p("s1", null, 0), p("a", "2026-09-25", 3), p("b", "2026-09-26", 1), p("s2", null, 2)]);
  assert.deepEqual(r.map((x) => x.id), ["b", "a", "s1", "s2"]);
});

test("renumerar", () => {
  assert.deepEqual(renumerar([p("a", null, 5), p("b", null, 9)]).map((x) => x.ordem), [0, 1]);
});

test("progresso e previsão", () => {
  const ps = [p("a", "2026-09-25", 0, true), p("b", "2026-10-02", 1), p("c", null, 2)];
  assert.equal(progresso(ps), 33);
  assert.equal(progresso([]), 0);
  assert.equal(previsaoTermino(ps), "2026-10-02");
  assert.equal(previsaoTermino([p("c", null, 0)]), null);
  assert.equal(proximoPasso(ps), "b");
  assert.equal(proximoPasso([p("a", null, 0, true)]), null);
});

test("ordemValida: datas não decrescentes e sem data só no fim", () => {
  assert.equal(ordemValida([p("a", "2026-09-25", 0), p("b", "2026-09-25", 1), p("c", null, 2)]), true);
  assert.equal(ordemValida([p("a", "2026-09-26", 0), p("b", "2026-09-25", 1)]), false);
  assert.equal(ordemValida([p("c", null, 0), p("a", "2026-09-25", 1)]), false);
});

test("passosEmConflito: movido + os que ele ultrapassou com datas invertidas", () => {
  // LP (amanhã) e Campanhas (sexta): arrastei Campanhas para antes da LP
  const depois = [p("camp", "2026-09-26", 0), p("lp", "2026-09-24", 1), p("rel", "2026-09-30", 2)];
  assert.deepEqual(passosEmConflito(depois, "camp").sort(), ["camp", "lp"]);
  assert.deepEqual(passosEmConflito([p("a", "2026-09-24", 0), p("b", "2026-09-26", 1)], "b"), []);
  // passo sem data arrastado para antes de passos datados: só ele precisa de data
  assert.deepEqual(passosEmConflito([p("s", null, 0), p("a", "2026-09-24", 1)], "s"), ["s"]);
});

test("posicaoParaNovoPasso: sem data no fim; com data depois dos que têm data <= ela", () => {
  const ps = [p("a", "2026-09-24", 0), p("b", "2026-09-28", 1), p("s", null, 2)];
  assert.equal(posicaoParaNovoPasso(ps, null), 3);
  assert.equal(posicaoParaNovoPasso(ps, "2026-09-25"), 1);
  assert.equal(posicaoParaNovoPasso(ps, "2026-09-30"), 2);
  assert.equal(posicaoParaNovoPasso(ps, "2026-09-01"), 0);
});

test("duracaoDias", () => {
  assert.equal(duracaoDias("2026-09-01T12:00:00Z", "2026-09-11T09:00:00Z"), 10);
});
```
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Implementar**
```ts
// Regras da trilha de passos (Onboarding e Roadmap). Datas são YYYY-MM-DD; passo sem data fica no fim.
export type TipoProcesso = "onboarding" | "roadmap";

export interface PassoLogico {
  id: string;
  data: string | null;
  ordem: number;
  concluido_em: string | null;
}

const porOrdem = (a: PassoLogico, b: PassoLogico) => a.ordem - b.ordem;

export function ordenarPassos<T extends PassoLogico>(p: T[]): T[] {
  return [...p.filter((x) => x.data).sort(porOrdem), ...p.filter((x) => !x.data).sort(porOrdem)];
}

export function renumerar<T extends PassoLogico>(p: T[]): T[] {
  return p.map((x, i) => ({ ...x, ordem: i }));
}

export function progresso(p: PassoLogico[]): number {
  if (!p.length) return 0;
  return Math.round((p.filter((x) => x.concluido_em).length * 100) / p.length);
}

export function previsaoTermino(p: PassoLogico[]): string | null {
  return p.reduce<string | null>((max, x) => (x.data && (!max || x.data > max) ? x.data : max), null);
}

export function proximoPasso(p: PassoLogico[]): string | null {
  return p.find((x) => !x.concluido_em)?.id ?? null;
}

export function ordemValida(p: PassoLogico[]): boolean {
  let semData = false;
  let ultima: string | null = null;
  for (const x of p) {
    if (!x.data) { semData = true; continue; }
    if (semData) return false;
    if (ultima && x.data < ultima) return false;
    ultima = x.data;
  }
  return true;
}

/** Depois de reordenar: quem precisa de data nova (o movido e os que ficaram com datas invertidas em relação a ele). */
export function passosEmConflito(depois: PassoLogico[], movidoId: string): string[] {
  if (ordemValida(depois)) return [];
  const idx = depois.findIndex((x) => x.id === movidoId);
  if (idx < 0) return [];
  const m = depois[idx];
  if (!m.data) return [movidoId];
  const ids = [movidoId];
  depois.forEach((x, i) => {
    if (x.id === movidoId || !x.data) return;
    if ((i < idx && x.data > m.data!) || (i > idx && x.data < m.data!)) ids.push(x.id);
  });
  return ids;
}

export function posicaoParaNovoPasso(p: PassoLogico[], data: string | null): number {
  if (!data) return p.length;
  let pos = 0;
  p.forEach((x, i) => { if (x.data && x.data <= data) pos = i + 1; });
  return pos;
}

export function duracaoDias(inicioISO: string, fimISO: string): number {
  const dia = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((dia(fimISO) - dia(inicioISO)) / 86_400_000);
}
```
- [ ] **Step 4:** `npm test` → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — "Onboarding/Roadmap: regras da trilha de passos".

---

### Task 4: Serviço de dados `src/lib/processosService.ts`

**Files:**
- Create: `src/lib/processosService.ts`

**Interfaces:**
- Consumes: `ordenarPassos`, `renumerar`, `posicaoParaNovoPasso`, `TipoProcesso` (Task 3); `supabase` de `@/integrations/supabase/client`.
- Produces (tipos e funções usados pelas Tasks 5–9):
```ts
export interface TemplatePasso { titulo: string; observacoes: string | null }
export interface Template { id: string; tipo: TipoProcesso; nome: string; passos: (TemplatePasso & { id: string; ordem: number })[]; created_at: string }
export interface Passo { id: string; processo_id: string; titulo: string; observacoes: string | null; data: string | null; ordem: number; concluido_em: string | null }
export interface ClienteResumo { id: string; nome: string; agencia: string | null; em_onboarding: boolean | null; trafego_ativo: boolean | null; onboarding_desde: string | null }
export interface RoadmapLigado { id: string; nome: string; status: string; passo_onboarding_id: string; progresso: number }
export interface Processo {
  id: string; tipo: TipoProcesso; cliente_id: string; nome: string; template_id: string | null;
  status: "ativo" | "concluido" | "encerrado"; iniciado_em: string; concluido_em: string | null;
  prazo_final: string | null; passo_onboarding_id: string | null;
  passos: Passo[];            // já ordenados (ordenarPassos)
  cliente: ClienteResumo;
}
export async function fetchTemplates(tipo: TipoProcesso): Promise<Template[]>
export async function salvarTemplate(t: { id?: string; tipo: TipoProcesso; nome: string; passos: TemplatePasso[] }): Promise<string>
export async function renomearTemplate(id: string, nome: string): Promise<void>
export async function duplicarTemplate(id: string): Promise<string>          // nome "<nome> (cópia)"
export async function excluirTemplate(id: string): Promise<void>
export async function fetchProcessos(tipo: TipoProcesso, situacao: "ativos" | "historico"): Promise<Processo[]>
export async function fetchRoadmapsLigados(passoIds: string[]): Promise<RoadmapLigado[]>
export async function fetchClientesEmOnboarding(): Promise<ClienteResumo[]>   // em_onboarding = true, arquivado = false, por nome
export async function fetchClientesAtivos(): Promise<ClienteResumo[]>          // arquivado = false, status_operacional = 'ativo', por nome
export async function criarProcesso(i: { tipo: TipoProcesso; cliente_id: string; nome: string; template_id?: string | null; prazo_final?: string | null; passo_onboarding_id?: string | null; iniciado_em?: string | null }): Promise<string>
export async function aplicarTemplate(processoId: string, templateId: string, modo: "substituir" | "acrescentar"): Promise<void>
export async function salvarComoTemplate(processo: Processo, nome: string): Promise<string>
export async function atualizarProcesso(id: string, patch: { nome?: string; prazo_final?: string | null; passo_onboarding_id?: string | null; template_id?: string | null }): Promise<void>
export async function encerrarProcesso(id: string): Promise<void>
export async function adicionarPasso(processo: Processo, i: { titulo: string; data?: string | null; observacoes?: string | null }): Promise<void>
export async function atualizarPasso(id: string, patch: { titulo?: string; observacoes?: string | null; data?: string | null }): Promise<void>
export async function alternarConclusaoPasso(id: string, concluir: boolean): Promise<void>
export async function excluirPasso(id: string): Promise<void>
export async function salvarOrdem(passos: { id: string; ordem: number; data?: string | null }[]): Promise<void>
export async function concluirOnboarding(processo: Processo, ativarTrafego: boolean): Promise<void>
export interface VerbaPrincipal { operacaoId: string | null; moeda: string; plataforma: string | null; valor: number; plataformasConfiguradas: string[] }
export async function fetchVerbaPrincipal(clienteId: string): Promise<VerbaPrincipal>
export async function salvarVerbaPrincipal(clienteId: string, plataforma: string, valor: number): Promise<void>
```

Regras de implementação (obrigatórias):
- **`fetchProcessos`:**
  - select `*, passos:processo_passos(*), cliente:clientes(id, nome, agencia, em_onboarding, trafego_ativo, onboarding_desde)`;
  - filtro `tipo`;
  - `situacao === "ativos"` → `status = 'ativo'`, senão `status in ('concluido', 'encerrado')`, ordenado por `concluido_em desc`;
  - `passos` passam por `ordenarPassos`.
- **`criarProcesso`:**
  - insere o processo (onboarding: `iniciado_em` = `i.iniciado_em ?? now`);
  - se houver `template_id`, copia os passos do template (título e observações, `ordem` = a do template, `data` null).
- **`aplicarTemplate("substituir")`:** apaga todos os passos do processo antes de copiar. A UI só oferece essa opção quando nenhum passo está concluído. **"acrescentar"** insere depois do maior `ordem` existente. Nos dois casos, `template_id` do processo = `templateId` e `nome` = nome do template.
- **`salvarComoTemplate`:** cria o template (tipo do processo) com os passos na ordem atual e depois `atualizarProcesso(processo.id, { template_id, nome })`.
- **`adicionarPasso`:**
  - `pos = posicaoParaNovoPasso(processo.passos, data)`;
  - reescreve `ordem` dos passos existentes a partir de `pos` (+1) com `salvarOrdem`;
  - insere o novo com `ordem = pos`.
- **`alternarConclusaoPasso`:** `concluido_em = concluir ? new Date().toISOString() : null`.
- **`salvarOrdem`:** um update por passo (`Promise.all`); lança o primeiro erro.
- **`concluirOnboarding`:**
  1. **primeiro** `processos.update({ status: 'concluido', concluido_em: now })`;
  2. **depois** `clientes.update({ em_onboarding: false, ...(ativarTrafego ? { trafego_ativo: true } : {}) })`.

  A ordem importa: o trigger do cliente só encerra processos que ainda estão `ativo`.
- **`fetchVerbaPrincipal`:**
  - operação principal = primeira `operacoes` do cliente com `ativa = true`, por `ordem` (asc);
  - `plataformasConfiguradas` = chaves de `plataformas_config`;
  - `plataforma` = primeira chave (ou null);
  - `valor` = `plataformas_config[plataforma].verba` (0 se não houver);
  - `moeda` = `operacao.moeda` (padrão "BRL").
- **`salvarVerbaPrincipal`:**
  - se não existe operação, insere uma: `{ cliente_id, nome: "Principal", moeda: "BRL", tipo_verba: "mensal", ordem: 0, ativa: true, plataformas_config: { [plataforma]: { verba: valor, metodo_pagamento: "pix" } }, verba_ads: valor }`;
  - senão, atualiza `plataformas_config[plataforma] = { ...atual, verba: valor, metodo_pagamento: atual?.metodo_pagamento ?? "pix" }`, `tipo_verba = "mensal"` e `verba_ads` = soma das `verba` de todas as plataformas da operação.
- **Erros:** toda função lança o erro do Supabase (a UI mostra o toast). Use `as any` nos `.from("…")` das tabelas novas se o `types.ts` gerar atrito.

- [ ] **Step 1:** implemente o arquivo seguindo as regras acima.
- [ ] **Step 2:** `npx tsc --noEmit` limpo.
- [ ] **Step 3: Commit** — "Onboarding/Roadmap: serviço de dados".

---

### Task 5: Componentes da trilha

**Files:**
- Create:
  - `src/components/processos/Trilha.tsx`
  - `src/components/processos/PassoPainel.tsx`
  - `src/components/processos/DatasInvertidasDialog.tsx`
  - `src/components/processos/NovoPassoForm.tsx`

**Interfaces:**
- Consumes: Tasks 3 e 4; `hojeBrasilia`, `diasDeAtraso`, `formatarDataCurta` de `@/lib/entrega`.
- Produces:
```tsx
<Trilha
  processo={Processo}
  roadmaps={RoadmapLigado[]}                 // só no onboarding (passos ligados a roadmap)
  somenteLeitura?: boolean
  onMudou={() => void}                       // recarregar após qualquer gravação
  onAbrirRoadmap?: (roadmapId: string) => void
/>
<PassoPainel passo={Passo | null} tipo={TipoProcesso} roadmap={RoadmapLigado | null} onClose onSalvo onAbrirRoadmap? />
<DatasInvertidasDialog aberto passos={Passo[] /* na nova ordem */} idsEmConflito={string[]} onSalvar(datas: Record<string, string | null>) onCancelar />
<NovoPassoForm onAdicionar(i: { titulo: string; data: string | null; observacoes: string | null }) />
```

**Comportamento obrigatório:**
- **Layout da Trilha:** horizontal, com rolagem (`overflow-x-auto`). Cada passo é um nó de 40px ligado ao próximo por uma linha de 2px.
  - A linha fica verde entre nós concluídos e cinza nos demais.
  - O trecho **tracejado** marca o início dos passos sem data.
- **Nó:**
  - concluído: círculo verde (`bg-emerald-500`) com ✓;
  - próximo passo (`proximoPasso`): anel `ring-2 ring-primary` e leve pulso;
  - atrasado (`diasDeAtraso(data, hojeBrasilia()) > 0` e não concluído): vermelho (`bg-red-500`);
  - pendente: `bg-muted` com borda.
  - Ícone `Map` pequeno no nó se o passo tem roadmap ligado.
- **Abaixo do nó:**
  - título, 2 linhas no máximo, largura ~120px, clicável → abre `PassoPainel`;
  - data curta ("26/09") ou "sem data" em itálico;
  - se tem roadmap ligado, "Roadmap 62%", clicável → `onAbrirRoadmap(roadmap.id)`.
- **Clique no círculo:** `alternarConclusaoPasso` e depois `onMudou()`. Com `somenteLeitura`, nada é clicável nem arrastável.
- **Reordenar:** `DndContext` + `SortableContext` com `horizontalListSortingStrategy` e `PointerSensor` com `activationConstraint: { distance: 6 }`, para o clique continuar funcionando. No `onDragEnd`:
  1. calcule `depois` com `arrayMove`;
  2. `conflito = passosEmConflito(depois, activeId)`;
  3. se vazio: `salvarOrdem(renumerar(ordenarPassos(renumerar(depois))))` e depois `onMudou()`;
  4. se não: abra `DatasInvertidasDialog` com `depois` e `conflito`. Salvar aplica as datas novas, depois `renumerar(ordenarPassos(...))` e `salvarOrdem` (com `data`) e `onMudou()`. Cancelar não grava nada.
- **`DatasInvertidasDialog`:**
  - explica: "Você trocou a ordem de passos com datas. Escolha a nova data de cada um para os prazos não ficarem invertidos.";
  - lista os passos em conflito na nova ordem, cada um com o título e um input `type="date"` pré-preenchido com a data atual, mais um botão "sem data";
  - mostra o aviso "As datas ainda estão fora de ordem" enquanto `ordemValida` (lista inteira com as datas novas) for falso;
  - "Salvar" fica desabilitado nesse caso.
- **Fim da trilha:** botão "+ passo" (círculo tracejado) que abre um `Popover` com `NovoPassoForm`: título obrigatório, data opcional e observações opcionais, com o texto "Data recomendada".
  - Grava com `adicionarPasso` e depois `onMudou()`.
  - Se ficar sem data: toast informativo "Passo sem data vai para o fim da trilha".
- **`PassoPainel` (Sheet à direita):**
  - campos título, data (com "limpar") e observações (textarea), salvos no blur com `atualizarPasso` e `onSalvo()`;
  - status (concluído em dd/MM ou pendente) com o botão concluir/desfazer;
  - no onboarding: o bloco "Roadmap ligado" com nome, % e botão "Abrir roadmap", ou o texto "Nenhum roadmap ligado — crie na aba Roadmap";
  - "Excluir passo", com confirmação (AlertDialog): `excluirPasso` e depois `onSalvo()`, fechando o painel;
  - aviso fixo no onboarding: "Passos com data entram em Demandas quando faltarem até N dias" (N vem de `useConfig("onboarding_janela_dias", 2)`).
- **Onboarding, passo com roadmap ligado ainda não 100%:** ao concluir o passo pelo círculo, mostra `toast.warning("O roadmap ligado ainda não está 100%")`, mas conclui assim mesmo.

- [ ] **Step 1:** implemente os quatro componentes.
- [ ] **Step 2:** `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — "Onboarding/Roadmap: trilha horizontal com reordenação, painel do passo e popup de datas".

---

### Task 6: Templates e Histórico (compartilhados)

**Files:**
- Create:
  - `src/components/processos/TemplateEditorDialog.tsx`
  - `src/components/processos/TemplatesView.tsx`
  - `src/components/processos/HistoricoView.tsx`
  - `src/components/processos/EscolherTemplateDialog.tsx`

**Interfaces:**
```tsx
<TemplateEditorDialog aberto tipo={TipoProcesso} template={Template | null /* null = novo */} onClose onSalvo />
<TemplatesView tipo={TipoProcesso} />
<HistoricoView tipo={TipoProcesso} />
<EscolherTemplateDialog aberto tipo processoTemConcluidos={boolean} onEscolher(templateId: string, modo: "substituir" | "acrescentar") onClose />
```

**Comportamento obrigatório:**
- **`TemplateEditorDialog`:**
  - campo "Nome do template", obrigatório;
  - lista de passos com input de título, botão para expandir as observações (textarea), alça de arrastar (dnd-kit vertical) e botão excluir;
  - "+ Adicionar passo" cria "Demanda N" já selecionado para renomear;
  - "Salvar template" exige nome e pelo menos 1 passo com título; usa `salvarTemplate` e depois o toast "Template salvo".
  - Template novo abre com 2 passos: "Demanda 1" e "Demanda 2".
- **`TemplatesView`:**
  - cabeçalho com texto de ajuda ("Crie quantos templates quiser. Eles não têm datas — as datas você coloca ao aplicar no cliente.") e botão "Criar template";
  - grade de cards: nome, "N passos", os 3 primeiros passos em lista e um menu ⋯ (Editar, Renomear, Duplicar, Excluir). Renomear abre um diálogo pequeno; Excluir confirma com "Processos que já usaram este template não mudam.";
  - estado vazio amigável.
- **`HistoricoView`:**
  - tabela (Table do shadcn) com Cliente, Processo/template, Início, Conclusão, Duração (dias, com `duracaoDias`), Passos (feitos/total) e Situação (badge verde "Concluído" / cinza "Encerrado");
  - busca por cliente e filtro de período ("Últimos 30 dias", "Este ano", "Tudo");
  - clicar numa linha abre um Dialog largo com a `Trilha` em `somenteLeitura`;
  - dados de `fetchProcessos(tipo, "historico")`.
- **`EscolherTemplateDialog`:**
  - lista os templates do tipo, com nome e nº de passos;
  - radio "Substituir os passos" / "Acrescentar ao fim". "Substituir" fica desabilitado, com explicação, quando `processoTemConcluidos`;
  - atalho "Criar template novo" que abre o `TemplateEditorDialog`.

- [ ] **Step 1:** implemente.
- [ ] **Step 2:** `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — "Onboarding/Roadmap: templates e histórico".

---

### Task 7: Aba Onboarding

**Files:**
- Create: `src/routes/_authenticated/onboarding.tsx`, `src/components/processos/ProcessoCard.tsx`, `src/components/processos/VerbaOnboarding.tsx`, `src/components/processos/ConcluirOnboardingDialog.tsx`
- Modify: `src/routes/_authenticated.tsx` (menu: Onboarding e Roadmap logo abaixo de Demandas, ícones `Rocket` e `Map` do lucide), `src/routeTree.gen.ts` (regenerado)

**Interfaces:**
- Rota: `createFileRoute("/_authenticated/onboarding")`, com `validateSearch` → `{ cliente?: string; aba?: "andamento" | "templates" | "historico" }`.
- `ProcessoCard`, usado também pelo Roadmap:
```tsx
<ProcessoCard
  processo={Processo}
  roadmaps={RoadmapLigado[]}
  destaque?: boolean                      // vindo de ?cliente= / ?id=
  extraCabecalho?: React.ReactNode        // verba (onboarding) ou prazo final (roadmap)
  acoesMenu?: React.ReactNode             // itens extras do menu ⋯
  onMudou={() => void}
  onAbrirRoadmap?: (id: string) => void
/>
```

**Comportamento obrigatório:**
- **Página:** título "Onboarding", subtítulo "Clientes marcados como em onboarding e os próximos passos de cada um". Abas **Em andamento · Templates · Histórico** (Tabs), sincronizadas com `?aba=`.
- **Em andamento:**
  - carregue `fetchClientesEmOnboarding()` e `fetchProcessos("onboarding","ativos")`, e depois `fetchRoadmapsLigados(todos os passo ids)`;
  - para cada cliente em onboarding: o `ProcessoCard` se ele tem processo ativo; senão, um card de **estado vazio**, com o nome do cliente, "Entrou em dd/MM" e os botões **"Usar template"** (`EscolherTemplateDialog`, que cria o processo com `criarProcesso({ tipo: "onboarding", cliente_id, nome: template.nome, template_id, iniciado_em: cliente.onboarding_desde })`) e **"Começar do zero"** (`criarProcesso` com o nome "Personalizado");
  - sem clientes: estado vazio que explica "Marque 'Em onboarding' no cadastro do cliente (aba Clientes Ativos) para ele aparecer aqui", com um botão que leva a `/clientes`;
  - `?cliente=<id>` rola até o card e o destaca (`ring-2 ring-primary` por 3s).
- **`ProcessoCard`:**
  - card largo com cabeçalho: nome do cliente (grande), badge com o nome do processo ou "Personalizado", "Entrou em dd/MM", `Progress` + "%", "Previsão de término dd/MM" (onboarding, `previsaoTermino`) e contador "N atrasado(s)" em vermelho;
  - `extraCabecalho` à direita;
  - corpo: `Trilha`;
  - menu ⋯: Aplicar template, Salvar como template (Dialog pedindo o nome, com o nome atual preenchido), Renomear, `acoesMenu` e "Encerrar sem concluir" (AlertDialog; onboarding: "O cliente continua marcado como em onboarding? Não — ele sai da aba e o processo vai para o Histórico como encerrado." → `encerrarProcesso` e depois `clientes.update({ em_onboarding: false })`);
  - quando `progresso === 100` e é onboarding: faixa verde "Todos os passos concluídos" com o botão **"Concluir onboarding"**, que abre `ConcluirOnboardingDialog`.
- **`VerbaOnboarding`** (vai em `extraCabecalho`): mostra "Verba mensal" com o valor formatado (`formatMoeda` de `@/lib/moedas`) e o nome da plataforma.
  - Clicar abre um Popover com Select de plataforma (`usePlataformas()` de `@/lib/plataformas`), input numérico e "Salvar" (`salvarVerbaPrincipal`), além do link "Editar no cadastro", que navega para `/clientes`.
  - Sem verba: "Definir verba".
- **`ConcluirOnboardingDialog`:**
  - resumo: cliente, "Entrou em", "Concluído hoje", duração e verba (editável ali mesmo com o mesmo controle);
  - texto: "O cliente sai do onboarding e passa a ter tráfego ativo com essa verba mensal." (se `onboarding_ativa_trafego` for false: "O cliente sai do onboarding.");
  - confirmar: `concluirOnboarding(processo, ativa)`, depois o toast "Onboarding de X concluído 🎉" e `onMudou()`.
- **Menu lateral:** em `NAV_GROUPS`, grupo "Operação", logo após Demandas:
  - `{ label: "Onboarding", icon: <Rocket size={17} />, to: "/onboarding" }`;
  - `{ label: "Roadmap", icon: <Map size={17} />, to: "/roadmap" }`.

  O import de `Map` do lucide conflita com o `Map` global. Importe como `Map as MapIcon`.

- [ ] **Step 1:** implemente e regenere o `routeTree.gen.ts`.
- [ ] **Step 2:** `npx tsc --noEmit` e `npm test`.
- [ ] **Step 3: Commit** — "Aba Onboarding: trilha por cliente, templates, verba, conclusão e histórico".

---

### Task 8: Aba Roadmap

**Files:**
- Create: `src/routes/_authenticated/roadmap.tsx`, `src/components/processos/NovoRoadmapDialog.tsx`, `src/components/processos/LigarPassoDialog.tsx`

**Interfaces:**
- Rota `createFileRoute("/_authenticated/roadmap")`, com `validateSearch` → `{ id?: string; aba?: "andamento" | "templates" | "historico" }`.

**Comportamento obrigatório:**
- **Página:** título "Roadmap", subtítulo "Projetos de longo prazo de cada cliente, passo a passo". Mesmas abas e as mesmas `TemplatesView tipo="roadmap"` e `HistoricoView tipo="roadmap"`.
- **Em andamento:**
  - botão **"Novo roadmap"**;
  - lista de `ProcessoCard` com `fetchProcessos("roadmap","ativos")`, agrupados por cliente (título do grupo = nome do cliente);
  - `extraCabecalho`: "Prazo final dd/MM", editável por Popover+Calendar (`atualizarProcesso({ prazo_final })`). Quando o roadmap está ligado a um passo, mostra "(do onboarding)" e explica, num tooltip, que mudar aqui muda a data do passo;
  - `acoesMenu`: "Ligar a um passo do onboarding" / "Desligar do onboarding";
  - `?id=` rola até o card e o destaca.
- **`NovoRoadmapDialog`:**
  - Cliente: um Select com filtro em dois botões, **"Em onboarding"** (`fetchClientesEmOnboarding`) e **"Em andamento"** (`fetchClientesAtivos` sem os em onboarding);
  - nome do roadmap (obrigatório);
  - base: "Template" (lista de `fetchTemplates("roadmap")`) ou "Começar do zero";
  - prazo final opcional;
  - "Ligar a um passo do onboarding" (opcional, só se o cliente tem onboarding ativo): Select com os passos do onboarding ativo daquele cliente que ainda não têm roadmap;
  - criar: `criarProcesso({ tipo: "roadmap", ... })`.
- **`LigarPassoDialog`:** o mesmo select de passos, gravando com `atualizarProcesso(id, { passo_onboarding_id })`. Desligar = `null`.
- **Roadmap concluído a 100%:** o banco já o move para "concluido". A lista recarrega (`onMudou`) e ele some de Em andamento, com o toast "Roadmap X concluído — foi para o Histórico".

- [ ] **Step 1:** implemente e regenere o `routeTree.gen.ts`.
- [ ] **Step 2:** `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — "Aba Roadmap: projetos por cliente ligados ao onboarding".

---

### Task 9: Kanban — tags Onboarding/Roadmap e navegação

**Files:**
- Modify: `src/components/KanbanCard.tsx`, `src/components/KanbanColumn.tsx` (interface `Demanda`)

**Comportamento obrigatório:**
- Interface `Demanda`: + `processo_passo_id?: string | null; roadmap_id?: string | null`. O `loadDemandas` já faz `select *`.
- Selos na linha de selos, antes do cliente:
  - `processo_passo_id` → selo **"Onboarding"** em destaque (`bg-emerald-500 text-white`, ícone `Rocket`), clicável: `navigate({ to: "/onboarding", search: { cliente: demanda.cliente_id } })`, com `stopPropagation`;
  - `roadmap_id` → selo **"Roadmap"** (`bg-indigo-500 text-white`, ícone `MapIcon`).
- **Card com `roadmap_id`:** o clique no card (fora do menu e do checkbox) navega para `/roadmap?id=<roadmap_id>` em vez de abrir o painel. "Detalhes" no menu ⋯ continua abrindo o painel.
- Use `useNavigate` do `@tanstack/react-router` dentro do `KanbanCardView`. Ele também é renderizado no DragOverlay, dentro do mesmo router, então funciona.
- A tag do cliente e o vermelho de atraso já existem (Plano A).

- [ ] **Step 1:** implemente.
- [ ] **Step 2:** `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — "Demandas: tags Onboarding e Roadmap nos cards, com atalho para as abas".

---

### Task 10 (controlador): verificação no navegador

Roteiro no app local (`vite dev`), com um cliente de teste criado e removido no fim:
1. Marcar "Em onboarding" no cliente de teste.
2. Criar um template com 3 passos.
3. Aplicar o template; datar os passos com hoje+1 e hoje+5; deixar um sem data.
4. Ver a demanda em "Fazer amanhã" com as tags Onboarding e cliente.
5. Mover o card para "Fazer hoje": a data na trilha muda. Mover para Standby: o passo fica sem data e vai para o fim.
6. Criar um roadmap ligado ao passo 2 e concluir os passos do roadmap: o passo 2 é concluído.
7. Reordenar com datas invertidas: o popup aparece.
8. Concluir tudo e depois "Concluir onboarding": o cliente fica em tráfego ativo com a verba, e o processo aparece no Histórico.
9. Apagar o cliente de teste.
