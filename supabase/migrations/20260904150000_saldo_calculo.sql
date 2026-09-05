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
