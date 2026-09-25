-- Tipo "freelancer" na aba Financeiro: trabalho feito para uma agência, que fica atribuído a ela
-- (agencia_id = uma das agências cadastradas; vazio = sem agência definida).
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.financeiro_fontes'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.financeiro_fontes DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.financeiro_fontes
  ADD CONSTRAINT financeiro_fontes_tipo_check CHECK (tipo IN ('agencia', 'cliente_pessoal', 'freelancer'));

ALTER TABLE public.financeiro_fontes
  ADD COLUMN IF NOT EXISTS agencia_id text REFERENCES public.agencias(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- A view ganha agencia_id no fim (mesmas colunas de 20260925150000, na mesma ordem)
CREATE OR REPLACE VIEW public.financeiro_view
WITH (security_invoker = true) AS
SELECT
  f.id AS fonte_id,
  f.user_id,
  f.nome,
  f.tipo,
  f.valor_mensal,
  f.dia_recebimento,
  f.ativo,
  f.observacoes,
  date_trunc('month', public.hoje_brt())::date AS mes_atual,
  r.id AS recebimento_id,
  COALESCE(r.recebido, false) AS recebido_mes_atual,
  r.data_confirmacao,
  r.valor_recebido,
  CASE
    WHEN COALESCE(r.recebido, false) = true THEN 'recebido'
    WHEN public.hoje_brt() > make_date(EXTRACT(year FROM public.hoje_brt())::int, EXTRACT(month FROM public.hoje_brt())::int, LEAST(f.dia_recebimento, 28)) + interval '5 days' THEN 'atrasado'
    WHEN public.hoje_brt() >= make_date(EXTRACT(year FROM public.hoje_brt())::int, EXTRACT(month FROM public.hoje_brt())::int, LEAST(f.dia_recebimento, 28)) THEN 'pendente'
    ELSE 'a_vencer'
  END AS status_mes,
  f.parcelas,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', rm.id,
      'parcela', rm.parcela,
      'recebido', COALESCE(rm.recebido, false),
      'data_confirmacao', rm.data_confirmacao,
      'valor_recebido', rm.valor_recebido
    ) ORDER BY rm.parcela)
    FROM public.financeiro_recebimentos rm
    WHERE rm.fonte_id = f.id
      AND rm.mes_referencia = date_trunc('month', public.hoje_brt())::date
  ), '[]'::jsonb) AS recebimentos_mes,
  f.agencia_id
FROM public.financeiro_fontes f
LEFT JOIN public.financeiro_recebimentos r
  ON r.fonte_id = f.id
  AND r.parcela = 1
  AND r.mes_referencia = date_trunc('month', public.hoje_brt())::date
WHERE f.ativo = true;
