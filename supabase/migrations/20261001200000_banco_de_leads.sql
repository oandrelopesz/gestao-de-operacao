-- Banco de leads: a "Planilha CRM Mestra" sincronizada com o sistema
-- (spec docs/superpowers/specs/2026-10-01-banco-de-leads-design.md). Idempotente: pode rodar mais de uma vez.

-- 0. pg_net (aviso do banco ao Apps Script). Não vinha instalado no Lovable Cloud: habilitado em 02/10/2026.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Configuração da ponte. Só a edge function lê (service role): RLS sem política.
CREATE TABLE IF NOT EXISTS public.planilha_config (
  id text PRIMARY KEY DEFAULT 'principal' CHECK (id = 'principal'),
  planilha_id text NOT NULL,
  chave text,
  webapp_url text,
  ultimo_aviso_em timestamptz,
  ultima_conferencia_em timestamptz,
  ultima_conferencia_ok boolean,
  ultima_conferencia_erro text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.planilha_config ENABLE ROW LEVEL SECURITY;

-- 2. Abas e leads da planilha (o front lê e grava: política aberta, como as outras tabelas do app)
CREATE TABLE IF NOT EXISTS public.banco_leads_abas (
  id text PRIMARY KEY,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  colunas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativa boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.banco_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aba_id text NOT NULL REFERENCES public.banco_leads_abas(id) ON DELETE CASCADE,
  posicao integer NOT NULL DEFAULT 0,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  hash text,
  lead_crm_id uuid REFERENCES public.prospeccao(id) ON DELETE SET NULL,
  na_planilha boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS banco_leads_aba_posicao_idx ON public.banco_leads (aba_id, posicao);
CREATE INDEX IF NOT EXISTS banco_leads_lead_crm_idx ON public.banco_leads (lead_crm_id);
ALTER TABLE public.banco_leads_abas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banco_leads ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'banco_leads_abas' AND policyname = 'banco_leads_abas_aberto') THEN
    CREATE POLICY banco_leads_abas_aberto ON public.banco_leads_abas FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'banco_leads' AND policyname = 'banco_leads_aberto') THEN
    CREATE POLICY banco_leads_aberto ON public.banco_leads FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Fila para a planilha e etapas esperando dado (internas: RLS sem política)
CREATE TABLE IF NOT EXISTS public.planilha_fila (
  id bigserial PRIMARY KEY,
  entidade text NOT NULL CHECK (entidade IN ('lead', 'crm')),
  registro_id text NOT NULL,
  op text NOT NULL CHECK (op IN ('upsert', 'delete')),
  campos text[],
  dados jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.planilha_pendencias (
  lead_id uuid PRIMARY KEY REFERENCES public.prospeccao(id) ON DELETE CASCADE,
  etapa_desejada text NOT NULL,
  falta text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.planilha_fila ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planilha_pendencias ENABLE ROW LEVEL SECURITY;

-- 4. Hash canônico da linha (o Apps Script calcula igual: chaves em ordem de código, valores não vazios)
CREATE OR REPLACE FUNCTION public.planilha_canonico(d jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT coalesce(string_agg(e.key || chr(31) || e.value, chr(30) ORDER BY e.key COLLATE "C"), '')
  FROM jsonb_each_text(coalesce(d, '{}'::jsonb)) AS e
  WHERE e.value IS NOT NULL AND e.value <> ''
$f$;

CREATE OR REPLACE FUNCTION public.banco_leads_antes() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  NEW.hash := md5(public.planilha_canonico(NEW.dados));
  IF TG_OP = 'UPDATE' THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END
$f$;
DROP TRIGGER IF EXISTS banco_leads_antes ON public.banco_leads;
CREATE TRIGGER banco_leads_antes BEFORE INSERT OR UPDATE ON public.banco_leads
  FOR EACH ROW EXECUTE FUNCTION public.banco_leads_antes();

-- 5. Origem da gravação: a edge function `planilha` manda o cabeçalho x-origem: planilha
CREATE OR REPLACE FUNCTION public.planilha_origem() RETURNS text LANGUAGE plpgsql STABLE AS $f$
BEGIN
  RETURN coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-origem', '');
EXCEPTION WHEN OTHERS THEN
  RETURN '';
END
$f$;

CREATE OR REPLACE FUNCTION public.planilha_chave_papel(p_aba text, p_papel text) RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT c ->> 'chave'
  FROM public.banco_leads_abas a, jsonb_array_elements(a.colunas) AS c
  WHERE a.id = p_aba AND c ->> 'papel' = p_papel
  LIMIT 1
$f$;

-- 6. Aviso ao Web App do Apps Script: no máximo um a cada 2 s (a planilha esvazia a fila inteira)
CREATE OR REPLACE FUNCTION public.planilha_avisar() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_url text;
  v_ultimo timestamptz;
BEGIN
  IF coalesce(current_setting('app.planilha_avisada', true), '') = '1' THEN RETURN; END IF;
  PERFORM set_config('app.planilha_avisada', '1', true);
  SELECT webapp_url, ultimo_aviso_em INTO v_url, v_ultimo FROM public.planilha_config WHERE id = 'principal';
  IF coalesce(v_url, '') = '' THEN RETURN; END IF;
  IF v_ultimo IS NOT NULL AND v_ultimo > clock_timestamp() - interval '2 seconds' THEN RETURN; END IF;
  UPDATE public.planilha_config SET ultimo_aviso_em = clock_timestamp() WHERE id = 'principal';
  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('aviso', 'fila'),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'planilha_avisar: %', SQLERRM;
END
$f$;

-- 7. Fila: o que muda pelo sistema vai para a planilha
CREATE OR REPLACE FUNCTION public.planilha_registrar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_campos text[];
  v_inseriu boolean := false;
  campos_crm text[] := ARRAY[
    'nome', 'empresa', 'telefone', 'email', 'instagram', 'coluna_id', 'coluna_desde', 'follow_up', 'follow_up_proposta',
    'proximo_contato_em', 'reuniao_em', 'reuniao_duracao_min', 'evento_google_id', 'evento_meet_link', 'evento_status',
    'evento_erro', 'valor_proposta', 'valor_fechamento', 'motivo_perda', 'motivo_desqualificacao', 'motivo_remarcacao',
    'trafego', 'nicho', 'cidade', 'faturamento_faixa', 'observacoes', 'created_at'];
BEGIN
  IF public.planilha_origem() = 'planilha' THEN RETURN NULL; END IF;

  IF TG_TABLE_NAME = 'banco_leads' THEN
    IF TG_OP = 'DELETE' THEN
      INSERT INTO public.planilha_fila (entidade, registro_id, op, dados)
      VALUES ('lead', OLD.id::text, 'delete', jsonb_build_object('aba_id', OLD.aba_id));
      IF OLD.lead_crm_id IS NOT NULL THEN
        INSERT INTO public.planilha_fila (entidade, registro_id, op) VALUES ('crm', OLD.lead_crm_id::text, 'upsert');
      END IF;
      v_inseriu := true;
    ELSIF TG_OP = 'INSERT' THEN
      INSERT INTO public.planilha_fila (entidade, registro_id, op) VALUES ('lead', NEW.id::text, 'upsert');
      v_inseriu := true;
    ELSE
      SELECT array_agg(s.k) INTO v_campos FROM (
        SELECT n.key AS k FROM jsonb_each(NEW.dados) AS n WHERE (OLD.dados -> n.key) IS DISTINCT FROM n.value
        UNION
        SELECT o.key FROM jsonb_each(OLD.dados) AS o WHERE NOT (NEW.dados ? o.key)
      ) AS s;
      IF NEW.aba_id IS DISTINCT FROM OLD.aba_id THEN
        INSERT INTO public.planilha_fila (entidade, registro_id, op) VALUES ('lead', NEW.id::text, 'upsert');
        v_inseriu := true;
      ELSIF v_campos IS NOT NULL THEN
        INSERT INTO public.planilha_fila (entidade, registro_id, op, campos) VALUES ('lead', NEW.id::text, 'upsert', v_campos);
        v_inseriu := true;
      END IF;
      IF NEW.lead_crm_id IS DISTINCT FROM OLD.lead_crm_id THEN
        IF NEW.lead_crm_id IS NOT NULL THEN
          INSERT INTO public.planilha_fila (entidade, registro_id, op) VALUES ('crm', NEW.lead_crm_id::text, 'upsert');
        END IF;
        IF OLD.lead_crm_id IS NOT NULL THEN
          INSERT INTO public.planilha_fila (entidade, registro_id, op) VALUES ('crm', OLD.lead_crm_id::text, 'upsert');
        END IF;
        v_inseriu := true;
      END IF;
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.planilha_fila (entidade, registro_id, op) VALUES ('crm', NEW.id::text, 'upsert');
      v_inseriu := true;
    ELSE
      SELECT array_agg(c) INTO v_campos FROM unnest(campos_crm) AS c
      WHERE (to_jsonb(NEW) -> c) IS DISTINCT FROM (to_jsonb(OLD) -> c);
      IF v_campos IS NOT NULL THEN
        INSERT INTO public.planilha_fila (entidade, registro_id, op, campos) VALUES ('crm', NEW.id::text, 'upsert', v_campos);
        v_inseriu := true;
      END IF;
    END IF;
  END IF;
  IF v_inseriu THEN PERFORM public.planilha_avisar(); END IF;
  RETURN NULL;
END
$f$;

-- 8. Saída do CRM: "Não" em "Primeira mensagem enviada" do lead ligado e a linha para a lixeira da planilha
CREATE OR REPLACE FUNCTION public.planilha_prospeccao_excluir() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  b record;
  v_chave text;
  v_aba text;
  v_fat text;
BEGIN
  FOR b IN SELECT id, aba_id, dados FROM public.banco_leads WHERE lead_crm_id = OLD.id LOOP
    SELECT nome INTO v_aba FROM public.banco_leads_abas WHERE id = b.aba_id;
    v_fat := b.dados ->> public.planilha_chave_papel(b.aba_id, 'faturamento');
    v_chave := public.planilha_chave_papel(b.aba_id, 'primeira_msg');
    IF v_chave IS NOT NULL THEN
      UPDATE public.banco_leads SET dados = jsonb_set(dados, ARRAY[v_chave], to_jsonb('Não'::text)) WHERE id = b.id;
    END IF;
  END LOOP;
  IF public.planilha_origem() <> 'planilha' THEN
    INSERT INTO public.planilha_fila (entidade, registro_id, op, dados)
    VALUES ('crm', OLD.id::text, 'delete', to_jsonb(OLD) || jsonb_build_object('_aba_origem', v_aba, '_faturamento_origem', v_fat));
    PERFORM public.planilha_avisar();
  END IF;
  RETURN OLD;
END
$f$;

-- 9. Um lead só: campos em comum iguais na aba de origem e no CRM
CREATE OR REPLACE FUNCTION public.planilha_crm_para_banco() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  b record;
  campo text;
  v_chave text;
  v_novo text;
  v_dados jsonb;
BEGIN
  IF coalesce(current_setting('app.propagando', true), '') = '1' THEN RETURN NULL; END IF;
  FOR b IN SELECT id, aba_id, dados FROM public.banco_leads WHERE lead_crm_id = NEW.id LOOP
    v_dados := b.dados;
    FOREACH campo IN ARRAY ARRAY['nome', 'empresa', 'telefone', 'instagram', 'cidade', 'nicho', 'site'] LOOP
      CONTINUE WHEN (to_jsonb(NEW) ->> campo) IS NOT DISTINCT FROM (to_jsonb(OLD) ->> campo);
      v_chave := public.planilha_chave_papel(b.aba_id, campo);
      CONTINUE WHEN v_chave IS NULL;
      v_novo := btrim(coalesce(to_jsonb(NEW) ->> campo, ''));
      IF v_novo = '' THEN
        v_dados := v_dados - v_chave;
      ELSE
        v_dados := jsonb_set(v_dados, ARRAY[v_chave], to_jsonb(v_novo));
      END IF;
    END LOOP;
    IF v_dados IS DISTINCT FROM b.dados THEN
      PERFORM set_config('app.propagando', '1', true);
      UPDATE public.banco_leads SET dados = v_dados WHERE id = b.id;
      PERFORM set_config('app.propagando', '', true);
    END IF;
  END LOOP;
  RETURN NULL;
END
$f$;

CREATE OR REPLACE FUNCTION public.planilha_banco_para_crm() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  campo text;
  v_chave text;
  v_novo text;
  v_patch jsonb := '{}'::jsonb;
BEGIN
  IF coalesce(current_setting('app.propagando', true), '') = '1' OR NEW.lead_crm_id IS NULL THEN RETURN NULL; END IF;
  FOREACH campo IN ARRAY ARRAY['nome', 'empresa', 'telefone', 'instagram', 'cidade', 'nicho', 'site'] LOOP
    v_chave := public.planilha_chave_papel(NEW.aba_id, campo);
    CONTINUE WHEN v_chave IS NULL;
    v_novo := btrim(coalesce(NEW.dados ->> v_chave, ''));
    CONTINUE WHEN v_novo = btrim(coalesce(OLD.dados ->> v_chave, ''));
    CONTINUE WHEN campo = 'nome' AND v_novo = '';
    v_patch := v_patch || jsonb_build_object(campo, nullif(v_novo, ''));
  END LOOP;
  IF v_patch = '{}'::jsonb THEN RETURN NULL; END IF;
  PERFORM set_config('app.propagando', '1', true);
  UPDATE public.prospeccao p SET
    nome = CASE WHEN v_patch ? 'nome' THEN v_patch ->> 'nome' ELSE p.nome END,
    empresa = CASE WHEN v_patch ? 'empresa' THEN v_patch ->> 'empresa' ELSE p.empresa END,
    telefone = CASE WHEN v_patch ? 'telefone' THEN v_patch ->> 'telefone' ELSE p.telefone END,
    instagram = CASE WHEN v_patch ? 'instagram' THEN v_patch ->> 'instagram' ELSE p.instagram END,
    cidade = CASE WHEN v_patch ? 'cidade' THEN v_patch ->> 'cidade' ELSE p.cidade END,
    nicho = CASE WHEN v_patch ? 'nicho' THEN v_patch ->> 'nicho' ELSE p.nicho END,
    site = CASE WHEN v_patch ? 'site' THEN v_patch ->> 'site' ELSE p.site END,
    updated_at = now()
  WHERE p.id = NEW.lead_crm_id;
  PERFORM set_config('app.propagando', '', true);
  RETURN NULL;
END
$f$;

-- 10. Mudou a etapa no sistema: a etapa que a planilha esperava completar deixa de valer
CREATE OR REPLACE FUNCTION public.planilha_pendencia_obsoleta() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  DELETE FROM public.planilha_pendencias WHERE lead_id = NEW.id;
  RETURN NULL;
END
$f$;

DROP TRIGGER IF EXISTS planilha_a_registrar ON public.banco_leads;
CREATE TRIGGER planilha_a_registrar AFTER INSERT OR UPDATE OR DELETE ON public.banco_leads
  FOR EACH ROW EXECUTE FUNCTION public.planilha_registrar();
DROP TRIGGER IF EXISTS planilha_b_para_crm ON public.banco_leads;
CREATE TRIGGER planilha_b_para_crm AFTER UPDATE ON public.banco_leads
  FOR EACH ROW EXECUTE FUNCTION public.planilha_banco_para_crm();
DROP TRIGGER IF EXISTS planilha_a_registrar ON public.prospeccao;
CREATE TRIGGER planilha_a_registrar AFTER INSERT OR UPDATE ON public.prospeccao
  FOR EACH ROW EXECUTE FUNCTION public.planilha_registrar();
DROP TRIGGER IF EXISTS planilha_b_para_banco ON public.prospeccao;
CREATE TRIGGER planilha_b_para_banco AFTER UPDATE ON public.prospeccao
  FOR EACH ROW EXECUTE FUNCTION public.planilha_crm_para_banco();
DROP TRIGGER IF EXISTS planilha_c_pendencia ON public.prospeccao;
CREATE TRIGGER planilha_c_pendencia AFTER UPDATE OF coluna_id ON public.prospeccao
  FOR EACH ROW WHEN (OLD.coluna_id IS DISTINCT FROM NEW.coluna_id) EXECUTE FUNCTION public.planilha_pendencia_obsoleta();
DROP TRIGGER IF EXISTS planilha_excluir ON public.prospeccao;
CREATE TRIGGER planilha_excluir BEFORE DELETE ON public.prospeccao
  FOR EACH ROW EXECUTE FUNCTION public.planilha_prospeccao_excluir();

-- 11. Resumo para a conferência de 5 min
CREATE OR REPLACE FUNCTION public.planilha_resumo() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT jsonb_build_object(
    'abas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'n', coalesce(s.n, 0), 'agg', coalesce(s.agg, md5(''))) ORDER BY a.ordem)
      FROM public.banco_leads_abas a
      LEFT JOIN (
        SELECT aba_id, count(*)::int AS n,
               md5(string_agg(id::text || ':' || coalesce(hash, '') || ':' || posicao::text, ',' ORDER BY id::text COLLATE "C")) AS agg
        FROM public.banco_leads
        GROUP BY aba_id
      ) AS s ON s.aba_id = a.id
      WHERE a.ativa
    ), '[]'::jsonb),
    'crm', md5(
      coalesce((
        SELECT string_agg(
          p.id::text || ':' || coalesce(p.updated_at::text, '') || ':' || coalesce(pp.etapa_desejada, '') || ':' || coalesce(b.aba_id, ''),
          ',' ORDER BY p.id::text COLLATE "C")
        FROM public.prospeccao p
        LEFT JOIN public.planilha_pendencias pp ON pp.lead_id = p.id
        LEFT JOIN LATERAL (SELECT bl.aba_id FROM public.banco_leads bl WHERE bl.lead_crm_id = p.id LIMIT 1) AS b ON true
      ), '')
      || '|' ||
      coalesce((SELECT string_agg(c.id || ':' || c.titulo || ':' || c.ordem::text || ':' || c.tipo, ',' ORDER BY c.ordem, c.id) FROM public.crm_colunas c), '')
    ),
    'crm_n', (SELECT count(*)::int FROM public.prospeccao)
  )
$f$;

-- 12. Estado da sincronização para a tela (sem a chave)
CREATE OR REPLACE FUNCTION public.planilha_status() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT jsonb_build_object(
    'planilha_id', planilha_id,
    'ultima_conferencia_em', ultima_conferencia_em,
    'ok', ultima_conferencia_ok,
    'erro', ultima_conferencia_erro,
    'conectada', coalesce(chave, '') <> ''
  )
  FROM public.planilha_config
  WHERE id = 'principal'
$f$;

-- 13. Gravações do Banco de leads pelo front (um campo por vez, sem sobrescrever o resto da linha)
CREATE OR REPLACE FUNCTION public.banco_leads_definir(p_id uuid, p_chave text, p_valor text) RETURNS void LANGUAGE sql AS $f$
  UPDATE public.banco_leads
  SET dados = CASE
    WHEN btrim(coalesce(p_valor, '')) = '' THEN dados - p_chave
    ELSE jsonb_set(dados, ARRAY[p_chave], to_jsonb(btrim(p_valor)))
  END
  WHERE id = p_id
$f$;

CREATE OR REPLACE FUNCTION public.banco_leads_ligar(p_id uuid, p_crm uuid, p_chave text, p_valor text) RETURNS void LANGUAGE sql AS $f$
  UPDATE public.banco_leads
  SET lead_crm_id = p_crm,
      dados = CASE WHEN p_chave IS NULL THEN dados ELSE jsonb_set(dados, ARRAY[p_chave], to_jsonb(p_valor)) END
  WHERE id = p_id
$f$;

GRANT EXECUTE ON FUNCTION public.planilha_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.banco_leads_definir(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.banco_leads_ligar(uuid, uuid, text, text) TO anon, authenticated;

-- 14. Realtime: o Banco de leads e o CRM se atualizam sozinhos
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['banco_leads', 'banco_leads_abas', 'prospeccao', 'crm_eventos'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
