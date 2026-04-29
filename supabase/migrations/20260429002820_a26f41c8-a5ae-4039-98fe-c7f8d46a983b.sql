-- Enums
CREATE TYPE public.agencia_enum AS ENUM ('effect', 'spike', 'alt', 'pessoais');
CREATE TYPE public.demanda_status AS ENUM ('fazer_hoje', 'fazer_amanha', 'fazer_depois_amanha', 'standby', 'feito');
CREATE TYPE public.demanda_prioridade AS ENUM ('baixa', 'media', 'alta', 'urgente');
CREATE TYPE public.pagamento_status AS ENUM ('em_dia', 'pendente', 'atrasado');
CREATE TYPE public.nps_categoria AS ENUM ('promotor', 'neutro', 'detrator');
CREATE TYPE public.cliente_nps_status AS ENUM ('promotor', 'neutro', 'detrator', 'sem_avaliacao');

-- CLIENTES
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  agencia public.agencia_enum NOT NULL DEFAULT 'effect',
  nicho TEXT,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  verba_ads NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  arquivado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clientes_user ON public.clientes(user_id);
CREATE INDEX idx_clientes_agencia ON public.clientes(agencia);

-- DEMANDAS
CREATE TABLE public.demandas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status public.demanda_status NOT NULL DEFAULT 'fazer_hoje',
  prioridade public.demanda_prioridade NOT NULL DEFAULT 'media',
  prazo DATE,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_demandas_user ON public.demandas(user_id);
CREATE INDEX idx_demandas_cliente ON public.demandas(cliente_id);
CREATE INDEX idx_demandas_status ON public.demandas(status);

-- SALDO
CREATE TABLE public.saldo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  mes_referencia DATE NOT NULL,
  valor_previsto NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_recebido NUMERIC(12,2) NOT NULL DEFAULT 0,
  status_pagamento public.pagamento_status NOT NULL DEFAULT 'pendente',
  data_vencimento DATE,
  data_recebimento DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saldo_user ON public.saldo(user_id);
CREATE INDEX idx_saldo_cliente ON public.saldo(cliente_id);

-- NPS
CREATE TABLE public.nps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nota INTEGER NOT NULL CHECK (nota >= 0 AND nota <= 10),
  categoria public.nps_categoria NOT NULL,
  comentario TEXT,
  data_pesquisa DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nps_user ON public.nps(user_id);
CREATE INDEX idx_nps_cliente ON public.nps(cliente_id);

-- Function: update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_clientes_updated BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tg_demandas_updated BEFORE UPDATE ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tg_saldo_updated BEFORE UPDATE ON public.saldo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Function: derive nps category from nota
CREATE OR REPLACE FUNCTION public.derive_nps_categoria()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nota >= 9 THEN NEW.categoria := 'promotor';
  ELSIF NEW.nota >= 7 THEN NEW.categoria := 'neutro';
  ELSE NEW.categoria := 'detrator';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_nps_categoria BEFORE INSERT OR UPDATE ON public.nps
  FOR EACH ROW EXECUTE FUNCTION public.derive_nps_categoria();

-- VIEW: clientes_view (com status NPS calculado e contagem de demandas ativas)
CREATE OR REPLACE VIEW public.clientes_view
WITH (security_invoker = true)
AS
SELECT
  c.*,
  ultima.nota AS ultima_nps_nota,
  ultima.data_pesquisa AS ultima_nps_data,
  CASE
    WHEN ultima.nota IS NULL THEN 'sem_avaliacao'::public.cliente_nps_status
    WHEN ultima.nota >= 9 THEN 'promotor'::public.cliente_nps_status
    WHEN ultima.nota >= 7 THEN 'neutro'::public.cliente_nps_status
    ELSE 'detrator'::public.cliente_nps_status
  END AS nps_status,
  COALESCE(d.demandas_ativas, 0) AS demandas_ativas,
  saldo_atual.status_pagamento AS status_pagamento_mes,
  saldo_atual.valor_previsto AS valor_previsto_mes,
  saldo_atual.valor_recebido AS valor_recebido_mes
FROM public.clientes c
LEFT JOIN LATERAL (
  SELECT n.nota, n.data_pesquisa
  FROM public.nps n
  WHERE n.cliente_id = c.id
  ORDER BY n.data_pesquisa DESC, n.created_at DESC
  LIMIT 1
) ultima ON true
LEFT JOIN (
  SELECT cliente_id, COUNT(*) AS demandas_ativas
  FROM public.demandas
  WHERE status <> 'feito'
  GROUP BY cliente_id
) d ON d.cliente_id = c.id
LEFT JOIN LATERAL (
  SELECT status_pagamento, valor_previsto, valor_recebido
  FROM public.saldo s
  WHERE s.cliente_id = c.id
    AND date_trunc('month', s.mes_referencia) = date_trunc('month', CURRENT_DATE)
  ORDER BY s.created_at DESC
  LIMIT 1
) saldo_atual ON true;

-- RLS
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saldo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_select_own" ON public.clientes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "clientes_insert_own" ON public.clientes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clientes_update_own" ON public.clientes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "clientes_delete_own" ON public.clientes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "demandas_select_own" ON public.demandas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "demandas_insert_own" ON public.demandas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "demandas_update_own" ON public.demandas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "demandas_delete_own" ON public.demandas FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "saldo_select_own" ON public.saldo FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saldo_insert_own" ON public.saldo FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saldo_update_own" ON public.saldo FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "saldo_delete_own" ON public.saldo FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "nps_select_own" ON public.nps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "nps_insert_own" ON public.nps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nps_update_own" ON public.nps FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "nps_delete_own" ON public.nps FOR DELETE USING (auth.uid() = user_id);