-- Segurança fase 4 (17/11/2026): banco fechado ao papel anon; só o login do André (e a service_role) acessa.
-- Reversão: supabase/seguranca/04-reverter.sql + 00-backup-policies.sql + 00-backup-grants.sql
begin;

-- 1) RLS em todas as tabelas de public, uma policy única travada no e-mail do André.
do $$
declare t record; p record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','p') loop
    execute format('alter table public.%I enable row level security', t.relname);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t.relname loop
      execute format('drop policy %I on public.%I', p.policyname, t.relname);
    end loop;
    execute format($f$create policy so_andre on public.%I as permissive for all to authenticated
      using ((select auth.jwt() ->> 'email') = 'contato@andrelopes.digital')
      with check ((select auth.jwt() ->> 'email') = 'contato@andrelopes.digital')$f$, t.relname);
  end loop;
end $$;

-- 2) anon perde tudo em public (tabelas, views, sequences, funções); futuros objetos também.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
-- único acesso público que sobra: os formulários do Apps Script avisam a aba Dados internos por esta RPC (SECURITY DEFINER, valida entrada)
grant execute on function public.registrar_envio_formulario(text, text, text, text) to anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

-- 3) Storage: buckets privados; só o André (e a service_role) lê/grava.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
create policy so_andre on storage.objects as permissive for all to authenticated
  using ((select auth.jwt() ->> 'email') = 'contato@andrelopes.digital')
  with check ((select auth.jwt() ->> 'email') = 'contato@andrelopes.digital');
update storage.buckets set public = false where id = 'notas';

commit;
