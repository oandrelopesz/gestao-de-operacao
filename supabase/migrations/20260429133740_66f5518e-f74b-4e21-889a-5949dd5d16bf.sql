CREATE TABLE public.livros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT 'b34bdae5-7a67-4b63-a46f-8aad43a06c63',
  nome text NOT NULL,
  autor text NOT NULL,
  em_andamento boolean DEFAULT false,
  lido boolean DEFAULT false,
  data_inicio date,
  data_conclusao date,
  observacoes text,
  ordem integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for performance
CREATE INDEX idx_livros_user ON public.livros(user_id);
CREATE INDEX idx_livros_status ON public.livros(lido, em_andamento);

-- Enable RLS
ALTER TABLE public.livros ENABLE ROW LEVEL SECURITY;

-- Policies (using public access for now as requested by user in previous messages for consolidated access)
CREATE POLICY "livros_select" ON public.livros FOR SELECT USING (true);
CREATE POLICY "livros_insert" ON public.livros FOR INSERT WITH CHECK (true);
CREATE POLICY "livros_update" ON public.livros FOR UPDATE USING (true);
CREATE POLICY "livros_delete" ON public.livros FOR DELETE USING (true);

-- Function to update updated_at
CREATE TRIGGER update_livros_updated_at
BEFORE UPDATE ON public.livros
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();