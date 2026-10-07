-- Paridade com o banco do Lovable (migração de 2026-10-07): a função do gatilho antigo de fim de semana
-- foi apagada lá fora das migrations (20260924090000 só tirou o gatilho). Nada mais a usa.
DROP FUNCTION IF EXISTS public.demandas_ajusta_dia_fds();
