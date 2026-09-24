-- Dashboard: log de demandas concluídas (entrou em Feito) por cliente/Pessoal; roadmaps pessoais.
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS pessoal BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.demanda_conclusoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demanda_id UUID UNIQUE REFERENCES public.demandas(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  pessoal BOOLEAN NOT NULL DEFAULT false,
  titulo TEXT,
  concluida_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demanda_conclusoes_data_idx ON public.demanda_conclusoes(concluida_em);
ALTER TABLE public.demanda_conclusoes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'demanda_conclusoes' AND policyname = 'demanda_conclusoes_all') THEN
    CREATE POLICY "demanda_conclusoes_all" ON public.demanda_conclusoes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'demanda_conclusoes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.demanda_conclusoes;
  END IF;
END $$;

-- Entrou em Feito → registra; saiu de Feito → apaga o registro; cliente/Pessoal/título mudam → acompanha.
-- Excluir a demanda (ou "Zerar" a coluna) NÃO apaga o registro: o FK vira NULL e a contagem fica.
CREATE OR REPLACE FUNCTION public.demandas_registra_conclusao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'feito' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'feito') THEN
    INSERT INTO demanda_conclusoes (demanda_id, cliente_id, pessoal, titulo, concluida_em)
    VALUES (NEW.id, NEW.cliente_id, NEW.pessoal, NEW.titulo, now())
    ON CONFLICT (demanda_id) DO UPDATE SET cliente_id = EXCLUDED.cliente_id, pessoal = EXCLUDED.pessoal,
      titulo = EXCLUDED.titulo, concluida_em = now();
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'feito' AND NEW.status IS DISTINCT FROM 'feito' THEN
    DELETE FROM demanda_conclusoes WHERE demanda_id = NEW.id;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'feito'
        AND (NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.pessoal IS DISTINCT FROM OLD.pessoal OR NEW.titulo IS DISTINCT FROM OLD.titulo) THEN
    UPDATE demanda_conclusoes SET cliente_id = NEW.cliente_id, pessoal = NEW.pessoal, titulo = NEW.titulo WHERE demanda_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_40_conclusao ON public.demandas;
CREATE TRIGGER demandas_40_conclusao AFTER INSERT OR UPDATE OF status, cliente_id, pessoal, titulo ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_registra_conclusao();

-- Pessoal e cliente são exclusivos
CREATE OR REPLACE FUNCTION public.demandas_pessoal_exclusivo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pessoal AND NEW.cliente_id IS NOT NULL THEN
    IF TG_OP = 'UPDATE' AND NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN NEW.pessoal := false;
    ELSE NEW.cliente_id := NULL; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demandas_05_pessoal ON public.demandas;
CREATE TRIGGER demandas_05_pessoal BEFORE INSERT OR UPDATE OF cliente_id, pessoal ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_pessoal_exclusivo();

-- Roadmaps pessoais (sem cliente)
ALTER TABLE public.processos ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE public.processos ADD COLUMN IF NOT EXISTS pessoal BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'processos_cliente_ou_pessoal') THEN
    ALTER TABLE public.processos ADD CONSTRAINT processos_cliente_ou_pessoal
      CHECK (tipo = 'roadmap' OR cliente_id IS NOT NULL);
  END IF;
END $$;
