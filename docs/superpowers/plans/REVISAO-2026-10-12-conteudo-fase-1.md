# Revisão do plano Conteúdo, Fase 1 (itens C1 a C13)

Revisor: Sonnet em esforço alto. Conferi cada relatório, abri os arquivos, rodei os checks e cruzei as interfaces entre os itens.

Checks gerais ao final (depois dos meus ajustes): `npm test` 757 passam, 0 falham; `npx tsc --noEmit -p .` sem erro; `node --test src/lib/conteudoRegras.test.ts` 21 passam; `deno check --node-modules-dir=none --no-lock` passa em `conteudo/index.ts`, `etapas.ts`, `claude.ts`, `arquivos.ts`, `montagem.ts`, `drive.ts` e `gmn/index.ts`. O C4 diz que o check precisou de `--node-modules-dir=auto`; com `none` ele passa, então nada a corrigir no comando do plano.

Banco (somente leitura): as 3 tabelas têm RLS ligada; `conteudo_clientes` e `conteudo_posts` têm a policy `*_all`; `conteudo_cofre` NÃO tem policy (a chave pública não lê). O cron `conteudo-passo` está ativo (`* * * * *`) e aponta para o projeto novo. A função `conteudo_aprovar` existe (invoker). Rodei em transação somente leitura as subconsultas de `jsonb_agg ... WITH ORDINALITY` e do `EXISTS` com `jsonb_array_elements`: devolvem o `Midia` certo (`chave`, `tipo: imagem`, `largura 1080`, `altura 1350`), igual ao tipo `Midia` de `supabase/functions/instagram/meta.ts`. `ig_posts` aceita `tipo` foto/carrossel e `rede` instagram.

## C1 | APROVADO (revisão reforçada)

- Migration relida inteira. Colunas e statuses batem com `etapas.ts`, `index.ts` e `src/lib/conteudo.ts` (texto, imagens, montando, aguardando, aprovado, descartado, erro; `processando_desde`, `erro_etapa`, `tentativas`, `aviso`, `pedidos`).
- `conteudo_aprovar`: `FOR UPDATE` com filtro `status = 'aguardando'` serializa aprovações simultâneas (a segunda não encontra o post e dá erro claro). Valida data futura, conta do Instagram e lâminas montadas. `ig_post_id` é UNIQUE. Tipo `foto` para 1 lâmina, `carrossel` para mais.
- Cron só chama a função quando há post livre (mesma regra de 10 min do `etapas.ts`).
- Aplicada em produção e confirmada por mim nas consultas acima. Nada a ajustar.
- Observação sem ação: as tabelas ganham os GRANT padrão do Supabase para anon; o que segura `conteudo_cofre` é a RLS sem policy, como o plano manda.

## C2 | AJUSTADO

- Regras puras e testes conferidos: `postsDaSemana` (dia 0 = domingo cai em +6 dias da segunda, certo), `instanteBrasilia` (-03:00 fixo), `segundaDaSemana`, `recortarLog`, `proximoPilar`, `aplicarAlteracoes` (não muta a entrada), `validarMolde`, `motivosDoTexto`. `motivosSaude` no GMN só acrescentada, sem mexer no resto.
- Corrigi em `supabase/functions/conteudo/regras.ts`:
  1. `preencherMolde`: `{{constructor}}`, `{{toString}}` e `{{__proto__}}` pegavam funções/objetos herdados de `valores` e estouravam em `escaparHtml`. Agora só valor string vale; o resto vira vazio.
  2. `htmlParaRender`: os `replace` com texto de substituição interpretavam `$&`, `$'` e `` $` `` vindos do `ajuste_css` (escrito pela IA) ou do CSS das fontes. Troquei por função de substituição.
- Teste novo no fim de `src/lib/conteudoRegras.test.ts` cobre os dois casos.
- **Mexi em `supabase/functions/`: a função `conteudo` precisa de novo deploy.**

## C3 | APROVADO

- `prompts.ts` confere com o plano; esquemas com `additionalProperties: false` e `required` completos (exigência da saída estruturada). `promptTexto` usa `o.moldes[t]!` e depende de `faltaParaGerar`/`etapaTexto` terem barrado molde ausente (barram). O aviso do relatório sobre o arquivo de teste alterado em paralelo não deixou rastro: os 4 testes novos estão no fim e passam.

## C4 | APROVADO

- `gerarImagem` com `size` e `formato` opcionais, mantendo 1536x1024 PNG como padrão (chamadas antigas do GMN intactas; `gmn/index.ts` passa no deno check).
- `arquivos.ts` usa os mesmos secrets, o mesmo `aws4fetch@1.0.20` e o mesmo bucket da função `r2`; as chaves ficam em `instagram/conteudo/...`, prefixo que o `r2` libera para link assinado.
- `claude.ts`: erros mapeados sem vazar a chave. Os parâmetros `betas`/`fallbacks`/`output_config` só dá para validar contra a API real (C14).

## C5 | APROVADO

- `render.ts`: 429 vira `LimiteCloudflare` (não conta tentativa); falha normal vira erro com status. `drive.ts` limita a 4 níveis e 60 pastas. `montagem.ts` embute fontes e logos como `data:`. Confere com o uso em `etapas.ts` e `moldes.ts`. O corpo da API de screenshot do Cloudflare (`waitForSelector`, `gotoOptions`) só se confirma no teste real.

## C6 | AJUSTADO (revisão reforçada)

- Trava: o `update ... or(livre())` com `select().maybeSingle()` é atômico; só uma passada pega o post. Toda gravação confere o status; o `catch` conta tentativa, vai a `erro` na terceira e guarda `erro_etapa` (usado por `tentarDeNovo`). `LimiteCloudflare` não conta tentativa e deixa a trava por 10 min, como o desenho pede. Orçamento de 90 s por etapa com gravação a cada lâmina.
- Corrigi em `supabase/functions/conteudo/etapas.ts`:
  1. `etapaTexto` com `pasta_cofre` nulo consultava `pasta = ''`, onde mora a linha especial `__pastas__`; o "contexto" virava a lista de pastas e a IA escreveria sem cofre. Agora dá erro claro.
  2. O aviso "Limite do Cloudflare atingido..." ficava preso no post mesmo depois da montagem terminar. A montagem concluída agora limpa esse aviso (e só ele; o aviso de imagem que falhou continua).
- Risco aceito: uma lâmina com busca no Drive + Claude + OpenAI pode passar de 150 s; a função cai e a trava expira em 10 min, sem perder o que já foi gravado.
- **Mexi em `supabase/functions/`: redeploy da `conteudo`.**

## C7 | AJUSTADO (revisão reforçada)

- Roteador: `passo` aberta; `cofre_hashes` e `cofre_sync` só com `x-cofre-key` (comparação em tempo constante, sem chave configurada tudo é negado); as demais ações (inclusive `cofre_ler`, que a tela usa e só devolve nomes de pastas e as notas de Design System/tom de voz) exigem `acessoLiberado`, igual ao GMN. `verify_jwt = false` no `config.toml`. `conteudo_cofre` só é tocada pela chave de serviço.
- `gerarSemana`: `upsert` com `ignoreDuplicates` e `onConflict` bate com a UNIQUE da migration; pula clientes sem requisitos com motivo.
- `ajustar`: grava só se o post ainda está `aguardando` (409 caso contrário). `gerarMolde` relê os moldes antes de gravar.
- Corrigi em `supabase/functions/conteudo/index.ts`: o pedido de mudança podia devolver legenda acima de 2.200 caracteres e o post seria aprovado e falharia na publicação. Agora responde 400 com a explicação.
- **Mexi em `supabase/functions/`: redeploy da `conteudo`** (junto com C2 e C6).

## C8 | APROVADO

- Script só lê o cofre, importa `regras.ts` (roda no Node 24), envia lotes de até 1,5 MB, a primeira chamada leva a lista de pastas e a lista de remoções cobre arquivos apagados. Primeira execução funciona antes de haver cliente ligado (envia só a lista de pastas). Não foi executado (correto).

## C9 | AJUSTADO

- Camada de dados confere com as ações do `index.ts` (`cofre_ler`, `drive_pastas`, `molde`, `molde_ajustar`, `semana`, `ajustar`, `passo`) e com a RPC `conteudo_aprovar(p_post, p_quando)`. Toda mudança de post usa `mudarSe` com guarda de status. Chaves do R2 `instagram/conteudo/...` batem com `arquivos.ts` e com o prefixo liberado no `r2`.
- Corrigi em `src/lib/conteudo.ts` (`usarAjusteNoMolde`): o mesmo problema do `$&` no `replace` do CSS de ajuste; troquei por função.

## C10 | APROVADO

- Clientes, gaveta, Kit e Pilares/agenda usam só nomes que existem em `conteudo.ts`/`regras.ts`; agenda salva ordenada de segunda a domingo, horários da lista `HORARIOS` do GMN; fontes e logos gravam sozinhas sem apagar o rascunho. Sem divergência.

## C11 | APROVADO

- Rota `/conteudo`, item "Conteúdo" no menu e as 11 inserções à mão no `routeTree.gen.ts` (21 linhas, 0 removidas), espelhando as do Instagram. A ordem dentro do arquivo pode ser reordenada na próxima vez que o gerador rodar; é inofensivo.

## C12 | APROVADO

- `AbaMoldes` cria um molde por vez, mostra prévia pelo `urlArquivo`, aprova, pede mudança e refaz; ligada na gaveta. Sem divergência.

## C13 | AJUSTADO

- Semana (dia de Brasília via `hojeBrasilia(new Date(...))`, tempo real pelo canal do Supabase) e PostDialog conferem com `conteudo.ts`. Aprovar é bloqueado com edição não salva e com lâmina sem JPG; a data futura é validada no banco.
- Corrigi em `src/components/conteudo/PostDialog.tsx`: o campo da legenda não tinha limite; ganhou `maxLength={LEGENDA_MAX}`.

## Pontos vistos e deixados como estão (sem bug que justifique mudar)

- `trocarData` não valida data futura (a aprovação valida). Post em `erro` só permite "Tentar de novo", não "Descartar".
- `aprovarMolde` e `usarAjusteNoMolde` fazem ler-e-gravar o JSON de moldes pelo navegador; uma geração de molde terminando no mesmo segundo pode se sobrepor (janela muito pequena; `gerarMolde` já relê antes de gravar).
- `ajustar` não revalida o limite de cada campo editado pela IA (o prompt pede e o CSS corta); a legenda agora é validada.
- Parâmetros reais do Claude (betas/fallbacks) e do Cloudflare (screenshot por HTML) só se provam no teste real do C14.

## Resumo para o deploy

- Arquivos de função alterados por mim: `supabase/functions/conteudo/regras.ts`, `etapas.ts`, `index.ts`. Precisa **redeploy da função `conteudo`**. A função `gmn` não foi tocada por mim.
- Arquivos do site alterados por mim: `src/lib/conteudo.ts`, `src/components/conteudo/PostDialog.tsx`, `src/lib/conteudoRegras.test.ts`.
- Nenhum commit, push, deploy ou escrita no banco feitos por mim. As marcas `[r]` não foram mexidas.

RESULTADO: aprovados 8, ajustados 5, refazer 0
