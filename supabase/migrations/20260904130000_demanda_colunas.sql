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

DO $$
DECLARE
    o TEXT;
BEGIN
    SELECT opts INTO o FROM _clientes_view_opts LIMIT 1;
    IF o IS NOT NULL AND o <> '' THEN
        EXECUTE format('ALTER VIEW public.clientes_view SET (%s)', o);
    END IF;
END $$;

DROP TABLE IF EXISTS _clientes_view_opts;
