-- Posts automáticos no Google Meu Negócio (spec 2026-09-29-gmn-posts-design.md).
-- Idempotente. Aplicar pelo editor SQL do Lovable.

CREATE TABLE IF NOT EXISTS public.gmn_perfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name TEXT UNIQUE,
  account_name TEXT,
  nome TEXT NOT NULL,
  endereco TEXT,
  categoria TEXT,
  site TEXT,
  telefone TEXT,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT false,
  sem_acesso BOOLEAN NOT NULL DEFAULT false,
  agenda JSONB NOT NULL DEFAULT '[{"dia": 2, "hora": "09:00"}, {"dia": 4, "hora": "09:00"}]'::jsonb
    CHECK (jsonb_typeof(agenda) = 'array'),
  cta_tipo TEXT NOT NULL DEFAULT 'LEARN_MORE' CHECK (cta_tipo IN ('LEARN_MORE', 'CALL', 'BOOK')),
  cta_url TEXT,
  drive_pasta_url TEXT,
  usa_ia_imagem BOOLEAN NOT NULL DEFAULT true,
  saude BOOLEAN NOT NULL DEFAULT false,
  briefing JSONB NOT NULL DEFAULT '{}'::jsonb,
  briefing_salvo_em TIMESTAMPTZ,
  sincronizado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gmn_perfis_ativo_exige_briefing CHECK (NOT ativo OR briefing_salvo_em IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS gmn_perfis_cliente_idx ON public.gmn_perfis(cliente_id);

CREATE TABLE IF NOT EXISTS public.gmn_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id UUID NOT NULL REFERENCES public.gmn_perfis(id) ON DELETE CASCADE,
  agendado_para TIMESTAMPTZ NOT NULL DEFAULT now(),
  dia DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  origem TEXT NOT NULL CHECK (origem IN ('agenda', 'manual', 'previa')),
  status TEXT NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'gerando', 'gerado', 'publicado', 'erro', 'pulado')),
  tema TEXT,
  palavras_chave TEXT[] NOT NULL DEFAULT '{}',
  texto TEXT,
  imagem_origem TEXT CHECK (imagem_origem IN ('drive', 'google', 'ia')),
  imagem_ref TEXT,
  imagem_url TEXT,
  google_post_name TEXT,
  google_url TEXT,
  google_estado TEXT,
  conferir_em TIMESTAMPTZ,
  tentativas SMALLINT NOT NULL DEFAULT 0,
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gmn_posts_agenda_dia ON public.gmn_posts(perfil_id, dia) WHERE origem = 'agenda';
CREATE INDEX IF NOT EXISTS gmn_posts_fila_idx ON public.gmn_posts(status, agendado_para) WHERE status = 'agendado';
CREATE INDEX IF NOT EXISTS gmn_posts_perfil_idx ON public.gmn_posts(perfil_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.gmn_imagens_uso (
  perfil_id UUID NOT NULL REFERENCES public.gmn_perfis(id) ON DELETE CASCADE,
  origem TEXT NOT NULL CHECK (origem IN ('drive', 'google')),
  ref TEXT NOT NULL,
  usado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (perfil_id, origem, ref)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['gmn_perfis', 'gmn_posts', 'gmn_imagens_uso'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_all') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)', t || '_all', t);
    END IF;
  END LOOP;
END $$;

-- Status dos posts ao vivo na aba (spec §3.3).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'gmn_posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gmn_posts;
  END IF;
END $$;
