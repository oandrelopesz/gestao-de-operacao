-- Drop and recreate clientes_view to include new fields
DROP VIEW IF EXISTS public.clientes_view;

CREATE OR REPLACE VIEW public.clientes_view AS
 SELECT c.id,
    c.user_id,
    c.nome,
    c.agencia,
    c.nicho,
    c.data_inicio,
    c.verba_ads,
    c.observacoes,
    c.arquivado,
    c.created_at,
    c.updated_at,
    c.em_onboarding,
    c.status_operacional,
    c.tipo_verba,
    c.verba_total_contratada,
    c.data_limite_verba,
    ( SELECT count(*) AS count
           FROM demandas d
          WHERE ((d.cliente_id = c.id) AND (d.status <> 'feito'::demanda_status))) AS demandas_ativas,
    ( SELECT n.data_avaliacao
           FROM nps_avaliacoes n
          WHERE (n.cliente_id = c.id)
          ORDER BY n.data_avaliacao DESC
         LIMIT 1) AS ultima_nps_data,
    ( SELECT n.score_total
           FROM nps_avaliacoes n
          WHERE (n.cliente_id = c.id)
          ORDER BY n.data_avaliacao DESC
         LIMIT 1) AS ultima_nps_score,
    ( SELECT get_nps_categoria(n.score_total) AS get_nps_categoria
           FROM nps_avaliacoes n
          WHERE (n.cliente_id = c.id)
          ORDER BY n.data_avaliacao DESC
         LIMIT 1) AS nps_status
   FROM clientes c;
