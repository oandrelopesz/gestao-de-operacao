-- Briefing Site/LP: novo formulário na aba Dados internos.
ALTER TABLE public.formularios_envios DROP CONSTRAINT IF EXISTS formularios_envios_formulario_check;
ALTER TABLE public.formularios_envios ADD CONSTRAINT formularios_envios_formulario_check
  CHECK (formulario IN ('contrato', 'estrategia', 'negocios', 'site-lp', 'catalogo'));

CREATE OR REPLACE FUNCTION public.registrar_envio_formulario(
  p_formulario text, p_chave text, p_titulo text, p_drive_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_formulario IS NULL OR p_formulario NOT IN ('contrato', 'estrategia', 'negocios', 'site-lp', 'catalogo') THEN
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
