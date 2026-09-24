-- Revisão final do Plano B.
-- 1) Card de onboarding movido para Standby/coluna sem regra: a entrega já sai NULL no próprio UPDATE
--    (antes o RETURNING trazia o prazo antigo e só o AFTER trigger limpava depois).
-- 2) sincronizar_passo: passo cuja data foi limpa pelo Kanban (Standby) não tem o card apagado depois;
--    só apaga quando a data sai da janela ou é limpa na aba Onboarding (p_forcar).

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
    ELSE CASE WHEN TG_OP = 'UPDATE' AND NEW.processo_passo_id IS NOT NULL AND NEW.status <> 'feito' AND NEW.status IS DISTINCT FROM OLD.status THEN NULL ELSE NEW.prazo END
  END;
  RETURN NEW;
END $$;

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
  v_prev TEXT;
BEGIN
  v_prev := current_setting('app.sem_regra_data', true);
  PERFORM set_config('app.sem_regra_data', 'on', true);
  SELECT ps.*, pr.tipo, pr.status AS proc_status, pr.cliente_id, c.nome AS cliente_nome
    INTO p
    FROM processo_passos ps
    JOIN processos pr ON pr.id = ps.processo_id
    JOIN clientes c ON c.id = pr.cliente_id
   WHERE ps.id = p_passo;
  IF NOT FOUND OR p.tipo <> 'onboarding' THEN
    PERFORM set_config('app.sem_regra_data', COALESCE(NULLIF(v_prev, ''), 'off'), true);
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
        IF alvo IS NULL AND (p.data IS NOT NULL OR p_forcar) THEN
          DELETE FROM demandas WHERE id = d.id;
          d.id := NULL;
        ELSIF alvo <> d.status THEN
          SELECT COALESCE(MAX(ordem), -1) + 1 INTO v_ordem FROM demandas WHERE status = alvo;
          UPDATE demandas SET status = alvo, ordem = v_ordem, prazo = p.data, titulo = v_titulo, descricao = p.observacoes, cliente_id = p.cliente_id, roadmap_id = v_roadmap WHERE id = d.id;
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
  PERFORM set_config('app.sem_regra_data', COALESCE(NULLIF(v_prev, ''), 'off'), true);
END $$;
REVOKE EXECUTE ON FUNCTION public.sincronizar_passo(uuid, boolean) FROM PUBLIC, anon, authenticated;
