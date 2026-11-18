# Prompt: aba "Radar IA" na seção Pessoal do GestorPro

> Cole este texto inteiro no seu agente de código, aberto no repositório do GestorPro (gestao.andrelopes.digital).
> Ele foi escrito por quem levantou a stack em 17/11/2026, apenas com leitura. Confirme tudo no código antes de mudar qualquer coisa.

---

## 0. Papel e forma de trabalhar

Atue como engenheiro full-stack e designer de produto sênior neste repositório. Você vai construir uma aba nova chamada **Radar IA** dentro da seção **Pessoal** do menu.

O repositório já segue o fluxo *superpowers*, com specs em `docs/superpowers/specs/AAAA-MM-DD-<tema>-design.md`. Isso aparece, por exemplo, na edge function `conteudo`. Siga o mesmo fluxo:

1. **Explorar.** Leia o código e confirme cada fato da seção 2. Se algo divergir, prevalece o código, e você anota a divergência.
2. **Spec.** Escreva `docs/superpowers/specs/2026-11-17-radar-ia-design.md` com as decisões deste prompt adaptadas ao código real. Mostre a spec para mim antes de implementar.
3. **Plano.** Faça um plano curto por fases (seção 9), com testes primeiro (TDD) no que for lógica: validação, upsert, filtros e datas.
4. **Implementar.** Use commits pequenos. Não faça deploy de produção nem aplique migration no banco de produção sem eu aprovar explicitamente.
5. **Entregar.** Siga o checklist da seção 11.

Regras gerais:
- Siga os padrões existentes: nomes em pt-BR, snake_case no banco, `COMMENT ON TABLE` no estilo "Aba X: …", componentes shadcn/ui, ícones lucide, `sonner` para toasts, `date-fns` com locale pt-BR e o hook `useKanbanDnd` existente.
- Não refatore o que não for necessário para esta feature.
- Os textos da interface são em português do Brasil.

---

## 1. Contexto: o que é o Radar IA

O Radar IA é um bot de curadoria que pesquisa novidades em Marketing, Branding, Performance, IA, Software/SaaS, Dados & Mensuração, Cibersegurança e Conteúdo & Social. Hoje ele publica num grupo de WhatsApp. A partir desta feature, publica também nesta aba, com o mesmo conteúdo.

**Rotinas do bot (fuso America/Sao_Paulo):**
| Horário | Rotina | O que manda para a aba |
|---|---|---|
| 04h | Pesquisa | nada; só prepara |
| 07h30 | Revisão | nada; só prepara |
| 08h | Boletim do dia | abertura + cards dos achados + encerramento |
| 09h–21h, de hora em hora | Monitor | alertas extraordinários, correções e respostas a perguntas |

**Unidades de conteúdo:**
- **Edição do dia:** `DIA-AAAAMMDD`, por exemplo `DIA-20261117`. Há uma edição por dia civil em São Paulo. Uma versão revisada no mesmo dia, como `DIA-20261117-R1`, **atualiza a mesma nota do dia**; ela nunca cria outra nota.
- **Achado:** `RAD-AAAAMMDD-NNN`, por exemplo `RAD-20261117-004`. O ID é estável. Um alerta e a aparição posterior dele no boletim usam o mesmo ID e contam uma vez só.
- **Classe:** 🟣 EXCELENTE, 🟢 BOM ou 🟡 MÉDIO. Alerta (🚨) é um subtipo de EXCELENTE.
- **Tipo** (filtro de publicação): **A** = aplicação prática, **B** = mudança operacional, **C** = lançamento utilizável.
- **Temas:** de 1 a 3 por achado, da lista fixa abaixo, do mais central para o menos central.

  | slug | rótulo exibido |
  |---|---|
  | `marketing` | Marketing |
  | `branding` | Branding |
  | `performance` | Performance |
  | `ia` | IA |
  | `software_saas` | Software/SaaS |
  | `dados_mensuracao` | Dados & Mensuração |
  | `ciberseguranca` | Cibersegurança |
  | `conteudo_social` | Conteúdo & Social |
- **Confiança:** alta, moderada ou baixa.
- **Estágio:** ideia, demonstração/protótipo, ferramenta utilizável ou uso em produção documentado.
- **Prontidão para uso:** pode experimentar agora, precisa preparar/integrar ou acompanhar.
- **Meta e teto:** a meta é de 4 a 20 achados novos por dia, e o teto rígido é 20 (boletim + alertas). Dias com menos de 4 achados são normais: o bot não completa com ruído e explica a cobertura parcial.
- **Outros eventos:** correção (mantém o ID, não é achado novo e não apaga o histórico) e resposta a pergunta (🧠 *Radar IA responde*; não conta no teto).

**Campos de um card** (ordem do WhatsApp):
1. Título com classe e ID, e 🏷️ Temas.
2. 🧭 Tipo, com o motivo da elegibilidade.
3. 🔵 Tema/tipo.
4. 📅 Publicação, 🔎 Primeira descoberta e 🔄 Atualização.
5. 🧸 Explicando fácil: *O que é*, *Como isso te afeta* e *Exemplo*.
6. 📌 O que entrega (lista).
7. 💡 Por que importa (lista).
8. 🧪 Evidência e confiança: Fonte, Limitações e Confiança.
9. 🚦 Estágio e ▶️ Prontidão.
10. 💰 Custo (lista) e ⏱️ Esforço (lista).
11. Bloco do tipo:
    - **Tipos A/C:** 🧩 Aplicação no dia a dia, só nas áreas que se aplicam (🎯 Performance, 🎨 Branding, 🛠️ Tecnologia/SaaS). Cada área traz: rótulo do caso, 🧰 Ferramentas, 📥 Você precisa ter, 🪜 Como usar, 📦 Entrega esperada e ✅ Como conferir. No tipo C entram também 🚀 O que foi lançado e 🔓 Como acessar.
    - **Tipo B:** 🔄 O que muda, 👥 Quem pode ser afetado, 📅 Quando, ⚙️ O que muda no trabalho, 🪜 O que fazer agora, 📦 Resultado esperado e 🔗 Orientação oficial.
12. 👉 Próximo passo: lista numerada que diz quem faz, onde e até quando, e termina com "como conferir".
13. Links: 🔗 Link de descoberta, Fonte original e Evidência adicional, e, quando vier do X, 🐦 Post no X e 🔗 Link citado no post.

**Princípio:** a aba é a versão organizada e filtrável do que saiu no WhatsApp. O bot manda os campos estruturados **e** o texto exato da mensagem (`texto_whatsapp`), para a aba poder mostrar "como saiu no grupo".

---

## 2. Stack descoberta (somente leitura, 17/11/2026). Confirme no código.

| Item | O que encontrei | Onde |
|---|---|---|
| Origem | Projeto **Lovable** ("GestorPro"; a meta description ainda diz "Kind Connect") | HTML público |
| Front | **React + Vite + TanStack Start/Router** (SSR, rotas por arquivo em `/_authenticated/*`), **shadcn/ui** (Radix), **Tailwind**, **lucide-react**, **sonner**, **@tanstack/react-query** (`QueryClient`), **date-fns** pt-BR | nomes dos chunks e do bundle |
| Hospedagem | **Cloudflare** (header `server: cloudflare`). Não está na Vercel. | headers HTTP |
| Backend | **Supabase**, projeto `gestao-de-operacao`, ref `uajusldnvzgakffofkhl`, região sa-east-1, Postgres 17 | conector Supabase + bundle |
| Auth do app | Supabase Auth com **e-mail e senha** (`signInWithPassword`) na rota `/login`; rotas protegidas sob `_authenticated` | chunk `login` |
| Menu | Arquivo de navegação com grupos `{ title, links: [{ label, icon, to, palavras[] }] }`. **Pessoal** = Financeiro, Cursos, Livros, Habilidades, Ver depois | chunk `nav` |
| Abas parecidas | `/ver-depois` (tabela `ver_depois`), `/livros`, `/notas` (`notas` + `nota_temas`, com `doc jsonb` de editor), `/ideias` | rotas + tabelas |
| Edge functions | Deno, `createClient` via esm.sh com `SUPABASE_SERVICE_ROLE_KEY`, objeto `cors`, helper `json()`, comparação de chave em tempo constante. Funções: `conteudo` (`x-cofre-key` / `COFRE_SYNC_KEY`), `gmn` (`x-swipe-key` / `SWIPE_KEY` ou `x-google-id-token` + `ALLOWED_GOOGLE_EMAILS`), `r2`, `instagram`, `planilha`, `google-token` etc. Quase todas com `verify_jwt: false` | conector Supabase (código lido, segredos não) |
| Migrations | `supabase/migrations/AAAAMMDDHHMMSS_<nome_pt>.sql`, por exemplo `20261116120000_taxas_templates` | `list_migrations` |
| Repositório | **Não encontrei no GitHub conectado.** Talvez seja privado em outra conta ou só no Lovable | — |

### 2.1 Risco de segurança encontrado (não corrija nesta feature; só registre na spec e me avise)

- 13 tabelas estão **sem RLS**: `clientes`, `demandas`, `nps_avaliacoes`, `saldo_ads`, `recargas`, `notificacoes_config`, `demanda_execucoes`, `financeiro_fontes`, `financeiro_recebimentos`, `prospeccao`, `prospeccao_interacoes`, `cursos` e `curso_categorias`.
- Várias tabelas com RLS (`notas`, `ver_depois`, `ideias`, `app_config` …) têm política `ALL` para o papel `public` com `true`. Na prática, **quem tiver a anon key, que é pública no bundle, lê e escreve tudo**.
- No bundle do cliente, `_authenticated` tem `beforeLoad` devolvendo `{ session: null }`. Confirme onde a proteção da rota realmente acontece.
- **As tabelas novas do Radar NÃO podem copiar esse padrão** (veja a seção 6).

---

## 3. Decisões de arquitetura (recomendadas)

1. **Escrita do bot por uma edge function dedicada, `radar`**, autenticada por uma chave própria no header `x-radar-key`. É o mesmo padrão de `conteudo`/`gmn`. O bot roda em Linux com `curl`/`python` e guarda a chave em variável de ambiente. Ele nunca usa a interface nem a anon key para escrever.
2. **Leitura da UI direto pelo supabase-js com a sessão logada** (papel `authenticated`), com RLS restrita a `authenticated`.
   - Antes, confirme que as chamadas do app levam o JWT do usuário.
   - Se não levarem, a UI lê por um `GET` da função `radar` autenticado com o JWT do Supabase.
3. **Uma nota por dia = uma linha em `radar_dias`.** Achados, eventos e o texto "como no WhatsApp" ficam pendurados nela. Reenvio, revisão e alerta **atualizam** o mesmo dia.
4. **Campos pessoais separados dos campos do bot.** Status, nota pessoal e avaliação são do André, e a ingestão **nunca** os sobrescreve.
5. **Idempotência em dois níveis.**
   - Cada requisição leva uma `Idempotency-Key`.
   - Cada achado é um upsert por `id` + `versao` + `hash_conteudo`.
   - Resultado: repetir o mesmo envio não duplica nem altera nada.

Alternativas descartadas:
- **Bot escrevendo direto nas tabelas com a service role:** a chave dá poder total ao banco e não há validação central.
- **Webhook genérico com JSON livre:** não dá para validar nem filtrar bem.
- **Reaproveitar a tabela `notas`:** o `doc jsonb` de editor não serve para filtrar por classe ou tema.

---

## 4. Modelo de dados (Postgres/Supabase)

Migration: `supabase/migrations/20261118120000_radar_ia.sql`, no padrão de 14 dígitos do repo.

```sql
-- Enums (ou CHECKs, siga o que o repo já usa)
create type radar_classe     as enum ('excelente','bom','medio');
create type radar_tipo       as enum ('A','B','C');            -- aplicação / mudança / lançamento
create type radar_confianca  as enum ('alta','moderada','baixa');
create type radar_status     as enum ('novo','lido','testando','aplicado','descartado');
create type radar_evento     as enum ('abertura','boletim','alerta','correcao','resposta','encerramento');

-- 1) Uma linha por dia civil em America/Sao_Paulo = "a nota do dia"
create table public.radar_dias (
  data              date primary key,                 -- 2026-11-17 (dia em SP, nunca UTC)
  edicao_id         text not null unique check (edicao_id ~ '^DIA-\d{8}$'),
  revisao           text,                             -- 'R1', 'R2'… quando houver versão revisada
  abertura_texto    text,                             -- texto exato da abertura no WhatsApp
  encerramento_texto text,
  resumo            jsonb not null default '{}',      -- {por_classe:{excelente:1,bom:2}, por_tema:{performance:2}, fora:[{id,motivo}]}
  cobertura_parcial text,                             -- explicação quando < 4 achados
  total_confirmados int not null default 0 check (total_confirmados between 0 and 20),
  atualizado_em     timestamptz not null default now(),
  criado_em         timestamptz not null default now()
);
comment on table public.radar_dias is 'Aba Radar IA: uma nota por dia (edição DIA-AAAAMMDD), atualizada ao longo do dia';

-- 2) Achados (campos do bot + campos pessoais do André)
create table public.radar_achados (
  id                 text primary key check (id ~ '^RAD-\d{8}-\d{3}$'),
  data               date not null references public.radar_dias(data) on delete restrict,
  titulo             text not null check (char_length(titulo) <= 300),
  classe             radar_classe not null,
  tipo               radar_tipo not null,
  tipo_motivo        text,
  alerta             boolean not null default false,
  temas              text[] not null check (cardinality(temas) between 1 and 3
                       and temas <@ array['marketing','branding','performance','ia','software_saas',
                                          'dados_mensuracao','ciberseguranca','conteudo_social']),
  confianca          radar_confianca not null,
  estagio            text not null,
  prontidao          text,
  publicacao         date,                            -- null = "não informada pela fonte"
  primeira_descoberta timestamptz not null,
  atualizacao        text,
  corpo              jsonb not null,                  -- blocos do card (schema na seção 5.3)
  links              jsonb not null default '[]',     -- [{tipo:'descoberta'|'fonte_original'|'evidencia'|'orientacao_oficial'|'post_x'|'link_citado_x', url, rotulo?}]
  post_x_url         text,
  link_citado_x_url  text,
  texto_whatsapp     text not null,                   -- mensagem exata enviada ao grupo
  enviado_em         timestamptz,
  versao             int not null default 1,
  hash_conteudo      text not null,                   -- sha256 do payload normalizado
  corrigido          boolean not null default false,
  -- Campos pessoais (NUNCA escritos pela ingestão)
  status             radar_status not null default 'novo',
  status_em          timestamptz,
  nota_pessoal       text,
  -- Busca
  busca              tsvector generated always as (
                       to_tsvector('portuguese', coalesce(titulo,'') || ' ' || coalesce(texto_whatsapp,''))
                     ) stored,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index on public.radar_achados (data desc);
create index on public.radar_achados (classe);
create index on public.radar_achados using gin (temas);
create index on public.radar_achados using gin (busca);
create index on public.radar_achados (status);

-- 3) Histórico de versões do achado (antes de cada update do bot)
create table public.radar_achado_versoes (
  id          bigserial primary key,
  achado_id   text not null references public.radar_achados(id) on delete cascade,
  versao      int not null,
  snapshot    jsonb not null,
  motivo      text,                                  -- 'correcao', 'revisao R1', 'atualizacao'
  criado_em   timestamptz not null default now(),
  unique (achado_id, versao)
);

-- 4) Linha do tempo do dia: abertura, alertas, correções, respostas, encerramento
create table public.radar_eventos (
  id              uuid primary key default gen_random_uuid(),
  data            date not null references public.radar_dias(data),
  tipo            radar_evento not null,
  achado_id       text references public.radar_achados(id),
  idempotency_key text not null unique,
  ocorrido_em     timestamptz not null,
  texto_whatsapp  text,
  dados           jsonb not null default '{}',      -- correção: {afirmacao_anterior, dado_correto, motivo, fontes[]}; resposta: {pergunta, referencia, fontes[]}
  criado_em       timestamptz not null default now()
);
create index on public.radar_eventos (data, ocorrido_em);

-- 5) Log de ingestão (auditoria e depuração; sem segredos)
create table public.radar_ingestao_log (
  id              bigserial primary key,
  recebido_em     timestamptz not null default now(),
  rota            text not null,
  chave_digest    text,                              -- 8 primeiros hex do sha256 da chave usada, nunca a chave
  idempotency_key text,
  dry_run         boolean not null default false,
  status_http     int not null,
  codigo          text,                              -- 'OK', 'REPLAY', 'VALIDACAO', …
  resumo          jsonb,                             -- {criados:[ids], atualizados:[ids], sem_mudanca:[ids]}
  payload_sha256  text,
  resposta        jsonb,                             -- resposta original, para devolver em replays
  duracao_ms      int
);
create index on public.radar_ingestao_log (recebido_em desc);
create index on public.radar_ingestao_log (idempotency_key);

-- 6) Filtros salvos (presets da UI)
create table public.radar_filtros_salvos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  query      text not null,                          -- querystring da URL, ex.: 'classe=excelente&tema=ia'
  ordem      int not null default 0,
  criado_em  timestamptz not null default now()
);
```

**Regras do banco:**
- Trigger `atualizado_em` igual ao das outras tabelas.
- Ao mudar `status`, gravar `status_em = now()`.
- Os contadores de `radar_dias.resumo` são recalculados pela função depois de cada ingestão, a partir de `radar_achados`. Não confie no número enviado pelo bot; o número do bot fica só para comparação no log.
- Um achado pertence ao dia da **primeira** publicação. Se o boletim do dia seguinte citar o mesmo ID, só se cria um evento referenciando; o achado não muda de dia.

---

## 5. Contrato da API de ingestão (edge function `radar`)

Base: `https://uajusldnvzgakffofkhl.supabase.co/functions/v1/radar`. Use `verify_jwt = false` em `supabase/config.toml`, como nas outras funções com chave própria.

### 5.1 Autenticação, escopo e rotação
- Header obrigatório: `x-radar-key: <chave>`. Compare em tempo constante, reaproveitando o helper `iguais()` de `gmn/acesso.ts`.
- Segredos da função:
  - `RADAR_INGEST_KEY`: a chave atual.
  - `RADAR_INGEST_KEY_ANTERIOR`: opcional, aceita durante a troca e depois apagada.
- **Escopo:** essa chave só alcança as rotas desta função e só as tabelas `radar_*`. Ela não dá acesso a nenhuma outra tabela do sistema.
  - Nesta fase ela só escreve.
  - Ler status e feedback (fase 2) exigirá a chave separada `RADAR_READ_KEY`.
- **Rotação:**
  1. Gerar a chave nova.
  2. Gravar a atual em `_ANTERIOR`.
  3. Gravar a nova em `RADAR_INGEST_KEY`.
  4. Passar a nova para o bot.
  5. Confirmar no log que a nova está em uso (`chave_digest`).
  6. Apagar `_ANTERIOR`.
- A chave nunca vai para o log nem para mensagens de erro.
- CORS: esta função não precisa ser chamada pelo navegador. Responda `OPTIONS` sem liberar `*` para as rotas de escrita.

### 5.2 Rotas
| Método | Rota | Uso |
|---|---|---|
| `GET` | `/radar/saude` | O bot verifica antes de enviar. Com chave válida, devolve `{ ok, schema_versao, agora_sp, data_sp, chave: "atual"|"anterior" }`; sem chave, devolve `401`. |
| `POST` | `/radar/eventos` | Rota única de ingestão (tipos abaixo). |
| `POST` | `/radar/eventos?dry_run=1` | Valida e calcula o que mudaria, **sem gravar** (grava apenas no log com `dry_run=true`). |

O header `x-radar-dry-run: 1` equivale a `?dry_run=1`.

### 5.3 Envelope (`POST /radar/eventos`)

Headers: `x-radar-key`, `Content-Type: application/json` e `Idempotency-Key: <string única>`. Padrões sugeridos de chave:
- `DIA-20261117:boletim:v1`
- `RAD-20261117-007:alerta:v1`
- `RAD-20261117-004:correcao:1`
- `DIA-20261117:resposta:<hash>`
- `DIA-20261117:encerramento:v1`

```json
{
  "schema_versao": 1,
  "tipo": "boletim",
  "edicao_id": "DIA-20261117",
  "revisao": "R1",
  "ocorrido_em": "2026-11-17T21:03:00-03:00",
  "dia": {
    "abertura_texto": "🔵 *Radar IA | Boletim de 17/11/2026 — versão revisada*\n…",
    "fora": [
      { "id": "RAD-20261117-003", "motivo": "falta documentação oficial do Google" }
    ],
    "cobertura_parcial": "3 achados elegíveis; não completei com material fraco."
  },
  "achados": [
    {
      "id": "RAD-20261117-004",
      "versao": 2,
      "titulo": "Vercel remove em 30/11 as Deployment Checks nativas de lint e typecheck",
      "classe": "bom",
      "tipo": "B",
      "tipo_motivo": "descontinuação oficial com prazo, impacto e ação indicada pela própria fonte",
      "alerta": false,
      "temas": ["software_saas"],
      "confianca": "alta",
      "estagio": "ferramenta utilizável",
      "prontidao": "precisa preparar/integrar",
      "publicacao": "2026-11-17",
      "primeira_descoberta": "2026-11-17T20:15:00-03:00",
      "atualizacao": null,
      "corpo": {
        "tema_tipo": "SaaS/infra · descontinuação documentada em changelog oficial",
        "explicando_facil": {
          "o_que_e": ["Lint: um revisor automático que caça erro óbvio de código, como um corretor ortográfico."],
          "como_te_afeta": "Se ninguém migrar, a trava que barrava código com erro some em 30/11.",
          "exemplo": "Ilustrativo: um deploy com erro de tipo, que antes era barrado, passa a ir ao ar."
        },
        "o_que_entrega": ["A Vercel vai retirar as Deployment Checks nativas de lint e typecheck."],
        "por_que_importa": ["Quem usa essas checks perde a trava em 30/11 se não migrar."],
        "evidencia": {
          "fonte": "changelog oficial e documentação da Vercel",
          "limitacoes": "custo do Vercel CI não verificado"
        },
        "custo": ["Migração sem custo informado; Vercel CI desconhecido"],
        "esforco": ["30–90 min por projeto; não medido"],
        "aplicacoes": [],
        "lancamento": null,
        "mudanca": {
          "o_que_muda": ["Não dá para criar checks novas desde 17/11; as existentes param em 30/11/2026."],
          "quem_pode_ser_afetado": ["Projetos com Lint/Typecheck com provedor Vercel."],
          "quando": ["Remoção: 30/11/2026"],
          "o_que_muda_no_trabalho": ["A trava nativa some na data."],
          "o_que_fazer_agora": ["Mover os comandos para o CI ou Build Command, como a Vercel indica."],
          "resultado_esperado": ["Trava equivalente mantida antes do deploy."]
        },
        "proximos_passos": [
          "Quem opera o projeto abre Build and Deployment até 28/11/2026 e procura Lint/Typecheck com provedor Vercel.",
          "Se encontrar, move o comando para o CI já usado ou para o Build Command antes de 30/11/2026.",
          "Como conferir: PR de teste com erro proposital de tipo deve ser barrado."
        ]
      },
      "links": [
        { "tipo": "descoberta", "url": "https://vercel.com/changelog/native-lint-and-typecheck-deployment-checks-are-being-deprecated" },
        { "tipo": "evidencia", "url": "https://vercel.com/docs/deployment-checks" }
      ],
      "post_x_url": null,
      "link_citado_x_url": null,
      "texto_whatsapp": "🟢 BOM *RAD-20261117-004 — Vercel remove em 30/11…*\n🏷️ *Temas:* Software/SaaS\n…",
      "enviado_em": "2026-11-17T21:04:00-03:00"
    }
  ]
}
```

O formato de cada item de `corpo.aplicacoes[]` nos tipos A e C é:

```json
{
  "area": "performance",
  "rotulo": "Aplicação sugerida",
  "cenario": "…",
  "ferramentas": ["…"],
  "voce_precisa_ter": ["…"],
  "como_usar": ["…"],
  "entrega_esperada": ["…"],
  "como_conferir": ["…"],
  "limite": null
}
```

Aqui, `area` é `performance`, `branding` ou `tecnologia_saas`. No tipo C, `corpo.lancamento` é `{ "o_que_foi_lancado": [...], "como_acessar": [...] }`.

**O que muda conforme o `tipo` do envelope:**
- `boletim`: `dia` (abertura) + `achados[]`, de 0 a 20. Faz upsert do dia e dos achados e grava um evento `abertura`.
- `alerta`: um único item em `achados[]` com `"alerta": true`. Faz upsert e grava um evento `alerta`.
- `correcao`: leva `correcao: { achado_id, afirmacao_anterior, dado_correto, motivo, fontes:[url], texto_whatsapp }`. Também pode levar `achados[0]` com a versão nova completa. O efeito:
  1. Grava um snapshot em `radar_achado_versoes`.
  2. Atualiza o achado e marca `corrigido = true`.
  3. Grava um evento `correcao`.
- `resposta`: leva `resposta: { pergunta, referencia: "RAD-…" | null, texto_whatsapp, fontes:[url] }` e grava um evento `resposta`.
- `encerramento`: leva `dia.encerramento_texto` e grava um evento `encerramento`.

### 5.4 Semântica de upsert e idempotência
1. Mesma `Idempotency-Key` e mesmo `payload_sha256` já registrados: devolve a **resposta original** com `200` e `"replay": true`. Nada muda.
2. Mesma `Idempotency-Key` com payload diferente: `409 IDEMPOTENCIA_CONFLITO`.
3. Por achado:
   - **Não existe:** cria.
   - **Existe com o mesmo `hash_conteudo`:** entra em `sem_mudanca`.
   - **`versao` maior:** grava snapshot da versão anterior e atualiza **só os campos do bot**.
   - **`versao` menor ou igual com hash diferente:** `409 VERSAO_ANTIGA` para aquele item.
4. `edicao_id` define `data` (`DIA-20261117` corresponde a `2026-11-17`). Se o prefixo `RAD-AAAAMMDD` de um achado novo não bater com a edição, dá `422`, exceto quando o achado já existe (citação de outro dia).
5. Cada requisição roda numa **transação**: o envio entra inteiro ou não entra nada. Faça isso com uma função SQL `radar_ingerir(payload jsonb)` com `security definer`, chamada via RPC pela edge function.
6. Depois de gravar, recalcula `radar_dias.resumo` e `total_confirmados` (contando só achados novos do dia, até 20).

**Resposta `200`:**
```json
{
  "ok": true,
  "replay": false,
  "dry_run": false,
  "data": "2026-11-17",
  "criados": ["RAD-20261117-007"],
  "atualizados": ["RAD-20261117-004"],
  "sem_mudanca": [],
  "avisos": [],
  "url_dia": "https://gestao.andrelopes.digital/radar?dia=2026-11-17"
}
```

### 5.5 Erros (corpo sempre `{ ok:false, codigo, mensagem, campos?:[{caminho, problema}] }`)
| HTTP | código | O bot deve |
|---|---|---|
| 400 | `JSON_INVALIDO` | não repetir; corrigir o gerador |
| 401 | `CHAVE_AUSENTE` / `CHAVE_INVALIDA` | parar, não repetir e me avisar no chat |
| 409 | `IDEMPOTENCIA_CONFLITO` / `VERSAO_ANTIGA` | não repetir; reconciliar a versão local |
| 413 | `PAYLOAD_GRANDE` (> 512 KB) | dividir o envio |
| 422 | `VALIDACAO` (com `campos[]`) | não repetir; corrigir o item |
| 429 | `LIMITE` (+ header `Retry-After`) | esperar `Retry-After` e repetir |
| 500/502/503/504 | `ERRO_INTERNO` / `INDISPONIVEL` | repetir com backoff: 2 s, 8 s, 30 s; se ainda falhar, deixar numa fila local e reenviar na próxima rotina com a **mesma** `Idempotency-Key` |

**Validação (zod ou equivalente no Deno):**
- Formatos de ID.
- Enums.
- Temas da lista fixa, de 1 a 3.
- URLs só `https?://`, até 2.000 caracteres.
- Datas ISO com offset.
- `texto_whatsapp` com até 12.000 caracteres.
- No máximo 20 achados por envio.
- Campos desconhecidos geram aviso, não erro, para facilitar a evolução.

### 5.6 Limite de requisições
Até 60 requisições por minuto por chave, contadas em `radar_ingestao_log`. Acima disso, `429`. O uso normal fica em menos de 20 por hora.

### 5.7 Fuso horário (atenção)
- O app roda em Cloudflare e o banco grava em UTC. **"Hoje" é sempre calculado em `America/Sao_Paulo`**, no servidor e no cliente: depois das 21h em São Paulo, o UTC já é o dia seguinte.
- Use `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' })` ou `date-fns-tz`.
- Os eventos são exibidos sempre como "17/11/2026 21:04 (Brasília)".

### 5.8 Exemplos de teste para o bot
```bash
curl -s https://uajusldnvzgakffofkhl.supabase.co/functions/v1/radar/saude -H "x-radar-key: $RADAR_INGEST_KEY"
curl -s -X POST "https://uajusldnvzgakffofkhl.supabase.co/functions/v1/radar/eventos?dry_run=1" \
  -H "x-radar-key: $RADAR_INGEST_KEY" -H "Idempotency-Key: TESTE:dry:1" -H "Content-Type: application/json" \
  --data @payload-exemplo.json
```

---

## 6. Segurança

- RLS **ligada** em todas as tabelas `radar_*`, com políticas **só para `authenticated`**:
  - `select` em todas as tabelas `radar_*`;
  - `update` só nas colunas pessoais (`status`, `status_em`, `nota_pessoal`), usando `GRANT UPDATE (colunas)` + política;
  - CRUD em `radar_filtros_salvos`.
- **Nenhuma** política para `anon`. Não copie o padrão `using (true)` para `public`.
- `insert` e `update` dos campos do bot acontecem só pela função `radar_ingerir` (`security definer`, com `search_path` fixo), chamada pela edge function com a service role. A service role nunca sai da edge function.
- Todo conteúdo vem de pesquisa na web e é **não confiável**:
  - renderize como texto;
  - nunca use `dangerouslySetInnerHTML`;
  - converta a marcação do WhatsApp (`*negrito*`, `_itálico_`, `~riscado~`, quebras de linha) com um parser próprio que gere elementos React;
  - links com `target="_blank" rel="noopener noreferrer nofollow"`, apenas http/https.
- Nada de chave em log, em toast ou no front.
- Os registros de `radar_ingestao_log` ficam guardados por 90 dias. Use um job de limpeza se já houver padrão para isso; se não houver, deixe para depois.

---

## 7. UI/UX da aba

### 7.1 Entrada no menu e rota
- No arquivo de navegação, grupo **Pessoal**, adicione:

  ```ts
  { label: "Radar IA", icon: <Radar size={17}/>, to: "/radar", palavras: ["achados","notícias","boletim","curadoria","ia","novidades","radar"] }
  ```

  Ícone `Radar` do lucide; ordem depois de "Habilidades" (confirme comigo).
- Crie a rota `/_authenticated/radar` (arquivo de rota do TanStack Router, no padrão das outras abas) com `validateSearch` (zod) para os filtros.

### 7.2 Filtros (sempre na URL)
Query params, combináveis entre si:

| Parâmetro | Valores |
|---|---|
| `dia` | `AAAA-MM-DD`, ou o intervalo `de` + `ate` |
| `classe` | multi: `excelente,bom,medio` |
| `tema` | multi, slugs da seção 1 |
| `tipo` | multi: `A,B,C` |
| `status` | multi |
| `confianca` | multi |
| `alerta` | `1` |
| `q` | busca de texto |
| `view` | `dia`, `cards`, `tabela`, `calendario` ou `kanban` |

Exemplo: `/radar?dia=2026-11-17&classe=excelente` mostra o dia 17 só com os Excelentes.

Componentes:
- **Barra de filtros:**
  - no desktop: segmentos para classe (🟣🟢🟡), multiselect de temas com badges, seletor de dia ou intervalo (calendar do shadcn, pt-BR), busca com debounce de 300 ms;
  - no mobile: um botão "Filtros (n)" que abre um `Sheet`/`Drawer`.
- **Chips** dos filtros ativos, cada um com ×, e "Limpar tudo".
- **Presets salvos** (`radar_filtros_salvos`): "Salvar filtro atual" e lista em dropdown. Sugestões iniciais:
  - "Só Excelentes hoje";
  - "Mudanças com prazo (tipo B)";
  - "Testando agora".
- A busca usa `busca @@ websearch_to_tsquery('portuguese', q)`.

### 7.3 Visualizações
1. **Dia (padrão):** a nota do dia.
   - Cabeçalho: "Terça, 17/11/2026 · DIA-20261117 · Revisão R1" e setas ← → para trocar de dia (atalhos `j`/`k` no desktop).
   - **Resumo:** contagem por classe, contagem por tema e "x/20 do teto". Se faltarem menos de 4 achados, mostre um aviso suave "Cobertura parcial", com o texto de `cobertura_parcial`; não trate como erro.
   - **Abertura** e **Ficaram de fora** (com o motivo de cada um), recolhíveis.
   - **Cards** ordenados por classe (Excelente → Bom → Médio) e depois pela primeira descoberta. Alertas levam o selo 🚨 e ficam no topo.
   - **Linha do tempo do dia:** abertura, alertas, correções, respostas e encerramento, com horário de Brasília.
   - **Encerramento.**
   - Com filtros ativos, mostra só o que bate e avisa "4 achados ocultos pelo filtro · mostrar".
   - Botão **"Ver como no WhatsApp"**: alterna o texto exato renderizado, com um botão de copiar.
2. **Cards:** grade responsiva com todos os dias filtrados (1 coluna no mobile, 2 no tablet, 3 no desktop), com paginação infinita por dia e separadores de data.
3. **Tabela:** colunas Data, ID, Classe, Título, Temas, Tipo, Confiança, Estágio, Status e Links. Ordenável, com cabeçalho fixo. No mobile vira uma lista compacta.
4. **Calendário:** mês com um ponto colorido por classe em cada dia e o número de achados. Clicar abre a visão Dia daquele dia. Mostra também uma linha do tempo vertical das últimas 2 semanas.
5. **Kanban por status:** colunas Novo, Lido, Testando, Aplicado e Descartado. Arrastar usa o `useKanbanDnd` existente; no mobile, use o menu "Mover para…". Ao mover, o update é otimista (react-query) e mostra o toast "Status atualizado".

### 7.4 Card do achado
- Borda esquerda e selo na cor da classe:
  - 🟣 Excelente: violeta, por exemplo `violet-500`;
  - 🟢 Bom: verde, `emerald-500`;
  - 🟡 Médio: âmbar, `amber-500`.
  - Garanta contraste AA no tema escuro (`theme-color #0e1320`).
- Linha 1: selo da classe, ID em fonte mono (clicar copia) e título.
- Linha 2: badges de tema (cor fixa por tema), tipo (A Aplicação / B Mudança / C Lançamento), confiança e 🚨 quando for alerta. Mostre "Corrigido" quando houver correção, com link para o histórico.
- **Visível sem expandir:** 🧸 Explicando fácil e 👉 Próximo passo, que são o que o André mais usa.
- **Recolhível (Accordion):**
  - O que entrega;
  - Por que importa;
  - Evidência;
  - Estágio/Prontidão;
  - Custo/Esforço;
  - Aplicações ou Mudança;
  - Links.
- Links como botões: "Abrir fonte", "Post no X" e "Link citado no post".
- Ações do André:
  - seletor de status;
  - "Nota pessoal", com textarea e autosave em 800 ms;
  - "Copiar como WhatsApp".

### 7.5 Estados
- **Carregando:** skeletons do tamanho do card.
- **Dia sem edição:**
  - se for hoje antes das 08h15 (horário de Brasília): "O boletim de hoje chega por volta das 08h";
  - nos outros casos: "Sem edição neste dia".
  - Em ambos, ofereça um link para o dia anterior com conteúdo.
- **Filtro sem resultado:** "Nenhum achado com esses filtros" + "Limpar filtros".
- **Erro de rede:** mensagem e botão "Tentar de novo".
- **Atualização durante o dia:** ao voltar para a aba (visibilitychange; já existe um handler parecido no app), ou a cada 5 min com a aba aberta, refazer a busca do dia atual e mostrar "1 alerta novo" com destaque.

### 7.6 Mobile-first e acessibilidade
- Alvo de toque de 44 px ou mais.
- Visões em `Tabs` roláveis.
- Cards em uma coluna e accordions fechados por padrão.
- Filtros em sheet.
- Navegação por teclado; não use só cor para a classe (sempre emoji + texto); `aria-label` nos ícones.

---

## 8. Critérios de aceite e testes

**Backend (testes automatizados com Deno test ou Vitest; SQL via branch ou banco local do Supabase):**
- [ ] `GET /saude` sem chave dá 401; com a chave atual dá 200 com `chave:"atual"`; com a anterior dá 200 com `"anterior"`.
- [ ] O boletim de exemplo cria 1 dia + N achados + o evento de abertura; reenviar a mesma `Idempotency-Key` devolve `replay:true` sem mudar nada.
- [ ] Um alerta às 14h no mesmo dia **atualiza a mesma nota** e não cria outra linha em `radar_dias`.
- [ ] Correção com `versao` 2 gera snapshot, `corrigido=true` e evento; mandar a `versao` 1 de novo dá 409 `VERSAO_ANTIGA`.
- [ ] Ingestão nunca altera `status` nem `nota_pessoal` (teste: marcar "testando", reenviar o achado e conferir que continua "testando").
- [ ] `dry_run` não grava nada nas tabelas de conteúdo e devolve o que seria criado ou atualizado.
- [ ] Payload com tema fora da lista, 4 temas, ID mal formado ou URL `javascript:` dá 422 com `campos[]`.
- [ ] Envio às 22h30 (horário de Brasília) com `edicao_id` do dia vai para o dia de Brasília, não para o dia UTC.
- [ ] O 61º request no mesmo minuto dá 429 com `Retry-After`.
- [ ] Com a anon key, não há como ler nem escrever nenhuma tabela `radar_*` (teste com `supabase-js` anônimo).

**Front:**
- [ ] `/radar?dia=2026-11-17&classe=excelente` mostra só os Excelentes do dia 17; os chips refletem a URL; voltar e avançar no navegador preserva os filtros.
- [ ] Os filtros Dia + Relevância + Tema funcionam juntos em todas as 5 visões.
- [ ] Um dia com 3 achados mostra o aviso de cobertura parcial, e não o estado vazio.
- [ ] "Ver como no WhatsApp" mostra o texto idêntico, com negrito e quebras.
- [ ] Mudar o status no Kanban atualiza Dia, Cards e Tabela.
- [ ] Com 375 px de largura, nada estoura na horizontal, exceto o Kanban, que rola de propósito.
- [ ] Conteúdo com `<script>` no título aparece como texto puro.

---

## 9. Plano por fases (YAGNI)

**Fase 1 — MVP (fazer agora):**
1. Migration das 6 tabelas + RLS + `radar_ingerir`.
2. Edge function `radar` com `saude`, `eventos`, `dry_run`, validação, idempotência, log e limite de requisições.
3. Aba `/radar` com as visões **Dia, Cards e Tabela**, os filtros na URL, os chips e a busca.
4. Status por achado e nota pessoal.
5. Visões **Calendário** e **Kanban**, reaproveitando os componentes existentes.
6. Carga inicial do dia 17/11/2026 com o payload de exemplo (eu forneço o JSON real), **só depois** de eu aprovar.

**Fase 2 (depois de 1–2 semanas de uso):**
- Presets salvos, se ainda não estiverem prontos.
- Selo "novo desde a última visita".
- Exportar o dia ou o filtro em Markdown/CSV.
- Endpoint de leitura `GET /radar/feedback?desde=` com `RADAR_READ_KEY`. Ele devolve status, notas pessoais e avaliações para o bot ajustar a curadoria.
- Avaliação 👍/👎 por achado.
- Realtime do Supabase no dia atual.

**Fase 3 (só se fizer falta):**
- Painel de tendências por tema (8 semanas).
- Resumo semanal gerado pelo bot como nota de semana.
- Vínculo do achado a um cliente (`cliente_id`, reaproveitando o `ClientePicker`) ou a uma demanda ("virar demanda", como em Ideias).
- Detecção de "mesmo assunto" entre dias.

---

## 10. Fora de escopo
- Corrigir o RLS das tabelas antigas: abra isso como tarefa separada e me mostre o SQL antes.
- Envio para WhatsApp: continua com o bot.
- Edição do conteúdo do achado pela UI: o conteúdo é do bot; o André edita só os campos pessoais.

---

## 11. O que me entregar no final

1. Um resumo do que foi implementado, por fase, e os links dos commits ou PR.
2. A spec em `docs/superpowers/specs/2026-11-17-radar-ia-design.md`, com as divergências encontradas em relação à seção 2.
3. O nome da migration e a confirmação de que foi aplicada (ou o aviso de que está pronta, aguardando minha aprovação).
4. **Para o bot Radar IA:**
   - **URL de saúde:** `https://uajusldnvzgakffofkhl.supabase.co/functions/v1/radar/saude`, ou a URL real se mudar.
   - **URL de ingestão:** `…/functions/v1/radar/eventos`.
   - **Header da chave:** `x-radar-key`; `schema_versao` = 1.
   - **Como gerar a chave:** `openssl rand -base64 48 | tr -d '\n'`. Grave com `supabase secrets set RADAR_INGEST_KEY=<valor> --project-ref uajusldnvzgakffofkhl` ou pelo painel (Edge Functions → Secrets). **Não cole a chave em commit, no grupo do WhatsApp nem em issue.** Eu passo para o bot por um canal seguro.
   - **Passos da rotação**, conforme a seção 5.1.
   - Um `payload-exemplo.json` válido (o da seção 5.3 completo) e a resposta real de um `dry_run` com ele.
5. O resultado dos testes da seção 8: passou ou falhou, item por item.
6. Prints da aba no celular (375 px) e no desktop, nas 5 visões.
