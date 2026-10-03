-- Instagram, plano C (etapas 2 e 3): Facebook, stories, primeiro comentário, opções avançadas, excluir e lugares usados.
-- Plano: docs/superpowers/plans/2026-10-03-instagram-C-etapas-2-3.md
ALTER TABLE public.ig_posts
  ADD COLUMN IF NOT EXISTS rede text NOT NULL DEFAULT 'instagram',
  ADD COLUMN IF NOT EXISTS grupo uuid,
  ADD COLUMN IF NOT EXISTS primeiro_comentario text,
  ADD COLUMN IF NOT EXISTS opcoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS aviso text,
  ADD COLUMN IF NOT EXISTS excluido_em timestamptz;

ALTER TABLE public.ig_posts DROP CONSTRAINT IF EXISTS ig_posts_rede_check;
ALTER TABLE public.ig_posts ADD CONSTRAINT ig_posts_rede_check CHECK (rede IN ('instagram', 'facebook'));
ALTER TABLE public.ig_posts DROP CONSTRAINT IF EXISTS ig_posts_tipo_check;
ALTER TABLE public.ig_posts ADD CONSTRAINT ig_posts_tipo_check CHECK (tipo IN ('foto', 'carrossel', 'reels', 'story'));
ALTER TABLE public.ig_posts DROP CONSTRAINT IF EXISTS ig_posts_status_check;
ALTER TABLE public.ig_posts ADD CONSTRAINT ig_posts_status_check
  CHECK (status IN ('agendado', 'enviando', 'processando', 'publicando', 'publicado', 'erro', 'cancelado', 'excluido'));
CREATE INDEX IF NOT EXISTS ig_posts_grupo ON public.ig_posts (grupo);

-- Lugares já usados como localização (id da página do lugar na Meta)
CREATE TABLE IF NOT EXISTS public.ig_locais (
  id text PRIMARY KEY,
  nome text NOT NULL DEFAULT '',
  endereco text,
  usado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ig_locais ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ig_locais' AND policyname = 'ig_locais_all') THEN
    CREATE POLICY "ig_locais_all" ON public.ig_locais FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
