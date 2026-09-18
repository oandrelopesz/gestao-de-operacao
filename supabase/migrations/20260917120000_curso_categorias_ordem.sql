-- Categorias de cursos passam a ser livres e ordenáveis (gerenciadas no Admin).
-- Os "temas fixos" que o formulário tinha hardcoded viram categorias reais na tabela,
-- e os cursos que ainda usavam só o enum `tema` recebem a categoria correspondente.

ALTER TABLE public.curso_categorias ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0;

-- Ordem inicial: alfabética, para as categorias que já existem
WITH ordenadas AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY nome) - 1 AS pos FROM public.curso_categorias
)
UPDATE public.curso_categorias c SET ordem = o.pos FROM ordenadas o WHERE c.id = o.id;

-- Converte os temas legados em categorias e vincula os cursos.
-- user_id: a tabela exige um usuário; usa o mesmo dos cursos/categorias já cadastrados
-- (o app trabalha com um único usuário interno).
DO $$
DECLARE
    v_user uuid;
    v_prox integer;
    v_tema record;
    v_cat_id uuid;
BEGIN
    SELECT user_id INTO v_user FROM public.curso_categorias LIMIT 1;
    IF v_user IS NULL THEN
        SELECT user_id INTO v_user FROM public.cursos WHERE user_id IS NOT NULL LIMIT 1;
    END IF;
    IF v_user IS NULL THEN
        SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
    END IF;
    IF v_user IS NULL THEN
        RAISE NOTICE 'Nenhum usuário encontrado; temas legados não foram convertidos em categorias.';
        RETURN;
    END IF;

    SELECT COALESCE(MAX(ordem) + 1, 0) INTO v_prox FROM public.curso_categorias;

    -- Só cria categoria para tema que realmente tem curso sem categoria
    FOR v_tema IN
        SELECT DISTINCT c.tema::text AS tema,
            CASE c.tema::text
                WHEN 'ia' THEN 'IA'
                WHEN 'trafego_pago' THEN 'Tráfego Pago'
                WHEN 'trackeamento' THEN 'Trackeamento'
                WHEN 'copywriting' THEN 'Copywriting'
                WHEN 'gestao' THEN 'Gestão'
                WHEN 'vendas' THEN 'Vendas'
                WHEN 'multiplos_temas' THEN 'Múltiplos Temas'
                ELSE 'Outros'
            END AS nome
        FROM public.cursos c
        WHERE c.categoria_id IS NULL AND c.tema IS NOT NULL
    LOOP
        SELECT id INTO v_cat_id FROM public.curso_categorias
        WHERE user_id = v_user AND lower(nome) = lower(v_tema.nome) LIMIT 1;

        IF v_cat_id IS NULL THEN
            INSERT INTO public.curso_categorias (user_id, nome, ordem)
            VALUES (v_user, v_tema.nome, v_prox)
            RETURNING id INTO v_cat_id;
            v_prox := v_prox + 1;
        END IF;

        UPDATE public.cursos SET categoria_id = v_cat_id
        WHERE categoria_id IS NULL AND tema::text = v_tema.tema;
    END LOOP;
END $$;

-- Realtime: a aba Cursos e o formulário refletem mudanças feitas no Admin
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'curso_categorias'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.curso_categorias;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL; -- publicação pode não existir em ambientes locais
END $$;
