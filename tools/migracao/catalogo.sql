-- Fotografia da estrutura do banco, igual nos dois projetos (antigo pela cloud/query do Lovable, novo pelo pg).
-- Saída: um JSON { categoria: [{ chave, def }] } para comparar.mjs. Funções e views vão como md5 da definição.
SELECT json_build_object(
  'tabelas', (SELECT coalesce(json_agg(json_build_object('chave', 'public.' || c.relname, 'def', 'rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity) ORDER BY c.relname), '[]')
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')),
  'colunas', (SELECT coalesce(json_agg(json_build_object('chave', 'public.' || c.relname || '.' || a.attname,
                'def', format_type(a.atttypid, a.atttypmod) || ' notnull=' || a.attnotnull || ' identity=' || a.attidentity::text || ' generated=' || a.attgenerated::text || ' default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), ''))
                ORDER BY c.relname, a.attname), '[]')
              FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
              LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
              WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm') AND a.attnum > 0 AND NOT a.attisdropped),
  'constraints', (SELECT coalesce(json_agg(json_build_object('chave', 'public.' || c.relname || '.' || k.conname, 'def', pg_get_constraintdef(k.oid)) ORDER BY c.relname, k.conname), '[]')
              FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'),
  'indices', (SELECT coalesce(json_agg(json_build_object('chave', schemaname || '.' || indexname, 'def', indexdef) ORDER BY indexname), '[]') FROM pg_indexes WHERE schemaname = 'public'),
  'funcoes', (SELECT coalesce(json_agg(json_build_object('chave', 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', 'def', md5(pg_get_functiondef(p.oid)))
                ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)), '[]')
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')),
  'views', (SELECT coalesce(json_agg(json_build_object('chave', 'public.' || c.relname, 'def', md5(pg_get_viewdef(c.oid)) || ' opts=' || coalesce(array_to_string(c.reloptions, ','), '')) ORDER BY c.relname), '[]')
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')),
  'gatilhos', (SELECT coalesce(json_agg(json_build_object('chave', n.nspname || '.' || c.relname || '.' || t.tgname, 'def', pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text) ORDER BY n.nspname, c.relname, t.tgname), '[]')
              FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE NOT t.tgisinternal AND n.nspname IN ('public', 'storage', 'auth')),
  'politicas', (SELECT coalesce(json_agg(json_build_object('chave', schemaname || '.' || tablename || '.' || policyname,
                'def', cmd || ' ' || permissive || ' roles=' || array_to_string(roles, ',') || ' using=' || coalesce(qual, '') || ' check=' || coalesce(with_check, ''))
                ORDER BY schemaname, tablename, policyname), '[]')
              FROM pg_policies WHERE schemaname IN ('public', 'storage')),
  'grants_tabelas', (SELECT coalesce(json_agg(json_build_object('chave', table_name || '.' || grantee, 'def', privs) ORDER BY table_name, grantee), '[]')
              FROM (SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
                    FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role')
                    GROUP BY table_name, grantee) g),
  'grants_funcoes', (SELECT coalesce(json_agg(json_build_object('chave', routine_name || '.' || grantee, 'def', 'EXECUTE') ORDER BY routine_name, grantee), '[]')
              FROM (SELECT DISTINCT routine_name, grantee FROM information_schema.routine_privileges
                    WHERE routine_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role')) g),
  'sequencias', (SELECT coalesce(json_agg(json_build_object('chave', 'public.' || sequencename, 'def', data_type || ' inc=' || increment_by) ORDER BY sequencename), '[]')
              FROM pg_sequences WHERE schemaname = 'public'),
  'realtime', (SELECT coalesce(json_agg(json_build_object('chave', schemaname || '.' || tablename, 'def', '') ORDER BY tablename), '[]')
              FROM pg_publication_tables WHERE pubname = 'supabase_realtime'),
  'extensoes', (SELECT coalesce(json_agg(json_build_object('chave', extname, 'def', '') ORDER BY extname), '[]') FROM pg_extension),
  'enums', (SELECT coalesce(json_agg(json_build_object('chave', 'public.' || t.typname, 'def', labels) ORDER BY t.typname), '[]')
              FROM (SELECT t.oid, t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
                    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE n.nspname = 'public' GROUP BY t.oid, t.typname) t),
  'buckets', (SELECT coalesce(json_agg(json_build_object('chave', id, 'def', 'public=' || public || ' limite=' || coalesce(file_size_limit::text, '') || ' tipos=' || coalesce(array_to_string(allowed_mime_types, ','), '')) ORDER BY id), '[]')
              FROM storage.buckets),
  'cron', (SELECT coalesce(json_agg(json_build_object('chave', jobname, 'def', schedule) ORDER BY jobname), '[]') FROM cron.job)
) AS catalogo;
