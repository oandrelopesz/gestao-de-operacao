-- Aba Radar IA (18/11/2026): uma nota por dia com os achados do bot de pesquisa.
-- Spec: docs/superpowers/specs/2026-11-17-aba-radar-ia-design.md. Só objetos novos; nada existente é tocado.
-- Leitura: login do André (policy so_andre, como a fase 4 de segurança). Escrita do bot: só pela função
-- radar_ingerir (service_role), chamada pela edge function "radar". A tela só altera status e nota_pessoal.
-- Idempotente: pode rodar de novo sem erro.

do $$ begin create type public.radar_classe as enum ('excelente','bom','medio'); exception when duplicate_object then null; end $$;
do $$ begin create type public.radar_tipo as enum ('A','B','C'); exception when duplicate_object then null; end $$; -- aplicação / mudança / lançamento
do $$ begin create type public.radar_confianca as enum ('alta','moderada','baixa'); exception when duplicate_object then null; end $$;
do $$ begin create type public.radar_status as enum ('novo','lido','testando','aplicado','descartado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.radar_evento as enum ('abertura','boletim','alerta','correcao','resposta','encerramento'); exception when duplicate_object then null; end $$;

-- 1) Uma linha por dia civil em America/Sao_Paulo = "a nota do dia"
create table if not exists public.radar_dias (
  data               date primary key,
  edicao_id          text not null unique check (edicao_id ~ '^DIA-\d{8}$'),
  revisao            text,
  abertura_texto     text,
  encerramento_texto text,
  resumo             jsonb not null default '{}',   -- {por_classe:{...}, por_tema:{...}, fora:[{id,motivo}]}
  cobertura_parcial  text,
  total_confirmados  int not null default 0 check (total_confirmados between 0 and 20),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.radar_dias is 'Aba Radar IA: uma nota por dia (edição DIA-AAAAMMDD), atualizada ao longo do dia';

-- 2) Achados (campos do bot + campos pessoais do André)
create table if not exists public.radar_achados (
  id                  text primary key check (id ~ '^RAD-\d{8}-\d{3}$'),
  data                date not null references public.radar_dias(data) on delete restrict,
  titulo              text not null check (char_length(titulo) <= 300),
  classe              public.radar_classe not null,
  tipo                public.radar_tipo not null,
  tipo_motivo         text,
  alerta              boolean not null default false,
  temas               text[] not null check (cardinality(temas) between 1 and 3
                        and temas <@ array['marketing','branding','performance','ia','software_saas',
                                           'dados_mensuracao','ciberseguranca','conteudo_social']::text[]),
  confianca           public.radar_confianca not null,
  estagio             text not null,
  prontidao           text,
  publicacao          date,                          -- null = "não informada pela fonte"
  primeira_descoberta timestamptz not null,
  atualizacao         text,
  corpo               jsonb not null,
  links               jsonb not null default '[]',
  post_x_url          text,
  link_citado_x_url   text,
  texto_whatsapp      text not null,
  enviado_em          timestamptz,
  versao              int not null default 1,
  hash_conteudo       text not null,                 -- sha256 do achado em jsonb (chaves normalizadas pelo Postgres)
  corrigido           boolean not null default false,
  -- Campos pessoais (NUNCA escritos pela ingestão)
  status              public.radar_status not null default 'novo',
  status_em           timestamptz,
  nota_pessoal        text,
  busca               tsvector generated always as (
                        to_tsvector('portuguese', coalesce(titulo,'') || ' ' || coalesce(texto_whatsapp,''))
                      ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.radar_achados is 'Aba Radar IA: achados do bot (RAD-AAAAMMDD-NNN); status e nota_pessoal são do André';
create index if not exists radar_achados_data_idx on public.radar_achados (data desc);
create index if not exists radar_achados_classe_idx on public.radar_achados (classe);
create index if not exists radar_achados_temas_idx on public.radar_achados using gin (temas);
create index if not exists radar_achados_busca_idx on public.radar_achados using gin (busca);
create index if not exists radar_achados_status_idx on public.radar_achados (status);

-- 3) Histórico de versões do achado (antes de cada update do bot)
create table if not exists public.radar_achado_versoes (
  id         bigserial primary key,
  achado_id  text not null references public.radar_achados(id) on delete cascade,
  versao     int not null,
  snapshot   jsonb not null,
  motivo     text,
  created_at timestamptz not null default now(),
  unique (achado_id, versao)
);
comment on table public.radar_achado_versoes is 'Aba Radar IA: versão anterior de cada achado, gravada antes de o bot atualizar';

-- 4) Linha do tempo do dia
create table if not exists public.radar_eventos (
  id              uuid primary key default gen_random_uuid(),
  data            date not null references public.radar_dias(data),
  tipo            public.radar_evento not null,
  achado_id       text references public.radar_achados(id),
  idempotency_key text not null unique,
  ocorrido_em     timestamptz not null,
  texto_whatsapp  text,
  dados           jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
comment on table public.radar_eventos is 'Aba Radar IA: linha do tempo do dia (abertura, alertas, correções, respostas, encerramento)';
create index if not exists radar_eventos_data_idx on public.radar_eventos (data, ocorrido_em);

-- 5) Log de ingestão (auditoria e depuração; sem chave e sem corpo)
create table if not exists public.radar_ingestao_log (
  id              bigserial primary key,
  recebido_em     timestamptz not null default now(),
  rota            text not null,
  chave_digest    text,                              -- 8 primeiros hex do sha256 da chave, nunca a chave
  idempotency_key text,
  dry_run         boolean not null default false,
  status_http     int not null,
  codigo          text,
  resumo          jsonb,
  payload_sha256  text,
  resposta        jsonb,                             -- resposta original, devolvida nos replays
  duracao_ms      int
);
comment on table public.radar_ingestao_log is 'Aba Radar IA: log de cada requisição à função radar (sem segredos)';
create index if not exists radar_ingestao_log_recebido_idx on public.radar_ingestao_log (recebido_em desc);
create index if not exists radar_ingestao_log_idem_idx on public.radar_ingestao_log (idempotency_key);

-- 6) Filtros salvos (presets da UI, Fase 2)
create table if not exists public.radar_filtros_salvos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  query      text not null,
  ordem      int not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.radar_filtros_salvos is 'Aba Radar IA: filtros salvos (querystring da URL)';

-- Gatilhos
create or replace function public.radar_marca_status_em() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status then new.status_em := now(); end if;
  return new;
end $$;
create or replace trigger radar_achados_status_em before update on public.radar_achados
  for each row execute function public.radar_marca_status_em();
create or replace trigger radar_achados_updated_at before update on public.radar_achados
  for each row execute function public.set_updated_at();
create or replace trigger radar_dias_updated_at before update on public.radar_dias
  for each row execute function public.set_updated_at();

-- Permissões: RLS em todas; policy so_andre; o padrão do Supabase dá tudo ao authenticated, então estreito.
alter table public.radar_dias enable row level security;
alter table public.radar_achados enable row level security;
alter table public.radar_achado_versoes enable row level security;
alter table public.radar_eventos enable row level security;
alter table public.radar_ingestao_log enable row level security; -- sem policy: só a service_role
alter table public.radar_filtros_salvos enable row level security;
do $$
declare t text;
begin
  foreach t in array array['radar_dias','radar_achados','radar_achado_versoes','radar_eventos','radar_filtros_salvos'] loop
    execute format('drop policy if exists so_andre on public.%I', t);
    execute format($f$create policy so_andre on public.%I as permissive for all to authenticated
      using ((select auth.jwt() ->> 'email') = 'contato@andrelopes.digital')
      with check ((select auth.jwt() ->> 'email') = 'contato@andrelopes.digital')$f$, t);
  end loop;
end $$;
revoke all on public.radar_dias, public.radar_achados, public.radar_achado_versoes, public.radar_eventos,
  public.radar_ingestao_log, public.radar_filtros_salvos from anon, authenticated;
revoke all on sequence public.radar_achado_versoes_id_seq, public.radar_ingestao_log_id_seq from anon, authenticated;
grant select on public.radar_dias, public.radar_achados, public.radar_achado_versoes, public.radar_eventos to authenticated;
grant update (status, nota_pessoal) on public.radar_achados to authenticated;
grant select, insert, update, delete on public.radar_filtros_salvos to authenticated;
grant all on public.radar_dias, public.radar_achados, public.radar_achado_versoes, public.radar_eventos,
  public.radar_ingestao_log, public.radar_filtros_salvos to service_role;
grant usage on sequence public.radar_achado_versoes_id_seq, public.radar_ingestao_log_id_seq to service_role;

-- Ingestão: um envio inteiro numa transação. Devolve a resposta da API em jsonb; erros 409/422 voltam como
-- { ok:false, status, codigo, mensagem, campos } depois de desfazer tudo. dry_run calcula e desfaz.
-- Só grava no log o envio aceito (na mesma transação, para o replay não ter corrida); o resto a edge function loga.
create or replace function public.radar_ingerir(p_payload jsonb, p_idem text, p_dry_run boolean default false, p_chave_digest text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ini       timestamptz := clock_timestamp();
  v_sha       text := encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
  v_tipo      text := p_payload->>'tipo';
  v_edicao    text := p_payload->>'edicao_id';
  v_dia       jsonb := coalesce(p_payload->'dia', '{}'::jsonb);
  v_quando    timestamptz := (p_payload->>'ocorrido_em')::timestamptz;
  v_data      date;
  v_log       record;
  v_a         jsonb;
  v_i         int := 0;
  v_ex        record;
  v_existe    boolean;
  v_hash      text;
  v_id        text;
  v_ref       text;
  v_total     int;
  v_criados   jsonb := '[]';
  v_atual     jsonb := '[]';
  v_sem       jsonb := '[]';
  v_invalidos jsonb := '[]';
  v_antigos   jsonb := '[]';
  v_res       jsonb;
  v_msg       text;
  v_det       text;
  v_cod       text;
begin
  if coalesce(p_idem, '') = '' then raise exception 'Idempotency-Key ausente'; end if;
  v_data := to_date(substr(v_edicao, 5), 'YYYYMMDD');

  if not p_dry_run then
    perform pg_advisory_xact_lock(hashtextextended('radar:' || p_idem, 0));
    select payload_sha256, resposta into v_log from public.radar_ingestao_log
      where idempotency_key = p_idem and codigo = 'OK' and not dry_run order by id limit 1;
    if found then
      if v_log.payload_sha256 = v_sha then return v_log.resposta || '{"replay": true}'::jsonb; end if;
      return jsonb_build_object('ok', false, 'status', 409, 'codigo', 'IDEMPOTENCIA_CONFLITO',
        'mensagem', 'Esta Idempotency-Key já foi usada com outro conteúdo.');
    end if;
  end if;

  begin
    insert into public.radar_dias (data, edicao_id, revisao, abertura_texto, encerramento_texto, cobertura_parcial, resumo)
    values (v_data, v_edicao, p_payload->>'revisao', v_dia->>'abertura_texto', v_dia->>'encerramento_texto',
            v_dia->>'cobertura_parcial', case when v_dia ? 'fora' then jsonb_build_object('fora', v_dia->'fora') else '{}'::jsonb end)
    on conflict (data) do update set
      revisao            = coalesce(excluded.revisao, radar_dias.revisao),
      abertura_texto     = coalesce(excluded.abertura_texto, radar_dias.abertura_texto),
      encerramento_texto = coalesce(excluded.encerramento_texto, radar_dias.encerramento_texto),
      cobertura_parcial  = coalesce(excluded.cobertura_parcial, radar_dias.cobertura_parcial),
      resumo             = case when v_dia ? 'fora' then radar_dias.resumo || jsonb_build_object('fora', v_dia->'fora')
                                else radar_dias.resumo end;

    for v_a in select value from jsonb_array_elements(coalesce(p_payload->'achados', '[]'::jsonb)) loop
      v_id := v_a->>'id';
      v_hash := encode(sha256(convert_to(v_a::text, 'UTF8')), 'hex');
      select id, versao, hash_conteudo, data into v_ex from public.radar_achados where id = v_id for update;
      v_existe := found;
      if not v_existe then
        if substr(v_id, 5, 8) <> substr(v_edicao, 5, 8) then
          v_invalidos := v_invalidos || jsonb_build_object('caminho', format('achados[%s].id', v_i),
            'problema', format('achado novo com data diferente da edição %s', v_edicao));
        else
          insert into public.radar_achados (id, data, titulo, classe, tipo, tipo_motivo, alerta, temas, confianca, estagio,
            prontidao, publicacao, primeira_descoberta, atualizacao, corpo, links, post_x_url, link_citado_x_url,
            texto_whatsapp, enviado_em, versao, hash_conteudo, corrigido)
          select v_id, v_data, r.titulo, r.classe, r.tipo, r.tipo_motivo, coalesce(r.alerta, false), r.temas, r.confianca,
            r.estagio, r.prontidao, r.publicacao, r.primeira_descoberta, r.atualizacao, r.corpo, coalesce(r.links, '[]'),
            r.post_x_url, r.link_citado_x_url, r.texto_whatsapp, r.enviado_em, coalesce(r.versao, 1), v_hash, v_tipo = 'correcao'
          from jsonb_populate_record(null::public.radar_achados, v_a) r;
          v_criados := v_criados || to_jsonb(v_id);
        end if;
      elsif v_ex.hash_conteudo = v_hash then
        v_sem := v_sem || to_jsonb(v_id);
      elsif coalesce((v_a->>'versao')::int, 1) > v_ex.versao then
        insert into public.radar_achado_versoes (achado_id, versao, snapshot, motivo)
        select a.id, a.versao, to_jsonb(a) - 'busca' - 'status' - 'status_em' - 'nota_pessoal',
               case when v_tipo = 'correcao' then 'correcao'
                    when p_payload ? 'revisao' then 'revisao ' || (p_payload->>'revisao') else 'atualizacao' end
        from public.radar_achados a where a.id = v_id
        on conflict (achado_id, versao) do nothing;
        update public.radar_achados t set
          titulo = r.titulo, classe = r.classe, tipo = r.tipo, tipo_motivo = r.tipo_motivo, alerta = coalesce(r.alerta, false),
          temas = r.temas, confianca = r.confianca, estagio = r.estagio, prontidao = r.prontidao, publicacao = r.publicacao,
          primeira_descoberta = r.primeira_descoberta, atualizacao = r.atualizacao, corpo = r.corpo,
          links = coalesce(r.links, '[]'), post_x_url = r.post_x_url, link_citado_x_url = r.link_citado_x_url,
          texto_whatsapp = r.texto_whatsapp, enviado_em = r.enviado_em, versao = r.versao, hash_conteudo = v_hash,
          corrigido = t.corrigido or v_tipo = 'correcao'
        from jsonb_populate_record(null::public.radar_achados, v_a) r
        where t.id = v_id;
        v_atual := v_atual || to_jsonb(v_id);
      else
        v_antigos := v_antigos || jsonb_build_object('caminho', format('achados[%s].versao', v_i),
          'problema', format('%s já está na versão %s com outro conteúdo; envie uma versão maior', v_id, v_ex.versao));
      end if;
      -- achado de outro dia citado no boletim: não muda de dia, só ganha um evento no dia atual
      if v_existe and v_ex.data <> v_data and v_tipo = 'boletim' then
        insert into public.radar_eventos (data, tipo, achado_id, idempotency_key, ocorrido_em, dados)
        values (v_data, 'boletim', v_id, p_idem || ':' || v_id, v_quando, '{"citacao": true}');
      end if;
      v_i := v_i + 1;
    end loop;

    if jsonb_array_length(v_invalidos) > 0 then
      raise exception using errcode = 'RDR22', message = 'VALIDACAO', detail = v_invalidos::text;
    end if;
    if jsonb_array_length(v_antigos) > 0 then
      raise exception using errcode = 'RDR09', message = 'VERSAO_ANTIGA', detail = v_antigos::text;
    end if;

    if v_tipo = 'correcao' then
      v_ref := p_payload->'correcao'->>'achado_id';
      update public.radar_achados set corrigido = true where id = v_ref;
      if not found then
        raise exception using errcode = 'RDR22', message = 'VALIDACAO',
          detail = jsonb_build_array(jsonb_build_object('caminho', 'correcao.achado_id', 'problema', 'achado não existe'))::text;
      end if;
    elsif v_tipo = 'resposta' then
      v_ref := p_payload->'resposta'->>'referencia';
      if v_ref is not null and not exists (select 1 from public.radar_achados where id = v_ref) then v_ref := null; end if;
    elsif v_tipo = 'alerta' then
      v_ref := p_payload->'achados'->0->>'id';
    end if;

    insert into public.radar_eventos (data, tipo, achado_id, idempotency_key, ocorrido_em, texto_whatsapp, dados)
    values (
      v_data,
      (case when v_tipo = 'boletim' and coalesce(p_payload->>'revisao', 'R1') = 'R1' then 'abertura'
            else v_tipo end)::public.radar_evento,                   -- R2 em diante é revisão do boletim
      v_ref,
      p_idem,
      v_quando,
      case v_tipo
        when 'boletim' then v_dia->>'abertura_texto'
        when 'alerta' then p_payload->'achados'->0->>'texto_whatsapp'
        when 'correcao' then p_payload->'correcao'->>'texto_whatsapp'
        when 'resposta' then p_payload->'resposta'->>'texto_whatsapp'
        when 'encerramento' then v_dia->>'encerramento_texto'
      end,
      case v_tipo
        when 'boletim' then jsonb_build_object('revisao', p_payload->>'revisao',
          'achados', coalesce((select jsonb_agg(x->>'id') from jsonb_array_elements(p_payload->'achados') x), '[]'::jsonb))
        when 'correcao' then (p_payload->'correcao') - 'texto_whatsapp'
        when 'resposta' then (p_payload->'resposta') - 'texto_whatsapp'
        else '{}'::jsonb
      end
    );

    -- contadores do dia sempre recalculados a partir dos achados (o número do bot não vale)
    select count(*) into v_total from public.radar_achados where data = v_data;
    if v_total > 20 then
      raise exception using errcode = 'RDR22', message = 'VALIDACAO',
        detail = jsonb_build_array(jsonb_build_object('caminho', 'achados',
          'problema', format('o dia %s passaria de 20 achados (%s)', v_data, v_total)))::text;
    end if;
    update public.radar_dias d set
      total_confirmados = v_total,
      resumo = (d.resumo - 'por_classe' - 'por_tema') || jsonb_build_object(
        'por_classe', coalesce((select jsonb_object_agg(s.classe, s.n) from
          (select classe, count(*) n from public.radar_achados where data = v_data group by classe) s), '{}'::jsonb),
        'por_tema', coalesce((select jsonb_object_agg(s.tema, s.n) from
          (select t.tema, count(*) n from public.radar_achados a, unnest(a.temas) as t(tema)
           where a.data = v_data group by t.tema) s), '{}'::jsonb))
    where d.data = v_data;

    v_res := jsonb_build_object('ok', true, 'replay', false, 'dry_run', p_dry_run, 'data', v_data, 'edicao_id', v_edicao,
      'criados', v_criados, 'atualizados', v_atual, 'sem_mudanca', v_sem, 'avisos', '[]'::jsonb,
      'url_dia', 'https://gestao.andrelopes.digital/radar?dia=' || v_data::text);
    if p_dry_run then raise exception using errcode = 'RDR01', message = v_res::text; end if;
  exception
    when sqlstate 'RDR01' then
      get stacked diagnostics v_msg = message_text;
      return v_msg::jsonb;
    when sqlstate 'RDR09' or sqlstate 'RDR22' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail, v_cod = returned_sqlstate;
      return jsonb_build_object('ok', false, 'status', case v_cod when 'RDR09' then 409 else 422 end, 'codigo', v_msg,
        'mensagem', case v_msg when 'VERSAO_ANTIGA' then 'Há achado com versão igual ou menor que a gravada e conteúdo diferente.'
                               else 'Dados inválidos.' end,
        'campos', v_det::jsonb, 'dry_run', p_dry_run);
  end;

  insert into public.radar_ingestao_log (rota, chave_digest, idempotency_key, dry_run, status_http, codigo, resumo,
    payload_sha256, resposta, duracao_ms)
  values ('POST /eventos', p_chave_digest, p_idem, false, 200, 'OK',
    jsonb_build_object('criados', v_criados, 'atualizados', v_atual, 'sem_mudanca', v_sem), v_sha, v_res,
    (extract(epoch from clock_timestamp() - v_ini) * 1000)::int);
  return v_res;
end $$;
comment on function public.radar_ingerir(jsonb, text, boolean, text) is 'Aba Radar IA: ingestão do bot (só service_role, via edge function radar)';
revoke execute on function public.radar_ingerir(jsonb, text, boolean, text) from public, anon, authenticated;
grant execute on function public.radar_ingerir(jsonb, text, boolean, text) to service_role;
revoke execute on function public.radar_marca_status_em() from public, anon, authenticated;
