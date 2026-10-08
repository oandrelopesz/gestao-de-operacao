-- Transcritor: termos corrigidos + player com marcas de tempo. Três blocos, todos idempotentes:
-- 1) transcricoes.marcas (palavras com tempo) e tabela transcritor_termos (memória das trocas de/para) + RPC registrar_termos;
-- 2) glossário ampliado: acrescenta ao FIM de app_config.transcritor_glossario só os termos que ainda não estão lá.
ALTER TABLE public.transcricoes ADD COLUMN IF NOT EXISTS marcas jsonb;

CREATE TABLE IF NOT EXISTS public.transcritor_termos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT UNIQUE NOT NULL,
  de TEXT NOT NULL,
  para TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('manual', 'ia')),
  vezes INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transcritor_termos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transcritor_termos_all ON public.transcritor_termos;
CREATE POLICY transcritor_termos_all ON public.transcritor_termos FOR ALL USING (true) WITH CHECK (true);

-- itens: [{chave, de, para, origem}]. Repetido soma "vezes"; de/para/origem só trocam se o novo é manual ou o antigo veio da IA.
CREATE OR REPLACE FUNCTION public.registrar_termos(itens jsonb)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.transcritor_termos (chave, de, para, origem)
  SELECT DISTINCT ON (x.chave) x.chave, x.de, x.para, x.origem
  FROM jsonb_to_recordset(itens) AS x(chave text, de text, para text, origem text)
  ORDER BY x.chave, (x.origem = 'manual') DESC
  ON CONFLICT (chave) DO UPDATE SET
    vezes = transcritor_termos.vezes + 1,
    updated_at = now(),
    de = CASE WHEN EXCLUDED.origem = 'manual' OR transcritor_termos.origem = 'ia' THEN EXCLUDED.de ELSE transcritor_termos.de END,
    para = CASE WHEN EXCLUDED.origem = 'manual' OR transcritor_termos.origem = 'ia' THEN EXCLUDED.para ELSE transcritor_termos.para END,
    origem = CASE WHEN EXCLUDED.origem = 'manual' OR transcritor_termos.origem = 'ia' THEN EXCLUDED.origem ELSE transcritor_termos.origem END
$$;
GRANT EXECUTE ON FUNCTION public.registrar_termos(jsonb) TO anon, authenticated;

UPDATE public.app_config SET valor = valor || COALESCE((
  SELECT jsonb_agg(n.t ORDER BY n.i)
  FROM jsonb_array_elements_text('["LLM","GPT","Gemini","Copilot","Perplexity","Midjourney","agente","agentes","RAG","fine-tuning","embeddings","token","tokens","API","n8n","Make","Zapier","automação","chatbot","machine learning","OpenAI","Anthropic","MCP","Claude Code","Cursor","Lovable","Supabase","Vercel","GitHub","Obsidian","Pinecone","Whisper","Groq","Llama","DeepSeek","Grok","Sora","Veo","ElevenLabs","HeyGen","Canva","CapCut","Notion","Slack","Airtable","vibe coding","IA generativa","inteligência artificial","deep learning","dataset","workflow","webhook","JSON","CPL","CPV","CPMQL","MQL","SQL","Meta Business Suite","Business Manager","Gerenciador de Anúncios","Pixel da Meta","Google Tag Manager","GMN","Google Meu Negócio","Performance Max","PMax","YouTube Ads","LinkedIn Ads","Pinterest","Kwai","Shopee","Mercado Livre","Amazon","Search Console","Clarity","AEO","GEO","persona","ICP","PUV","swipe file","storytelling","social media","inbound","outbound","cold call","cold mail","SDR","BDR","closer","social selling","cadência","pipeline","forecast","Google Shopping","Display","Discovery","Demand Gen","Smart Bidding","lance","lance manual","palavra-chave","palavras-chave","palavra-chave negativa","índice de qualidade","CTR orgânico","qualificação","lead qualificado","lead score","nutrição de leads","e-mail marketing","newsletter","disparo","automação de marketing","RD Station","HubSpot","ActiveCampaign","Pipedrive","Kommo","ManyChat","Typebot","Evolution API","Meta Pixel","CAPI","Conversions API","evento","públicos personalizados","público semelhante","frequência","CPC link","hook rate","hold rate","thumbstop","thumb stop","criativo vencedor","fadiga de criativo","teste A/B","teste multivariado","taxa de rejeição","taxa de clique","taxa de abertura","tempo de carregamento","Core Web Vitals","tráfego direto","tráfego orgânico","mídia paga","mídia orgânica","anúncio","anúncios","gestor de tráfego","MVP","PMF","product market fit","churn","MRR","ARR","ticket","recorrência","high ticket","low ticket","mentoria","infoproduto","comunidade","assinatura","startup","pitch","valuation","equity","sócio","pró-labore","CNPJ","CPF","MEI","Simples Nacional","Lucro Presumido","Lucro Real","holding","franquia","white label","dropshipping","marketplace","e-commerce","afiliado","coprodutor","produtor","oferta","garantia","escassez","urgência","prova social","depoimento","case de sucesso","quebra de objeção","objeção","fechamento","proposta","contrato","escopo","retainer","fee","comissão","meta de vendas","taxa de fechamento","ciclo de vendas","ROAS mínimo","EBITDA","DRE","fluxo de caixa","capital de giro","margem de contribuição","margem líquida","markup","break-even","ponto de equilíbrio","payback","CDI","Selic","IPCA","CDB","LCI","LCA","Tesouro Direto","FII","ETF","IOF","IR","PIX","boleto","NF-e","NFS-e","CAPEX","OPEX","ROE","ROIC","juros compostos","juros simples","inflação","dólar","cotação","câmbio","IOF do cartão","imposto","tributo","ISS","ICMS","DAS","DARF","Stripe","PayPal","Mercado Pago","Asaas","Pagar.me","Nubank","Inter","Itaú","Bradesco","Santander","B3","bolsa","ações","renda fixa","renda variável","OKR","SLA","SOP","POP","CEO","CMO","CFO","COO","CTO","PJ","CLT","RH","TI","UX","UI","LGPD","PDF","CSV","URL","DNS","HTML","CSS","JavaScript","TypeScript","Python","PaaS","VPS","Docker","Linux","SSL","HTTPS","Cloudflare","Google Drive","Google Sheets","Google Docs","Gmail","Google Calendar","Google Meet","Zoom","Fireflies","Looker Studio","Excel","PowerPoint","Figma","Photoshop","Premiere","DaVinci Resolve","LinkedIn","TikTok","YouTube","Shorts","Threads","Telegram","Discord","Twitch","Spotify","podcast","live","lives","bastidores","carrossel","post","thumbnail","legenda","hashtag","trend","viral","algoritmo","bio","link na bio","DM","direct","story","reels"]'::jsonb)
       WITH ORDINALITY AS n(t, i)
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(app_config.valor) e WHERE e = n.t)
), '[]'::jsonb)
WHERE chave = 'transcritor_glossario' AND jsonb_typeof(valor) = 'array';
