-- Virada do dia do Kanban de Demandas (00:00 de Brasília):
--   Fazer amanhã → Fazer hoje, entrando ABAIXO do que já está em hoje, na mesma ordem;
--   Fazer depois de amanhã → Fazer amanhã, na mesma ordem.
-- Fim de semana, Standby, Recorrentes e Feito não mudam. A tabela demandas_viradas impede
-- que a virada rode duas vezes no mesmo dia (cron repetido ou execução manual).

CREATE TABLE IF NOT EXISTS public.demandas_viradas (
  dia DATE PRIMARY KEY,
  movidas INTEGER NOT NULL DEFAULT 0,
  executada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Sem policies: só a função (SECURITY DEFINER) escreve aqui
ALTER TABLE public.demandas_viradas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.virar_dia_demandas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  base INTEGER;
  n INTEGER;
  total INTEGER := 0;
BEGIN
  INSERT INTO demandas_viradas (dia) VALUES (hoje) ON CONFLICT (dia) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(MAX(ordem), -1) + 1 INTO base FROM demandas WHERE status = 'fazer_hoje';

  WITH fila AS (
    SELECT id, row_number() OVER (ORDER BY ordem, created_at, id) - 1 AS pos
    FROM demandas WHERE status = 'fazer_amanha'
  )
  UPDATE demandas d SET status = 'fazer_hoje', ordem = base + fila.pos
  FROM fila WHERE d.id = fila.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;

  -- "Fazer amanhã" acabou de esvaziar: a fila de depois de amanhã entra a partir do 0
  WITH fila AS (
    SELECT id, row_number() OVER (ORDER BY ordem, created_at, id) - 1 AS pos
    FROM demandas WHERE status = 'fazer_depois_amanha'
  )
  UPDATE demandas d SET status = 'fazer_amanha', ordem = fila.pos
  FROM fila WHERE d.id = fila.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;

  UPDATE demandas_viradas SET movidas = total WHERE dia = hoje;
  RETURN total;
END $$;

REVOKE EXECUTE ON FUNCTION public.virar_dia_demandas() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('virar-dia-demandas')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'virar-dia-demandas');

SELECT cron.schedule('virar-dia-demandas', '0 3 * * *', $$SELECT public.virar_dia_demandas()$$);
