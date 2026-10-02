# Pinecone: memória do desenvolvimento (cofre do Obsidian com busca por significado)

**Data:** 2026-10-01 · **Pedido do André:** "quero integrar o pinecone no projeto, pode me ajudar com isso e me ensinar a usar?".
Objetivos escolhidos por ele: contexto melhor no GMN e memória para o desenvolvimento; ordem: **memória do desenvolvimento
primeiro** (laboratório para aprender, sem mexer no sistema no ar), depois base de conhecimento dos clientes + contexto no
GMN, por último "Perguntar às reuniões". Esta spec cobre só a primeira parte. Abordagem A aprovada ("pode").

## 1. O que muda

Hoje, a cada pedido do André, o gancho `UserPromptSubmit` (`.claude/hooks/cofre-prompt.mjs`) aponta notas do cofre por uma
lista de apelidos escrita à mão. Passa a perguntar ao Pinecone com o texto do pedido e apontar as notas e seções mais
parecidas pelo significado. Se o Pinecone falhar ou demorar mais de 3 s, vale a lista de apelidos de hoje.

## 2. Conta, chave e índice

- Conta grátis (Starter) criada pelo André; chave `claude-memoria-dev` gravada por ele na variável de usuário do Windows
  `PINECONE_API_KEY` (nunca no chat, no repositório ou no cofre). Os scripts leem a variável do processo e, se não houver
  (o Claude Code foi aberto antes), a do registro do usuário (`HKCU\Environment`), sem imprimir.
- Índice serverless `cofre-gestao` com **embedding embutido** (`multilingual-e5-large`, 1024 dimensões, cosseno, até ~507
  tokens por trecho; entende português). Campo de texto `texto`. Namespace `cofre`.
- Criado por script (`create-for-model` da API), uma vez.

## 3. O que entra no índice

- Notas `.md` do cofre em `_knowledge/`, `_decisions/`, `_learnings/`, `_memory/` (fora `.obsidian/`) e as specs do
  repositório em `docs/superpowers/specs/`.
- Cada arquivo é quebrado por seção (títulos `#`/`##`/`###`); seção grande é quebrada por parágrafos em trechos de até ~1.400
  caracteres (cabe nos ~507 tokens do modelo). Cada trecho leva no começo "Nota: <título> · Seção: <seção>" para dar
  contexto ao vetor.
- Registro: `_id` = `<caminho relativo>#<n>`; campos `texto`, `caminho`, `titulo`, `secao`, `tipo` (módulo, técnico, decisão,
  aprendizado, memória, spec), `atualizado` (data do arquivo).
- Sem segredos: o cofre já não guarda chaves (regra do projeto); o indexador ainda pula linhas que pareçam chave
  (`sk-`, `pcsk_`, `eyJ` longos).

## 4. Atualização sozinha

- `cofre-indexar.mjs` compara o hash (SHA-256) de cada arquivo com o estado salvo em `.claude/hooks/.pinecone-estado.json`;
  manda só os arquivos novos ou mudados (apaga os trechos antigos do arquivo antes) e apaga os de arquivos que sumiram.
- Roda solto (processo separado, sem segurar a resposta) no gancho `Stop`, e pode ser rodado à mão
  (`node .claude/hooks/cofre-indexar.mjs --tudo` para refazer tudo).

## 5. Uso automático e avulso

- `cofre-prompt.mjs`: busca `top_k` 12 com o pedido (mais de 12 caracteres), junta por arquivo, mostra até 8 notas com a
  seção mais parecida e a pontuação; nota de módulo ou técnica sempre que aparecer, decisão/aprendizado/spec acima de um
  piso de semelhança. Falha ou demora: lista de apelidos de hoje (o código atual fica como reserva).
- Conector MCP oficial `@pinecone-database/mcp` em `.mcp.json` do projeto, com a chave pela variável de ambiente
  (`${PINECONE_API_KEY}`), para buscas avulsas ("procura no cofre…"). Precisa reabrir o Claude Code depois de gravar a chave.

## 6. Ensinar

- Nota `_knowledge/tecnico/pinecone.md` no cofre ("Guia do Pinecone"): o que é vetor, embedding, índice, namespace, registro,
  top-k, filtro de metadados, rerank; como o nosso índice foi montado; como buscar pelo MCP e pelo script; custos e limites.
- Demonstração: as mesmas perguntas pela busca por palavra (apelidos) e pelo Pinecone, lado a lado.

## 7. Como medimos

`cofre-comparar.mjs`: 20 pedidos reais da sessão de 01/10/2026, cada um com as notas certas marcadas à mão; para cada método
(apelidos e Pinecone) conta quantas certas apareceram nas 8 apontadas e quantas erradas. Resultado vai para o cofre.

## 8. Fora do escopo

Código-fonte no índice (a busca por texto é melhor para código), o sistema no ar (nada muda no site), as outras duas partes
(conhecimento dos clientes/GMN e "Perguntar às reuniões"), que têm spec própria depois.

## 9. Testes

`node --test` para a quebra em trechos e o filtro de segredos (puros); teste real contra o índice (criar, indexar, buscar,
apagar um arquivo de teste); comparação do item 7.
