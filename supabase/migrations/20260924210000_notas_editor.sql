-- Notas no estilo documento: o conteúdo formatado (TipTap/ProseMirror) fica em "doc"; "conteudo"
-- continua com o texto puro (busca, prévia do card e "Copiar"). Notas antigas têm doc NULL.
ALTER TABLE public.notas ADD COLUMN IF NOT EXISTS doc jsonb;

-- Imagens das notas (prints colados, arrastados ou enviados), já comprimidas pelo app.
-- Público para o <img> da nota funcionar sem link temporário; os nomes são UUIDs (não dá para listar
-- nem adivinhar). SVG fica de fora (pode carregar script).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('notas', 'notas', true, 15728640, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'])
ON CONFLICT (id) DO UPDATE
SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- O app roda sem login (chave pública): enviar e apagar só dentro do bucket "notas"
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'notas_select') THEN
        CREATE POLICY "notas_select" ON storage.objects FOR SELECT USING (bucket_id = 'notas');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'notas_insert') THEN
        CREATE POLICY "notas_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'notas');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'notas_delete') THEN
        CREATE POLICY "notas_delete" ON storage.objects FOR DELETE USING (bucket_id = 'notas');
    END IF;
END $$;
