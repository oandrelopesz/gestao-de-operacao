-- Coluna "Fazer no fim de semana" (entre "Fazer depois de amanhã" e "Standby") e o dia escolhido
-- (sábado/domingo) de cada card nela. O trigger mantém a regra no banco: fora da coluna não há dia.

ALTER TABLE public.demandas
  ADD COLUMN IF NOT EXISTS dia_fim_de_semana TEXT
  CHECK (dia_fim_de_semana IN ('sabado', 'domingo'));

-- Abre espaço logo depois de "Fazer depois de amanhã" (só na primeira execução)
UPDATE public.demanda_colunas
SET ordem = ordem + 1
WHERE ordem > (SELECT ordem FROM public.demanda_colunas WHERE id = 'fazer_depois_amanha')
  AND NOT EXISTS (SELECT 1 FROM public.demanda_colunas WHERE id = 'fazer_fim_de_semana');

INSERT INTO public.demanda_colunas (id, titulo, hex, ordem, sistema)
SELECT 'fazer_fim_de_semana', 'Fazer no fim de semana', '#8b5cf6', ordem + 1, true
FROM public.demanda_colunas WHERE id = 'fazer_depois_amanha'
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.demandas_ajusta_dia_fds()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'fazer_fim_de_semana' THEN
    NEW.dia_fim_de_semana := COALESCE(NEW.dia_fim_de_semana, 'sabado');
  ELSE
    NEW.dia_fim_de_semana := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS demandas_ajusta_dia_fds ON public.demandas;
CREATE TRIGGER demandas_ajusta_dia_fds
  BEFORE INSERT OR UPDATE OF status, dia_fim_de_semana ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_ajusta_dia_fds();
