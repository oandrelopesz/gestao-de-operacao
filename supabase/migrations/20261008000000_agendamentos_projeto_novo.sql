-- Migração para fora do Lovable (2026-10-07): os 2 agendamentos que chamam funções HTTP passam a apontar para o
-- projeto novo (uajusldnvzgakffofkhl), com a chave pública (anon) dele. cron.alter_job não mexe em ligado/desligado:
-- no projeto novo eles seguem desligados até a virada. Só mexe nos DESLIGADOS: se esta migration rodasse por engano no
-- projeto antigo (agendamentos ligados), não mudaria nada lá (evita o antigo chamar as funções do novo e publicar em dobro).
SELECT cron.alter_job(jobid, command := regexp_replace(replace(command, 'bnpvzguapunsztsdvmrs', 'uajusldnvzgakffofkhl'),
  'eyJ[A-Za-z0-9_.-]+', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhanVzbGRudnpnYWtmZm9ma2hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MDcxMTMsImV4cCI6MjEwNjk4MzExM30.iHFXZN_p3_A9MOI9NAVd5CLyi0fYFMw2B7IY5VIRcQ4', 'g'))
FROM cron.job WHERE jobname IN ('notificacao-matinal-diaria', 'instagram-passo') AND NOT active;
