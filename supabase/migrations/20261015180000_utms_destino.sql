-- Gerador de UTM: tipo de destino do link (site, landing page, mensagens, formulário nativo...).
-- Coluna nova e opcional: UTM antigas e adicionadas na mão ficam sem destino.
ALTER TABLE public.utms ADD COLUMN IF NOT EXISTS destino TEXT;
