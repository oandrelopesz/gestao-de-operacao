-- Plataformas de mídia (Meta, Google, ChatGPT Ads...) passam a ser configuráveis no Admin.
-- O valor gravado em saldo_ads.plataformas continua sendo o NOME da plataforma.
CREATE TABLE IF NOT EXISTS public.plataformas_ads (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    ordem INTEGER NOT NULL DEFAULT 0,
    ativa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plataformas_ads IS 'Plataformas de mídia disponíveis nos formulários de cliente/saldo (nome = valor gravado em saldo_ads.plataformas)';

INSERT INTO public.plataformas_ads (id, nome, ordem) VALUES
    ('meta',      'Meta',      0),
    ('google',    'Google',    1),
    ('pinterest', 'Pinterest', 2),
    ('x_ads',     'X Ads',     3),
    ('linkedin',  'LinkedIn',  4),
    ('tiktok',    'TikTok',    5),
    ('taboola',   'Taboola',   6),
    ('outbrain',  'Outbrain',  7)
ON CONFLICT (id) DO NOTHING;

-- Mesmo modelo compartilhado das tabelas agencias/demanda_colunas
ALTER TABLE public.plataformas_ads ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'plataformas_ads_all' AND tablename = 'plataformas_ads') THEN
        CREATE POLICY "plataformas_ads_all" ON public.plataformas_ads FOR ALL USING (true) WITH CHECK (true);
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
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_plataformas_ads_updated_at') THEN
        CREATE TRIGGER set_plataformas_ads_updated_at
        BEFORE UPDATE ON public.plataformas_ads
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- Realtime: o app escuta mudanças para refletir na hora em todas as abas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'plataformas_ads'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.plataformas_ads;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL; -- publicação pode não existir em ambientes locais
END $$;
