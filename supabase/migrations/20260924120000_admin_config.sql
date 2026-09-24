-- Admin por aba: tipos de link do "Ver depois" editáveis e configurações padrão.
CREATE TABLE IF NOT EXISTS public.ver_depois_tipos (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  hex TEXT NOT NULL DEFAULT '#64748b',
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ver_depois_tipos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ver_depois_tipos' AND policyname = 'ver_depois_tipos_all') THEN
    CREATE POLICY "ver_depois_tipos_all" ON public.ver_depois_tipos FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
INSERT INTO public.ver_depois_tipos (id, label, hex, ordem) VALUES
  ('youtube', 'Vídeo do YouTube', '#ef4444', 0),
  ('reel', 'Reel', '#ec4899', 1),
  ('post', 'Post', '#a855f7', 2),
  ('lp', 'Landing page', '#f59e0b', 3),
  ('site', 'Site', '#3b82f6', 4),
  ('outro', 'Outro link', '#64748b', 5)
ON CONFLICT (id) DO NOTHING;

-- O tipo deixa de ser uma lista fixa
ALTER TABLE public.ver_depois DROP CONSTRAINT IF EXISTS ver_depois_tipo_check;

-- Tipo excluído: os itens dele viram "outro" ('outro' não pode ser excluído)
CREATE OR REPLACE FUNCTION public.ver_depois_tipo_excluido()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id = 'outro' THEN RAISE EXCEPTION 'O tipo "Outro link" não pode ser excluído'; END IF;
  UPDATE public.ver_depois SET tipo = 'outro' WHERE tipo = OLD.id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS ver_depois_tipo_excluido ON public.ver_depois_tipos;
CREATE TRIGGER ver_depois_tipo_excluido BEFORE DELETE ON public.ver_depois_tipos
  FOR EACH ROW EXECUTE FUNCTION public.ver_depois_tipo_excluido();

INSERT INTO public.app_config (chave, valor) VALUES
  ('menu', '{"ocultas": [], "ordem": {}}'::jsonb),
  ('pdf_tamanho_max_mb', '50'::jsonb),
  ('livros_meta_anual', '12'::jsonb)
ON CONFLICT (chave) DO NOTHING;
