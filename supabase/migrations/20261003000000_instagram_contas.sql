-- Instagram (agendador, etapa 1, plano A): contas de Instagram que o usuário do sistema da BM enxerga.
-- Preenchida pela função instagram (ação sincronizar). Conta que sumiu da Meta fica ativa = false (nunca é apagada).
CREATE TABLE IF NOT EXISTS public.ig_contas (
  id text PRIMARY KEY,
  usuario text NOT NULL DEFAULT '',
  nome text NOT NULL DEFAULT '',
  foto_url text,
  pagina_id text,
  pagina_tem_local boolean NOT NULL DEFAULT false,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ativa boolean NOT NULL DEFAULT true,
  sincronizada_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ig_contas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ig_contas' AND policyname = 'ig_contas_all') THEN
    CREATE POLICY "ig_contas_all" ON public.ig_contas FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
