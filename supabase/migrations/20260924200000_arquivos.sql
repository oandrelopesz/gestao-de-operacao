-- Aba "Arquivos" (antes "PDFs"): o bucket "pdfs" passa a aceitar qualquer documento.
-- A triagem (sem imagem e sem vídeo) e o limite de tamanho ficam no app (app_config.pdf_tamanho_max_mb).
UPDATE storage.buckets SET allowed_mime_types = NULL WHERE id = 'pdfs';
COMMENT ON TABLE public.pdfs IS 'Aba Arquivos: documentos (pdf, txt, md, ppt, doc, xls...); storage_path é o caminho no bucket "pdfs"';
