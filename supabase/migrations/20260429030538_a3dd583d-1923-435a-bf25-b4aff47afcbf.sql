DROP VIEW IF EXISTS public.saldo_ads_view;

CREATE VIEW public.saldo_ads_view AS
 SELECT s.id,
    s.user_id,
    s.cliente_id,
    c.nome AS cliente_nome,
    c.agencia AS cliente_agencia,
    s.metodo_pagamento,
    s.plataformas,
    s.verba_diaria,
    s.ativo,
    s.observacoes,
    s.created_at,
    s.updated_at,
        CASE
            WHEN ((c.tipo_verba = 'total_periodo'::tipo_verba_enum) AND (c.verba_total_contratada IS NOT NULL) AND (c.data_inicio IS NOT NULL) AND (c.data_limite_verba IS NOT NULL)) THEN round((c.verba_total_contratada / NULLIF(EXTRACT(day FROM ((c.data_limite_verba)::timestamp without time zone - (c.data_inicio)::timestamp without time zone)), (0)::numeric)), 2)
            ELSE s.verba_diaria
        END AS verba_diaria_calc,
        CASE
            WHEN ((c.tipo_verba = 'total_periodo'::tipo_verba_enum) AND (c.verba_total_contratada IS NOT NULL) AND (c.data_inicio IS NOT NULL) AND (c.data_limite_verba IS NOT NULL)) THEN round(((c.verba_total_contratada / NULLIF(EXTRACT(day FROM ((c.data_limite_verba)::timestamp without time zone - (c.data_inicio)::timestamp without time zone)), (0)::numeric)) * (30)::numeric), 2)
            ELSE round((s.verba_diaria * (30)::numeric), 2)
        END AS verba_mensal_estimada,
    COALESCE(( SELECT sum(r.valor) AS sum
           FROM recargas r
          WHERE (r.saldo_ads_id = s.id)), (0)::numeric) AS saldo_total_acumulado,
    (COALESCE(( SELECT sum(r.valor) AS sum
           FROM recargas r
          WHERE (r.saldo_ads_id = s.id)), (0)::numeric) - (COALESCE(s.verba_diaria, (0)::numeric) * (EXTRACT(day FROM (now() - s.created_at)))::numeric)) AS saldo_atual_estimado,
    CASE 
        WHEN s.verba_diaria > 0 THEN 
            ((COALESCE(( SELECT sum(r.valor) AS sum FROM recargas r WHERE r.saldo_ads_id = s.id), 0) - (COALESCE(s.verba_diaria, 0) * (EXTRACT(day FROM (now() - s.created_at)))::numeric)) / s.verba_diaria)
        ELSE 0 
    END AS dias_restantes,
    CASE
        WHEN s.verba_diaria > 0 AND ((COALESCE(( SELECT sum(r.valor) AS sum FROM recargas r WHERE r.saldo_ads_id = s.id), 0) - (COALESCE(s.verba_diaria, 0) * (EXTRACT(day FROM (now() - s.created_at)))::numeric)) / s.verba_diaria) <= 0 THEN 'zerado'
        WHEN s.verba_diaria > 0 AND ((COALESCE(( SELECT sum(r.valor) AS sum FROM recargas r WHERE r.saldo_ads_id = s.id), 0) - (COALESCE(s.verba_diaria, 0) * (EXTRACT(day FROM (now() - s.created_at)))::numeric)) / s.verba_diaria) <= 3 THEN 'baixo'
        ELSE 'ok'
    END AS status_alerta
   FROM (saldo_ads s
     JOIN clientes c ON ((s.cliente_id = c.id)));

-- Garantir permissões
GRANT SELECT ON public.saldo_ads_view TO authenticated;
GRANT SELECT ON public.saldo_ads_view TO service_role;