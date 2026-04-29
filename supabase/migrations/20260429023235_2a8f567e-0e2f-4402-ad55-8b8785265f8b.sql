-- Adicionar campos de recorrência à tabela demandas
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS recorrente boolean DEFAULT false;
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS frequencia_tipo text; -- 'diaria', 'semanal', 'quinzenal', 'mensal', 'customizada'
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS frequencia_dias_semana text[];
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS frequencia_dia_mes integer;
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS frequencia_intervalo_dias integer;
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS ultima_execucao date;
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS proxima_execucao date;
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS recorrente_pai_id uuid REFERENCES public.demandas(id) ON DELETE CASCADE;

-- Criar tabela de histórico de execuções
CREATE TABLE IF NOT EXISTS public.demanda_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demanda_id uuid NOT NULL REFERENCES public.demandas(id) ON DELETE CASCADE,
  data_execucao date NOT NULL DEFAULT CURRENT_DATE,
  concluida boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Ativar RLS para demanda_execucoes
ALTER TABLE public.demanda_execucoes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para demanda_execucoes
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'exec_select_own') THEN
        CREATE POLICY "exec_select_own" ON public.demanda_execucoes FOR SELECT USING (
          EXISTS (SELECT 1 FROM public.demandas d WHERE d.id = demanda_id AND d.user_id = auth.uid())
        );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'exec_insert_own') THEN
        CREATE POLICY "exec_insert_own" ON public.demanda_execucoes FOR INSERT WITH CHECK (
          EXISTS (SELECT 1 FROM public.demandas d WHERE d.id = demanda_id AND d.user_id = auth.uid())
        );
    END IF;
END $$;

-- Adicionar campos de notificação matinal à tabela notificacoes_config
ALTER TABLE public.notificacoes_config 
  ADD COLUMN IF NOT EXISTS notificacao_matinal_ativa boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS horario_notificacao_matinal time DEFAULT '08:00';

-- Função para calcular próxima execução
CREATE OR REPLACE FUNCTION public.calcular_proxima_execucao(
  p_tipo text,
  p_dias_semana text[],
  p_dia_mes integer,
  p_intervalo_dias integer,
  p_ultima_execucao date,
  p_data_referencia date DEFAULT CURRENT_DATE
) RETURNS date AS $$
DECLARE
    v_proxima date;
    v_data_base date;
BEGIN
    v_data_base := COALESCE(p_ultima_execucao, p_data_referencia);
    
    IF p_tipo = 'diaria' THEN
        v_proxima := p_data_referencia + interval '1 day';
    
    ELSIF p_tipo = 'semanal' THEN
        -- Encontrar o próximo dia da semana disponível
        WITH dias AS (
            SELECT unnest(p_dias_semana)::int as d
        )
        SELECT (p_data_referencia + (n || ' days')::interval)::date INTO v_proxima
        FROM generate_series(1, 7) n
        WHERE extract(dow from (p_data_referencia + (n || ' days')::interval))::text IN (SELECT d::text FROM dias)
        LIMIT 1;
        
    ELSIF p_tipo = 'quinzenal' THEN
        v_proxima := v_data_base + interval '14 days';
        -- Se a próxima data ainda for no passado ou hoje, ajusta para o futuro relativo à referência
        WHILE v_proxima <= p_data_referencia LOOP
            v_proxima := v_proxima + interval '14 days';
        END LOOP;
        
    ELSIF p_tipo = 'mensal' THEN
        -- Tenta o dia p_dia_mes no mês atual
        v_proxima := date_trunc('month', p_data_referencia) + (p_dia_mes - 1) * interval '1 day';
        -- Se já passou ou é hoje, vai para o próximo mês
        IF v_proxima <= p_data_referencia THEN
            v_proxima := date_trunc('month', p_data_referencia + interval '1 month') + (p_dia_mes - 1) * interval '1 day';
        END IF;
        
    ELSIF p_tipo = 'customizada' THEN
        v_proxima := v_data_base + (COALESCE(p_intervalo_dias, 1) || ' days')::interval;
        WHILE v_proxima <= p_data_referencia LOOP
            v_proxima := v_proxima + (COALESCE(p_intervalo_dias, 1) || ' days')::interval;
        END LOOP;
    ELSE
        v_proxima := NULL;
    END IF;
    
    RETURN v_proxima;
END;
$$ LANGUAGE plpgsql;
