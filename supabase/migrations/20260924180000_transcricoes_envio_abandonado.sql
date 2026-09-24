-- Limpeza de hora em hora também apaga envios abandonados: linha "enviando" há mais de 24 h (a
-- aba foi fechada no meio do envio). O arquivo parcial na VPS já é apagado pela faxina do worker.
CREATE OR REPLACE FUNCTION public.limpar_transcricoes_vencidas()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH apagadas AS (
    DELETE FROM public.transcricoes
    WHERE (expira_em IS NOT NULL AND expira_em < now())
       OR (status = 'enviando' AND created_at < now() - interval '24 hours')
    RETURNING 1
  )
  SELECT count(*)::int FROM apagadas
$$;
REVOKE EXECUTE ON FUNCTION public.limpar_transcricoes_vencidas() FROM PUBLIC, anon, authenticated;
