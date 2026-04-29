-- Create enum for budget type
CREATE TYPE public.tipo_verba_enum AS ENUM ('mensal', 'total_periodo');

-- Add new columns to clientes table
ALTER TABLE public.clientes 
ADD COLUMN tipo_verba public.tipo_verba_enum NOT NULL DEFAULT 'mensal',
ADD COLUMN verba_total_contratada NUMERIC,
ADD COLUMN data_limite_verba DATE;
