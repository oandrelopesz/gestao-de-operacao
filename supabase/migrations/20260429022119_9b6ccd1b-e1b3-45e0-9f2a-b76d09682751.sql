-- Primeiro, as atualizações de dados que são independentes
UPDATE public.clientes 
SET data_inicio = '2026-05-11', data_limite_verba = '2026-08-21'
WHERE nome = 'UPIS';

UPDATE public.clientes 
SET data_inicio = '2026-05-04', data_limite_verba = '2026-08-21'
WHERE nome = 'Unieuro';

UPDATE public.saldo_ads
SET verba_diaria = 582.52
WHERE cliente_id IN (SELECT id FROM public.clientes WHERE nome = 'UPIS');

UPDATE public.saldo_ads
SET verba_diaria = 4545.45
WHERE cliente_id IN (SELECT id FROM public.clientes WHERE nome = 'Unieuro');

-- Para recriar a view com colunas em ordem diferente ou novas colunas, é melhor dropar e criar
DROP VIEW IF EXISTS public.saldo_ads_view;

CREATE VIEW public.saldo_ads_view AS
 SELECT s.id,
    s.user_id,
    s.cliente_id,
    c.nome AS cliente_nome,
    c.agencia AS cliente_agencia,
    s.metodo_pagamento,
    s.plataformas,
    s.verba_diaria,
    s.ativo,
    s.observacoes,
    s.created_at,
    s.updated_at,
    CASE
        WHEN c.tipo_verba = 'total_periodo' AND c.verba_total_contratada IS NOT NULL AND c.data_inicio IS NOT NULL AND c.data_limite_verba IS NOT NULL THEN 
            ROUND((c.verba_total_contratada / NULLIF(EXTRACT(day FROM (c.data_limite_verba::timestamp - c.data_inicio::timestamp)), 0))::numeric, 2)
        ELSE s.verba_diaria
    END AS verba_diaria_calc,
    CASE
        WHEN c.tipo_verba = 'total_periodo' AND c.verba_total_contratada IS NOT NULL AND c.data_inicio IS NOT NULL AND c.data_limite_verba IS NOT NULL THEN 
            ROUND(((c.verba_total_contratada / NULLIF(EXTRACT(day FROM (c.data_limite_verba::timestamp - c.data_inicio::timestamp)), 0)) * 30)::numeric, 2)
        ELSE ROUND((s.verba_diaria * 30::numeric), 2)
    END AS verba_mensal_estimada
   FROM (public.saldo_ads s
     JOIN public.clientes c ON ((s.cliente_id = c.id)));
