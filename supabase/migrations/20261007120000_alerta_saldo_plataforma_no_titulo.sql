-- Alerta de saldo no WhatsApp: a plataforma vai para o título e para a frase do aviso
-- ("ALERTA DE SALDO - Cliente (Operação) · Google" / "...para acabar a verba no *Google*"),
-- no lugar da linha "Plataformas:" no fim. Cada conta (saldo_ads) é de uma plataforma desde
-- 2026-10-07; o resto da regra (níveis, ciclo, dispensa) fica igual a 20260918150000.
-- O n8n não muda: ele só repassa a coluna mensagem.

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
               THEN ' · Última recarga: ' || to_char(c.data_ultima_recarga, 'DD/MM')
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
