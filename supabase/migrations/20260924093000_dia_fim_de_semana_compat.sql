-- dia_fim_de_semana foi removida às 00:xx de 24/09 e uma aba aberta na versão anterior do site deu
-- "Erro ao sincronizar movimento" ao mover sábado → domingo. A coluna volta como compatibilidade:
-- o trigger traduz dia_fim_de_semana ⇄ dia_semana (fonte única). Custo zero; não remover.
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS dia_fim_de_semana TEXT CHECK (dia_fim_de_semana IN ('sabado', 'domingo'));
UPDATE public.demandas SET dia_fim_de_semana = CASE dia_semana WHEN 0 THEN 'domingo' WHEN 6 THEN 'sabado' END WHERE status = 'fazer_fim_de_semana';
CREATE OR REPLACE FUNCTION public.demandas_ajusta_dia_semana()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dias SMALLINT[];
BEGIN
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
DROP TRIGGER IF EXISTS demandas_20_regra_data ON public.demandas;
CREATE TRIGGER demandas_10_dia_semana BEFORE INSERT OR UPDATE OF status, dia_semana, dia_fim_de_semana ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_ajusta_dia_semana();
CREATE TRIGGER demandas_20_regra_data BEFORE INSERT OR UPDATE OF status, dia_semana, dia_fim_de_semana ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_aplica_regra_data();
NOTIFY pgrst, 'reload schema';
