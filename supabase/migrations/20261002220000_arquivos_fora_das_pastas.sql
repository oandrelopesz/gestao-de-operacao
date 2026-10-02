-- Arquivos (02/10/2026, pedido do André): reorganizar arrastando, inclusive tirar um arquivo das pastas.
-- pasta_id nulo = arquivo "fora das pastas" (na raiz da aba). Excluir uma pasta continua levando só os arquivos dela.
ALTER TABLE public.pdfs ALTER COLUMN pasta_id DROP NOT NULL;
