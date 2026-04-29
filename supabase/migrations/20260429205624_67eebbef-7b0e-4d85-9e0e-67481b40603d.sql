-- Adicionar novas colunas à tabela pendencias_clientes
ALTER TABLE public.pendencias_clientes 
ADD COLUMN descricao TEXT,
ADD COLUMN resolvida BOOLEAN DEFAULT false;

-- Comentário para documentação
COMMENT ON COLUMN public.pendencias_clientes.descricao IS 'Descrição textual da pendência do cliente';
COMMENT ON COLUMN public.pendencias_clientes.resolvida IS 'Indica se a pendência já foi resolvida';