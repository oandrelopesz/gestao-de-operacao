-- Operações por cliente: o mesmo cliente pode ter várias operações com objetivos diferentes
-- (ex.: canal no YouTube e e-commerce), cada uma com sua moeda, tipo de verba, período e plataformas.
-- Cada plataforma de cada operação continua sendo um registro em saldo_ads (agora com operacao_id).
-- A verba em moeda estrangeira é convertida para BRL pela cotação mais recente da tabela cotacoes
-- (alimentada pelo app com a cotação do dia) para os totais e médias por cliente.

-- 1) Tabelas ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL DEFAULT 'Principal',
    objetivo TEXT,
    ordem INTEGER NOT NULL DEFAULT 0,
    ativa BOOLEAN NOT NULL DEFAULT true,
    tipo_verba public.tipo_verba_enum NOT NULL DEFAULT 'mensal',
    moeda TEXT NOT NULL DEFAULT 'BRL' CHECK (moeda IN ('BRL', 'USD', 'EUR', 'GBP')),
    verba_ads NUMERIC NOT NULL DEFAULT 0,
    verba_total_contratada NUMERIC,
    data_inicio_verba DATE,
    data_limite_verba DATE,
    plataformas_config JSONB,
    verba_diaria_manual NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operacoes_cliente_idx ON public.operacoes(cliente_id);
COMMENT ON TABLE public.operacoes IS 'Operações de mídia de um cliente (objetivos diferentes, moeda e verba próprias)';
COMMENT ON COLUMN public.operacoes.verba_ads IS 'Soma das verbas mensais das plataformas, na moeda da operação (tipo mensal)';
COMMENT ON COLUMN public.operacoes.verba_total_contratada IS 'Soma das verbas totais das plataformas, na moeda da operação (tipo total_periodo)';
COMMENT ON COLUMN public.operacoes.data_inicio_verba IS 'Início do período contratado (tipo total_periodo)';
COMMENT ON COLUMN public.operacoes.plataformas_config IS 'Por plataforma: {"Meta": {"verba": 3000, "metodo_pagamento": "pix"}}';

CREATE TABLE IF NOT EXISTS public.cotacoes (
    moeda TEXT NOT NULL CHECK (moeda IN ('USD', 'EUR', 'GBP')),
    data DATE NOT NULL,
    valor NUMERIC NOT NULL CHECK (valor > 0),
    fonte TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (moeda, data)
);
COMMENT ON TABLE public.cotacoes IS 'Cotação do dia: quantos BRL vale 1 unidade da moeda';

ALTER TABLE public.saldo_ads ADD COLUMN IF NOT EXISTS operacao_id UUID REFERENCES public.operacoes(id) ON DELETE CASCADE;

-- Alavanca de tráfego: cliente pode entrar sem investir em ads; desligada, as operações não entram
-- nas somas e o saldo fica como pausado. Ligar de novo volta tudo a contar.
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS trafego_ativo BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN public.clientes.trafego_ativo IS 'false = cliente ainda não investe em ads (verba não entra nos totais, saldo pausado)';
CREATE INDEX IF NOT EXISTS saldo_ads_operacao_idx ON public.saldo_ads(operacao_id);

-- RLS no mesmo modelo das outras tabelas (app sem login real, chave pública)
ALTER TABLE public.operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacoes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'operacoes_all' AND tablename = 'operacoes') THEN
        CREATE POLICY "operacoes_all" ON public.operacoes FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cotacoes_all' AND tablename = 'cotacoes') THEN
        CREATE POLICY "cotacoes_all" ON public.cotacoes FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_operacoes_updated_at') THEN
        CREATE TRIGGER set_operacoes_updated_at BEFORE UPDATE ON public.operacoes
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- 2) Backfill: cada cliente existente ganha uma operação "Principal" com o que estava no cadastro,
--    e os registros de saldo_ads dele passam a apontar para ela.
INSERT INTO public.operacoes (cliente_id, nome, tipo_verba, moeda, verba_ads, verba_total_contratada, data_inicio_verba, data_limite_verba, plataformas_config, verba_diaria_manual)
SELECT c.id, 'Principal', COALESCE(c.tipo_verba, 'mensal'), 'BRL',
       COALESCE(c.verba_ads, 0), c.verba_total_contratada,
       CASE WHEN c.tipo_verba = 'total_periodo' THEN c.data_inicio END,
       c.data_limite_verba, c.plataformas_config, c.verba_diaria_manual
FROM public.clientes c
WHERE NOT EXISTS (SELECT 1 FROM public.operacoes o WHERE o.cliente_id = c.id);

UPDATE public.saldo_ads s
SET operacao_id = o.id
FROM public.operacoes o
WHERE o.cliente_id = s.cliente_id AND s.operacao_id IS NULL;

-- 3) Funções auxiliares ------------------------------------------------------------------------
-- Cotação mais recente (BRL por 1 unidade); BRL = 1 e, sem cotação cadastrada, também 1
CREATE OR REPLACE FUNCTION public.cotacao_brl(p_moeda TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN p_moeda IS NULL OR p_moeda = 'BRL' THEN 1::numeric
        ELSE COALESCE((SELECT valor FROM public.cotacoes WHERE moeda = p_moeda ORDER BY data DESC LIMIT 1), 1::numeric)
    END;
$$;

-- Verba mensal equivalente de uma operação, na moeda dela
-- (mensal = verba_ads; total do período = total ÷ dias × 30, mesmo cálculo da aba Clientes)
CREATE OR REPLACE FUNCTION public.operacao_verba_mensal(o public.operacoes)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN o.tipo_verba = 'total_periodo' THEN
            CASE
                WHEN o.verba_total_contratada IS NOT NULL AND o.data_inicio_verba IS NOT NULL AND o.data_limite_verba IS NOT NULL
                THEN round(o.verba_total_contratada / GREATEST(1, o.data_limite_verba - o.data_inicio_verba) * 30, 2)
                ELSE NULL
            END
        ELSE COALESCE(o.verba_ads, 0)
    END;
$$;

-- 4) saldo_ads_view: passa a expor a operação e a moeda; o fallback de verba diária usa o período da operação
DROP VIEW IF EXISTS public.saldo_ads_view;

CREATE VIEW public.saldo_ads_view
WITH (security_invoker = true) AS
WITH base AS (
    SELECT
        s.id,
        s.user_id,
        s.cliente_id,
        c.nome AS cliente_nome,
        c.agencia AS cliente_agencia,
        c.status_operacional AS cliente_status_operacional,
        c.trafego_ativo AS cliente_trafego_ativo,
        s.metodo_pagamento,
        s.plataformas,
        s.verba_diaria,
        s.ativo,
        s.observacoes,
        s.created_at,
        s.updated_at,
        s.alerta_dispensado_em,
        s.operacao_id,
        o.nome AS operacao_nome,
        o.ordem AS operacao_ordem,
        COALESCE(o.moeda, 'BRL') AS moeda,
        public.cotacao_brl(COALESCE(o.moeda, 'BRL')) AS cotacao_brl,
        CASE
            WHEN s.verba_diaria IS NOT NULL THEN s.verba_diaria
            WHEN o.id IS NOT NULL AND o.tipo_verba = 'total_periodo'
                AND o.verba_total_contratada IS NOT NULL
                AND o.data_inicio_verba IS NOT NULL
                AND o.data_limite_verba IS NOT NULL
            THEN round(o.verba_total_contratada / GREATEST(1, o.data_limite_verba - o.data_inicio_verba), 2)
            WHEN o.id IS NULL AND c.tipo_verba = 'total_periodo'::tipo_verba_enum
                AND c.verba_total_contratada IS NOT NULL
                AND c.data_inicio IS NOT NULL
                AND c.data_limite_verba IS NOT NULL
            THEN round((c.verba_total_contratada / NULLIF(EXTRACT(day FROM (c.data_limite_verba::timestamp - c.data_inicio::timestamp)), 0))::numeric, 2)
            ELSE NULL
        END AS verba_diaria_calc,
        COALESCE((SELECT sum(r.valor) FROM public.recargas r WHERE r.saldo_ads_id = s.id), 0) AS saldo_total_acumulado,
        (SELECT count(*) FROM public.recargas r WHERE r.saldo_ads_id = s.id) AS qtd_recargas,
        (SELECT max(r.data_recarga) FROM public.recargas r WHERE r.saldo_ads_id = s.id) AS data_ultima_recarga,
        (SELECT r.valor FROM public.recargas r WHERE r.saldo_ads_id = s.id ORDER BY r.data_recarga DESC, r.created_at DESC LIMIT 1) AS valor_ultima_recarga
    FROM public.saldo_ads s
    JOIN public.clientes c ON s.cliente_id = c.id
    LEFT JOIN public.operacoes o ON o.id = s.operacao_id
    WHERE c.arquivado = false
),
calc AS (
    SELECT
        b.*,
        public.calcular_saldo_atual(b.id, b.verba_diaria_calc) AS saldo_atual_estimado
    FROM base b
),
calc2 AS (
    SELECT
        c.*,
        CASE
            WHEN c.verba_diaria_calc > 0 AND c.qtd_recargas > 0
            THEN c.saldo_atual_estimado / c.verba_diaria_calc
            ELSE NULL
        END AS dias_restantes,
        -- Alerta dispensado só vale até a próxima recarga
        (c.alerta_dispensado_em IS NOT NULL
            AND (c.data_ultima_recarga IS NULL OR c.alerta_dispensado_em::date >= c.data_ultima_recarga)) AS alerta_dispensado
    FROM calc c
)
SELECT
    c2.*,
    CASE
        WHEN c2.dias_restantes IS NULL THEN NULL
        ELSE (CURRENT_DATE + floor(c2.dias_restantes)::int)
    END AS data_prevista_fim,
    CASE
        WHEN c2.cliente_status_operacional IN ('pausado', 'churn') OR c2.cliente_trafego_ativo = false THEN 'pausado'
        WHEN c2.metodo_pagamento = 'cartao'::metodo_pagamento_simplificado THEN 'cartao'
        WHEN c2.ativo = false THEN 'inativo'
        WHEN c2.qtd_recargas = 0 THEN 'sem_recarga'
        WHEN c2.verba_diaria_calc IS NULL OR c2.verba_diaria_calc <= 0 THEN 'sem_verba'
        WHEN c2.saldo_atual_estimado <= 0 THEN 'zerado'
        WHEN c2.dias_restantes <= 1 THEN 'critico'
        WHEN c2.dias_restantes <= 3 THEN 'alerta'
        ELSE 'ok'
    END AS status_alerta
FROM calc2 c2;

-- 5) clientes_view: mesmas colunas de antes + verba mensal em BRL somando as operações ativas
--    e um resumo JSON das operações para os cards. (OR REPLACE: colunas novas só no fim.)
CREATE OR REPLACE VIEW public.clientes_view AS
 SELECT c.id,
    c.nome,
    c.agencia,
    c.nicho,
    c.data_inicio,
    c.verba_ads,
    c.observacoes,
    c.arquivado,
    c.em_onboarding,
    c.status_operacional,
    c.tipo_verba,
    c.verba_total_contratada,
    c.data_limite_verba,
    ( SELECT n.score_total
           FROM nps_avaliacoes n
          WHERE (n.cliente_id = c.id)
          ORDER BY n.data_avaliacao DESC, n.created_at DESC
         LIMIT 1) AS ultima_nps_score,
    ( SELECT n.data_avaliacao
           FROM nps_avaliacoes n
          WHERE (n.cliente_id = c.id)
          ORDER BY n.data_avaliacao DESC, n.created_at DESC
         LIMIT 1) AS ultima_nps_data,
    COALESCE(( SELECT
                CASE
                    WHEN (n.score_total >= (45)::numeric) THEN 'ancora'::text
                    WHEN (n.score_total >= (35)::numeric) THEN 'saudavel'::text
                    WHEN (n.score_total >= (25)::numeric) THEN 'em_risco'::text
                    ELSE 'critico'::text
                END AS nps_status
           FROM nps_avaliacoes n
          WHERE (n.cliente_id = c.id)
          ORDER BY n.data_avaliacao DESC, n.created_at DESC
         LIMIT 1), 'sem_avaliacao'::text) AS nps_status,
    ( SELECT count(*) AS count
           FROM demandas d
          WHERE ((d.cliente_id = c.id) AND (d.status <> ALL (ARRAY['concluido'::text, 'cancelado'::text, 'feito'::text])))) AS demandas_ativas,
    'em_dia'::text AS status_pagamento_mes,
    CASE WHEN c.trafego_ativo THEN COALESCE(( SELECT sum(public.operacao_verba_mensal(o) * public.cotacao_brl(o.moeda))
           FROM operacoes o
          WHERE o.cliente_id = c.id AND o.ativa), 0) ELSE 0 END AS verba_mensal_brl,
    ( SELECT count(*) FROM operacoes o WHERE o.cliente_id = c.id AND o.ativa) AS qtd_operacoes,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object(
                'id', o.id,
                'nome', o.nome,
                'objetivo', o.objetivo,
                'moeda', o.moeda,
                'tipo_verba', o.tipo_verba,
                'verba_mensal', public.operacao_verba_mensal(o),
                'verba_mensal_brl', public.operacao_verba_mensal(o) * public.cotacao_brl(o.moeda),
                'verba_total_contratada', o.verba_total_contratada,
                'data_inicio_verba', o.data_inicio_verba,
                'data_limite_verba', o.data_limite_verba,
                'plataformas', COALESCE((SELECT jsonb_agg(k) FROM jsonb_object_keys(COALESCE(o.plataformas_config, '{}'::jsonb)) k), '[]'::jsonb)
            ) ORDER BY o.ordem, o.created_at)
           FROM operacoes o
          WHERE o.cliente_id = c.id AND o.ativa), '[]'::jsonb) AS operacoes,
    c.trafego_ativo
   FROM clientes c;
