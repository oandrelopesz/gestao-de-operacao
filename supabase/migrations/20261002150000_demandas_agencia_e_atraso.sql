-- Demandas (02/10/2026, pedido do André): atribuir uma agência a uma demanda, assim como "Pessoal" (cliente,
-- Pessoal e agência são exclusivos), e o Dashboard refletir as agências e as demandas entregues com atraso.

-- 1) Demanda da agência
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS agencia_id TEXT REFERENCES public.agencias(id) ON DELETE SET NULL;

-- 2) Cliente, Pessoal e agência são exclusivos. Num UPDATE, o cliente ou a agência que acabou de ser escolhido
--    vence; marcar Pessoal limpa os outros dois; no INSERT vale Pessoal > cliente > agência.
CREATE OR REPLACE FUNCTION public.demandas_pessoal_exclusivo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cliente_id IS NOT NULL AND NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
      NEW.pessoal := false;
      NEW.agencia_id := NULL;
      RETURN NEW;
    END IF;
    IF NEW.agencia_id IS NOT NULL AND NEW.agencia_id IS DISTINCT FROM OLD.agencia_id THEN
      NEW.pessoal := false;
      NEW.cliente_id := NULL;
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.pessoal THEN
    NEW.cliente_id := NULL;
    NEW.agencia_id := NULL;
  ELSIF NEW.cliente_id IS NOT NULL THEN
    NEW.agencia_id := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_05_pessoal ON public.demandas;
CREATE TRIGGER demandas_05_pessoal BEFORE INSERT OR UPDATE OF cliente_id, pessoal, agencia_id ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_pessoal_exclusivo();

-- 3) O log de conclusões do Dashboard guarda também a agência e a data de entrega (para "entregue com atraso")
ALTER TABLE public.demanda_conclusoes ADD COLUMN IF NOT EXISTS agencia_id TEXT REFERENCES public.agencias(id) ON DELETE SET NULL;
ALTER TABLE public.demanda_conclusoes ADD COLUMN IF NOT EXISTS prazo DATE;

CREATE OR REPLACE FUNCTION public.demandas_registra_conclusao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'feito' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'feito') THEN
    INSERT INTO demanda_conclusoes (demanda_id, cliente_id, pessoal, agencia_id, titulo, prazo, concluida_em)
    VALUES (NEW.id, NEW.cliente_id, NEW.pessoal, NEW.agencia_id, NEW.titulo, NEW.prazo, now())
    ON CONFLICT (demanda_id) DO UPDATE SET cliente_id = EXCLUDED.cliente_id, pessoal = EXCLUDED.pessoal,
      agencia_id = EXCLUDED.agencia_id, titulo = EXCLUDED.titulo, prazo = EXCLUDED.prazo, concluida_em = now();
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'feito' AND NEW.status IS DISTINCT FROM 'feito' THEN
    DELETE FROM demanda_conclusoes WHERE demanda_id = NEW.id;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'feito'
        AND (NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.pessoal IS DISTINCT FROM OLD.pessoal
             OR NEW.agencia_id IS DISTINCT FROM OLD.agencia_id OR NEW.titulo IS DISTINCT FROM OLD.titulo
             OR NEW.prazo IS DISTINCT FROM OLD.prazo) THEN
    UPDATE demanda_conclusoes SET cliente_id = NEW.cliente_id, pessoal = NEW.pessoal, agencia_id = NEW.agencia_id,
      titulo = NEW.titulo, prazo = NEW.prazo
    WHERE demanda_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_40_conclusao ON public.demandas;
CREATE TRIGGER demandas_40_conclusao
  AFTER INSERT OR UPDATE OF status, cliente_id, pessoal, agencia_id, titulo, prazo ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_registra_conclusao();

-- 4) Conclusões antigas ganham a entrega da demanda (Feito guarda a data). As de demandas já excluídas ficam sem.
UPDATE public.demanda_conclusoes c SET prazo = d.prazo
FROM public.demandas d
WHERE d.id = c.demanda_id AND c.prazo IS NULL AND d.prazo IS NOT NULL;

-- 5) A cópia da recorrente em Fazer hoje leva também a agência (igual à 20261002120000, mais agencia_id)
CREATE OR REPLACE FUNCTION public.materializar_recorrentes(p_mae uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hoje DATE := public.hoje_brt();
  base INTEGER;
  n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM demanda_colunas WHERE id = 'fazer_hoje') THEN
    RETURN 0;
  END IF;
  SELECT COALESCE(MAX(ordem), -1) + 1 INTO base FROM demandas WHERE status = 'fazer_hoje';

  INSERT INTO demandas (titulo, descricao, status, prioridade, prazo, ordem, cliente_id, pessoal, agencia_id, user_id, recorrente_pai_id)
  SELECT m.titulo, m.descricao, 'fazer_hoje', m.prioridade, hoje,
         base + row_number() OVER (ORDER BY m.ordem, m.created_at, m.id) - 1,
         m.cliente_id, m.pessoal, m.agencia_id, m.user_id, m.id
  FROM demandas m
  WHERE m.status = 'recorrentes'
    AND m.proxima_execucao <= hoje
    AND (p_mae IS NULL OR m.id = p_mae)
    AND NOT EXISTS (SELECT 1 FROM demandas c WHERE c.recorrente_pai_id = m.id AND c.status <> 'feito');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.materializar_recorrentes(uuid) FROM PUBLIC, anon, authenticated;
