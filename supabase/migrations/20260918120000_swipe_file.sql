-- Swipe file integrado ao Google Drive (ver docs/superpowers/specs/2026-09-18-swipe-file-design.md).
-- O Drive guarda os arquivos; estas tabelas são o catálogo pesquisável e a fila do serviço de download.

CREATE TABLE IF NOT EXISTS public.swipe_config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    root_folder_id TEXT,
    root_folder_link TEXT,
    conta_google TEXT,
    conectado_em TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.swipe_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
COMMENT ON TABLE public.swipe_config IS 'Pasta raiz "Swipe File" no Drive e estado da conexão (1 linha)';

CREATE TABLE IF NOT EXISTS public.swipe_nichos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    nome_normalizado TEXT NOT NULL,
    pai_id UUID REFERENCES public.swipe_nichos(id) ON DELETE CASCADE,
    drive_folder_id TEXT,
    drive_folder_link TEXT,
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS swipe_nichos_unico ON public.swipe_nichos (COALESCE(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), nome_normalizado);
COMMENT ON TABLE public.swipe_nichos IS 'Nichos (pai_id NULL) e subnichos (pai_id = nicho), cada um com sua pasta no Drive';

CREATE TABLE IF NOT EXISTS public.swipe_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria TEXT NOT NULL CHECK (categoria IN ('oferta','video_organico','video_anuncio','anuncio_estatico','post_estatico','carrossel','landing_page','site')),
    nicho_id UUID NOT NULL REFERENCES public.swipe_nichos(id) ON DELETE RESTRICT,
    subnicho_id UUID REFERENCES public.swipe_nichos(id) ON DELETE SET NULL,
    rede TEXT NOT NULL DEFAULT 'internet' CHECK (rede IN ('instagram','facebook','youtube','tiktok','linkedin','x','pinterest','internet','outro')),
    link TEXT,
    player TEXT NOT NULL,
    nota TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    nome_arquivo TEXT,
    drive_file_id TEXT,
    drive_folder_id TEXT,
    drive_web_link TEXT,
    thumbnail_link TEXT,
    mime TEXT,
    tamanho BIGINT,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','baixando','pronto','falhou','manual')),
    erro TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS swipe_itens_nicho_idx ON public.swipe_itens(nicho_id);
CREATE INDEX IF NOT EXISTS swipe_itens_status_idx ON public.swipe_itens(status);
COMMENT ON TABLE public.swipe_itens IS 'Referências do swipe file; status pronto = arquivo no Drive; falhou = Docs com o link criado';

CREATE TABLE IF NOT EXISTS public.swipe_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.swipe_itens(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('download','lp')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','rodando','ok','erro')),
    tentativas INTEGER NOT NULL DEFAULT 0,
    erro TEXT,
    iniciado_em TIMESTAMPTZ,
    concluido_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS swipe_jobs_status_idx ON public.swipe_jobs(status, created_at);
COMMENT ON TABLE public.swipe_jobs IS 'Fila do serviço na nuvem que baixa links e sobe no Drive';

ALTER TABLE public.swipe_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipe_nichos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipe_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipe_jobs ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['swipe_config','swipe_nichos','swipe_itens','swipe_jobs'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = t || '_all' AND tablename = t) THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)', t || '_all', t);
        END IF;
    END LOOP;
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
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_swipe_itens_updated_at') THEN
        CREATE TRIGGER set_swipe_itens_updated_at BEFORE UPDATE ON public.swipe_itens
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_swipe_config_updated_at') THEN
        CREATE TRIGGER set_swipe_config_updated_at BEFORE UPDATE ON public.swipe_config
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- Realtime: o app vê o status mudar quando o serviço termina um download
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'swipe_itens') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.swipe_itens;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
