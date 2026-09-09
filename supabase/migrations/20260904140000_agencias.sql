-- Agências passam a ser configuráveis (tabela) em vez de enum fixo.
-- 1) Tabela de agências
CREATE TABLE IF NOT EXISTS public.agencias (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    hex TEXT NOT NULL DEFAULT '#64748b',
    ordem INTEGER NOT NULL DEFAULT 0,
    ativa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agencias IS 'Agências/empresas às quais os clientes pertencem (id = valor gravado em clientes.agencia)';

INSERT INTO public.agencias (id, nome, hex, ordem) VALUES
    ('effect',   'Effect',   '#3b82f6', 0),
    ('spike',    'Spike',    '#8b5cf6', 1),
    ('alt',      'Alt',      '#f59e0b', 2),
    ('pessoais', 'Pessoais', '#10b981', 3),
    ('azo',      'AZO',      '#f43f5e', 4)
ON CONFLICT (id) DO NOTHING;

-- Mesmo modelo compartilhado da tabela clientes (RLS desabilitado nela)
ALTER TABLE public.agencias ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agencias_all' AND tablename = 'agencias') THEN
        CREATE POLICY "agencias_all" ON public.agencias FOR ALL USING (true) WITH CHECK (true);
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
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_agencias_updated_at') THEN
        CREATE TRIGGER set_agencias_updated_at
        BEFORE UPDATE ON public.agencias
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- 2) clientes.agencia: enum -> texto.
-- As views que dependem de clientes (clientes_view, saldo_ads_view, nps_avaliacoes_view, ...)
-- são recriadas a partir da definição que está no banco, preservando opções (security_invoker).
DO $$
DECLARE
    v RECORD;
    defs JSONB := '[]'::jsonb;
    opts TEXT;
BEGIN
    -- Views do schema public que dependem da tabela clientes, direta ou indiretamente
    -- (uma view que usa outra view que usa clientes também cairia no CASCADE).
    -- Ordenadas por nível de dependência para a recriação respeitar a ordem.
    FOR v IN
        WITH RECURSIVE deps AS (
            SELECT c.oid, 0 AS nivel
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_rewrite r ON r.ev_class = c.oid
            JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = 'public.clientes'::regclass
            WHERE n.nspname = 'public' AND c.relkind = 'v'
            UNION
            SELECT c.oid, deps.nivel + 1
            FROM deps
            JOIN pg_depend d ON d.refobjid = deps.oid
            JOIN pg_rewrite r ON r.oid = d.objid
            JOIN pg_class c ON c.oid = r.ev_class AND c.oid <> deps.oid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'v'
        )
        SELECT c.oid, c.relname, pg_get_viewdef(c.oid, true) AS def, c.reloptions, max(deps.nivel) AS nivel
        FROM deps
        JOIN pg_class c ON c.oid = deps.oid
        GROUP BY c.oid, c.relname, c.reloptions
        ORDER BY max(deps.nivel), c.oid
    LOOP
        defs := defs || jsonb_build_object('name', v.relname, 'def', v.def, 'opts', to_jsonb(v.reloptions));
    END LOOP;

    FOR v IN SELECT * FROM jsonb_to_recordset(defs) AS x(name TEXT, def TEXT, opts JSONB) LOOP
        EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', v.name);
    END LOOP;

    ALTER TABLE public.clientes ALTER COLUMN agencia DROP DEFAULT;
    ALTER TABLE public.clientes ALTER COLUMN agencia TYPE TEXT USING agencia::text;
    ALTER TABLE public.clientes ALTER COLUMN agencia SET DEFAULT 'effect';

    FOR v IN SELECT * FROM jsonb_to_recordset(defs) AS x(name TEXT, def TEXT, opts JSONB) LOOP
        EXECUTE format('CREATE VIEW public.%I AS %s', v.name, v.def);
        IF v.opts IS NOT NULL AND jsonb_typeof(v.opts) = 'array' THEN
            SELECT string_agg(e, ', ') INTO opts FROM jsonb_array_elements_text(v.opts) e;
            IF opts IS NOT NULL THEN
                EXECUTE format('ALTER VIEW public.%I SET (%s)', v.name, opts);
            END IF;
        END IF;
    END LOOP;
END $$;

DROP TYPE IF EXISTS public.agencia_enum;

-- Integridade: cliente sempre aponta para uma agência existente.
-- Não permite excluir agência com clientes (o app mostra a contagem).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_agencia_fkey') THEN
        ALTER TABLE public.clientes
            ADD CONSTRAINT clientes_agencia_fkey
            FOREIGN KEY (agencia) REFERENCES public.agencias(id)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;

-- 3) prospeccao.agencia_destino: remove o CHECK fixo e passa a referenciar agencias
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'public.prospeccao'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%agencia_destino%'
    LIMIT 1;
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.prospeccao DROP CONSTRAINT %I', cname);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospeccao_agencia_destino_fkey') THEN
        ALTER TABLE public.prospeccao
            ADD CONSTRAINT prospeccao_agencia_destino_fkey
            FOREIGN KEY (agencia_destino) REFERENCES public.agencias(id)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;
