-- The current app shell does not enforce a real signed-in session for the Cursos page.
-- Keep curso_categorias consistent with the existing cursos flow, which uses a fixed internal user id.
ALTER TABLE public.curso_categorias DISABLE ROW LEVEL SECURITY;