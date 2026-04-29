-- Create status enum for pendencias
CREATE TYPE public.status_pendencia AS ENUM ('onboarding', 'ongoing', 'offboard');

-- Create table for pendencias_clientes
CREATE TABLE public.pendencias_clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    status public.status_pendencia NOT NULL DEFAULT 'onboarding',
    user_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.pendencias_clientes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own pendencias"
ON public.pendencias_clientes
FOR ALL
USING (true); -- Shared project, following existing patterns in other tables

-- Trigger for updated_at
CREATE TRIGGER set_updated_at_pendencias
BEFORE UPDATE ON public.pendencias_clientes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Optional: Create a view if needed, but we'll join in the query
