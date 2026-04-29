-- Dropar tudo para um reset limpo
DROP VIEW IF EXISTS public.nps_avaliacoes_view CASCADE;
DROP FUNCTION IF EXISTS public.get_nps_categoria(integer) CASCADE;
DROP TRIGGER IF EXISTS trg_nps_apenas_sexta ON public.nps_avaliacoes;
DROP FUNCTION IF EXISTS public.validar_dia_avaliacao_nps() CASCADE;

-- 1. Recriar função de categoria simples
CREATE OR REPLACE FUNCTION public.get_nps_categoria(score integer)
RETURNS text 
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN score IS NULL THEN 'sem_avaliacao'
    WHEN score >= 40 THEN 'ancora'
    WHEN score >= 30 THEN 'saudavel'
    WHEN score >= 20 THEN 'em_risco'
    ELSE 'critico'
  END;
$$;

-- 2. Recriar view simples e robusta (flat structure)
CREATE VIEW public.nps_avaliacoes_view 
WITH (security_invoker = true) AS
SELECT 
  n.id,
  n.user_id,
  n.cliente_id,
  n.data_avaliacao,
  n.engajamento,
  n.resultados_campanha,
  n.conversao_vendas,
  n.relacionamento,
  n.potencial_crescimento,
  n.score_total,
  n.observacoes,
  n.created_at,
  public.get_nps_categoria(n.score_total) as categoria,
  c.nome as cliente_nome,
  c.agencia as cliente_agencia,
  c.status_operacional as cliente_status_operacional,
  c.em_onboarding as cliente_em_onboarding,
  c.nicho as cliente_nicho
FROM public.nps_avaliacoes n
INNER JOIN public.clientes c ON n.cliente_id = c.id
WHERE c.arquivado = false;

-- 3. Garantir permissões
GRANT SELECT ON public.nps_avaliacoes_view TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nps_avaliacoes TO authenticated;

-- 4. Recriar policies RLS limpas na tabela base
ALTER TABLE public.nps_avaliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_select" ON public.nps_avaliacoes;
DROP POLICY IF EXISTS "nps_insert" ON public.nps_avaliacoes;
DROP POLICY IF EXISTS "nps_update" ON public.nps_avaliacoes;
DROP POLICY IF EXISTS "nps_delete" ON public.nps_avaliacoes;
DROP POLICY IF EXISTS "nps_avaliacoes_select_own" ON public.nps_avaliacoes;
DROP POLICY IF EXISTS "nps_avaliacoes_insert_own" ON public.nps_avaliacoes;
DROP POLICY IF EXISTS "nps_avaliacoes_update_own" ON public.nps_avaliacoes;
DROP POLICY IF EXISTS "nps_avaliacoes_delete_own" ON public.nps_avaliacoes;
DROP POLICY IF EXISTS "Users can view their own nps evaluations" ON public.nps_avaliacoes;

CREATE POLICY "nps_select" ON public.nps_avaliacoes 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "nps_insert" ON public.nps_avaliacoes 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nps_update" ON public.nps_avaliacoes 
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "nps_delete" ON public.nps_avaliacoes 
  FOR DELETE USING (auth.uid() = user_id);

-- 5. Adicionar flag de override em notificacoes_config
ALTER TABLE public.notificacoes_config 
  ADD COLUMN IF NOT EXISTS nps_override_dia_semana boolean DEFAULT false;

-- 6. Trigger para trava de sexta-feira
CREATE OR REPLACE FUNCTION public.validar_dia_avaliacao_nps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_override boolean;
BEGIN
  -- Verificar override
  SELECT nps_override_dia_semana INTO v_override 
  FROM public.notificacoes_config 
  WHERE user_id = auth.uid() 
  LIMIT 1;

  IF v_override IS TRUE THEN
    RETURN NEW;
  END IF;

  -- EXTRACT(dow FROM ...): 0=dom, 5=sexta
  IF EXTRACT(dow FROM (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) != 5 THEN
    RAISE EXCEPTION 'Avaliações NPS só podem ser registradas ou editadas às sextas-feiras. Hoje é % (timezone Brasília).', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo', 'TMDay');
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nps_apenas_sexta
  BEFORE INSERT OR UPDATE OR DELETE ON public.nps_avaliacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_dia_avaliacao_nps();
