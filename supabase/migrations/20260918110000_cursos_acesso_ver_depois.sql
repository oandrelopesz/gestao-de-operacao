-- 1) Cursos: tipo de acesso. 'membros' (área de membros, como sempre foi), 'drive' (várias aulas
--    no Google Drive, cada uma com link) ou 'telegram' (um link que abre o Telegram).
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS tipo_acesso TEXT NOT NULL DEFAULT 'membros'
    CHECK (tipo_acesso IN ('membros', 'drive', 'telegram'));
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS aulas JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.cursos.aulas IS 'Tipo drive: [{"titulo": "Aula 1", "link": "https://drive.google.com/..."}]';

-- 2) Ver depois: links (LP, site, vídeo do YouTube, reel, post) com título, para abrir direto.
CREATE TABLE IF NOT EXISTS public.ver_depois (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL CHECK (tipo IN ('lp', 'site', 'youtube', 'reel', 'post', 'outro')),
    titulo TEXT NOT NULL,
    link TEXT NOT NULL,
    observacao TEXT,
    visto BOOLEAN NOT NULL DEFAULT false,
    visto_em TIMESTAMPTZ,
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.ver_depois IS 'Aba Ver depois: links salvos com título e tipo';

ALTER TABLE public.ver_depois ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ver_depois_all' AND tablename = 'ver_depois') THEN
        CREATE POLICY "ver_depois_all" ON public.ver_depois FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_ver_depois_updated_at') THEN
        CREATE TRIGGER set_ver_depois_updated_at BEFORE UPDATE ON public.ver_depois
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;
