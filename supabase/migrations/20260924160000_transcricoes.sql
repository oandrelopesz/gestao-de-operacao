-- Transcritor (grupo Ferramentas): fila de transcrições de links e arquivos.
-- A mídia fica só na VPS (apagada ao terminar); aqui só o texto, apagado em definitivo ao vencer.
CREATE TABLE IF NOT EXISTS public.transcricoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT,
  origem TEXT NOT NULL CHECK (origem IN ('link', 'arquivo')),
  link TEXT,
  arquivo_nome TEXT,
  plataforma TEXT,
  tamanho BIGINT,
  status TEXT NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('enviando', 'aguardando', 'baixando', 'transcrevendo', 'pronta', 'falhou', 'pausada')),
  posicao BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  progresso REAL NOT NULL DEFAULT 0,
  texto TEXT,
  idioma TEXT,
  duracao_seg REAL,
  erro TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  validade_dias INTEGER NOT NULL DEFAULT 3 CHECK (validade_dias BETWEEN 1 AND 15),
  expira_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS transcricoes_fila_idx ON public.transcricoes (status, posicao, created_at);
CREATE INDEX IF NOT EXISTS transcricoes_expira_idx ON public.transcricoes (expira_em) WHERE expira_em IS NOT NULL;

ALTER TABLE public.transcricoes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transcricoes' AND policyname = 'transcricoes_all') THEN
    CREATE POLICY transcricoes_all ON public.transcricoes FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Ao terminar (pronta/falhou): marca concluido_em e começa a contar a validade
CREATE OR REPLACE FUNCTION public.transcricoes_ao_concluir()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('pronta', 'falhou') AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.concluido_em := COALESCE(NEW.concluido_em, now());
    IF NEW.expira_em IS NULL THEN
      NEW.expira_em := now() + make_interval(days => NEW.validade_dias);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS transcricoes_ao_concluir ON public.transcricoes;
CREATE TRIGGER transcricoes_ao_concluir BEFORE UPDATE OF status ON public.transcricoes
  FOR EACH ROW EXECUTE FUNCTION public.transcricoes_ao_concluir();

-- Exclusão definitiva do que venceu (sem lixeira), de hora em hora
CREATE OR REPLACE FUNCTION public.limpar_transcricoes_vencidas()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH apagadas AS (DELETE FROM public.transcricoes WHERE expira_em IS NOT NULL AND expira_em < now() RETURNING 1)
  SELECT count(*)::int FROM apagadas
$$;
REVOKE EXECUTE ON FUNCTION public.limpar_transcricoes_vencidas() FROM PUBLIC, anon, authenticated;
SELECT cron.unschedule('limpar-transcricoes') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-transcricoes');
SELECT cron.schedule('limpar-transcricoes', '17 * * * *', $$SELECT public.limpar_transcricoes_vencidas()$$);

-- Glossário que ajuda o modelo com termos de marketing/inglês (editável no Admin)
INSERT INTO public.app_config (chave, valor) VALUES (
  'transcritor_glossario',
  '["CTR","CPC","CPM","CPA","CAC","ROAS","ROI","LTV","ticket médio","Meta Ads","Google Ads","TikTok Ads","Facebook Ads","Instagram","Reels","Stories","feed","lookalike","remarketing","retargeting","pixel","API de conversões","UTM","lead","leads","landing page","LP","copy","copywriting","headline","hook","CTA","call to action","criativo","criativos","funil","topo de funil","fundo de funil","tráfego pago","orgânico","público","segmentação","campanha","conjunto de anúncios","Advantage+","CBO","ABO","escala","budget","branding","performance","KPI","dashboard","CRM","SaaS","B2B","B2C","upsell","downsell","order bump","checkout","gateway","webinar","lançamento","perpétuo","VSL","UGC","influencer","engajamento","alcance","impressões","conversão","taxa de conversão","A/B test","insight","briefing","deadline","feedback","follow-up","onboarding","Growth","Hotmart","Kiwify","WhatsApp","Google Analytics","GA4","Tag Manager","SEO","SEM","IA","ChatGPT","Claude","prompt"]'::jsonb
) ON CONFLICT (chave) DO NOTHING;
