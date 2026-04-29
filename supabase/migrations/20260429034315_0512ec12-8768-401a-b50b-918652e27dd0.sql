-- Enum de etapas do pipeline
DO $$ BEGIN
    CREATE TYPE public.prospeccao_etapa AS ENUM (
      'lead',
      'contato_feito',
      'reuniao_agendada',
      'proposta_enviada',
      'negociacao',
      'fechado',
      'perdido'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum de origem do lead
DO $$ BEGIN
    CREATE TYPE public.prospeccao_origem AS ENUM (
      'indicacao',
      'instagram',
      'anuncio',
      'evento',
      'inbound',
      'outbound',
      'parceiro',
      'outros'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tabela principal
CREATE TABLE IF NOT EXISTS public.prospeccao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  nicho text,
  agencia_destino text CHECK (agencia_destino IN ('effect', 'spike', 'alt', 'pessoais')),
  etapa public.prospeccao_etapa NOT NULL DEFAULT 'lead',
  origem public.prospeccao_origem,
  origem_detalhe text,
  valor_estimado numeric(12,2) DEFAULT 0,
  probabilidade integer CHECK (probabilidade >= 0 AND probabilidade <= 100),
  data_proximo_contato date,
  observacoes text,
  ordem integer DEFAULT 0,
  data_lead date DEFAULT CURRENT_DATE,
  data_fechamento date,
  data_perda date,
  motivo_perda text,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de interações (histórico de contatos)
CREATE TABLE IF NOT EXISTS public.prospeccao_interacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospeccao_id uuid NOT NULL REFERENCES public.prospeccao(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('mensagem', 'reuniao', 'proposta', 'follow_up', 'nota')),
  data_interacao timestamptz DEFAULT now(),
  descricao text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Adicionar campo na tabela demandas para vínculo
DO $$ BEGIN
    ALTER TABLE public.demandas ADD COLUMN prospeccao_id uuid REFERENCES public.prospeccao(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_prospeccao_user ON public.prospeccao(user_id);
CREATE INDEX IF NOT EXISTS idx_prospeccao_etapa ON public.prospeccao(etapa);
CREATE INDEX IF NOT EXISTS idx_prospeccao_interacoes ON public.prospeccao_interacoes(prospeccao_id);

-- RLS
ALTER TABLE public.prospeccao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccao_interacoes ENABLE ROW LEVEL SECURITY;

-- Policies for prospeccao
DO $$ BEGIN
    CREATE POLICY "prospeccao_select" ON public.prospeccao FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "prospeccao_insert" ON public.prospeccao FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "prospeccao_update" ON public.prospeccao FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "prospeccao_delete" ON public.prospeccao FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Policies for prospeccao_interacoes
DO $$ BEGIN
    CREATE POLICY "prospeccao_int_select" ON public.prospeccao_interacoes FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "prospeccao_int_insert" ON public.prospeccao_interacoes FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "prospeccao_int_update" ON public.prospeccao_interacoes FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "prospeccao_int_delete" ON public.prospeccao_interacoes FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;