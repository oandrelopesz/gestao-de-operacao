-- Tabela de fontes de receita (agências ou clientes pessoais)
CREATE TABLE public.financeiro_fontes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('agencia', 'cliente_pessoal')),
  valor_mensal numeric(12,2) NOT NULL DEFAULT 0,
  dia_recebimento integer NOT NULL CHECK (dia_recebimento >= 1 AND dia_recebimento <= 31),
  ativo boolean DEFAULT true,
  observacoes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de recebimentos confirmados (1 registro por fonte por mês)
CREATE TABLE public.financeiro_recebimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fonte_id uuid NOT NULL REFERENCES public.financeiro_fontes(id) ON DELETE CASCADE,
  mes_referencia date NOT NULL,
  recebido boolean DEFAULT false,
  data_confirmacao timestamptz,
  valor_recebido numeric(12,2),
  observacoes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(fonte_id, mes_referencia)
);

-- Índices
CREATE INDEX idx_financeiro_fontes_user ON public.financeiro_fontes(user_id);
CREATE INDEX idx_financeiro_recebimentos_user ON public.financeiro_recebimentos(user_id);
CREATE INDEX idx_financeiro_recebimentos_mes ON public.financeiro_recebimentos(mes_referencia);

-- Enable RLS
ALTER TABLE public.financeiro_fontes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_recebimentos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "fontes_select" ON public.financeiro_fontes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "fontes_insert" ON public.financeiro_fontes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fontes_update" ON public.financeiro_fontes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "fontes_delete" ON public.financeiro_fontes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "receb_select" ON public.financeiro_recebimentos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "receb_insert" ON public.financeiro_recebimentos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "receb_update" ON public.financeiro_recebimentos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "receb_delete" ON public.financeiro_recebimentos FOR DELETE USING (auth.uid() = user_id);

-- View consolidada do mês atual
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
  date_trunc('month', CURRENT_DATE)::date AS mes_atual,
  r.id AS recebimento_id,
  COALESCE(r.recebido, false) AS recebido_mes_atual,
  r.data_confirmacao,
  r.valor_recebido,
  -- Status do mês
  CASE
    WHEN COALESCE(r.recebido, false) = true THEN 'recebido'
    WHEN CURRENT_DATE > make_date(EXTRACT(year FROM CURRENT_DATE)::int, EXTRACT(month FROM CURRENT_DATE)::int, LEAST(f.dia_recebimento, 28)) + interval '5 days' THEN 'atrasado'
    WHEN CURRENT_DATE >= make_date(EXTRACT(year FROM CURRENT_DATE)::int, EXTRACT(month FROM CURRENT_DATE)::int, LEAST(f.dia_recebimento, 28)) THEN 'pendente'
    ELSE 'a_vencer'
  END AS status_mes
FROM public.financeiro_fontes f
LEFT JOIN public.financeiro_recebimentos r 
  ON r.fonte_id = f.id 
  AND r.mes_referencia = date_trunc('month', CURRENT_DATE)::date
WHERE f.ativo = true;

GRANT SELECT ON public.financeiro_view TO authenticated;