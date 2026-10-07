-- Contagem e hash do conteúdo de cada tabela de public (mesma saída nos dois projetos), para compararHashes.
-- O hash ordena as linhas pelo próprio JSON (jsonb: chaves em ordem canônica): independe da ordem física das linhas
-- e da posição das colunas (demandas.dia_fim_de_semana ficou em posição diferente no antigo, ver README).
-- Fuso fixo: timestamptz vira texto conforme o TimeZone da sessão.
SET TimeZone = 'UTC';
DO $$
DECLARE t record; n bigint; h text; saida jsonb := '[]'::jsonb;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname LOOP
    EXECUTE format('SELECT count(*), md5(coalesce(string_agg(row_to_json(x)::jsonb::text, E''\n'' ORDER BY row_to_json(x)::jsonb::text), '''')) FROM public.%I x', t.relname) INTO n, h;
    saida := saida || jsonb_build_object('tabela', t.relname, 'linhas', n, 'hash', h);
  END LOOP;
  PERFORM set_config('migracao.hashes', saida::text, false);
END $$;
SELECT current_setting('migracao.hashes')::json AS hashes;
