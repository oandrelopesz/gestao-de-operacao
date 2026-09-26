# HANDOFF — Gestor Pro como app no iPhone

> Documento de passagem de bastão. Escrito em 25/09/2026 ao pausar o trabalho (o usuário tem prioridades mais
> urgentes). Explica **o que já foi feito**, **em que estado está** e **tudo o que falta, passo a passo**, para
> qualquer pessoa (ou sessão do Claude) retomar sem perder contexto.
>
> Documentos de referência (ler junto):
> - Especificação aprovada: `docs/superpowers/specs/2026-09-25-mobile-pwa-design.md`
> - Plano da fase 1 (executado): `docs/superpowers/plans/2026-09-25-mobile-fase-1.md`
> - Ferramentas de verificação: `tools/auditoria-mobile/README.md`

---

## 1. Objetivo e regras do jogo

**Pedido do usuário (literal):** "mantenha o sistema exatamente como está, mas otimize 100% para uso no mobile";
"transformar num app, uso iPhone, extremamente responsivo e otimizado, preservando todas as funções";
"garantir que todas as adições de features e de dados propaguem do desktop pro mobile e do mobile pro desktop".

**Decisões já aprovadas pelo usuário:**
1. **App web instalável (PWA)** — o iPhone instala pelo Safari ("Adicionar à Tela de Início"); sem App Store, sem
   app nativo, sem duplicar telas. Mesmo código e mesmo banco para computador e celular.
2. **Desktop intocado:** nada muda visualmente a partir de 1024 px com mouse. Tudo o que é de celular fica atrás de
   `max-lg:` / `max-md:` / `max-sm:` (largura) ou `pointer-coarse:` (toque), ou em componentes que só aparecem
   abaixo de `lg`.
3. **Sem modo offline / sem service worker** (para o app nunca ficar preso numa versão antiga).
4. **Barra inferior** com Demandas, Agenda, Notas, Transcritor e "Mais" (abre o menu completo).
5. **Prioridades do usuário para as telas:** Demandas e Agenda; Ferramentas (Transcritor, Swipe file, Links, Notas,
   Arquivos). O resto depois.

**Regras técnicas que continuam valendo:**
- Nenhuma dependência nova no `package.json` do app (o Lovable instala com bun e o `bun.lockb` não pode ser
  regenerado nesta máquina — não há bun instalado). Ferramentas ficam em `tools/auditoria-mobile/` com
  `package.json` próprio.
- Libs puras testadas com `npm test` (`node --test src/lib/*.test.ts`), sem imports `@/` nos arquivos testados.
- Publicação: `git push origin main` **não publica**; é preciso Lovable → Publicar → "Publicar alterações"
  (projeto `b894ed2e-2f0d-4ef8-9bd0-7cb1ffbcdf51`). O site é **https://gestao.andrelopes.digital**
  (o `gestao-de-operacao.lovable.app` redireciona para ele).

---

## 2. O que já foi feito (fase 1 — base do app, estrutura e correções globais)

Todos os commits abaixo estão **na `main` local**. Ver a seção 3 para o que já foi (ou não) publicado.

| Commit | O que faz |
|---|---|
| `8bbf0ae` | Especificação (`docs/superpowers/specs/2026-09-25-mobile-pwa-design.md`) |
| `e62999a` | Plano da fase 1 (`docs/superpowers/plans/2026-09-25-mobile-fase-1.md`) |
| `ef3da33` | Ferramentas: auditoria mobile (Chromium/WebKit) e regressão de desktop pixel a pixel |
| `03204f2` | **PWA**: `public/manifest.webmanifest`, ícones `public/icons/{icon-192,icon-512,apple-touch-icon}.png`, metas do iPhone no `src/routes/__root.tsx` (`viewport-fit=cover`, `apple-mobile-web-app-capable`, status bar `black-translucent`, `theme-color #0e1320`), toasts abaixo da barra de status (`mobileOffset`). Teste: `src/lib/pwa.test.ts` |
| `0d08bba` | **Barra inferior** `src/components/MobileNav.tsx` (+ `src/lib/navMobile.ts` e teste), faixa escura atrás da barra de status (0 px fora do app), cabeçalho e menu lateral respeitando as áreas seguras, selo BETA escondido no celular, espaço inferior no conteúdo |
| `0b5899d` | **Componentes base**: janelas (`ui/dialog.tsx`) em tela cheia no celular com rolagem interna e rodapé (botões) preso embaixo; `ui/sheet.tsx` em largura total; `ui/alert-dialog.tsx` com margem; botões com altura mínima de 40 px no toque (`ui/button.tsx`); área de toque invisível de 40 px em checkbox e switch; itens de menu/select/abas mais altos no toque; `src/styles.css`: sem zoom do iPhone ao focar campos (`@supports (-webkit-touch-callout: none)`), sem destaque cinza de toque |
| `7ffd69d` | **Ações que só apareciam com o mouse** (`opacity-0 group-hover:opacity-100`) ganharam `pointer-coarse:opacity-100` em 11 arquivos (menus ⋮ dos cards de Demandas, Financeiro, Clientes, Links, Notas, Arquivos, Prospecção, Transcritor, Habilidades, Onboarding). Exceção proposital: a camada do "play" sobre a capa no Ver depois |
| `f8dcfd3` | **Arrastar**: `src/lib/arrastar.ts` (`useSensoresArrastar`) — mouse exatamente como antes (`PointerSensor` que ignora o dedo), toque só arrasta depois de segurar 250 ms (deslizar rola a tela). Aplicado em Demandas (`index.tsx`), Fila (`FilaComSelecao.tsx`), Trilha e editor de modelos. Verificado com `tools/auditoria-mobile/testar-arrastar.mjs`. **Antes o toque não arrastava de jeito nenhum.** |
| `3109ae2` | **Sincronia entre aparelhos**: `src/lib/versaoApp.ts` (+ 6 testes) e `src/components/AtualizarAoVoltar.tsx`. Ao voltar ao sistema depois de ≥ 60 s fora: versão nova publicada → no celular recarrega o app (se não houver janela aberta); no computador (ou com janela aberta) só aparece o aviso "Nova versão do Gestor Pro — Atualizar". Mesma versão → no celular a tela atual é remontada para buscar os dados salvos em outro aparelho; no computador nada muda. Verificado com `tools/auditoria-mobile/testar-voltar.mjs` |

**Verificações já feitas (todas passaram):**
- `npx tsc --noEmit -p tsconfig.json` → 0 erros. `npm test` → 170 testes passando.
- Janelas de criar (Financeiro, Cursos, Clientes, Saldo, Links, Planilha/CRM) em 390 e 430 px: cabem na tela e o
  botão de salvar fica visível depois de rolar. (A do Cursos **não cabia** antes.) A do Swipe não abre no teste
  automático porque o botão "Adicionar" fica desativado sem login do Google — não é defeito.
- Barra inferior presente em todas as 22 telas; nenhuma tela com rolagem lateral.
- Arrastar: mouse arrasta; toque deslizando não arrasta; toque segurando arrasta.
- Voltar ao app: celular remonta a tela; computador não muda.

**Alvos de toque < 40 px (iPhone 390 px, toque emulado) — antes → depois da fase 1** (medido com
`tools/auditoria-mobile/auditar.mjs`; "depois" preenchido na seção 3 quando a auditoria completa rodar):

(ver tabela na seção 3.2)

---

## 3. Estado no momento da pausa

### 3.1 Regressão de desktop (garantia de "desktop intocado")
- Método: duas versões lado a lado — **base** (`8bbf0ae`, sem nenhuma mudança) num worktree em
  `../gestao-base` na porta **5191**, e **nova** (`main`) na porta **5188** — capturas de página inteira das
  22 telas em 1440 e 1024 px, comparadas pixel a pixel (`tools/auditoria-mobile/comparar-desktop.mjs`).
- **1ª passada: inválida** — o servidor base tinha acabado de subir e compila cada tela no primeiro acesso, então
  várias capturas saíram antes dos dados (ex.: Cursos com 900 px de altura na base contra 7836 px na nova). As
  diferenças conferidas no PNG eram só de dado carregando (percentual, nome "Admin", contador do sino), não de
  layout. Guardada em `.auditoria/desktop-passada1/`.
- **2ª passada** (servidores aquecidos, `ESPERA_MS=12000`): **também inválida** — o servidor base do worktree não
  hidratava (erro 404 em `/@id/virtual:tanstack-start-client-entry`, porque o `node_modules` era uma junção
  compartilhada com o servidor novo, incluindo o cache do Vite). A base mostrava só o esqueleto sem dados.
  **Não usar worktree com `node_modules` compartilhado para isso.**
- **3ª passada (válida):** base = **site publicado** (https://gestao.andrelopes.digital, mesmo código de antes das
  mudanças e mesmo banco) × nova = local 5188, `ESPERA_MS=10000`. Resultado: **38 de 44 capturas idênticas (0 px)**;
  as 6 diferenças são de ambiente, não de código: Agenda e Swipe (720 px: o texto do botão "Fazer Login com o
  Google", desenhado pelo iframe do próprio Google, muda entre `localhost` e o domínio publicado) e Transcritor
  (o servidor do Transcritor recusa `localhost` no CORS, então a versão local mostra o aviso "O servidor de
  transcrição não respondeu"). **Conclusão: desktop idêntico.** Método recomendado para as próximas fases:
  `ESPERA_MS=10000 node comparar-desktop.mjs https://gestao.andrelopes.digital http://localhost:5188 …` **antes**
  de publicar a fase (depois de publicar, a referência deixa de ser a versão antiga).

### 3.2 Auditoria no celular depois da fase 1 (Chromium, iPhone 390 px, toque emulado)
Todas as 22 telas: **rolagem lateral 0, nada cortado, barra inferior presente**; todas as janelas de criar cabem e
mostram o salvar. Em Demandas o total de alvos subiu (113 → 255) porque os botões que só apareciam com o mouse
agora aparecem no toque — os que continuam pequenos (ícones `h-6` dentro dos cards) são o item 5.2 "Card".
O **WebKit não abriu** (instalação do `npx playwright-core install webkit` ficou incompleta — ver seção 4).

| Tela | Alvos de toque < 40 px — antes | depois da fase 1 | Texto < 11 px (fase 3) |
|---|---|---|---|
| / (Demandas) | 65/113 | 87/255 | 54 |
| /agenda | 27/27 | 23/33 | 1 |
| /onboarding | 57/83 | 51/88 | 1 |
| /roadmap | 31/31 | 30/48 | 1 |
| /ideias | 122/122 | 92/123 | 28 |
| /acessos | 84/84 | 31/89 | 8 |
| /saldo | 117/117 | 28/122 | 276 |
| /nps | 137/137 | 26/142 | 124 |
| /clientes | 97/109 | 35/114 | 571 |
| /prospeccao | 40/45 | 28/55 | 14 |
| /financeiro | 48/48 | 26/67 | 31 |
| /cursos | 438/438 | 34/443 | 215 |
| /livros | 40/40 | 26/45 | 3 |
| /habilidades | 103/133 | 23/138 | 26 |
| /ver-depois | 42/43 | 34/48 | 8 |
| /transcritor | 29/30 | 23/35 | 1 |
| /swipe | 45/46 | 37/51 | 3 |
| /links | 33/33 | 25/38 | 1 |
| /notas | 33/34 | 25/39 | 1 |
| /arquivos | 56/62 | 49/73 | 7 |
| /dashboard | 34/34 | 30/39 | 2 |
| /admin | 191/191 | 37/196 | 13 |

### 3.3 Resultado final da verificação e publicação
- Desktop idêntico (3.1) e celular sem rolagem lateral/corte, com janelas utilizáveis (3.2): **fase 1 aprovada**.
- **Publicada em 26/09/2026** (push da `main` + Lovable → Publicar). O item 5.1 (teste no iPhone real) é o próximo
  passo e depende do usuário.
- Pendências de verificação que ficaram: auditoria no WebKit (instalação quebrada) e teste real de "Entrar com Google"
  no app instalado.

---

## 4. Como retomar (ambiente e comandos)

1. **Servidores locais** (Git Bash, na raiz do repositório):
   - Nova: `npx vite --port 5188 --strictPort` (em segundo plano).
   - Base para comparação (só quando for comparar desktop):
     **não usar worktree** (ver 3.1): comparar com o site publicado antes de publicar a fase. Se precisar de uma base local,
     `git worktree add ../gestao-base <commit-base>` com `npm install` próprio (sem junção); no PowerShell (só se insistir na junção):
     `New-Item -ItemType Junction -Path "..\gestao-base\node_modules" -Target "<repo>\node_modules"`;
     dentro de `../gestao-base`: `npx vite --port 5191 --strictPort`.
     **Aquecer** os dois (abrir todas as telas uma vez) antes de comparar, ou usar `ESPERA_MS=12000`.
   - Ao terminar: parar os dois `vite` (PowerShell: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
     ? { $_.CommandLine -match 'vite' -and $_.CommandLine -match '5188|5191' } | % { Stop-Process -Id $_.ProcessId -Force }`)
     e `git worktree remove ../gestao-base --force`.
   - Nunca dois `vite` no **mesmo** diretório (o `routeTree.gen.ts` entra em ping-pong e a página recarrega sem parar).
2. **Ferramentas** (`tools/auditoria-mobile`, já instaladas com `npm install`):
   - Celular: `node auditar.mjs http://localhost:5188 ../../.auditoria/<nome> chromium` (ou `webkit`).
     Filtrar telas: `MSYS_NO_PATHCONV=1 ROTAS=/,/agenda node auditar.mjs …` — **sem `MSYS_NO_PATHCONV=1` o Git Bash
     transforma `/agenda` em `C:/Program Files/Git/agenda`**.
   - Desktop: `ESPERA_MS=12000 node comparar-desktop.mjs http://localhost:5191 http://localhost:5188 ../../.auditoria/desktop`.
   - Arrastar: `node testar-arrastar.mjs http://localhost:5188`. Voltar ao app:
     `MSYS_NO_PATHCONV=1 node testar-voltar.mjs http://localhost:5188 /financeiro`.
   - Ícones: `node gerar-icones.mjs`.
   - WebKit (motor do Safari): `npx playwright-core install webkit` — na pausa a instalação estava com trava
     (`%LOCALAPPDATA%\ms-playwright\__dirlock`); se `auditar.mjs … webkit` falhar ao abrir, apagar a trava e
     reinstalar.
3. **O app local usa o banco de produção.** Teste que grava dado: criar com nome "TESTE …" e apagar no fim.
4. **Publicar**: `git push origin main` → Lovable → Publicar → "Publicar alterações" → conferir pelo texto/código no
   site (o nome do `main-*.js` muda; chunks por tela, ex. `agenda-*.js`). Ver memória `lovable-build-falhando`.

---

## 5. O que falta — PLANO DE AÇÃO DETALHADO

Ordem recomendada: **5.1 → 5.2 (Demandas, Agenda) → 5.3 (Ferramentas) → 5.4 (demais telas) → 5.5 (transversais)**.
Cada item tem: problema hoje, comportamento alvo, arquivos, como fazer, como verificar e critério de pronto.
Regra de ouro em **todos** os itens: classe nova de celular sempre com prefixo `max-lg:`/`max-md:`/`max-sm:` ou
`pointer-coarse:`; ao fim de cada bloco, rodar a regressão de desktop (0 px de diferença de layout).

### 5.1 Fechar a fase 1 no iPhone real (fazer primeiro)
- [ ] Se a seção 3.3 disser "não publicado": resolver o que ela apontar, dar push e publicar no Lovable.
- [ ] No iPhone: Safari → https://gestao.andrelopes.digital → Compartilhar → "Adicionar à Tela de Início" → abrir
      pelo ícone "Gestor Pro". Conferir e anotar:
  - [ ] Abre em tela cheia, sem barra do Safari; faixa escura atrás do relógio/bateria; ícone certo (degradê azul
        com faíscas).
  - [ ] Barra inferior não fica atrás do indicador de início (a "risca" de baixo); cabeçalho não fica atrás do
        entalhe.
  - [ ] "Nova fonte" (Financeiro) e "Novo curso" (Cursos): janela em tela cheia, rola, Salvar sempre visível,
        **o teclado não cobre o campo em foco nem o botão Salvar** (se cobrir → item 5.5.6).
  - [ ] Nenhum campo dá zoom ao tocar.
  - [ ] Demandas: segurar um card ~¼ s e arrastar para outra coluna; deslizar o dedo rola normalmente.
  - [ ] "Entrar com Google" no Transcritor e no Swipe file **dentro do app instalado** (risco conhecido: popup do
        Google em app instalado). Se não funcionar → item 5.5.4.
  - [ ] Sair do app por 2 min, criar algo no computador (ex.: uma nota), voltar ao app → a nota aparece sem
        fechar o app.
  - [ ] Publicar qualquer mudança pequena, voltar ao app após 1 min → o app recarrega na versão nova.

### 5.2 Fase 2a — Demandas (`src/routes/_authenticated/index.tsx`, `src/components/KanbanColumn.tsx`, `src/components/KanbanCard.tsx`, `src/components/demandas/*`)
Estado hoje (390 px): cabeçalho "Demandas · Ocultar Calendário · Board/Lista" estoura a largura e o seletor
Board/Lista fica cortado; colunas têm 280 px fixos (`KanbanColumn.tsx:173` `w-[280px] shrink-0`) e o quadro rola na
horizontal (`index.tsx:808` `overflow-x-auto`) com a próxima coluna "espiando"; a faixa de "Previsão de
recorrências" (`index.tsx:744-756`, cartões `min-w-[100px] max-w-[150px]`) ocupa muito; busca `max-w-[200px]`
(`index.tsx:784`); 55 textos < 11 px.
- [ ] **Cabeçalho**: no celular quebrar em duas linhas (`max-md:flex-wrap`), título em cima; "Ocultar/Mostrar
      Calendário" vira só ícone (`max-md:` esconder o texto, manter `aria-label`/`title`); seletor Board/Lista
      inteiro visível. Verificar em 390 px que nada passa de 390 (auditoria: `vazam:0`).
- [ ] **Colunas uma por tela**: no celular, cada coluna com largura `max-md:w-[calc(100vw-2rem)]`, contêiner com
      `max-md:snap-x max-md:snap-mandatory` e cada coluna `max-md:snap-start`; esconder a coluna "+ nova coluna"
      de 200 px no celular (ou deixá-la no fim). Indicador de posição: pontinhos ou "2/5 · Fazer hoje" fixo acima
      do quadro, atualizado por `IntersectionObserver` nas colunas (componente novo
      `src/components/demandas/IndicadorColunas.tsx`, só `lg:hidden`). Tocar num pontinho rola até a coluna
      (`scrollIntoView({ behavior: "smooth", inline: "start" })`).
- [ ] **"Mover para…" no menu do card** (alternativa a arrastar entre colunas, essencial no celular): no
      `DropdownMenu` do `KanbanCard` acrescentar um submenu "Mover para" com as colunas (e, nas colunas com dias,
      os dias) e reaproveitar a mesma função que o `handleDragEnd` usa para salvar status/ordem (em `index.tsx`,
      extrair para uma função `moverDemanda(id, colunaDestino, dia?)` chamada pelos dois caminhos). Mostrar o
      item só no toque? **Não**: mostrar sempre é mudança de desktop — então renderizar o item com
      `className="lg:hidden"` ou condicionar a `useIsCoarse()`; verificar regressão de desktop.
      Critério: mover um card "TESTE" de coluna pelo menu no 390 px e conferir no banco; apagar o teste.
- [ ] **Previsão de recorrências**: no celular, cartões menores (`max-md:min-w-[84px]`) e a seção inicia
      recolhida (respeitando a preferência `demandas_calendar_visible`; ver 5.5.3).
- [ ] **Busca**: `max-md:max-w-none max-md:flex-1`.
- [ ] **Card**: botões internos (atribuir pessoa, OK/concluir, observação) com área de toque de 40 px no toque
      (`pointer-coarse:`), textos de 9–10 px para 11 px no celular (`max-md:text-[11px]`), título sem cortar.
- [ ] **Barra de seleção em massa** (`selecaoAtiva`, `pb-20`): garantir que fica **acima** da barra inferior do
      app (`max-lg:bottom-[calc(4rem+env(safe-area-inset-bottom))]`) — hoje as duas se sobrepõem.
- [ ] **Janela de demanda** (`src/components/DemandaForm.tsx` e detalhes): conferir tela cheia, seletores de
      cliente (`ClientePicker.tsx`) e datas utilizáveis com o dedo.
- [ ] Verificar: auditoria de `/` (390 e 430) com `vazam:0`, `peq` < 10; captura manual; `testar-arrastar.mjs`
      ainda OK; regressão de desktop 0 px.

### 5.3 Fase 2b — Agenda (`src/routes/_authenticated/agenda.tsx`, `src/components/agenda/AgendaGrade.tsx`, `src/components/agenda/EventoDialog.tsx`)
Estado hoje: visão padrão `timeGridWeek` (`agenda.tsx:84`, salva em `CHAVE_VISAO` no armazenamento local); em 390 px
a semana fica ilegível; `headerToolbar={false}` (barra própria); criar evento depende de arrastar/selecionar na
grade (no toque o FullCalendar exige toque longo). A tela não foi auditada com login (depende do Google).
- [ ] **Visão padrão no celular**: se `matchMedia("(max-width: 767px)")` e o usuário ainda não escolheu nada neste
      aparelho, iniciar em `timeGridDay`; acrescentar a visão **lista** (`listWeek`, plugin
      `@fullcalendar/list` — **atenção: é dependência nova**; alternativa sem dependência: usar `timeGridDay` +
      botões de dia anterior/próximo). Decidir com o usuário se pode acrescentar o plugin (exige atualizar
      `bun.lockb` — só dá para fazer pelo chat do Lovable ou numa máquina com bun).
- [ ] **Barra da agenda**: no celular, botões Hoje/‹/› e seletor de visão numa linha só, título do período abaixo;
      nada cortado em 390 px.
- [ ] **Criar evento no toque**: no `AgendaGrade`, `selectLongPressDelay={300}` e `eventLongPressDelay={300}`; e um
      botão flutuante "+ Evento" (`lg:hidden`, acima da barra inferior) que abre o `EventoDialog` com o próximo
      horário cheio.
- [ ] **Deslizar para trocar de dia/semana** (opcional): gesto horizontal na grade chama `api.next()/prev()`.
- [ ] **EventoDialog**: já herda tela cheia; conferir o seletor de data/hora, participantes e o botão "Entrar"
      do Meet (que já abre com `authuser=contato@andrelopes.digital`).
- [ ] Verificar com login: pedir ao usuário para entrar com Google no navegador de teste, ou testar no iPhone.

### 5.4 Fase 2c — Ferramentas
**Transcritor** (`src/routes/_authenticated/transcritor.tsx`, `src/components/transcritor/*`, fila em
`src/components/fila/FilaComSelecao.tsx`):
- [ ] Botão "Transcrever" e zona de envio: no iPhone o `<input type="file" accept="audio/*,video/*">`
      (`TranscreverDialog.tsx:138`) já abre Fotos/Arquivos — conferir que vídeos gravados no iPhone (.mov) sobem e
      que o progresso aparece.
- [ ] Lista de transcrições (`ListaTranscricoes.tsx`): cartões em uma coluna; ações Copiar/.txt/Ver texto num menu
      ⋮ no celular; "Copiar" funciona no iOS (exige gesto do usuário — já é clique).
- [ ] Download ".txt" no app instalado do iOS abre a folha de compartilhar — conferir e, se ruim, oferecer
      "Copiar texto" como ação principal no celular.
- [ ] Fila: arrastar com segurar já funciona; conferir botões de pausar/cancelar com 40 px.

**Swipe file** (`src/routes/_authenticated/swipe.tsx`, `src/components/swipe/*`):
- [ ] Grade de itens (`swipe.tsx:338` `grid-cols-1 md:grid-cols-2`): no celular 2 colunas de miniaturas
      (`max-md:grid-cols-2`) com cartão compacto; conferir miniaturas do Drive.
- [ ] `SwipeAddDialog.tsx`: envio de arquivo (`:324`) a partir de Fotos; carrossel com múltiplos arquivos; campos
      de nicho/subnicho (datalist) utilizáveis no iPhone.
- [ ] Filtros por nicho/categoria: barra rolável horizontal com indicação de continuidade.

**Links** (`src/routes/_authenticated/links.tsx`): cartões em 1 coluna no celular, ações do cartão (já visíveis no
toque) com 40 px, barra de seleção em massa acima da barra inferior.

**Notas** (`src/routes/_authenticated/notas.tsx`, `src/components/notas/EditorNota.tsx`):
- [ ] Barra de ferramentas do editor presa no topo da área de edição (`sticky`) e rolável na horizontal no celular.
- [ ] **Colunas** (`extensaoColunas.ts`, até 4): no celular exibir empilhadas (CSS `max-md:` no nó de colunas:
      `grid-cols-1`); o documento salvo não muda.
- [ ] Imagens: inserir da câmera/Fotos no iPhone (bucket `notas`).
- [ ] Teclado do iPhone não pode cobrir a linha em edição (ver 5.5.6).

**Arquivos** (`src/routes/_authenticated/arquivos.tsx`, `src/components/pdfs/*`, lib `src/lib/pdfsArvore.ts`):
- [ ] Árvore de pastas (`arquivos.tsx:566` `arvore.map … <ArvoreItem>`) numa gaveta (`Sheet` lateral) no celular,
      aberta por um botão "Pastas" (`lg:hidden`); a lista de arquivos ocupa a tela.
- [ ] Envio (`arquivos.tsx:479` e `:519`, `type="file"`): a partir de Arquivos/Fotos do iPhone; conferir PDFs e
      documentos.
- [ ] Menu de ações do arquivo (trocar arquivo, mover, apagar) com 40 px; visualização de PDF no iOS abre em nova
      aba (ok no app instalado?).

### 5.5 Fase 3 — demais telas (uma por vez, com captura antes/depois)
Para cada tela: (1) cartões de resumo em 2 colunas no celular com padding e fonte ajustados para não transbordar;
(2) textos de conteúdo ≥ 11 px no celular (`max-md:text-[11px]` onde hoje é 9–10 px — **não** mexer nos selos de
altura fixa `h-4` sem aumentar a altura junto); (3) barras de abas/filtros roláveis com indicação; (4) tabelas
viram cartões no celular (`lg:hidden` para cartões, `max-lg:hidden` para a tabela) ou rolam dentro de um contêiner.

| Tela | Arquivo | O que fazer | Texto < 11 px hoje |
|---|---|---|---|
| Saldo | `routes/_authenticated/saldo.tsx` (resumo em `:552` `lg:grid-cols-5`) | 5 cartões de resumo → 2 colunas; lista de contas compacta; formulário de recarga | 277 |
| Clientes | `clientes.tsx` (`:439` resumo; `:512/:544` grades) | resumo 2 colunas; visão "Tabela" → cartões no celular; filtro de agências rolável | 572 |
| Cursos | `cursos.tsx` (`:253` `md:grid-cols-3`) | 3 cartões → linha compacta; categorias roláveis; cartões de curso | 216 |
| NPS | `nps.tsx` (`:195`) | resumo 2 colunas; lista | 125 |
| Financeiro | `financeiro.tsx` (`:366` resumo; `:467/:481` grades; visão lista = `<table>`) | resumo 2 colunas; esconder a visão lista no celular ou virar cartões; parcelas no card já ok | 32 |
| Ideias | `ideias.tsx` (`:235`) | cartões; filtros | 30 |
| Habilidades | `habilidades.tsx` (`:526`) | grade; ações | 27 |
| Prospecção | `prospeccao.tsx` + `components/prospeccao/*` | quadro de funil = mesmo tratamento das Demandas (uma coluna por tela + "Mover para…") | 15 |
| Admin | `admin.tsx` | abas no topo roláveis (hoje cortadas); formulários longos | 14 |
| Ver depois | `ver-depois.tsx` (`:223`) | grade 2 colunas de miniaturas | 9 |
| Planilha/CRM | `acessos.tsx` (`:318`) | já bom; ações 40 px | 9 |
| Livros | `livros.tsx` (`:262`) | resumo | 4 |
| Dashboard | `dashboard.tsx` (tabela de 356 px) | gráficos com altura menor; tabela rolável | 3 |
| Onboarding | `onboarding.tsx` + `components/processos/*` (Trilha) | trilha horizontal com arrastar (já com segurar) | 2 |
| Roadmap | `roadmap.tsx` | conferir | 2 |

### 5.6 Pendências transversais
1. **Preferências que ficam só no aparelho** (hoje em `localStorage`): `hidden_notification_ids` (avisos do sino
   dispensados — `NotificationBell.tsx`), `demandas_calendar_visible` (Demandas), `sidebar-collapsed` (só
   desktop) e `theme` (tema — por aparelho é o esperado). **Decidir com o usuário** se os dois primeiros devem
   valer em todos os aparelhos. Se sim: tabela `preferencias_usuario (chave text primary key, valor jsonb,
   updated_at timestamptz)` com policy `FOR ALL USING (true) WITH CHECK (true)` (padrão do projeto, app sem login),
   migration aplicada pelo SQL editor do Lovable (ver memória `supabase-migrations-manual`), lib
   `src/lib/preferencias.ts` com `lerPreferencia/gravarPreferencia` e fallback para o `localStorage`.
2. **Dados que mudam em outro aparelho com a tela aberta**: só 7 lugares têm tempo real (`NotificationBell`,
   `agencias`, `plataformas`, `dashboard`, `saldo`, `swipe`, layout). No celular, voltar ao app já recarrega a tela
   (fase 1). No **computador**, hoje só atualiza ao navegar. Opção para decidir com o usuário: um sinal global
   "atualizar" (evento `gestor:atualizar`) disparado ao voltar à aba depois de ≥ 5 min, e cada tela recarrega os
   dados **sem** remontar (mantém filtros) — exige tocar em cada tela (hook `useAoAtualizar(fetch)`).
3. **Realtime nas tabelas do financeiro**: `financeiro_fontes`/`financeiro_recebimentos` não estão na publicação
   `supabase_realtime`, então o sino não atualiza sozinho — `ALTER PUBLICATION supabase_realtime ADD TABLE …`.
4. **Login do Google no app instalado**: se o "Entrar com Google" falhar no iPhone (popup em app instalado), trocar
   o GIS para o modo redirect (`ux_mode: "redirect"` com `login_uri` numa edge function) ou orientar a entrar pelo
   Safari. Reconexão do Drive/Agenda (Admin, fluxo OAuth por redirect) pode abrir no Safari — orientar a fazer
   pelo Safari.
5. **Notificações no iPhone** (futuro, opcional): Web Push funciona em app instalado no iOS 16.4+; exigiria service
   worker só para push (sem cache) + chaves VAPID + edge function para enviar. Fora do escopo aprovado.
6. **Teclado do iPhone cobrindo campos/rodapé**: se no teste 5.1 o teclado cobrir o botão Salvar das janelas,
   usar `window.visualViewport` (evento `resize`) para ajustar a altura da janela
   (`--altura-visivel`) — componente pequeno no `DialogContent` só no toque.
7. **Textos < 11 px** (auditoria): tratar tela a tela (tabela 5.5); regra global descartada (quebra selos `h-4`).
8. **Barras de abas roláveis sem indicação** (Clientes, Cursos, Admin, Planilha/CRM): adicionar degradê na borda
   direita (`max-md:` máscara `mask-image: linear-gradient(to right, black 85%, transparent)`).
9. **WebKit**: rodar `auditar.mjs … webkit` quando a instalação do WebKit terminar (ver seção 4) e comparar com o
   Chromium.

### 5.7 Critério de "pronto" do app
- [ ] Regressão de desktop: 0 px de diferença de layout em 1440 e 1024 px nas 22 telas.
- [ ] Auditoria no celular (Chromium e WebKit, 390 e 430 px): `lateral:0`, `vazam:0` em todas; alvos < 40 px só em
      links de texto; texto < 11 px só em selos decorativos; todas as janelas de criar com salvar visível.
- [ ] Checklist 5.1 completo no iPhone do usuário.
- [ ] Todas as funções usadas no computador também feitas no iPhone ao menos uma vez (criar/editar/apagar em cada
      tela prioritária, arrastar, enviar arquivo, transcrever, login do Google).

---

## 6. Riscos e armadilhas conhecidas
- **Desktop**: qualquer classe sem prefixo de celular muda o desktop. Sempre rodar a regressão; se a 1ª passada
  acusar diferença em tudo, é servidor frio — aquecer e repetir.
- **Git Bash**: argumentos e variáveis começando com `/` viram caminho do Windows (`MSYS_NO_PATHCONV=1`).
- **Gerador de ícones**: usar `fileURLToPath` (caminho com acento vira `%C3%A3` se usar `.pathname`).
- **Sensores do dnd-kit**: os botões dentro do card bloqueiam `onPointerDown`; não trocar o sensor de mouse por
  `MouseSensor` (clicar num botão do card começaria arrasto).
- **Remontar a tela ao voltar** (só no celular) apaga filtros e rolagem da tela atual — aceito para o celular; não
  levar para o desktop sem o sinal "atualizar sem remontar" (5.6.2).
- **Lovable**: push não publica; auto mode do Claude Code bloqueia algumas ações de produção (Portainer, publicar) —
  pedir ao usuário para sair do auto mode quando preciso.
- **Banco de produção** no app local: testes que gravam devem usar "TESTE …" e apagar no fim.
