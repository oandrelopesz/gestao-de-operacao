-- Aba Ideias: concluir ideias (botão no card) e conclusão automática quando a demanda criada a
-- partir da ideia vai para "Feito" no Kanban.
ALTER TABLE public.ideias ADD COLUMN IF NOT EXISTS concluida_em TIMESTAMPTZ;
ALTER TABLE public.ideias ADD COLUMN IF NOT EXISTS concluida_por TEXT;
ALTER TABLE public.ideias DROP CONSTRAINT IF EXISTS ideias_concluida_por_check;
ALTER TABLE public.ideias ADD CONSTRAINT ideias_concluida_por_check CHECK (concluida_por IN ('manual', 'demanda'));
COMMENT ON COLUMN public.ideias.concluida_em IS 'Quando a ideia foi concluída (null = aberta)';
COMMENT ON COLUMN public.ideias.concluida_por IS 'manual = botão na aba Ideias; demanda = a demanda ligada foi para Feito';

-- Demanda foi para "feito": conclui a ideia ligada. Saiu de "feito": reabre só se foi a demanda
-- que concluiu (conclusão manual fica como está).
CREATE OR REPLACE FUNCTION public.sync_ideia_da_demanda()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'feito' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'feito') THEN
        UPDATE public.ideias
        SET concluida_em = now(), concluida_por = 'demanda'
        WHERE demanda_id = NEW.id AND concluida_em IS NULL;
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'feito' AND NEW.status IS DISTINCT FROM 'feito' THEN
        UPDATE public.ideias
        SET concluida_em = NULL, concluida_por = NULL
        WHERE demanda_id = NEW.id AND concluida_por = 'demanda';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS demandas_sync_ideia ON public.demandas;
CREATE TRIGGER demandas_sync_ideia
AFTER INSERT OR UPDATE OF status ON public.demandas
FOR EACH ROW EXECUTE FUNCTION public.sync_ideia_da_demanda();

-- Ideias cujas demandas já estão em "feito"
UPDATE public.ideias i
SET concluida_em = COALESCE(d.updated_at, now()), concluida_por = 'demanda'
FROM public.demandas d
WHERE i.demanda_id = d.id AND d.status = 'feito' AND i.concluida_em IS NULL;
