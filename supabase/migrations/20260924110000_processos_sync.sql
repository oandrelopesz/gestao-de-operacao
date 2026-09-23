-- Sincronização Onboarding/Roadmap ⇄ Demandas. Só passos de onboarding viram demandas.

CREATE OR REPLACE FUNCTION public.onboarding_janela() RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT LEAST(2, GREATEST(0, COALESCE((SELECT (valor #>> '{}')::int FROM public.app_config WHERE chave = 'onboarding_janela_dias'), 2)))
$$;

-- Coluna do Kanban para a data do passo (null = fora da janela / sem data)
CREATE OR REPLACE FUNCTION public.coluna_do_passo(p_data date) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_data IS NULL THEN NULL
    WHEN p_data <= public.hoje_brt() THEN 'fazer_hoje'
    WHEN p_data = public.hoje_brt() + 1 AND public.onboarding_janela() >= 1 THEN 'fazer_amanha'
    WHEN p_data = public.hoje_brt() + 2 AND public.onboarding_janela() >= 2 THEN 'fazer_depois_amanha'
    ELSE NULL
  END
$$;

-- Coloca a demanda do passo no estado certo. p_forcar = a data foi mudada na aba Onboarding:
-- move o card mesmo que ele esteja numa coluna que o usuário escolheu (standby, fim de semana...).
CREATE OR REPLACE FUNCTION public.sincronizar_passo(p_passo uuid, p_forcar boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p RECORD;
  d RECORD;
  alvo TEXT;
  v_titulo TEXT;
  v_ordem INTEGER;
  v_roadmap UUID;
BEGIN
  PERFORM set_config('app.sem_regra_data', 'on', true);
  SELECT ps.*, pr.tipo, pr.status AS proc_status, pr.cliente_id, c.nome AS cliente_nome
    INTO p
    FROM processo_passos ps
    JOIN processos pr ON pr.id = ps.processo_id
    JOIN clientes c ON c.id = pr.cliente_id
   WHERE ps.id = p_passo;
  IF NOT FOUND OR p.tipo <> 'onboarding' THEN
    PERFORM set_config('app.sem_regra_data', 'off', true);
    RETURN;
  END IF;
  SELECT * INTO d FROM demandas WHERE processo_passo_id = p_passo;
  SELECT r.id INTO v_roadmap FROM processos r WHERE r.passo_onboarding_id = p_passo AND r.tipo = 'roadmap' LIMIT 1;
  v_titulo := p.titulo || ' — ' || p.cliente_nome;

  IF p.proc_status <> 'ativo' THEN
    IF d.id IS NOT NULL AND d.status <> 'feito' AND p.proc_status = 'encerrado' THEN
      DELETE FROM demandas WHERE id = d.id;
    END IF;
  ELSIF p.concluido_em IS NOT NULL THEN
    IF d.id IS NOT NULL AND d.status <> 'feito' THEN
      UPDATE demandas SET status = 'feito' WHERE id = d.id;
    END IF;
  ELSE
    alvo := coluna_do_passo(p.data);
    IF d.id IS NULL THEN
      IF alvo IS NOT NULL THEN
        SELECT COALESCE(MAX(ordem), -1) + 1 INTO v_ordem FROM demandas WHERE status = alvo;
        INSERT INTO demandas (user_id, cliente_id, titulo, descricao, status, prazo, ordem, processo_passo_id, roadmap_id)
        VALUES ('b34bdae5-7a67-4b63-a46f-8aad43a06c63', p.cliente_id, v_titulo, p.observacoes, alvo, p.data, v_ordem, p.id, v_roadmap);
      END IF;
    ELSE
      IF d.status IN ('fazer_hoje', 'fazer_amanha', 'fazer_depois_amanha', 'feito') OR p_forcar THEN
        IF alvo IS NULL THEN
          DELETE FROM demandas WHERE id = d.id;
          d.id := NULL;
        ELSIF alvo <> d.status THEN
          SELECT COALESCE(MAX(ordem), -1) + 1 INTO v_ordem FROM demandas WHERE status = alvo;
          UPDATE demandas SET status = alvo, ordem = v_ordem WHERE id = d.id;
        END IF;
      END IF;
      IF d.id IS NOT NULL THEN
        UPDATE demandas
           SET titulo = v_titulo, descricao = p.observacoes, prazo = p.data, cliente_id = p.cliente_id, roadmap_id = v_roadmap
         WHERE id = d.id
           AND (titulo IS DISTINCT FROM v_titulo OR descricao IS DISTINCT FROM p.observacoes OR prazo IS DISTINCT FROM p.data
                OR cliente_id IS DISTINCT FROM p.cliente_id OR roadmap_id IS DISTINCT FROM v_roadmap);
      END IF;
    END IF;
  END IF;
  PERFORM set_config('app.sem_regra_data', 'off', true);
END $$;

-- Roadmap: 100% conclui o processo (e o passo do onboarding ligado); desfazer reabre
CREATE OR REPLACE FUNCTION public.atualizar_conclusao_roadmap(p_processo uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total INT; feitos INT; pr RECORD;
BEGIN
  SELECT * INTO pr FROM processos WHERE id = p_processo;
  IF NOT FOUND OR pr.tipo <> 'roadmap' OR pr.status = 'encerrado' THEN RETURN; END IF;
  SELECT count(*), count(concluido_em) INTO total, feitos FROM processo_passos WHERE processo_id = p_processo;
  IF total > 0 AND total = feitos AND pr.status = 'ativo' THEN
    UPDATE processos SET status = 'concluido', concluido_em = now() WHERE id = p_processo;
    IF pr.passo_onboarding_id IS NOT NULL THEN
      UPDATE processo_passos SET concluido_em = now() WHERE id = pr.passo_onboarding_id AND concluido_em IS NULL;
    END IF;
  ELSIF (total = 0 OR feitos < total) AND pr.status = 'concluido' THEN
    UPDATE processos SET status = 'ativo', concluido_em = NULL WHERE id = p_processo;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.processo_passos_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tipo TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM demandas WHERE processo_passo_id = OLD.id AND status <> 'feito';
    RETURN OLD;
  END IF;
  SELECT tipo INTO v_tipo FROM processos WHERE id = NEW.processo_id;
  IF v_tipo = 'onboarding' THEN
    PERFORM sincronizar_passo(NEW.id, TG_OP = 'UPDATE' AND OLD.data IS DISTINCT FROM NEW.data AND pg_trigger_depth() = 1);
    -- Prazo do roadmap ligado a este passo acompanha a data do passo
    UPDATE processos SET prazo_final = NEW.data
     WHERE passo_onboarding_id = NEW.id AND prazo_final IS DISTINCT FROM NEW.data;
  ELSIF v_tipo = 'roadmap' THEN
    PERFORM atualizar_conclusao_roadmap(NEW.processo_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS processo_passos_sync ON public.processo_passos;
CREATE TRIGGER processo_passos_sync AFTER INSERT OR UPDATE ON public.processo_passos
  FOR EACH ROW EXECUTE FUNCTION public.processo_passos_sync();
DROP TRIGGER IF EXISTS processo_passos_sync_del ON public.processo_passos;
CREATE TRIGGER processo_passos_sync_del BEFORE DELETE ON public.processo_passos
  FOR EACH ROW EXECUTE FUNCTION public.processo_passos_sync();

-- Processo: encerrar tira as demandas abertas; roadmap ligado/desligado a um passo; prazo do roadmap → data do passo
CREATE OR REPLACE FUNCTION public.processos_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_data DATE;
BEGIN
  IF NEW.tipo = 'onboarding' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'encerrado' THEN
    DELETE FROM demandas d USING processo_passos ps
     WHERE d.processo_passo_id = ps.id AND ps.processo_id = NEW.id AND d.status <> 'feito';
  END IF;
  IF NEW.tipo = 'roadmap' THEN
    IF NEW.passo_onboarding_id IS DISTINCT FROM OLD.passo_onboarding_id THEN
      IF OLD.passo_onboarding_id IS NOT NULL THEN PERFORM sincronizar_passo(OLD.passo_onboarding_id); END IF;
      IF NEW.passo_onboarding_id IS NOT NULL THEN
        -- Ao ligar: a data do passo manda; sem data no passo, o prazo do roadmap vira a data do passo
        SELECT data INTO v_data FROM processo_passos WHERE id = NEW.passo_onboarding_id;
        IF v_data IS NOT NULL THEN
          UPDATE processos SET prazo_final = v_data WHERE id = NEW.id AND prazo_final IS DISTINCT FROM v_data;
        ELSIF NEW.prazo_final IS NOT NULL THEN
          UPDATE processo_passos SET data = NEW.prazo_final WHERE id = NEW.passo_onboarding_id;
        END IF;
        PERFORM sincronizar_passo(NEW.passo_onboarding_id);
      END IF;
    ELSIF NEW.prazo_final IS DISTINCT FROM OLD.prazo_final AND NEW.passo_onboarding_id IS NOT NULL AND pg_trigger_depth() = 1 THEN
      UPDATE processo_passos SET data = NEW.prazo_final WHERE id = NEW.passo_onboarding_id AND data IS DISTINCT FROM NEW.prazo_final;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS processos_sync ON public.processos;
CREATE TRIGGER processos_sync AFTER UPDATE ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.processos_sync();

-- Demandas → passo: mover o card atualiza a data/conclusão do passo
CREATE OR REPLACE FUNCTION public.demandas_atualiza_passo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r TEXT; v_fim INT; v_proc UUID;
BEGIN
  IF pg_trigger_depth() > 1 OR NEW.processo_passo_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'feito' AND OLD.status IS DISTINCT FROM 'feito' THEN
    UPDATE processo_passos SET concluido_em = COALESCE(concluido_em, now()) WHERE id = NEW.processo_passo_id;
    RETURN NEW;
  END IF;
  IF NEW.status = 'feito' THEN RETURN NEW; END IF;
  IF OLD.status = 'feito' THEN
    UPDATE processo_passos SET concluido_em = NULL WHERE id = NEW.processo_passo_id;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT regra_data INTO r FROM demanda_colunas WHERE id = NEW.status;
    IF COALESCE(r, 'nenhuma') = 'nenhuma' THEN
      -- Standby / coluna sem regra: passo sem data, no fim da trilha; entrega vazia
      SELECT processo_id INTO v_proc FROM processo_passos WHERE id = NEW.processo_passo_id;
      SELECT COALESCE(MAX(ordem), -1) + 1 INTO v_fim FROM processo_passos WHERE processo_id = v_proc;
      UPDATE processo_passos SET data = NULL, ordem = v_fim WHERE id = NEW.processo_passo_id;
      UPDATE demandas SET prazo = NULL WHERE id = NEW.id AND prazo IS NOT NULL;
      RETURN NEW;
    END IF;
  END IF;
  -- Coluna com regra (a entrega já foi recalculada) ou entrega editada no painel
  UPDATE processo_passos SET data = NEW.prazo WHERE id = NEW.processo_passo_id AND data IS DISTINCT FROM NEW.prazo;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_30_atualiza_passo ON public.demandas;
CREATE TRIGGER demandas_30_atualiza_passo AFTER UPDATE OF status, dia_semana, prazo ON public.demandas
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.dia_semana IS DISTINCT FROM NEW.dia_semana OR OLD.prazo IS DISTINCT FROM NEW.prazo)
  EXECUTE FUNCTION public.demandas_atualiza_passo();

-- Cliente desmarcado de "Em onboarding" com processo ativo → encerrado sem concluir
CREATE OR REPLACE FUNCTION public.clientes_encerra_onboarding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(OLD.em_onboarding, false) AND NOT COALESCE(NEW.em_onboarding, false) THEN
    UPDATE processos SET status = 'encerrado', concluido_em = now()
     WHERE cliente_id = NEW.id AND tipo = 'onboarding' AND status = 'ativo';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS clientes_encerra_onboarding ON public.clientes;
CREATE TRIGGER clientes_encerra_onboarding AFTER UPDATE OF em_onboarding ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_encerra_onboarding();

-- Diário (depois da virada das 03:00 UTC): passos que entraram na janela viram demandas
CREATE OR REPLACE FUNCTION public.sincronizar_passos_onboarding()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT ps.id FROM processo_passos ps JOIN processos pr ON pr.id = ps.processo_id
     WHERE pr.tipo = 'onboarding' AND pr.status = 'ativo'
       AND (ps.data IS NOT NULL OR EXISTS (SELECT 1 FROM demandas d WHERE d.processo_passo_id = ps.id))
  LOOP
    PERFORM sincronizar_passo(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.sincronizar_passos_onboarding() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sincronizar_passo(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atualizar_conclusao_roadmap(uuid) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('sincronizar-passos-onboarding')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sincronizar-passos-onboarding');
SELECT cron.schedule('sincronizar-passos-onboarding', '1 3 * * *', $$SELECT public.sincronizar_passos_onboarding()$$);
