-- Aba Clientes em Churn (pedido do André, 15/10/2026): a view passa a expor as datas do churn para o front
-- tirar de Clientes Ativos quem já saiu e listar na aba nova. Mesmas colunas de antes; novas só no fim.
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
    'em_dia'::text AS status_pagamento_mes,
    CASE WHEN c.trafego_ativo THEN COALESCE(( SELECT sum(public.operacao_verba_mensal(o) * public.cotacao_brl(o.moeda))
           FROM operacoes o
          WHERE o.cliente_id = c.id AND o.ativa), 0) ELSE 0 END AS verba_mensal_brl,
    ( SELECT count(*) FROM operacoes o WHERE o.cliente_id = c.id AND o.ativa) AS qtd_operacoes,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object(
                'id', o.id,
                'nome', o.nome,
                'objetivo', o.objetivo,
                'moeda', o.moeda,
                'tipo_verba', o.tipo_verba,
                'verba_mensal', public.operacao_verba_mensal(o),
                'verba_mensal_brl', public.operacao_verba_mensal(o) * public.cotacao_brl(o.moeda),
                'verba_total_contratada', o.verba_total_contratada,
                'data_inicio_verba', o.data_inicio_verba,
                'data_limite_verba', o.data_limite_verba,
                'plataformas', COALESCE((SELECT jsonb_agg(k) FROM jsonb_object_keys(COALESCE(o.plataformas_config, '{}'::jsonb)) k), '[]'::jsonb)
            ) ORDER BY o.ordem, o.created_at)
           FROM operacoes o
          WHERE o.cliente_id = c.id AND o.ativa), '[]'::jsonb) AS operacoes,
    c.trafego_ativo,
    c.churn_em,
    c.contrato_ate,
    c.churn_efeito_imediato
   FROM clientes c;
