-- Fila de downloads do swipe file: ordem definida pelo usuário e pausa.
-- posicao: menor sai primeiro. Job novo ganha o instante em ms (vai para o fim da fila); ao
-- reorganizar, o app numera os que estão esperando a partir de 0, então continuam na frente.
ALTER TABLE public.swipe_jobs ADD COLUMN IF NOT EXISTS posicao BIGINT;
UPDATE public.swipe_jobs SET posicao = floor(extract(epoch FROM created_at) * 1000)::bigint WHERE posicao IS NULL;
ALTER TABLE public.swipe_jobs ALTER COLUMN posicao SET DEFAULT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
ALTER TABLE public.swipe_jobs ALTER COLUMN posicao SET NOT NULL;
CREATE INDEX IF NOT EXISTS swipe_jobs_fila_idx ON public.swipe_jobs(status, posicao, created_at);
COMMENT ON COLUMN public.swipe_jobs.posicao IS 'Ordem na fila (menor sai primeiro); o app reordena';

-- pausado: o usuário pausou (o worker derruba o download em andamento e libera a vez)
ALTER TABLE public.swipe_jobs DROP CONSTRAINT IF EXISTS swipe_jobs_status_check;
ALTER TABLE public.swipe_jobs ADD CONSTRAINT swipe_jobs_status_check
    CHECK (status IN ('aguardando', 'rodando', 'ok', 'erro', 'pausado'));

ALTER TABLE public.swipe_itens DROP CONSTRAINT IF EXISTS swipe_itens_status_check;
ALTER TABLE public.swipe_itens ADD CONSTRAINT swipe_itens_status_check
    CHECK (status IN ('pendente', 'baixando', 'pronto', 'falhou', 'manual', 'pausado'));
