-- Aba Planilha/CRM: o app roda sem login (usa o usuário padrão, como as outras abas),
-- então a política "auth.uid() = user_id" bloqueava leitura e inserção com a chave pública
-- ("new row violates row-level security policy"). Alinha ao padrão das demais tabelas.
DROP POLICY IF EXISTS "Users can manage their own acessos" ON public.acessos_clientes;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'acessos_clientes_all' AND tablename = 'acessos_clientes') THEN
        CREATE POLICY "acessos_clientes_all" ON public.acessos_clientes FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
