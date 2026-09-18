-- Alertas de saldo no WhatsApp (n8n + Evolution API)
-- Regra: para cada conta de anúncio (saldo_ads) com dias_restantes <= 3, avisa uma vez por nível
-- (3, 2, 1 dia; 0 = verba acabou) dentro do ciclo da última recarga. Marcar uma recarga muda
-- data_ultima_recarga e, com isso, reinicia o ciclo: só avisa de novo quando faltarem 3 dias.
-- O n8n só faz: rpc/alertas_saldo_pendentes -> envia -> rpc/alertas_saldo_marcar.

CREATE TABLE IF NOT EXISTS public.alertas_saldo_enviados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saldo_ads_id UUID NOT NULL REFERENCES public.saldo_ads(id) ON DELETE CASCADE,
    nivel INTEGER NOT NULL CHECK (nivel BETWEEN 0 AND 3),
    recarga_ref DATE,                       -- data_ultima_recarga no momento do envio (ciclo)
    mensagem TEXT,
    enviado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS alertas_saldo_enviados_ciclo_idx
    ON public.alertas_saldo_enviados (saldo_ads_id, nivel, recarga_ref);

ALTER TABLE public.alertas_saldo_enviados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alertas_saldo_enviados_all" ON public.alertas_saldo_enviados;
CREATE POLICY "alertas_saldo_enviados_all" ON public.alertas_saldo_enviados FOR ALL USING (true) WITH CHECK (true);

-- Formata valor no padrão brasileiro com o símbolo da moeda da operação
CREATE OR REPLACE FUNCTION public.formatar_moeda(p_valor NUMERIC, p_moeda TEXT DEFAULT 'BRL')
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE COALESCE(p_moeda, 'BRL')
               WHEN 'USD' THEN 'US$ ' WHEN 'EUR' THEN '€ ' WHEN 'GBP' THEN '£ ' ELSE 'R$ ' END
           || translate(to_char(COALESCE(p_valor, 0), 'FM999G999G999G990D00'), ',.', '.,');
$$;

-- Contas que precisam de aviso agora (ainda não avisadas neste nível dentro do ciclo atual)
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
            v.plataformas,
            v.verba_diaria_calc,
            v.saldo_atual_estimado,
            v.dias_restantes,
            v.data_ultima_recarga,
            v.valor_ultima_recarga,
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
            || '*' || E'\n'
        || CASE c.nivel
               WHEN 0 THEN 'A verba da conta *acabou* (saldo estimado zerado).'
               WHEN 1 THEN 'Falta *1 dia* para acabar a verba na conta.'
               ELSE 'Faltam *' || c.nivel || ' dias* para acabar a verba na conta.'
           END || E'\n'
        || 'Saldo atual estimado: *' || public.formatar_moeda(c.saldo_atual_estimado, c.moeda) || '*' || E'\n'
        || 'Verba diária: ' || public.formatar_moeda(c.verba_diaria_calc, c.moeda)
        || CASE WHEN c.data_ultima_recarga IS NOT NULL
               THEN ' · Última recarga: ' || to_char(c.data_ultima_recarga, 'DD/MM')
                    || ' (' || public.formatar_moeda(c.valor_ultima_recarga, c.moeda) || ')'
               ELSE '' END
        || CASE WHEN c.plataformas IS NOT NULL AND array_length(c.plataformas, 1) > 0
               THEN E'\n' || 'Plataformas: ' || array_to_string(c.plataformas, ', ')
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

-- Registra que o aviso saiu (chamado pelo n8n depois do envio com sucesso)
CREATE OR REPLACE FUNCTION public.alertas_saldo_marcar(p_saldo_ads_id UUID, p_nivel INTEGER, p_mensagem TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_ref DATE;
BEGIN
    SELECT max(data_recarga) INTO v_ref FROM public.recargas WHERE saldo_ads_id = p_saldo_ads_id;
    INSERT INTO public.alertas_saldo_enviados (saldo_ads_id, nivel, recarga_ref, mensagem)
    VALUES (p_saldo_ads_id, p_nivel, v_ref, p_mensagem)
    ON CONFLICT (saldo_ads_id, nivel, recarga_ref) DO UPDATE SET enviado_em = now(), mensagem = EXCLUDED.mensagem;
END;
$$;

GRANT EXECUTE ON FUNCTION public.formatar_moeda(NUMERIC, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alertas_saldo_pendentes() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alertas_saldo_marcar(UUID, INTEGER, TEXT) TO anon, authenticated;
