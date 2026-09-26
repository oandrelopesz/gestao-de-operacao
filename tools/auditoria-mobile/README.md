# Auditoria mobile e regressão de desktop

Ferramentas fora do app (não entram no build do Lovable). Instalar uma vez: `npm install` nesta pasta
(e `npx playwright-core install webkit` para o motor do Safari).

- Celular: `node auditar.mjs http://localhost:5188 saida-auditoria chromium` (ou `webkit`).
- Desktop base × nova: suba a versão base num worktree (`git worktree add ../gestao-base <commit>`,
  `mklink /J ..\gestao-base\node_modules node_modules`, `npx vite --port 5191` lá) e a nova aqui
  (`npx vite --port 5188`); depois `node comparar-desktop.mjs http://localhost:5191 http://localhost:5188`.
  Critério: 0 px de diferença em todas as telas (ou diferença explicada por dado vivo, conferida no PNG).
- Ícones do app: `node gerar-icones.mjs` (grava em `public/icons`).
