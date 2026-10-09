-- Financeiro: fonte com recebimento POR CLIENTE (pedido do André, 09/10/2026).
-- - tipo_recebimento: 'fixo' (padrão, tudo como antes) ou 'por_cliente' (o valor do mês vem dos clientes da agência).
-- - modelo_por_cliente: 'fixo_variavel' (valor_fixo + variável por cliente) ou 'so_variavel'.
-- - valor_fixo e valor_por_cliente: o fixo mensal e o valor padrão de cada cliente; a agência é a agencia_id que a fonte já tem.
-- - financeiro_fonte_clientes: valor personalizado de um cliente naquela fonte (sem linha = valor padrão).
-- O valor esperado do mês é calculado no front (src/lib/financeiroPorCliente.ts) a partir dos clientes; o mês acertado
-- fica congelado em financeiro_recebimentos.valor_devido, então nada que já foi cobrado é reescrito.
ALTER TABLE public.financeiro_fontes
  ADD COLUMN IF NOT EXISTS tipo_recebimento TEXT NOT NULL DEFAULT 'fixo',
  ADD COLUMN IF NOT EXISTS modelo_por_cliente TEXT,
  ADD COLUMN IF NOT EXISTS valor_fixo NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valor_por_cliente NUMERIC(12,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financeiro_fontes_tipo_recebimento_check') THEN
    ALTER TABLE public.financeiro_fontes
      ADD CONSTRAINT financeiro_fontes_tipo_recebimento_check CHECK (tipo_recebimento IN ('fixo', 'por_cliente'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financeiro_fontes_modelo_por_cliente_check') THEN
    ALTER TABLE public.financeiro_fontes
      ADD CONSTRAINT financeiro_fontes_modelo_por_cliente_check CHECK (modelo_por_cliente IN ('fixo_variavel', 'so_variavel'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.financeiro_fonte_clientes (
  fonte_id UUID NOT NULL REFERENCES public.financeiro_fontes(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  valor NUMERIC(12,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fonte_id, cliente_id)
);

ALTER TABLE public.financeiro_fonte_clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financeiro_fonte_clientes_all" ON public.financeiro_fonte_clientes;
CREATE POLICY "financeiro_fonte_clientes_all" ON public.financeiro_fonte_clientes FOR ALL USING (true) WITH CHECK (true);

-- Realtime: a aba refaz a conta quando um cliente muda (churn, arquivar) ou um valor personalizado é salvo.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['financeiro_fonte_clientes', 'clientes'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- A view repete as colunas de 20261001200001 na mesma ordem e acrescenta as quatro novas no fim.
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
  f.cobranca_desde,
  f.tipo_recebimento,
  f.modelo_por_cliente,
  f.valor_fixo,
  f.valor_por_cliente
FROM public.financeiro_fontes f
LEFT JOIN public.financeiro_recebimentos r
  ON r.fonte_id = f.id
  AND r.parcela = 1
  AND r.mes_referencia = date_trunc('month', public.hoje_brt())::date
WHERE f.ativo = true;
