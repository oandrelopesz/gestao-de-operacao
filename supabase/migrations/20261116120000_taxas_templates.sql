-- Calculadora de taxas (Ferramentas): templates de taxa ("Taxa do Meta" = 13,15%).
-- taxa em % (13,15 = 13,15%); metodo: 'fora' = taxa somada ao valor, 'dentro' = taxa já inclusa no total.
CREATE TABLE IF NOT EXISTS public.taxas_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  taxa NUMERIC(7,4) NOT NULL CHECK (taxa >= 0 AND taxa < 100),
  metodo TEXT NOT NULL DEFAULT 'fora' CHECK (metodo IN ('fora', 'dentro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS taxas_templates_nome_idx ON public.taxas_templates(nome);

ALTER TABLE public.taxas_templates ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'taxas_templates' AND policyname = 'taxas_templates_all') THEN
    CREATE POLICY taxas_templates_all ON public.taxas_templates FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
