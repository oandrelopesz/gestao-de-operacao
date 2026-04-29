-- Create course categories table
CREATE TABLE IF NOT EXISTS public.curso_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text DEFAULT 'bg-slate-500',
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.curso_categorias ENABLE ROW LEVEL SECURITY;

-- Policies for curso_categorias
CREATE POLICY "Users can manage their own categories" 
ON public.curso_categorias 
FOR ALL 
USING (auth.uid() = user_id);

-- Add categoria_id to cursos
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.curso_categorias(id) ON DELETE SET NULL;

-- Insert initial categories based on the hardcoded themes if they don't exist
-- We'll do this for the default user or just leave it to the user to create them.
-- But to make the transition smooth, let's insert some default ones for the current context.
-- Since we don't know the exact user_id easily in a migration without auth.uid(), 
-- and migrations run as admin, we should be careful. 
-- However, the user is likely the one with id 'b34bdae5-7a67-4b63-a46f-8aad43a06c63' based on previous code snippets.
-- But it's better to let the app handle initial population if needed or just let the user create them.
