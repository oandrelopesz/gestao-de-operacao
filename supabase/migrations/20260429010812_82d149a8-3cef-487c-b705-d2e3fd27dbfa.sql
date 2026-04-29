-- Drop existing table and related views if they exist
DROP VIEW IF EXISTS public.clientes_view;
DROP TABLE IF EXISTS public.saldo;

-- Create platform enum
DO $$ BEGIN
    CREATE TYPE public.plataforma_enum AS ENUM ('meta', 'google', 'tiktok', 'outras');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create payment method enum
DO $$ BEGIN
    CREATE TYPE public.metodo_pagamento_enum AS ENUM ('dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'boleto', 'outros');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create ads balance table
CREATE TABLE public.saldo_ads (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    plataforma public.plataforma_enum NOT NULL,
    metodo_pagamento public.metodo_pagamento_enum NOT NULL DEFAULT 'outros',
    verba_diaria NUMERIC(15,2),
    ativo BOOLEAN NOT NULL DEFAULT true,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create reloads table
CREATE TABLE public.recargas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    saldo_ads_id UUID NOT NULL REFERENCES public.saldo_ads(id) ON DELETE CASCADE,
    data_recarga DATE NOT NULL DEFAULT CURRENT_DATE,
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    metodo_pagamento public.metodo_pagamento_enum,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create notifications config table
CREATE TABLE public.notificacoes_config (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    telegram_bot_token TEXT,
    telegram_chat_id TEXT,
    alerta_dias_antes INT NOT NULL DEFAULT 4,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saldo_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes_config ENABLE ROW LEVEL SECURITY;

-- Policies for saldo_ads
CREATE POLICY "Users can manage their own saldo_ads" ON public.saldo_ads
    FOR ALL USING (auth.uid() = user_id);

-- Policies for recargas (via saldo_ads owner)
CREATE POLICY "Users can manage their own recargas" ON public.recargas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.saldo_ads
            WHERE saldo_ads.id = recargas.saldo_ads_id
            AND saldo_ads.user_id = auth.uid()
        )
    );

-- Policies for notificacoes_config
CREATE POLICY "Users can manage their own notifications config" ON public.notificacoes_config
    FOR ALL USING (auth.uid() = user_id);

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for saldo_ads
CREATE TRIGGER update_saldo_ads_updated_at
BEFORE UPDATE ON public.saldo_ads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for notificacoes_config
CREATE TRIGGER update_notificacoes_config_updated_at
BEFORE UPDATE ON public.notificacoes_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create view for real-time calculations
CREATE OR REPLACE VIEW public.saldo_ads_view AS
WITH first_recargas AS (
    SELECT 
        saldo_ads_id,
        MIN(data_recarga) as data_inicio
    FROM public.recargas
    GROUP BY saldo_ads_id
),
totals AS (
    SELECT 
        saldo_ads_id,
        SUM(valor) as total_recarregado
    FROM public.recargas
    GROUP BY saldo_ads_id
)
SELECT 
    s.*,
    c.nome as cliente_nome,
    c.agencia as cliente_agencia,
    COALESCE(s.verba_diaria, c.verba_ads / 30.0) as verba_diaria_calc,
    COALESCE(t.total_recarregado, 0) as total_recarregado,
    fr.data_inicio as data_primeira_recarga,
    CASE 
        WHEN fr.data_inicio IS NULL THEN 0
        ELSE (CURRENT_DATE - fr.data_inicio)::int
    END as dias_decorridos,
    CASE 
        WHEN fr.data_inicio IS NULL THEN 0
        ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
    END as consumo_acumulado_estimado,
    GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
        WHEN fr.data_inicio IS NULL THEN 0
        ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
    END) as saldo_atual,
    CASE 
        WHEN COALESCE(s.verba_diaria, c.verba_ads / 30.0) > 0 THEN
            (GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
                WHEN fr.data_inicio IS NULL THEN 0
                ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
            END) / COALESCE(s.verba_diaria, c.verba_ads / 30.0))
        ELSE 0
    END as dias_restantes,
    CASE 
        WHEN COALESCE(s.verba_diaria, c.verba_ads / 30.0) > 0 THEN
            CURRENT_DATE + (GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
                WHEN fr.data_inicio IS NULL THEN 0
                ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
            END) / COALESCE(s.verba_diaria, c.verba_ads / 30.0))::int
        ELSE CURRENT_DATE
    END as data_prevista_fim,
    CASE
        WHEN GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
            WHEN fr.data_inicio IS NULL THEN 0
            ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
        END) <= 0 THEN 'zerado'
        WHEN (CASE 
            WHEN COALESCE(s.verba_diaria, c.verba_ads / 30.0) > 0 THEN
                (GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
                    WHEN fr.data_inicio IS NULL THEN 0
                    ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
                END) / COALESCE(s.verba_diaria, c.verba_ads / 30.0))
            ELSE 0
        END) <= 1 THEN 'critico'
        WHEN (CASE 
            WHEN COALESCE(s.verba_diaria, c.verba_ads / 30.0) > 0 THEN
                (GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
                    WHEN fr.data_inicio IS NULL THEN 0
                    ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
                END) / COALESCE(s.verba_diaria, c.verba_ads / 30.0))
            ELSE 0
        END) <= 2 THEN 'alerta'
        WHEN (CASE 
            WHEN COALESCE(s.verba_diaria, c.verba_ads / 30.0) > 0 THEN
                (GREATEST(0, COALESCE(t.total_recarregado, 0) - CASE 
                    WHEN fr.data_inicio IS NULL THEN 0
                    ELSE GREATEST(0, (COALESCE(s.verba_diaria, c.verba_ads / 30.0) * (CURRENT_DATE - fr.data_inicio + 1)))
                END) / COALESCE(s.verba_diaria, c.verba_ads / 30.0))
            ELSE 0
        END) <= 4 THEN 'alerta'
        ELSE 'ok'
    END as status_alerta
FROM public.saldo_ads s
JOIN public.clientes c ON s.cliente_id = c.id
LEFT JOIN first_recargas fr ON s.id = fr.saldo_ads_id
LEFT JOIN totals t ON s.id = t.saldo_ads_id;

-- Recreate clientes_view (standard requirement since I dropped it)
CREATE OR REPLACE VIEW public.clientes_view AS
SELECT 
    c.*,
    (SELECT COUNT(*) FROM public.demandas d WHERE d.cliente_id = c.id AND d.status != 'feito') as demandas_ativas,
    (SELECT n.data_avaliacao FROM public.nps_avaliacoes n WHERE n.cliente_id = c.id ORDER BY n.data_avaliacao DESC LIMIT 1) as ultima_nps_data,
    (SELECT n.score_total FROM public.nps_avaliacoes n WHERE n.cliente_id = c.id ORDER BY n.data_avaliacao DESC LIMIT 1) as ultima_nps_score,
    (SELECT public.get_nps_categoria(n.score_total) FROM public.nps_avaliacoes n WHERE n.cliente_id = c.id ORDER BY n.data_avaliacao DESC LIMIT 1) as nps_status
FROM public.clientes c;
