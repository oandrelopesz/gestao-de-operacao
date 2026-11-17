-- Notas dentro da pasta de um cliente na Central de arquivos (senhas, links, acessos rápidos).
-- cliente_id NULL = nota da aba Notas; preenchido = nota da pasta do cliente (a aba Notas não mostra).
ALTER TABLE public.notas ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS notas_cliente_idx ON public.notas(cliente_id) WHERE cliente_id IS NOT NULL;
