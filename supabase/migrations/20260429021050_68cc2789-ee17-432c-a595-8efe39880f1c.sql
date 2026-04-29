-- 1. Remover views que dependem da função
DROP VIEW IF EXISTS public.clientes_view;
DROP VIEW IF EXISTS public.nps_avaliacoes_view;

-- 2. Remover e recriar a função get_nps_categoria para mudar o tipo de retorno
DROP FUNCTION IF EXISTS public.get_nps_categoria(integer);

CREATE OR REPLACE FUNCTION public.get_nps_categoria(score INTEGER)
RETURNS public.cliente_nps_status AS $$
BEGIN
  IF score IS NULL THEN RETURN 'sem_avaliacao'::public.cliente_nps_status;
  ELSIF score >= 40 THEN RETURN 'ancora'::public.cliente_nps_status;
  ELSIF score >= 30 THEN RETURN 'saudavel'::public.cliente_nps_status;
  ELSIF score >= 20 THEN RETURN 'em_risco'::public.cliente_nps_status;
  ELSE RETURN 'critico'::public.cliente_nps_status;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- 3. Recriar nps_avaliacoes_view
CREATE VIEW public.nps_avaliacoes_view AS
SELECT 
    n.*,
    public.get_nps_categoria(n.score_total) as categoria
FROM public.nps_avaliacoes n;

-- 4. Recriar clientes_view (Ajustado para usar enum 'feito' em vez de 'concluido')
CREATE VIEW public.clientes_view AS
WITH ultima_nps AS (
    SELECT DISTINCT ON (cliente_id)
        cliente_id,
        score_total,
        data_avaliacao
    FROM public.nps_avaliacoes
    ORDER BY cliente_id, data_avaliacao DESC
)
SELECT 
    c.*,
    un.score_total as ultima_nps_score,
    un.data_avaliacao as ultima_nps_data,
    public.get_nps_categoria(un.score_total) as nps_status,
    (SELECT count(*) FROM public.demandas d WHERE d.cliente_id = c.id AND d.status NOT IN ('feito')) as demandas_ativas,
    NULL::text as status_pagamento_mes
FROM public.clientes c
LEFT JOIN ultima_nps un ON c.id = un.cliente_id;

-- 5. Garantir Policies RLS
-- Clientes
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clientes' AND policyname = 'Users can view their own clients') THEN
        CREATE POLICY "Users can view their own clients" ON public.clientes FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;

-- NPS Avaliacoes
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nps_avaliacoes' AND policyname = 'Users can view their own nps evaluations') THEN
        CREATE POLICY "Users can view their own nps evaluations" ON public.nps_avaliacoes FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;

-- Saldo ADS
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saldo_ads' AND policyname = 'Users can view their own saldo ads') THEN
        CREATE POLICY "Users can view their own saldo ads" ON public.saldo_ads FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;
