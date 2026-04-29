DROP VIEW IF EXISTS public.nps_avaliacoes_view;

CREATE VIEW public.nps_avaliacoes_view WITH (security_invoker = true) AS
SELECT 
    n.id,
    n.user_id,
    n.cliente_id,
    n.data_avaliacao,
    n.engajamento,
    n.resultados_campanha,
    n.conversao_vendas,
    n.relacionamento,
    n.potencial_crescimento,
    n.score_total,
    n.observacoes,
    n.created_at,
    public.get_nps_categoria(n.score_total) as categoria,
    c.nome as cliente_nome,
    c.agencia as cliente_agencia,
    c.status_operacional as cliente_status_operacional,
    c.em_onboarding as cliente_em_onboarding,
    c.nicho as cliente_nicho,
    c.arquivado as cliente_arquivado
FROM public.nps_avaliacoes n
JOIN public.clientes c ON n.cliente_id = c.id
WHERE c.arquivado = false;

GRANT SELECT ON public.nps_avaliacoes_view TO authenticated;