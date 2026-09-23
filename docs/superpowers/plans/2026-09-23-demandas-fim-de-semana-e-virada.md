# Demandas: coluna "Fazer no fim de semana" + virada automática à meia-noite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Nova coluna "Fazer no fim de semana" no Kanban de Demandas, com os cards separados em Sábado e Domingo; (2) toda meia-noite (horário de Brasília) os cards de "Fazer amanhã" descem para "Fazer hoje" e os de "Fazer depois de amanhã" para "Fazer amanhã", sem bagunçar a ordem.

**Architecture:**
- **Dia do fim de semana:**
  - Fica em `demandas.dia_fim_de_semana` ('sabado' | 'domingo' | null). Um trigger no banco garante a regra: fora da coluna o dia vira null; dentro dela, sem dia, vira 'sabado'.
  - No front, a coluna vira **dois containers de DnD** ("fazer_fim_de_semana:sabado" e "fazer_fim_de_semana:domingo"). O hook `useKanbanDnd` já existente reordena dentro de cada dia sem mudança nenhuma.
  - Toda a tradução status ↔ container fica num módulo puro testado (`src/lib/fimDeSemana.ts`).
  - Quando um card entra na coluna vindo de fora, o drop **não é salvo na hora**: abre um popup "Sábado ou Domingo?". Escolher salva; cancelar devolve o quadro ao estado de antes do arrasto.
- **Virada:**
  - Uma função SQL `virar_dia_demandas()`, agendada no pg_cron às 03:00 UTC (= 00:00 de Brasília, sem horário de verão desde 2019).
  - Tem trava de idempotência (tabela `demandas_viradas`, um registro por dia).
  - Os cards de "amanhã" entram **abaixo** dos que já estão em "hoje", mantendo a ordem relativa.
  - A página recarrega as demandas logo depois da meia-noite e sempre que a aba volta a ficar visível.

**Tech Stack:** TanStack Start + React 19, dnd-kit, shadcn/Radix (Dialog, DropdownMenu), sonner, Supabase (Lovable Cloud) com pg_cron, node --test.

**Spec:** Pedidos do usuário nesta conversa (23/09/2026):
- **Coluna de fim de semana:** fica depois de "Fazer depois de amanhã" e antes de "Standby". Ao mover um card para ela, abre um popup Sábado/Domingo. Sábado aparece primeiro, depois Domingo. O dia fica visível no card. Dá para reordenar dentro de cada dia. O menu de 3 pontinhos troca o dia. Mover o card para outra coluna tira o dia.
- **Virada:** à meia-noite, amanhã → hoje e depois de amanhã → amanhã. Os cards que chegam em hoje ficam abaixo dos que já estavam lá, sem alterar a ordem. A coluna de fim de semana fica sem virada automática.

## Global Constraints

- Id da coluna: `fazer_fim_de_semana`; título: `Fazer no fim de semana`; `sistema = true` (não pode ser excluída, a lógica depende dela).
- Valores do dia: exatamente `'sabado'` e `'domingo'`. Rótulos na tela: `Sábado` e `Domingo`.
- Separador de container: `fazer_fim_de_semana:sabado` / `fazer_fim_de_semana:domingo`.
- Horário da virada: cron `0 3 * * *` (UTC). O dia de referência é `(now() AT TIME ZONE 'America/Sao_Paulo')::date`.
- A virada move só `fazer_amanha` → `fazer_hoje` e `fazer_depois_amanha` → `fazer_amanha`. Nunca mexe em `fazer_fim_de_semana`, `standby`, `recorrentes` nem `feito`.
- Todo texto de UI em português.
- Migrations são aplicadas **à mão** no SQL editor do Lovable pelo Chrome (não há CLI). Veja a memória `supabase-migrations-manual`: CodeMirror em `.cm-content.cmTile`, depois "Run" e "Run anyway". Cuidado com `$$` ao usar `String.replace` para injetar o SQL: use função substituta `() => sql`.
- Arquivos do repo misturam CRLF e LF: edite preservando o final de linha que o arquivo já usa.
- Testes de lógica pura: `npm test` (`node --test src/lib/*.test.ts`). Módulos testados **não** podem importar com o alias `@/`.
- Checagem de tipos: `npx tsc --noEmit`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260923170000_demandas_fim_de_semana.sql` (novo) | Coluna nova em `demanda_colunas`, campo `dia_fim_de_semana` e trigger de consistência |
| `supabase/migrations/20260923180000_demandas_virada_diaria.sql` (novo) | Tabela `demandas_viradas`, função `virar_dia_demandas()` e agendamento no cron |
| `supabase/functions/daily-rotation.sql` (remover) | Rascunho antigo, nunca aplicado, substituído pela migration acima |
| `src/lib/fimDeSemana.ts` + `.test.ts` (novos) | Tradução status ↔ container, mover card de dia, campos a salvar |
| `src/lib/viradaDia.ts` + `.test.ts` (novos) | `msAteProximaVirada(agora)`: quando recarregar a página após a meia-noite |
| `src/lib/demandaColunas.ts` | `DEFAULT_COLUMNS` com a coluna nova |
| `src/integrations/supabase/types.ts` | `dia_fim_de_semana` em `demandas` |
| `src/components/KanbanCard.tsx` | Selo do dia + itens "Fazer no sábado/domingo" no menu de 3 pontinhos |
| `src/components/KanbanColumn.tsx` | Prop opcional `secoes` (coluna dividida em Sábado/Domingo) |
| `src/components/EscolherDiaDialog.tsx` (novo) | Popup Sábado/Domingo |
| `src/routes/_authenticated/index.tsx` | Liga tudo: containers, popup, troca de dia, salvar, recarga pós-virada |

---

### Task 1: Banco — coluna, campo do dia e trigger

**Files:**
- Create: `supabase/migrations/20260923170000_demandas_fim_de_semana.sql`
- Modify: `src/integrations/supabase/types.ts` (bloco `demandas`, perto da linha 386: Row, Insert, Update)
- Modify: `src/lib/demandaColunas.ts:13-20` (`DEFAULT_COLUMNS`)

**Interfaces:**
- Produces: `demandas.dia_fim_de_semana text null` com CHECK ('sabado','domingo'); linha `fazer_fim_de_semana` em `demanda_colunas`; trigger `demandas_ajusta_dia_fds`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Coluna "Fazer no fim de semana" (entre "Fazer depois de amanhã" e "Standby") e o dia escolhido
-- (sábado/domingo) de cada card nela. O trigger mantém a regra no banco: fora da coluna não há dia.

ALTER TABLE public.demandas
  ADD COLUMN IF NOT EXISTS dia_fim_de_semana TEXT
  CHECK (dia_fim_de_semana IN ('sabado', 'domingo'));

-- Abre espaço logo depois de "Fazer depois de amanhã" (só na primeira execução)
UPDATE public.demanda_colunas
SET ordem = ordem + 1
WHERE ordem > (SELECT ordem FROM public.demanda_colunas WHERE id = 'fazer_depois_amanha')
  AND NOT EXISTS (SELECT 1 FROM public.demanda_colunas WHERE id = 'fazer_fim_de_semana');

INSERT INTO public.demanda_colunas (id, titulo, hex, ordem, sistema)
SELECT 'fazer_fim_de_semana', 'Fazer no fim de semana', '#8b5cf6', ordem + 1, true
FROM public.demanda_colunas WHERE id = 'fazer_depois_amanha'
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.demandas_ajusta_dia_fds()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'fazer_fim_de_semana' THEN
    NEW.dia_fim_de_semana := COALESCE(NEW.dia_fim_de_semana, 'sabado');
  ELSE
    NEW.dia_fim_de_semana := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS demandas_ajusta_dia_fds ON public.demandas;
CREATE TRIGGER demandas_ajusta_dia_fds
  BEFORE INSERT OR UPDATE OF status, dia_fim_de_semana ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.demandas_ajusta_dia_fds();
```

- [ ] **Step 2: Conferir que não há CHECK antigo em `status`**

No SQL editor do Lovable, rode:
`SELECT conname FROM pg_constraint WHERE conrelid = 'public.demandas'::regclass AND contype = 'c';`

Esperado: nenhuma constraint `demandas_status_check`. Ela foi removida quando as colunas passaram a ser configuráveis. Se ela aparecer, adicione no topo da migration `ALTER TABLE public.demandas DROP CONSTRAINT IF EXISTS demandas_status_check;` e mencione isso no relatório.

- [ ] **Step 3: Aplicar a migration no Lovable e verificar**

Cole o arquivo inteiro no SQL editor e rode. Depois verifique:
`SELECT id, ordem FROM public.demanda_colunas ORDER BY ordem;`

Esperado: `fazer_fim_de_semana` logo após `fazer_depois_amanha`, com `standby` e as seguintes deslocadas uma posição.

Teste o trigger dentro de uma transação desfeita:
```sql
BEGIN;
UPDATE public.demandas SET status = 'fazer_fim_de_semana' WHERE id = (SELECT id FROM public.demandas WHERE status = 'standby' LIMIT 1) RETURNING status, dia_fim_de_semana;
ROLLBACK;
```
Esperado: `dia_fim_de_semana = 'sabado'`.

- [ ] **Step 4: Tipos e colunas padrão**

Em `types.ts`, no bloco `demandas`:
- `Row`: `dia_fim_de_semana: string | null`
- `Insert` e `Update`: `dia_fim_de_semana?: string | null`

Mantenha a ordem alfabética: logo após `descricao`.

Em `DEFAULT_COLUMNS`, entre `fazer_depois_amanha` e `standby`:
```ts
  { id: "fazer_fim_de_semana", title: "Fazer no fim de semana", color: "violet-500", hex: "#8b5cf6", sistema: true },
```

- [ ] **Step 5: Tipos e commit**

Run: `npx tsc --noEmit` → sem erros novos.
```bash
git add supabase/migrations/20260923170000_demandas_fim_de_semana.sql src/integrations/supabase/types.ts src/lib/demandaColunas.ts
git commit -m "Demandas: coluna Fazer no fim de semana e dia (sábado/domingo) no banco"
```

---

### Task 2: Módulo puro `fimDeSemana.ts`

**Files:**
- Create: `src/lib/fimDeSemana.ts`
- Test: `src/lib/fimDeSemana.test.ts`

**Interfaces:**
- Produces (usado nas Tasks 3 e 4):
  - `COLUNA_FDS = "fazer_fim_de_semana"`
  - `type DiaFds = "sabado" | "domingo"`
  - `DIAS_FDS: DiaFds[]` (sábado primeiro)
  - `ROTULO_DIA: Record<DiaFds, string>`
  - `secaoFds(dia: DiaFds): string`
  - `ehSecaoFds(container: string): boolean`
  - `diaDaSecao(container: string): DiaFds`
  - `containerIdsDoQuadro(colunas: string[]): string[]`
  - `containerDe(d: ItemFds): string`
  - `aplicarContainer<T extends ItemFds>(d: T, container: string): T`
  - `moverParaDia<T extends ItemFds>(lista: T[], id: string, dia: DiaFds): T[]`
  - `camposParaSalvar(d: ItemFds): { status: string; ordem: number; dia_fim_de_semana: DiaFds | null }`
  - `ItemFds = { id: string; status: string; ordem?: number | null; dia_fim_de_semana?: string | null }`

- [ ] **Step 1: Escrever os testes**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  COLUNA_FDS, secaoFds, ehSecaoFds, diaDaSecao, containerIdsDoQuadro, containerDe,
  aplicarContainer, moverParaDia, camposParaSalvar,
} from "./fimDeSemana.ts";

test("containerIdsDoQuadro: a coluna do fim de semana vira sábado e domingo, no lugar dela", () => {
  assert.deepEqual(
    containerIdsDoQuadro(["fazer_hoje", "fazer_depois_amanha", COLUNA_FDS, "standby"]),
    ["fazer_hoje", "fazer_depois_amanha", "fazer_fim_de_semana:sabado", "fazer_fim_de_semana:domingo", "standby"],
  );
});

test("containerDe: card do fim de semana vai para a seção do dia; sem dia conta como sábado", () => {
  assert.equal(containerDe({ id: "a", status: COLUNA_FDS, dia_fim_de_semana: "domingo" }), "fazer_fim_de_semana:domingo");
  assert.equal(containerDe({ id: "a", status: COLUNA_FDS, dia_fim_de_semana: null }), "fazer_fim_de_semana:sabado");
  assert.equal(containerDe({ id: "a", status: "standby", dia_fim_de_semana: "domingo" }), "standby");
});

test("aplicarContainer: entrar numa seção grava status e dia; sair para outra coluna apaga o dia", () => {
  const d = { id: "a", status: "fazer_hoje", dia_fim_de_semana: null as string | null, titulo: "x" };
  const dentro = aplicarContainer(d, secaoFds("domingo"));
  assert.deepEqual(dentro, { id: "a", status: COLUNA_FDS, dia_fim_de_semana: "domingo", titulo: "x" });
  assert.deepEqual(aplicarContainer(dentro, "standby"), { id: "a", status: "standby", dia_fim_de_semana: null, titulo: "x" });
});

test("ehSecaoFds / diaDaSecao", () => {
  assert.equal(ehSecaoFds("fazer_fim_de_semana:sabado"), true);
  assert.equal(ehSecaoFds("fazer_hoje"), false);
  assert.equal(diaDaSecao("fazer_fim_de_semana:domingo"), "domingo");
  assert.equal(diaDaSecao("qualquer"), "sabado");
});

const fds = (id: string, dia: string, ordem: number) => ({ id, status: COLUNA_FDS, dia_fim_de_semana: dia, ordem });

test("moverParaDia: vai para o fim do outro dia e renumera as duas seções", () => {
  const lista = [fds("s1", "sabado", 0), fds("s2", "sabado", 1), fds("s3", "sabado", 2), fds("d1", "domingo", 0)];
  const r = moverParaDia(lista, "s2", "domingo");
  const por = Object.fromEntries(r.map((d) => [d.id, `${d.dia_fim_de_semana}:${d.ordem}`]));
  assert.deepEqual(por, { s1: "sabado:0", s3: "sabado:1", d1: "domingo:0", s2: "domingo:1" });
});

test("moverParaDia: já no dia pedido, a lista não muda (mantém a posição do drop)", () => {
  const lista = [fds("s1", "sabado", 0), fds("s2", "sabado", 1)];
  assert.equal(moverParaDia(lista, "s2", "sabado"), lista);
});

test("moverParaDia: card vindo de outra coluna (drop pendente) entra no fim do dia escolhido", () => {
  const lista = [fds("d1", "domingo", 0), { id: "x", status: COLUNA_FDS, dia_fim_de_semana: "sabado", ordem: 0 }];
  const r = moverParaDia(lista, "x", "domingo");
  assert.deepEqual(r.find((d) => d.id === "x"), { id: "x", status: COLUNA_FDS, dia_fim_de_semana: "domingo", ordem: 1 });
});

test("camposParaSalvar: só status, ordem e dia (null fora da coluna)", () => {
  assert.deepEqual(camposParaSalvar({ id: "a", status: "standby", ordem: 3, dia_fim_de_semana: "sabado" }), { status: "standby", ordem: 3, dia_fim_de_semana: null });
  assert.deepEqual(camposParaSalvar({ id: "a", status: COLUNA_FDS, ordem: null, dia_fim_de_semana: "domingo" }), { status: COLUNA_FDS, ordem: 0, dia_fim_de_semana: "domingo" });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`. Esperado: FAIL em `fimDeSemana.test.ts` (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// Coluna "Fazer no fim de semana": no quadro ela vira duas seções de drag-and-drop (Sábado e
// Domingo). Aqui fica a tradução entre o que o banco guarda (status + dia_fim_de_semana) e o
// container do dnd-kit. Fora da coluna o card não tem dia.
export const COLUNA_FDS = "fazer_fim_de_semana";
export type DiaFds = "sabado" | "domingo";
export const DIAS_FDS: DiaFds[] = ["sabado", "domingo"];
export const ROTULO_DIA: Record<DiaFds, string> = { sabado: "Sábado", domingo: "Domingo" };

export interface ItemFds {
  id: string;
  status: string;
  ordem?: number | null;
  dia_fim_de_semana?: string | null;
}

const PREFIXO = `${COLUNA_FDS}:`;

export const secaoFds = (dia: DiaFds) => `${PREFIXO}${dia}`;
export const ehSecaoFds = (container: string) => container.startsWith(PREFIXO);
export const diaDaSecao = (container: string): DiaFds => (container === secaoFds("domingo") ? "domingo" : "sabado");

const diaDe = (d: ItemFds): DiaFds => (d.dia_fim_de_semana === "domingo" ? "domingo" : "sabado");

export function containerIdsDoQuadro(colunas: string[]): string[] {
  return colunas.flatMap((c) => (c === COLUNA_FDS ? DIAS_FDS.map(secaoFds) : [c]));
}

export function containerDe(d: ItemFds): string {
  return d.status === COLUNA_FDS ? secaoFds(diaDe(d)) : d.status;
}

export function aplicarContainer<T extends ItemFds>(d: T, container: string): T {
  if (ehSecaoFds(container)) return { ...d, status: COLUNA_FDS, dia_fim_de_semana: diaDaSecao(container) };
  return { ...d, status: container, dia_fim_de_semana: null };
}

const porOrdem = (a: ItemFds, b: ItemFds) => (a.ordem ?? 0) - (b.ordem ?? 0);

/** Leva o card para o fim do `dia` e renumera as duas seções. Já estando nele, devolve a mesma lista. */
export function moverParaDia<T extends ItemFds>(lista: T[], id: string, dia: DiaFds): T[] {
  const card = lista.find((d) => d.id === id);
  if (!card || containerDe(card) === secaoFds(dia)) return lista;
  const origem = containerDe(card);
  const destino = secaoFds(dia);
  const ordem = new Map<string, number>();
  lista.filter((d) => d.id !== id && containerDe(d) === origem).sort(porOrdem).forEach((d, i) => ordem.set(d.id, i));
  const doDia = lista.filter((d) => d.id !== id && containerDe(d) === destino).sort(porOrdem);
  doDia.forEach((d, i) => ordem.set(d.id, i));
  ordem.set(id, doDia.length);
  return lista.map((d) => {
    const base = d.id === id ? aplicarContainer(d, destino) : d;
    return ordem.has(d.id) ? { ...base, ordem: ordem.get(d.id) } : base;
  });
}

export function camposParaSalvar(d: ItemFds) {
  return {
    status: d.status,
    ordem: d.ordem ?? 0,
    dia_fim_de_semana: d.status === COLUNA_FDS ? diaDe(d) : null,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test` → todos PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fimDeSemana.ts src/lib/fimDeSemana.test.ts
git commit -m "Demandas: lógica das seções Sábado/Domingo da coluna de fim de semana"
```

---

### Task 3: Card e coluna — selo do dia, menu e seções

**Files:**
- Modify: `src/components/KanbanCard.tsx` (interface `Demanda`, `KanbanCardProps`, `KanbanCardView`, menu perto das linhas 159-171, repasse em `KanbanCard`)
- Modify: `src/components/KanbanColumn.tsx`

**Interfaces:**
- Consumes: `COLUNA_FDS`, `DIAS_FDS`, `ROTULO_DIA`, `DiaFds` de `@/lib/fimDeSemana`.
- Produces:
  - `KanbanCard` / `KanbanCardView` aceitam `onSetDia?: (id: string, dia: DiaFds) => void`.
  - `KanbanColumn` aceita `onSetDia?` (repassado aos cards) e `secoes?: { id: string; titulo: string; demandas: Demanda[] }[]`.
  - Com `secoes`, a coluna desenha uma área de drop por seção (`useDroppable({ id: secao.id })` + `SortableContext` próprio). A área da coluna inteira fica desligada (`useDroppable({ id, disabled: true })`).

- [ ] **Step 1: Card**

1. Na interface `Demanda` de `KanbanCard.tsx` e de `KanbanColumn.tsx`, adicione `dia_fim_de_semana?: string | null;`.
2. Em `KanbanCardProps`, adicione `onSetDia?: (id: string, dia: DiaFds) => void;`. Receba o prop em `KanbanCardView` e repasse-o no wrapper `KanbanCard`, junto com os outros props.
3. No topo do card, junto dos badges existentes, mostre o dia quando `demanda.status === COLUNA_FDS`:
   ```tsx
   {demanda.status === COLUNA_FDS && (
     <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-300">
       <CalendarDays size={10} /> {ROTULO_DIA[demanda.dia_fim_de_semana === "domingo" ? "domingo" : "sabado"]}
     </span>
   )}
   ```
   Importe `CalendarDays` de `lucide-react`. Coloque o selo na mesma linha/área dos badges de prioridade/cliente já existentes; leia o JSX do card antes para achar o lugar.
4. No `DropdownMenuContent`, logo após "Detalhes":
   ```tsx
   {demanda.status === COLUNA_FDS && onSetDia && DIAS_FDS.map((dia) => (
     <DropdownMenuItem
       key={dia}
       disabled={(demanda.dia_fim_de_semana ?? "sabado") === dia}
       onClick={(e) => { e.stopPropagation(); onSetDia(demanda.id, dia); }}
       className="gap-2 py-1.5"
     >
       <CalendarDays size={12} /> Fazer no {ROTULO_DIA[dia].toLowerCase()}
     </DropdownMenuItem>
   ))}
   ```

- [ ] **Step 2: Coluna com seções**

Em `KanbanColumn.tsx`:
1. Adicione aos props: `onSetDia?: (id: string, dia: DiaFds) => void;` e `secoes?: { id: string; titulo: string; demandas: Demanda[] }[];`.
2. Adicione `fazer_fim_de_semana: "Nada pro fim de semana",` a `emptyMessages`.
3. Troque `useDroppable({ id })` por `useDroppable({ id, disabled: !!secoes })`.
4. Passe `onSetDia={onSetDia}` a cada `<KanbanCard>`.
5. Crie no mesmo arquivo:
   ```tsx
   /** Uma das seções (Sábado/Domingo) da coluna de fim de semana: área de drop e ordem próprias. */
   function SecaoColuna({ secao, renderCard }: { secao: { id: string; titulo: string; demandas: Demanda[] }; renderCard: (d: Demanda) => React.ReactNode }) {
     const { setNodeRef, isOver } = useDroppable({ id: secao.id });
     return (
       <div ref={setNodeRef} className={cn("rounded-lg mb-2 pb-1 transition-colors", isOver && "bg-accent/50")}>
         <div className="flex items-center justify-between px-1 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
           <span>{secao.titulo}</span>
           <span className="text-[10px] font-medium">{secao.demandas.length}</span>
         </div>
         <SortableContext id={secao.id} items={secao.demandas.map((d) => d.id)} strategy={verticalListSortingStrategy}>
           {secao.demandas.map(renderCard)}
           {secao.demandas.length === 0 && (
             <div className="h-14 flex items-center justify-center text-[12px] text-zinc-400 dark:text-zinc-600 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md">
               Arraste para cá
             </div>
           )}
         </SortableContext>
       </div>
     );
   }
   ```
6. Dentro da área rolável (a `div` com `ref={setNodeRef}`):
   - Com `secoes`, renderize `secoes.map((s) => <SecaoColuna key={s.id} secao={s} renderCard={renderCard} />)` no lugar do `SortableContext` e do botão "Mostrar mais". A coluna de fim de semana é curta, sem necessidade de lote.
   - Sem `secoes`, mantenha tudo como está.
   - Extraia `const renderCard = (demanda: Demanda) => <KanbanCard key={demanda.id} demanda={demanda} onEdit={onEdit} onDelete={onDelete} onComplete={onComplete} onMoveToDone={onMoveToDone} onSetDia={onSetDia} />;` e use-o nos dois caminhos.
7. O contador do cabeçalho segue sendo `demandas.length`: a página passa todos os cards da coluna em `demandas` e os mesmos cards divididos em `secoes`.
8. `isOver` da coluna (fundo destacado) só vale sem seções. Com seções, cada seção se destaca sozinha.

- [ ] **Step 3: Tipos e commit**

Run: `npx tsc --noEmit` → sem erros novos.
```bash
git add src/components/KanbanCard.tsx src/components/KanbanColumn.tsx
git commit -m "Kanban: seções Sábado/Domingo na coluna, selo do dia e troca pelo menu do card"
```

---

### Task 4: Página — popup ao entrar, troca de dia e salvar

**Files:**
- Create: `src/components/EscolherDiaDialog.tsx`
- Modify: `src/routes/_authenticated/index.tsx` (chamada `useKanbanDnd` ~447-475, render das colunas ~598-640, `handleSubmit` ~240-280)

**Interfaces:**
- Consumes: tudo da Task 2; `secoes`/`onSetDia` da Task 3.
- Produces: `EscolherDiaDialog({ aberto, sugerido, onEscolher, onCancelar })`.

- [ ] **Step 1: Popup**

```tsx
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DIAS_FDS, ROTULO_DIA, type DiaFds } from "@/lib/fimDeSemana";

/** Pergunta em que dia do fim de semana a demanda vai ser feita. Fechar = desistir do movimento. */
export function EscolherDiaDialog({ aberto, sugerido, onEscolher, onCancelar }: {
  aberto: boolean;
  sugerido: DiaFds;
  onEscolher: (dia: DiaFds) => void;
  onCancelar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onCancelar(); }}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Fazer no fim de semana</DialogTitle>
          <DialogDescription>Em que dia você vai fazer essa demanda?</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 pt-2">
          {DIAS_FDS.map((dia) => (
            <Button key={dia} variant={dia === sugerido ? "default" : "outline"} className="h-12 text-base" onClick={() => onEscolher(dia)} autoFocus={dia === sugerido}>
              {ROTULO_DIA[dia]}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Ligar o DnD às seções**

Em `index.tsx` importe de `@/lib/fimDeSemana`:
`COLUNA_FDS, DIAS_FDS, ROTULO_DIA, secaoFds, ehSecaoFds, diaDaSecao, containerIdsDoQuadro, containerDe, aplicarContainer, moverParaDia, camposParaSalvar, type DiaFds`.
Importe também `EscolherDiaDialog`.

Substitua a chamada do `useKanbanDnd` por:

```tsx
  // Estado do quadro antes do arrasto: se o popup de dia for cancelado, volta para ele
  const antesDoArrastoRef = useRef<any[]>([]);
  const [escolhaDia, setEscolhaDia] = useState<{ id: string; origem: string; sugerido: DiaFds } | null>(null);
  const containerIds = useMemo(() => containerIdsDoQuadro(columns.map((c) => c.id)), [columns]);

  /** Persiste status + ordem + dia dos cards que estão nos containers informados. */
  const salvarContainers = async (lista: any[], containers: string[]) => {
    const afetados = new Set(containers);
    try {
      const results = await Promise.all(
        lista
          .filter((d) => afetados.has(containerDe(d)))
          .map((d) => supabase.from("demandas").update(camposParaSalvar(d) as any).eq("id", d.id))
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    } catch {
      toast.error("Erro ao sincronizar movimento");
      fetchDemandas();
    }
  };

  // Drag-and-drop do Kanban (mover entre colunas e reordenar) - ver src/lib/useKanbanDnd.ts.
  // A coluna de fim de semana vira duas seções (Sábado/Domingo) - ver src/lib/fimDeSemana.ts
  const { collisionDetection, measuring, onDragStart, onDragOver, onDragEnd, onDragCancel } = useKanbanDnd<any>({
    items: demandas,
    setItems: setDemandas,
    containerIds,
    getContainer: containerDe,
    setContainer: aplicarContainer,
    // Cards recorrentes (mãe) ficam travados e nada entra na coluna deles via drag
    isItemLocked: (d) => d.status === "recorrentes",
    isContainerLocked: (id) => id === "recorrentes",
    onStart: (d) => {
      antesDoArrastoRef.current = demandas;
      setActiveDemanda(d);
    },
    onCancel: () => setActiveDemanda(null),
    onDrop: async (finalList, activeId, origin, target) => {
      setActiveDemanda(null);
      // Entrou no fim de semana vindo de outra coluna: pergunta o dia antes de salvar
      if (ehSecaoFds(target) && !ehSecaoFds(origin)) {
        setEscolhaDia({ id: activeId, origem: origin, sugerido: diaDaSecao(target) });
        return;
      }
      await salvarContainers(finalList, [origin, target]);
    },
  });

  const escolherDia = async (dia: DiaFds) => {
    if (!escolhaDia) return;
    const lista = moverParaDia(demandas, escolhaDia.id, dia);
    setDemandas(lista);
    setEscolhaDia(null);
    await salvarContainers(lista, [escolhaDia.origem, ...DIAS_FDS.map(secaoFds)]);
  };

  const cancelarEscolhaDia = () => {
    setDemandas(antesDoArrastoRef.current);
    setEscolhaDia(null);
  };

  const mudarDia = async (id: string, dia: DiaFds) => {
    const lista = moverParaDia(demandas, id, dia);
    if (lista === demandas) return;
    setDemandas(lista);
    await salvarContainers(lista, DIAS_FDS.map(secaoFds));
  };
```

Confira os imports de `useRef`, `useMemo` e `useState` do React no topo do arquivo.

- [ ] **Step 3: Seções no render e popup**

Dentro de `columns.map((col) => …)`, calcule os cards da coluna uma vez:

```tsx
{columns.map((col) => {
  const cards = filteredDemandas.filter((d) => d.status === col.id).sort(byOrdem);
  const secoes = col.id === COLUNA_FDS
    ? DIAS_FDS.map((dia) => ({ id: secaoFds(dia), titulo: ROTULO_DIA[dia], demandas: cards.filter((d) => containerDe(d) === secaoFds(dia)) }))
    : undefined;
  return (
    <KanbanColumn
      key={col.id}
      /* ...props existentes... */
      demandas={cards}
      secoes={secoes}
      onSetDia={mudarDia}
    />
  );
})}
```

Mantenha todos os props existentes; só troque `demandas=` e acrescente `secoes` e `onSetDia`.

Perto dos outros diálogos da página, renderize:
```tsx
<EscolherDiaDialog
  aberto={!!escolhaDia}
  sugerido={escolhaDia?.sugerido ?? "sabado"}
  onEscolher={escolherDia}
  onCancelar={cancelarEscolhaDia}
/>
```
Se `KanbanCardView` for usado no `DragOverlay` com props explícitos, nada muda: o selo aparece sozinho porque o card carrega o `dia_fim_de_semana`.

- [ ] **Step 4: Formulário e criação rápida**

- Formulário (`handleSubmit`, antes do update/insert): acrescente
  `sanitizedValues.dia_fim_de_semana = sanitizedValues.status === COLUNA_FDS ? (editingDemanda?.dia_fim_de_semana ?? "sabado") : null;`
  O trigger faria o mesmo, mas assim o estado local já sai certo.
- Criação rápida na coluna: nada a fazer. Entra sem dia, o trigger grava 'sabado' e `fetchDemandas()` traz o dia.

- [ ] **Step 5: Verificar e commit**

Run: `npx tsc --noEmit` e `npm test` → sem erros.
```bash
git add src/components/EscolherDiaDialog.tsx src/routes/_authenticated/index.tsx
git commit -m "Demandas: popup Sábado/Domingo ao mover para o fim de semana e troca de dia pelo card"
```

---

### Task 5: Virada automática à meia-noite

**Files:**
- Create: `supabase/migrations/20260923180000_demandas_virada_diaria.sql`
- Delete: `supabase/functions/daily-rotation.sql` (rascunho antigo em comentário, nunca aplicado)
- Create: `src/lib/viradaDia.ts`, `src/lib/viradaDia.test.ts`
- Modify: `src/routes/_authenticated/index.tsx` (efeito de recarga)

**Interfaces:**
- Produces:
  - `public.virar_dia_demandas() RETURNS integer`: quantos cards moveu; 0 se já rodou hoje.
  - `msAteProximaVirada(agora: Date): number`: ms até 00:01 local do dia seguinte.

- [ ] **Step 1: Migration**

```sql
-- Virada do dia do Kanban de Demandas (00:00 de Brasília):
--   Fazer amanhã → Fazer hoje, entrando ABAIXO do que já está em hoje, na mesma ordem;
--   Fazer depois de amanhã → Fazer amanhã, na mesma ordem.
-- Fim de semana, Standby, Recorrentes e Feito não mudam. A tabela demandas_viradas impede
-- que a virada rode duas vezes no mesmo dia (cron repetido ou execução manual).

CREATE TABLE IF NOT EXISTS public.demandas_viradas (
  dia DATE PRIMARY KEY,
  movidas INTEGER NOT NULL DEFAULT 0,
  executada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Sem policies: só a função (SECURITY DEFINER) escreve aqui
ALTER TABLE public.demandas_viradas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.virar_dia_demandas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  base INTEGER;
  n INTEGER;
  total INTEGER := 0;
BEGIN
  INSERT INTO demandas_viradas (dia) VALUES (hoje) ON CONFLICT (dia) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(MAX(ordem), -1) + 1 INTO base FROM demandas WHERE status = 'fazer_hoje';

  WITH fila AS (
    SELECT id, row_number() OVER (ORDER BY ordem, created_at, id) - 1 AS pos
    FROM demandas WHERE status = 'fazer_amanha'
  )
  UPDATE demandas d SET status = 'fazer_hoje', ordem = base + fila.pos
  FROM fila WHERE d.id = fila.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;

  -- "Fazer amanhã" acabou de esvaziar: a fila de depois de amanhã entra a partir do 0
  WITH fila AS (
    SELECT id, row_number() OVER (ORDER BY ordem, created_at, id) - 1 AS pos
    FROM demandas WHERE status = 'fazer_depois_amanha'
  )
  UPDATE demandas d SET status = 'fazer_amanha', ordem = fila.pos
  FROM fila WHERE d.id = fila.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;

  UPDATE demandas_viradas SET movidas = total WHERE dia = hoje;
  RETURN total;
END $$;

REVOKE EXECUTE ON FUNCTION public.virar_dia_demandas() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('virar-dia-demandas')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'virar-dia-demandas');

SELECT cron.schedule('virar-dia-demandas', '0 3 * * *', $$SELECT public.virar_dia_demandas()$$);
```


- [ ] **Step 2: Aplicar e testar sem efeito real**

Aplique a migration no SQL editor do Lovable. Depois rode o teste dentro de uma transação desfeita:

```sql
BEGIN;
DELETE FROM public.demandas_viradas WHERE dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date;
SELECT status, string_agg(titulo || '#' || ordem, ' | ' ORDER BY ordem) FROM public.demandas
  WHERE status IN ('fazer_hoje','fazer_amanha','fazer_depois_amanha') GROUP BY status;
SELECT public.virar_dia_demandas() AS movidas;
SELECT public.virar_dia_demandas() AS segunda_vez;
SELECT status, string_agg(titulo || '#' || ordem, ' | ' ORDER BY ordem) FROM public.demandas
  WHERE status IN ('fazer_hoje','fazer_amanha','fazer_depois_amanha') GROUP BY status;
ROLLBACK;
```

O editor mostra só o último resultado. Se precisar ver os dois, rode o bloco duas vezes, uma com o SELECT de antes e outra com o de depois antes do ROLLBACK.

Esperado:
- `fazer_hoje` = os cards antigos de hoje (mesma ordem), seguidos dos de amanhã (mesma ordem);
- `fazer_amanha` = os antigos de depois de amanhã, numerados 0..n;
- `fazer_depois_amanha` vazio;
- `segunda_vez` = 0.

Confira também o agendamento: `SELECT jobname, schedule FROM cron.job WHERE jobname = 'virar-dia-demandas';` → `0 3 * * *`.

- [ ] **Step 3: Teste de `msAteProximaVirada`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { msAteProximaVirada } from "./viradaDia.ts";

test("msAteProximaVirada: espera até 00:01 do dia seguinte (margem para o cron terminar)", () => {
  const agora = new Date(2026, 8, 23, 23, 0, 0); // 23/09 23:00 local
  assert.equal(msAteProximaVirada(agora), 61 * 60 * 1000);
});

test("msAteProximaVirada: logo após a meia-noite ainda aguarda o minuto de margem de hoje", () => {
  const agora = new Date(2026, 8, 24, 0, 0, 30);
  assert.equal(msAteProximaVirada(agora), 30 * 1000);
});
```

Run: `npm test` → FAIL (módulo não existe).

- [ ] **Step 4: Implementar**

```ts
/** Milissegundos até 00:01 (horário local): a virada roda às 00:00 no banco e leva alguns segundos. */
export function msAteProximaVirada(agora: Date): number {
  const alvo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 1, 0, 0);
  if (alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 1);
  return alvo.getTime() - agora.getTime();
}
```

Run: `npm test` → PASS.

- [ ] **Step 5: Recarregar o quadro depois da virada**

Em `index.tsx`, perto do efeito que chama `fetchDemandas()` na montagem, acrescente:

```tsx
  // A virada do dia (00:00, no banco) muda as colunas: recarrega depois dela e quando a aba volta
  // a aparecer (em aba escondida o navegador congela o timer)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const agendar = () => {
      timer = setTimeout(() => { fetchDemandas(); agendar(); }, msAteProximaVirada(new Date()));
    };
    const aoVoltar = () => { if (document.visibilityState === "visible") fetchDemandas(); };
    agendar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", aoVoltar); };
  }, []);
```

Importe `msAteProximaVirada` de `@/lib/viradaDia`.

- [ ] **Step 6: Commit**

```bash
git rm supabase/functions/daily-rotation.sql
git add supabase/migrations/20260923180000_demandas_virada_diaria.sql src/lib/viradaDia.ts src/lib/viradaDia.test.ts src/routes/_authenticated/index.tsx
git commit -m "Demandas: virada automática à meia-noite (amanhã → hoje abaixo dos atuais, depois de amanhã → amanhã)"
```

---

### Task 6: Verificação no navegador e push

- [ ] **Step 1:** `npm run dev`; abra a aba Demandas (ou o preview do Lovable após o push). Verifique:
  1. A coluna "Fazer no fim de semana" aparece entre "Fazer depois de amanhã" e "Standby", com as seções Sábado e Domingo.
  2. Arrastar um card de "Fazer hoje" para a coluna abre o popup, com o dia da seção onde ele caiu já destacado.
  3. Escolher Domingo leva o card para o fim de Domingo, com o selo "Domingo".
  4. Recarregar a página mantém o card no lugar.
  5. Arrastar outro card e fechar o popup (Esc) faz o card voltar para a coluna de origem, sem nada salvo.
  6. Reordenar dentro de Sábado persiste após recarregar.
  7. Arrastar de Sábado para Domingo troca o dia sem popup.
  8. No menu de 3 pontinhos, "Fazer no sábado" leva o card para o fim de Sábado.
  9. Clicar no card continua abrindo o painel de detalhes.
  10. Arrastar um card do fim de semana para "Standby" tira o selo. No banco, `dia_fim_de_semana` fica null.
- [ ] **Step 2:** `npm test` e `npx tsc --noEmit` limpos.
- [ ] **Step 3:** `git push`. Avise o usuário para clicar em Publish no Lovable. A virada só pode ser confirmada de verdade depois da primeira meia-noite: `SELECT * FROM public.demandas_viradas ORDER BY dia DESC LIMIT 3;`.
