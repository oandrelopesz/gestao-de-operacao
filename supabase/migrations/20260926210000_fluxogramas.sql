-- Aba Fluxogramas: quadros (cena do Excalidraw), temas, vínculos com Demandas/Roadmap e bucket das imagens.
CREATE TABLE IF NOT EXISTS public.fluxo_temas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  hex TEXT NOT NULL DEFAULT '#64748b',
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.fluxos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL DEFAULT 'Sem título',
  tema_id UUID REFERENCES public.fluxo_temas(id) ON DELETE SET NULL,
  cena JSONB NOT NULL DEFAULT '{}'::jsonb,
  textos TEXT NOT NULL DEFAULT '',
  miniatura TEXT,
  modelo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fluxos_tema_idx ON public.fluxos(tema_id);
CREATE TABLE IF NOT EXISTS public.fluxo_vinculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id UUID NOT NULL REFERENCES public.fluxos(id) ON DELETE CASCADE,
  elemento_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('demanda', 'roadmap_passo')),
  alvo_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fluxo_vinculos_unico ON public.fluxo_vinculos(fluxo_id, elemento_id, tipo, alvo_id);
CREATE INDEX IF NOT EXISTS fluxo_vinculos_alvo_idx ON public.fluxo_vinculos(tipo, alvo_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fluxo_temas', 'fluxos', 'fluxo_vinculos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_all') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)', t || '_all', t);
    END IF;
  END LOOP;
END $$;

-- Imagens coladas nos quadros (privado; o editor lê por URL assinada)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('fluxogramas', 'fluxogramas', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fluxogramas_select') THEN
    CREATE POLICY "fluxogramas_select" ON storage.objects FOR SELECT USING (bucket_id = 'fluxogramas');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fluxogramas_insert') THEN
    CREATE POLICY "fluxogramas_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'fluxogramas');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fluxogramas_update') THEN
    CREATE POLICY "fluxogramas_update" ON storage.objects FOR UPDATE USING (bucket_id = 'fluxogramas') WITH CHECK (bucket_id = 'fluxogramas');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fluxogramas_delete') THEN
    CREATE POLICY "fluxogramas_delete" ON storage.objects FOR DELETE USING (bucket_id = 'fluxogramas');
  END IF;
END $$;
