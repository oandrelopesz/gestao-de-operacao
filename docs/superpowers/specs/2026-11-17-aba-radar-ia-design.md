# Aba Radar IA (seção Pessoal): design da Fase 1

Data: 17/11/2026, revisado em 18/11/2026 (depois do login Google obrigatório e do banco fechado). Status: **aguardando aprovação do André**. Nada foi implementado, migrado ou publicado.

Fonte: `docs/radar-ia/prompt-aba-radar-ia.md` (especificação completa, 11 seções). Este documento registra só o que o código real muda na especificação, o que vai ser criado e a ordem da Fase 1. Onde este texto não disser nada, vale a especificação.

## 1. Divergências entre a especificação (seção 2) e o código

| # | Especificação diz | Código real (18/11/2026) | Efeito no desenho |
|---|---|---|---|
| D1 | Auth por e-mail e senha (`signInWithPassword`) em `/login` | Desde 17/11 o login é **só Google** (`login.tsx`, `signInWithIdToken`), obrigatório: `LoginObrigatorio` em `src/routes/_authenticated.tsx` manda para `/login` quem não tem sessão. Provedor Email e cadastro novo desligados no Supabase. Usuário único `contato@andrelopes.digital`. | A leitura pela sessão (`authenticated`), como a especificação quer, funciona sem nada extra. |
| D2 | `_authenticated.beforeLoad` devolve `{ session: null }`; "confirme onde a proteção acontece" | O `beforeLoad` continua assim; a proteção acontece no componente `LoginObrigatorio` (cliente) e, de verdade, no banco (D3). | Nenhum. |
| D3 | 13 tabelas sem RLS e policies `using (true)` para `public` (seção 2.1) | **Já corrigido em outra tarefa** (17/11, migration `20261117140000_seguranca_fase4.sql`): RLS em todas as tabelas, uma policy `so_andre` `for all to authenticated` travada em `auth.jwt() ->> 'email' = 'contato@andrelopes.digital'`, `anon` sem acesso a tabelas, views, sequences e funções (inclusive objetos futuros, por `alter default privileges`). | As tabelas `radar_*` seguem o mesmo padrão `so_andre`, com permissões mais estreitas (seção 3.1). A migration não toca nada existente. |
| D4 | Projeto Lovable, repositório não encontrado | Fora do Lovable desde 07/10: repositório no GitHub, site na Cloudflare, **push na `main` = deploy do site**. | `git push` também só com ordem sua. |
| D5 | Arquivo de navegação é um chunk `nav` | `src/lib/nav.tsx` (`NAV_GROUPS`). Pessoal = Financeiro, Cursos, Livros, Habilidades, Ver depois (confere). `/ideias` está em Operação e `/notas` em Ferramentas. | Item novo entre Habilidades e Ver depois (pergunta 1). |
| D6 | Colunas `criado_em` / `atualizado_em` e trigger "igual ao das outras tabelas" | O repo usa `created_at` / `updated_at` e `public.set_updated_at()`. | Colunas de controle em inglês, como o repo. Campos de negócio do payload ficam como na especificação. |
| D7 | `iguais()` de `gmn/acesso.ts` | Existe em `gmn/acesso.ts` e em `_comum/acesso.ts`, mas em nenhum dos dois é exportada. | `export` em `iguais` de `_comum/acesso.ts` (uma palavra, sem mudar comportamento nem redeploy das outras funções). |
| D8 | Testes Deno test ou Vitest, SQL em branch ou banco local | Sem Deno, Vitest nem Postgres local. Padrão do repo: `node --test src/lib/*.test.ts` (Node 24, módulos puros). | Lógica pura em módulos sem `Deno.*`, testada com `node --test`. SQL e HTTP testados contra o banco e a função reais, em dias de teste do ano 2000, com limpeza no fim (seção 6). |
| D9 | Tipos `Database` do supabase-js | Tabelas novas não entram em `src/integrations/supabase/types.ts` (gerado). | `supabase.from("radar_x" as any)`, como o resto do app. |
| D10 | shadcn completo | Faltam `accordion.tsx` e `drawer.tsx`. `@radix-ui/react-accordion` já está no `package.json`. | Crio só `accordion.tsx`. Filtros no celular usam o `Sheet` existente. Nenhuma dependência nova. |
| D11 | `useKanbanDnd` no Kanban de status | O hook é feito para colunas com ordem manual (`ordem`, persistência de ordem). O Radar só muda o status. | Uso o hook se encaixar sem remendo; se não, `DndContext` do `@dnd-kit/core` (já instalado). Registro a escolha aqui. |
| D12 | `date-fns-tz`; zod no Deno | `date-fns-tz` não está instalado. | Fuso com `Intl.DateTimeFormat`. `validateSearch` à mão, como as outras rotas. Validação da função em TypeScript puro (testável no Node), sem `npm:zod`. |
| D13 | `hash_conteudo` e `payload_sha256` calculados na função | O Postgres já normaliza a ordem das chaves no `jsonb`. | Os dois hashes saem no SQL: `sha256(convert_to(x::text, 'utf8'))`. Um módulo a menos. |
| D14 | Registro de funções | `supabase/config.toml` lista `verify_jwt = false` por função. | Acrescento `[functions.radar] verify_jwt = false`. |

Confere sem divergência: React + Vite + TanStack Start/Router (rotas por arquivo em `src/routes/_authenticated/`), shadcn/Radix, Tailwind, lucide, sonner, react-query, date-fns pt-BR, `@dnd-kit`, Cloudflare, projeto Supabase `uajusldnvzgakffofkhl` (sa-east-1), migrations `AAAAMMDDHHMMSS_nome.sql` (última: `20261117140000_seguranca_fase4`), edge functions Deno com `esm.sh`, `cors`, helper `json()`, chave própria em header.

## 2. Acesso (decidido pelo código)

- **Bot escreve** só pela função `radar`, com `x-radar-key`. A função chama a RPC `radar_ingerir` com a service role, que nunca sai da função.
- **A aba lê** direto pelo supabase-js com a sessão do seu login Google (papel `authenticated`), como a especificação recomenda. A sessão do app já leva o JWT; a policy `so_andre` libera só o seu e-mail.
- A função `radar` não é chamada pelo navegador: sem CORS e sem rotas de leitura.

## 3. O que vai ser criado

### 3.1 Banco: `supabase/migrations/20261118120000_radar_ia.sql`

Só objetos novos, idempotente (`if not exists`, `create or replace`, enums em `do $$ ... exception when duplicate_object`).

- Enums `radar_classe`, `radar_tipo`, `radar_confianca`, `radar_status`, `radar_evento` (valores da especificação).
- Tabelas `radar_dias`, `radar_achados` (com `busca` tsvector gerada e os índices da especificação), `radar_achado_versoes`, `radar_eventos`, `radar_ingestao_log`, `radar_filtros_salvos` (criada agora, UI na Fase 2). Colunas de controle `created_at`/`updated_at` com `set_updated_at`. `comment on table` no estilo "Aba Radar IA: ...".
- Trigger: ao mudar `status`, grava `status_em = now()`.
- **Permissões** (o padrão do Supabase dá tudo ao `authenticated` em tabela nova; aqui eu estreito):
  - RLS ligada nas 6 tabelas, policy `so_andre` (mesmo e-mail da fase 4).
  - `revoke all` de `anon` e `authenticated`; depois `grant select` ao `authenticated` em todas.
  - `grant update (status, nota_pessoal)` em `radar_achados` (o `status_em` vem do trigger).
  - `grant select, insert, update, delete` em `radar_filtros_salvos`.
  - `radar_ingestao_log`: sem acesso para o `authenticated` (só a função lê e grava).
- **Função `radar_ingerir(p_payload jsonb, p_idem text, p_dry_run boolean)`** `returns jsonb`, `security definer`, `set search_path = public, pg_temp`, `execute` revogado de `public`, `anon` e `authenticated`, concedido só a `service_role`. Numa transação:
  1. Trava pela chave de idempotência (`pg_advisory_xact_lock`) e procura no log um envio aceito com a mesma chave. Mesmo `payload_sha256`: devolve a resposta guardada com `replay: true`. Hash diferente: `409 IDEMPOTENCIA_CONFLITO`.
  2. `edicao_id` define `data`. Upsert do dia (`revisao`, abertura, encerramento, `cobertura_parcial`).
  3. Por achado: não existe, cria. Mesmo `hash_conteudo`, vai para `sem_mudanca`. `versao` maior, grava snapshot em `radar_achado_versoes` e atualiza só campos do bot. `versao` menor ou igual com hash diferente, o envio inteiro volta `409 VERSAO_ANTIGA`, com o ID em `campos[]` (a transação é tudo ou nada, como a especificação pede no item 5.4.5). Prefixo `RAD-AAAAMMDD` de achado novo diferente da edição: `422`. Achado já existente citado em outro dia não muda de dia.
  4. Eventos por tipo de envelope (`abertura`, `alerta`, `correcao` com snapshot e `corrigido = true`, `resposta`, `encerramento`).
  5. Recalcula `resumo` (por classe, por tema, `fora`) e `total_confirmados` a partir de `radar_achados`. Mais de 20 achados novos no dia: `422 LIMITE_DIA`.
  6. Grava a linha do log na mesma transação, com a resposta, para o replay não ter janela de corrida.
  7. **Nunca** escreve `status`, `status_em` nem `nota_pessoal`.
  - `dry_run`: roda o mesmo caminho dentro de um sub-bloco que é desfeito no fim e devolve o que mudaria.
- Retenção de 90 dias do log: fica para a Fase 2.

### 3.2 Edge function `radar` (`supabase/functions/radar/`)

- `validar.ts` (puro, sem `Deno.*`): envelope e achados. IDs (`DIA-\d{8}`, `RAD-\d{8}-\d{3}`), enums, 1 a 3 temas da lista fixa sem repetição, URLs só `http(s)` até 2.000 caracteres, datas ISO com offset, `texto_whatsapp` até 12.000, até 20 achados, `schema_versao = 1`, campos obrigatórios por tipo de envelope. Campos desconhecidos geram aviso, não erro. Devolve `campos: [{caminho, problema}]`.
- `index.ts`:
  - `GET /radar/saude`: `{ ok, schema_versao: 1, agora_sp, data_sp, chave: "atual" | "anterior" }`; sem chave ou chave errada, 401.
  - `POST /radar/eventos`, `?dry_run=1` ou header `x-radar-dry-run: 1`. `Idempotency-Key` obrigatória.
  - Chave: `RADAR_INGEST_KEY` e `RADAR_INGEST_KEY_ANTERIOR`, comparação com `iguais` (D7); `chave_digest` = 8 primeiros hex do sha256. Segredo ausente ou curto: 503, nunca aceita sem chave.
  - Ordem: 401, 413 (acima de 512 KB), 400 `JSON_INVALIDO`, 429 `LIMITE` com `Retry-After` (60 por minuto por `chave_digest`, contado no log), 422 `VALIDACAO`, RPC, 500 `ERRO_INTERNO`.
  - Log de toda requisição, inclusive erros e dry run, sem a chave e sem o corpo. O envio aceito é gravado pela RPC (passo 6 acima).
  - `OPTIONS` responde sem `Access-Control-Allow-Origin`.
  - Resposta 200 no formato da especificação, com `url_dia` = `https://gestao.andrelopes.digital/radar?dia=AAAA-MM-DD`.
- `supabase/config.toml`: `[functions.radar] verify_jwt = false`.

### 3.3 Front

Arquivo existente tocado: só `src/lib/nav.tsx` (item "Radar IA", ícone `Radar`, `palavras` da especificação). Arquivos novos:

- `src/routes/_authenticated/radar.tsx`: rota com `validateSearch` à mão (`dia`, `de`, `ate`, `classe`, `tema`, `tipo`, `status`, `confianca`, `alerta`, `q`, `view`). Filtros sempre na URL; a busca usa `replace` com debounce de 300 ms; voltar e avançar preservam.
- `src/lib/radar.ts` (puro): tipos, rótulos e cores por classe, tema e tipo; "hoje" e rótulos de data em `America/Sao_Paulo`; filtros de e para a URL; ordenação (alerta, classe, primeira descoberta); tokenizador do texto do WhatsApp (`*negrito*`, `_itálico_`, `~riscado~`, quebras), que devolve pedaços de texto, nunca HTML.
- `src/lib/radarDados.ts`: consultas react-query (dia, achados filtrados no servidor com `in`, `overlaps` nos temas e `textSearch` `websearch` português na busca, calendário do mês, eventos) e a mutação otimista de `status` e `nota_pessoal`, com toast "Status atualizado".
- `src/components/radar/`: `BarraFiltros` (segmentos de classe com emoji e texto, temas, tipo, status, confiança, alerta, dia ou intervalo, busca, chips com ×, "Limpar tudo", `Sheet` "Filtros (n)" no celular), `CardAchado` (Explicando fácil e Próximo passo visíveis, o resto em Accordion, ID mono que copia, selo "Corrigido", links só http(s) com `rel="noopener noreferrer nofollow"`, status, nota pessoal com autosave de 800 ms, "Copiar como WhatsApp"), `TextoWhatsapp`, `VisaoDia` (cabeçalho, setas e atalhos `j`/`k`, resumo com "x/20 do teto", cobertura parcial, abertura e "ficaram de fora" recolhíveis, cards, linha do tempo em horário de Brasília, encerramento, "n achados ocultos pelo filtro · mostrar", "Ver como no WhatsApp" com copiar), `VisaoCards`, `VisaoTabela`, `VisaoCalendario`, `VisaoKanban`.
- `src/components/ui/accordion.tsx` (D10).
- Estados: skeleton, "O boletim de hoje chega por volta das 08h" (antes das 08h15 de Brasília) ou "Sem edição neste dia" com link para o dia anterior com conteúdo, filtro sem resultado, erro com "Tentar de novo". Dia atual refaz a busca ao voltar para a aba e a cada 5 min e destaca alerta novo.
- Mobile-first: visões em `Tabs` roláveis, alvos de 44 px, uma coluna, accordions fechados.
- Nada vindo do bot é interpretado como HTML; sem `dangerouslySetInnerHTML`.

### 3.4 O que NÃO será tocado

Tabelas, telas, policies e funções existentes. Únicas exceções: o item do menu em `nav.tsx` e o `export` de `iguais` em `_comum/acesso.ts`. O `routeTree.gen.ts` é regenerado pelo plugin do TanStack, como em toda aba nova.

## 4. Ordem de execução (commits pequenos, TDD na lógica)

1. Aprovação deste plano e das perguntas da seção 8.
2. Testes primeiro, depois `validar.ts` e `src/lib/radar.ts` (`node --test`).
3. Migration escrita e revisada.
4. `radar/index.ts`, `config.toml` e o `export`.
5. **Produção, só com sua aprovação:** aplicar a migration, gerar `RADAR_INGEST_KEY` e gravar o segredo, publicar a função. Rodar os testes de API e de permissão (seção 6).
6. Front por camadas, cada uma com commit: nav e rota com filtros, Dia, Cards e Tabela, status e nota pessoal, Calendário, Kanban.
7. Testes do front com Playwright (`tools/auditoria-mobile/sessao-teste.mjs` dá o login), 375 px e desktop, prints das 5 visões.
8. Entrega (seção 11 da especificação). `git push`, que publica o site, só com sua ordem.

## 5. Entrega para o bot

URL base `https://uajusldnvzgakffofkhl.supabase.co/functions/v1/radar` (`/saude`, `/eventos`), header `x-radar-key`, `schema_versao: 1`. Chave gerada no PC com Node (equivalente a `openssl rand -base64 48`), gravada com `supabase secrets set RADAR_INGEST_KEY=... --project-ref uajusldnvzgakffofkhl`, guardada só em `%USERPROFILE%\.gestao\radar.env`, nunca impressa na conversa nem commitada. Rotação nos 6 passos da seção 5.1 da especificação.

## 6. Testes e critérios de aceite

Unitários (`node --test`): IDs, enums, 0, 1, 3 e 4 temas, tema fora da lista, URL `javascript:`, data sem offset, 21 achados, campo desconhecido vira aviso; filtros de e para a URL; hoje em Brasília às 22h30 (UTC já é o dia seguinte); ordenação; tokenizador (negrito, itálico, riscado, quebras, `<script>` continua texto).

Integração contra a função e o banco de produção (`tools/radar/testar-api.mjs`, lê a chave de `%USERPROFILE%\.gestao\radar.env`), com o payload de exemplo da especificação adaptado para **dias de teste do ano 2000** (`DIA-20000101` e vizinhos) e limpeza por SQL no fim. A carga real do dia 17/11 fica para quando você mandar o JSON real.
- `GET /saude`: sem chave 401; chave atual 200 `"atual"`; anterior 200 `"anterior"` (gravo uma anterior temporária e apago).
- `dry_run=1` devolve o que seria criado e não grava em tabela de conteúdo.
- Envio real do boletim cria dia, achados e evento `abertura`; **o mesmo envio repetido** devolve `replay: true` e as contagens no banco não mudam. Mesma chave com payload diferente dá 409.
- Alerta no mesmo dia atualiza a mesma linha de `radar_dias`.
- Correção `versao` 2 gera snapshot, `corrigido = true` e evento; reenviar `versao` 1 dá `VERSAO_ANTIGA`.
- Marcar "testando" com a sessão do André e reenviar o achado mantém "testando".
- Tema fora da lista, 4 temas, ID ruim e `javascript:` dão 422 com `campos[]`.
- Envio às 22h30 de Brasília com `edicao_id` do dia vai para o dia de Brasília.
- 61ª requisição no minuto dá 429 com `Retry-After`.
- Chave pública (`anon`) não lê nem escreve nenhuma `radar_*`; sessão de outro e-mail vê zero linhas; a sessão do André não consegue alterar campo do bot (só `status` e `nota_pessoal`) nem chamar `radar_ingerir`.

Front (Playwright, app local com login): `/radar?dia=...&classe=excelente`, chips refletindo a URL, voltar e avançar, dia + relevância + tema juntos nas 5 visões, cobertura parcial com 3 achados, "como no WhatsApp" idêntico, status do Kanban refletido em Dia, Cards e Tabela, 375 px sem rolagem horizontal (exceto o Kanban), título com `<script>` como texto.

Resultado na entrega: item por item, passou ou falhou.

## 7. Fora da Fase 1

Presets salvos na UI; selo "novo desde a última visita"; exportar Markdown e CSV; `GET /radar/feedback` com `RADAR_READ_KEY`; avaliação 👍/👎; realtime do dia atual; limpeza de 90 dias do log; carga inicial do dia 17/11 (seu JSON real); tendências, resumo semanal e vínculo a cliente ou demanda (Fase 3).

## 8. Perguntas para a aprovação

1. **Menu:** "Radar IA" logo depois de "Habilidades", como na especificação?
2. **Produção:** quando chegar no passo 5, posso aplicar a migration, gravar o segredo e publicar a função sem parar de novo? E no fim, posso dar `git push` (publica o site)?
