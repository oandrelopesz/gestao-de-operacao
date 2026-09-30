-- Demandas (30/09/2026, pedido do André):
-- 1) Mover um card para uma coluna sem regra de data (Standby) apaga a entrega, para ele não ficar "atrasado".
--    Antes isso só valia para os cards de onboarding. Feito e Recorrentes guardam a data.
-- 2) Na virada da meia-noite, as colunas por dias da semana (Fazer no fim de semana: sábado e domingo) andam:
--    o card do dia que chegou a 2 dias ou menos entra em Fazer depois de amanhã (hoje + 2), Fazer amanhã (hoje + 1)
--    ou Fazer hoje (o próprio dia), no fim da coluna e com a entrega nesse dia.
--    Ex.: na quinta, Sábado vai para "depois de amanhã"; na sexta, Sábado vai para "amanhã" e Domingo para
--    "depois de amanhã".
-- 3) Os cards que já estão no Standby perdem a entrega.

CREATE OR REPLACE FUNCTION public.demandas_aplica_regra_data()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r TEXT;
BEGIN
  IF current_setting('app.sem_regra_data', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.prazo IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.dia_semana IS NOT DISTINCT FROM OLD.dia_semana THEN RETURN NEW; END IF;
  SELECT c.regra_data INTO r FROM public.demanda_colunas c WHERE c.id = NEW.status;
  NEW.prazo := CASE r
    WHEN 'hoje' THEN public.hoje_brt()
    WHEN 'amanha' THEN public.hoje_brt() + 1
    WHEN 'depois_amanha' THEN public.hoje_brt() + 2
    WHEN 'dias_semana' THEN CASE WHEN NEW.dia_semana IS NULL THEN NEW.prazo ELSE public.proximo_dia_semana(NEW.dia_semana) END
    -- Coluna sem regra (Standby): quem entra vindo de outra coluna fica sem entrega. Feito e Recorrentes guardam a data.
    ELSE CASE WHEN TG_OP = 'UPDATE' AND NEW.status NOT IN ('feito', 'recorrentes')
                   AND NEW.status IS DISTINCT FROM OLD.status THEN NULL
              ELSE NEW.prazo END
  END;
  RETURN NEW;
END $$;

-- Cards das colunas por dias da semana cujo dia chegou a 2 dias ou menos entram em Fazer hoje, amanhã ou depois
-- de amanhã (no fim da coluna, entrega = o dia). Chamada pela virada.
CREATE OR REPLACE FUNCTION public.rolar_colunas_por_dia(p_hoje date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  base INTEGER;
  n INTEGER;
  total INTEGER := 0;
  v_prev TEXT := current_setting('app.sem_regra_data', true);
BEGIN
  PERFORM set_config('app.sem_regra_data', 'on', true);
  FOR r IN SELECT * FROM (VALUES ('fazer_depois_amanha', 2), ('fazer_amanha', 1), ('fazer_hoje', 0)) AS v(alvo, desloc) LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM demanda_colunas WHERE id = r.alvo);
    SELECT COALESCE(MAX(ordem), -1) + 1 INTO base FROM demandas WHERE status = r.alvo;
    WITH fila AS (
      SELECT d.id, row_number() OVER (ORDER BY c.ordem, d.ordem, d.created_at, d.id) - 1 AS pos
      FROM demandas d JOIN demanda_colunas c ON c.id = d.status
      WHERE c.regra_data = 'dias_semana'
        AND d.dia_semana = EXTRACT(DOW FROM p_hoje + r.desloc)::smallint
    )
    UPDATE demandas d SET status = r.alvo, ordem = base + fila.pos, prazo = p_hoje + r.desloc
    FROM fila WHERE d.id = fila.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  PERFORM set_config('app.sem_regra_data', COALESCE(NULLIF(v_prev, ''), 'off'), true);
  RETURN total;
END $$;
REVOKE EXECUTE ON FUNCTION public.rolar_colunas_por_dia(date) FROM PUBLIC, anon, authenticated;

-- Virada: igual à de 24/09 e, no fim, as colunas por dias da semana andam.
CREATE OR REPLACE FUNCTION public.virar_dia_demandas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hoje DATE := public.hoje_brt();
  base INTEGER;
  n INTEGER;
  total INTEGER := 0;
BEGIN
  IF (SELECT valor FROM app_config WHERE chave = 'virada_ativa') = 'false'::jsonb THEN
    RETURN 0;
  END IF;
  INSERT INTO demandas_viradas (dia) VALUES (hoje) ON CONFLICT (dia) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  PERFORM set_config('app.sem_regra_data', 'on', true);

  SELECT COALESCE(MAX(ordem), -1) + 1 INTO base FROM demandas WHERE status = 'fazer_hoje';

  WITH fila AS (
    SELECT id, row_number() OVER (ORDER BY ordem, created_at, id) - 1 AS pos
    FROM demandas WHERE status = 'fazer_amanha'
  )
  UPDATE demandas d SET status = 'fazer_hoje', ordem = base + fila.pos
  FROM fila WHERE d.id = fila.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;

  WITH fila AS (
    SELECT id, row_number() OVER (ORDER BY ordem, created_at, id) - 1 AS pos
    FROM demandas WHERE status = 'fazer_depois_amanha'
  )
  UPDATE demandas d SET status = 'fazer_amanha', ordem = fila.pos
  FROM fila WHERE d.id = fila.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;

  -- Por último: o que vem de Sábado/Domingo entra depois dos cards que acabaram de chegar
  total := total + public.rolar_colunas_por_dia(hoje);

  PERFORM set_config('app.sem_regra_data', 'off', true);
  UPDATE demandas_viradas SET movidas = total WHERE dia = hoje;
  RETURN total;
END $$;
REVOKE EXECUTE ON FUNCTION public.virar_dia_demandas() FROM PUBLIC, anon, authenticated;

-- Cards que já estão no Standby ficam sem entrega (o status não muda, então o gatilho não mexe em nada mais).
UPDATE public.demandas SET prazo = NULL WHERE status = 'standby' AND prazo IS NOT NULL;
