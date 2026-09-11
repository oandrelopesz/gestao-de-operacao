-- Verba e forma de pagamento por plataforma de mídia.
-- O cadastro do cliente passa a informar, para cada plataforma, a forma de pagamento e a verba
-- (mensal ou total do período, conforme tipo_verba). clientes.verba_ads / verba_total_contratada
-- continuam sendo a SOMA das plataformas, para os painéis existentes. Cada plataforma vira um
-- registro próprio em saldo_ads, o que permite registrar recargas por plataforma na aba Saldo.

-- 1) Configuração por plataforma no cliente
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS plataformas_config JSONB;
COMMENT ON COLUMN public.clientes.plataformas_config IS
    'Por plataforma (chave = nome): {"Meta": {"verba": 3000, "metodo_pagamento": "pix"}}. verba é mensal ou total do período conforme tipo_verba';

-- 2) Investimento diário informado manualmente (distribuído entre as plataformas na gravação)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS verba_diaria_manual NUMERIC;
COMMENT ON COLUMN public.clientes.verba_diaria_manual IS
    'Investimento diário total informado à mão; NULL = calculado a partir da verba de cada plataforma';

-- 3) View: a verba diária de cada registro passa a ser a gravada nele (já calculada por plataforma).
--    O cálculo antigo (total do período ÷ dias) fica só como fallback para registros sem verba diária.
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
            WHEN s.verba_diaria IS NOT NULL THEN s.verba_diaria
            WHEN c.tipo_verba = 'total_periodo'::tipo_verba_enum
                AND c.verba_total_contratada IS NOT NULL
                AND c.data_inicio IS NOT NULL
                AND c.data_limite_verba IS NOT NULL
            THEN round((c.verba_total_contratada / NULLIF(EXTRACT(day FROM (c.data_limite_verba::timestamp - c.data_inicio::timestamp)), 0))::numeric, 2)
            ELSE NULL
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
