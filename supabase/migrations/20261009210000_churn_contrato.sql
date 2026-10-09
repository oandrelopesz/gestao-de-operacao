-- Churn com fim de contrato (pedido do André, 09/10/2026).
-- - churn_em: dia (Brasília) em que o cliente foi marcado como churn; some se ele sair do churn. É o mês em que o churn conta.
-- - contrato_ate: até quando o contrato vai; o cliente fica no Saldo até essa data e depois sai.
-- - churn_efeito_imediato: encerra já (limpa a data) e o cliente sai do Saldo na hora.
-- Mesma saldo_ads_view de 20261007150000_saldo_ajuste.sql; muda só o WHERE (tira o churn que já valeu) e o status 'pausado'
-- (churn com contrato em vigor continua monitorado normalmente).

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS churn_em DATE;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS contrato_ate DATE;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS churn_efeito_imediato BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.clientes_churn_datas()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status_operacional = 'churn' THEN
        IF TG_OP = 'INSERT' OR OLD.status_operacional IS DISTINCT FROM 'churn' THEN
            NEW.churn_em := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
        END IF;
        IF NEW.churn_efeito_imediato THEN
            NEW.contrato_ate := NULL;
        END IF;
    ELSE
        NEW.churn_em := NULL;
        NEW.contrato_ate := NULL;
        NEW.churn_efeito_imediato := false;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_churn_datas ON public.clientes;
CREATE TRIGGER clientes_churn_datas
    BEFORE INSERT OR UPDATE ON public.clientes
    FOR EACH ROW EXECUTE FUNCTION public.clientes_churn_datas();

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
        WHEN c2.cliente_status_operacional = 'pausado' OR c2.cliente_trafego_ativo = false THEN 'pausado'
        WHEN c2.metodo_pagamento = 'cartao'::metodo_pagamento_simplificado THEN 'cartao'
        WHEN c2.ativo = false THEN 'inativo'
        WHEN c2.qtd_recargas = 0 THEN 'sem_recarga'
        WHEN c2.verba_diaria_calc IS NULL OR c2.verba_diaria_calc <= 0 THEN 'sem_verba'
        WHEN c2.saldo_atual_estimado <= 0 THEN 'zerado'
        WHEN c2.dias_restantes <= 1 THEN 'critico'
        WHEN c2.dias_restantes <= 3 THEN 'alerta'
        ELSE 'ok'
    END AS status_alerta,
    COALESCE((SELECT r.ajuste FROM public.recargas r WHERE r.saldo_ads_id = c2.id ORDER BY r.data_recarga DESC, r.created_at DESC LIMIT 1), false) AS ultimo_ajuste
FROM calc2 c2;
