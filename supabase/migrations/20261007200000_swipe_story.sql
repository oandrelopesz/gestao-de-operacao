-- Swipe file: tipo novo "Story" (pedido do André em 2026-10-07). "Vídeo orgânico" virou
-- "Vídeo orgânico/Reel" só no rótulo do app; o id video_organico continua o mesmo.
ALTER TABLE public.swipe_itens DROP CONSTRAINT IF EXISTS swipe_itens_categoria_check;
ALTER TABLE public.swipe_itens ADD CONSTRAINT swipe_itens_categoria_check
    CHECK (categoria IN ('oferta','video_organico','video_anuncio','anuncio_estatico','post_estatico','carrossel','landing_page','site','story'));
