-- Instagram, plano B: posts agendados e publicados, contas ocultas e o relógio que publica.
-- Plano: docs/superpowers/plans/2026-10-03-instagram-B-postar.md
ALTER TABLE public.ig_contas ADD COLUMN IF NOT EXISTS oculta boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.ig_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id text NOT NULL REFERENCES public.ig_contas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('foto', 'carrossel', 'reels')),
  midias jsonb NOT NULL DEFAULT '[]'::jsonb,
  legenda text NOT NULL DEFAULT '',
  local_id text,
  local_nome text,
  reels_no_feed boolean NOT NULL DEFAULT true,
  capa_ms integer,
  agendado_para timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'enviando', 'processando', 'publicando', 'publicado', 'erro', 'cancelado')),
  containers jsonb,
  media_id text,
  permalink text,
  erro text,
  tentativas integer NOT NULL DEFAULT 0,
  publicado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_posts_fila ON public.ig_posts (agendado_para)
  WHERE status IN ('agendado', 'enviando', 'processando', 'publicando');
ALTER TABLE public.ig_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ig_posts' AND policyname = 'ig_posts_all') THEN
    CREATE POLICY "ig_posts_all" ON public.ig_posts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ig_posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ig_posts;
  END IF;
END $$;

-- Relógio: a cada minuto, só chama a função quando há post na hora (sem fila, não gasta chamada)
SELECT cron.schedule('instagram-passo', '* * * * *', $c$
  SELECT net.http_post(
    url := 'https://bnpvzguapunsztsdvmrs.supabase.co/functions/v1/instagram',
    body := '{"acao":"passo"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000)
  WHERE EXISTS (SELECT 1 FROM public.ig_posts
                WHERE status IN ('agendado', 'enviando', 'processando', 'publicando') AND agendado_para <= now())
$c$);
