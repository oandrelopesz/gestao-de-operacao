-- Aba PDFs: biblioteca de PDFs importantes organizada em pastas (temas) e subpastas.
-- Os arquivos ficam no Storage do próprio projeto (bucket privado "pdfs"), sem Google Drive.

CREATE TABLE IF NOT EXISTS public.pdf_pastas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL CHECK (length(btrim(nome)) > 0),
    parent_id UUID REFERENCES public.pdf_pastas(id) ON DELETE CASCADE,
    cor TEXT,
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pdf_pastas IS 'Aba PDFs: pastas (parent_id nulo = tema da raiz) e subpastas';
CREATE INDEX IF NOT EXISTS pdf_pastas_parent_idx ON public.pdf_pastas (parent_id);

CREATE TABLE IF NOT EXISTS public.pdfs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pasta_id UUID NOT NULL REFERENCES public.pdf_pastas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL CHECK (length(btrim(nome)) > 0),
    arquivo_nome TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    tamanho BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pdfs IS 'Aba PDFs: arquivos; storage_path é o caminho no bucket "pdfs"';
COMMENT ON COLUMN public.pdfs.arquivo_nome IS 'Nome original do arquivo, usado no download';
CREATE INDEX IF NOT EXISTS pdfs_pasta_idx ON public.pdfs (pasta_id);

ALTER TABLE public.pdf_pastas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdfs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pdf_pastas_all' AND tablename = 'pdf_pastas') THEN
        CREATE POLICY "pdf_pastas_all" ON public.pdf_pastas FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pdfs_all' AND tablename = 'pdfs') THEN
        CREATE POLICY "pdfs_all" ON public.pdfs FOR ALL USING (true) WITH CHECK (true);
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
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_pdf_pastas_updated_at') THEN
        CREATE TRIGGER set_pdf_pastas_updated_at BEFORE UPDATE ON public.pdf_pastas
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_pdfs_updated_at') THEN
        CREATE TRIGGER set_pdfs_updated_at BEFORE UPDATE ON public.pdfs
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- Temas iniciais e algumas subpastas de exemplo (só na primeira vez)
DO $$
DECLARE
    trafego UUID;
    ia UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.pdf_pastas) THEN
        INSERT INTO public.pdf_pastas (nome, cor, ordem) VALUES ('Tráfego', '#3b82f6', 0) RETURNING id INTO trafego;
        INSERT INTO public.pdf_pastas (nome, cor, ordem) VALUES ('IA', '#8b5cf6', 1) RETURNING id INTO ia;
        INSERT INTO public.pdf_pastas (nome, cor, ordem) VALUES ('Gestão', '#10b981', 2);
        INSERT INTO public.pdf_pastas (nome, cor, ordem) VALUES ('Geral', '#64748b', 3);
        INSERT INTO public.pdf_pastas (nome, parent_id, ordem) VALUES
            ('Meta Ads', trafego, 0), ('Google Ads', trafego, 1),
            ('Claude', ia, 0), ('ChatGPT', ia, 1);
    END IF;
END $$;

-- Bucket privado só para PDFs (até 50 MB por arquivo)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pdfs', 'pdfs', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- O app roda sem login (chave pública): liberar leitura/escrita apenas dentro do bucket "pdfs"
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'pdfs_select') THEN
        CREATE POLICY "pdfs_select" ON storage.objects FOR SELECT USING (bucket_id = 'pdfs');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'pdfs_insert') THEN
        CREATE POLICY "pdfs_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'pdfs');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'pdfs_update') THEN
        CREATE POLICY "pdfs_update" ON storage.objects FOR UPDATE USING (bucket_id = 'pdfs') WITH CHECK (bucket_id = 'pdfs');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'pdfs_delete') THEN
        CREATE POLICY "pdfs_delete" ON storage.objects FOR DELETE USING (bucket_id = 'pdfs');
    END IF;
END $$;
