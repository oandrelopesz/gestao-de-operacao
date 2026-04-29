-- Enable RLS for curso_categorias
ALTER TABLE public.curso_categorias ENABLE ROW LEVEL SECURITY;

-- Create policies for curso_categorias
CREATE POLICY "Users can view their own categories" 
ON public.curso_categorias 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own categories" 
ON public.curso_categorias 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories" 
ON public.curso_categorias 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories" 
ON public.curso_categorias 
FOR DELETE 
USING (auth.uid() = user_id);

-- Ensure there's a unique constraint on (nome, user_id) to allow upsert and prevent duplicates per user
ALTER TABLE public.curso_categorias ADD CONSTRAINT unique_category_name_per_user UNIQUE (nome, user_id);
