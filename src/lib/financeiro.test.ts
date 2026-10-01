import test from "node:test";
import assert from "node:assert/strict";
import {
  parcelasDaFonte, ehFracionado, vencimentoNoMes, statusDaParcela, situacaoDoMes, parcelasParaAvisar, mudouAsParcelas, valorDevidoDoRegistro,
  dividirEmParcelas, ajustarQuantidade, ordenarParcelas, validarParcelas, textoDoValor, nomeDoMes, agruparHistorico, descreverDias, tipoDaFonte,
} from "./financeiro.ts";
import type { RecebimentoMes } from "./financeiro.ts";

const unica = { valor_mensal: 3500, dia_recebimento: 25, parcelas: null, recebimentos_mes: [] };
const fracionada = {
  valor_mensal: 2500,
  dia_recebimento: 5,
  parcelas: [{ dia: 20, valor: 1500 }, { dia: 5, valor: 1000 }],
  recebimentos_mes: [] as RecebimentoMes[],
};
const receb = (parcela: number, recebido = true, valor_recebido: number | null = null): RecebimentoMes => ({
  id: `r${parcela}`, parcela, recebido, data_confirmacao: recebido ? "2026-09-05T13:00:00Z" : null, valor_recebido,
});

test("parcelasDaFonte: pagamento único vira uma parcela com o valor e o dia da fonte", () => {
  assert.deepEqual(parcelasDaFonte(unica), [{ dia: 25, valor: 3500 }]);
  assert.equal(ehFracionado(unica), false);
});

test("parcelasDaFonte: fracionado devolve as parcelas em ordem de dia", () => {
  assert.deepEqual(parcelasDaFonte(fracionada), [{ dia: 5, valor: 1000 }, { dia: 20, valor: 1500 }]);
  assert.equal(ehFracionado(fracionada), true);
});

test("parcelasDaFonte: lista com uma parcela só (ou vazia) conta como pagamento único", () => {
  assert.deepEqual(parcelasDaFonte({ ...unica, parcelas: [] }), [{ dia: 25, valor: 3500 }]);
  assert.equal(ehFracionado({ ...unica, parcelas: [{ dia: 3, valor: 10 }] }), false);
});

test("vencimentoNoMes: dia que o mês não tem cai no último dia do mês", () => {
  assert.equal(vencimentoNoMes(31, "2026-09-10"), "2026-09-30");
  assert.equal(vencimentoNoMes(30, "2026-02-01"), "2026-02-28");
  assert.equal(vencimentoNoMes(29, "2028-02-15"), "2028-02-29");
  assert.equal(vencimentoNoMes(5, "2026-09-25"), "2026-09-05");
});

test("statusDaParcela: a vencer, pendente até 5 dias depois, atrasado depois disso", () => {
  assert.equal(statusDaParcela("2026-09-20", false, "2026-09-19"), "a_vencer");
  assert.equal(statusDaParcela("2026-09-20", false, "2026-09-20"), "pendente");
  assert.equal(statusDaParcela("2026-09-20", false, "2026-09-25"), "pendente");
  assert.equal(statusDaParcela("2026-09-20", false, "2026-09-26"), "atrasado");
  assert.equal(statusDaParcela("2026-09-20", true, "2026-09-30"), "recebido");
  // virada de mês na conta dos 5 dias
  assert.equal(statusDaParcela("2026-09-28", false, "2026-10-03"), "pendente");
  assert.equal(statusDaParcela("2026-09-28", false, "2026-10-04"), "atrasado");
});

test("situacaoDoMes: cada parcela com a sua situação; a fonte só fica recebida com todas pagas", () => {
  const s = situacaoDoMes({ ...fracionada, recebimentos_mes: [receb(1)] }, "2026-09-12");
  assert.deepEqual(s.parcelas.map((p) => [p.numero, p.total, p.dia, p.valor, p.status, p.recebimento?.id ?? null]), [
    [1, 2, 5, 1000, "recebido", "r1"],
    [2, 2, 20, 1500, "a_vencer", null],
  ]);
  assert.equal(s.status, "a_vencer");
  assert.equal(s.recebidas, 1);
  assert.equal(s.fracionado, true);
  assert.equal(s.valorRecebido, 1000);
  assert.equal(s.valorEmAberto, 1500);
  assert.equal(s.valorAtrasado, 0);

  const todas = situacaoDoMes({ ...fracionada, recebimentos_mes: [receb(2), receb(1)] }, "2026-09-12");
  assert.equal(todas.status, "recebido");
  assert.equal(todas.recebidas, 2);
});

test("situacaoDoMes: parcela atrasada deixa a fonte atrasada, mesmo com outra pendente", () => {
  const s = situacaoDoMes({
    valor_mensal: 3000, dia_recebimento: 1,
    parcelas: [{ dia: 1, valor: 1000 }, { dia: 10, valor: 1000 }, { dia: 20, valor: 1000 }],
    recebimentos_mes: [receb(2, false)],
  }, "2026-09-12");
  assert.deepEqual(s.parcelas.map((p) => p.status), ["atrasado", "pendente", "a_vencer"]);
  assert.equal(s.status, "atrasado");
  assert.equal(s.valorAtrasado, 1000);
  assert.equal(s.valorEmAberto, 3000);
});

test("situacaoDoMes: pendente vence a_vencer; valor recebido informado prevalece sobre o previsto", () => {
  const s = situacaoDoMes({ ...unica, recebimentos_mes: [] }, "2026-09-26");
  assert.equal(s.status, "pendente");
  // valor informado acima do previsto quita e prevalece (abaixo do previsto seria parcial: teste da parcial mais adiante)
  const r = situacaoDoMes({ ...unica, recebimentos_mes: [receb(1, true, 3600)] }, "2026-09-26");
  assert.equal(r.status, "recebido");
  assert.equal(r.valorRecebido, 3600);
  assert.equal(r.valorEmAberto, 0);
});

test("situacaoDoMes: recebimento de parcela que não existe mais (fonte editada) é ignorado", () => {
  const s = situacaoDoMes({ ...unica, recebimentos_mes: [receb(2)] }, "2026-09-10");
  assert.equal(s.recebidas, 0);
  assert.equal(s.valorRecebido, 0);
  assert.equal(s.parcelas[0].recebimento, null);
});

test("situacaoDoMes: parcela isenta fica isenta e sai do em aberto; parcial continua em aberto pelo resto", () => {
  const isenta = situacaoDoMes({ ...unica, recebimentos_mes: [{ id: "1", parcela: 1, recebido: false, isento: true, data_confirmacao: null, valor_recebido: null }] }, "2026-09-30");
  assert.equal(isenta.status, "isento");
  assert.equal(isenta.valorEmAberto, 0);
  // unica vence no dia 25 e tem 5 dias de tolerância: em 31/10 (depois de 30/10) a parcela já está atrasada
  const parcial = situacaoDoMes({ ...unica, recebimentos_mes: [{ id: "1", parcela: 1, recebido: true, data_confirmacao: null, valor_recebido: 1000, valor_devido: 3500 }] }, "2026-10-31");
  assert.equal(parcial.status, "atrasado");
  assert.equal(parcial.valorEmAberto, 2500);
  assert.equal(parcial.valorRecebido, 1000);
  // o sino avisa o que ainda falta (não o valor cheio)
  assert.equal(parcial.parcelas[0].falta, 2500);
});

test("situacaoDoMes: pagamento a mais quita sem deixar o em aberto negativo nem cobrir outra parcela", () => {
  const s = situacaoDoMes({ ...fracionada, recebimentos_mes: [{ ...receb(1, true, 1200), valor_devido: 1000 }] }, "2026-09-12");
  assert.deepEqual(s.parcelas.map((p) => [p.status, p.devido, p.pago, p.falta]), [
    ["recebido", 1000, 1000, 0],
    ["a_vencer", 1500, 0, 1500],
  ]);
  assert.equal(s.valorRecebido, 1200);
  assert.equal(s.valorEmAberto, 1500);
});

test("situacaoDoMes: valor_devido congelado vence o valor atual; parcial mostra o que falta; somas em centavos", () => {
  const congelada = situacaoDoMes({ ...unica, recebimentos_mes: [{ ...receb(1, true, 3000), valor_devido: 3000 }] }, "2026-10-31");
  assert.equal(congelada.status, "recebido");
  assert.equal(congelada.valorEmAberto, 0);
  const parcial = situacaoDoMes({ ...unica, recebimentos_mes: [{ ...receb(1, true, 1000), valor_devido: 3500 }] }, "2026-10-31");
  assert.deepEqual(parcial.parcelas.map((p) => [p.devido, p.pago, p.falta]), [[3500, 1000, 2500]]);
  const centavos = situacaoDoMes({ valor_mensal: 0.3, dia_recebimento: 1, parcelas: [{ dia: 1, valor: 0.1 }, { dia: 2, valor: 0.2 }], recebimentos_mes: [] }, "2026-09-30");
  assert.equal(centavos.valorEmAberto, 0.3);
  assert.equal(centavos.valorAtrasado, 0.3);
});

test("valorDevidoDoRegistro e situacaoDoMes: recebido antigo sem valor_devido fica congelado no que foi recebido", () => {
  assert.equal(valorDevidoDoRegistro(null), null);
  assert.equal(valorDevidoDoRegistro({ recebido: true, valor_recebido: 3400, valor_devido: 3000 }), 3000);
  assert.equal(valorDevidoDoRegistro({ recebido: true, isento: false, valor_recebido: 3400, valor_devido: null }), 3400);
  // não recebido, isento ou sem valor informado: nada congelado (vale o valor atual da fonte)
  assert.equal(valorDevidoDoRegistro({ recebido: false, valor_recebido: null, valor_devido: null }), null);
  assert.equal(valorDevidoDoRegistro({ recebido: true, isento: true, valor_recebido: 3400, valor_devido: null }), null);
  assert.equal(valorDevidoDoRegistro({ recebido: true, valor_recebido: null, valor_devido: null }), null);
  // a fonte subiu de 3400 para 3500 depois do mês ter sido recebido pela tela antiga: o mês continua recebido
  const s = situacaoDoMes({ ...unica, valor_mensal: 3500, recebimentos_mes: [receb(1, true, 3400)] }, "2026-09-30");
  assert.deepEqual(s.parcelas.map((p) => [p.status, p.devido, p.pago, p.falta]), [["recebido", 3400, 3400, 0]]);
});

test("situacaoDoMes: isenta com o pagamento cobrindo o devido é recebida, sem abono", () => {
  const s = situacaoDoMes({ ...unica, recebimentos_mes: [{ id: "1", parcela: 1, recebido: true, isento: true, data_confirmacao: null, valor_recebido: 3500, valor_devido: 3500 }] }, "2026-09-30");
  assert.deepEqual(s.parcelas.map((p) => [p.status, p.pago, p.falta, p.abonado]), [["recebido", 3500, 0, 0]]);
  assert.equal(s.status, "recebido");
});

test("parcelasParaAvisar: só pendente ou atrasada com algo a receber, de fonte já cobrada neste mês", () => {
  // dia 1 atrasada, dia 10 pendente (paga em parte), dia 20 a vencer
  const fonte = {
    valor_mensal: 3000, dia_recebimento: 1, cobranca_desde: "2026-09-01",
    parcelas: [{ dia: 1, valor: 1000 }, { dia: 10, valor: 1000 }, { dia: 20, valor: 1000 }],
    recebimentos_mes: [{ id: "r2", parcela: 2, recebido: true, data_confirmacao: null, valor_recebido: 400, valor_devido: 1000 }],
  };
  assert.deepEqual(parcelasParaAvisar(fonte, "2026-09-12").map((p) => [p.numero, p.status, p.falta]), [[1, "atrasado", 1000], [2, "pendente", 600]]);
  // "cobrar a partir de" no mês que vem: fora da cobrança, o sino não avisa
  assert.deepEqual(parcelasParaAvisar({ ...fonte, cobranca_desde: "2026-10-01" }, "2026-09-12"), []);
  // sem a data (cache antigo) ou a partir deste mês: avisa
  assert.equal(parcelasParaAvisar({ ...fonte, cobranca_desde: null }, "2026-09-12").length, 2);
  assert.equal(parcelasParaAvisar({ ...fonte, cobranca_desde: "2026-09-01" }, "2026-09-30").length, 3);
  // parcela de valor zero (nada a receber) não avisa
  assert.deepEqual(parcelasParaAvisar({ ...unica, valor_mensal: 0, dia_recebimento: 1, cobranca_desde: "2026-09-01" }, "2026-09-30"), []);
});

test("mudouAsParcelas: quantidade, dias ou valores (em centavos); ordem e forma não contam", () => {
  const antes = [{ dia: 5, valor: 1000 }, { dia: 20, valor: 1500 }];
  assert.equal(mudouAsParcelas(antes, [{ dia: 20, valor: 1500, forma: "pix" }, { dia: 5, valor: 1000.001 }]), false);
  assert.equal(mudouAsParcelas(antes, [{ dia: 5, valor: 1000 }, { dia: 21, valor: 1500 }]), true);
  assert.equal(mudouAsParcelas(antes, [{ dia: 5, valor: 1000 }, { dia: 20, valor: 1400 }]), true);
  assert.equal(mudouAsParcelas(antes, [{ dia: 5, valor: 2500 }]), true); // parcelado → único
  assert.equal(mudouAsParcelas([{ dia: 5, valor: 2500 }], [{ dia: 5, valor: 2500 }]), false);
  assert.equal(mudouAsParcelas([{ dia: 5, valor: 2500 }], [{ dia: Number.NaN, valor: 2500 }]), true);
});

test("dividirEmParcelas: divide o total em centavos (sobra na última) e espalha os dias", () => {
  assert.deepEqual(dividirEmParcelas(2500, 2, 5), [{ dia: 5, valor: 1250 }, { dia: 20, valor: 1250 }]);
  assert.deepEqual(dividirEmParcelas(1000, 3, 1).map((p) => p.valor), [333.33, 333.33, 333.34]);
  assert.deepEqual(dividirEmParcelas(1000, 3, 1).map((p) => p.dia), [1, 11, 21]);
  // dia que passa do fim do mês volta para o começo; resultado sai em ordem de dia
  assert.deepEqual(dividirEmParcelas(3000, 2, 25).map((p) => p.dia), [10, 25]);
  assert.deepEqual(dividirEmParcelas(0, 2, 10), [{ dia: 10, valor: 0 }, { dia: 25, valor: 0 }]);
});

test("dividirEmParcelas: dias nunca se repetem", () => {
  for (let dia = 1; dia <= 31; dia++) {
    for (let n = 2; n <= 6; n++) {
      const dias = dividirEmParcelas(100, n, dia).map((p) => p.dia);
      assert.equal(new Set(dias).size, n, `dia ${dia}, ${n} parcelas: ${dias}`);
      assert.ok(dias.every((d) => d >= 1 && d <= 31));
    }
  }
});

test("ajustarQuantidade: mantém o que já foi digitado e acrescenta ou tira parcelas no fim", () => {
  const base = [{ dia: 5, valor: 1000 }, { dia: 20, valor: 1500 }];
  const mais = ajustarQuantidade(base, 3);
  assert.deepEqual(mais.slice(0, 2), base);
  assert.equal(mais[2].valor, 0);
  assert.ok(!base.some((p) => p.dia === mais[2].dia));
  assert.deepEqual(ajustarQuantidade(mais, 2), base);
});

test("validarParcelas: quantidade, dia de 1 a 31, valor e dias diferentes", () => {
  assert.equal(validarParcelas([{ dia: 5, valor: 1000 }, { dia: 20, valor: 1500 }]), null);
  assert.match(validarParcelas([{ dia: 5, valor: 1000 }]) ?? "", /de 2 a 6/);
  assert.match(validarParcelas([{ dia: 0, valor: 10 }, { dia: 5, valor: 10 }]) ?? "", /Parcela 1.*1 a 31/);
  assert.match(validarParcelas([{ dia: 5, valor: 10 }, { dia: 32, valor: 10 }]) ?? "", /Parcela 2.*1 a 31/);
  assert.match(validarParcelas([{ dia: 5, valor: 10 }, { dia: 20, valor: 0 }]) ?? "", /Parcela 2.*valor/);
  assert.match(validarParcelas([{ dia: 5, valor: 10 }, { dia: 5, valor: 10 }]) ?? "", /dia 5/);
});

test("textoDoValor: valor em reais no formato da máscara (não em centavos)", () => {
  assert.equal(textoDoValor(3500), "3.500,00");
  assert.equal(textoDoValor(1500.5), "1.500,50");
  assert.equal(textoDoValor(0), "0,00");
});

test("nomeDoMes: usa o mês da data, sem voltar um mês pelo fuso", () => {
  assert.equal(nomeDoMes("2026-09-01"), "setembro de 2026");
  assert.equal(nomeDoMes("2026-01-01"), "janeiro de 2026");
});

test("descreverDias: texto curto dos dias das parcelas", () => {
  assert.equal(descreverDias([{ dia: 20, valor: 1 }, { dia: 5, valor: 1 }]), "dias 5 e 20");
  assert.equal(descreverDias([{ dia: 1, valor: 1 }, { dia: 10, valor: 1 }, { dia: 20, valor: 1 }]), "dias 1, 10 e 20");
});

test("agruparHistorico: um grupo por mês (mais recente primeiro), parcelas em ordem", () => {
  const g = agruparHistorico([
    { id: "a", mes_referencia: "2026-08-01", parcela: 1 },
    { id: "b", mes_referencia: "2026-09-01", parcela: 2 },
    { id: "c", mes_referencia: "2026-09-01", parcela: 1 },
    { id: "d", mes_referencia: "2026-05-02", parcela: 1 },
  ]);
  assert.deepEqual(g.map((m) => [m.mes, m.nome, m.itens.map((i) => i.id)]), [
    ["2026-09", "setembro de 2026", ["c", "b"]],
    ["2026-08", "agosto de 2026", ["a"]],
    ["2026-05", "maio de 2026", ["d"]],
  ]);
  assert.equal(agruparHistorico([{ id: "x", mes_referencia: "2026-09-01", parcela: 1 }, { id: "y", mes_referencia: "2026-08-01", parcela: 1 }], 1).length, 1);
});

test("tipoDaFonte: rótulo de cada tipo; tipo desconhecido cai em Pessoal", () => {
  assert.equal(tipoDaFonte("agencia").label, "Agência");
  assert.equal(tipoDaFonte("cliente_pessoal").label, "Pessoal");
  assert.equal(tipoDaFonte("freelancer").label, "Freelancer");
  assert.equal(tipoDaFonte("outro").label, "Pessoal");
  assert.notEqual(tipoDaFonte("freelancer").classe, tipoDaFonte("agencia").classe);
});

test("ordenarParcelas e ajustarQuantidade mantêm a forma de cada parcela; validarParcelas ignora a forma", () => {
  const base = [{ dia: 20, valor: 1500, forma: "boleto" }, { dia: 5, valor: 1000 }];
  assert.deepEqual(ordenarParcelas(base), [{ dia: 5, valor: 1000 }, { dia: 20, valor: 1500, forma: "boleto" }]);
  const mais = ajustarQuantidade(base, 3);
  assert.deepEqual(mais.slice(0, 2), base);
  assert.deepEqual(ajustarQuantidade(mais, 2), base);
  assert.equal(validarParcelas(base), null);
});
