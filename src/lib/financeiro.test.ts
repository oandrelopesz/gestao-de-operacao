import test from "node:test";
import assert from "node:assert/strict";
import {
  parcelasDaFonte, ehFracionado, vencimentoNoMes, statusDaParcela, situacaoDoMes, resumoDoMes,
  dividirEmParcelas, ajustarQuantidade, validarParcelas, textoDoValor, nomeDoMes, agruparHistorico, descreverDias, tipoDaFonte,
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
});

test("resumoDoMes: totais por parcela e contagem de fontes", () => {
  const r = resumoDoMes([
    { ...fracionada, recebimentos_mes: [receb(1)] },   // 1000 recebido, 1500 atrasado (dia 20)
    { ...unica, recebimentos_mes: [] },                 // 3500 pendente (dia 25, hoje 26)
    { valor_mensal: 700, dia_recebimento: 1, parcelas: null, recebimentos_mes: [] }, // atrasado
    { valor_mensal: 500, dia_recebimento: 5, parcelas: null, recebimentos_mes: [receb(1)] }, // recebido
  ], "2026-09-26");
  assert.deepEqual(r, {
    previsto: 7200,
    recebido: 1500,
    emAberto: 5700,
    atrasado: 2200, // 700 da fonte do dia 1 + 1500 da 2ª parcela (dia 20, 6 dias depois)
    fontes: 4,
    fontesRecebidas: 1,
    fontesEmAberto: 3,
    fontesAtrasadas: 2,
  });
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
