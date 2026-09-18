-- Aba Habilidades: roadmap de competências do estrategista digital.
-- Cada habilidade tem subhabilidades com nota (0-10) e peso; a nota da habilidade é a média
-- ponderada das subs, e a nota geral é a média ponderada das habilidades.
-- habilidade_recursos guarda sugestões curadas (livros, newsletters, blogs...) por habilidade.

CREATE TABLE IF NOT EXISTS public.habilidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    descricao TEXT,
    peso NUMERIC(3,1) NOT NULL DEFAULT 1 CHECK (peso > 0),
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subhabilidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    habilidade_id UUID NOT NULL REFERENCES public.habilidades(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    criterios TEXT,
    nota NUMERIC(3,1) NOT NULL DEFAULT 0 CHECK (nota >= 0 AND nota <= 10),
    peso NUMERIC(3,1) NOT NULL DEFAULT 1 CHECK (peso > 0),
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subhabilidades_habilidade_idx ON public.subhabilidades(habilidade_id);

CREATE TABLE IF NOT EXISTS public.habilidade_recursos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    habilidade_id UUID NOT NULL REFERENCES public.habilidades(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('livro','curso','newsletter','blog','perfil','artigo','podcast','doc')),
    titulo TEXT NOT NULL,
    autor TEXT,
    link TEXT,
    observacao TEXT,
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS habilidade_recursos_habilidade_idx ON public.habilidade_recursos(habilidade_id);

COMMENT ON TABLE public.habilidades IS 'Habilidades do roadmap (aba Habilidades); nota = média ponderada das subhabilidades';
COMMENT ON TABLE public.subhabilidades IS 'Subhabilidades com auto-avaliação 0-10; criterios descreve o que seria nota 10';
COMMENT ON TABLE public.habilidade_recursos IS 'Sugestões curadas de estudo por habilidade';

-- Mesmo modelo das outras tabelas de configuração: app sem login real, chave pública
ALTER TABLE public.habilidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subhabilidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habilidade_recursos ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'habilidades_all' AND tablename = 'habilidades') THEN
        CREATE POLICY "habilidades_all" ON public.habilidades FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'subhabilidades_all' AND tablename = 'subhabilidades') THEN
        CREATE POLICY "subhabilidades_all" ON public.subhabilidades FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'habilidade_recursos_all' AND tablename = 'habilidade_recursos') THEN
        CREATE POLICY "habilidade_recursos_all" ON public.habilidade_recursos FOR ALL USING (true) WITH CHECK (true);
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
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_habilidades_updated_at') THEN
        CREATE TRIGGER set_habilidades_updated_at BEFORE UPDATE ON public.habilidades
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_subhabilidades_updated_at') THEN
        CREATE TRIGGER set_subhabilidades_updated_at BEFORE UPDATE ON public.subhabilidades
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- ============================================================================
-- SEED: habilidades, subhabilidades (com critério de nota 10) e recursos.
-- Só roda se a tabela estiver vazia, para não duplicar em reexecuções.
-- ============================================================================
DO $$
DECLARE
    h UUID;
    s INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM public.habilidades) THEN
        RAISE NOTICE 'habilidades já populada; seed ignorado.';
        RETURN;
    END IF;

    -- ---------------------------------------------------------------- 1. Gestão de Tráfego
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Gestão de Tráfego', 'Planejar, operar e otimizar mídia paga com foco em resultado (CAC, ROAS, volume) nas principais plataformas.', 2, 0)
        RETURNING id INTO h;
    s := 0;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Meta Ads', 'Domina estrutura de conta (CBO/ABO, Advantage+), públicos, otimização por evento, testes de criativo e escala sem quebrar o CPA. Lê o Gerenciador e diagnostica problemas sozinho.', 2, s),
        (h, 'Google Ads (Search e PMax)', 'Estrutura campanhas de pesquisa por intenção, termos negativos, lances inteligentes, PMax com sinais e feed; entende leilão, Índice de Qualidade e atribuição do Google.', 2, s+1),
        (h, 'YouTube e Demand Gen', 'Sabe quando usar vídeo para performance vs. alcance, segmentações (in-market, custom intent), formatos e métricas de retenção aplicadas à conversão.', 1, s+2),
        (h, 'LinkedIn Ads', 'Segmenta por cargo/empresa/skills, conhece formatos (lead gen forms, conversation ads), custos típicos B2B e como reduzir CPL com oferta e copy.', 1, s+3),
        (h, 'TikTok e outras plataformas', 'Consegue subir e otimizar campanhas em TikTok, Pinterest, X e nativas (Taboola/Outbrain) quando fizer sentido para o cliente.', 1, s+4),
        (h, 'Estrutura de campanhas e testes', 'Monta planos de teste (criativo, público, oferta) com hipótese, orçamento e critério de decisão; documenta e itera semanalmente.', 2, s+5),
        (h, 'Análise e otimização', 'Lê métricas de funil (CTR, CPM, CPC, CVR, CPA, ROAS, LTV/CAC), identifica o gargalo e sabe qual alavanca mexer; faz relatório que o cliente entende.', 2, s+6),
        (h, 'Estratégia de criativos para performance', 'Sabe briefar criativos com ângulos, hooks e formatos por etapa do funil; avalia criativos por métricas (hook rate, hold rate, thumb-stop).', 1, s+7);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'livro', 'Dotcom Secrets', 'Russell Brunson', NULL, 'Funis e a lógica de tráfego → oferta.', 0),
        (h, 'livro', 'Traffic Secrets', 'Russell Brunson', NULL, 'Fontes de tráfego e como pensar público antes de plataforma.', 1),
        (h, 'blog', 'Jon Loomer', 'Jon Loomer', 'https://www.jonloomer.com', 'Referência técnica em Meta Ads, sempre atualizado.', 2),
        (h, 'doc', 'Google Skillshop', 'Google', 'https://skillshop.withgoogle.com', 'Certificações oficiais de Google Ads (gratuito).', 3),
        (h, 'doc', 'Meta Blueprint', 'Meta', 'https://www.facebook.com/business/learn', 'Cursos oficiais de Meta Ads (gratuito).', 4),
        (h, 'newsletter', 'Stacked Marketer', 'Stacked Marketer', 'https://www.stackedmarketer.com', 'Diária, curta, sobre mídia paga e growth.', 5);

    -- ---------------------------------------------------------------- 2. Copywriting
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Copywriting', 'Escrever para persuadir e converter: anúncios, páginas, e-mails e roteiros.', 2, 1)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Fundamentos de persuasão', 'Aplica com naturalidade níveis de consciência (Schwartz), gatilhos (Cialdini), promessa/prova/oferta e sabe explicar por que uma copy funciona.', 2, 0),
        (h, 'Pesquisa de público e avatar', 'Levanta dores, desejos, objeções e linguagem do público em fontes reais (reviews, comentários, entrevistas) antes de escrever.', 2, 1),
        (h, 'Headlines e hooks', 'Escreve 20+ variações de headline/hook por peça, com ângulos diferentes, e sabe testar. Primeiras linhas prendem.', 2, 2),
        (h, 'Copy para anúncios', 'Escreve copies curtas e longas para Meta/Google/LinkedIn adequadas ao formato e à etapa do funil; itera com base nos dados.', 2, 3),
        (h, 'Landing pages e VSL', 'Estrutura páginas de venda e roteiros de VSL completos (lead, história, mecanismo, oferta, garantia, CTA) que convertem.', 2, 4),
        (h, 'E-mail e sequências', 'Cria sequências de nutrição, lançamento e recuperação com assunto, abertura e CTA que geram abertura e clique.', 1, 5),
        (h, 'Storytelling', 'Usa narrativa (herói, conflito, virada) para tornar ofertas memoráveis sem perder clareza.', 1, 6),
        (h, 'Edição e clareza', 'Corta o supérfluo, escreve simples, mantém ritmo e voz consistente; revisa copy dos outros com critério.', 1, 7);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'livro', 'Breakthrough Advertising', 'Eugene Schwartz', NULL, 'O clássico dos níveis de consciência do mercado.', 0),
        (h, 'livro', 'The Adweek Copywriting Handbook', 'Joseph Sugarman', NULL, 'Método prático de escrita persuasiva.', 1),
        (h, 'livro', 'Scientific Advertising', 'Claude Hopkins', NULL, 'Curto, antigo e ainda essencial.', 2),
        (h, 'livro', 'Cashvertising', 'Drew Eric Whitman', NULL, 'Psicologia aplicada a anúncios.', 3),
        (h, 'livro', 'Ogilvy on Advertising', 'David Ogilvy', NULL, 'Princípios atemporais de propaganda.', 4),
        (h, 'blog', 'Copyhackers', 'Joanna Wiebe', 'https://copyhackers.com', 'Copy orientada a conversão, com dados.', 5),
        (h, 'blog', 'Swiped.co', 'Mike Schauer', 'https://swiped.co', 'Swipe file comentado de copies clássicas.', 6);

    -- ---------------------------------------------------------------- 3. Trackeamento
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Trackeamento', 'Garantir que cada conversão seja medida corretamente e chegue às plataformas para otimização.', 1.5, 2)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Google Tag Manager', 'Cria tags, acionadores e variáveis do zero, usa dataLayer, versões e ambientes; resolve conflitos e organiza o container.', 2, 0),
        (h, 'GA4', 'Configura eventos, conversões, parâmetros, audiências e relatórios exploratórios; entende o modelo de dados do GA4.', 2, 1),
        (h, 'Pixel e Conversions API (Meta)', 'Implementa pixel + CAPI com deduplicação, parâmetros de correspondência avançada e valida no Events Manager.', 2, 2),
        (h, 'Conversões Google Ads', 'Configura conversões (tag, importação do GA4, conversões aprimoradas) e sabe qual usar como principal para lances.', 2, 3),
        (h, 'UTMs e atribuição', 'Padroniza UTMs, entende modelos de atribuição e janelas e explica diferenças entre plataforma e analytics.', 1, 4),
        (h, 'Server-side e integrações', 'Configura tagueamento server-side (sGTM/Stape) e integrações com CRM/webhooks quando necessário.', 1, 5),
        (h, 'QA e debug', 'Usa Tag Assistant, DebugView, extensões e testes reais para validar tudo antes de ligar campanha; documenta o setup.', 2, 6);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'blog', 'Simo Ahava', 'Simo Ahava', 'https://www.simoahava.com', 'A referência mundial em GTM e GA4.', 0),
        (h, 'blog', 'MeasureSchool', 'Julian Juenemann', 'https://measureschool.com', 'Tutoriais práticos de tracking (site e YouTube).', 1),
        (h, 'doc', 'Central de Ajuda do Tag Manager', 'Google', 'https://support.google.com/tagmanager', 'Documentação oficial.', 2),
        (h, 'doc', 'Conversions API', 'Meta', 'https://developers.facebook.com/docs/marketing-api/conversions-api', 'Documentação oficial da CAPI.', 3),
        (h, 'livro', 'Web Analytics 2.0', 'Avinash Kaushik', NULL, 'Mentalidade de medição, ainda relevante.', 4);

    -- ---------------------------------------------------------------- 4. CRM
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('CRM', 'Estruturar e operar o CRM para que leads não se percam e a operação comercial seja mensurável.', 1, 3)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Desenho de pipeline', 'Define etapas, critérios de passagem e campos obrigatórios que refletem o processo real de vendas.', 2, 0),
        (h, 'Automações e fluxos', 'Cria automações de distribuição, follow-up, nutrição e alertas sem gerar ruído para o time.', 2, 1),
        (h, 'Segmentação e lead scoring', 'Segmenta base por perfil e comportamento e monta scoring que prioriza corretamente os leads.', 1, 2),
        (h, 'Ferramentas', 'Opera com fluência pelo menos duas ferramentas (HubSpot, RD Station, Kommo, Pipedrive...) e sabe escolher a certa por contexto.', 1, 3),
        (h, 'Integrações', 'Integra formulários, WhatsApp, ads e planilhas ao CRM (nativo, Make/n8n ou API).', 1, 4),
        (h, 'Higiene de dados e relatórios', 'Mantém base limpa, evita duplicidade e extrai relatórios de conversão por etapa, origem e vendedor.', 1, 5);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'doc', 'HubSpot Academy', 'HubSpot', 'https://academy.hubspot.com', 'Cursos gratuitos de CRM, inbound e vendas.', 0),
        (h, 'livro', 'The Sales Acceleration Formula', 'Mark Roberge', NULL, 'Processo comercial orientado a dados (ex-HubSpot).', 1),
        (h, 'blog', 'Blog da RD Station', 'RD Station', 'https://www.rdstation.com/blog', 'Conteúdo em português sobre CRM e automação.', 2);

    -- ---------------------------------------------------------------- 5. Vendas
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Vendas', 'Conduzir a conversa comercial do diagnóstico ao fechamento, com processo e métricas.', 2, 4)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Processo e playbook', 'Tem um processo de vendas documentado (etapas, scripts, materiais) e o segue/ajusta com base em dados.', 2, 0),
        (h, 'Diagnóstico e perguntas (SPIN)', 'Conduz a reunião com perguntas que revelam dor, impacto e urgência antes de apresentar solução.', 2, 1),
        (h, 'Apresentação de proposta', 'Apresenta proposta ancorada no diagnóstico, com valor claro, opções e próximos passos definidos.', 2, 2),
        (h, 'Contorno de objeções', 'Antecipa e trata objeções de preço, tempo, confiança e prioridade sem ser defensivo.', 2, 3),
        (h, 'Fechamento', 'Sabe pedir a venda, criar urgência legítima e conduzir para assinatura/pagamento.', 2, 4),
        (h, 'Follow-up e cadência', 'Mantém cadência de follow-up estruturada que recupera propostas paradas sem parecer insistente.', 1, 5),
        (h, 'Métricas de vendas', 'Acompanha taxa de conversão por etapa, ciclo, ticket e motivo de perda, e age sobre isso.', 1, 6);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'livro', 'SPIN Selling', 'Neil Rackham', NULL, 'Base de vendas consultivas.', 0),
        (h, 'livro', 'A Venda Desafiadora (The Challenger Sale)', 'Matthew Dixon e Brent Adamson', NULL, 'Ensinar, adaptar e assumir controle.', 1),
        (h, 'livro', '$100M Offers', 'Alex Hormozi', NULL, 'Construção de oferta irresistível.', 2),
        (h, 'livro', 'A Bíblia de Vendas', 'Jeffrey Gitomer', NULL, 'Prático e direto.', 3),
        (h, 'livro', 'Como Fazer Amigos e Influenciar Pessoas', 'Dale Carnegie', NULL, 'Relacionamento, o clássico.', 4);

    -- ---------------------------------------------------------------- 6. Negociação
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Negociação', 'Chegar a acordos bons para os dois lados em preço, escopo, prazo e expectativas.', 1, 5)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Preparação e BATNA', 'Entra em toda negociação sabendo sua alternativa, limites, interesses do outro lado e cenários.', 2, 0),
        (h, 'Ancoragem e concessões', 'Ancora primeiro quando convém, concede devagar e sempre em troca de algo.', 2, 1),
        (h, 'Escuta e empatia tática', 'Usa rótulos, espelhamento e perguntas calibradas (Voss) para entender o que o outro realmente quer.', 2, 2),
        (h, 'Negociação de escopo e contrato', 'Negocia escopo, prazos, reajustes e cláusulas de saída protegendo a margem e a relação.', 1, 3),
        (h, 'Controle emocional', 'Mantém calma sob pressão, não reage a ultimatos e sabe pausar/retomar a conversa.', 1, 4);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'livro', 'Negocie Como se Sua Vida Dependesse Disso', 'Chris Voss', NULL, 'Técnicas de negociador do FBI aplicadas a negócios.', 0),
        (h, 'livro', 'Como Chegar ao Sim', 'Roger Fisher e William Ury', NULL, 'Negociação baseada em interesses.', 1),
        (h, 'livro', 'As Armas da Persuasão', 'Robert Cialdini', NULL, 'Os princípios de influência.', 2),
        (h, 'livro', 'Bargaining for Advantage', 'G. Richard Shell', NULL, 'Estilo pessoal de negociação e preparação.', 3);

    -- ---------------------------------------------------------------- 7. Pré-vendas
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Pré-vendas (SDR)', 'Gerar e qualificar oportunidades antes da reunião de vendas.', 1, 6)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Definição de ICP e listas', 'Define perfil ideal de cliente com critérios objetivos e monta listas qualificadas (LinkedIn, bases, scraping).', 2, 0),
        (h, 'Prospecção outbound', 'Roda prospecção ativa multicanal (e-mail, LinkedIn, WhatsApp, ligação) com volume e taxa de resposta acima da média.', 2, 1),
        (h, 'Qualificação', 'Aplica um framework (BANT, GPCT, SPICED) e só passa para vendas o que tem fit real.', 2, 2),
        (h, 'Cadências e copy de abordagem', 'Escreve mensagens curtas, personalizadas e com CTA claro; estrutura cadências com timing e canais.', 2, 3),
        (h, 'Social selling', 'Usa LinkedIn/Instagram para gerar conversas orgânicas com o ICP (conteúdo + interação).', 1, 4),
        (h, 'Agendamento e handoff', 'Garante no-show baixo (confirmação, contexto) e passa a reunião com briefing completo para vendas.', 1, 5);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'livro', 'Receita Previsível', 'Aaron Ross e Marylou Tyler', NULL, 'O modelo de outbound com SDRs.', 0),
        (h, 'livro', 'Fanatical Prospecting', 'Jeb Blount', NULL, 'Disciplina e técnica de prospecção.', 1),
        (h, 'livro', 'The Sales Development Playbook', 'Trish Bertuzzi', NULL, 'Estruturação de time e processo de SDR.', 2);

    -- ---------------------------------------------------------------- 8. Inteligência Artificial
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Inteligência Artificial', 'Usar modelos de linguagem e agentes para multiplicar produção, análise e automação no dia a dia.', 2, 7)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Engenharia de prompt', 'Escreve prompts com papel, contexto, exemplos, formato de saída e critérios; itera de forma sistemática e sabe quando usar system prompt.', 2, 0),
        (h, 'Agentes e automações', 'Monta agentes e fluxos (Claude Code, n8n, Make, Zapier) com ferramentas, memória e tratamento de erro que rodam sem supervisão.', 2, 1),
        (h, 'Modelos, APIs e custos', 'Conhece os principais modelos (Claude, GPT, Gemini, open source), quando usar cada um, limites de contexto e custo por tarefa.', 1, 2),
        (h, 'RAG e dados próprios', 'Conecta modelos a documentos e bases (embeddings, busca, MCP) para respostas com contexto do negócio.', 1, 3),
        (h, 'IA para conteúdo e criativos', 'Produz textos, imagens, vídeo e áudio com IA em qualidade profissional e com direção clara.', 2, 4),
        (h, 'IA para análise de dados', 'Usa IA para analisar planilhas, relatórios e campanhas e extrair insights acionáveis com checagem.', 1, 5),
        (h, 'Senso crítico sobre outputs', 'Detecta alucinação, vieses e respostas genéricas; valida antes de usar e sabe os limites de cada ferramenta.', 2, 6);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'doc', 'Claude Docs', 'Anthropic', 'https://docs.claude.com', 'Guias oficiais de prompting, agentes e API.', 0),
        (h, 'doc', 'Prompt Engineering Guide', 'DAIR.AI', 'https://www.promptingguide.ai', 'Guia aberto e abrangente de técnicas de prompt.', 1),
        (h, 'livro', 'Co-Intelligence', 'Ethan Mollick', NULL, 'Como trabalhar junto com IA, sem hype.', 2),
        (h, 'newsletter', 'One Useful Thing', 'Ethan Mollick', 'https://www.oneusefulthing.org', 'Usos práticos de IA com base em pesquisa.', 3),
        (h, 'newsletter', 'The Batch', 'DeepLearning.AI', 'https://www.deeplearning.ai/the-batch', 'Semanal, panorama do que importa em IA.', 4),
        (h, 'curso', 'DeepLearning.AI Short Courses', 'DeepLearning.AI', 'https://www.deeplearning.ai/short-courses', 'Cursos curtos e gratuitos (prompting, agentes, RAG).', 5);

    -- ---------------------------------------------------------------- 9. Desenvolvimento de Sistemas
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Desenvolvimento de Sistemas (com IA)', 'Construir ferramentas, sistemas internos e integrações usando IA como par de programação.', 1.5, 8)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Lógica e fundamentos', 'Entende variáveis, condicionais, loops, funções, estruturas de dados e consegue ler código para saber o que ele faz.', 2, 0),
        (h, 'Vibe coding com IA', 'Descreve requisitos com precisão, guia Claude Code/Lovable/Cursor por iterações, revisa o que foi gerado e mantém o projeto coerente.', 2, 1),
        (h, 'Front-end (React/Tailwind)', 'Entende componentes, estado, rotas e estilos o suficiente para ajustar telas e pedir mudanças certas.', 1, 2),
        (h, 'Banco de dados e SQL (Supabase)', 'Modela tabelas, relacionamentos, políticas RLS e escreve consultas SQL básicas/intermediárias.', 2, 3),
        (h, 'APIs e integrações', 'Consome e cria APIs/webhooks, entende autenticação, JSON e como ligar sistemas entre si.', 1, 4),
        (h, 'Git e deploy', 'Usa Git (commit, branch, revert), entende ambientes e consegue publicar e reverter uma versão.', 1, 5),
        (h, 'Arquitetura e boas práticas', 'Sabe separar responsabilidades, evitar duplicação, nomear bem e reconhecer código ruim mesmo gerado por IA.', 1, 6);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'livro', 'Código Limpo', 'Robert C. Martin', NULL, 'Critério para julgar código, inclusive o gerado por IA.', 0),
        (h, 'livro', 'O Programador Pragmático', 'Andrew Hunt e David Thomas', NULL, 'Mentalidade de engenharia.', 1),
        (h, 'doc', 'Supabase Docs', 'Supabase', 'https://supabase.com/docs', 'Banco, auth, RLS e edge functions.', 2),
        (h, 'doc', 'React Docs', 'Meta', 'https://react.dev/learn', 'Tutorial oficial, moderno.', 3),
        (h, 'doc', 'Claude Code Docs', 'Anthropic', 'https://docs.claude.com/en/docs/claude-code', 'Como tirar o máximo do Claude Code.', 4),
        (h, 'curso', 'The Odin Project', 'The Odin Project', 'https://www.theodinproject.com', 'Trilha gratuita e completa de fundamentos web.', 5);

    -- ---------------------------------------------------------------- 10. Dados e Analytics
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Dados e Analytics', 'Transformar números em decisões: métricas, dashboards, testes e comunicação de resultados.', 1.5, 9)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Métricas de funil e unit economics', 'Calcula e interpreta CAC, LTV, payback, margem, ROAS real e sabe quais métricas importam por modelo de negócio.', 2, 0),
        (h, 'Dashboards (Looker Studio etc.)', 'Monta dashboards limpos, conectados às fontes, que respondem as perguntas do cliente sem precisar de explicação.', 2, 1),
        (h, 'Planilhas avançadas', 'Usa PROCV/XLOOKUP, tabelas dinâmicas, QUERY, importação de dados e fórmulas de forma fluente.', 1, 2),
        (h, 'Testes A/B e estatística básica', 'Desenha testes com amostra e significância adequadas e evita conclusões precipitadas.', 1, 3),
        (h, 'Storytelling com dados', 'Apresenta resultados com narrativa, gráficos certos e recomendação clara.', 2, 4);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'livro', 'Storytelling com Dados', 'Cole Nussbaumer Knaflic', NULL, 'Como apresentar dados que convencem.', 0),
        (h, 'livro', 'Lean Analytics', 'Alistair Croll e Benjamin Yoskovitz', NULL, 'A métrica que importa por estágio do negócio.', 1),
        (h, 'blog', 'Occam''s Razor', 'Avinash Kaushik', 'https://www.kaushik.net/avinash', 'Analytics com foco em decisão.', 2);

    -- ---------------------------------------------------------------- 11. Estratégia de Marketing
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Estratégia de Marketing', 'Posicionar, desenhar a oferta e o funil, e planejar crescimento antes de qualquer tática.', 2, 10)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Posicionamento e diferenciação', 'Define para quem, contra quem e por que escolher, com clareza que o cliente consegue repetir.', 2, 0),
        (h, 'Construção de oferta', 'Estrutura ofertas (promessa, entregáveis, bônus, garantia, preço) com valor percebido alto.', 2, 1),
        (h, 'Funis e jornada do cliente', 'Desenha funis por modelo (lançamento, perpétuo, B2B, e-commerce) com etapas, métricas e conteúdos.', 2, 2),
        (h, 'Planejamento e orçamento', 'Monta plano trimestral com metas, canais, orçamento e projeção de resultado defensável.', 1, 3),
        (h, 'Growth e experimentação', 'Roda ciclo de hipóteses → experimentos → aprendizado de forma contínua e documentada.', 1, 4),
        (h, 'Branding e conteúdo', 'Entende como marca e conteúdo orgânico sustentam a performance no longo prazo.', 1, 5);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'livro', 'Posicionamento', 'Al Ries e Jack Trout', NULL, 'O clássico sobre ocupar a mente do cliente.', 0),
        (h, 'livro', 'Obviously Awesome', 'April Dunford', NULL, 'Posicionamento prático para produtos e serviços.', 1),
        (h, 'livro', 'StoryBrand', 'Donald Miller', NULL, 'Clareza de mensagem.', 2),
        (h, 'livro', 'Hacking Growth', 'Sean Ellis e Morgan Brown', NULL, 'Processo de growth.', 3),
        (h, 'livro', 'Isso é Marketing', 'Seth Godin', NULL, 'Marketing como mudança para um público específico.', 4),
        (h, 'newsletter', 'Lenny''s Newsletter', 'Lenny Rachitsky', 'https://www.lennysnewsletter.com', 'Growth, produto e go-to-market.', 5);

    -- ---------------------------------------------------------------- 12. Design (avaliação e direção)
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Design (direção e senso crítico)', 'Não é execução manual: é saber briefar, gerar com IA e julgar se um design está bom e por quê.', 1, 11)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Senso estético e hierarquia visual', 'Identifica problemas de alinhamento, contraste, espaçamento, tipografia e hierarquia e sabe explicar o que corrigir.', 2, 0),
        (h, 'Direção de arte para anúncios', 'Define ângulo visual, formato e referência para criativos que param o scroll e comunicam a oferta.', 2, 1),
        (h, 'Briefing e avaliação de criativos', 'Escreve briefings claros (objetivo, público, mensagem, referências) e dá feedback objetivo a designers e IA.', 2, 2),
        (h, 'Geração de imagens com IA', 'Produz imagens e peças com Midjourney/Flux/Canva IA em qualidade usável, com consistência de marca.', 1, 3),
        (h, 'UX e conversão de páginas', 'Avalia landing pages por clareza, hierarquia, carregamento e fricção, e propõe melhorias com base em princípios de UX.', 2, 4);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'livro', 'Design para Quem Não é Designer', 'Robin Williams', NULL, 'Os 4 princípios básicos (CRAP) explicados de forma simples.', 0),
        (h, 'livro', 'Refactoring UI', 'Adam Wathan e Steve Schoger', 'https://www.refactoringui.com', 'Como melhorar interfaces sem ser designer.', 1),
        (h, 'livro', 'Não Me Faça Pensar', 'Steve Krug', NULL, 'Usabilidade essencial.', 2),
        (h, 'doc', 'Laws of UX', 'Jon Yablonski', 'https://lawsofux.com', 'Princípios de psicologia aplicados a interfaces.', 3),
        (h, 'doc', 'Biblioteca de Anúncios da Meta', 'Meta', 'https://www.facebook.com/ads/library', 'Referências reais de criativos.', 4);

    -- ---------------------------------------------------------------- 13. Vídeo (avaliação e direção)
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Vídeo (direção e senso crítico)', 'Roteirizar, dirigir e avaliar vídeos (anúncios, VSL, conteúdo) usando IA e editores, sem editar na mão.', 1, 12)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Roteiro para vídeo e VSL', 'Escreve roteiros com hook nos 3 primeiros segundos, estrutura clara e CTA; adapta por plataforma e duração.', 2, 0),
        (h, 'Ritmo, corte e retenção', 'Reconhece quando um vídeo está lento, sem ritmo ou confuso e sabe pedir cortes, legendas e b-roll certos.', 2, 1),
        (h, 'Briefing e direção de editores', 'Passa briefing completo (referências, ritmo, trilha, legendas, formato) e dá feedback específico por timestamp.', 2, 2),
        (h, 'Ferramentas de vídeo com IA', 'Usa CapCut, HeyGen, Runway, ElevenLabs e afins para produzir ou prototipar vídeos com qualidade aceitável.', 1, 3),
        (h, 'Análise de métricas de vídeo', 'Lê retenção, hook rate, hold rate e conclusão para decidir o que mudar no próximo vídeo.', 1, 4);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'livro', 'Num Piscar de Olhos (In the Blink of an Eye)', 'Walter Murch', NULL, 'Por que um corte funciona: o clássico da montagem.', 0),
        (h, 'livro', 'Story', 'Robert McKee', NULL, 'Estrutura narrativa.', 1),
        (h, 'livro', 'Hook Point', 'Brendan Kane', NULL, 'Como prender atenção em 3 segundos.', 2);

    -- ---------------------------------------------------------------- 14. Gestão de Projetos e Operação
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Gestão de Projetos e Operação', 'Fazer a operação rodar: prioridades, processos, prazos e expectativas dos clientes.', 1.5, 13)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Planejamento e priorização', 'Define o que importa na semana/mês, diz não ao resto e entrega o que prometeu.', 2, 0),
        (h, 'Processos e SOPs', 'Documenta processos repetíveis (onboarding, relatório, campanha) para que qualquer pessoa execute.', 2, 1),
        (h, 'Gestão de clientes e expectativas', 'Alinha escopo, comunica proativamente, lida com crises e mantém churn baixo.', 2, 2),
        (h, 'Ferramentas de gestão', 'Usa Notion/ClickUp/Trello e este sistema de forma consistente, sem retrabalho.', 1, 3),
        (h, 'Produtividade pessoal', 'Trabalha com foco, controla agenda e energia, e evita dispersão.', 1, 4);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'livro', 'Trabalho Focado (Deep Work)', 'Cal Newport', NULL, 'Foco como vantagem competitiva.', 0),
        (h, 'livro', 'Essencialismo', 'Greg McKeown', NULL, 'Fazer menos, melhor.', 1),
        (h, 'livro', 'A Arte de Fazer Acontecer (GTD)', 'David Allen', NULL, 'Sistema de organização pessoal.', 2),
        (h, 'livro', 'Checklist: Como Fazer as Coisas Benfeitas', 'Atul Gawande', NULL, 'O poder de processos simples.', 3);

    -- ---------------------------------------------------------------- 15. Comunicação e Liderança
    INSERT INTO public.habilidades (nome, descricao, peso, ordem) VALUES
        ('Comunicação e Liderança', 'Comunicar com clareza, apresentar, dar feedback e coordenar pessoas (time, freelancers, clientes).', 1, 14)
        RETURNING id INTO h;
    INSERT INTO public.subhabilidades (habilidade_id, nome, criterios, peso, ordem) VALUES
        (h, 'Comunicação escrita', 'Escreve mensagens, e-mails e documentos claros, curtos e sem ambiguidade.', 2, 0),
        (h, 'Apresentações e reuniões', 'Conduz reuniões com pauta e decisão, e apresenta resultados/propostas com segurança.', 2, 1),
        (h, 'Feedback e delegação', 'Delega com contexto e critério de pronto; dá feedback direto e respeitoso.', 1, 2),
        (h, 'Gestão de conflitos', 'Resolve atritos com clientes e time sem escalar e sem evitar o problema.', 1, 3),
        (h, 'Marca pessoal', 'Produz conteúdo e presença profissional que geram autoridade e oportunidades.', 1, 4);
    INSERT INTO public.habilidade_recursos (habilidade_id, tipo, titulo, autor, link, observacao, ordem) VALUES
        (h, 'livro', 'Comunicação Não-Violenta', 'Marshall Rosenberg', NULL, 'Base para feedback e conflito.', 0),
        (h, 'livro', 'Radical Candor (Empatia Assertiva)', 'Kim Scott', NULL, 'Feedback direto com cuidado.', 1),
        (h, 'livro', 'Ideias que Colam (Made to Stick)', 'Chip e Dan Heath', NULL, 'Por que algumas mensagens grudam.', 2),
        (h, 'livro', 'Os 5 Desafios das Equipes', 'Patrick Lencioni', NULL, 'Dinâmica de times.', 3);
END $$;
