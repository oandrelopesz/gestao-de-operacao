-- Create Enum for Course Themes
CREATE TYPE public.curso_tema AS ENUM (
  'ia',
  'trafego_pago',
  'trackeamento',
  'copywriting',
  'gestao',
  'vendas',
  'multiplos_temas',
  'outros'
);

-- Create Courses Table
CREATE TABLE public.cursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nome text NOT NULL,
  tema public.curso_tema NOT NULL DEFAULT 'outros',
  link_area_membros text,
  login text,
  senha text,
  em_andamento boolean DEFAULT false,
  observacoes text,
  ordem integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_cursos_user ON public.cursos(user_id);
CREATE INDEX idx_cursos_andamento ON public.cursos(em_andamento);
CREATE INDEX idx_cursos_tema ON public.cursos(tema);

-- Enable Row Level Security
ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own courses" ON public.cursos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own courses" ON public.cursos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own courses" ON public.cursos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own courses" ON public.cursos FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_cursos_updated_at
BEFORE UPDATE ON public.cursos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();