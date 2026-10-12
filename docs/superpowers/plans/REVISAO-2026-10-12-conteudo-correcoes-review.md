# Revisão: aba Conteúdo, correções da code review (12/10/2026)

Plano: `2026-10-12-conteudo-correcoes-review.md`. Commits revisados: `5a56aef`, `de1c6cc`, `769dc27`. Rastreei os chamadores de cada correção (função `conteudo`, `src/lib/conteudo.ts`, componentes). Nada foi commitado, publicado ou testado em banco.

## Por achado

1. **Ligar cliente novo não puxava o kit** (U1 + U2): APROVADO. `ligarCliente` devolve o id de `conteudo_clientes` (`insert(...).select("id").single()`) e `Clientes.tsx` passa esse id a `kitDoCofre`.
2. **Tentativa só contava no catch** (E1): APROVADO. A trava grava `tentativas + 1`; com `>= 3` o post vai para `erro` (mesma condição `livre()`); sucesso grava 0. Caminhos verificados: `LimiteCloudflare` usa `post.tentativas - 1` e `post` é a linha devolvida pela trava, então o valor é pelo menos 1 e nunca fica abaixo de 0; o erro comum usa o valor já somado; `tentarDeNovo`, `trocarFormato` e `ajustar` (index.ts) zeram `tentativas`; etapas parciais (imagens e montagem param em 90 s) terminam com sucesso e zeram.
3. **Refazer/Pedir mudança trocava a versão aprovada** (R1 + M1 + E1 + I1d + U1c + U3c + U5): AJUSTADO.
   - Verificado: `moldesEmUso` é usado em `faltaParaGerar` (Clientes, PostDialog, `gerarSemana`), em `avancar` (texto, imagens e montagem recebem `c.moldes` já filtrado), em `ajustar` (`promptAjuste`) e no PostDialog (limites dos campos). `gerarMolde` guarda a aprovada em `anterior` (sem o `anterior` aninhado) e mantém o `anterior` quando se refaz uma versão ainda não aprovada. `aprovarMolde` grava sem `anterior` e remonta os posts com o aprovado.
   - Defeito achado e corrigido: `usarAjusteNoMolde` (botão "Usar este ajuste nos próximos posts") aplicava o CSS na versão NÃO aprovada, mas o post foi montado com a `anterior`. O ajuste não valia para os próximos posts e se perdia ao aprovar. Agora, se o molde está aguardando aprovação e tem `anterior`, o CSS vai para a `anterior` (sem mexer na versão). Arquivo: `src/lib/conteudo.ts`.
   - Refazer sem pedido só pula a IA quando o molde existe, não tem `previa_chave` e `pedido === undefined`. Molde com prévia continua passando pela IA. OK.
4. **Posts de dias que já passaram** (R1f + I1a): APROVADO. `postsDaSemana(..., depoisDe)` filtra por `Date.parse(agendado_para) > depoisDe`; `gerarSemana` passa agora + 1 h. Único chamador.
5. **Post em erro não descartável / dia ocupado** (U1b + U3): APROVADO. `descartarPost` aceita `aguardando` ou `erro`, usa `mudarSe(post.id, post.status, ...)` e grava `origem_data: null` (coluna anulável; o UNIQUE aceita vários nulos; `gerarSemana` faz upsert por `cliente,origem_data` e recria o dia). O PostDialog tem os dois botões em seções exclusivas (aguardando ou erro), então a função `descartar()` e o estado `confirmar` compartilhados não colidem.
6. **Binário acima de ~3 MB** (S1): APROVADO. O filtro deixa de fora binário acima de 3.000.000 bytes e texto acima de 1.000.000 caracteres, com a linha `fora: pasta/caminho (N MB, limite X MB)`. `node --check` passou.
7. **`saude` sobrescrita pela IA** (I1b): APROVADO. `saude: c.saude || !!r.saude`. Em `so_fontes` o `r.saude` é false e o valor manual fica.
8. **Prévia falha e o HTML pago se perde** (M1): AJUSTADO.
   - O molde novo é gravado antes da prévia (`previa_chave: null`), a falha devolve 503 com a mensagem pedida, e "Refazer" sem pedido gera só a prévia (`gravarPrevia`), relendo os moldes antes de gravar e preservando `anterior`.
   - Defeito achado e corrigido: na falha, o `AbaMoldes` só mostrava o toast e não recarregava, então o card continuava sem o molde recém-gravado e sem a mensagem "Prévia não gerada". Adicionei `recarregar()` nos catch de `criar` e `ajustar`. Arquivo: `src/components/conteudo/AbaMoldes.tsx`.
9. **Rascunho do Kit não voltava ao salvo** (U4a): APROVADO. O efeito depende de `JSON.stringify(formDe(cliente))`. `formDe` só tem campos de texto, interruptores e pasta/conta/drive, então enviar logo ou fonte (que recarrega `cliente`) não muda o salvo e não apaga o que está sendo digitado. Efeito colateral aceito: "Puxar tudo/fontes" muda o salvo e descarta rascunho não salvo dos campos do formulário (o kit já sobrescreve design system e tom de voz).
10. **Logos e fontes se apagavam entre si** (U4b): APROVADO. `mudarLista` relê a coluna do banco antes de aplicar a função; usada em `trocarLogo`, `removerLogo`, `addGoogle`, `addArquivo` e `removerFonte`.
11. **"Puxar tudo" usava a pasta salva** (U4c): APROVADO. `salvarPasta()` grava `pasta_cofre` quando diferente do salvo e não vazia, antes de `kitDoCofre`, em `puxarTudo` e `puxarFontes`.
12. **Limite de pastas do Drive** (D1): APROVADO. `parar()` cobre 80 pastas visitadas, 60 s e 60 com imagem; é checado no laço externo e no interno; o comentário do topo foi atualizado e as assinaturas continuam as mesmas.
13. **`so_fontes` sem fontes mostrava sucesso** (I1c): APROVADO. `ErroHttp(400, ...)` logo depois de ler as notas do cofre, antes de qualquer trabalho do modo `so_fontes`.
14. **Etiqueta "Gera toda semana"** (U2b): APROVADO. Agora é "Entra no Gerar a semana".
15. **`varianteDoNome` e `pesoDoNome`** (R1d + R1e): APROVADO. As regras de fundo e monocromático vêm antes das genéricas; `fontesDoCofre` calcula o peso do nome sem o prefixo da família ("ArchivoBlack-Regular" fica 400). Testes em `src/lib/conteudoRegras.test.ts`.

## Verificações (rodadas depois dos meus ajustes)

- `npm test`: 778 testes, 778 passam, 0 falhas.
- `npx tsc --noEmit -p .`: sem erros.
- `npx -y deno@2 check --node-modules-dir=none --no-lock supabase/functions/conteudo/index.ts`: exit 0 (só o aviso de peer deps do React, já conhecido).
- `node --check tools/cofre-sync/sync.mjs`: ok.
- Não acrescentei teste: os dois ajustes são de camada de tela e de acesso ao banco, sem regra pura nova.

## Arquivos que alterei

- `src/lib/conteudo.ts` (`usarAjusteNoMolde`)
- `src/components/conteudo/AbaMoldes.tsx` (`recarregar()` nos catch)
- `docs/superpowers/plans/2026-10-12-conteudo-correcoes-review.md` (itens marcados `[x]`)

Redeploy da função `conteudo`: NÃO é necessário por causa dos meus ajustes (só o front mudou). Continua pendente o redeploy dos commits anteriores (`etapas.ts`, `index.ts`, `moldes.ts`, `regras.ts`, `drive.ts`), se ainda não foi feito. O `sync.mjs` roda na máquina do André.

## Só dá para provar ao vivo

- Função derrubada por tempo (150 s): a tentativa subindo 1, 2, 3 e o post indo para `erro` com a mensagem, sem novo custo de Claude/OpenAI.
- Falha real do Cloudflare ao gerar a prévia: molde salvo, mensagem 503, depois "Refazer" gerando só a prévia sem chamar o Opus.
- Fluxo completo de molde aprovado: pedir mudança, posts novos seguindo com a versão anterior, aprovar e ver os posts em `aguardando` remontarem; e "Usar este ajuste" nesse estado.
- Descartar post em erro e depois "Gerar a semana" recriando o dia (UNIQUE com `origem_data` nulo no banco real).
- Ligar cliente novo puxando o kit; "Puxar tudo" com pasta escolhida e não salva; limite de 60 s/80 pastas em Drive grande; `sync.mjs` com binário acima de 3 MB (não rodei o script).

RESULTADO: aprovados 13, ajustados 2, refazer 0
