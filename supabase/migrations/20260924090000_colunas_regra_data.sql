-- Regra de data por coluna do Kanban e colunas "por dias da semana" (generaliza "Fazer no fim de semana").
-- Mover um card para uma coluna com regra grava a entrega (demandas.prazo). Virada e sincronizações
-- ligam app.sem_regra_data para não recalcular a entrega.

CREATE OR REPLACE FUNCTION public.hoje_brt() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $$;

-- Próxima ocorrência do dia da semana (0 = domingo … 6 = sábado); hoje, se hoje já é o dia
CREATE OR REPLACE FUNCTION public.proximo_dia_semana(p_dia smallint) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT public.hoje_brt() + ((p_dia - extract(dow FROM public.hoje_brt())::int + 7) % 7)
$$;

CREATE TABLE IF NOT EXISTS public.app_config (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_config' AND policyname = 'app_config_all') THEN
    CREATE POLICY "app_config_all" ON public.app_config FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
INSERT INTO public.app_config (chave, valor) VALUES ('virada_ativa', 'true'::jsonb) ON CONFLICT (chave) DO NOTHING;

ALTER TABLE public.demanda_colunas
  ADD COLUMN IF NOT EXISTS regra_data TEXT NOT NULL DEFAULT 'nenhuma'
    CHECK (regra_data IN ('nenhuma', 'hoje', 'amanha', 'depois_amanha', 'dias_semana')),
  ADD COLUMN IF NOT EXISTS dias_semana SMALLINT[] NOT NULL DEFAULT '{}';

UPDATE public.demanda_colunas SET regra_data = 'hoje' WHERE id = 'fazer_hoje';
UPDATE public.demanda_colunas SET regra_data = 'amanha' WHERE id = 'fazer_amanha';
UPDATE public.demanda_colunas SET regra_data = 'depois_amanha' WHERE id = 'fazer_depois_amanha';
UPDATE public.demanda_colunas SET regra_data = 'dias_semana', dias_semana = '{6,0}' WHERE id = 'fazer_fim_de_semana';

ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS dia_semana SMALLINT CHECK (dia_semana BETWEEN 0 AND 6);
UPDATE public.demandas SET dia_semana = CASE dia_fim_de_semana WHEN 'domingo' THEN 0 WHEN 'sabado' THEN 6 END
WHERE dia_fim_de_semana IS NOT NULL AND dia_semana IS NULL;

-- 1º BEFORE trigger (ordem alfabética): dia válido para a coluna; mantém dia_fim_de_semana (legado) em sincronia
DROP TRIGGER IF EXISTS demandas_ajusta_dia_fds ON public.demandas;
CREATE OR REPLACE FUNCTION public.demandas_ajusta_dia_semana()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dias SMALLINT[];
BEGIN
  -- Front antigo só escreve dia_fim_de_semana: traduz para dia_semana
  IF TG_OP = 'UPDATE' AND NEW.dia_fim_de_semana IS DISTINCT FROM OLD.dia_fim_de_semana
     AND NEW.dia_semana IS NOT DISTINCT FROM OLD.dia_semana THEN
    NEW.dia_semana := CASE NEW.dia_fim_de_semana WHEN 'domingo' THEN 0 WHEN 'sabado' THEN 6 ELSE NULL END;
  END IF;
  SELECT c.dias_semana INTO dias FROM public.demanda_colunas c WHERE c.id = NEW.status;
  IF dias IS NULL OR cardinality(dias) = 0 THEN
    NEW.dia_semana := NULL;
  ELSIF NEW.dia_semana IS NULL OR NOT (NEW.dia_semana = ANY (dias)) THEN
    NEW.dia_semana := dias[1];
  END IF;
  NEW.dia_fim_de_semana := CASE WHEN NEW.status = 'fazer_fim_de_semana' THEN
    CASE NEW.dia_semana WHEN 0 THEN 'domingo' WHEN 6 THEN 'sabado' END END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_10_dia_semana ON public.demandas;
CREATE TRIGGER demandas_10_dia_semana
  BEFORE INSERT OR UPDATE OF status, dia_semana, dia_fim_de_semana ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_ajusta_dia_semana();

-- 2º BEFORE trigger: entrega pela regra da coluna quando o card muda de coluna ou de dia
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
    ELSE NEW.prazo
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_20_regra_data ON public.demandas;
CREATE TRIGGER demandas_20_regra_data
  BEFORE INSERT OR UPDATE OF status, dia_semana, dia_fim_de_semana ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_aplica_regra_data();

-- Virada: respeita app_config.virada_ativa e não recalcula a entrega dos cards que ela move
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

  PERFORM set_config('app.sem_regra_data', 'off', true);
  UPDATE demandas_viradas SET movidas = total WHERE dia = hoje;
  RETURN total;
END $$;
REVOKE EXECUTE ON FUNCTION public.virar_dia_demandas() FROM PUBLIC, anon, authenticated;
