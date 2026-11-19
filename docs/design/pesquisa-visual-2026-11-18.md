# Pesquisa visual do front end (18/11/2026)

Objetivo: escolher uma direção de design para o sistema inteiro, mantendo a paleta azul e grafite (claro e escuro) e sem mudar nenhuma função. Aba usada como mockup: **Demandas** (quadro, lista, gaveta de detalhe, modal Nova/Agendar, tarefas agendadas, Ctrl+K).

## Como pesquisei
Navegador do André: sites de produto (Vercel, Stripe, Cal.com, Linear, Attio, Raycast, Twenty, Plane, Folk, Notion, Resend, Superhuman, Odoo CRM), Pinterest ("crm dashboard ui dark minimal", "saas dashboard light mode elegant ui"), Dribbble ("kanban crm dashboard") e Mobbin (logado). Instagram, Facebook e Threads ficaram de fora (regra da Meta). Limite honesto: vi principalmente páginas de produto e capturas de interface, não usei cada produto por dentro. A aba do X e o Godly/Refero não entraram nesta rodada.

Avaliação feita com os critérios das skills impeccable (modo Operate: precisão e restrição), frontend-design, ui-ux-pro-max e web-design-guidelines: contraste mínimo 4,5:1, sombras com deslocamento e desfoque, um único momento de movimento com saída exponencial, foco visível, numerais tabulares, ícones SVG de um só conjunto (Lucide), sem texto em gradiente, sem vidro decorativo, sem borda lateral grossa em cartão.

## As 10 plataformas selecionadas
| # | Plataforma | O que tem de bom | O que levamos |
|---|---|---|---|
| 1 | Linear | Escuro de grafite, tipografia nítida, interface densa e calma | Hairlines de 1px, raio curto, densidade alta (direção 1) |
| 2 | Attio | CRM claro, branco, CTA preto, respiro generoso | Papel branco, sombra suave, títulos grandes (direção 2) |
| 3 | Vercel | Monocromo extremo, grade fina, contraste máximo | Quinas retas, linhas em vez de caixas, foco azul (direção 3) |
| 4 | Raycast | Escuro futurista, brilho pontual, paleta de comandos | Ctrl+K como porta de entrada, brilho só no foco (direção 3) |
| 5 | Twenty | CRM aberto, título em serifa, rótulos em mono | Serifa nos títulos, dados em mono (direção 4) |
| 6 | Resend | Escuro editorial, serifa de exibição | Serifa elegante sem perder leitura técnica (direção 4) |
| 7 | Plane | Gestão de projetos clara e neutra, botão preto | Quadro limpo e raias discretas (direções 2 e 5) |
| 8 | Folk | CRM leve, grotesca apertada, tom amigável | Avatares e etiquetas com cor (direção 5) |
| 9 | Notion | Suave, raio generoso, destaque em pílula | Raios grandes e movimento com mola (direção 5) |
| 10 | Superhuman | Atalhos primeiro, gradiente de céu, botão roxo | Teclado como cidadão de primeira (Ctrl+K, Esc, setas) |

## As 5 direções (mockups)
Todas usam os mesmos tokens oklch do sistema (azul primário `0.55 0.2 262` no claro e `0.72 0.15 235` no escuro) e valem para claro e escuro; o botão de tema fica no rodapé do menu lateral e o seletor de direções fica embaixo da tela.

| Porta | Direção | Fonte | Resumo |
|---|---|---|---|
| 5301 | 1 · Grafite de precisão (abre no escuro) | Inter | Denso, hairlines, raio de 4 a 8px, colunas separadas por linha |
| 5302 | 2 · Claro editorial (abre no claro) | Geist | Respiro, cartões brancos com sombra suave, título de 22px |
| 5303 | 3 · Monocromo futurista (abre no escuro) | Geist + Geist Mono | Quinas retas, lista em linhas, botão primário preto/branco, datas em mono |
| 5304 | 4 · Serifa e mono (abre no claro) | Instrument Serif + Geist Mono | Títulos serifados, datas em mono, sombra dura no hover |
| 5305 | 5 · Suave e amigável (abre no claro) | DM Sans | Raios de 12 a 22px, raias coloridas, menu ativo em azul cheio, movimento com mola |

Todas mantêm a posição atual dos botões da Demandas: Buscar, Quadro/Lista, Agendar, Agendadas, Nova.

## Como ver
Rodar `node docs/design/lab/servir.mjs` (sobe 5301 a 5305). Cada página tem o seletor de direções embaixo, o botão de tema, cartões clicáveis (gaveta), Agendar, Agendadas, Nova, arrastar entre colunas, busca e Ctrl+K. Os dados são fictícios e nada vai para o banco. Nada em `src/` foi alterado.

## Próximo passo
André escolhe uma direção (ou mistura, por exemplo cartões da 2 com tipografia da 4). Depois seguimos a ordem combinada: cabeçalho padrão das páginas, painel "hoje" da Início, ficha do cliente, menu novo.
