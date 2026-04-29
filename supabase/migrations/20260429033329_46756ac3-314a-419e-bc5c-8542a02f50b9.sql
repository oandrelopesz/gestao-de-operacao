DROP VIEW IF EXISTS public.saldo_ads_view CASCADE;

CREATE VIEW public.saldo_ads_view 
WITH (security_invoker = true) AS
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
  CASE
    WHEN c.tipo_verba = 'total_periodo'::tipo_verba_enum 
      AND c.verba_total_contratada IS NOT NULL 
      AND c.data_inicio IS NOT NULL 
      AND c.data_limite_verba IS NOT NULL 
    THEN round((c.verba_total_contratada / NULLIF(EXTRACT(day FROM (c.data_limite_verba::timestamp - c.data_inicio::timestamp)), 0))::numeric, 2)
    ELSE s.verba_diaria
  END AS verba_diaria_calc,
  COALESCE((SELECT sum(r.valor) FROM recargas r WHERE r.saldo_ads_id = s.id), 0) AS saldo_total_acumulado,
  (SELECT count(*) FROM recargas r WHERE r.saldo_ads_id = s.id) AS qtd_recargas,
  (SELECT max(r.data_recarga) FROM recargas r WHERE r.saldo_ads_id = s.id) AS data_ultima_recarga,
  -- Saldo atual: total recarregado menos consumo diário desde a primeira recarga
  GREATEST(0, 
    COALESCE((SELECT sum(r.valor) FROM recargas r WHERE r.saldo_ads_id = s.id), 0) 
    - COALESCE(s.verba_diaria, 0) * GREATEST(0, EXTRACT(day FROM (now() - COALESCE((SELECT min(r.data_recarga::timestamp) FROM recargas r WHERE r.saldo_ads_id = s.id), now())))::numeric)
  ) AS saldo_atual_estimado,
  -- Dias restantes
  CASE 
    WHEN s.verba_diaria > 0 AND (SELECT count(*) FROM recargas r WHERE r.saldo_ads_id = s.id) > 0 THEN
      GREATEST(0, 
        COALESCE((SELECT sum(r.valor) FROM recargas r WHERE r.saldo_ads_id = s.id), 0) 
        - COALESCE(s.verba_diaria, 0) * GREATEST(0, EXTRACT(day FROM (now() - COALESCE((SELECT min(r.data_recarga::timestamp) FROM recargas r WHERE r.saldo_ads_id = s.id), now())))::numeric)
      ) / s.verba_diaria
    ELSE NULL
  END AS dias_restantes,
  -- Status de alerta granular
  CASE
    -- Não alertar se cliente está pausado/churn
    WHEN c.status_operacional IN ('pausado', 'churn') THEN 'pausado'
    -- Não alertar se método de pagamento é cartão
    WHEN s.metodo_pagamento = 'cartao'::metodo_pagamento_simplificado THEN 'cartao'
    -- Não alertar se registro está inativo
    WHEN s.ativo = false THEN 'inativo'
    -- Não alertar se nunca houve recarga (saldo "zerado" inicial não conta)
    WHEN (SELECT count(*) FROM recargas r WHERE r.saldo_ads_id = s.id) = 0 THEN 'sem_recarga'
    -- Verba diária zerada não pode calcular alerta
    WHEN s.verba_diaria IS NULL OR s.verba_diaria <= 0 THEN 'sem_verba'
    -- Calcular dias restantes e classificar
    WHEN (
      COALESCE((SELECT sum(r.valor) FROM recargas r WHERE r.saldo_ads_id = s.id), 0) 
      - COALESCE(s.verba_diaria, 0) * GREATEST(0, EXTRACT(day FROM (now() - COALESCE((SELECT min(r.data_recarga::timestamp) FROM recargas r WHERE r.saldo_ads_id = s.id), now())))::numeric)
    ) <= 0 THEN 'zerado'
    WHEN (
      (COALESCE((SELECT sum(r.valor) FROM recargas r WHERE r.saldo_ads_id = s.id), 0) 
      - COALESCE(s.verba_diaria, 0) * GREATEST(0, EXTRACT(day FROM (now() - COALESCE((SELECT min(r.data_recarga::timestamp) FROM recargas r WHERE r.saldo_ads_id = s.id), now())))::numeric)) / s.verba_diaria
    ) <= 1 THEN 'critico'
    WHEN (
      (COALESCE((SELECT sum(r.valor) FROM recargas r WHERE r.saldo_ads_id = s.id), 0) 
      - COALESCE(s.verba_diaria, 0) * GREATEST(0, EXTRACT(day FROM (now() - COALESCE((SELECT min(r.data_recarga::timestamp) FROM recargas r WHERE r.saldo_ads_id = s.id), now())))::numeric)) / s.verba_diaria
    ) <= 3 THEN 'alerta'
    ELSE 'ok'
  END AS status_alerta
FROM saldo_ads s
JOIN clientes c ON s.cliente_id = c.id
WHERE c.arquivado = false;

GRANT SELECT ON public.saldo_ads_view TO authenticated;