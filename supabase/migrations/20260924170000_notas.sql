-- Aba Notas (grupo Ferramentas): anotações rápidas (título + texto) por tema (um nível).
-- Tema excluído: as notas dele ficam "Sem tema" (tema_id NULL).
CREATE TABLE IF NOT EXISTS public.nota_temas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  hex TEXT NOT NULL DEFAULT '#64748b',
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL DEFAULT '',
  tema_id UUID REFERENCES public.nota_temas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notas_tema_idx ON public.notas(tema_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['nota_temas', 'notas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_all') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)', t || '_all', t);
    END IF;
  END LOOP;
END $$;
