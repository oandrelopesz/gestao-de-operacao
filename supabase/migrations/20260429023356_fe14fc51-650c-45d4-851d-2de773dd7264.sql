-- Cron para materializar recorrentes (00:01 BRT = 03:01 UTC)
SELECT cron.schedule(
  'materializar-recorrentes-diario',
  '1 3 * * *',
  $$ SELECT net.http_post(
    url:='https://bnpvzguapunsztsdvmrs.supabase.co/functions/v1/materializar-recorrentes',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJucHZ6Z3VhcHVuc3p0c2R2bXJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQxMzc3MiwiZXhwIjoyMDkyOTg5NzcyfQ.yDZsvSRYxfNKH2YtzMOSJQe1FBYKR5OgYHvB7Js2Vho' || '"}'::jsonb
  ) $$
);

-- Cron para notificação matinal (08:00 BRT = 11:00 UTC)
SELECT cron.schedule(
  'notificacao-matinal-diaria',
  '0 11 * * *',
  $$ SELECT net.http_post(
    url:='https://bnpvzguapunsztsdvmrs.supabase.co/functions/v1/notificacao-matinal-tarefas',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJucHZ6Z3VhcHVuc3p0c2R2bXJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQxMzc3MiwiZXhwIjoyMDkyOTg5NzcyfQ.yDZsvSRYxfNKH2YtzMOSJQe1FBYKR5OgYHvB7Js2Vho' || '"}'::jsonb
  ) $$
);
