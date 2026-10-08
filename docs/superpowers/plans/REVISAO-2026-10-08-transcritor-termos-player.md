# Revisão do plano: Transcritor com termos e player (2026-10-08)

Conferido: relatório de cada item, arquivos, `check:` e contratos. Paridade worker x app testada com 3.000 casos aleatórios (teste descartável, não deixado no repositório).

## W1 | AJUSTADO
Corrigi: `acharSequencia` do worker deixava um token só de pontuação abrir a sequência ("— roi," virava "—ROI,"), divergindo do app (que ignora). Agora o início exige chave não vazia nos dois lados (+3 linhas em `termos.js`, +1 teste de regressão). Depois do ajuste: 0 divergências em 3.000 casos (marcas, número de trocas e `text` == `textoDeMarcas`). Resto conforme o contrato.

## W2 | APROVADO
`prepararSegmentos`/`agruparParagrafos` e o novo `glossarioParaPrompt` conferem. Prompt: 400 + espaço + 150 = 551, abaixo de `PROMPT_MAX` 560.

## W3 | APROVADO
Range nos 3 formatos, 416, 404, HEAD, 405, OPTIONS e CORS (`aplicarCors` do uploads). Rota só casa `/audio/<uuid>.m4a`, sem conflito com `/health` e uploads.

## D1 | APROVADO
SQL válido para Postgres 17: `ON CONFLICT (chave)` com `transcritor_termos.vezes` e `EXCLUDED`, `DISTINCT ON` preferindo manual, `jsonb_to_recordset`, `WITH ORDINALITY`, glossário concatenado só com o que falta. Idempotente (IF NOT EXISTS, DROP POLICY IF EXISTS, OR REPLACE, NOT EXISTS). Grants: nenhuma migration de tabela recente (links, transcricoes) tem GRANT de tabela (o Supabase já concede a anon/authenticated por padrão), então não pus; EXECUTE da RPC para anon e authenticated está presente. Não foi aplicada.

## A1 | APROVADO
Mesma regra do worker (agora provada por teste de paridade); não muta a entrada; `indicePalavra` por busca binária.

## A2 | APROVADO
`urlAudio`, `detalhe`, `salvarMarcas` (grava marcas + `textoDeMarcas`), memória de termos e RPC com os nomes de tabela, função e colunas da migration. tsc passa.

## A3 | APROVADO
Card, descrição do Glossário e posição no admin conforme o item. tsc passa.

## W4 | APROVADO
Chamada chat/completions do Groq com `response_format json_object`, `reasoning_effort`, `max_completion_tokens`; 429 com retry-after limitado a 65 s, 3 tentativas; falhas mantêm o bloco; `JobPausado` propaga; a chave só vai no cabeçalho e não aparece em log. Trava de 15% e validação conferem com a spec.

## W5 | APROVADO (revisão reforçada)
Check passou (suíte do worker inteira, 306 + o teste novo). Palavras deslocadas por trecho junto com os segmentos; prompt das manuais antes do glossário, sem passar de 560; progresso do Whisper até 0,9 só com chave; texto gravado == `textoDeMarcas(marcas)`; m4a só no caminho de sucesso e falha só loga (JobPausado propaga); áudio apagado se a gravação não achou a linha ou foi cancelado; faxina de `audios` só apaga id que não existe em `idsExistentes` (linha existente mantém o áudio); rota de áudio antes das de upload; `/health` com `revisao`. Observação: os testes de main ficaram em `transcritor-processar.test.js` (não existe `transcritor-main.test.js`), sem prejuízo.

## A4 | APROVADO
Sem setState por quadro (destaque por atributo no DOM), `cancelAnimationFrame` no desmonte e ao reiniciar o laço, destaque limpo quando `marcas` muda, rolagem só da caixa (`scrollTo` na própria caixa), seleção guardada no pointerdown, toast conforme o item. Limitação conhecida e aceita: palavras não focáveis por teclado (o áudio tem controles nativos).

## V1 | check geral
`cd worker && node --test`: 306 passaram, 0 falhas (após o ajuste: o arquivo de termos tem 17). Raiz `npm test`: 718 passaram, 0 falhas. `npx tsc --noEmit -p tsconfig.json`: sem erros.

RESULTADO: aprovados 9, ajustados 1, refazer 0
