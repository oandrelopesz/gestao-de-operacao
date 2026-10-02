-- Demandas (02/10/2026, pedido do André): a coluna Recorrentes continua e, no dia de cada recorrente, uma cópia
-- entra direto em "Fazer hoje" (sem passar por amanhã / depois de amanhã). Concluir a cópia (ir para Feito) conta
-- como execução da recorrente: registra em demanda_execucoes e calcula a próxima data, como o botão da coluna.
-- Antes a materialização estava desligada (as recorrentes ficavam só na coluna). A edge function
-- materializar-recorrentes continua desligada; o cron que a chamava (e falhava todo dia) dá lugar a um que chama
-- a função SQL abaixo.

-- 1) Cópias sobrevivem quando a recorrente é apagada (antes, ON DELETE CASCADE levava junto até as concluídas)
ALTER TABLE public.demandas DROP CONSTRAINT IF EXISTS demandas_recorrente_pai_id_fkey;
ALTER TABLE public.demandas ADD CONSTRAINT demandas_recorrente_pai_id_fkey
  FOREIGN KEY (recorrente_pai_id) REFERENCES public.demandas(id) ON DELETE SET NULL;

-- 2) Para cada recorrente cujo dia chegou (ou passou) e que não tem cópia aberta (fora de Feito), cria a cópia
--    no fim de Fazer hoje, com entrega hoje. p_mae limita a uma recorrente. Devolve quantas cópias criou.
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

  INSERT INTO demandas (titulo, descricao, status, prioridade, prazo, ordem, cliente_id, pessoal, user_id, recorrente_pai_id)
  SELECT m.titulo, m.descricao, 'fazer_hoje', m.prioridade, hoje,
         base + row_number() OVER (ORDER BY m.ordem, m.created_at, m.id) - 1,
         m.cliente_id, m.pessoal, m.user_id, m.id
  FROM demandas m
  WHERE m.status = 'recorrentes'
    AND m.proxima_execucao <= hoje
    AND (p_mae IS NULL OR m.id = p_mae)
    AND NOT EXISTS (SELECT 1 FROM demandas c WHERE c.recorrente_pai_id = m.id AND c.status <> 'feito');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.materializar_recorrentes(uuid) FROM PUBLIC, anon, authenticated;

-- 3) Recorrente que chega ao dia fora do cron (criada ou reagendada para hoje): a cópia entra na hora
CREATE OR REPLACE FUNCTION public.demandas_recorrente_chegou()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'recorrentes' AND NEW.proxima_execucao <= public.hoje_brt() THEN
    PERFORM public.materializar_recorrentes(NEW.id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS demandas_60_recorrente_chegou ON public.demandas;
CREATE TRIGGER demandas_60_recorrente_chegou
  AFTER INSERT OR UPDATE OF proxima_execucao, status ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_recorrente_chegou();

-- 4) Cópia que entra em Feito conta como execução da recorrente (vale para o botão Concluir, o arrasto e a
--    seleção em massa). Voltar a cópia de Feito não desfaz a execução.
CREATE OR REPLACE FUNCTION public.demandas_recorrente_concluida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hoje DATE := public.hoje_brt();
  m RECORD;
BEGIN
  IF NEW.recorrente_pai_id IS NULL OR NEW.status IS DISTINCT FROM 'feito' OR OLD.status IS NOT DISTINCT FROM 'feito' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO m FROM demandas WHERE id = NEW.recorrente_pai_id AND status = 'recorrentes';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  INSERT INTO demanda_execucoes (demanda_id, data_execucao) VALUES (m.id, hoje);
  UPDATE demandas
  SET ultima_execucao = hoje,
      proxima_execucao = public.calcular_proxima_execucao(m.frequencia_tipo, m.frequencia_dias_semana,
        m.frequencia_dia_mes, m.frequencia_intervalo_dias, hoje, hoje)
  WHERE id = m.id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS demandas_50_recorrente_concluida ON public.demandas;
CREATE TRIGGER demandas_50_recorrente_concluida
  AFTER UPDATE OF status ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_recorrente_concluida();

-- 5) Cron: 00:00 de Brasília, junto com a virada, porque o quadro aberto recarrega sozinho às 00:01.
--    Sai o cron antigo que chamava a edge function desligada.
SELECT cron.unschedule('materializar-recorrentes-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'materializar-recorrentes-diario');

SELECT cron.unschedule('materializar-recorrentes')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'materializar-recorrentes');

SELECT cron.schedule('materializar-recorrentes', '0 3 * * *', $$SELECT public.materializar_recorrentes()$$);

-- 6) As recorrentes que já venceram ganham a cópia agora
SELECT public.materializar_recorrentes();
