-- Create new enum for the 50-point score
CREATE TYPE public.nps_score_categoria AS ENUM ('ancora', 'saudavel', 'em_risco', 'critico');

-- Drop old NPS related things
DROP VIEW IF EXISTS public.clientes_view;
DROP TABLE IF EXISTS public.nps;
DROP TYPE IF EXISTS public.nps_categoria;

-- Create new NPS table
CREATE TABLE public.nps_avaliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  data_avaliacao DATE NOT NULL DEFAULT CURRENT_DATE,
  engajamento INTEGER NOT NULL CHECK (engajamento >= 0 AND engajamento <= 10),
  resultados_campanha INTEGER NOT NULL CHECK (resultados_campanha >= 0 AND resultados_campanha <= 10),
  conversao_vendas INTEGER NOT NULL CHECK (conversao_vendas >= 0 AND conversao_vendas <= 10),
  relacionamento INTEGER NOT NULL CHECK (relacionamento >= 0 AND relacionamento <= 10),
  potencial_crescimento INTEGER NOT NULL CHECK (potencial_crescimento >= 0 AND potencial_crescimento <= 10),
  score_total INTEGER NOT NULL CHECK (score_total >= 0 AND score_total <= 50),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for performance
CREATE INDEX idx_nps_avaliacoes_user ON public.nps_avaliacoes(user_id);
CREATE INDEX idx_nps_avaliacoes_cliente ON public.nps_avaliacoes(cliente_id);

-- Helper function to categorize based on score_total
CREATE OR REPLACE FUNCTION public.get_nps_categoria(score INTEGER)
RETURNS public.nps_score_categoria AS $$
BEGIN
  IF score >= 40 THEN RETURN 'ancora'::public.nps_score_categoria;
  ELSIF score >= 30 THEN RETURN 'saudavel'::public.nps_score_categoria;
  ELSIF score >= 20 THEN RETURN 'em_risco'::public.nps_score_categoria;
  ELSE RETURN 'critico'::public.nps_score_categoria;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update client_nps_status enum values
DROP TYPE IF EXISTS public.cliente_nps_status CASCADE;
CREATE TYPE public.cliente_nps_status AS ENUM ('ancora', 'saudavel', 'em_risco', 'critico', 'sem_avaliacao');

-- VIEW: nps_avaliacoes_view (latest assessment per client)
CREATE OR REPLACE VIEW public.nps_avaliacoes_view AS
SELECT DISTINCT ON (cliente_id)
  *,
  public.get_nps_categoria(score_total) as categoria
FROM public.nps_avaliacoes
ORDER BY cliente_id, data_avaliacao DESC, created_at DESC;

-- Recreate clientes_view
CREATE OR REPLACE VIEW public.clientes_view
WITH (security_invoker = true)
AS
SELECT
  c.*,
  ultima.score_total AS ultima_nps_score,
  ultima.data_avaliacao AS ultima_nps_data,
  CASE
    WHEN ultima.score_total IS NULL THEN 'sem_avaliacao'::public.cliente_nps_status
    WHEN ultima.score_total >= 40 THEN 'ancora'::public.cliente_nps_status
    WHEN ultima.score_total >= 30 THEN 'saudavel'::public.cliente_nps_status
    WHEN ultima.score_total >= 20 THEN 'em_risco'::public.cliente_nps_status
    ELSE 'critico'::public.cliente_nps_status
  END AS nps_status,
  COALESCE(d.demandas_ativas, 0) AS demandas_ativas,
  saldo_atual.status_pagamento AS status_pagamento_mes,
  saldo_atual.valor_previsto AS valor_previsto_mes,
  saldo_atual.valor_recebido AS valor_recebido_mes
FROM public.clientes c
LEFT JOIN LATERAL (
  SELECT n.score_total, n.data_avaliacao
  FROM public.nps_avaliacoes n
  WHERE n.cliente_id = c.id
  ORDER BY n.data_avaliacao DESC, n.created_at DESC
  LIMIT 1
) ultima ON true
LEFT JOIN (
  SELECT cliente_id, COUNT(*) AS demandas_ativas
  FROM public.demandas
  WHERE status <> 'feito'
  GROUP BY cliente_id
) d ON d.cliente_id = c.id
LEFT JOIN LATERAL (
  SELECT status_pagamento, valor_previsto, valor_recebido
  FROM public.saldo s
  WHERE s.cliente_id = c.id
    AND date_trunc('month', s.mes_referencia) = date_trunc('month', CURRENT_DATE)
  ORDER BY s.created_at DESC
  LIMIT 1
) saldo_atual ON true;

-- RLS
ALTER TABLE public.nps_avaliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nps_avaliacoes_select_own" ON public.nps_avaliacoes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "nps_avaliacoes_insert_own" ON public.nps_avaliacoes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nps_avaliacoes_update_own" ON public.nps_avaliacoes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "nps_avaliacoes_delete_own" ON public.nps_avaliacoes FOR DELETE USING (auth.uid() = user_id);