-- Aba Dados internos: avisos de envio dos formulários públicos (contrato, briefings, catálogo).
-- Os formulários chamam a RPC registrar_envio_formulario; o app lê a tabela pelo Realtime.
CREATE TABLE IF NOT EXISTS public.formularios_envios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario  text NOT NULL CHECK (formulario IN ('contrato', 'estrategia', 'negocios', 'catalogo')),
  chave       text NOT NULL UNIQUE,
  titulo      text NOT NULL,
  drive_id    text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  visto_em    timestamptz
);
CREATE INDEX IF NOT EXISTS formularios_envios_nao_vistos ON public.formularios_envios (formulario) WHERE visto_em IS NULL;

ALTER TABLE public.formularios_envios ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'formularios_envios' AND policyname = 'formularios_envios_all') THEN
    CREATE POLICY formularios_envios_all ON public.formularios_envios FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Único ponto de entrada dos formulários. Reenvio (mesma chave) não duplica.
CREATE OR REPLACE FUNCTION public.registrar_envio_formulario(
  p_formulario text, p_chave text, p_titulo text, p_drive_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_formulario IS NULL OR p_formulario NOT IN ('contrato', 'estrategia', 'negocios', 'catalogo') THEN
    RAISE EXCEPTION 'formulário desconhecido: %', p_formulario;
  END IF;
  IF coalesce(btrim(p_chave), '') = '' THEN
    RAISE EXCEPTION 'chave vazia';
  END IF;
  INSERT INTO public.formularios_envios (formulario, chave, titulo, drive_id)
  VALUES (
    p_formulario,
    left(btrim(p_chave), 200),
    left(coalesce(nullif(btrim(p_titulo), ''), 'Sem nome'), 200),
    nullif(btrim(p_drive_id), '')
  )
  ON CONFLICT (chave) DO NOTHING;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.registrar_envio_formulario(text, text, text, text) TO anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'formularios_envios') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.formularios_envios;
  END IF;
END $$;
