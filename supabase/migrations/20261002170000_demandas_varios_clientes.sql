-- Demandas (02/10/2026, pedido do André): uma demanda pode ser de mais de um cliente. `cliente_id` continua sendo o
-- principal (o que as outras abas usam) e `clientes_extras` guarda os demais. Ao concluir, o Dashboard conta uma
-- demanda feita para cada cliente. Limpar a coluna Feito (ou apagar demandas) continua sem apagar o histórico do
-- Dashboard: `demanda_conclusoes.demanda_id` é ON DELETE SET NULL e nenhum gatilho apaga o log ao excluir.

ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS clientes_extras UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE public.demanda_conclusoes ADD COLUMN IF NOT EXISTS clientes_extras UUID[] NOT NULL DEFAULT '{}';

-- Exclusividade (igual à 20261002150000) e, no fim, os clientes a mais: só existem junto com o principal, sem
-- repetir e sem o próprio principal, na ordem em que foram marcados.
CREATE OR REPLACE FUNCTION public.demandas_pessoal_exclusivo()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  escolhido BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cliente_id IS NOT NULL AND NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
      NEW.pessoal := false;
      NEW.agencia_id := NULL;
      escolhido := true;
    ELSIF NEW.agencia_id IS NOT NULL AND NEW.agencia_id IS DISTINCT FROM OLD.agencia_id THEN
      NEW.pessoal := false;
      NEW.cliente_id := NULL;
      escolhido := true;
    END IF;
  END IF;
  IF NOT escolhido THEN
    IF NEW.pessoal THEN
      NEW.cliente_id := NULL;
      NEW.agencia_id := NULL;
    ELSIF NEW.cliente_id IS NOT NULL THEN
      NEW.agencia_id := NULL;
    END IF;
  END IF;
  IF NEW.cliente_id IS NULL THEN
    NEW.clientes_extras := '{}';
  ELSE
    NEW.clientes_extras := ARRAY(
      SELECT x FROM unnest(COALESCE(NEW.clientes_extras, '{}')) WITH ORDINALITY AS t(x, ord)
      WHERE x IS NOT NULL AND x <> NEW.cliente_id
      GROUP BY x
      ORDER BY min(ord)
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_05_pessoal ON public.demandas;
CREATE TRIGGER demandas_05_pessoal BEFORE INSERT OR UPDATE OF cliente_id, pessoal, agencia_id, clientes_extras ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_pessoal_exclusivo();

-- O log de conclusões guarda também os clientes a mais (o Dashboard conta uma vez para cada cliente)
CREATE OR REPLACE FUNCTION public.demandas_registra_conclusao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'feito' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'feito') THEN
    INSERT INTO demanda_conclusoes (demanda_id, cliente_id, clientes_extras, pessoal, agencia_id, titulo, prazo, concluida_em)
    VALUES (NEW.id, NEW.cliente_id, NEW.clientes_extras, NEW.pessoal, NEW.agencia_id, NEW.titulo, NEW.prazo, now())
    ON CONFLICT (demanda_id) DO UPDATE SET cliente_id = EXCLUDED.cliente_id, clientes_extras = EXCLUDED.clientes_extras,
      pessoal = EXCLUDED.pessoal, agencia_id = EXCLUDED.agencia_id, titulo = EXCLUDED.titulo, prazo = EXCLUDED.prazo,
      concluida_em = now();
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'feito' AND NEW.status IS DISTINCT FROM 'feito' THEN
    DELETE FROM demanda_conclusoes WHERE demanda_id = NEW.id;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'feito'
        AND (NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.clientes_extras IS DISTINCT FROM OLD.clientes_extras
             OR NEW.pessoal IS DISTINCT FROM OLD.pessoal OR NEW.agencia_id IS DISTINCT FROM OLD.agencia_id
             OR NEW.titulo IS DISTINCT FROM OLD.titulo OR NEW.prazo IS DISTINCT FROM OLD.prazo) THEN
    UPDATE demanda_conclusoes SET cliente_id = NEW.cliente_id, clientes_extras = NEW.clientes_extras, pessoal = NEW.pessoal,
      agencia_id = NEW.agencia_id, titulo = NEW.titulo, prazo = NEW.prazo
    WHERE demanda_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_40_conclusao ON public.demandas;
CREATE TRIGGER demandas_40_conclusao
  AFTER INSERT OR UPDATE OF status, cliente_id, clientes_extras, pessoal, agencia_id, titulo, prazo ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_registra_conclusao();

-- A cópia da recorrente em Fazer hoje leva também os clientes a mais
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

  INSERT INTO demandas (titulo, descricao, status, prioridade, prazo, ordem, cliente_id, clientes_extras, pessoal, agencia_id, user_id, recorrente_pai_id)
  SELECT m.titulo, m.descricao, 'fazer_hoje', m.prioridade, hoje,
         base + row_number() OVER (ORDER BY m.ordem, m.created_at, m.id) - 1,
         m.cliente_id, m.clientes_extras, m.pessoal, m.agencia_id, m.user_id, m.id
  FROM demandas m
  WHERE m.status = 'recorrentes'
    AND m.proxima_execucao <= hoje
    AND (p_mae IS NULL OR m.id = p_mae)
    AND NOT EXISTS (SELECT 1 FROM demandas c WHERE c.recorrente_pai_id = m.id AND c.status <> 'feito');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.materializar_recorrentes(uuid) FROM PUBLIC, anon, authenticated;
