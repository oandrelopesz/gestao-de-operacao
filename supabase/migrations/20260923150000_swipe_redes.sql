-- Swipe file: plataformas separando orgânico de biblioteca de anúncios (Meta Ads, TikTok Ads,
-- Google Ads) e novas redes (Threads, Kwai). Os ids batem com src/lib/swipeRedes.ts.
ALTER TABLE public.swipe_itens DROP CONSTRAINT IF EXISTS swipe_itens_rede_check;
ALTER TABLE public.swipe_itens ADD CONSTRAINT swipe_itens_rede_check CHECK (rede IN (
    'instagram', 'facebook', 'meta_ads', 'tiktok', 'tiktok_ads', 'youtube', 'google_ads',
    'linkedin', 'x', 'threads', 'kwai', 'pinterest', 'internet', 'outro'
));

-- Itens antigos da Biblioteca de Anúncios que estavam como "facebook" passam para "meta_ads"
UPDATE public.swipe_itens SET rede = 'meta_ads'
WHERE rede = 'facebook' AND link ILIKE '%facebook.com/ads/library%';
