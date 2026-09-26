# Fluxogramas — design (quadro infinito estilo Miro + mapas mentais estilo MindMeister)

Data: 26/09/2026. Aprovado em conversa.

## 1. Objetivo

Aba **Fluxogramas** (grupo Ferramentas, `/fluxogramas`) com quadros infinitos para funis, cards, fluxogramas e mapas
mentais: formas de vários tipos redimensionáveis com o mouse, setas livres e presas às formas, caneta, mapa mental com
organização automática, exportação em alta qualidade (PDF vetorial retrato/paisagem, PNG, SVG, PPT, DOCX — do quadro
todo, de molduras ou da seleção) e ligação de cards com Demandas e Roadmap. Tudo salvo no sistema.

## 2. Decisões do usuário

1. Todos os recursos serão usados (quadro livre, mapa mental, funis/fluxogramas); armazenamento no sistema.
2. Base: **Excalidraw** (MIT), com traço limpo; o que falta é construído por cima (lista aprovada na conversa).
3. Entrega em etapas, cada uma testada e publicada: (1) base + quadro + formas extras + salvamento, (2) mapa mental,
   (3) exportação, (4) vínculos com Demandas/Roadmap, (5) modelos, apresentação e "colar tópicos".

## 3. Base técnica

- Dependências novas (todas MIT/licença aberta), instaladas **pelo chat do Lovable** (o `bun.lockb` não é gerado nesta
  máquina): `@excalidraw/excalidraw@^0.18.1`, `jspdf@^3`, `svg2pdf.js@^2`, `pptxgenjs@^4`, `docx@^9`. O pedido ao
  Lovable é só instalar (sem mudar código); depois `git pull` e conferir `package.json`/`bun.lockb`.
- O Excalidraw só existe no navegador: a rota carrega o editor por `import()` dinâmico dentro de um componente
  cliente (nada dele no SSR nem no pacote principal). CSS `@excalidraw/excalidraw/index.css` importado no mesmo
  módulo carregado sob demanda. Fontes do Excalidraw vêm do CDN padrão dele.
- Regras puras (layout de mapa mental, geometria das formas extras, modelos, montagem de páginas de exportação,
  parse de "colar tópicos", links internos) ficam em `src/lib/fluxo*.ts`, sem imports `@/`, testadas com `npm test`.

## 4. Dados

Migration `supabase/migrations/20260926210000_fluxogramas.sql` (idempotente, padrão de RLS aberta do projeto):

- **`fluxo_temas`**: `id uuid`, `nome`, `hex`, `ordem`, `created_at` (mesmo formato de `link_temas`/`nota_temas`,
  gerido com o componente de temas que já existe).
- **`fluxos`**: `id uuid`, `titulo text not null default 'Sem título'`, `tema_id uuid → fluxo_temas on delete set
  null`, `cena jsonb not null default '{}'` (`{ elements, appState: {viewBackgroundColor, gridSize, gridModeEnabled},
  arquivos: { [fileId]: { caminho, mimeType } } }`), `miniatura text` (SVG pequeno, até ~60 KB), `modelo text`,
  `created_at`, `updated_at`.
- **`fluxo_vinculos`**: `id uuid`, `fluxo_id → fluxos on delete cascade`, `elemento_id text`, `tipo text check in
  ('demanda','roadmap_passo')`, `alvo_id uuid`, `created_at`; índice único `(fluxo_id, elemento_id, tipo, alvo_id)`.
- **Bucket privado `fluxogramas`**: imagens coladas (`<fluxoId>/<fileId>.<ext>`), lidas por URL assinada e entregues
  ao Excalidraw como dataURL ao abrir o quadro. Imagem que sai do quadro é apagada no salvamento seguinte.

Salvamento automático 1,5 s depois da última mudança (e ao sair da aba/fechar), com indicador "Salvando…/Salvo/Erro ao
salvar — tentar de novo". Um aparelho por vez: ao abrir, carrega a versão do banco; ao salvar, se `updated_at` do banco
for mais novo que o carregado, pergunta se sobrescreve ou recarrega.

## 5. Telas

### 5.1 Lista (`/fluxogramas`)
Cards com miniatura, título, tema e "editado há…"; busca por título e pelos textos do quadro; filtro por tema (chips,
como Notas/Links); menu do card: abrir, renomear, duplicar, mover de tema, excluir (AlertDialog). "Novo quadro" abre a
escolha de modelo: Em branco, Mapa mental, Funil de vendas, Fluxograma, Jornada do cliente, SWOT, Matriz de prioridade
(os modelos chegam na etapa 5; até lá só "Em branco" e "Mapa mental").

### 5.2 Editor (`/fluxogramas/$id`)
- Quadro em tela cheia dentro do layout do app; botão Tela cheia (Fullscreen API). Barra superior própria: voltar,
  título editável, estado do salvamento, Exportar, Apresentar.
- Excalidraw em pt-BR, tema seguindo o app, padrões de traço limpo: `roughness 0`, fonte Nunito, borda 2 px, cantos
  arredondados; o usuário pode mudar por elemento (inclusive "estilo rabisco").
- Painel lateral "Gestor Pro" (Sidebar do Excalidraw) com abas: **Formas** (funil 3–6 etapas, cone, cilindro,
  pirâmide, trapézio, estrela, chevron/seta de processo, nuvem), **Cards** (arredondado, quadrado, post-it amarelo,
  card de etapa com título + descrição), **Mapa mental**, **Modelos**, **Vínculos**. Clicar insere no centro da
  tela, já selecionado; arrastar dá para posicionar; redimensionar é o do Excalidraw.
- Formas extras são elementos `line` fechados (polígono com preenchimento) + texto agrupado; as dimensões saem de
  `fluxoFormas.ts` (geometria pura, testada) e escalam com o mouse.

## 6. Mapa mental (etapa 2)

- Nó = retângulo arredondado com texto; ligação = seta presa aos dois nós. Metadados em `customData.mm`:
  `{ raiz: string, pai: string | null, lado: "dir" | "esq", recolhido?: boolean }`.
- Atalhos com um nó selecionado: **Tab** filho, **Enter** irmão, **Delete** apaga o ramo (com desfazer), **Ctrl+.**
  recolhe/expande, **Ctrl+Shift+L** reorganiza.
- Recolher tira os descendentes da cena e guarda em `customData.mm.oculto` do nó (volta ao expandir); exportação não
  inclui ramos recolhidos.
- Reorganizar (`fluxoMapaMental.ts`, puro): árvore horizontal para os dois lados, espaçamento por altura de subárvore,
  cor por ramo de primeiro nível (paleta fixa), raiz maior e mais escura.

## 7. Exportação (etapa 3)

Janela Exportar: escopo **quadro todo** | **molduras** (cada uma vira página/slide) | **seleção**; formato:
- **PDF vetorial** (`exportToSvg` → `svg2pdf` no jsPDF): A4, A3 ou Carta; retrato, paisagem ou automático; margem;
  fundo branco/escuro/transparente; **caber em uma página** ou **tamanho real dividido em várias páginas**. Texto e
  formas continuam vetoriais (zoom sem perder qualidade).
- **PNG** 2×/4×/8× (reduz automaticamente se passar do limite de canvas do navegador).
- **SVG**.
- **PPT** (pptxgenjs): 16:9, um slide por moldura (ou um só com a seleção), título do slide = nome da moldura, imagem
  PNG 4× encaixada.
- **DOCX** (docx): título do quadro, uma imagem por moldura/seleção (SVG com alternativa PNG), e os textos; mapa
  mental sai também como lista com recuo.
Nome dos arquivos: `fluxograma-{titulo}-{aaaa-mm-dd}.{ext}`.

## 8. Vínculos com Demandas e Roadmap (etapa 4)

- Com um card selecionado (painel Vínculos): **Criar demanda** (título = texto do card, status inicial da 1ª coluna
  de Demandas), **Criar passo no Roadmap** (escolhe o roadmap ativo de um cliente), **Vincular a existente** (busca por
  título), **Desvincular**. Cada vínculo grava `fluxo_vinculos` e põe `element.link` com endereço interno
  (`/?demanda=<id>` ou `/roadmap?id=<processoId>`); `onLinkOpen` navega dentro do app.
- A aba Demandas passa a abrir a demanda do `?demanda=<id>` (abre o drawer dela).
- Etiqueta de status sobre cards vinculados: camada HTML posicionada com as coordenadas da cena (acompanha zoom e
  rolagem) mostrando status da demanda / "concluído" do passo; atualiza ao abrir o quadro e a cada 60 s.
- **Criar demandas da seleção**: uma demanda por card selecionado, cada uma vinculada ao seu card.

## 9. Modelos, apresentação e colar tópicos (etapa 5)

- Modelos (`fluxoModelos.ts`, puro): funil de vendas (5 etapas: atrair, captar, nutrir, converter, reter), jornada do
  cliente, fluxograma (início/decisão/fim), SWOT, matriz de prioridade (impacto × esforço), mapa mental inicial.
- Apresentação: molduras em ordem (pelo nome, depois posição), tela cheia, setas/Espaço avançam, Esc sai; usa
  `scrollToContent(moldura, { fitToViewport, animate })` com o quadro em modo leitura.
- Colar tópicos: texto com recuo (espaços, tab, "-", "*", "1.") vira mapa mental (`fluxoTopicos.ts`, puro).

## 10. Testes e verificação

- Unitários das libs puras (geometria das formas, layout do mapa mental, recolher/expandir, páginas da exportação,
  modelos, tópicos, links internos).
- `npx tsc --noEmit`, `npm test`, `npx vite build`.
- Navegador (servidor local + banco real, quadro "TESTE CLAUDE" apagado no fim): criar quadro, inserir cada forma,
  redimensionar, setas presas, caneta, colar imagem, recarregar e ver tudo salvo; celular 390 px; cada exportação
  aberta e conferida (PDF com pdf.js em zoom alto, PPT/DOCX com leitores independentes).

## 11. Fora do escopo

Edição em tempo real por várias pessoas; comentários; minimapa; negrito em parte do texto de um card (limite do
Excalidraw); inteligência artificial para gerar diagramas.
