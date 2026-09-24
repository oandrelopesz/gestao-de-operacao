-- Cursos: data opcional até quando o acesso vale. Curso expirado não é apagado (só fica cinza).
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS expira_em date;
