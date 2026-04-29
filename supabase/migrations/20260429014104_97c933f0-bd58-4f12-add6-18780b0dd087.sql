-- Criar o tipo enum se não existir
DO $$ BEGIN
    CREATE TYPE status_operacional_type AS ENUM ('ativo', 'pausado', 'churn');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Adicionar a coluna à tabela clientes
ALTER TABLE public.clientes 
ADD COLUMN IF NOT EXISTS status_operacional status_operacional_type DEFAULT 'ativo';

-- Dropar e recriar a view para evitar erros de ordem de colunas
DROP VIEW IF EXISTS public.clientes_view;

CREATE VIEW public.clientes_view AS
SELECT 
    c.id,
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
    ( SELECT count(*) AS count
           FROM demandas d
          WHERE d.cliente_id = c.id AND d.status <> 'feito'::demanda_status) AS demandas_ativas,
    ( SELECT n.data_avaliacao
           FROM nps_avaliacoes n
          WHERE n.cliente_id = c.id
          ORDER BY n.data_avaliacao DESC
         LIMIT 1) AS ultima_nps_data,
    ( SELECT n.score_total
           FROM nps_avaliacoes n
          WHERE n.cliente_id = c.id
          ORDER BY n.data_avaliacao DESC
         LIMIT 1) AS ultima_nps_score,
    ( SELECT get_nps_categoria(n.score_total) AS get_nps_categoria
           FROM nps_avaliacoes n
          WHERE n.cliente_id = c.id
          ORDER BY n.data_avaliacao DESC
         LIMIT 1) AS nps_status
   FROM clientes c;
