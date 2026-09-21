-- Aba Ideias: ideias de implementação (neste sistema, em outro sistema ou para um cliente)
-- que podem virar demandas do Kanban.
CREATE TABLE IF NOT EXISTS public.ideias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL CHECK (tipo IN ('este_sistema', 'outro_sistema', 'cliente')),
    titulo TEXT NOT NULL,
    descricao TEXT,
    links TEXT[] NOT NULL DEFAULT '{}',
    agencia TEXT REFERENCES public.agencias(id) ON UPDATE CASCADE ON DELETE SET NULL,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
    demanda_id UUID REFERENCES public.demandas(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.ideias IS 'Aba Ideias: ideias de implementação; demanda_id aponta para a demanda criada a partir dela';
COMMENT ON COLUMN public.ideias.agencia IS 'Só quando tipo = cliente (id da agência do cliente)';
COMMENT ON COLUMN public.ideias.links IS 'Links de referência, já normalizados com https://';

ALTER TABLE public.ideias ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ideias_all' AND tablename = 'ideias') THEN
        CREATE POLICY "ideias_all" ON public.ideias FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_ideias_updated_at') THEN
        CREATE TRIGGER set_ideias_updated_at BEFORE UPDATE ON public.ideias
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;
