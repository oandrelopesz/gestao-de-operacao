-- CRM (aba Prospecção → CRM): colunas configuráveis por tipo, histórico do lead e os campos novos em prospeccao.
-- Idempotente. Aplicar pelo editor SQL do Lovable.

CREATE TABLE IF NOT EXISTS public.crm_colunas (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  titulo TEXT NOT NULL,
  hex TEXT NOT NULL DEFAULT '#64748b',
  ordem INTEGER NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'padrao' CHECK (tipo IN (
    'padrao', 'follow_up', 'reuniao', 'confirmacao', 'remarcacao', 'realizada',
    'proposta', 'follow_up_proposta', 'ganho', 'perdido', 'desqualificado'
  )),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.crm_colunas (id, titulo, hex, ordem, tipo, config) VALUES
  ('novo_lead', 'Novo lead', '#64748b', 0, 'padrao', '{}'),
  ('primeiro_contato', 'Primeiro contato', '#3b82f6', 1, 'padrao', '{}'),
  ('follow_up', 'Follow-up', '#06b6d4', 2, 'follow_up', '{"teto": 7}'),
  ('respondeu', 'Respondeu', '#14b8a6', 3, 'padrao', '{}'),
  ('desenvolvendo', 'Desenvolvendo conversa', '#10b981', 4, 'padrao', '{}'),
  ('reuniao_marcada', 'Reunião marcada', '#8b5cf6', 5, 'reuniao', '{}'),
  ('reuniao_confirmada', 'Reunião confirmada', '#6366f1', 6, 'confirmacao', '{}'),
  ('remarcar', 'Remarcar reunião', '#f59e0b', 7, 'remarcacao', '{}'),
  ('reuniao_realizada', 'Reunião realizada', '#a855f7', 8, 'realizada', '{}'),
  ('proposta', 'Proposta enviada para avaliação', '#f97316', 9, 'proposta', '{}'),
  ('follow_up_proposta', 'Follow-up de proposta', '#fb923c', 10, 'follow_up_proposta', '{"teto": 7}'),
  ('fechamento', 'Fechamento', '#16a34a', 11, 'ganho', '{}'),
  ('perdido', 'Lead perdido', '#f43f5e', 12, 'perdido', '{}'),
  ('desqualificado', 'Lead desqualificado', '#71717a', 13, 'desqualificado', '{}')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.prospeccao
  ADD COLUMN IF NOT EXISTS coluna_id TEXT REFERENCES public.crm_colunas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coluna_desde TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trafego TEXT NOT NULL DEFAULT 'organico',
  ADD COLUMN IF NOT EXISTS empresa TEXT,
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS site TEXT,
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS google_meu_negocio TEXT,
  ADD COLUMN IF NOT EXISTS faturamento_faixa TEXT,
  ADD COLUMN IF NOT EXISTS investimento_faixa TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS fbclid TEXT,
  ADD COLUMN IF NOT EXISTS gclid TEXT,
  ADD COLUMN IF NOT EXISTS pagina_entrada TEXT,
  ADD COLUMN IF NOT EXISTS referencia TEXT,
  ADD COLUMN IF NOT EXISTS proximo_contato_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follow_up_proposta INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reuniao_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reuniao_duracao_min INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS reuniao_marcada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evento_google_id TEXT,
  ADD COLUMN IF NOT EXISTS evento_meet_link TEXT,
  ADD COLUMN IF NOT EXISTS evento_status TEXT,
  ADD COLUMN IF NOT EXISTS evento_erro TEXT,
  ADD COLUMN IF NOT EXISTS pontos_contato JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS compareceu BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_shows INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remarcacoes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_remarcacao TEXT,
  ADD COLUMN IF NOT EXISTS valor_proposta NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valor_fechamento NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS motivo_desqualificacao TEXT,
  ADD COLUMN IF NOT EXISTS desqualificado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS perdido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fechado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS primeiro_contato_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS primeira_reuniao_marcada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS primeira_reuniao_realizada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proposta_enviada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_ups_ate_reuniao INTEGER,
  ADD COLUMN IF NOT EXISTS follow_ups_ate_fechamento INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospeccao_trafego_check') THEN
    ALTER TABLE public.prospeccao ADD CONSTRAINT prospeccao_trafego_check CHECK (trafego IN ('organico', 'pago'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS prospeccao_coluna_idx ON public.prospeccao(coluna_id);

CREATE TABLE IF NOT EXISTS public.crm_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.prospeccao(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_eventos_lead_idx ON public.crm_eventos(lead_id, created_at);
CREATE INDEX IF NOT EXISTS crm_eventos_data_idx ON public.crm_eventos(created_at);

-- Mesmo padrão das outras tabelas do app (sem login): RLS com política aberta
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_colunas', 'crm_eventos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_all') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)', t || '_all', t);
    END IF;
  END LOOP;
END $$;

-- Backfill dos leads que já existiam (etapa antiga → coluna nova)
UPDATE public.prospeccao SET coluna_id = CASE etapa::text
    WHEN 'lead' THEN 'novo_lead'
    WHEN 'contato_feito' THEN 'primeiro_contato'
    WHEN 'reuniao_agendada' THEN 'reuniao_marcada'
    WHEN 'proposta_enviada' THEN 'proposta'
    WHEN 'negociacao' THEN 'follow_up_proposta'
    WHEN 'fechado' THEN 'fechamento'
    WHEN 'perdido' THEN 'perdido'
    ELSE 'novo_lead' END
  WHERE coluna_id IS NULL;
UPDATE public.prospeccao SET coluna_desde = COALESCE(updated_at, created_at, now()) WHERE coluna_desde IS NULL;
UPDATE public.prospeccao SET fechado_em = (data_fechamento::text || ' 12:00:00-03')::timestamptz
  WHERE data_fechamento IS NOT NULL AND fechado_em IS NULL;
UPDATE public.prospeccao SET perdido_em = (data_perda::text || ' 12:00:00-03')::timestamptz
  WHERE data_perda IS NOT NULL AND perdido_em IS NULL;
UPDATE public.prospeccao SET valor_fechamento = valor_estimado
  WHERE etapa::text = 'fechado' AND valor_fechamento IS NULL AND COALESCE(valor_estimado, 0) > 0;
UPDATE public.prospeccao SET proximo_contato_em = (data_proximo_contato::text || ' 10:00:00-03')::timestamptz
  WHERE data_proximo_contato IS NOT NULL AND proximo_contato_em IS NULL;
UPDATE public.prospeccao SET primeiro_contato_em = COALESCE(created_at, now())
  WHERE etapa::text <> 'lead' AND primeiro_contato_em IS NULL;
