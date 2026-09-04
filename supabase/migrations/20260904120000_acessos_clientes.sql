-- Tabela de acessos (planilhas e CRMs) dos clientes
CREATE TABLE IF NOT EXISTS public.acessos_clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    agencia TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('planilha', 'crm')),
    link TEXT NOT NULL,
    login TEXT,
    senha TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.acessos_clientes IS 'Links de planilhas e credenciais de CRM dos clientes, por agência';
COMMENT ON COLUMN public.acessos_clientes.tipo IS 'planilha = apenas link; crm = link + login/senha';

ALTER TABLE public.acessos_clientes ENABLE ROW LEVEL SECURITY;

-- Credenciais são sensíveis: cada usuário só enxerga os próprios registros
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own acessos' AND tablename = 'acessos_clientes') THEN
        CREATE POLICY "Users can manage their own acessos"
        ON public.acessos_clientes
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
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
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_acessos_clientes_updated_at') THEN
        CREATE TRIGGER set_acessos_clientes_updated_at
        BEFORE UPDATE ON public.acessos_clientes
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;
