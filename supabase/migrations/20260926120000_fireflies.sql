-- Aba Fireflies: reuniões importadas do Fireflies (transcrição e resumo em PDF e DOCX no bucket privado
-- "fireflies") e registro do robô enviado às reuniões com Meet da agenda da contato@.
-- Quem escreve é o worker da VPS (chave pública); a aba só grava a intenção de renomear/excluir.

CREATE TABLE IF NOT EXISTS public.fireflies_reunioes (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    titulo_pendente TEXT,
    excluir BOOLEAN NOT NULL DEFAULT false,
    data_hora TIMESTAMPTZ,
    duracao_min NUMERIC,
    participantes TEXT[] NOT NULL DEFAULT '{}',
    organizador TEXT,
    link_meet TEXT,
    link_fireflies TEXT,
    arquivos JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pronto' CHECK (status IN ('importando', 'pronto', 'erro')),
    erro TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.fireflies_reunioes IS 'Aba Fireflies: uma linha por transcrição do Fireflies (id = id do transcript)';
COMMENT ON COLUMN public.fireflies_reunioes.titulo_pendente IS 'Novo nome pedido pela aba; o worker aplica no Fireflies e limpa';
COMMENT ON COLUMN public.fireflies_reunioes.excluir IS 'Exclusão pedida pela aba; o worker apaga no Fireflies, os arquivos e a linha';
COMMENT ON COLUMN public.fireflies_reunioes.arquivos IS '{transcricao_pdf, transcricao_docx, resumo_pdf, resumo_docx}: caminhos no bucket "fireflies"';
CREATE INDEX IF NOT EXISTS fireflies_reunioes_data_idx ON public.fireflies_reunioes (data_hora DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS fireflies_reunioes_pendentes_idx ON public.fireflies_reunioes (id)
    WHERE excluir OR titulo_pendente IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fireflies_convites (
    evento_id TEXT NOT NULL,
    inicio TIMESTAMPTZ NOT NULL,
    link_meet TEXT,
    titulo TEXT,
    enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    ok BOOLEAN,
    erro TEXT,
    PRIMARY KEY (evento_id, inicio)
);
COMMENT ON TABLE public.fireflies_convites IS 'Robô do Fireflies enviado a eventos da agenda (evita reenvio)';

ALTER TABLE public.fireflies_reunioes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fireflies_convites ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fireflies_reunioes_all' AND tablename = 'fireflies_reunioes') THEN
        CREATE POLICY "fireflies_reunioes_all" ON public.fireflies_reunioes FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fireflies_convites_all' AND tablename = 'fireflies_convites') THEN
        CREATE POLICY "fireflies_convites_all" ON public.fireflies_convites FOR ALL USING (true) WITH CHECK (true);
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
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_fireflies_reunioes_updated_at') THEN
        CREATE TRIGGER set_fireflies_reunioes_updated_at BEFORE UPDATE ON public.fireflies_reunioes
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- Bucket privado: transcrição e resumo em PDF e DOCX (até 50 MB por arquivo)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fireflies', 'fireflies', false, 52428800, ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- O app roda sem login (chave pública): liberar leitura/escrita apenas dentro do bucket "fireflies"
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fireflies_select') THEN
        CREATE POLICY "fireflies_select" ON storage.objects FOR SELECT USING (bucket_id = 'fireflies');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fireflies_insert') THEN
        CREATE POLICY "fireflies_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'fireflies');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fireflies_update') THEN
        CREATE POLICY "fireflies_update" ON storage.objects FOR UPDATE USING (bucket_id = 'fireflies') WITH CHECK (bucket_id = 'fireflies');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fireflies_delete') THEN
        CREATE POLICY "fireflies_delete" ON storage.objects FOR DELETE USING (bucket_id = 'fireflies');
    END IF;
END $$;
