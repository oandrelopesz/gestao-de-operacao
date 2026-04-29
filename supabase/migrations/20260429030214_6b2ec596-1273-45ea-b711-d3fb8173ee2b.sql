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
          WHERE ((d.cliente_id = c.id) AND (d.status::text <> ALL (ARRAY['concluido'::text, 'cancelado'::text, 'feito'::text])))) AS demandas_ativas,
    'em_dia'::text AS status_pagamento_mes
   FROM clientes c;

-- Garantir que a view esteja acessível
ALTER VIEW public.clientes_view OWNER TO postgres;
GRANT SELECT ON public.clientes_view TO authenticated;
GRANT SELECT ON public.clientes_view TO service_role;