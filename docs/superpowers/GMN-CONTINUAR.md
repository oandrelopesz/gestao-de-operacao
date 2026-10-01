# Posts automáticos no Google Meu Negócio: onde paramos e como continuar

Atualizado em 30/09/2026, à noite. Este documento serve para retomar numa conversa nova sem perder nada. O registro
detalhado de execução (ledger) fica em `.superpowers/sdd/2026-09-29-gmn-posts-fase1/progress.md`, mas essa pasta é
ignorada pelo git e some quando o worktree for apagado: **o que importa para a Fase 2 está copiado aqui** (seção 7).

**Onde este arquivo está:** `docs/superpowers/` (branch `gmn-fase1`; depois do merge, também na `main`).

## 1. O que é

Uma aba nova no sistema, `/gmn` ("Google Meu Negócio"), que publica sozinha posts nos perfis do Google Meu Negócio
dos clientes, nos dias e horários escolhidos para cada perfil. Cada post segue o briefing de marca do perfil e é
escrito para SEO local.

- **Liga/desliga** por perfil.
- **Briefing** com contexto, objetivo, posicionamento, público, tom de voz, serviços, cidade e bairros, palavras-chave,
  diferenciais e termos proibidos, mais a marcação "saúde" e o cliente ligado. "Gerar com IA" faz um rascunho.
- **Agenda** por cliques: de 1 a 7 dias, um horário por dia (de 30 em 30 min, 06:00 a 22:00); padrão terça e quinta
  às 09:00.
- **Pasta do Drive** com as fotos de cada perfil; sem foto, imagem gerada pela IA (opcional por perfil).
- **Perfis novos** da conta andfalopes@gmail.com entram na aba sozinhos, desligados (Fase 2).

Documentos:
- **Spec:** `docs/superpowers/specs/2026-09-29-gmn-posts-design.md` (emendada várias vezes em 30/09; vale ela).
- **Plano da Fase 1:** `docs/superpowers/plans/2026-09-29-gmn-posts-fase1.md`.
- **Cofre do Obsidian:** nota `_knowledge/modulos/gmn.md` e decisões `2026-09-29-gmn-nada-vai-ao-ar-antes-da-api` e
  `2026-09-30-gmn-agenda-de-dias-e-horarios`.

## 2. Decisões tomadas com o usuário

| Tema | Decisão |
|---|---|
| Conta gerente dos perfis | **andfalopes@gmail.com**. O sistema continua conectado à contato@ para Drive e Agenda; o GMN terá uma segunda conexão Google, na Fase 2 |
| Aprovação dos posts | **Nenhuma: tudo automático.** A proteção é uma checagem automática: termos proibidos, telefone ou link no texto, tamanho, e as regras do CFM/CFO nos perfis de saúde |
| IA | **OpenAI**, para texto e imagem (modelos pelos secrets `OPENAI_MODELO_TEXTO` e `OPENAI_MODELO_IMAGEM`; padrão `gpt-5-mini` e `gpt-image-1`) |
| Imagens | Na ordem: Drive do perfil → fotos do perfil no Google (Fase 2) → imagem gerada pela OpenAI. Se a imagem falhar, o post segue só com o texto e um aviso |
| Armazenamento das imagens | **Cloudflare R2**, bucket `gmn-midia`. Nenhum arquivo vai para o Supabase |
| Motor | `pg_cron` + edge function `gmn`. Sem n8n e sem worker da VPS |
| Agenda | Dias e horário por cliques (ver seção 1). Substituiu "1 a 3 posts por semana, horário sorteado entre 9h e 11h" |
| Formato do post | "Novidade", com botão Saiba mais, Agendar (ambos exigem link) ou Ligar. O link recebe a UTM `utm_source=google&utm_medium=organic&utm_campaign=gmn-post` |
| Temas em rodízio | Serviço, dúvida frequente, bairro ou região, diferencial, bastidores |
| **Ir ao ar** | **Nada vai ao ar antes de a API do Google ser aprovada.** Sem crons, sem perfil ativado, sem item no menu. O código vai para a `main` (a função precisa ser publicada pelo Lovable), mas a tela só funciona no servidor local: no site publicado, `/gmn` mostra "Em preparação" (`ABA_LIBERADA = import.meta.env.DEV` em `src/lib/gmn.ts`) |
| Perfil de teste | **Brazilian Car** (Brasília, compra e venda de seminovos). Objetivo do cliente: ser vista como "a melhor loja de Brasília para comprar e vender carros seminovos" |
| Adiado | Postagem em Instagram, TikTok, YouTube, LinkedIn e Facebook |

## 3. O que já foi feito fora do código

**Pedido de acesso à Google Business Profile API** (29/09/2026): caso **2-9335000041887** (7 a 10 dias úteis; resposta
na andfalopes@gmail.com). Projeto Cloud `gestao-de-operacao-509002` (número 992656410238, conta contato@). Perfil de
comprovação: Avelore. Como saber se aprovou: no Cloud Console, a quota da API passa de 0 para 300 por minuto.

**Cloudflare** (conta contato@, id `b4e84eaa8099c0e841a2eb35824027ca`): R2 ativo; bucket **`gmn-midia`** (ENAM),
público em **https://pub-ae3cb23015f64d9183be1720f7c52e2e.r2.dev**. O token de API `sistema gestao - arquivos e gmn`
(criado em 30/09 para o R2 dos Arquivos) cobre também o `gmn-midia`. Secrets já no Lovable: `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (`gmn-midia`) e `R2_PUBLIC_BASE`.

**OpenAI:** pagamento e crédito cadastrados pelo usuário. **A chave de API ainda não foi criada** (Tarefa 4).
Sugestão: limite de uso mensal de cerca de US$ 20. **O `gpt-image-1` exige organização verificada**
(platform.openai.com → Settings → Organization → Verify); sem isso a imagem da IA falha com "A OpenAI negou acesso a
este modelo" e a prévia sai só com texto.

## 4. Implementação da Fase 1: estado em 30/09/2026

**Worktree:** `.claude/worktrees/gmn-fase1`, branch `gmn-fase1` (junção do `node_modules` da raiz e `.env` copiado).
Método: skill `superpowers:subagent-driven-development` (implementador, revisão de cada tarefa, rodadas de correção,
revisão final da branch com o modelo mais forte).

| # | Tarefa | Estado |
|---|---|---|
| 1 | Migration `20260929120000_gmn.sql` (`gmn_perfis`, `gmn_posts`, `gmn_imagens_uso`) | **Concluída e aplicada no banco** (30/09) |
| 2 | Regras puras `supabase/functions/gmn/regras.ts` + `src/lib/gmnRegras.test.ts` | **Concluída** (16 testes; 368 no total) |
| 3 | Edge function `gmn` (acesso, google, openai, r2, prazo, conteudo, index) + `[functions.gmn]` | **Concluída**, nunca executada (sem Deno na máquina): o primeiro teste real é a Tarefa 7 |
| 5 | `src/lib/gmn.ts` + `cabecalhosDeAcesso()` em `src/lib/googleDrive.ts` | **Concluída** |
| 6 | Tela `/gmn` + `src/components/gmn/*` | **Concluída** (teste de tela com perfil TESTE: 21 checagens) |
| — | Revisão final da branch | Feita; correções na rodada final (aba só no servidor local, 401 × 403 da OpenAI, mensagens em português) |
| 4 | Chave da OpenAI, secrets dos modelos, merge na `main`, push, deploy da função | **com o usuário** (seção 5) |
| 7 | Teste de ponta a ponta com a Brazilian Car no servidor local | **com o usuário** (seção 6) |

## 5. Tarefa 4: o que falta (com o usuário)

1. O usuário cria a chave `gestao-de-operacao gmn` em https://platform.openai.com/api-keys e **verifica a
   organização** (seção 3). Conferir na página de modelos os nomes atuais do modelo de texto barato e do de imagem.
2. No Lovable → Cloud → Secrets: o usuário cola `OPENAI_API_KEY`; o agente cria `OPENAI_MODELO_TEXTO` e
   `OPENAI_MODELO_IMAGEM` com os nomes conferidos. (Os do R2 já existem.)
3. Merge da `gmn-fase1` na `main` local (sem conflito, simulado na revisão final) e push pelo usuário
   (`! git -C "<raiz do repositório>" push origin main`).
4. No chat do Lovable, **sem publicar o site**: "Faça o deploy da edge function `gmn` (pasta supabase/functions/gmn,
   verify_jwt = false). Não altere nenhum arquivo." É a primeira função com vários arquivos neste projeto: conferir que
   os 7 arquivos subiram.
5. Conferir: `GET {VITE_SUPABASE_URL}/functions/v1/gmn` com o cabeçalho `apikey` → `{"openai":true,"r2":true,"acesso":true}`.

## 6. Tarefa 7: teste de ponta a ponta (servidor local)

Roteiro completo no plano (Task 7). Resumo: matar vites antigos; `/gmn` no Chrome do usuário (no localhost a função
é liberada pela chave do swipe gravada no navegador); criar "Brazilian Car" (categoria, endereço, Saiba mais com o site
da loja); agenda só com cliques; "Gerar com IA" e incluir no Posicionamento "a melhor loja de Brasília para comprar e
vender carros seminovos"; prévias sem Drive (imagem da IA), segunda prévia com tema diferente, com pasta do Drive
(foto do Drive, a seguinte usa outra foto), termo proibido → "Pulado". **Também:** marcar "saúde" por um instante e
gerar uma prévia (deve sair "Pulado" ou sem superlativo; spec §8) e desmarcar. **Medir o tempo** das chamadas: se o
texto passar de ~25 s, enviar `reasoning_effort: "low"` para modelos `gpt-5*`. Mostrar textos e imagens ao usuário e
anotar ajustes. Não clicar em Publicar no Lovable.

## 6b. Contexto, imagens e logo (01/10/2026)

Pedido do André depois do primeiro teste real (texto genérico). Spec, seção 11. Branch `gmn-contexto` (ledger em
`.superpowers/sdd/gmn-contexto/progress.md`, ignorado pelo git).

- Colunas novas em `gmn_perfis` (migration `20261001120000_gmn_contexto.sql`, aplicada): `contexto_posts`,
  `contexto_imagens`, `logo_url`, `permitir_pessoas_ia`. Cada item da `agenda` ganhou `imagem` (falta = verdadeiro).
- Ações novas da função: `logo` (PNG/JPG até 5 MB, R2 `logos/<perfil>-<carimbo>.<ext>`), `remover_logo`; `briefing` aceita
  `contexto_posts`; `previa` aceita `com_imagem` e responde 409 se já houver prévia `gerando` do perfil há menos de 3 min.
- Imagem: Drive preenchido = só Drive (falhou, só texto com aviso); senão IA com a logo como referência (`images/edits`),
  depois checagem por visão (`gpt-6-luna` aceita imagem): pessoas (fora da marca da logo) ou texto em destaque reprovam;
  nova tentativa só com 45 s sobrando; falhou, só texto com aviso. `input_fidelity` não é enviado (a OpenAI manda omitir
  nos gpt-image-2). JPG.
- Prompts para o André montar os contextos: nota `gmn-prompts` do cofre.
- **Para a Fase 2:** o processador da agenda precisa ler `imagem` do dia (ou copiar para o post) e chamar
  `gerarConteudo(…, { comImagem, prazoFinal })` (`prazoFinal` é obrigatório). A checagem manda a logo pela URL pública do
  R2 (`r2.dev`): se a OpenAI não conseguir baixá-la, a imagem não sai (falha fechada). Logos só são baixadas de
  `R2_PUBLIC_BASE`; se esse endereço mudar, reenviar as logos ou trocar o começo de `logo_url` no banco.

## 7. Fase 2 (depois de a API do Google ser aprovada)

Detalhes nas seções 6 e 7.2 da spec. Precisa de um plano próprio (skill `superpowers:writing-plans`).

1. Ativar no Cloud as APIs My Business Account Management, Business Information e My Business (v4).
2. Conferir se o app OAuth está "Em produção" (em "Teste" o token cai a cada 7 dias).
3. Segunda conexão Google (andfalopes@, escopos `business.manage` e `drive.readonly`): coluna `finalidade` em
   `google_oauth_tokens`. **Armadilha:** o `google-token` **e o `tokenGoogle` de `supabase/functions/gmn/google.ts`**
   pegam a linha mais recente da tabela; com a linha da andfalopes@, ambos passariam a usar a conta errada (quebra
   Swipe, Drive e Agenda). Os dois precisam filtrar por `finalidade`.
4. Sincronização diária dos perfis (novos entram desligados, com aviso no sino); telefone vem do Google.
5. Publicação no Google e conferência dos posts reprovados.
6. Crons `gmn-sincronizar`, `gmn-planejar-dia` e `gmn-processar`.
7. "Fila da semana" e "próximo post" na lista.
8. Item no menu (grupo Operação), `PUBLICACAO_LIBERADA = true` e **tirar `ABA_LIBERADA`** (a aba passa a funcionar no
   site). Só então publicar no Lovable.

**Pendências vindas das revisões da Fase 1** (não bloquearam o merge; resolver na Fase 2 ou antes de publicar):
- Checagem do texto (`regras.ts`) não pega markdown (`**`, `#`) nem hashtags em excesso; hoje só o prompt proíbe.
- Briefing vazio pode ser salvo e já satisfaz a regra de ativação: exigir ao menos cidade e uma palavra-chave ou serviço.
- Com "Ligar", um `cta_url` digitado antes continua salvo: a publicação deve ignorá-lo. Perfis à mão não têm campo de
  telefone.
- `quality: "medium"` só vale para modelos `gpt-image-*`.
- Posts presos em `gerando` (se a função for encerrada à força) aparecem como "Última prévia em geração".
- `chamar()` em `src/lib/gmn.ts` trata 403 da função como erro comum (o `getAccessToken` limpa o ID token).
- `fetchUltimosPosts` lê só os 500 posts mais novos: com volume, usar uma view ou `DISTINCT ON`.
- Excluir um perfil deixa as imagens dele no R2.
- O erro de acesso do `googleDrive.ts` fala em "swipe file" também na aba GMN.
- `salvarBriefing` em duas gravações (saúde/cliente e depois o briefing): se a segunda falhar, a primeira fica.
- Perfil novo com "Saiba mais" não salva configuração nenhuma até ter link (segue a spec).
- Lista completa e motivos: ledger (`progress.md`), linhas "minor (deferred)".

## 8. Cuidados

- **Push:** `git push` para a main é bloqueado pelo classificador; o usuário roda o comando com `!`. Push **não
  publica** o site.
- **Deploy da edge function:** só pelo chat do Lovable, depois que o código estiver no GitHub.
- **Chaves de API:** nunca em formulário digitado pelo agente, no chat ou em arquivo. O usuário cola direto nos secrets.
- **Servidor local:** matar vites antigos antes; `TaskStop` não mata o `vite.js` filho (ver memória `dev-server-local`);
  reverter `src/routeTree.gen.ts` depois. Rota nova no `routeTree.gen.ts`: inserir só as linhas dela no arquivo do
  Lovable.
- **Arquivos soltos:** não commitar `CRM-Evoluir-Kids-Funcionalidades.md`, `evoluir-kids-crm-codigo.zip` nem a
  captura de tela da raiz.
