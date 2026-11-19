# Front novo (duas aparências) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o design system do sistema inteiro pelas duas aparências aprovadas (Painel e vidro e Editorial), cada uma em claro e escuro, com troca a qualquer momento, sem mudar nenhuma função, botão ou layout de hoje.

**Architecture:** O app já pinta tudo por tokens (variáveis CSS shadcn em `src/styles.css`, `:root` e `.dark`). A aparência entra como um segundo eixo: atributo `data-aparencia="painel|editorial"` no `<html>`, ao lado da classe `.dark` que já existe. Cada combinação redefine os mesmos tokens (cor, raio, fonte, sombra), então toda tela se repinta de uma vez. O que o token não alcança (menu, cabeçalho, quadro, cartões, camadas) ganha variação por aparência em componentes próprios, tela a tela.

**Tech Stack:** React, TanStack Router, Tailwind v4 (`@theme inline`), shadcn/Radix, Supabase. Fontes Geologica (Painel) e Schibsted Grotesk (Editorial), via Google Fonts como as atuais.

**Spec:** `docs/design/lab2/` (mockups aprovados, rodar `node docs/design/lab2/servir.mjs`, http://localhost:5302/), decisão `_decisions/2026-11-19-front-duas-aparencias.md` no cofre, pesquisa `docs/design/pesquisa-visual-2026-11-18.md`.

## Global Constraints

- Só visual. Toda função, botão, atalho e posição de hoje permanece (Demandas: Sábado/Domingo, Standby, seleção em massa, Agendadas, menus, N, Esc).
- As duas aparências × claro/escuro = 4 combinações; cada tela é conferida nas 4.
- Tema (`localStorage.theme`, classe `.dark`) segue independente da aparência; aparência fica em `localStorage.aparencia` (padrão `painel`).
- Script de init no `<head>` aplica tema e aparência antes do React (sem flash).
- Texto mínimo 11px; sem borda lateral colorida; sem texto em gradiente; sem brilho decorativo; um movimento autoral; ícones Lucide.
- `prefers-reduced-motion`: sem animações de voo, confete, transições de tema.
- Paleta azul/grafite (oklch) é mantida nos dois modos.
- Nada de segredos no cofre. Registrar cada entrega no cofre (historico, current-state, módulo).
- Commit/push só quando o André pedir. Backlog em GitHub Issues.

## Faseamento

Cada fase termina com o sistema funcionando e publicável. A fase seguinte só começa com o OK do André.

1. **Fase 1, fundação:** tokens das 2 aparências × 2 temas, fontes, hook e script, botão Aparência/Tema. Resultado: o sistema inteiro já muda de cara ao trocar.
2. **Fase 2, casca:** menu (doca do Painel / seções do Editorial), cabeçalho, camadas globais (diálogos, gavetas, Ctrl+K, toasts).
3. **Fase 3, Demandas:** quadro, cartões, barra de seleção, gaveta, Agendadas, formulário, com as animações do mockup.
4. **Fase 4, demais abas em ondas:** (a) Início/Dashboard, Agenda; (b) Clientes, Onboarding, Roadmap, Saldo, NPS; (c) Dados internos, Central, Acessos, Fireflies, Taxas; (d) Marketing e canais; (e) CRM e Financeiro; (f) Meu cérebro.
5. **Fase 5, estrutura nova:** cabeçalho padrão, painel "hoje" no início, ficha do cliente, menu reagrupado (Hoje, Clientes, Marketing e canais, Comercial e dinheiro, Meu cérebro, Sistema).

Este arquivo detalha a Fase 1 por inteiro. As Fases 2 a 5 recebem plano próprio quando chegarem (cada uma depende do que a anterior revelar).

## File Structure (Fase 1)

- Modify `src/styles.css`: adicionar blocos `html[data-aparencia="painel"]`, `html[data-aparencia="editorial"]` (e suas versões `.dark`) que sobrescrevem os tokens. Os valores atuais viram a aparência "painel" provisória até o ajuste fino.
- Create `src/lib/aparencia.ts`: tipo, chave, `APARENCIA_INIT_SCRIPT`, `applyAparencia`, hook `useAparencia`.
- Modify `src/lib/theme.ts`: script de init passa a aplicar também a aparência (um só script no `<head>`).
- Modify `src/routes/__root.tsx`: fontes Geologica e Schibsted Grotesk no link do Google Fonts; usar o script único.
- Create `src/components/SeletorAparencia.tsx`: botão com menu (Painel e vidro, Editorial) + botão de tema, com nome visível no Editorial.
- Modify `src/routes/_authenticated.tsx`: montar o seletor no cabeçalho no lugar do botão de tema solto.

## Tasks (Fase 1)

### Task 1: Base de aparência (hook, script, atributo)

**Files:**
- Create: `src/lib/aparencia.ts`
- Modify: `src/lib/theme.ts:8`

**Interfaces:**
- Produces: `type Aparencia = "painel" | "editorial"`; `useAparencia(): { aparencia, setAparencia }`; `APARENCIA_INIT_SCRIPT: string`.

- [ ] **Step 1: Criar `src/lib/aparencia.ts`**

```ts
import { useCallback, useEffect, useState } from "react";

export type Aparencia = "painel" | "editorial";

const CHAVE = "aparencia";
const PADRAO: Aparencia = "painel";

const valida = (v: unknown): v is Aparencia => v === "painel" || v === "editorial";

// Roda antes do React (junto do script do tema): sem flash na troca de aparência
export const APARENCIA_INIT_SCRIPT = `(function(){try{var a=localStorage.getItem("${CHAVE}");if(a!=="painel"&&a!=="editorial"){a="${PADRAO}"}document.documentElement.setAttribute("data-aparencia",a)}catch(e){document.documentElement.setAttribute("data-aparencia","${PADRAO}")}})();`;

export function applyAparencia(a: Aparencia) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-aparencia", a);
}

function lerInicial(): Aparencia {
  if (typeof window === "undefined") return PADRAO;
  try {
    const v = window.localStorage.getItem(CHAVE);
    return valida(v) ? v : PADRAO;
  } catch {
    return PADRAO;
  }
}

export function useAparencia() {
  const [aparencia, setEstado] = useState<Aparencia>(PADRAO);

  useEffect(() => {
    const inicial = lerInicial();
    setEstado(inicial);
    applyAparencia(inicial);
  }, []);

  const setAparencia = useCallback((proxima: Aparencia) => {
    setEstado(proxima);
    applyAparencia(proxima);
    try {
      window.localStorage.setItem(CHAVE, proxima);
    } catch {
      // sem armazenamento: vale só para a sessão
    }
  }, []);

  return { aparencia, setAparencia };
}
```

- [ ] **Step 2: Unir os scripts de init em `src/lib/theme.ts`**

Trocar a linha 8 por (importando `APARENCIA_INIT_SCRIPT`):

```ts
import { APARENCIA_INIT_SCRIPT } from "@/lib/aparencia";
// ...
export const THEME_INIT_SCRIPT =
  `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}if(t==="dark"){document.documentElement.classList.add("dark")}}catch(e){}})();` +
  APARENCIA_INIT_SCRIPT;
```

(o `import` vai no topo do arquivo, junto do de `react`).

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Verificar no navegador**

Run: `npm run dev`, abrir a página e no console `document.documentElement.dataset.aparencia`.
Expected: `"painel"`; após `localStorage.aparencia="editorial"` e recarregar: `"editorial"`.

### Task 2: Fontes das duas aparências

**Files:**
- Modify: `src/routes/__root.tsx:86`

- [ ] **Step 1: Acrescentar as famílias ao link do Google Fonts**

Na `href` da linha 86, somar `&family=Geologica:wght@200;300;400;500;600&family=Schibsted+Grotesk:wght@400;500;600;700;900` antes de `&display=swap`.

- [ ] **Step 2: Conferir carregamento**

Run: abrir a página, aba Network, filtrar `fonts.googleapis`.
Expected: uma requisição 200 contendo Geologica e Schibsted Grotesk.

### Task 3: Tokens das duas aparências (4 combinações)

**Files:**
- Modify: `src/styles.css` (acrescentar após o bloco `.dark`, antes de `@layer base`)

**Interfaces:**
- Consumes: os nomes de token já existentes (`--background`, `--card`, `--primary`, `--radius`, `--font-sans`, `--font-display`, `--border`, `--muted`, `--sidebar*`, ...).
- Produces: `--aparencia-*` auxiliares para os componentes das Fases 2 e 3: `--vidro`, `--vidro-linha`, `--vidro-filtro`, `--regua` (espessura do fio), `--regua-cor`.

- [ ] **Step 1: Escrever os blocos**

Valores partem dos mockups (`docs/design/lab2/painel.html` linhas 16 a 49 e `editorial.html`), convertidos para os nomes shadcn:

```css
/* Aparência "Painel e vidro": camadas de vidro, raios grandes, Geologica fina */
html[data-aparencia="painel"] {
  --font-sans: "Geologica", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Geologica", ui-sans-serif, system-ui, sans-serif;
  --radius: 1rem;
  --vidro: rgb(255 255 255 / 0.46);
  --vidro-linha: rgb(255 255 255 / 0.75);
  --vidro-filtro: blur(28px) saturate(1.5);
  --regua: 1px;
  --regua-cor: var(--border);
}
html[data-aparencia="painel"].dark {
  --background: oklch(0.1 0.015 255);
  --vidro: rgb(20 27 40 / 0.5);
  --vidro-linha: rgb(255 255 255 / 0.09);
}

/* Aparência "Editorial": revista suíça, fios grossos, quase sem raio, Schibsted Grotesk */
html[data-aparencia="editorial"] {
  --font-sans: "Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif;
  --radius: 0.125rem;
  --vidro: var(--card);
  --vidro-linha: var(--border);
  --vidro-filtro: none;
  --regua: 3px;
  --regua-cor: var(--foreground);
}
```

(Ajuste fino de cor por aparência acontece na Fase 2, com a tela aberta nas 4 combinações.)

- [ ] **Step 2: Conferir as 4 combinações**

Run: abrir o app e alternar `data-aparencia` e a classe `dark` no console.
Expected: fonte e raio mudam nas duas aparências, nenhum texto fica ilegível, nenhum erro no console.

### Task 4: Seletor de Aparência e Tema no cabeçalho

**Files:**
- Create: `src/components/SeletorAparencia.tsx`
- Modify: `src/routes/_authenticated.tsx:325-333`

**Interfaces:**
- Consumes: `useAparencia()` (Task 1), `useTheme()` de `src/lib/theme.ts`.

- [ ] **Step 1: Criar o componente**

Menu (Radix `DropdownMenu` já existe em `src/components/ui`) com os itens "Painel e vidro" e "Editorial" (o ativo marcado) e um item que alterna claro/escuro. Botão com ícone `Palette`, rótulo "Aparência" visível a partir de `sm`.

- [ ] **Step 2: Trocar o botão de tema solto do cabeçalho pelo seletor**

Em `_authenticated.tsx`, substituir o `Button` de `toggleTheme` (linhas 325 a 333) por `<SeletorAparencia />`, mantendo o `NotificationBell`.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` e abrir o app.
Expected: o menu troca a aparência na hora, o tema continua independente, a escolha persiste ao recarregar.

- [ ] **Step 4: Commit (só quando o André pedir)**

```bash
git add src/lib/aparencia.ts src/lib/theme.ts src/routes/__root.tsx src/styles.css src/components/SeletorAparencia.tsx src/routes/_authenticated.tsx
git commit -m "feat(front): base das duas aparencias (tokens, fontes, seletor)"
```

## Self-Review

- Cobertura: fundação das duas aparências × dois temas, troca e persistência, fontes. Menu, cabeçalho, camadas e telas ficam nas Fases 2 a 5 (declarado acima).
- Placeholders: nenhum na Fase 1. Ajuste fino de cor é uma etapa explícita da Fase 2.
- Tipos: `Aparencia`, `useAparencia`, `APARENCIA_INIT_SCRIPT` usados com os mesmos nomes nas tasks 1, 2 e 4.
