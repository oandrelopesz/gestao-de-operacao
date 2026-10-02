-- Demandas (02/10/2026, pedido do André): coroa de prioridade. A demanda prioritária tem borda dourada e fica no topo
-- da coluna: o quadro ordena prioritárias primeiro e depois pela `ordem` (por isso virada, "Mover para" e arrasto de
-- outra coluna não precisam renumerar nada aqui). `prioridade_pos` guarda a posição entre as normais quando ganhou a
-- coroa, para tirar a coroa devolver o card ao lugar. Ao entrar em Feito a coroa sai.

ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS prioritaria BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS prioridade_pos INTEGER;

CREATE OR REPLACE FUNCTION public.demandas_prioridade_sai_no_feito()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'feito' AND OLD.status IS DISTINCT FROM 'feito' THEN
    NEW.prioritaria := false;
    NEW.prioridade_pos := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_15_prioridade_feito ON public.demandas;
CREATE TRIGGER demandas_15_prioridade_feito BEFORE UPDATE OF status ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_prioridade_sai_no_feito();
