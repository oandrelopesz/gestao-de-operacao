-- GMN: logo em qualquer formato aplicada sem passar pela IA (posição, tamanho, fundo), logo escolhida do site e imagens
-- do site para os posts (2026-10-01).
ALTER TABLE public.gmn_perfis
  ADD COLUMN IF NOT EXISTS logo_posicao TEXT NOT NULL DEFAULT 'inferior_direito',
  ADD COLUMN IF NOT EXISTS logo_tamanho TEXT NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS logo_fundo TEXT NOT NULL DEFAULT 'nenhum',
  ADD COLUMN IF NOT EXISTS logo_origem_url TEXT,
  ADD COLUMN IF NOT EXISTS imagens_site JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gmn_perfis_logo_opcoes_check') THEN
    ALTER TABLE public.gmn_perfis ADD CONSTRAINT gmn_perfis_logo_opcoes_check CHECK (
      logo_posicao IN ('superior_esquerdo', 'superior_direito', 'inferior_esquerdo', 'inferior_direito')
      AND logo_tamanho IN ('pequena', 'media', 'grande')
      AND logo_fundo IN ('nenhum', 'claro', 'escuro')
      AND jsonb_typeof(imagens_site) = 'array'
    );
  END IF;
END $$;

ALTER TABLE public.gmn_posts DROP CONSTRAINT IF EXISTS gmn_posts_imagem_origem_check;
ALTER TABLE public.gmn_posts ADD CONSTRAINT gmn_posts_imagem_origem_check
  CHECK (imagem_origem IN ('drive', 'google', 'ia', 'site'));

ALTER TABLE public.gmn_imagens_uso DROP CONSTRAINT IF EXISTS gmn_imagens_uso_origem_check;
ALTER TABLE public.gmn_imagens_uso ADD CONSTRAINT gmn_imagens_uso_origem_check
  CHECK (origem IN ('drive', 'google', 'site'));
