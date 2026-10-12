-- Aba Conteúdo (spec docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md).
-- Clientes ligados com kit e moldes, posts gerados, cópia do cofre de clientes (fechada para a chave pública),
-- aprovação que vira ig_posts e o relógio da fila.
CREATE TABLE IF NOT EXISTS public.conteudo_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  pasta_cofre text,
  ig_conta_id text REFERENCES public.ig_contas(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT false,
  logos jsonb NOT NULL DEFAULT '[]'::jsonb,
  tom_de_voz text NOT NULL DEFAULT '',
  design_system text NOT NULL DEFAULT '',
  fontes jsonb NOT NULL DEFAULT '[]'::jsonb,
  saude boolean NOT NULL DEFAULT false,
  ia_pode_pessoas boolean NOT NULL DEFAULT false,
  drive_url text NOT NULL DEFAULT '',
  drive_pastas jsonb NOT NULL DEFAULT '[]'::jsonb,
  pilares jsonb NOT NULL DEFAULT '[]'::jsonb,
  agenda jsonb NOT NULL DEFAULT '[]'::jsonb,
  moldes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conteudo_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conteudo_cliente_id uuid NOT NULL REFERENCES public.conteudo_clientes(id) ON DELETE CASCADE,
  formato text NOT NULL CHECK (formato IN ('carrossel', 'estatico')),
  pilar text,
  tema text,
  agendado_para timestamptz NOT NULL,
  origem_data date,
  laminas jsonb NOT NULL DEFAULT '[]'::jsonb,
  legenda text NOT NULL DEFAULT '',
  pedidos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'texto'
    CHECK (status IN ('texto', 'imagens', 'montando', 'aguardando', 'aprovado', 'descartado', 'erro')),
  processando_desde timestamptz,
  erro_etapa text,
  tentativas integer NOT NULL DEFAULT 0,
  erro text,
  aviso text,
  ig_post_id uuid UNIQUE REFERENCES public.ig_posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conteudo_posts_dia_da_agenda UNIQUE (conteudo_cliente_id, origem_data)
);
CREATE INDEX IF NOT EXISTS conteudo_posts_quando ON public.conteudo_posts (agendado_para);
CREATE INDEX IF NOT EXISTS conteudo_posts_fila ON public.conteudo_posts (created_at)
  WHERE status IN ('texto', 'imagens', 'montando');

-- Cópia do cofre do Obsidian (script do PC). Sem policy: a chave pública não lê; só a função (chave de serviço).
CREATE TABLE IF NOT EXISTS public.conteudo_cofre (
  pasta text NOT NULL,
  caminho text NOT NULL,
  hash text NOT NULL,
  conteudo text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pasta, caminho)
);

ALTER TABLE public.conteudo_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteudo_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteudo_cofre ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conteudo_clientes' AND policyname = 'conteudo_clientes_all') THEN
    CREATE POLICY "conteudo_clientes_all" ON public.conteudo_clientes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conteudo_posts' AND policyname = 'conteudo_posts_all') THEN
    CREATE POLICY "conteudo_posts_all" ON public.conteudo_posts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'conteudo_posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conteudo_posts;
  END IF;
END $$;

-- Aprovar: numa transação, o post sai de 'aguardando' e vira um ig_posts agendado (o relógio do Instagram publica).
CREATE OR REPLACE FUNCTION public.conteudo_aprovar(p_post uuid, p_quando timestamptz)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_post public.conteudo_posts;
  v_conta text;
  v_ig uuid;
BEGIN
  SELECT * INTO v_post FROM public.conteudo_posts WHERE id = p_post AND status = 'aguardando' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'O post não está aguardando aprovação.'; END IF;
  IF p_quando <= now() THEN RAISE EXCEPTION 'Escolha um dia e horário no futuro.'; END IF;
  SELECT ig_conta_id INTO v_conta FROM public.conteudo_clientes WHERE id = v_post.conteudo_cliente_id;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'O cliente não tem conta do Instagram ligada.'; END IF;
  IF jsonb_array_length(v_post.laminas) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_post.laminas) l WHERE coalesce(l->>'jpg_chave', '') = '') THEN
    RAISE EXCEPTION 'Há lâminas ainda sem imagem montada.';
  END IF;
  INSERT INTO public.ig_posts (conta_id, rede, tipo, midias, legenda, agendado_para)
  VALUES (
    v_conta, 'instagram',
    CASE WHEN jsonb_array_length(v_post.laminas) = 1 THEN 'foto' ELSE 'carrossel' END,
    (SELECT jsonb_agg(jsonb_build_object('chave', l->>'jpg_chave', 'tipo', 'imagem', 'largura', 1080, 'altura', 1350) ORDER BY n)
       FROM jsonb_array_elements(v_post.laminas) WITH ORDINALITY AS t(l, n)),
    v_post.legenda, p_quando)
  RETURNING id INTO v_ig;
  UPDATE public.conteudo_posts
     SET status = 'aprovado', ig_post_id = v_ig, agendado_para = p_quando, updated_at = now()
   WHERE id = p_post;
  RETURN v_ig;
END $$;

-- Relógio: a cada minuto, só chama a função quando há post livre na fila (livre = sem trava ou travado há 10 min).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'conteudo-passo') THEN
    PERFORM cron.schedule('conteudo-passo', '* * * * *', $c$
      SELECT net.http_post(
        url := 'https://uajusldnvzgakffofkhl.supabase.co/functions/v1/conteudo',
        body := '{"acao":"passo"}'::jsonb,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 150000)
      WHERE EXISTS (SELECT 1 FROM public.conteudo_posts
                    WHERE status IN ('texto', 'imagens', 'montando')
                      AND (processando_desde IS NULL OR processando_desde < now() - interval '10 minutes'))
    $c$);
  END IF;
END $$;
