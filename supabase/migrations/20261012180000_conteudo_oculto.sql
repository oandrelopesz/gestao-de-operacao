-- Aba Conteúdo: ocultar clientes da lista (pedido do André, 12/10/2026).
ALTER TABLE public.conteudo_clientes ADD COLUMN IF NOT EXISTS oculto boolean NOT NULL DEFAULT false;
