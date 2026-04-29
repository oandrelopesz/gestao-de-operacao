-- Recriar as views sem SECURITY DEFINER e corrigindo nomes de colunas.

DROP VIEW IF EXISTS public.clientes_view;
DROP VIEW IF EXISTS public.nps_avaliacoes_view;
DROP VIEW IF EXISTS public.saldo_ads_view;

CREATE VIEW public.nps_avaliacoes_view WITH (security_invoker = true) AS
SELECT 
    n.*,
    public.get_nps_categoria(n.score_total) as categoria
FROM public.nps_avaliacoes n;

CREATE VIEW public.clientes_view WITH (security_invoker = true) AS
WITH ultima_nps AS (
    SELECT DISTINCT ON (cliente_id)
        cliente_id,
        score_total,
        data_avaliacao
    FROM public.nps_avaliacoes
    ORDER BY cliente_id, data_avaliacao DESC
)
SELECT 
    c.*,
    un.score_total as ultima_nps_score,
    un.data_avaliacao as ultima_nps_data,
    public.get_nps_categoria(un.score_total) as nps_status,
    (SELECT count(*) FROM public.demandas d WHERE d.cliente_id = c.id AND d.status NOT IN ('feito')) as demandas_ativas,
    NULL::text as status_pagamento_mes
FROM public.clientes c
LEFT JOIN ultima_nps un ON c.id = un.cliente_id;

CREATE VIEW public.saldo_ads_view WITH (security_invoker = true) AS
SELECT 
    s.*,
    c.nome as cliente_nome,
    c.agencia as cliente_agencia,
    (s.verba_diaria * 30) as verba_mensal_estimada,
    s.verba_diaria as verba_diaria_calc -- Aliasing para compatibilidade se o frontend espera verba_diaria_calc
FROM public.saldo_ads s
JOIN public.clientes c ON s.cliente_id = c.id;
