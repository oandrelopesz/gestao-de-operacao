-- Demandas agendadas (18/11/2026, pedido do André): tarefa com data marcada (ex.: 25/01) que fica guardada fora
-- do quadro e desce sozinha para "Fazer depois de amanhã" 2 dias antes; depois anda com a virada (amanhã, hoje).
-- 1) Coluna de sistema 'agendadas', escondida no front (fetchDemandaColunas filtra). A data agendada é o prazo.
-- 2) Agendada sem data não existe (CHECK).
-- 3) Gatilho BEFORE demandas_08_agendada: agendada nova ou com a data trocada que já está a 2 dias ou menos
--    entra direto em Fazer hoje, amanhã ou depois de amanhã, no fim da coluna. Roda antes do _20 (regra de data).
-- 4) rolar_colunas_por_dia (chamada pela virada) também desce as agendadas cujo dia chegou a 2 dias ou menos.
--    A data vencida (virada que ficou dias sem rodar) entra em Fazer hoje.
-- Idempotente. O CREATE OR REPLACE mantém as permissões dadas pela seguranca_fase2 (não repetir o REVOKE).

INSERT INTO public.demanda_colunas (id, titulo, hex, ordem, sistema, regra_data)
VALUES ('agendadas', 'Agendadas', '#0ea5e9', 6, true, 'nenhuma')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.demandas DROP CONSTRAINT IF EXISTS demandas_agendada_tem_data;
ALTER TABLE public.demandas ADD CONSTRAINT demandas_agendada_tem_data
  CHECK (status <> 'agendadas' OR prazo IS NOT NULL);

CREATE OR REPLACE FUNCTION public.demandas_agendada_chegou()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  faltam INTEGER;
  alvo TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'agendadas' OR NEW.prazo IS NULL THEN RETURN NEW; END IF;
  faltam := NEW.prazo - public.hoje_brt();
  IF faltam > 2 THEN RETURN NEW; END IF;
  alvo := CASE WHEN faltam <= 0 THEN 'fazer_hoje' WHEN faltam = 1 THEN 'fazer_amanha' ELSE 'fazer_depois_amanha' END;
  -- Coluna apagada no Admin: a agendada espera em Agendadas
  IF NOT EXISTS (SELECT 1 FROM public.demanda_colunas WHERE id = alvo) THEN RETURN NEW; END IF;
  NEW.status := alvo;
  NEW.ordem := (SELECT COALESCE(MAX(ordem), -1) + 1 FROM public.demandas WHERE status = alvo);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS demandas_08_agendada ON public.demandas;
CREATE TRIGGER demandas_08_agendada
  BEFORE INSERT OR UPDATE OF status, prazo ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_agendada_chegou();

-- Igual à de 30/09 (20260930200000) e, na fila, também as agendadas cujo dia chegou a 2 dias ou menos.
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
      WHERE (c.regra_data = 'dias_semana'
             AND d.dia_semana = EXTRACT(DOW FROM p_hoje + r.desloc)::smallint)
         OR (d.status = 'agendadas'
             AND (d.prazo = p_hoje + r.desloc OR (r.desloc = 0 AND d.prazo < p_hoje)))
    )
    UPDATE demandas d SET status = r.alvo, ordem = base + fila.pos, prazo = p_hoje + r.desloc
    FROM fila WHERE d.id = fila.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  PERFORM set_config('app.sem_regra_data', COALESCE(NULLIF(v_prev, ''), 'off'), true);
  RETURN total;
END $$;
