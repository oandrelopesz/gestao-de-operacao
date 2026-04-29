-- Add 'recorrentes' to demanda_status enum
-- Since we cannot easily modify an enum in PostgreSQL without complex steps or downtime if it's used,
-- we'll add it to the existing enum.

ALTER TYPE public.demanda_status ADD VALUE IF NOT EXISTS 'recorrentes' BEFORE 'fazer_hoje';

-- Create frequency enum
CREATE TYPE public.demanda_frequencia AS ENUM ('diaria', 'semanal', 'quinzenal', 'mensal', 'customizada');

-- Add new columns to demandas
ALTER TABLE public.demandas 
ADD COLUMN recorrente BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN frequencia public.demanda_frequencia,
ADD COLUMN dia_referencia TEXT,
ADD COLUMN ultima_execucao TIMESTAMP WITH TIME ZONE;
