# Gestor Pro no iPhone: app instalável (PWA) e telas otimizadas para celular

Data: 25/09/2026 · Status: aprovado pelo usuário em chat

## Objetivo

Usar o sistema no iPhone como um app (ícone na tela de início, tela cheia), extremamente responsivo, com
**todas as funções preservadas** e **o computador exatamente como está hoje**.

## Restrições

- **Desktop intocado:** nenhuma mudança visual ou de comportamento a partir de 1024 px de largura (`lg`)
  com mouse. Tudo o que muda fica atrás de variantes de tela pequena (`max-lg:`/`max-md:`/`max-sm:`),
  de ponteiro de toque (`pointer-coarse:`) ou de componentes só renderizados no celular.
- **Mesmo código, mesmas funções:** nada de telas paralelas "só mobile" que dupliquem regra de negócio.
- **Sem modo offline:** não haverá service worker; o app sempre carrega a versão publicada e os dados ao vivo
  (evita app preso em bundle antigo depois de publicar no Lovable).
- Alvo principal: iPhone (Safari / app da tela de início), larguras de 390 e 430 px.

## Abordagem escolhida

App web instalável (PWA) + ajustes responsivos no próprio código. Alternativas descartadas: telas separadas
para celular (duplicação, risco de perder funções) e app nativo via Capacitor (conta Apple, revisão a cada
versão, sem ganho para o uso atual).

## Desenho

### 1. Base do app (PWA)
- `public/manifest.webmanifest` (nome "Gestor Pro", `display: standalone`, `start_url: /`, cores do tema),
  ícones 192/512 e `apple-touch-icon` 180, metas `apple-mobile-web-app-*` e `theme-color` no `__root.tsx`.
- `viewport-fit=cover` + `env(safe-area-inset-*)` no cabeçalho e na barra inferior (entalhe e indicador de início).
- Risco conhecido: o "Entrar com Google" (GIS, popup) deve funcionar no app instalado; o fluxo de reconexão
  OAuth do Drive/Agenda (redirect, raro, no Admin) pode abrir no Safari — nesse caso reconectar pelo Safari.

### 2. Estrutura no celular (< 1024 px)
- **Barra inferior fixa**: Demandas, Agenda, Notas, Transcritor e **Mais** (abre o menu lateral completo que já
  existe). Some a partir de `lg`.
- Cabeçalho compacto (sem o selo BETA no celular), respeitando a área segura do topo.
- Conteúdo com espaço inferior para não ficar atrás da barra.

### 3. Correções globais (valem para todas as telas)
- **Janelas (Dialog)**: no celular ocupam a tela, com rolagem interna e rodapé (botões) sempre visível.
  Sheets laterais em largura total.
- **Ações só no hover** (`opacity-0 group-hover:opacity-100`, 11 arquivos): visíveis em ponteiro de toque.
- **Alvos de toque** ≥ 40 px no toque (botões de ícone, checkboxes, switches, itens de menu) e textos de
  conteúdo com no mínimo 11 px no celular.
- **Arrastar (dnd-kit)**: mouse como hoje; no toque, segurar ~250 ms para arrastar — deslizar rola a tela.
- **Cartões de resumo** em 2 colunas no celular; barras de abas roláveis com indicação de continuidade.
- **Campos**: nenhum abaixo de 16 px no celular (evita o zoom do iPhone ao focar).

### 4. Tela por tela
- **Fase 2 (prioridades do usuário)**
  - Demandas: cabeçalho que quebra linha; uma coluna por tela com deslize lateral (scroll-snap) e indicador;
    ação "Mover para…" no menu do card como alternativa a arrastar entre colunas.
  - Agenda: visão de dia/lista por padrão no celular, barra de ferramentas compacta, evento em tela cheia.
  - Ferramentas: Transcritor, Swipe file, Links, Notas (barra do editor fixa, colunas viram uma) e Arquivos
    (árvore de pastas em gaveta, envio pelo iPhone).
- **Fase 3**: Saldo, Clientes, Prospecção, Financeiro, Cursos, Livros, Habilidades, Ver depois, Onboarding,
  Roadmap, Ideias, Planilha/CRM, NPS, Dashboard e Admin.

### 5. Verificação
- **Regressão de desktop**: capturas de todas as 22 telas em 1440×900 do commit base e da versão nova, lado a
  lado (dois servidores locais, mesmos dados, animações desligadas) e comparação pixel a pixel — diferença
  zero ou justificada por dado vivo.
- **Métricas no celular** (390×844 e 430×932, Chromium e WebKit): sem rolagem lateral, sem conteúdo cortado,
  alvos de toque < 40 px e textos < 11 px tendendo a zero, janelas com Salvar alcançável.
- Cada fase é commitada, publicada no Lovable e fica testável no iPhone; teste final do usuário no aparelho.
