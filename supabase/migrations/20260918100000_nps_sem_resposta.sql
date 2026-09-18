-- NPS: remove a trava que só permitia avaliar às sextas (a tela já era livre desde 04/09,
-- mas o trigger continuava no banco e fazia o salvar falhar nos outros dias) e permite
-- "sem resposta" por critério (NULL), que não entra no cálculo do score.

DROP TRIGGER IF EXISTS trg_nps_apenas_sexta ON public.nps_avaliacoes;
DROP FUNCTION IF EXISTS public.validar_dia_avaliacao_nps() CASCADE;

ALTER TABLE public.nps_avaliacoes
    ALTER COLUMN engajamento DROP NOT NULL,
    ALTER COLUMN resultados_campanha DROP NOT NULL,
    ALTER COLUMN conversao_vendas DROP NOT NULL,
    ALTER COLUMN relacionamento DROP NOT NULL,
    ALTER COLUMN potencial_crescimento DROP NOT NULL;

COMMENT ON COLUMN public.nps_avaliacoes.engajamento IS 'Nota 0-10; NULL = sem resposta (fora do score)';
COMMENT ON COLUMN public.nps_avaliacoes.score_total IS
    'Escala 0-50: soma dos critérios respondidos projetada para 50 (média × 5), para que "sem resposta" não penalize';
