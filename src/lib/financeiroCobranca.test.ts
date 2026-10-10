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
  // mês 00 e mês 13 ou mais não são meses: valem como o padrão
  assert.deepEqual(mesesCobrados("2026-13-01", "2026-10-02"), ["2026-09", "2026-10"]);
  assert.deepEqual(mesesCobrados("2026-00-01", "2026-10-02"), ["2026-09", "2026-10"]);
  // ano digitado pela metade (0026) ou fora de 2020-2100 também vale como o padrão, não vira mês fantasma
  assert.deepEqual(mesesCobrados("0026-09-01", "2026-10-02"), ["2026-09", "2026-10"]);
  assert.deepEqual(mesesCobrados("2019-12-01", "2026-10-02"), ["2026-09", "2026-10"]);
  assert.deepEqual(mesesCobrados("2101-01-01", "2026-10-02"), ["2026-09", "2026-10"]);
  assert.equal(mesesCobrados("2020-01-01", "2020-03-10").length, 3);
  assert.deepEqual(mesesNavegaveis([{ ...unica, cobranca_desde: "0026-09-01" }], "2026-10-02"), ["2026-09", "2026-10"]);
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

test("cobrancasDaFonte: a tolerância de 5 dias vale também na virada do mês", () => {
  // vence em 30/09 e não foi paga: pendente até 05/10, atrasada a partir de 06/10
  const dia30 = { ...unica, dia_recebimento: 30 };
  const em1 = cobrancasDaFonte(dia30, [], "2026-10-01");
  assert.deepEqual([em1[0].mes, em1[0].situacao, em1[0].vencida], ["2026-09", "pendente", false]);
  assert.equal(atrasadoDe(em1).total, 0);
  assert.equal(cobrancasDaFonte(dia30, [], "2026-10-05")[0].situacao, "pendente");
  const em6 = cobrancasDaFonte(dia30, [], "2026-10-06");
  assert.deepEqual([em6[0].situacao, em6[0].vencida], ["atrasado", true]);
  assert.equal(atrasadoDe(em6).total, 1000);
  // parcial no mês que acabou também espera a tolerância para entrar no atrasado
  const parcial = cobrancasDaFonte(dia30, [reg({ mes: "2026-09", recebido: true, valor_recebido: 400, valor_devido: 1000 })], "2026-10-03");
  assert.deepEqual([parcial[0].situacao, parcial[0].vencida, atrasadoDe(parcial).total], ["parcial", false, 0]);
});

test("cobrancasDaFonte: recebido antigo sem valor_devido vale o que foi recebido (a fonte subiu depois)", () => {
  const c = cobrancasDaFonte({ ...unica, valor_mensal: 3500 }, [reg({ mes: "2026-09", recebido: true, isento: false, valor_recebido: 3400 })], "2026-10-02");
  assert.deepEqual([c[0].valor, c[0].pago, c[0].falta, c[0].situacao], [3400, 3400, 0, "recebido"]);
  // sem pagamento ainda vale o valor atual
  assert.equal(c[1].valor, 3500);
});

test("cobrancasDaFonte: isenta com o pagamento cobrindo o valor é recebida, sem abono (e o Desfazer apaga o acerto)", () => {
  const c = cobrancasDaFonte(unica, [reg({ mes: "2026-09", isento: true, recebido: true, valor_recebido: 1000, valor_devido: 1000 })], "2026-10-02");
  assert.deepEqual([c[0].situacao, c[0].pago, c[0].falta, c[0].abonado], ["recebido", 1000, 0, 0]);
  // recebida com registro: a linha oferece só o "Desfazer", que apaga o registro (não é "isento com pagamento")
  assert.ok(c[0].registro);
  assert.ok(!(c[0].situacao === "isento" && c[0].pago > 0));
  assert.deepEqual(totaisDe([c[0]]), { previsto: 1000, recebido: 1000, isento: 0, emAberto: 0 });
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

test("mesesNavegaveis: nunca fica vazio, sempre inclui o mês atual e trata data inválida como o padrão", () => {
  assert.deepEqual(mesesNavegaveis([], "2026-11-03"), ["2026-09", "2026-10", "2026-11"]);
  // fonte que só começa a cobrar depois de hoje: a lista ainda tem o mês atual
  assert.deepEqual(mesesNavegaveis([{ ...unica, cobranca_desde: "2027-01-01" }], "2026-10-02"), ["2026-10"]);
  // cobranca_desde inválido cobra desde setembro (como em mesesCobrados), então a navegação também começa lá
  assert.deepEqual(mesesNavegaveis([{ ...unica, cobranca_desde: "2026-10-01" }, { ...unica, cobranca_desde: "lixo" }], "2026-10-02"), ["2026-09", "2026-10"]);
  assert.deepEqual(mesesNavegaveis([{ ...unica, cobranca_desde: "2026-13-01" }], "2026-10-02"), ["2026-09", "2026-10"]);
});

test("mesEscolhido: nunca devolve mês fora da lista (nem quebra) quando a lista não tem o mês atual", () => {
  assert.equal(mesEscolhido("2026-12", ["2026-09", "2026-10"], "2026-11-03"), "2026-10");
  assert.equal(mesEscolhido(undefined, ["2026-09", "2026-10"], "2026-11-03"), "2026-10");
  assert.equal(mesEscolhido(42, ["2026-09", "2026-10", "2026-11"], "2026-11-03"), "2026-11");
  assert.equal(mesEscolhido("2026-09", [], "2026-11-03"), "2026-11");
});

test("valorDoMes (fonte por cliente): mês sem acerto usa o valor do mês; acertado fica congelado", () => {
  const valores: Record<string, number> = { "2026-09": 800, "2026-10": 600 };
  const fonte = { ...unica, valorDoMes: (m: string) => valores[m] };
  const c = cobrancasDaFonte(fonte, [reg({ mes: "2026-09", recebido: true, isento: false, valor_recebido: 1000, valor_devido: 1000 })], "2026-10-02");
  assert.equal(c.find((x) => x.mes === "2026-09")!.valor, 1000);
  assert.equal(c.find((x) => x.mes === "2026-10")!.valor, 600);
  // sem a função, vale valor_mensal em todos os meses
  assert.equal(cobrancasDaFonte(unica, [], "2026-10-02")[1].valor, 1000);
});

test("mesesCobrados: contrato encerrado para no último mês cobrado; encerramento futuro não corta", () => {
  assert.deepEqual(mesesCobrados("2026-08-01", "2026-11-05", "2026-10-01"), ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(mesesCobrados("2026-08-01", "2026-09-05", "2026-12-01"), ["2026-08", "2026-09"]);
});
