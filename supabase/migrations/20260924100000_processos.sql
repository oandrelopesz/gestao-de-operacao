-- Abas Onboarding e Roadmap: templates, processos (um por cliente/projeto) e passos.
CREATE TABLE IF NOT EXISTS public.processo_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('onboarding', 'roadmap')),
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.processo_template_passos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.processo_templates(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  observacoes TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.processos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('onboarding', 'roadmap')),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  template_id UUID REFERENCES public.processo_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'encerrado')),
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em TIMESTAMPTZ,
  prazo_final DATE,
  passo_onboarding_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.processo_passos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  observacoes TEXT,
  data DATE,
  ordem INTEGER NOT NULL DEFAULT 0,
  concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'processos_passo_onboarding_fk') THEN
    ALTER TABLE public.processos ADD CONSTRAINT processos_passo_onboarding_fk
      FOREIGN KEY (passo_onboarding_id) REFERENCES public.processo_passos(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS processo_template_passos_template_idx ON public.processo_template_passos(template_id);
CREATE INDEX IF NOT EXISTS processo_passos_processo_idx ON public.processo_passos(processo_id);
CREATE INDEX IF NOT EXISTS processos_cliente_idx ON public.processos(cliente_id);
CREATE UNIQUE INDEX IF NOT EXISTS processos_onboarding_ativo_unico ON public.processos(cliente_id) WHERE tipo = 'onboarding' AND status = 'ativo';
CREATE UNIQUE INDEX IF NOT EXISTS processos_roadmap_passo_unico ON public.processos(passo_onboarding_id) WHERE passo_onboarding_id IS NOT NULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['processo_templates', 'processo_template_passos', 'processos', 'processo_passos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_all') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)', t || '_all', t);
    END IF;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS processo_templates_updated ON public.processo_templates;
CREATE TRIGGER processo_templates_updated BEFORE UPDATE ON public.processo_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS processos_updated ON public.processos;
CREATE TRIGGER processos_updated BEFORE UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS processo_passos_updated ON public.processo_passos;
CREATE TRIGGER processo_passos_updated BEFORE UPDATE ON public.processo_passos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Demandas criadas a partir de passos do onboarding
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS processo_passo_id UUID UNIQUE REFERENCES public.processo_passos(id) ON DELETE SET NULL;
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS roadmap_id UUID REFERENCES public.processos(id) ON DELETE SET NULL;

-- Dia em que o cliente entrou no onboarding
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS onboarding_desde TIMESTAMPTZ;
UPDATE public.clientes SET onboarding_desde = now() WHERE em_onboarding AND onboarding_desde IS NULL;

CREATE OR REPLACE FUNCTION public.clientes_marca_onboarding()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.em_onboarding AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.em_onboarding, false)) THEN
    NEW.onboarding_desde := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS clientes_marca_onboarding ON public.clientes;
CREATE TRIGGER clientes_marca_onboarding BEFORE INSERT OR UPDATE OF em_onboarding ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_marca_onboarding();

INSERT INTO public.app_config (chave, valor) VALUES
  ('onboarding_janela_dias', '2'::jsonb),
  ('onboarding_ativa_trafego', 'true'::jsonb)
ON CONFLICT (chave) DO NOTHING;
