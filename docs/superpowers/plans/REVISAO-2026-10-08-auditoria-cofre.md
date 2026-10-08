# Revisão da auditoria do cofre (2026-10-08)

Método: li o plano, os 10 relatórios e o CLAUDE.md do cofre; abri as notas citadas, conferi números e caminhos no repositório (rotas, 9 funções, 110 migrations, `FilaComSelecao.tsx`, `wrangler.jsonc`, workflows, `stack.yml`), rodei o `check:` de cada item e varri o cofre inteiro por travessão, segredos, frases obsoletas e WikiLinks.

## C1: AJUSTADO
Corrigi: o caminho `%USERPROFILE%.gestao` saiu sem as barras em CLAUDE.md (e igual em gmn.md e sistema.md); agora `%USERPROFILE%\.gestao\`. current-state.md não trazia a pendência do Fireflies (fato 2): entrou como item 5 dos Próximos passos, enxugando linhas para ficar em 7.965 caracteres (limite 8.000). Resto aprovado: CLAUDE.md alinhado à autonomia e ao verificador, comandos batem com `.claude/commands/`, historico.md só com `updated`.

## C2: AJUSTADO
Corrigi: sistema.md ainda dizia "O `git push` é rodado pelo André" e "publica só com o ok do André" (obsoleto); agora commit e push fazem parte da tarefa e o André só roda se o verificador barrar. projects.md: Fireflies deixou de ser "não há registro" e passou a pendência confirmada (fato 2); a linha do Instagram dizia que reels e story ainda esperavam teste real, contra current-state e instagram.md (testados em 04/10), e foi alinhada; saiu a pendência "seleção em massa nas filas do Swipe e Transcritor", que já existe (`src/components/fila/FilaComSelecao.tsx`). references.md aprovado (Lovable antigo só "até ~07/11").

## C3: AJUSTADO
Fluxo (push publica, CLI do Supabase, DNS na Cloudflare, backup, segredos) confere com `wrangler.jsonc`, workflows e `tools/migracao`. Corrigi publicar-e-deploy.md sobre o workflow do swipe: ele publica no GHCR, mas a VPS usa a imagem local `swipe-worker:latest` construída pelo Portainer (diz o comentário do `infra/swipe-worker/stack.yml` e o README do swipe). As variáveis de build da Cloudflare (bun 1.3.14 etc.) vêm do histórico, não do repositório; mantidas.

## C4: AJUSTADO
Contagens (32 rotas, 9 funções, 189 libs, 110 migrations) conferem com o repositório. Corrigi uma linha: a tabela de `swipe-worker/stack.yml` citava `youtube_v2`; o repositório agora usa `youtube_v3` (fato 5). Lovable só como histórico (vite.config e README realmente ainda citam o pacote do Lovable).

## C5: AJUSTADO
vps-portainer.md: removi "os stack.yml do repositório ainda citam v2" (agora citam v3, fato 5); descrevi o GHCR versus imagem local (seção "Atualizar a imagem do worker"); registrei que a `GROQ_API_KEY` da stack 7 foi colada pelo André na interface do Portainer em 08/10 porque o verificador barrou o agente (fato 4). banco-de-dados (buckets como reserva, projeto novo, tabelas novas), google-cloud, n8n, pinecone e testes aprovados. superorganic-blog segue arquivado, fora de escopo, sem apagar (fato 6).

## C6: APROVADO
Caminhos de rota, componentes e migrations conferem; Lovable só como "antes de 07/10"; virada das demandas já tratada como conferida em 01/10. Sem ajuste meu.

## C7: AJUSTADO
fireflies.md trazia "não confirmado" sobre o pacote de 26/09: reescrito como pendência confirmada (7658b7b, `repetirPendencias` ausente em `src/server.js`, renomear/excluir pode levar minutos). links.md tinha a pendência "levar seleção em massa às filas" já feita: trocada por "Nenhuma" apontando para `FilaComSelecao.tsx`. A migration do financeiro (20261001200001) existe. gmn.md: restaurei o caminho `%USERPROFILE%\.gestao\`. Sugestão do executor de mover o diário da Fase 1 do gmn.md para uma nota de histórico fica para depois.

## C8: APROVADO
swipe-file.md e transcritor.md estão como "como funciona hoje", sem seções de andamento, "Pendências: Nenhuma aberta", cookies do YouTube em `_v3`, fila com seleção em massa conferida no código. Sem ajuste meu.

## C9 (revisão reforçada): AJUSTADO
Reli todas as 24 notas de `_learnings/`: frontmatter completo, `publicar-no-lovable` e `chave-em-lugar-de-espera` arquivadas com a linha "Hoje", `o-que-so-o-andre-faz` alinhado à autonomia e ao verificador. O executor deixou passar `modo-automatico-bloqueia-producao.md`, que dizia que o `git push` "continua sendo dele em qualquer modo" (fato 1): corrigido (commit e push fazem parte da tarefa; o André só roda se o verificador barrar). Check passou.

## C10: AJUSTADO
As 9 notas com "Situação em 2026-10-08" e os status (2 arquivadas, 2 completed) fazem sentido e os corpos não foram reescritos. Corrigi a Situação da virada automática (fato 3): "Pendente" resolvido, primeira execução conferida em 01/10 e virada da meia-noite de 08/10 rodou sem erro no banco novo.

## Integração entre notas
- Fireflies (fato 2) agora igual em fireflies.md, projects.md e current-state.md.
- `youtube_v3` igual em vps-portainer, codigo, transcritor, swipe-file, current-state e nos `stack.yml` do repositório.
- GHCR versus imagem local descrito igual em vps-portainer, publicar-e-deploy, testes-e-automacao e codigo.
- Autonomia/push: nenhuma nota do presente afirma mais que o push é do André (varredura feita).
- Verificação global: `node tools/cofre-lint.mjs` no cofre inteiro retornou `ok`; sem travessão fora dos avisos "nunca use travessão" dos comandos; varredura de padrões de chave sem achados; current-state.md com 7.965 caracteres.

## Perguntas para o André
- A pendência do Fireflies (publicar o worker de 26/09 na VPS) precisa do upload do tar pela tela do Portainer, que o verificador barra para o agente: quer fazer agora?
- "Dashboard: 6 conclusões TESTE arrastar" (current-state): ninguém confirmou se ainda existem no banco; mantido como pendência.
- superorganic-blog.md (arquivado): mover para outro cofre ou apagar, só com o seu ok.

RESULTADO: aprovados 2, ajustados 8, refazer 0
