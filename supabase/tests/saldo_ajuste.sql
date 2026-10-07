-- Teste do ajuste de saldo (20261007150000_saldo_ajuste.sql). Rodar no editor SQL do Lovable:
-- o bloco termina com RAISE EXCEPTION, então tudo é desfeito; o resultado vem no erro
-- ("RESULTADO 1:true ... 7:true"). Usa contas reais só como suporte: troque os ids se elas ganharem recargas.

DO $t$
DECLARE
    g UUID := '1c7153b9-fcdc-4833-a695-652ae6e502e8'; -- Dr Giovanni, Google (40/dia)
    m UUID := '346fa2d3-afa0-4ccd-be29-3b92261ae1c9'; -- Unieuro, ChatGPT Ads (91,46/dia), sem recarga
    res TEXT := '';
    v RECORD;
    msg TEXT;
BEGIN
    -- 1) recarga 1000 há 5 dias, 100/dia: sobra 500
    INSERT INTO public.recargas (saldo_ads_id, data_recarga, valor) VALUES (g, CURRENT_DATE - 5, 1000);
    res := res || '1:' || (public.calcular_saldo_atual(g, 100) = 500) || ' ';
    -- 2) ajuste para 300 há 2 dias: hoje 300 - 200 = 100
    INSERT INTO public.recargas (saldo_ads_id, data_recarga, valor, ajuste) VALUES (g, CURRENT_DATE - 2, 300, true);
    res := res || '2:' || (public.calcular_saldo_atual(g, 100) = 100) || ' ';
    -- 3) recarga de 50 ontem soma em cima do ajuste: 300 - 100 + 50 - 100 = 150
    INSERT INTO public.recargas (saldo_ads_id, data_recarga, valor) VALUES (g, CURRENT_DATE - 1, 50);
    res := res || '3:' || (public.calcular_saldo_atual(g, 100) = 150) || ' ';
    -- 4) view: total investido sem o ajuste (1050), 3 lançamentos, último não é ajuste
    SELECT * INTO v FROM public.saldo_ads_view WHERE id = g;
    res := res || '4:' || (v.saldo_total_acumulado = 1050 AND v.qtd_recargas = 3 AND v.ultimo_ajuste = false) || ' ';
    -- 5) ajuste para 0 hoje: zerado, último é ajuste
    INSERT INTO public.recargas (saldo_ads_id, data_recarga, valor, ajuste) VALUES (g, CURRENT_DATE, 0, true);
    SELECT * INTO v FROM public.saldo_ads_view WHERE id = g;
    res := res || '5:' || (v.saldo_atual_estimado = 0 AND v.status_alerta = 'zerado' AND v.ultimo_ajuste = true) || ' ';
    -- 6) conta só com ajuste (sem recarga nenhuma) é monitorada: ChatGPT Ads 182,92 hoje, 91,46/dia = 2 dias, alerta
    INSERT INTO public.recargas (saldo_ads_id, data_recarga, valor, ajuste) VALUES (m, CURRENT_DATE, 182.92, true);
    SELECT * INTO v FROM public.saldo_ads_view WHERE id = m;
    res := res || '6:' || (v.saldo_atual_estimado = 182.92 AND v.dias_restantes = 2 AND v.status_alerta = 'alerta' AND v.saldo_total_acumulado = 0) || ' ';
    -- 7) mensagem do WhatsApp diz "Saldo ajustado" e não "Última recarga"
    SELECT p.mensagem INTO msg FROM public.alertas_saldo_pendentes() p WHERE p.saldo_ads_id = m;
    res := res || '7:' || (msg LIKE '%Saldo ajustado em%' AND msg NOT LIKE '%Última recarga%') || ' ';
    RAISE EXCEPTION 'RESULTADO % || MENSAGEM: %', res, msg;
END $t$;
