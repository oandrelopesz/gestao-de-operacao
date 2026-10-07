-- Financeiro: forma de pagamento (cliente e parcela, na lista de parcelas), "cobrar a partir de" (o atrasado conta desde
-- esse mês; as fontes existentes começam em setembro de 2026), isenção e valor devido congelado no recebimento.
ALTER TABLE public.financeiro_fontes
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT CHECK (forma_pagamento IN ('pix', 'cartao', 'boleto')),
  ADD COLUMN IF NOT EXISTS cobranca_desde DATE;
UPDATE public.financeiro_fontes SET cobranca_desde = DATE '2026-09-01' WHERE cobranca_desde IS NULL;
ALTER TABLE public.financeiro_fontes ALTER COLUMN cobranca_desde SET DEFAULT (date_trunc('month', public.hoje_brt()))::date;
ALTER TABLE public.financeiro_fontes ALTER COLUMN cobranca_desde SET NOT NULL;

ALTER TABLE public.financeiro_recebimentos
  ADD COLUMN IF NOT EXISTS isento BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_devido NUMERIC(12,2);

-- A view repete as colunas de 20260925180000 na mesma ordem e acrescenta forma_pagamento e cobranca_desde no fim;
-- recebimentos_mes ganha isento e valor_devido.
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
      'valor_recebido', rm.valor_recebido,
      'isento', rm.isento,
      'valor_devido', rm.valor_devido
    ) ORDER BY rm.parcela)
    FROM public.financeiro_recebimentos rm
    WHERE rm.fonte_id = f.id
      AND rm.mes_referencia = date_trunc('month', public.hoje_brt())::date
  ), '[]'::jsonb) AS recebimentos_mes,
  f.agencia_id,
  f.forma_pagamento,
  f.cobranca_desde
FROM public.financeiro_fontes f
LEFT JOIN public.financeiro_recebimentos r
  ON r.fonte_id = f.id
  AND r.parcela = 1
  AND r.mes_referencia = date_trunc('month', public.hoje_brt())::date
WHERE f.ativo = true;
