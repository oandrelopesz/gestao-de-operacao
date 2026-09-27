# Auditoria mobile e regressão de desktop

Ferramentas fora do app (não entram no build do Lovable). Instalar uma vez: `npm install` nesta pasta
(e `npx playwright-core install webkit` para o motor do Safari).

- Celular: `node auditar.mjs http://localhost:5188 saida-auditoria chromium` (ou `webkit`).
- Desktop base × nova: suba a versão base num worktree (`git worktree add ../gestao-base <commit>`,
  `mklink /J ..\gestao-base\node_modules node_modules`, `npx vite --port 5191` lá) e a nova aqui
  (`npx vite --port 5188`); depois `node comparar-desktop.mjs http://localhost:5191 http://localhost:5188`.
  Critério: 0 px de diferença em todas as telas (ou diferença explicada por dado vivo, conferida no PNG).
- Ícones do app: `node gerar-icones.mjs` (grava em `public/icons`).
- Fluxogramas (editor): `node testar-fluxogramas.mjs http://localhost:5190 <id de um quadro de TESTE> saida` — apaga o conteúdo
  desse quadro; imprime o resultado de cada interação e grava capturas na pasta.
- Exportação dos Fluxogramas: `node testar-exportacao.mjs http://localhost:5190 <id de um quadro de TESTE> saida` — monta um
  quadro (funil, cards, cone, imagem WebP, 2 molduras), exporta PDF/PNG/SVG/PPTX/DOCX pela janela e confere cada arquivo
  (pdf.js: páginas, texto vetorial, fonte Nunito; zip: slides e imagens). Apaga o conteúdo do quadro informado.
- Mapa mental: `node testar-mapa-mental.mjs http://localhost:5190 saida` — cria o quadro "TESTE CLAUDE — mapa" (modelo Mapa
  mental), testa Enter/Tab digitando, recolher/expandir, apagar e desfazer, arrastar de lado, recarregar; apaga o quadro no fim.
- Ligações por bolinha: `node testar-ligacoes.mjs http://localhost:5190 saida` — mede se cada ponta fica na bolinha (distância
  0) e se a curva desenhada corta alguma forma; ímã da bolinha, melhor lado ao soltar no meio da forma, clicar sem arrastar
  (nada), mover a origem (seta acompanha), seta desenhada com a ferramenta, alças das pontas (Esc, soltar, religar, desfazer),
  cotovelo e funil. Cria e apaga o próprio quadro.
