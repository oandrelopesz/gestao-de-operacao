-- Pagamento fracionado na aba Financeiro: a fonte pode receber o mês em parcelas, cada uma com dia e valor.
-- parcelas NULL = pagamento único (valor_mensal no dia_recebimento). Fracionado: [{"dia":5,"valor":1000}, ...]
-- em ordem de dia; o app grava valor_mensal = soma das parcelas e dia_recebimento = dia da 1ª parcela.
ALTER TABLE public.financeiro_fontes
  ADD COLUMN IF NOT EXISTS parcelas jsonb
  CHECK (parcelas IS NULL OR jsonb_typeof(parcelas) = 'array');

-- Um recebimento por fonte, mês e parcela (pagamento único = parcela 1; os registros antigos viram parcela 1)
ALTER TABLE public.financeiro_recebimentos
  ADD COLUMN IF NOT EXISTS parcela smallint NOT NULL DEFAULT 1 CHECK (parcela >= 1);
ALTER TABLE public.financeiro_recebimentos DROP CONSTRAINT IF EXISTS financeiro_recebimentos_fonte_id_mes_referencia_key;
ALTER TABLE public.financeiro_recebimentos DROP CONSTRAINT IF EXISTS financeiro_recebimentos_fonte_mes_parcela_key;
ALTER TABLE public.financeiro_recebimentos
  ADD CONSTRAINT financeiro_recebimentos_fonte_mes_parcela_key UNIQUE (fonte_id, mes_referencia, parcela);

-- A view mantém as colunas de antes, agora da parcela 1 (abas abertas com o front antigo seguem funcionando),
-- e ganha as parcelas e os recebimentos do mês. O mês é o de Brasília (hoje_brt), o mesmo que o app usa.
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
  ), '[]'::jsonb) AS recebimentos_mes
FROM public.financeiro_fontes f
LEFT JOIN public.financeiro_recebimentos r
  ON r.fonte_id = f.id
  AND r.parcela = 1
  AND r.mes_referencia = date_trunc('month', public.hoje_brt())::date
WHERE f.ativo = true;
