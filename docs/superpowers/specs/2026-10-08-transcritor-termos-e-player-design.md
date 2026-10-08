# Transcritor: termos do nicho, memória de termos e player sincronizado

Pedido do André (2026-10-08): transcrição cada vez mais certeira com termos e siglas de IA, marketing, empreendedorismo e finanças; uma memória de termos que cresce com o uso; e, na aba, ouvir o áudio com a transcrição "iluminando" as palavras no ritmo, mantendo copiar e baixar .txt. Áudio e texto seguem a mesma validade (3 dias padrão, renovável até 15).

## 1. Glossário por nicho

- `app_config.transcritor_glossario` continua sendo a lista (editável no Admin, um termo por linha). A migration acrescenta ao fim da lista atual os termos novos que faltam (IA, marketing e tráfego, empreendedorismo e vendas, finanças, siglas gerais), sem apagar nem reordenar o que o André já tem.

## 2. Dica curta ao Whisper (`prompt`)

- O Whisper (Groq e OpenAI) só usa 224 tokens de `prompt`. Hoje o código manda até 900 caracteres.
- Novo prompt, no máximo 560 caracteres: frase de assunto fixa ("Conversa em português sobre marketing digital, tráfego pago, IA, empreendedorismo, vendas e finanças. Termos:") + termos até caber + os últimos 150 caracteres do trecho anterior.
- Ordem dos termos: primeiro o `para` das correções manuais da memória (mais usadas primeiro), depois o glossário na ordem do Admin, sem repetir.

## 3. Palavras com tempo

- Cada trecho pede `timestamp_granularities[]=segment` e `=word`. As palavras vêm em `words` (topo) ou em `segments[].words`; os tempos são deslocados como os segmentos.
- Alinhamento por segmento: tokens = texto do segmento (depois dos filtros de laço e alucinação) separado por espaço. Se o número de palavras do Whisper dentro do segmento (pelo meio da palavra) for igual ao de tokens, usa os tempos delas; senão distribui o tempo do segmento entre os tokens pelo tamanho de cada um.

## 4. Memória de termos (tabela `transcritor_termos`)

- Colunas: `id`, `chave` (único: `de` sem acento, minúsculo, só letras e números separados por espaço), `de`, `para`, `origem` (`manual` | `ia`), `vezes`, `created_at`, `updated_at`. RLS aberta como as tabelas novas.
- Função `registrar_termos(itens jsonb)`: insere ou, se a chave já existe, soma 1 em `vezes`; `manual` sempre sobrescreve `de`/`para`/`origem`; `ia` só sobrescreve linha `ia`.
- Correções **manuais** são aplicadas sempre, de forma determinística, em toda transcrição nova (antes da revisão por IA).
- Correções da **IA** entram na memória e vão como exemplos para a IA nas próximas revisões (as 80 mais usadas, manuais primeiro). Não viram regra automática (contexto pode mudar o sentido). O André apaga ou corrige qualquer uma no Admin.

## 5. Revisão por IA (Groq)

- Só com `GROQ_API_KEY`. Modelo `GROQ_MODELO_REVISAO` (padrão `openai/gpt-oss-120b`, `reasoning_effort: "low"`, `temperature: 0`, `response_format: json_object`).
- Texto em blocos de até 8.000 caracteres (segmentos inteiros). Mensagem: glossário inteiro + memória + bloco. Resposta: `{"correcoes":[{"de","para"}]}`, só termos técnicos, siglas, marcas e inglês mal ouvidos; nada de gramática ou estilo.
- Validação: `de` e `para` não vazios, `de` até 6 palavras, `para` até 8, `de` aparece no bloco. Se as correções válidas trocariam mais de 15% dos tokens do bloco, o bloco fica como está.
- Aplicação: troca a sequência de tokens por um token com o texto `para` (mantém a pontuação do fim e a maiúscula de início de frase), tempo do primeiro ao último. Vale só dentro do bloco.
- 429: espera o `retry-after` (até 65 s) e tenta até 3 vezes; qualquer outra falha: o bloco fica sem revisão. A transcrição nunca falha por causa da revisão.
- Progresso: Whisper vai até 0,9; revisão de 0,9 a 0,99.

## 6. Texto e marcas

- `transcricoes.marcas jsonb`: `{"v":1,"p":[[["Olá,",0.12,0.4],["tudo",0.4,0.62]],[...]]}` = parágrafos de palavras `[texto, início, fim]` (segundos, 2 casas).
- `texto` = parágrafos com as palavras unidas por espaço, separados por linha em branco. Worker e app usam a mesma regra, então `texto` e `marcas` nunca divergem.
- Transcrições antigas (sem `marcas`) seguem mostrando só o texto.

## 7. Áudio

- No fim (só quando deu certo), o worker gera `audios/<id>.m4a` (AAC 48 kbps mono, `+faststart`, toca em qualquer navegador e no iPhone) a partir do `audio.ogg`.
- `GET|HEAD /audio/<id>.m4a` no orquestrador, com `Range` (206) para pular no áudio. O id é UUID (mesmo nível de acesso do texto no banco).
- A faxina (a cada 30 min) apaga `audios/<id>.m4a` quando a linha não existe mais (venceu ou foi excluída). Sem a regra das 24 h de `uploads/jobs`.

## 8. Aba Transcritor

- Ao abrir uma transcrição pronta com `marcas`: player (`<audio controls>`) em cima, texto embaixo com cada palavra num `span`.
  - A palavra falada fica destacada (troca de classe só na palavra que mudou, via `requestAnimationFrame` enquanto toca).
  - Clicar numa palavra pula o áudio para ela e toca.
  - "Acompanhar" (ligado por padrão): rola a caixa do texto para manter a palavra visível.
  - Áudio indisponível (404): esconde o player e mostra o texto.
- "Corrigir termo": campo "Como saiu" (vem preenchido com o texto selecionado) e "Certo". Salvar grava na memória como `manual`, aplica nesta transcrição (`marcas` e `texto`) e avisa quantas trocas fez.
- Copiar e .txt continuam iguais (usam `texto`).

## 9. Admin

- Card "Memória de termos" ao lado do Glossário: lista `de → para`, origem e vezes, com excluir e adicionar manual.

## Fora do escopo

- Corrigir termo que cruza dois segmentos.
- Transformar correções da IA em regra automática.
- Login/segurança do áudio além do UUID (ver [[seguranca]] no cofre: sistema sem login de propósito).
