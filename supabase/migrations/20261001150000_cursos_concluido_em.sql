-- Cursos: data em que o curso foi concluído (vazia = não concluído). O curso concluído não sai da aba.
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS concluido_em DATE;
