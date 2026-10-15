-- Gerador de UTM (Ferramentas): UTMs guardadas por cliente.
-- Cliente apagado leva as UTM dele junto (CASCADE). Mesmo link final do mesmo cliente não duplica.
CREATE TABLE IF NOT EXISTS public.utms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  canal TEXT,
  nome TEXT NOT NULL,
  url_base TEXT NOT NULL DEFAULT '',
  url_final TEXT NOT NULL,
  parametros TEXT NOT NULL DEFAULT '',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  origem TEXT NOT NULL DEFAULT 'gerada' CHECK (origem IN ('gerada', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS utms_cliente_idx ON public.utms(cliente_id);
CREATE UNIQUE INDEX IF NOT EXISTS utms_cliente_link_idx ON public.utms(cliente_id, url_final);

ALTER TABLE public.utms ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'utms' AND policyname = 'utms_all') THEN
    CREATE POLICY utms_all ON public.utms FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
