-- Arquivos (02/10/2026, pedido do André): campo de observações (texto livre) nos popups de adicionar e editar arquivo.
ALTER TABLE public.pdfs ADD COLUMN IF NOT EXISTS observacoes TEXT;
