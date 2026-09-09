-- Migrations que AINDA NAO foram aplicadas no Supabase (4 de 04/09 + plataformas de 09/09; verificado em 09/09/2026).
-- Como usar: abra o SQL Editor do projeto bnpvzguapunsztsdvmrs, cole este arquivo inteiro e clique em Run.
-- Roda tudo em uma transacao: se qualquer passo falhar, nada e alterado.
-- Sem isso: nao da para cadastrar clientes da AZO (enum antigo), a aba Acessos, as colunas do Kanban e as plataformas falham.
-- Depois de rodar com sucesso, este arquivo pode ser apagado.

BEGIN;

-- ============================================================
-- 20260904120000_acessos_clientes.sql
-- ============================================================
-- Tabela de acessos (planilhas e CRMs) dos clientes
CREATE TABLE IF NOT EXISTS public.acessos_clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    agencia TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('planilha', 'crm')),
    link TEXT NOT NULL,
    login TEXT,
    senha TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.acessos_clientes IS 'Links de planilhas e credenciais de CRM dos clientes, por agência';
COMMENT ON COLUMN public.acessos_clientes.tipo IS 'planilha = apenas link; crm = link + login/senha';

ALTER TABLE public.acessos_clientes ENABLE ROW LEVEL SECURITY;

-- Credenciais são sensíveis: cada usuário só enxerga os próprios registros
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own acessos' AND tablename = 'acessos_clientes') THEN
        CREATE POLICY "Users can manage their own acessos"
        ON public.acessos_clientes
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_acessos_clientes_updated_at') THEN
        CREATE TRIGGER set_acessos_clientes_updated_at
        BEFORE UPDATE ON public.acessos_clientes
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- ============================================================
-- 20260904130000_demanda_colunas.sql
-- ============================================================
-- Colunas do Kanban de demandas passam a ser configuráveis pelo usuário.
-- 1) Tabela de colunas
CREATE TABLE IF NOT EXISTS public.demanda_colunas (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    hex TEXT NOT NULL DEFAULT '#64748b',
    ordem INTEGER NOT NULL DEFAULT 0,
    sistema BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.demanda_colunas IS 'Colunas do Kanban de demandas (id = valor gravado em demandas.status)';
COMMENT ON COLUMN public.demanda_colunas.sistema IS 'Colunas com comportamento especial no app (recorrentes, feito): podem ser renomeadas, mas não excluídas';

-- Colunas padrão (as que existiam no enum)
INSERT INTO public.demanda_colunas (id, titulo, hex, ordem, sistema) VALUES
    ('recorrentes',         'Recorrentes',            '#64748b', 0, true),
    ('fazer_hoje',          'Fazer hoje',             '#ef4444', 1, false),
    ('fazer_amanha',        'Fazer amanhã',           '#eab308', 2, false),
    ('fazer_depois_amanha', 'Fazer depois de amanhã', '#f97316', 3, false),
    ('standby',             'Standby',                '#3b82f6', 4, false),
    ('feito',               'Feito',                  '#22c55e', 5, true)
ON CONFLICT (id) DO NOTHING;

-- Segue o mesmo modelo compartilhado da tabela demandas (RLS desabilitado nela)
ALTER TABLE public.demanda_colunas ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'demanda_colunas_all' AND tablename = 'demanda_colunas') THEN
        CREATE POLICY "demanda_colunas_all" ON public.demanda_colunas FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_demanda_colunas_updated_at') THEN
        CREATE TRIGGER set_demanda_colunas_updated_at
        BEFORE UPDATE ON public.demanda_colunas
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- 2) demandas.status: enum -> texto (a view clientes_view depende da coluna, então é recriada)
-- Guarda as opções atuais da view (ex.: security_invoker) para reaplicar depois de recriar
CREATE TEMP TABLE IF NOT EXISTS _clientes_view_opts AS
SELECT array_to_string(c.reloptions, ', ') AS opts
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'clientes_view' AND c.relkind = 'v';

DROP VIEW IF EXISTS public.clientes_view;

ALTER TABLE public.demandas ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.demandas ALTER COLUMN status TYPE TEXT USING status::text;
ALTER TABLE public.demandas ALTER COLUMN status SET DEFAULT 'fazer_hoje';

DROP TYPE IF EXISTS public.demanda_status;

-- Garante integridade: status sempre aponta para uma coluna existente.
-- Excluir uma coluna remove as demandas dela (o app confirma antes).
ALTER TABLE public.demandas
    ADD CONSTRAINT demandas_status_fkey
    FOREIGN KEY (status) REFERENCES public.demanda_colunas(id)
    ON UPDATE CASCADE ON DELETE CASCADE;

CREATE OR REPLACE VIEW public.clientes_view AS
 SELECT c.id,
    c.nome,
    c.agencia,
    c.nicho,
    c.data_inicio,
    c.verba_ads,
    c.observacoes,
    c.arquivado,
    c.em_onboarding,
    c.status_operacional,
    c.tipo_verba,
    c.verba_total_contratada,
    c.data_limite_verba,
    ( SELECT n.score_total
           FROM nps_avaliacoes n
          WHERE (n.cliente_id = c.id)
          ORDER BY n.data_avaliacao DESC, n.created_at DESC
         LIMIT 1) AS ultima_nps_score,
    ( SELECT n.data_avaliacao
           FROM nps_avaliacoes n
          WHERE (n.cliente_id = c.id)
          ORDER BY n.data_avaliacao DESC, n.created_at DESC
         LIMIT 1) AS ultima_nps_data,
    COALESCE(( SELECT
                CASE
                    WHEN (n.score_total >= (45)::numeric) THEN 'ancora'::text
                    WHEN (n.score_total >= (35)::numeric) THEN 'saudavel'::text
                    WHEN (n.score_total >= (25)::numeric) THEN 'em_risco'::text
                    ELSE 'critico'::text
                END AS nps_status
           FROM nps_avaliacoes n
          WHERE (n.cliente_id = c.id)
          ORDER BY n.data_avaliacao DESC, n.created_at DESC
         LIMIT 1), 'sem_avaliacao'::text) AS nps_status,
    ( SELECT count(*) AS count
           FROM demandas d
          WHERE ((d.cliente_id = c.id) AND (d.status <> ALL (ARRAY['concluido'::text, 'cancelado'::text, 'feito'::text])))) AS demandas_ativas,
    'em_dia'::text AS status_pagamento_mes
   FROM clientes c;
ALTER VIEW public.clientes_view OWNER TO postgres;

DO $
DECLARE
    o TEXT;
BEGIN
    SELECT opts INTO o FROM _clientes_view_opts LIMIT 1;
    IF o IS NOT NULL AND o <> '' THEN
        EXECUTE format('ALTER VIEW public.clientes_view SET (%s)', o);
    END IF;
END $;

DROP TABLE IF EXISTS _clientes_view_opts;

-- ============================================================
-- 20260904140000_agencias.sql
-- ============================================================
-- Agências passam a ser configuráveis (tabela) em vez de enum fixo.
-- 1) Tabela de agências
CREATE TABLE IF NOT EXISTS public.agencias (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    hex TEXT NOT NULL DEFAULT '#64748b',
    ordem INTEGER NOT NULL DEFAULT 0,
    ativa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agencias IS 'Agências/empresas às quais os clientes pertencem (id = valor gravado em clientes.agencia)';

INSERT INTO public.agencias (id, nome, hex, ordem) VALUES
    ('effect',   'Effect',   '#3b82f6', 0),
    ('spike',    'Spike',    '#8b5cf6', 1),
    ('alt',      'Alt',      '#f59e0b', 2),
    ('pessoais', 'Pessoais', '#10b981', 3),
    ('azo',      'AZO',      '#f43f5e', 4)
ON CONFLICT (id) DO NOTHING;

-- Mesmo modelo compartilhado da tabela clientes (RLS desabilitado nela)
ALTER TABLE public.agencias ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agencias_all' AND tablename = 'agencias') THEN
        CREATE POLICY "agencias_all" ON public.agencias FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_agencias_updated_at') THEN
        CREATE TRIGGER set_agencias_updated_at
        BEFORE UPDATE ON public.agencias
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- 2) clientes.agencia: enum -> texto.
-- As views que dependem de clientes (clientes_view, saldo_ads_view, nps_avaliacoes_view, ...)
-- são recriadas a partir da definição que está no banco, preservando opções (security_invoker).
DO $$
DECLARE
    v RECORD;
    defs JSONB := '[]'::jsonb;
    opts TEXT;
BEGIN
    -- Views do schema public que dependem da tabela clientes, direta ou indiretamente
    -- (uma view que usa outra view que usa clientes também cairia no CASCADE).
    -- Ordenadas por nível de dependência para a recriação respeitar a ordem.
    FOR v IN
        WITH RECURSIVE deps AS (
            SELECT c.oid, 0 AS nivel
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_rewrite r ON r.ev_class = c.oid
            JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = 'public.clientes'::regclass
            WHERE n.nspname = 'public' AND c.relkind = 'v'
            UNION
            SELECT c.oid, deps.nivel + 1
            FROM deps
            JOIN pg_depend d ON d.refobjid = deps.oid
            JOIN pg_rewrite r ON r.oid = d.objid
            JOIN pg_class c ON c.oid = r.ev_class AND c.oid <> deps.oid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'v'
        )
        SELECT c.oid, c.relname, pg_get_viewdef(c.oid, true) AS def, c.reloptions, max(deps.nivel) AS nivel
        FROM deps
        JOIN pg_class c ON c.oid = deps.oid
        GROUP BY c.oid, c.relname, c.reloptions
        ORDER BY max(deps.nivel), c.oid
    LOOP
        defs := defs || jsonb_build_object('name', v.relname, 'def', v.def, 'opts', to_jsonb(v.reloptions));
    END LOOP;

    FOR v IN SELECT * FROM jsonb_to_recordset(defs) AS x(name TEXT, def TEXT, opts JSONB) LOOP
        EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', v.name);
    END LOOP;

    ALTER TABLE public.clientes ALTER COLUMN agencia DROP DEFAULT;
    ALTER TABLE public.clientes ALTER COLUMN agencia TYPE TEXT USING agencia::text;
    ALTER TABLE public.clientes ALTER COLUMN agencia SET DEFAULT 'effect';

    FOR v IN SELECT * FROM jsonb_to_recordset(defs) AS x(name TEXT, def TEXT, opts JSONB) LOOP
        EXECUTE format('CREATE VIEW public.%I AS %s', v.name, v.def);
        IF v.opts IS NOT NULL AND jsonb_typeof(v.opts) = 'array' THEN
            SELECT string_agg(e, ', ') INTO opts FROM jsonb_array_elements_text(v.opts) e;
            IF opts IS NOT NULL THEN
                EXECUTE format('ALTER VIEW public.%I SET (%s)', v.name, opts);
            END IF;
        END IF;
    END LOOP;
END $$;

DROP TYPE IF EXISTS public.agencia_enum;

-- Integridade: cliente sempre aponta para uma agência existente.
-- Não permite excluir agência com clientes (o app mostra a contagem).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_agencia_fkey') THEN
        ALTER TABLE public.clientes
            ADD CONSTRAINT clientes_agencia_fkey
            FOREIGN KEY (agencia) REFERENCES public.agencias(id)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;

-- 3) prospeccao.agencia_destino: remove o CHECK fixo e passa a referenciar agencias
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'public.prospeccao'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%agencia_destino%'
    LIMIT 1;
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.prospeccao DROP CONSTRAINT %I', cname);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospeccao_agencia_destino_fkey') THEN
        ALTER TABLE public.prospeccao
            ADD CONSTRAINT prospeccao_agencia_destino_fkey
            FOREIGN KEY (agencia_destino) REFERENCES public.agencias(id)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================
-- 20260904150000_saldo_calculo.sql
-- ============================================================
-- Monitor de saldo: cálculo recarga a recarga, previsão de término e dispensa de alertas.

-- 1) Dispensa de alerta (o alerta volta automaticamente quando houver nova recarga)
ALTER TABLE public.saldo_ads ADD COLUMN IF NOT EXISTS alerta_dispensado_em TIMESTAMPTZ;
COMMENT ON COLUMN public.saldo_ads.alerta_dispensado_em IS 'Quando o usuário dispensou o alerta atual; ignorado se houver recarga posterior';

-- 2) Saldo atual estimado, considerando cada recarga na data em que ocorreu:
--    a cada recarga, desconta o consumo diário desde a recarga anterior (nunca abaixo de zero)
--    e soma o valor; ao final desconta o consumo desde a última recarga até hoje.
CREATE OR REPLACE FUNCTION public.calcular_saldo_atual(p_saldo_ads_id UUID, p_verba_diaria NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    r RECORD;
    bal NUMERIC := 0;
    prev DATE := NULL;
    vd NUMERIC := GREATEST(COALESCE(p_verba_diaria, 0), 0);
BEGIN
    FOR r IN
        SELECT data_recarga, valor
        FROM public.recargas
        WHERE saldo_ads_id = p_saldo_ads_id
        ORDER BY data_recarga, created_at
    LOOP
        IF prev IS NOT NULL THEN
            bal := GREATEST(0, bal - vd * (r.data_recarga - prev));
        END IF;
        bal := bal + COALESCE(r.valor, 0);
        prev := r.data_recarga;
    END LOOP;

    IF prev IS NULL THEN
        RETURN 0;
    END IF;

    RETURN GREATEST(0, bal - vd * GREATEST(0, CURRENT_DATE - prev));
END;
$$;

-- 3) View recriada com previsão de término e flag de alerta dispensado
DROP VIEW IF EXISTS public.saldo_ads_view;

CREATE VIEW public.saldo_ads_view
WITH (security_invoker = true) AS
WITH base AS (
    SELECT
        s.id,
        s.user_id,
        s.cliente_id,
        c.nome AS cliente_nome,
        c.agencia AS cliente_agencia,
        c.status_operacional AS cliente_status_operacional,
        s.metodo_pagamento,
        s.plataformas,
        s.verba_diaria,
        s.ativo,
        s.observacoes,
        s.created_at,
        s.updated_at,
        s.alerta_dispensado_em,
        CASE
            WHEN c.tipo_verba = 'total_periodo'::tipo_verba_enum
                AND c.verba_total_contratada IS NOT NULL
                AND c.data_inicio IS NOT NULL
                AND c.data_limite_verba IS NOT NULL
            THEN round((c.verba_total_contratada / NULLIF(EXTRACT(day FROM (c.data_limite_verba::timestamp - c.data_inicio::timestamp)), 0))::numeric, 2)
            ELSE s.verba_diaria
        END AS verba_diaria_calc,
        COALESCE((SELECT sum(r.valor) FROM public.recargas r WHERE r.saldo_ads_id = s.id), 0) AS saldo_total_acumulado,
        (SELECT count(*) FROM public.recargas r WHERE r.saldo_ads_id = s.id) AS qtd_recargas,
        (SELECT max(r.data_recarga) FROM public.recargas r WHERE r.saldo_ads_id = s.id) AS data_ultima_recarga,
        (SELECT r.valor FROM public.recargas r WHERE r.saldo_ads_id = s.id ORDER BY r.data_recarga DESC, r.created_at DESC LIMIT 1) AS valor_ultima_recarga
    FROM public.saldo_ads s
    JOIN public.clientes c ON s.cliente_id = c.id
    WHERE c.arquivado = false
),
calc AS (
    SELECT
        b.*,
        public.calcular_saldo_atual(b.id, b.verba_diaria_calc) AS saldo_atual_estimado
    FROM base b
),
calc2 AS (
    SELECT
        c.*,
        CASE
            WHEN c.verba_diaria_calc > 0 AND c.qtd_recargas > 0
            THEN c.saldo_atual_estimado / c.verba_diaria_calc
            ELSE NULL
        END AS dias_restantes,
        -- Alerta dispensado só vale até a próxima recarga
        (c.alerta_dispensado_em IS NOT NULL
            AND (c.data_ultima_recarga IS NULL OR c.alerta_dispensado_em::date >= c.data_ultima_recarga)) AS alerta_dispensado
    FROM calc c
)
SELECT
    c2.*,
    CASE
        WHEN c2.dias_restantes IS NULL THEN NULL
        ELSE (CURRENT_DATE + floor(c2.dias_restantes)::int)
    END AS data_prevista_fim,
    CASE
        WHEN c2.cliente_status_operacional IN ('pausado', 'churn') THEN 'pausado'
        WHEN c2.metodo_pagamento = 'cartao'::metodo_pagamento_simplificado THEN 'cartao'
        WHEN c2.ativo = false THEN 'inativo'
        WHEN c2.qtd_recargas = 0 THEN 'sem_recarga'
        WHEN c2.verba_diaria_calc IS NULL OR c2.verba_diaria_calc <= 0 THEN 'sem_verba'
        WHEN c2.saldo_atual_estimado <= 0 THEN 'zerado'
        WHEN c2.dias_restantes <= 1 THEN 'critico'
        WHEN c2.dias_restantes <= 3 THEN 'alerta'
        ELSE 'ok'
    END AS status_alerta
FROM calc2 c2;

-- ============================================================
-- 20260909120000_plataformas_ads.sql
-- ============================================================
-- Plataformas de mídia (Meta, Google, ChatGPT Ads...) passam a ser configuráveis no Admin.
-- O valor gravado em saldo_ads.plataformas continua sendo o NOME da plataforma.
CREATE TABLE IF NOT EXISTS public.plataformas_ads (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    ordem INTEGER NOT NULL DEFAULT 0,
    ativa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plataformas_ads IS 'Plataformas de mídia disponíveis nos formulários de cliente/saldo (nome = valor gravado em saldo_ads.plataformas)';

INSERT INTO public.plataformas_ads (id, nome, ordem) VALUES
    ('meta',      'Meta',      0),
    ('google',    'Google',    1),
    ('pinterest', 'Pinterest', 2),
    ('x_ads',     'X Ads',     3),
    ('linkedin',  'LinkedIn',  4),
    ('tiktok',    'TikTok',    5),
    ('taboola',   'Taboola',   6),
    ('outbrain',  'Outbrain',  7)
ON CONFLICT (id) DO NOTHING;

-- Mesmo modelo compartilhado das tabelas agencias/demanda_colunas
ALTER TABLE public.plataformas_ads ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'plataformas_ads_all' AND tablename = 'plataformas_ads') THEN
        CREATE POLICY "plataformas_ads_all" ON public.plataformas_ads FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_plataformas_ads_updated_at') THEN
        CREATE TRIGGER set_plataformas_ads_updated_at
        BEFORE UPDATE ON public.plataformas_ads
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- Realtime: o app escuta mudanças para refletir na hora em todas as abas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'plataformas_ads'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.plataformas_ads;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL; -- publicação pode não existir em ambientes locais
END $$;

COMMIT;
