-- Drop and recreate saldo_ads_view with simplified logic
DROP VIEW IF EXISTS public.saldo_ads_view;

CREATE OR REPLACE VIEW public.saldo_ads_view AS
 WITH first_recargas AS (
          SELECT recargas.saldo_ads_id,
             min(recargas.data_recarga) AS data_inicio
            FROM recargas
           GROUP BY recargas.saldo_ads_id
        ), totals AS (
          SELECT recargas.saldo_ads_id,
             sum(recargas.valor) AS total_recarregado
            FROM recargas
           GROUP BY recargas.saldo_ads_id
        ), verba_base AS (
          SELECT s.id as saldo_id,
             COALESCE(s.verba_diaria, 
                CASE 
                    WHEN c.tipo_verba = 'total_periodo' AND c.data_limite_verba IS NOT NULL AND (c.data_limite_verba - c.data_inicio) > 0 
                    THEN (c.verba_total_contratada / (c.data_limite_verba - c.data_inicio))
                    ELSE (c.verba_ads / 30.0) 
                END
             ) AS daily_budget
          FROM saldo_ads s
          JOIN clientes c ON s.cliente_id = c.id
        )
 SELECT s.id,
    s.user_id,
    s.cliente_id,
    s.plataforma,
    s.metodo_pagamento,
    s.verba_diaria,
    s.ativo,
    s.observacoes,
    s.created_at,
    s.updated_at,
    c.nome AS cliente_nome,
    c.agencia AS cliente_agencia,
    vb.daily_budget AS verba_diaria_calc,
    COALESCE(t.total_recarregado, (0)::numeric) AS total_recarregado,
    fr.data_inicio AS data_primeira_recarga,
    CASE
        WHEN (fr.data_inicio IS NULL) THEN 0
        ELSE (CURRENT_DATE - fr.data_inicio)
    END AS dias_decorridos,
    CASE
        WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
        ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
    END AS consumo_acumulado_estimado,
    GREATEST((0)::numeric, (COALESCE(t.total_recarregado, (0)::numeric) -
        CASE
            WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
            ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
        END)) AS saldo_atual,
    CASE
        WHEN (vb.daily_budget > (0)::numeric) THEN (GREATEST((0)::numeric, (COALESCE(t.total_recarregado, (0)::numeric) -
            CASE
                WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
                ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
            END)) / vb.daily_budget)
        ELSE (0)::numeric
    END AS dias_restantes,
    CASE
        WHEN (vb.daily_budget > (0)::numeric) THEN (CURRENT_DATE + (
            (GREATEST((0)::numeric, (COALESCE(t.total_recarregado, (0)::numeric) -
                CASE
                    WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
                    ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
                END)) / vb.daily_budget)::integer))
        ELSE CURRENT_DATE
    END AS data_prevista_fim,
    CASE
        WHEN (GREATEST((0)::numeric, (COALESCE(t.total_recarregado, (0)::numeric) -
            CASE
                WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
                ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
            END)) <= (0)::numeric) THEN 'zerado'::text
        WHEN (
            (GREATEST((0)::numeric, (COALESCE(t.total_recarregado, (0)::numeric) -
                CASE
                    WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
                    ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
                END)) / vb.daily_budget) <= (1)::numeric) THEN 'critico'::text
        WHEN (
            (GREATEST((0)::numeric, (COALESCE(t.total_recarregado, (0)::numeric) -
                CASE
                    WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
                    ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
                END)) / vb.daily_budget) <= (2)::numeric) THEN 'alerta'::text
        ELSE 'ok'::text
    END AS status_alerta
   FROM ((clientes c
     JOIN saldo_ads s ON ((c.id = s.cliente_id)))
     JOIN verba_base vb ON ((s.id = vb.saldo_id))
     LEFT JOIN first_recargas fr ON ((s.id = fr.saldo_ads_id)))
     LEFT JOIN totals t ON ((s.id = t.saldo_ads_id));
