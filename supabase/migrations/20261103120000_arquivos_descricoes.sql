-- Arquivos (03/11/2026, pedido do André): vários textos de descrição por arquivo, cada um com nome.
-- Formato de pdfs.descricoes: [{ "id": "...", "titulo": "...", "texto": "..." }].
-- pdfs.observacoes continua existindo e guarda o texto de todas juntas (busca e arquivos antigos).
ALTER TABLE public.pdfs ADD COLUMN IF NOT EXISTS descricoes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Observação que já existia vira a primeira descrição (só onde ainda não há descrições; roda de novo sem efeito).
UPDATE public.pdfs
SET descricoes = jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'titulo', 'Observações', 'texto', btrim(observacoes)))
WHERE descricoes = '[]'::jsonb AND btrim(coalesce(observacoes, '')) <> '';
