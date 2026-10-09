-- Pausar o tráfego por plataforma (pedido do André, 09/10/2026).
-- Cada conta de saldo (uma plataforma) pode ficar pausada: o saldo congela (não desconta o consumo), some dos alertas e
-- da verba do cliente, e ao retomar o saldo guardado vira um ajuste (o consumo volta a descontar dali).
-- Pausa e retomada valem nos dois sentidos: a aba Saldo grava saldo_ads.pausado e o gatilho espelha em
-- operacoes.plataformas_config[plataforma].pausado (a aba Clientes lê e grava ali).
-- Desligar "tráfego ativo" do cliente pausa todas as plataformas; ligar de novo retoma todas.

ALTER TABLE public.saldo_ads ADD COLUMN IF NOT EXISTS pausado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.saldo_ads ADD COLUMN IF NOT EXISTS pausado_desde DATE;
ALTER TABLE public.saldo_ads ADD COLUMN IF NOT EXISTS saldo_congelado NUMERIC;

-- Mesma função de 20261007150000_saldo_ajuste.sql; pausada, devolve o saldo congelado mais o que entrou depois da pausa (sem consumo).
CREATE OR REPLACE FUNCTION public.calcular_saldo_atual(p_saldo_ads_id UUID, p_verba_diaria NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    r RECORD;
    bal NUMERIC := 0;
    prev DATE := NULL;
    vd NUMERIC := GREATEST(COALESCE(p_verba_diaria, 0), 0);
    pausa RECORD;
BEGIN
    SELECT s.pausado, s.pausado_desde, s.saldo_congelado INTO pausa FROM public.saldo_ads s WHERE s.id = p_saldo_ads_id;
    IF COALESCE(pausa.pausado, false) THEN
        bal := GREATEST(0, COALESCE(pausa.saldo_congelado, 0));
        FOR r IN
            SELECT valor, ajuste FROM public.recargas
            WHERE saldo_ads_id = p_saldo_ads_id AND data_recarga >= COALESCE(pausa.pausado_desde, CURRENT_DATE)
            ORDER BY data_recarga, created_at
        LOOP
            IF r.ajuste THEN
                bal := GREATEST(0, COALESCE(r.valor, 0));
            ELSE
                bal := bal + COALESCE(r.valor, 0);
            END IF;
        END LOOP;
        RETURN bal;
    END IF;

    FOR r IN
        SELECT data_recarga, valor, ajuste
        FROM public.recargas
        WHERE saldo_ads_id = p_saldo_ads_id
        ORDER BY data_recarga, created_at
    LOOP
        IF prev IS NOT NULL THEN
            bal := GREATEST(0, bal - vd * (r.data_recarga - prev));
        END IF;
        IF r.ajuste THEN
            bal := GREATEST(0, COALESCE(r.valor, 0));
        ELSE
            bal := bal + COALESCE(r.valor, 0);
        END IF;
        prev := r.data_recarga;
    END LOOP;

    IF prev IS NULL THEN
        RETURN 0;
    END IF;

    RETURN GREATEST(0, bal - vd * GREATEST(0, CURRENT_DATE - prev));
END;
$$;

-- Ao pausar: guarda o saldo de agora. Ao retomar: lança o saldo guardado como ajuste de hoje (o consumo volta a descontar dali).
CREATE OR REPLACE FUNCTION public.saldo_ads_pausa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    saldo NUMERIC;
BEGIN
    IF NEW.pausado AND NOT OLD.pausado THEN
        SELECT v.saldo_atual_estimado INTO saldo FROM public.saldo_ads_view v WHERE v.id = OLD.id;
        NEW.pausado_desde := hoje;
        NEW.saldo_congelado := COALESCE(saldo, 0);
    ELSIF NOT NEW.pausado AND OLD.pausado THEN
        SELECT v.saldo_atual_estimado INTO saldo FROM public.saldo_ads_view v WHERE v.id = OLD.id;
        IF saldo IS NOT NULL AND EXISTS (SELECT 1 FROM public.recargas r WHERE r.saldo_ads_id = OLD.id) THEN
            INSERT INTO public.recargas (saldo_ads_id, data_recarga, valor, ajuste, observacoes)
            VALUES (OLD.id, hoje, saldo, true, 'Tráfego retomado: saldo mantido durante a pausa');
        END IF;
        NEW.pausado_desde := NULL;
        NEW.saldo_congelado := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS saldo_ads_pausa ON public.saldo_ads;
CREATE TRIGGER saldo_ads_pausa
    BEFORE UPDATE OF pausado ON public.saldo_ads
    FOR EACH ROW WHEN (OLD.pausado IS DISTINCT FROM NEW.pausado)
    EXECUTE FUNCTION public.saldo_ads_pausa();

-- Espelha a pausa no cadastro da operação (a aba Clientes lê plataformas_config[plataforma].pausado).
CREATE OR REPLACE FUNCTION public.saldo_ads_pausa_config()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.operacao_id IS NOT NULL AND NEW.plataformas IS NOT NULL AND array_length(NEW.plataformas, 1) = 1 THEN
        UPDATE public.operacoes
        SET plataformas_config = jsonb_set(plataformas_config, ARRAY[NEW.plataformas[1], 'pausado'], to_jsonb(NEW.pausado), true)
        WHERE id = NEW.operacao_id
          AND plataformas_config IS NOT NULL
          AND plataformas_config ? NEW.plataformas[1]
          AND COALESCE((plataformas_config -> NEW.plataformas[1] ->> 'pausado')::boolean, false) IS DISTINCT FROM NEW.pausado;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS saldo_ads_pausa_config ON public.saldo_ads;
CREATE TRIGGER saldo_ads_pausa_config
    AFTER UPDATE OF pausado ON public.saldo_ads
    FOR EACH ROW WHEN (OLD.pausado IS DISTINCT FROM NEW.pausado)
    EXECUTE FUNCTION public.saldo_ads_pausa_config();

-- "Tráfego ativo" desligado pausa tudo; ligado de novo retoma tudo.
CREATE OR REPLACE FUNCTION public.clientes_trafego_pausa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.saldo_ads
    SET pausado = NOT NEW.trafego_ativo
    WHERE cliente_id = NEW.id AND ativo = true AND pausado IS DISTINCT FROM (NOT NEW.trafego_ativo);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_trafego_pausa ON public.clientes;
CREATE TRIGGER clientes_trafego_pausa
    AFTER UPDATE OF trafego_ativo ON public.clientes
    FOR EACH ROW WHEN (OLD.trafego_ativo IS DISTINCT FROM NEW.trafego_ativo)
    EXECUTE FUNCTION public.clientes_trafego_pausa();

-- Verba mensal da operação sem as plataformas pausadas (proporção da verba que segue rodando; sem pausa, nada muda).
CREATE OR REPLACE FUNCTION public.operacao_verba_mensal(o public.operacoes)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN o.tipo_verba = 'total_periodo' THEN
            CASE
                WHEN o.verba_total_contratada IS NOT NULL AND o.data_inicio_verba IS NOT NULL AND o.data_limite_verba IS NOT NULL
                THEN round(o.verba_total_contratada / GREATEST(1, o.data_limite_verba - o.data_inicio_verba) * 30, 2)
                ELSE NULL
            END
        ELSE COALESCE(o.verba_ads, 0)
    END * COALESCE((
        SELECT sum(CASE WHEN COALESCE((e.value ->> 'pausado')::boolean, false) THEN 0 ELSE COALESCE((e.value ->> 'verba')::numeric, 0) END)
               / NULLIF(sum(COALESCE((e.value ->> 'verba')::numeric, 0)), 0)
        FROM jsonb_each(COALESCE(o.plataformas_config, '{}'::jsonb)) e
    ), 1);
$$;

-- Mesma saldo_ads_view de 20261009210000_churn_contrato.sql; pausada vira status 'pausado' e a view expõe
-- plataforma_pausada e plataforma_pausada_desde no fim.
CREATE OR REPLACE VIEW public.saldo_ads_view
WITH (security_invoker = true) AS
WITH base AS (
    SELECT
        s.id,
        s.user_id,
        s.cliente_id,
        c.nome AS cliente_nome,
        c.agencia AS cliente_agencia,
        c.status_operacional AS cliente_status_operacional,
        c.trafego_ativo AS cliente_trafego_ativo,
        s.metodo_pagamento,
        s.plataformas,
        s.verba_diaria,
        s.ativo,
        s.observacoes,
        s.created_at,
        s.updated_at,
        s.alerta_dispensado_em,
        s.operacao_id,
        o.nome AS operacao_nome,
        o.ordem AS operacao_ordem,
        COALESCE(o.moeda, 'BRL') AS moeda,
        public.cotacao_brl(COALESCE(o.moeda, 'BRL')) AS cotacao_brl,
        CASE
            WHEN s.verba_diaria IS NOT NULL THEN s.verba_diaria
            WHEN o.id IS NOT NULL AND o.tipo_verba = 'total_periodo'
                AND o.verba_total_contratada IS NOT NULL
                AND o.data_inicio_verba IS NOT NULL
                AND o.data_limite_verba IS NOT NULL
            THEN round(o.verba_total_contratada / GREATEST(1, o.data_limite_verba - o.data_inicio_verba), 2)
            WHEN o.id IS NULL AND c.tipo_verba = 'total_periodo'::tipo_verba_enum
                AND c.verba_total_contratada IS NOT NULL
                AND c.data_inicio IS NOT NULL
                AND c.data_limite_verba IS NOT NULL
            THEN round((c.verba_total_contratada / NULLIF(EXTRACT(day FROM (c.data_limite_verba::timestamp - c.data_inicio::timestamp)), 0))::numeric, 2)
            ELSE NULL
        END AS verba_diaria_calc,
        COALESCE((SELECT sum(r.valor) FROM public.recargas r WHERE r.saldo_ads_id = s.id AND NOT r.ajuste), 0) AS saldo_total_acumulado,
        (SELECT count(*) FROM public.recargas r WHERE r.saldo_ads_id = s.id) AS qtd_recargas,
        (SELECT max(r.data_recarga) FROM public.recargas r WHERE r.saldo_ads_id = s.id) AS data_ultima_recarga,
        (SELECT r.valor FROM public.recargas r WHERE r.saldo_ads_id = s.id ORDER BY r.data_recarga DESC, r.created_at DESC LIMIT 1) AS valor_ultima_recarga
    FROM public.saldo_ads s
    JOIN public.clientes c ON s.cliente_id = c.id
    LEFT JOIN public.operacoes o ON o.id = s.operacao_id
    WHERE c.arquivado = false
      -- Churn que já valeu (efeito imediato, sem data ou contrato vencido) sai do monitor; com contrato em vigor, fica até a data.
      AND NOT (c.status_operacional = 'churn' AND (
            c.churn_efeito_imediato
            OR c.contrato_ate IS NULL
            OR c.contrato_ate < (now() AT TIME ZONE 'America/Sao_Paulo')::date))
),
calc AS (
    SELECT
        b.*,
        public.calcular_saldo_atual(b.id, b.verba_diaria_calc) AS saldo_atual_estimado
    FROM base b
),
calc2 AS (
    SELECT
        c.*,
        CASE
            WHEN c.verba_diaria_calc > 0 AND c.qtd_recargas > 0
            THEN c.saldo_atual_estimado / c.verba_diaria_calc
            ELSE NULL
        END AS dias_restantes,
        -- Alerta dispensado só vale até a próxima recarga (ou ajuste)
        (c.alerta_dispensado_em IS NOT NULL
            AND (c.data_ultima_recarga IS NULL OR c.alerta_dispensado_em::date >= c.data_ultima_recarga)) AS alerta_dispensado
    FROM calc c
)
SELECT
    c2.*,
    CASE
        WHEN c2.dias_restantes IS NULL THEN NULL
        ELSE (CURRENT_DATE + floor(c2.dias_restantes)::int)
    END AS data_prevista_fim,
    CASE
        WHEN c2.cliente_status_operacional = 'pausado' OR c2.cliente_trafego_ativo = false
            OR COALESCE((SELECT s.pausado FROM public.saldo_ads s WHERE s.id = c2.id), false) THEN 'pausado'
        WHEN c2.metodo_pagamento = 'cartao'::metodo_pagamento_simplificado THEN 'cartao'
        WHEN c2.ativo = false THEN 'inativo'
        WHEN c2.qtd_recargas = 0 THEN 'sem_recarga'
        WHEN c2.verba_diaria_calc IS NULL OR c2.verba_diaria_calc <= 0 THEN 'sem_verba'
        WHEN c2.saldo_atual_estimado <= 0 THEN 'zerado'
        WHEN c2.dias_restantes <= 1 THEN 'critico'
        WHEN c2.dias_restantes <= 3 THEN 'alerta'
        ELSE 'ok'
    END AS status_alerta,
    COALESCE((SELECT r.ajuste FROM public.recargas r WHERE r.saldo_ads_id = c2.id ORDER BY r.data_recarga DESC, r.created_at DESC LIMIT 1), false) AS ultimo_ajuste,
    COALESCE((SELECT s.pausado FROM public.saldo_ads s WHERE s.id = c2.id), false) AS plataforma_pausada,
    (SELECT s.pausado_desde FROM public.saldo_ads s WHERE s.id = c2.id) AS plataforma_pausada_desde
FROM calc2 c2;

