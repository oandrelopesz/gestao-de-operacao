-- Categorias de ideias editáveis. 'cliente' é fixa: ela liga os campos de agência/cliente.
CREATE TABLE IF NOT EXISTS public.ideia_categorias (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  hex TEXT NOT NULL DEFAULT '#64748b',
  ordem INTEGER NOT NULL DEFAULT 0,
  sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ideia_categorias ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ideia_categorias' AND policyname = 'ideia_categorias_all') THEN
    CREATE POLICY "ideia_categorias_all" ON public.ideia_categorias FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
INSERT INTO public.ideia_categorias (id, label, hex, ordem, sistema) VALUES
  ('este_sistema', 'Este sistema', '#8b5cf6', 0, false),
  ('outro_sistema', 'Outro sistema', '#06b6d4', 1, false),
  ('cliente', 'Para cliente', '#f59e0b', 2, true)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.ideias DROP CONSTRAINT IF EXISTS ideias_tipo_check;

-- Categoria excluída: as ideias dela vão para a primeira categoria restante que não seja 'cliente' (ou 'cliente')
CREATE OR REPLACE FUNCTION public.ideia_categoria_excluida()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE destino TEXT;
BEGIN
  IF OLD.sistema THEN RAISE EXCEPTION 'A categoria "%" é fixa e não pode ser excluída', OLD.label; END IF;
  SELECT id INTO destino FROM public.ideia_categorias WHERE id <> OLD.id AND id <> 'cliente' ORDER BY ordem LIMIT 1;
  UPDATE public.ideias SET tipo = COALESCE(destino, 'cliente') WHERE tipo = OLD.id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS ideia_categoria_excluida ON public.ideia_categorias;
CREATE TRIGGER ideia_categoria_excluida BEFORE DELETE ON public.ideia_categorias
  FOR EACH ROW EXECUTE FUNCTION public.ideia_categoria_excluida();

-- Limite de upload da aba PDFs configurável até 200 MB
UPDATE storage.buckets SET file_size_limit = 200 * 1024 * 1024 WHERE id = 'pdfs';
