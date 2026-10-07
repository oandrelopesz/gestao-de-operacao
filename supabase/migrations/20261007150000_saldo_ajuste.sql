-- Ajuste de saldo: o André informa o saldo real da conta numa data e ele SUBSTITUI o saldo estimado;
-- dali em diante o consumo diário continua descontando e recargas posteriores somam em cima.
-- O ajuste é uma linha de recargas com ajuste = true (valor = saldo informado):
-- - não entra no "Total investido" (saldo_total_acumulado);
-- - conta como lançamento para o resto (qtd_recargas, data_ultima_recarga): reinicia o ciclo do
--   alerta do WhatsApp e a dispensa, como uma recarga;
-- - a view expõe ultimo_ajuste (o último lançamento é um ajuste) para a tela e a mensagem.

ALTER TABLE public.recargas ADD COLUMN IF NOT EXISTS ajuste BOOLEAN NOT NULL DEFAULT false;

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
BEGIN
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

-- Mesma view de 20260917140000_operacoes.sql; muda o total investido (sem ajustes) e acrescenta ultimo_ajuste no fim
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
        WHEN c2.cliente_status_operacional IN ('pausado', 'churn') OR c2.cliente_trafego_ativo = false THEN 'pausado'
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

-- Alerta do WhatsApp: com ajuste como último lançamento, diz "Saldo ajustado em" no lugar de "Última recarga"
CREATE OR REPLACE FUNCTION public.alertas_saldo_pendentes()
RETURNS TABLE (
    saldo_ads_id UUID,
    cliente_nome TEXT,
    operacao_nome TEXT,
    nivel INTEGER,
    dias_restantes NUMERIC,
    saldo_atual_estimado NUMERIC,
    recarga_ref DATE,
    mensagem TEXT
)
LANGUAGE sql
STABLE
AS $$
    WITH candidatas AS (
        SELECT
            v.id,
            v.cliente_nome,
            v.operacao_nome,
            v.moeda,
            COALESCE(array_to_string(v.plataformas, ', '), '') AS plataforma,
            v.verba_diaria_calc,
            v.saldo_atual_estimado,
            v.dias_restantes,
            v.data_ultima_recarga,
            v.valor_ultima_recarga,
            v.ultimo_ajuste,
            CASE
                WHEN v.status_alerta = 'zerado' THEN 0
                WHEN v.dias_restantes <= 1 THEN 1
                WHEN v.dias_restantes <= 2 THEN 2
                ELSE 3
            END AS nivel
        FROM public.saldo_ads_view v
        WHERE v.status_alerta IN ('alerta', 'critico', 'zerado')
          AND COALESCE(v.alerta_dispensado, false) = false
    )
    SELECT
        c.id,
        c.cliente_nome,
        c.operacao_nome,
        c.nivel,
        round(c.dias_restantes, 1),
        round(c.saldo_atual_estimado, 2),
        c.data_ultima_recarga,
        '🚨 *ALERTA DE SALDO - ' || c.cliente_nome
            || CASE WHEN c.operacao_nome IS NOT NULL AND c.operacao_nome <> '' THEN ' (' || c.operacao_nome || ')' ELSE '' END
            || CASE WHEN c.plataforma <> '' THEN ' · ' || c.plataforma ELSE '' END
            || '*' || E'\n'
        || CASE c.nivel
               WHEN 0 THEN 'A verba ' || CASE WHEN c.plataforma <> '' THEN 'do *' || c.plataforma || '*' ELSE 'da conta' END
                           || ' *acabou* (saldo estimado zerado).'
               WHEN 1 THEN 'Falta *1 dia* para acabar a verba '
                           || CASE WHEN c.plataforma <> '' THEN 'no *' || c.plataforma || '*' ELSE 'na conta' END || '.'
               ELSE 'Faltam *' || c.nivel || ' dias* para acabar a verba '
                           || CASE WHEN c.plataforma <> '' THEN 'no *' || c.plataforma || '*' ELSE 'na conta' END || '.'
           END || E'\n'
        || 'Saldo atual estimado: *' || public.formatar_moeda(c.saldo_atual_estimado, c.moeda) || '*' || E'\n'
        || 'Verba diária: ' || public.formatar_moeda(c.verba_diaria_calc, c.moeda)
        || CASE WHEN c.data_ultima_recarga IS NOT NULL
               THEN CASE WHEN c.ultimo_ajuste THEN ' · Saldo ajustado em ' ELSE ' · Última recarga: ' END
                    || to_char(c.data_ultima_recarga, 'DD/MM')
                    || ' (' || public.formatar_moeda(c.valor_ultima_recarga, c.moeda) || ')'
               ELSE '' END
    FROM candidatas c
    WHERE NOT EXISTS (
        SELECT 1 FROM public.alertas_saldo_enviados e
        WHERE e.saldo_ads_id = c.id
          AND e.nivel = c.nivel
          AND e.recarga_ref IS NOT DISTINCT FROM c.data_ultima_recarga
    )
    ORDER BY c.nivel, c.cliente_nome;
$$;

GRANT EXECUTE ON FUNCTION public.alertas_saldo_pendentes() TO anon, authenticated;
