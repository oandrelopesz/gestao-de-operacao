-- GMN: contexto completo do cliente, contexto das imagens, logo e trava de pessoas geradas por IA
-- (spec 2026-09-29-gmn-posts-design.md, seção 11). Idempotente. Aplicar pelo editor SQL do Lovable.
-- A agenda (jsonb) ganha `imagem` por dia sem mudar a coluna: item sem `imagem` vale true.

ALTER TABLE public.gmn_perfis
  ADD COLUMN IF NOT EXISTS contexto_posts TEXT,
  ADD COLUMN IF NOT EXISTS contexto_imagens TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS permitir_pessoas_ia BOOLEAN NOT NULL DEFAULT false;
