-- Front novo publicado: dia_fim_de_semana (legado) sai; dia_semana é a única fonte do dia.
CREATE OR REPLACE FUNCTION public.demandas_ajusta_dia_semana()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dias SMALLINT[];
BEGIN
  SELECT c.dias_semana INTO dias FROM public.demanda_colunas c WHERE c.id = NEW.status;
  IF dias IS NULL OR cardinality(dias) = 0 THEN
    NEW.dia_semana := NULL;
  ELSIF NEW.dia_semana IS NULL OR NOT (NEW.dia_semana = ANY (dias)) THEN
    NEW.dia_semana := dias[1];
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_10_dia_semana ON public.demandas;
DROP TRIGGER IF EXISTS demandas_20_regra_data ON public.demandas;
ALTER TABLE public.demandas DROP COLUMN IF EXISTS dia_fim_de_semana;
DROP FUNCTION IF EXISTS public.demandas_ajusta_dia_fds();
CREATE TRIGGER demandas_10_dia_semana BEFORE INSERT OR UPDATE OF status, dia_semana ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_ajusta_dia_semana();
CREATE TRIGGER demandas_20_regra_data BEFORE INSERT OR UPDATE OF status, dia_semana ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_aplica_regra_data();
