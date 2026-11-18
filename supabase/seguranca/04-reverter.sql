-- Reverte a fase 4. Depois rode, nesta ordem: 00-backup-policies.sql e 00-backup-grants.sql (e 00-backup-funcoes.sql).
begin;
do $$
declare t record;
begin
  for t in select tablename from pg_policies where policyname = 'so_andre' and schemaname = 'public' loop
    execute format('drop policy so_andre on public.%I', t.tablename);
  end loop;
end $$;
drop policy if exists so_andre on storage.objects;
alter table public.notificacoes_config, public.demandas, public.nps_avaliacoes, public.prospeccao,
  public.prospeccao_interacoes, public.clientes, public.curso_categorias, public.demanda_execucoes,
  public.financeiro_recebimentos, public.recargas, public.financeiro_fontes, public.saldo_ads, public.cursos
  disable row level security;
update storage.buckets set public = true where id = 'notas';
grant usage on all sequences in schema public to anon;
grant execute on all functions in schema public to public, anon;
commit;
