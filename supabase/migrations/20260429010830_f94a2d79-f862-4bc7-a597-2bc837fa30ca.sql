-- Fix function security
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- Explicitly ensure views are defined correctly (default is SECURITY INVOKER which is what we want)
-- We'll just recreate them to be sure
DROP VIEW IF EXISTS public.saldo_ads_view;
CREATE OR REPLACE VIEW public.saldo_ads_view AS
WITH first_recargas AS (
    SELECT 
        saldo_ads_id,
        MIN(data_recarga) as data_inicio
    FROM public.recargas
    GROUP BY saldo_ads_id
),
totals AS (
    SELECT 
        saldo_ads_id,
        SUM(valor) as total_recarregado
    FROM public.recargas
    GROUP BY saldo_ads_id
)
SELECT 
    s.*,
    c.nome as cliente_nome,
    c.agencia as cliente_agencia,
    COALESCE(s.verba_diaria, c.verba_ads / 30.0) as verba_diaria_calc,
    COALESCE(t.total_recarregado, 0) as total_recarregado,
    fr.data_inicio as data_primeira_recarga,
    CASE 
        WHEN fr.data_inicio IS NULL THEN 0
        ELSE (CURRENT_DATE - fr.data_inicio)::int
    END as dias_decorridos,
    CASE 
        WHEN fr.data_inicio IS NULL THEN 0
        ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
    END as consumo_acumulado_estimado,
    GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
        WHEN fr.data_inicio IS NULL THEN 0
        ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
    END) as saldo_atual,
    CASE 
        WHEN COALESCE(s.verba_diaria, c.verba_ads / 30.0) > 0 THEN
            (GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
                WHEN fr.data_inicio IS NULL THEN 0
                ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
                END) / COALESCE(s.verba_diaria, c.verba_ads / 30.0))
        ELSE 0
    END as dias_restantes,
    CASE 
        WHEN COALESCE(s.verba_diaria, c.verba_ads / 30.0) > 0 THEN
            CURRENT_DATE + (GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
                WHEN fr.data_inicio IS NULL THEN 0
                ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
            END) / COALESCE(s.verba_diaria, c.verba_ads / 30.0))::int
        ELSE CURRENT_DATE
    END as data_prevista_fim,
    CASE
        WHEN GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
            WHEN fr.data_inicio IS NULL THEN 0
            ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
        END) <= 0 THEN 'zerado'
        WHEN (CASE 
            WHEN COALESCE(s.verba_diaria, c.verba_ads / 30.0) > 0 THEN
                (GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
                    WHEN fr.data_inicio IS NULL THEN 0
                    ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
                END) / COALESCE(s.verba_diaria, c.verba_ads / 30.0))
            ELSE 0
        END) <= 1 THEN 'critico'
        WHEN (CASE 
            WHEN COALESCE(s.verba_diaria, c.verba_ads / 30.0) > 0 THEN
                (GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
                    WHEN fr.data_inicio IS NULL THEN 0
                    ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
                END) / COALESCE(s.verba_diaria, c.verba_ads / 30.0))
            ELSE 0
        END) <= 2 THEN 'alerta'
        WHEN (CASE 
            WHEN COALESCE(s.verba_diaria, c.verba_ads / 30.0) > 0 THEN
                (GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
                    WHEN fr.data_inicio IS NULL THEN 0
                    ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
                END) / COALESCE(s.verba_diaria, c.verba_ads / 30.0))
            ELSE 0
        END) <= 4 THEN 'alerta'
        ELSE 'ok'
    END as status_alerta
FROM public.saldo_ads s
JOIN public.clientes c ON s.cliente_id = c.id
LEFT JOIN first_recargas fr ON s.id = fr.saldo_ads_id
LEFT JOIN totals t ON s.id = t.saldo_ads_id;
