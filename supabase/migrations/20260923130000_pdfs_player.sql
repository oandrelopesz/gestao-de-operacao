-- Aba PDFs: player (autor / empresa / fonte) de cada PDF, preenchido no popup de envio
ALTER TABLE public.pdfs ADD COLUMN IF NOT EXISTS player TEXT;
COMMENT ON COLUMN public.pdfs.player IS 'Player (autor, empresa ou fonte) do PDF; opcional';
