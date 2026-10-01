-- GMN: chave das fotos do site nos posts (2026-10-01, noite). Desligada por padrão: o André liga por perfil.
ALTER TABLE public.gmn_perfis
  ADD COLUMN IF NOT EXISTS usa_fotos_site BOOLEAN NOT NULL DEFAULT false;
