-- O agendamento 'notificacao-matinal-diaria' falha desde que foi criado (abril/2026, ainda no Lovable):
-- em  '{"..Bearer ' || '<chave>' || '"}'::jsonb  o ::jsonb vale só para o último pedaço ('"}'), que não é JSON.
-- Põe parênteses em volta da junção inteira. Só mexe se ainda estiver no formato quebrado (pode rodar de novo).
SELECT cron.alter_job(jobid, command := replace(replace(command,
  'headers:=''{', 'headers:=(''{'),
  '''"}''::jsonb', '''"}'')::jsonb'))
FROM cron.job
WHERE jobname = 'notificacao-matinal-diaria' AND command LIKE '%headers:=''{%';
