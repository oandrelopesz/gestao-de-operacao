# Financeiro: isenção, forma de pagamento, parcial, atrasado acumulado e histórico — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** isentar mês ou parcela, forma de pagamento (cliente e parcela), confirmar valor cheio ou parcial, atrasado que
passa de mês em mês até quitar (desde set/2026), navegação por mês na aba e calendário de 12 meses por cliente.

**Architecture:** as contas ficam num módulo puro novo (`src/lib/financeiroCobranca.ts`) que monta, para cada fonte, a
lista de cobranças (mês × parcela) desde `cobranca_desde` com o que foi pago, o que falta, o abonado e se já venceu, a
partir dos registros de `financeiro_recebimentos` (agora com `isento` e `valor_devido`). As ações gravam com upsert na
chave fonte + mês + parcela. A tela usa essas cobranças para o mês escolhido, o botão de atrasado e o calendário.

**Tech Stack:** React + TanStack Router + shadcn/ui, Supabase (Lovable Cloud), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-01-financeiro-isencao-atrasado-design.md`

## Global Constraints

- Nenhuma dependência nova; nada de `window.confirm`/`alert`; cor nunca é o único sinal (texto junto); rótulos acessíveis.
- Interface em português do Brasil com acentos; valores com `formatBRL`; datas "YYYY-MM-DD" de Brasília
  (`hojeBrasilia()` de `src/lib/entrega.ts`).
- O app roda sem login: `user_id` = usuário logado ou `b34bdae5-7a67-4b63-a46f-8aad43a06c63` (padrão da aba).
- A conta do atrasado começa em `2026-09-01` (padrão de `cobranca_desde`).
- Não quebrar o que existe: o sino de avisos (`NotificationBell.tsx`) e o CRM (reaproveita o `FonteDialog`) seguem
  funcionando; colunas antigas da `financeiro_view` ficam.
- Testes: `npm test` (`node --test src/lib/*.test.ts`); `npx tsc --noEmit -p tsconfig.json` sem saída. Arquivos de
  `src/` mantêm o fim de linha de cada um. Nunca adicionar `src/routeTree.gen.ts`; nunca `git stash`.
- Commits em português terminando com exatamente uma linha
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261001200000_financeiro_isencao.sql` (novo) | colunas novas e view |
| `src/lib/financeiroCobranca.ts` (novo) + `src/lib/financeiroCobranca.test.ts` (novo) | cobranças, situações, totais, atrasado, calendário, meses navegáveis, forma de pagamento |
| `src/lib/financeiro.ts` + `src/lib/financeiro.test.ts` | `situacaoDoMes` entende isento e parcial; `StatusMes` ganha `isento` |
| `src/lib/financeiroAcoes.ts` (novo) | gravações: valor cheio, valor configurado, isentar (parcela/mês), desfazer, buscar registros |
| `src/components/financeiro/FonteDialog.tsx`, `ParcelasEditor.tsx` | forma de pagamento, cobrar a partir de, forma por parcela |
| `src/components/financeiro/CobrancaLinha.tsx`, `ValorRecebidoDialog.tsx`, `IsentarDialog.tsx`, `AtrasadoDialog.tsx`, `CalendarioCobranca.tsx`, `FormaBadge.tsx` (novos) | peças da tela |
| `src/routes/_authenticated/financeiro.tsx` | mês escolhido, resumo, cards, histórico |

---

### Task 1: Migration (controlador)

- [ ] Criar `supabase/migrations/20261001200000_financeiro_isencao.sql`:

```sql
-- Financeiro: forma de pagamento (cliente e parcela, na lista de parcelas), "cobrar a partir de" (o atrasado conta desde
-- esse mês; as fontes existentes começam em setembro de 2026), isenção e valor devido congelado no recebimento.
ALTER TABLE public.financeiro_fontes
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT CHECK (forma_pagamento IN ('pix', 'cartao', 'boleto')),
  ADD COLUMN IF NOT EXISTS cobranca_desde DATE;
UPDATE public.financeiro_fontes SET cobranca_desde = DATE '2026-09-01' WHERE cobranca_desde IS NULL;
ALTER TABLE public.financeiro_fontes ALTER COLUMN cobranca_desde SET DEFAULT (date_trunc('month', public.hoje_brt()))::date;
ALTER TABLE public.financeiro_fontes ALTER COLUMN cobranca_desde SET NOT NULL;

ALTER TABLE public.financeiro_recebimentos
  ADD COLUMN IF NOT EXISTS isento BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_devido NUMERIC(12,2);

-- A view repete as colunas de 20260925180000 na mesma ordem e acrescenta forma_pagamento e cobranca_desde no fim;
-- recebimentos_mes ganha isento e valor_devido.
CREATE OR REPLACE VIEW public.financeiro_view
WITH (security_invoker = true) AS
SELECT
  f.id AS fonte_id,
  f.user_id,
  f.nome,
  f.tipo,
  f.valor_mensal,
  f.dia_recebimento,
  f.ativo,
  f.observacoes,
  date_trunc('month', public.hoje_brt())::date AS mes_atual,
  r.id AS recebimento_id,
  COALESCE(r.recebido, false) AS recebido_mes_atual,
  r.data_confirmacao,
  r.valor_recebido,
  CASE
    WHEN COALESCE(r.recebido, false) = true THEN 'recebido'
    WHEN public.hoje_brt() > make_date(EXTRACT(year FROM public.hoje_brt())::int, EXTRACT(month FROM public.hoje_brt())::int, LEAST(f.dia_recebimento, 28)) + interval '5 days' THEN 'atrasado'
    WHEN public.hoje_brt() >= make_date(EXTRACT(year FROM public.hoje_brt())::int, EXTRACT(month FROM public.hoje_brt())::int, LEAST(f.dia_recebimento, 28)) THEN 'pendente'
    ELSE 'a_vencer'
  END AS status_mes,
  f.parcelas,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', rm.id,
      'parcela', rm.parcela,
      'recebido', COALESCE(rm.recebido, false),
      'data_confirmacao', rm.data_confirmacao,
      'valor_recebido', rm.valor_recebido,
      'isento', rm.isento,
      'valor_devido', rm.valor_devido
    ) ORDER BY rm.parcela)
    FROM public.financeiro_recebimentos rm
    WHERE rm.fonte_id = f.id
      AND rm.mes_referencia = date_trunc('month', public.hoje_brt())::date
  ), '[]'::jsonb) AS recebimentos_mes,
  f.agencia_id,
  f.forma_pagamento,
  f.cobranca_desde
FROM public.financeiro_fontes f
LEFT JOIN public.financeiro_recebimentos r
  ON r.fonte_id = f.id
  AND r.parcela = 1
  AND r.mes_referencia = date_trunc('month', public.hoje_brt())::date
WHERE f.ativo = true;
```

- [ ] Aplicar pelo editor SQL do Lovable; conferir pela API (`financeiro_view?select=forma_pagamento,cobranca_desde`,
  `financeiro_recebimentos?select=isento,valor_devido`). Commit.

---

### Task 2: Regras puras (TDD)

**Files:** Create `src/lib/financeiroCobranca.ts`, `src/lib/financeiroCobranca.test.ts`; Modify `src/lib/financeiro.ts`,
`src/lib/financeiro.test.ts`.

**Interfaces — Produces:** `FormaPagamento`, `FORMAS_DE_PAGAMENTO`, `formaDePagamento`, `RegistroRecebimento`,
`FonteCobravel`, `SituacaoCobranca`, `SituacaoMes`, `Cobranca`, `COBRANCA_DESDE_PADRAO`, `mesesCobrados`,
`ultimosMeses`, `parcelasComForma`, `cobrancasDaFonte`, `atrasadoDe`, `totaisDe`, `situacaoDoMesCobrado`,
`calendarioDaFonte`, `mesesNavegaveis`, `mesEscolhido`, `INFO_SITUACAO`. Em `financeiro.ts`: `StatusMes` com `"isento"`,
`RecebimentoMes.isento?/valor_devido?`, `situacaoDoMes` e `infoDoStatus` atualizados.

- [ ] **Step 1: testes que falham** — `src/lib/financeiroCobranca.test.ts`

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  atrasadoDe, calendarioDaFonte, cobrancasDaFonte, formaDePagamento, mesEscolhido, mesesCobrados, mesesNavegaveis,
  parcelasComForma, situacaoDoMesCobrado, totaisDe, ultimosMeses, type RegistroRecebimento,
} from "./financeiroCobranca.ts";

const reg = (o: Partial<RegistroRecebimento> & { mes: string; parcela?: number }): RegistroRecebimento => ({
  id: `r-${o.mes}-${o.parcela ?? 1}`, fonte_id: "f", mes_referencia: `${o.mes}-01`, parcela: o.parcela ?? 1,
  recebido: o.recebido ?? null, isento: o.isento ?? null, valor_recebido: o.valor_recebido ?? null,
  valor_devido: o.valor_devido ?? null, data_confirmacao: null, observacoes: o.observacoes ?? null,
});
const unica = { valor_mensal: 1000, dia_recebimento: 10, parcelas: null, forma_pagamento: "pix", cobranca_desde: "2026-09-01" };
const parcelada = {
  valor_mensal: 1500, dia_recebimento: 5, forma_pagamento: "boleto", cobranca_desde: "2026-09-01",
  parcelas: [{ dia: 20, valor: 500, forma: "cartao" }, { dia: 5, valor: 1000 }],
};

test("mesesCobrados: do mês de desde até o de hoje; padrão set/2026; desde inválido não trava", () => {
  assert.deepEqual(mesesCobrados("2026-09-01", "2026-11-15"), ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(mesesCobrados(null, "2026-10-02"), ["2026-09", "2026-10"]);
  assert.deepEqual(mesesCobrados("2026-12-01", "2026-10-02"), []);
  assert.deepEqual(mesesCobrados("lixo", "2026-10-02"), ["2026-09", "2026-10"]);
  assert.deepEqual(mesesCobrados("2026-11-01", "2027-02-01"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
});

test("ultimosMeses: n meses terminando no de hoje, mais antigo primeiro", () => {
  assert.deepEqual(ultimosMeses("2027-02-10", 4), ["2026-11", "2026-12", "2027-01", "2027-02"]);
});

test("formaDePagamento e parcelasComForma: forma da parcela vence; sem ela, a da fonte", () => {
  assert.equal(formaDePagamento("pix"), "pix");
  assert.equal(formaDePagamento("dinheiro"), null);
  assert.deepEqual(parcelasComForma(parcelada).map((p) => [p.dia, p.forma]), [[5, "boleto"], [20, "cartao"]]);
  assert.deepEqual(parcelasComForma(unica).map((p) => p.forma), ["pix"]);
});

test("cobrancasDaFonte: mês passado sem pagamento é atrasado e vencido; mês atual segue a tolerância", () => {
  const c = cobrancasDaFonte(unica, [], "2026-10-12");
  assert.deepEqual(c.map((x) => [x.mes, x.situacao, x.vencida, x.falta]), [
    ["2026-09", "atrasado", true, 1000],
    ["2026-10", "pendente", false, 1000],
  ]);
  const depois = cobrancasDaFonte(unica, [], "2026-10-16");
  assert.equal(depois[1].situacao, "atrasado");
  assert.equal(depois[1].vencida, true);
});

test("cobrancasDaFonte: recebido cheio, parcial (falta o resto) e isento (abona o que não foi pago)", () => {
  const regs = [
    reg({ mes: "2026-09", recebido: true, valor_recebido: 1000, valor_devido: 1000 }),
    reg({ mes: "2026-10", recebido: true, valor_recebido: 400, valor_devido: 1000 }),
    reg({ mes: "2026-11", isento: true, recebido: true, valor_recebido: 300, valor_devido: 1000, observacoes: "acordo" }),
  ];
  const c = cobrancasDaFonte(unica, regs, "2026-11-02");
  assert.deepEqual(c.map((x) => [x.situacao, x.pago, x.falta, x.abonado]), [
    ["recebido", 1000, 0, 0],
    ["parcial", 400, 600, 0],
    ["isento", 300, 0, 700],
  ]);
  assert.equal(c[1].vencida, true);
});

test("cobrancasDaFonte: valor_devido congelado vence o valor atual; recebido sem valor conta cheio", () => {
  const c = cobrancasDaFonte(unica, [reg({ mes: "2026-09", recebido: true, valor_devido: 800 })], "2026-09-15");
  assert.deepEqual([c[0].valor, c[0].pago, c[0].situacao], [800, 800, "recebido"]);
});

test("cobrancasDaFonte: parcelado em ordem de dia; registro de parcela que não existe mais é ignorado", () => {
  const c = cobrancasDaFonte(parcelada, [reg({ mes: "2026-09", parcela: 3, recebido: true })], "2026-09-01");
  assert.deepEqual(c.map((x) => [x.parcela, x.dia, x.valor, x.forma, x.situacao]), [
    [1, 5, 1000, "boleto", "a_vencer"],
    [2, 20, 500, "cartao", "a_vencer"],
  ]);
});

test("atrasadoDe: só o vencido que falta, do mais antigo ao mais novo, com o total", () => {
  const regs = [reg({ mes: "2026-10", recebido: true, valor_recebido: 400, valor_devido: 1000 })];
  const a = atrasadoDe(cobrancasDaFonte(unica, regs, "2026-11-05"));
  assert.deepEqual(a.itens.map((x) => [x.mes, x.falta]), [["2026-09", 1000], ["2026-10", 600]]);
  assert.equal(a.total, 1600);
});

test("totaisDe: previsto sem o abonado, recebido, isento e em aberto", () => {
  const regs = [
    reg({ mes: "2026-09", parcela: 1, isento: true, valor_devido: 1000 }),
    reg({ mes: "2026-09", parcela: 2, recebido: true, valor_recebido: 200, valor_devido: 500 }),
  ];
  const t = totaisDe(cobrancasDaFonte(parcelada, regs, "2026-09-25").filter((c) => c.mes === "2026-09"));
  assert.deepEqual(t, { previsto: 500, recebido: 200, isento: 1000, emAberto: 300 });
});

test("situacaoDoMesCobrado: pior situação; todas isentas = isento; sem cobranças = fora", () => {
  assert.equal(situacaoDoMesCobrado([]), "fora");
  const base = cobrancasDaFonte(parcelada, [], "2026-10-02").filter((c) => c.mes === "2026-09");
  assert.equal(situacaoDoMesCobrado(base), "atrasado");
  const isentas = cobrancasDaFonte(parcelada, [reg({ mes: "2026-09", parcela: 1, isento: true }), reg({ mes: "2026-09", parcela: 2, isento: true })], "2026-10-02").filter((c) => c.mes === "2026-09");
  assert.equal(situacaoDoMesCobrado(isentas), "isento");
  const mistas = cobrancasDaFonte(parcelada, [reg({ mes: "2026-09", parcela: 1, isento: true }), reg({ mes: "2026-09", parcela: 2, recebido: true })], "2026-10-02").filter((c) => c.mes === "2026-09");
  assert.equal(situacaoDoMesCobrado(mistas), "recebido");
});

test("calendarioDaFonte: 12 meses até hoje, os anteriores à cobrança ficam fora", () => {
  const cal = calendarioDaFonte(cobrancasDaFonte(unica, [], "2026-10-02"), "2026-10-02", 12);
  assert.equal(cal.length, 12);
  assert.equal(cal[0].mes, "2025-11");
  assert.equal(cal[0].situacao, "fora");
  assert.deepEqual(cal.slice(-2).map((m) => [m.mes, m.situacao, m.emAberto]), [["2026-09", "atrasado", 1000], ["2026-10", "a_vencer", 1000]]);
});

test("mesesNavegaveis e mesEscolhido: do cobranca_desde mais antigo até hoje; valor fora da lista vira o mês atual", () => {
  const nav = mesesNavegaveis([{ ...unica, cobranca_desde: "2026-10-01" }, unica], "2026-11-03");
  assert.deepEqual(nav, ["2026-09", "2026-10", "2026-11"]);
  assert.equal(mesEscolhido("2026-10", nav, "2026-11-03"), "2026-10");
  assert.equal(mesEscolhido("2026-08", nav, "2026-11-03"), "2026-11");
  assert.equal(mesEscolhido(undefined, nav, "2026-11-03"), "2026-11");
});
```

Em `src/lib/financeiro.test.ts` (acrescente):

```ts
test("situacaoDoMes: parcela isenta fica isenta e sai do em aberto; parcial continua em aberto pelo resto", () => {
  const isenta = situacaoDoMes({ ...unica, recebimentos_mes: [{ id: "1", parcela: 1, recebido: false, isento: true, data_confirmacao: null, valor_recebido: null }] }, "2026-09-30");
  assert.equal(isenta.status, "isento");
  assert.equal(isenta.valorEmAberto, 0);
  const parcial = situacaoDoMes({ ...unica, recebimentos_mes: [{ id: "1", parcela: 1, recebido: true, data_confirmacao: null, valor_recebido: 1000, valor_devido: 3500 }] }, "2026-09-30");
  assert.equal(parcial.status, "atrasado");
  assert.equal(parcial.valorEmAberto, 2500);
  assert.equal(parcial.valorRecebido, 1000);
});
```

(`unica` do arquivo: 3500 no dia 25. Confira os números com a fixture real do arquivo e ajuste só os valores, nunca o
comportamento.)

- [ ] **Step 2: ver falhar** — `npm test`.

- [ ] **Step 3: `src/lib/financeiroCobranca.ts`**

```ts
// Cobrança mês a mês de cada fonte do Financeiro: de "cobrar a partir de" até o mês atual, cada parcela de cada mês com
// o que foi pago, o que falta, o que foi abonado (isento) e se já venceu. Puro (sem Supabase/React): roda no navegador e no
// node --test. Datas "YYYY-MM-DD" e meses "YYYY-MM" de Brasília.
import { nomeDoMes, parcelasDaFonte, statusDaParcela, vencimentoNoMes, type FonteDoMes } from "./financeiro.ts";

export type FormaPagamento = "pix" | "cartao" | "boleto";
export const FORMAS_DE_PAGAMENTO: Record<FormaPagamento, string> = { pix: "PIX", cartao: "Cartão", boleto: "Boleto" };

export function formaDePagamento(v: unknown): FormaPagamento | null {
  return v === "pix" || v === "cartao" || v === "boleto" ? v : null;
}

/** Linha de `financeiro_recebimentos` (os campos que a cobrança usa). */
export interface RegistroRecebimento {
  id: string;
  fonte_id: string;
  mes_referencia: string;
  parcela: number | null;
  recebido: boolean | null;
  isento: boolean | null;
  valor_recebido: number | null;
  valor_devido: number | null;
  data_confirmacao: string | null;
  observacoes: string | null;
}

export interface FonteCobravel extends FonteDoMes {
  forma_pagamento?: string | null;
  cobranca_desde?: string | null;
  parcelas?: { dia: number; valor: number; forma?: string | null }[] | null;
}

export type SituacaoCobranca = "recebido" | "parcial" | "isento" | "atrasado" | "pendente" | "a_vencer";
export type SituacaoMes = SituacaoCobranca | "fora";

export interface Cobranca {
  mes: string;
  parcela: number;
  total: number;
  dia: number;
  vencimento: string;
  valor: number;
  pago: number;
  falta: number;
  abonado: number;
  forma: FormaPagamento | null;
  situacao: SituacaoCobranca;
  vencida: boolean;
  registro: RegistroRecebimento | null;
}

export const COBRANCA_DESDE_PADRAO = "2026-09-01";
const CENTAVO = 0.005;
const arred = (v: number) => Math.round(v * 100) / 100;
const MES = /^\d{4}-\d{2}$/;

function proximoMes(mes: string): string {
  let [y, m] = mes.split("-").map(Number);
  m++;
  if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** "YYYY-MM" de cada mês de `desde` até o mês de `hoje` (inclusive). Data inválida vale como setembro de 2026. */
export function mesesCobrados(desde: string | null | undefined, hoje: string): string[] {
  const inicio = MES.test(String(desde ?? "").slice(0, 7)) ? String(desde).slice(0, 7) : COBRANCA_DESDE_PADRAO.slice(0, 7);
  const fim = hoje.slice(0, 7);
  const out: string[] = [];
  for (let mes = inicio; mes <= fim && out.length < 600; mes = proximoMes(mes)) out.push(mes);
  return out;
}

/** Os `n` meses que terminam no mês de `hoje`, do mais antigo ao atual. */
export function ultimosMeses(hoje: string, n: number): string[] {
  let [y, m] = hoje.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m < 1) { m = 12; y--; }
  }
  return out;
}

/** As parcelas da configuração da fonte, em ordem de dia, com a forma de cada uma (ou a da fonte). */
export function parcelasComForma(fonte: FonteCobravel) {
  const daFonte = formaDePagamento(fonte.forma_pagamento);
  const originais = Array.isArray(fonte.parcelas) ? fonte.parcelas : [];
  return parcelasDaFonte(fonte).map((p) => {
    const original = originais.find((o) => Number(o.dia) === p.dia);
    return { ...p, forma: formaDePagamento(original?.forma) ?? daFonte };
  });
}

/** Cada parcela de cada mês cobrado da fonte, do mês mais antigo ao atual. */
export function cobrancasDaFonte(fonte: FonteCobravel, registros: RegistroRecebimento[], hoje: string): Cobranca[] {
  const parcelas = parcelasComForma(fonte);
  const mesAtual = hoje.slice(0, 7);
  const out: Cobranca[] = [];
  for (const mes of mesesCobrados(fonte.cobranca_desde, hoje)) {
    parcelas.forEach((p, i) => {
      const numero = i + 1;
      const registro = registros.find((r) => r.mes_referencia.slice(0, 7) === mes && (r.parcela ?? 1) === numero) ?? null;
      const valor = arred(registro?.valor_devido != null ? Number(registro.valor_devido) : p.valor);
      const pagoInformado = registro?.recebido ? Number(registro.valor_recebido ?? valor) : 0;
      const pago = arred(Math.max(0, Math.min(pagoInformado, valor)));
      const vencimento = vencimentoNoMes(p.dia, `${mes}-01`);
      const vencida = mes < mesAtual || statusDaParcela(vencimento, false, hoje) === "atrasado";
      let situacao: SituacaoCobranca;
      let falta = 0;
      let abonado = 0;
      if (registro?.isento) {
        situacao = "isento";
        abonado = arred(valor - pago);
      } else if (pago >= valor - CENTAVO) {
        situacao = "recebido";
      } else {
        falta = arred(valor - pago);
        situacao = pago > 0 ? "parcial" : mes < mesAtual ? "atrasado" : (statusDaParcela(vencimento, false, hoje) as SituacaoCobranca);
      }
      out.push({ mes, parcela: numero, total: parcelas.length, dia: p.dia, vencimento, valor, pago, falta, abonado, forma: p.forma, situacao, vencida, registro });
    });
  }
  return out;
}

/** O que está devendo (vencido e não quitado nem isento), do mais antigo ao mais novo, e o total. */
export function atrasadoDe(cobrancas: Cobranca[]) {
  const itens = cobrancas.filter((c) => c.vencida && c.falta > 0);
  return { itens, total: arred(itens.reduce((t, c) => t + c.falta, 0)) };
}

/** Totais de um conjunto de cobranças (um mês de uma ou de várias fontes). */
export function totaisDe(cobrancas: Cobranca[]) {
  const soma = (f: (c: Cobranca) => number) => arred(cobrancas.reduce((t, c) => t + f(c), 0));
  return {
    previsto: soma((c) => c.valor - c.abonado),
    recebido: soma((c) => c.pago),
    isento: soma((c) => c.abonado),
    emAberto: soma((c) => c.falta),
  };
}

/** Situação do mês de uma fonte (calendário): a pior das parcelas; todas isentas = isento; nada cobrado = fora. */
export function situacaoDoMesCobrado(doMes: Cobranca[]): SituacaoMes {
  if (!doMes.length) return "fora";
  const tem = (s: SituacaoCobranca) => doMes.some((c) => c.situacao === s);
  if (tem("atrasado")) return "atrasado";
  if (tem("parcial")) return "parcial";
  if (tem("pendente")) return "pendente";
  if (tem("a_vencer")) return "a_vencer";
  if (doMes.every((c) => c.situacao === "isento")) return "isento";
  return "recebido";
}

/** Os últimos `n` meses até hoje, com a situação e os totais de cada um. */
export function calendarioDaFonte(cobrancas: Cobranca[], hoje: string, n = 12) {
  return ultimosMeses(hoje, n).map((mes) => {
    const doMes = cobrancas.filter((c) => c.mes === mes);
    return { mes, nome: nomeDoMes(`${mes}-01`), situacao: situacaoDoMesCobrado(doMes), ...totaisDe(doMes) };
  });
}

/** Meses da navegação da aba: do `cobranca_desde` mais antigo das fontes até o mês atual. */
export function mesesNavegaveis(fontes: FonteCobravel[], hoje: string): string[] {
  const inicios = fontes
    .map((f) => String(f.cobranca_desde ?? COBRANCA_DESDE_PADRAO).slice(0, 7))
    .filter((m) => MES.test(m))
    .sort();
  return mesesCobrados(`${inicios[0] ?? COBRANCA_DESDE_PADRAO.slice(0, 7)}-01`, hoje);
}

/** "YYYY-MM" válido e dentro dos meses navegáveis; senão o mês atual. */
export function mesEscolhido(v: unknown, navegaveis: string[], hoje: string): string {
  return typeof v === "string" && navegaveis.includes(v) ? v : hoje.slice(0, 7);
}

/** Texto e cores de cada situação (cor nunca sozinha: sempre com o texto). */
export const INFO_SITUACAO: Record<SituacaoMes, { label: string; classe: string }> = {
  recebido: { label: "Recebido", classe: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  parcial: { label: "Parcial", classe: "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  isento: { label: "Isento", classe: "border-sky-200 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
  atrasado: { label: "Atrasado", classe: "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  pendente: { label: "Pendente", classe: "border-amber-200 bg-amber-50/60 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" },
  a_vencer: { label: "A vencer", classe: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300" },
  fora: { label: "Fora da cobrança", classe: "border-dashed border-zinc-200 bg-transparent text-zinc-400" },
};
```

- [ ] **Step 4: `src/lib/financeiro.ts`** — `StatusMes` ganha `"isento"`; `RecebimentoMes` ganha `isento?: boolean | null;
  valor_devido?: number | null;`. Em `situacaoDoMes`, para cada parcela: `isento` → status `"isento"`; recebido só se
  `recebido && (valor_recebido == null || valor_recebido >= (valor_devido ?? valor) - 0.005)`; o resto pela data.
  `valorRecebido` soma o `valor_recebido` (ou o valor cheio) de toda parcela com `recebido` (inclusive parcial e isenta
  com pagamento); `valorEmAberto` soma `(valor_devido ?? valor) − pago` das que não estão recebidas nem isentas;
  `valorAtrasado` idem para as atrasadas. `statusGeral`: todas isentas → `"isento"`; todas recebidas ou isentas →
  `"recebido"`; depois atrasado > pendente > a vencer. `infoDoStatus("isento")` → `{ label: "Isento", color: "bg-sky-500",
  text: "text-sky-600", border: "border-sky-200", bg: "bg-sky-50/50" }`. Ajuste os testes antigos só se algum dependia de
  parcial contar como recebido (não deveria).

- [ ] **Step 5: verde** (`npm test`, `npx tsc --noEmit -p tsconfig.json`) e **commit**
  `"Financeiro: regras de cobrança mês a mês (isento, parcial, atrasado acumulado, calendário)"`.

---

### Task 3: Ações e formulário

**Files:** Create `src/lib/financeiroAcoes.ts`; Modify `src/components/financeiro/FonteDialog.tsx`,
`src/components/financeiro/ParcelasEditor.tsx`, `src/lib/financeiro.ts` (tipo `Parcela` ganha `forma?`), e a lista de
campos lidos da view onde a fonte é tipada (`financeiro.tsx`).

- [ ] **`src/lib/financeiroAcoes.ts`** (Supabase; sem teste automático):

```ts
// Gravações da cobrança do Financeiro (uma linha por fonte + mês + parcela em financeiro_recebimentos).
import { supabase } from "@/integrations/supabase/client";
import type { Cobranca, RegistroRecebimento } from "@/lib/financeiroCobranca";

const USUARIO_PADRAO = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";
const tabela = () => supabase.from("financeiro_recebimentos" as any) as any;

async function usuario(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? USUARIO_PADRAO;
}

async function gravar(fonteId: string, c: Cobranca, campos: Record<string, unknown>) {
  const { error } = await tabela().upsert(
    { user_id: await usuario(), fonte_id: fonteId, mes_referencia: `${c.mes}-01`, parcela: c.parcela, ...campos },
    { onConflict: "fonte_id,mes_referencia,parcela" },
  );
  if (error) throw error;
}

/** Quita a parcela daquele mês com o valor cheio. */
export async function confirmarValorCheio(fonteId: string, c: Cobranca) {
  await gravar(fonteId, c, { recebido: true, isento: false, valor_recebido: c.valor, valor_devido: c.valor, data_confirmacao: new Date().toISOString() });
}

/** Valor recebido NO TOTAL daquela parcela (menor que o devido deixa o resto em aberto). `dataIso` = "YYYY-MM-DD". */
export async function confirmarValorRecebido(fonteId: string, c: Cobranca, valorTotal: number, dataIso: string) {
  if (!(valorTotal > 0)) throw new Error("Informe um valor maior que zero.");
  await gravar(fonteId, c, {
    recebido: true, isento: false, valor_recebido: Math.round(valorTotal * 100) / 100, valor_devido: c.valor,
    data_confirmacao: new Date(`${dataIso}T12:00:00-03:00`).toISOString(),
  });
}

/** Abona a parcela daquele mês (o que já foi pago continua contando). */
export async function isentarCobranca(fonteId: string, c: Cobranca, motivo: string | null) {
  await gravar(fonteId, c, { isento: true, valor_devido: c.valor, observacoes: motivo?.trim() || null });
}

/** Isenta as parcelas do mês que ainda não estão quitadas nem isentas. */
export async function isentarMes(fonteId: string, doMes: Cobranca[], motivo: string | null) {
  for (const c of doMes) if (c.situacao !== "recebido" && c.situacao !== "isento") await isentarCobranca(fonteId, c, motivo);
}

/** Volta a parcela daquele mês a "não acertada" (apaga o registro). */
export async function desfazerCobranca(c: Cobranca) {
  if (!c.registro) return;
  const { error } = await tabela().delete().eq("id", c.registro.id);
  if (error) throw error;
}

/** Registros a partir de um mês ("YYYY-MM-DD"), de todas as fontes. */
export async function buscarRegistrosDesde(desde: string): Promise<RegistroRecebimento[]> {
  const { data, error } = await tabela()
    .select("id, fonte_id, mes_referencia, parcela, recebido, isento, valor_recebido, valor_devido, data_confirmacao, observacoes")
    .gte("mes_referencia", desde)
    .order("mes_referencia");
  if (error) throw error;
  return (data ?? []) as RegistroRecebimento[];
}
```

- [ ] **`FonteDialog.tsx`**: campo **"Forma de pagamento"** (`Select`: PIX, Cartão, Boleto, "Não informada" → null);
  campo **"Cobrar a partir de"** (`Input type="month"`; padrão: o da fonte em edição, ou o mês atual para fonte nova;
  grava `${mes}-01`; ajuda: "Meses antes disso não entram no atrasado."). Grava `forma_pagamento` e `cobranca_desde`.
  Parcelas gravadas com `forma` quando escolhida (`{ dia, valor, forma? }`). O CRM continua usando o diálogo sem mudanças.
- [ ] **`ParcelasEditor.tsx`**: em cada parcela, `Select` **"Forma"** ("Igual ao cliente", PIX, Cartão, Boleto), com
  `aria-label="Forma da parcela N"`.
- [ ] `tsc` limpo, `npm test`, **commit** `"Financeiro: forma de pagamento do cliente e da parcela e cobrar a partir de"`.

---

### Task 4: Peças da tela (componentes)

**Files:** Create `src/components/financeiro/{FormaBadge,CobrancaLinha,ValorRecebidoDialog,IsentarDialog,AtrasadoDialog,CalendarioCobranca}.tsx`.

- **`FormaBadge`**: `Badge variant="outline"` com ícone (`QrCode` PIX, `CreditCard` Cartão, `Receipt` Boleto) e o texto;
  nada quando a forma é null.
- **`CobrancaLinha`** (`{ cobranca, mostrarMes?, onValorCheio, onConfigurar, onIsentar, onDesfazer, ocupado }`): mês
  (quando pedido, "setembro de 2026"), "Parcela N/T · dia D" (só quando T > 1), valor, forma (`FormaBadge`), situação
  (`INFO_SITUACAO` com texto), "Pago R$ X · falta R$ Y" no parcial, motivo no isento; ações: quitado ou isento →
  **"Desfazer"**; senão **"Valor cheio"**, **"Configurar valor recebido"**, **"Isentar"** (ou "Isentar parcela" quando
  T > 1). Botões desabilitados com `ocupado`.
- **`ValorRecebidoDialog`**: "Valor recebido no total desta parcela" (máscara de reais como a da aba; padrão = o já pago
  ou o valor cheio), "Data do recebimento" (`type="date"`, padrão hoje), texto "Valor menor que R$ X deixa o resto em
  aberto."; "Salvar" desabilitado com valor ≤ 0.
- **`IsentarDialog`**: título "Isentar parcela" / "Isentar este mês" / "Isentar mês inteiro", texto do que será abonado
  (valor e mês), "Motivo (opcional)", "Isentar".
- **`AtrasadoDialog`**: título "Atrasado de <nome>", total no topo, lista de `CobrancaLinha` com `mostrarMes`, agrupada
  por mês (do mais antigo), vazia: "Nada atrasado."
- **`CalendarioCobranca`** (`{ meses: ReturnType<typeof calendarioDaFonte>; selecionado; onSelecionar }`): grade 3 × 4
  (2 colunas no celular) de botões (`aria-pressed`), cada um com o nome curto do mês e o ano, o rótulo da situação
  (`INFO_SITUACAO`, usando **"Devido"** no lugar de "Atrasado") e o valor em aberto ou recebido; "fora" desabilitado.
- `tsc` limpo, **commit** `"Financeiro: peças da tela (linha da cobrança, diálogos de valor, isenção e atrasado, calendário)"`.

---

### Task 5: Aba Financeiro

**Files:** Modify `src/routes/_authenticated/financeiro.tsx` (e `src/lib/data.ts` se o carregamento da aba estiver lá).

- **Dados:** junto com a `financeiro_view`, buscar `buscarRegistrosDesde(min(cobranca_desde))` e montar
  `cobrancasPorFonte = Map<fonte_id, Cobranca[]>` com `cobrancasDaFonte(fonte, registrosDaFonte, hoje)`. Recarregar os
  dois depois de cada ação.
- **Mês escolhido:** `?mes=AAAA-MM` na URL (`validateSearch` da rota, sem quebrar os links atuais para `/financeiro`);
  `mesesNavegaveis` + `mesEscolhido`; no topo "‹ outubro de 2026 ›" (`aria-label` "Mês anterior"/"Próximo mês",
  desabilitados nas pontas) e um botão "Mês atual" quando não for o atual.
- **Cartões de resumo:** Previsto, Recebido, **Isento**, Em aberto (do mês escolhido, `totaisDe` das cobranças desse mês
  de todas as fontes) e **Atrasado** (acumulado até hoje de todas as fontes, `atrasadoDe`), com o texto "inclui meses
  anteriores" quando houver atraso de meses passados.
- **Cards (e lista):** selo `FormaBadge` da fonte; botão vermelho **"Atrasado: R$ X"** (abre `AtrasadoDialog`) quando
  `atrasadoDe(cobranças da fonte).total > 0`; as parcelas do mês escolhido com `CobrancaLinha`; **"Isentar este mês"**
  (pagamento único) ou **"Isentar mês inteiro"** (parcelado) quando houver parcela do mês não quitada nem isenta; o
  restante do card como hoje. Ações com toasts ("Pagamento confirmado", "Valor recebido salvo", "Mês isentado",
  "Parcela isentada", "Desfeito") e erro "Não foi possível salvar. Tente de novo."; uma ação por vez por fonte.
- **"Desfazer":** `AlertDialog` "Desfazer o acerto desta parcela?".
- **Filtro de situação:** usa `situacaoDoMesCobrado` do mês escolhido; opções Recebido, Parcial, Isento, Atrasado,
  Pendente, A vencer.
- **Histórico (Sheet do cliente):** `CalendarioCobranca` com `calendarioDaFonte` (12 meses) e, ao escolher um mês, as
  `CobrancaLinha` daquele mês com as ações; a lista antiga do histórico continua abaixo.
- Mantém: o toggle atual de parcela some (as ações novas substituem), edição, exclusão, ativar/desativar, CRM.
- `tsc` limpo, `npm test`, **commit** `"Financeiro: isentar, valor cheio ou parcial, atrasado acumulado, navegação por mês e calendário"`.

---

### Task 6: Verificação e publicação (controlador)

- [ ] Teste de tela no servidor local com fontes TESTE (única com `cobranca_desde` em setembro e parcelada): forma de
  pagamento no card; atrasado de setembro aparece em outubro com o valor; "Valor cheio" num mês passado zera o atrasado;
  "Configurar valor recebido" menor deixa "Parcial" e o resto no atrasado; isentar parcela e mês mudam previsto, isento e
  em aberto; desfazer volta; navegação ‹ › e `?mes=`; calendário com cores e texto; 390 px; sem erro de página; o sino
  não avisa parcela isenta. Apagar as fontes TESTE (e os recebimentos, em cascata).
- [ ] Revisão final da branch (modelo mais forte); merge na `main`, push, publicar no Lovable, conferir no site (só
  leitura).
- [ ] Cofre (`_knowledge/modulos/financeiro.md`, `_memory/current-state.md`, decisão) e memória.

## Self-Review

- Spec 1 → Task 1; 2 → Task 2; 3 → Task 3 (ações) e 5; 4 → Tasks 3, 4, 5; 5 → documentado; 6 → Tasks 2 e 6.
- Nomes: `cobrancasDaFonte`, `atrasadoDe`, `totaisDe`, `calendarioDaFonte`, `situacaoDoMesCobrado`, `INFO_SITUACAO`,
  `confirmarValorCheio`, `confirmarValorRecebido`, `isentarCobranca`, `isentarMes`, `desfazerCobranca`,
  `buscarRegistrosDesde` usados com a mesma assinatura nas Tasks 4 e 5.
