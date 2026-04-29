-- Fix search path for get_nps_categoria
ALTER FUNCTION public.get_nps_categoria(INTEGER) SET search_path = public;

-- Recreate nps_avaliacoes_view with security_invoker = true
DROP VIEW IF EXISTS public.nps_avaliacoes_view;
CREATE OR REPLACE VIEW public.nps_avaliacoes_view 
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (cliente_id)
  *,
  public.get_nps_categoria(score_total) as categoria
FROM public.nps_avaliacoes
ORDER BY cliente_id, data_avaliacao DESC, created_at DESC;