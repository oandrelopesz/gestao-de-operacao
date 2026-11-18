-- Integração do status do cliente (pausado e churn) com as demais abas (pedido do André, 18/11/2026).
-- Cliente pausado sai do Saldo (e dos alertas, que leem a saldo_ads_view); o saldo das contas fica congelado enquanto ele
-- estiver pausado e é retomado como ajuste quando ele volta a ativo. Churn já saía da view (churn_contrato).
-- Idempotente.

-- Retomada sem passar pela view (o cliente ainda pode estar pausado e fora dela): usa o saldo congelado + recargas da pausa.
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
        saldo := public.calcular_saldo_atual(OLD.id, 0);
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

-- "Tráfego ativo" desligado pausa tudo; ligado de novo retoma tudo (menos se o cliente estiver pausado).
CREATE OR REPLACE FUNCTION public.clientes_trafego_pausa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    alvo BOOLEAN := (NOT NEW.trafego_ativo) OR NEW.status_operacional = 'pausado';
BEGIN
    UPDATE public.saldo_ads
    SET pausado = alvo
    WHERE cliente_id = NEW.id AND ativo = true AND pausado IS DISTINCT FROM alvo;
    RETURN NEW;
END;
$$;

-- Cliente pausado congela o saldo das contas; ao voltar, retoma (respeitando "tráfego ativo").
-- BEFORE de propósito: no congelamento o cliente ainda aparece na saldo_ads_view, de onde sai o saldo de agora.
CREATE OR REPLACE FUNCTION public.clientes_pausa_saldo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status_operacional = 'pausado' THEN
        UPDATE public.saldo_ads SET pausado = true
        WHERE cliente_id = NEW.id AND ativo = true AND pausado = false;
    ELSIF OLD.status_operacional = 'pausado' THEN
        UPDATE public.saldo_ads SET pausado = NOT NEW.trafego_ativo
        WHERE cliente_id = NEW.id AND ativo = true AND pausado IS DISTINCT FROM (NOT NEW.trafego_ativo);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_pausa_saldo ON public.clientes;
CREATE TRIGGER clientes_pausa_saldo
    BEFORE UPDATE OF status_operacional ON public.clientes
    FOR EACH ROW WHEN (OLD.status_operacional IS DISTINCT FROM NEW.status_operacional)
    EXECUTE FUNCTION public.clientes_pausa_saldo();

-- Mesma saldo_ads_view de 20261009230000_pausa_plataforma.sql; só o WHERE ganha a saída do cliente pausado.
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
      -- Cliente pausado sai do monitor (fica na sub-aba Pausados de Clientes); o saldo fica congelado pelo gatilho clientes_pausa_saldo.
      AND c.status_operacional <> 'pausado'
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
