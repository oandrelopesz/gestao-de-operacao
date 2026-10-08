# Progresso (despachante Jev)

Plano: `2026-10-08-transcritor-termos-player.md` | gerado 2026-10-08T17:16:33.705Z

## Auditoria

- Itens: 11. Finais (revisados): 0. Aguardando revisao: 10. Pendentes de execucao: 1 (0% concluido).
- Ondas de execucao pendentes: 1. Maior onda: 1 itens simultaneos.
- Executores pendentes: haiku 0, sonnet 1, opus 0. Revisor padrao: sonnet alto.

## Execucao (cada onda roda em paralelo, em background; a proxima so comeca quando a anterior fecha)

Cada executor grava `relatorios-2026-10-08-transcritor-termos-player/<ID>.md` (inicio, fim, arquivos, o que fez, resultado do check, duvidas) e muda o item para `[r]`. Nao marca `[x]`.

### Onda 1

| Item | Executor | Esforco | Arquivos | Check (aceite) |
|---|---|---|---|---|
| V1 | sonnet | high | (nenhum, só conferência) | `cd worker && node --test && cd .. && npm test && npx tsc --noEmit -p tsconfig.json` |

## Revisao

Depois que todas as ondas fecharem, um unico revisor (sonnet, esforco alto) le os relatorios, confere os arquivos, roda os checks e grava `REVISAO-2026-10-08-transcritor-termos-player.md` com um veredito por item (APROVADO, AJUSTADO ou REFAZER) e a linha final `RESULTADO: aprovados N, ajustados N, refazer N`. Aprovados e ajustados viram `[x]`; REFAZER volta a `[ ]` com `exec: sonnet`.

Aguardando revisao agora: W1, W2, W3, D1, A1, A2, A3, W4, W5, A4.

## Status por item

| Item | Estado | Executor | Relatorio | Descricao |
|---|---|---|---|---|
| W1 | revisar | haiku | sim | Criar `termos.js` exportando: `chaveTermo(s)` (contrato); `alinharPalavras(segmentos, palavras)` → n |
| W2 | revisar | haiku | sim | Em `texto.js`: exportar `prepararSegmentos(segmentos)` (filtro de alucinação + `tirarLacos`, como ho |
| W3 | revisar | haiku | sim | Criar `audio.js` exportando `caminhoAudio(pasta, id)` = `join(pasta, "audios", id + ".m4a")` e `cria |
| D1 | revisar | sonnet | sim | Migration (seguir o estilo de `supabase/migrations/20260924150000_links.sql` e `20260924160000_trans |
| A1 | revisar | haiku | sim | Criar `transcritorMarcas.ts` exportando: `type Palavra = [string, number, number]`, `type Marcas = { |
| A2 | revisar | haiku | sim | Em `src/lib/transcritor.ts`, sem mudar o que existe: `urlAudio(id)` = `${URL_TRANSCRITOR}/audio/${id |
| A3 | revisar | haiku | sim | Criar `MemoriaTermosCard` no estilo do `GlossarioCard` (Card, CardHeader, toasts do sonner): título  |
| W4 | revisar | sonnet | sim | Criar `revisao.js` exportando `async function revisarTermos(segmentos, { glossario = [], memoria = [ |
| W5 | revisar | sonnet | sim | Integração (spec seções 2 a 7). `config.js`: `groqModeloRevisao: env.GROQ_MODELO_REVISAO, padrão "op |
| A4 | revisar | sonnet | sim | Spec seção 8. `PlayerTranscricao({ id, marcas, onCorrigido })` (`onCorrigido(marcas: Marcas)`): `<au |
| V1 | pendente | sonnet | - | Conferência final do plano inteiro (suítes do worker e do app, tipos) e dos contratos entre worker e |
