/*
  SUPABASE EDGE FUNCTION: daily-rotation
  Trigger: Cron (00:00 BRT)

  Description: 
  Moves tasks across columns at the end of the day.
  - fazer_amanha -> fazer_hoje
  - fazer_depois_amanha -> fazer_amanha
  - fazer_hoje tasks that are not done remain in fazer_hoje

  SQL to implement this (can be run in Supabase SQL Editor):

  -- 1. Create the function
  CREATE OR REPLACE FUNCTION rotate_tasks_daily()
  RETURNS void AS $$
  BEGIN
    -- Move fazer_amanha to fazer_hoje
    UPDATE public.demandas
    SET status = 'fazer_hoje'
    WHERE status = 'fazer_amanha';

    -- Move fazer_depois_amanha to fazer_amanha
    UPDATE public.demandas
    SET status = 'fazer_amanha'
    WHERE status = 'fazer_depois_amanha';
  END;
  $$ LANGUAGE plpgsql;

  -- 2. Schedule it (requires pg_cron extension enabled in Supabase)
  -- select cron.schedule('0 3 * * *', 'SELECT rotate_tasks_daily()'); 
  -- Note: 3 AM UTC is 00:00 BRT (UTC-3)
*/

// For reference: Enum update SQL
/*
  ALTER TABLE public.demandas DROP CONSTRAINT demandas_status_check;
  ALTER TABLE public.demandas ADD CONSTRAINT demandas_status_check 
  CHECK (status IN ('fazer_hoje', 'fazer_amanha', 'fazer_depois_amanha', 'standby', 'feito'));
  
  ALTER TABLE public.demandas ADD COLUMN ordem INTEGER DEFAULT 0;
*/
