ALTER TABLE public.clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.demandas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccao DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccao_interacoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.saldo_ads DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recargas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_avaliacoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.demanda_execucoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_recebimentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_fontes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cursos DISABLE ROW LEVEL SECURITY;

-- Consolidate all data to a single 'master' user ID for consistency
-- Using the ID that already has data: b34bdae5-7a67-4b63-a46f-8aad43a06c63
UPDATE public.clientes SET user_id = 'b34bdae5-7a67-4b63-a46f-8aad43a06c63' WHERE user_id IS NULL OR user_id != 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';
UPDATE public.demandas SET user_id = 'b34bdae5-7a67-4b63-a46f-8aad43a06c63' WHERE user_id IS NULL OR user_id != 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';
UPDATE public.prospeccao SET user_id = 'b34bdae5-7a67-4b63-a46f-8aad43a06c63' WHERE user_id IS NULL OR user_id != 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';
UPDATE public.saldo_ads SET user_id = 'b34bdae5-7a67-4b63-a46f-8aad43a06c63' WHERE user_id IS NULL OR user_id != 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';
UPDATE public.financeiro_fontes SET user_id = 'b34bdae5-7a67-4b63-a46f-8aad43a06c63' WHERE user_id IS NULL OR user_id != 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';
UPDATE public.cursos SET user_id = 'b34bdae5-7a67-4b63-a46f-8aad43a06c63' WHERE user_id IS NULL OR user_id != 'b34bdae5-7a67-4b63-a46f-8aad43a06c63';
