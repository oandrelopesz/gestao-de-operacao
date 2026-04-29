-- 1. Remover view dependente
DROP VIEW IF EXISTS public.saldo_ads_view;

-- 2. Remover defaults que impedem alteração de tipo
ALTER TABLE public.saldo_ads ALTER COLUMN metodo_pagamento DROP DEFAULT;
ALTER TABLE public.recargas ALTER COLUMN metodo_pagamento DROP DEFAULT;

-- 3. Converter colunas para texto temporariamente
ALTER TABLE public.saldo_ads ALTER COLUMN metodo_pagamento TYPE text;
ALTER TABLE public.recargas ALTER COLUMN metodo_pagamento TYPE text;

-- 4. Atualizar os valores para os novos nomes simplificados
UPDATE public.saldo_ads SET metodo_pagamento = 'pix' WHERE metodo_pagamento IN ('dinheiro', 'outros', 'pix');
UPDATE public.saldo_ads SET metodo_pagamento = 'cartao' WHERE metodo_pagamento IN ('cartao_credito', 'cartao_debito');
UPDATE public.saldo_ads SET metodo_pagamento = 'boleto' WHERE metodo_pagamento = 'boleto';

UPDATE public.recargas SET metodo_pagamento = 'pix' WHERE metodo_pagamento IN ('dinheiro', 'outros', 'pix', NULL);
UPDATE public.recargas SET metodo_pagamento = 'cartao' WHERE metodo_pagamento IN ('cartao_credito', 'cartao_debito');
UPDATE public.recargas SET metodo_pagamento = 'boleto' WHERE metodo_pagamento = 'boleto';

-- 5. Criar novo enum e converter colunas de volta para enum
DROP TYPE IF EXISTS public.metodo_pagamento_simplificado CASCADE;
CREATE TYPE public.metodo_pagamento_simplificado AS ENUM ('cartao', 'pix', 'boleto');

ALTER TABLE public.saldo_ads 
  ALTER COLUMN metodo_pagamento TYPE public.metodo_pagamento_simplificado 
  USING (metodo_pagamento::public.metodo_pagamento_simplificado);

ALTER TABLE public.recargas 
  ALTER COLUMN metodo_pagamento TYPE public.metodo_pagamento_simplificado 
  USING (metodo_pagamento::public.metodo_pagamento_simplificado);

-- 6. Adicionar novo default se necessário (opcional, user pediu pix por default na migração)
ALTER TABLE public.saldo_ads ALTER COLUMN metodo_pagamento SET DEFAULT 'pix'::public.metodo_pagamento_simplificado;

-- 7. Alterar saldo_ads para suportar múltiplas plataformas
ALTER TABLE public.saldo_ads ADD COLUMN plataformas text[] NOT NULL DEFAULT '{}';

-- Migrar dados de plataforma para o novo array plataformas
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saldo_ads' AND column_name = 'plataforma') THEN
        UPDATE public.saldo_ads 
        SET plataformas = ARRAY[
          CASE 
            WHEN plataforma::text = 'meta' THEN 'Meta'
            WHEN plataforma::text = 'google' THEN 'Google'
            WHEN plataforma::text = 'tiktok' THEN 'TikTok'
            ELSE 'Outras'
          END
        ];
        ALTER TABLE public.saldo_ads DROP COLUMN plataforma;
    END IF;
END $$;

-- 8. Recriar a view saldo_ads_view
CREATE OR REPLACE VIEW public.saldo_ads_view AS
 WITH first_recargas AS (
         SELECT recargas.saldo_ads_id,
            min(recargas.data_recarga) AS data_inicio
           FROM recargas
          GROUP BY recargas.saldo_ads_id
        ), totals AS (
         SELECT recargas.saldo_ads_id,
            sum(recargas.valor) AS total_recarregado
           FROM recargas
          GROUP BY recargas.saldo_ads_id
        ), verba_base AS (
         SELECT s_1.id AS saldo_id,
            COALESCE(s_1.verba_diaria,
                CASE
                    WHEN ((c_1.tipo_verba = 'total_periodo'::tipo_verba_enum) AND (c_1.data_limite_verba IS NOT NULL) AND ((c_1.data_limite_verba - c_1.data_inicio) > 0)) THEN (c_1.verba_total_contratada / ((c_1.data_limite_verba - c_1.data_inicio))::numeric)
                    ELSE (c_1.verba_ads / 30.0)
                END) AS daily_budget
           FROM (saldo_ads s_1
             JOIN clientes c_1 ON ((s_1.cliente_id = c_1.id)))
        )
 SELECT s.id,
    s.user_id,
    s.cliente_id,
    s.plataformas,
    s.metodo_pagamento,
    s.verba_diaria,
    s.ativo,
    s.observacoes,
    s.created_at,
    s.updated_at,
    c.nome AS cliente_nome,
    c.agencia AS cliente_agencia,
    vb.daily_budget AS verba_diaria_calc,
    COALESCE(t.total_recarregado, (0)::numeric) AS total_recarregado,
    fr.data_inicio AS data_primeira_recarga,
        CASE
            WHEN (fr.data_inicio IS NULL) THEN 0
            ELSE (CURRENT_DATE - fr.data_inicio)
        END AS dias_decorridos,
        CASE
            WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
            ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
        END AS consumo_acumulado_estimado,
    GREATEST((0)::numeric, (COALESCE(t.total_recarregado, (0)::numeric) -
        CASE
            WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
            ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
        END)) AS saldo_atual,
        CASE
            WHEN (vb.daily_budget > (0)::numeric) THEN (GREATEST((0)::numeric, (COALESCE(t.total_recarregado, (0)::numeric) -
            CASE
                WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
                ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
            END)) / vb.daily_budget)
            ELSE (0)::numeric
        END AS dias_restantes,
        CASE
            WHEN (vb.daily_budget > (0)::numeric) THEN (CURRENT_DATE + ((GREATEST((0)::numeric, (COALESCE(t.total_recarregado, (0)::numeric) -
            CASE
                WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
                ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
            END)) / vb.daily_budget))::integer)
            ELSE CURRENT_DATE
        END AS data_prevista_fim,
        CASE
            WHEN (GREATEST((0)::numeric, (COALESCE(t.total_recarregado, (0)::numeric) -
            CASE
                WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
                ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
            END)) <= (0)::numeric) THEN 'zerado'::text
            WHEN ((GREATEST((0)::numeric, (COALESCE(t.total_recarregado, (0)::numeric) -
            CASE
                WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
                ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
            END)) / vb.daily_budget) <= (1)::numeric) THEN 'critico'::text
            WHEN ((GREATEST((0)::numeric, (COALESCE(t.total_recarregado, (0)::numeric) -
            CASE
                WHEN (fr.data_inicio IS NULL) THEN (0)::numeric
                ELSE GREATEST((0)::numeric, (vb.daily_budget * (((CURRENT_DATE - fr.data_inicio) + 1))::numeric))
            END)) / vb.daily_budget) <= (2)::numeric) THEN 'alerta'::text
            ELSE 'ok'::text
        END AS status_alerta
   FROM ((((clientes c
     JOIN saldo_ads s ON ((c.id = s.cliente_id)))
     JOIN verba_base vb ON ((s.id = vb.saldo_id)))
     LEFT JOIN first_recargas fr ON ((s.id = fr.saldo_ads_id)))
     LEFT JOIN totals t ON ((s.id = t.saldo_ads_id)));
