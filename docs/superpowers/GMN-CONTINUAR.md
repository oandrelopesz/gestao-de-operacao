# Posts automáticos no Google Meu Negócio: onde paramos e como continuar

Atualizado em 29/09/2026, no fim do dia. Este documento serve para retomar a implementação numa conversa nova sem perder nada.

**Onde este arquivo está:** no worktree `.claude/worktrees/gmn-fase1` (branch `gmn-fase1`), na pasta `docs/superpowers/`.

## 1. O que é

Uma aba nova no sistema, `/gmn` ("Google Meu Negócio"), que publica sozinha de 1 a 3 posts por semana nos perfis do
Google Meu Negócio dos clientes. Cada post segue o briefing de marca do perfil e é escrito para SEO local.

- **Liga/desliga** por perfil.
- **Briefing** com contexto, objetivo, posicionamento, público, tom de voz, serviços, cidade e bairros, palavras-chave,
  diferenciais, termos proibidos e a marcação "saúde".
- **Pasta do Drive** com as fotos de cada perfil.
- **Perfis novos** da conta andfalopes@gmail.com entram na aba sozinhos, desligados.

Documentos:
- **Spec (desenho aprovado):** `docs/superpowers/specs/2026-09-29-gmn-posts-design.md`
- **Plano da Fase 1** (7 tarefas, com o código completo de cada arquivo): `docs/superpowers/plans/2026-09-29-gmn-posts-fase1.md`
- **Registro de execução (ledger):** `.superpowers/sdd/2026-09-29-gmn-posts-fase1/progress.md`, dentro do worktree.
  Os briefs e relatórios de cada tarefa ficam na mesma pasta.

## 2. Decisões tomadas com o usuário

| Tema | Decisão |
|---|---|
| Conta gerente dos perfis | **andfalopes@gmail.com**. O sistema continua conectado à contato@ para Drive e Agenda; o GMN terá uma segunda conexão Google, na Fase 2 |
| Aprovação dos posts | **Nenhuma: tudo automático.** A proteção é uma checagem automática: termos proibidos, telefone ou link no texto, tamanho, e as regras do CFM/CFO nos perfis de saúde |
| IA | **OpenAI**, para texto e imagem |
| Imagens | Na ordem: Drive do perfil → fotos do perfil no Google → imagem gerada pela OpenAI |
| Armazenamento das imagens | **Cloudflare R2**, bucket `gmn-midia`. Nenhum arquivo vai para o Supabase |
| Dados | Tabelas no Supabase do sistema (Lovable Cloud). Sem Cloudflare D1 |
| Ligação com clientes | Opcional (`cliente_id` pode ficar vazio) |
| Motor | `pg_cron` + edge function `gmn`. Sem n8n e sem worker da VPS |
| Frequência | 1 a 3 posts por semana. Padrão de 2 (terça e quinta); com 3, segunda, quarta e sexta. Horário sorteado entre 9h e 11h |
| Formato do post | "Novidade", com botão Saiba mais, Agendar ou Ligar. O link recebe a UTM `utm_source=google&utm_medium=organic&utm_campaign=gmn-post` |
| Temas em rodízio | Serviço, dúvida frequente, bairro ou região, diferencial, bastidores |
| **Ir ao ar** | **Nada vai ao ar antes de a API do Google ser aprovada.** Na Fase 1 não se publica no Lovable, não se criam crons, não se ativa nenhum perfil e não se adiciona item no menu. A aba é aberta digitando `/gmn`, e os testes rodam no servidor local |
| Perfil de teste | **Brazilian Car** (Brasília, compra e venda de seminovos). Objetivo do cliente: ser vista como "a melhor loja de Brasília para comprar e vender carros seminovos" |
| Adiado | Postagem em Instagram, TikTok, YouTube, LinkedIn e Facebook |

## 3. O que já foi feito fora do código

**Pedido de acesso à Google Business Profile API** (enviado em 29/09/2026):
- Caso **2-9335000041887**. A análise leva de 7 a 10 dias úteis, e a resposta chega por e-mail na andfalopes@gmail.com.
- Projeto Cloud "Gestao de Operacao": id `gestao-de-operacao-509002`, número **992656410238**, na conta contato@.
- Perfil usado como comprovação: Avelore. Site informado: https://andrelopes.digital.
- Como saber se foi aprovado: no Cloud Console, a quota da API aparece como 0 enquanto não for aprovado e como 300 por minuto depois.

**Cloudflare** (conta contato@, id `b4e84eaa8099c0e841a2eb35824027ca`):
- R2 ativado, com cartão cadastrado pelo usuário.
- Bucket **`gmn-midia`** criado, na região ENAM.
- Endereço público: **https://pub-ae3cb23015f64d9183be1720f7c52e2e.r2.dev**
- **A chave de API do R2 ainda não foi criada.** Fica para a Tarefa 4.
- O domínio andrelopes.digital não está ativo na Cloudflare, por isso usamos o endereço `r2.dev`.

**OpenAI:**
- O usuário entrou na plataforma, cadastrou o pagamento e colocou crédito.
- **A chave de API ainda não foi criada.** Fica para a Tarefa 4.
- Sugestão: configurar um limite de uso mensal (Usage limits) de cerca de US$ 20.

## 4. Implementação: estado atual

**Worktree:** `.claude/worktrees/gmn-fase1`, na branch `gmn-fase1`, criada a partir do commit d111914 da `main` local.
- O `node_modules` do worktree é uma junção (junction) para o `node_modules` da raiz.
- O `.env` foi copiado da raiz.
- Os testes de base passaram: 344 de 344.

**Commits:**
- Só na `main` local, **ainda não enviados ao GitHub**: 55957dc, 60f65d5 e 527bd0f (spec) e d111914 (plano).
- Na branch `gmn-fase1`: **140eaa3** (Tarefa 1), mais o commit deste documento.

**Método:** skill `superpowers:subagent-driven-development`. Cada tarefa vai para um subagente implementador, depois
para um subagente revisor, e só então é registrada no ledger.

| # | Tarefa | Quem executa | Estado |
|---|---|---|---|
| 1 | Migration `supabase/migrations/20260929120000_gmn.sql` e ajustes na spec | subagente (Step 3: controlador, pelo Chrome) | **Implementada (140eaa3).** Conferi que a migration é idêntica ao plano. **Pendente:** revisão formal da tarefa e **aplicar a migration no banco** pelo editor SQL do Lovable (ver memória `supabase-migrations-manual`) |
| 2 | `supabase/functions/gmn/regras.ts` + `src/lib/gmnRegras.test.ts` (12 testes) | subagente | a fazer |
| 3 | Edge function `gmn` (`acesso.ts`, `google.ts`, `openai.ts`, `r2.ts`, `conteudo.ts`, `index.ts`) + `supabase/config.toml` | subagente | a fazer |
| 4 | Criar a chave do R2 na Cloudflare e a da OpenAI; cadastrar os secrets no Lovable Cloud; push; deploy da função pelo chat do Lovable; conferir com `GET /functions/v1/gmn` → `{"openai":true,"r2":true,"acesso":true}` | **controlador + usuário**. O usuário cola as chaves; elas nunca passam pelo chat nem por arquivo | a fazer |
| 5 | `src/lib/gmn.ts` + `cabecalhosDeAcesso()` em `src/lib/googleDrive.ts` | subagente | a fazer |
| 6 | Tela `/gmn` + `src/components/gmn/*` (gaveta com Briefing, Agenda e Posts; "Gerar com IA"; "Gerar prévia") | subagente | a fazer |
| 7 | Teste de ponta a ponta com a Brazilian Car no servidor local | controlador + usuário | a fazer |

Depois das 7 tarefas vêm a revisão final da branch inteira (com o modelo mais capaz) e a skill
`superpowers:finishing-a-development-branch`.

## 5. Cuidados

- **Push:** `git push` para a main é bloqueado pelo classificador. Peça ao usuário para rodar
  `! git -C "<caminho do worktree>" push origin gmn-fase1:main`, ou faça o merge na main e peça `! git push origin main`.
  Push **não publica** o site: no Lovable é preciso clicar em Publicar, e isso **não deve ser feito** na Fase 1.
- **Deploy da edge function:** só pelo chat do Lovable, depois que o código estiver no GitHub.
- **Teste local:** o login Google (GIS) não funciona em localhost. A função `gmn` é liberada pela chave do swipe
  (`x-swipe-key`) gravada no navegador. Antes de testar, mate os vite antigos (memória `dev-server-local`).
- **Chaves de API:** nunca digite chaves em formulários, nem cole no chat ou em arquivos. O usuário cola os valores
  direto nos secrets do Lovable Cloud.
- **Modelos da OpenAI:** o código usa `gpt-5-mini` e `gpt-image-1` por padrão. Confira os nomes atuais e configure os
  secrets `OPENAI_MODELO_TEXTO` e `OPENAI_MODELO_IMAGEM`.
- **Arquivos soltos:** não commitar `CRM-Evoluir-Kids-Funcionalidades.md`, `evoluir-kids-crm-codigo.zip` nem a
  captura de tela que está na raiz.

## 6. Fase 2 (depois de a API do Google ser aprovada)

Detalhes nas seções 6 e 7.2 da spec. A Fase 2 ainda precisa de um plano próprio (skill `superpowers:writing-plans`).

1. Ativar no Cloud as APIs My Business Account Management, Business Information e My Business (v4).
2. Conferir se o app OAuth está "Em produção". Se estiver em "Teste", o token cai a cada 7 dias.
3. Criar a segunda conexão Google (andfalopes@, com os escopos `business.manage` e `drive.readonly`). Isso inclui a
   coluna `finalidade` em `google_oauth_tokens` e o ajuste no `google-token` para filtrar `finalidade='geral'`.
4. Implementar a sincronização diária dos perfis: os novos entram desligados e geram aviso no sino.
5. Implementar a publicação no Google e a conferência dos posts reprovados.
6. Criar os crons `gmn-sincronizar`, `gmn-planejar-dia` e `gmn-processar`.
7. Criar a visão "Fila da semana".
8. Pôr o item no menu (grupo Operação) e liberar o liga/desliga (`PUBLICACAO_LIBERADA = true`).
9. Só então publicar no Lovable.
