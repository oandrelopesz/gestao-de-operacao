import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularFunil, calcularJornada, calcularNumeros, comparecimentoPor, contarMotivos, depoisDaReuniao, media, noShowRecuperacao,
  parados, porGrupo, chaveTrafego, previsao, tempoPorColuna, tentativasAteReuniao,
} from "./crmMetricas.ts";
import { COLUNAS_PADRAO } from "./crmColunas.ts";
import { leadBase, type EventoCrm } from "./crmTipos.ts";

const t = (dia: number, hora = 12) => new Date(Date.UTC(2026, 8, dia, hora)).toISOString();

test("media com amostra", () => {
  assert.deepEqual(media([]), { valor: null, n: 0 });
  assert.deepEqual(media([2, 4]), { valor: 3, n: 2 });
});

test("números do topo", () => {
  const leads = [
    leadBase({ id: "1", coluna_id: "fechamento", valor_fechamento: 3000, compareceu: true, primeira_reuniao_marcada_em: t(2), proposta_enviada_em: t(3) }),
    leadBase({ id: "2", coluna_id: "perdido", no_shows: 1, primeira_reuniao_marcada_em: t(2) }),
    leadBase({ id: "3", coluna_id: "desqualificado" }),
    leadBase({ id: "4", coluna_id: "fechamento", valor_fechamento: 1000, compareceu: true }),
  ];
  const n = calcularNumeros(leads, COLUNAS_PADRAO);
  assert.equal(n.leads, 4);
  assert.equal(n.reunioesMarcadas, 2);
  assert.equal(n.reunioesRealizadas, 2);
  assert.equal(n.comparecimento, 2 / 3);
  assert.equal(n.propostas, 1);
  assert.equal(n.fechamentos, 2);
  assert.equal(n.receita, 4000);
  assert.equal(n.ticketMedio, 2000);
  assert.equal(n.conversao, 2 / 3);
  assert.equal(n.desqualificados, 1);
});

test("jornada: intervalos em horas, negativos viram zero", () => {
  const leads = [
    leadBase({ created_at: t(1, 10), primeiro_contato_em: t(1, 12), primeira_reuniao_marcada_em: t(2, 12), follow_ups_ate_reuniao: 2 }),
    leadBase({ created_at: t(3, 10), primeiro_contato_em: t(3, 9) }),
  ];
  const j = calcularJornada(leads);
  assert.deepEqual(j.ateContato, { valor: 1, n: 2 });
  assert.deepEqual(j.contatoAteReuniao, { valor: 24, n: 1 });
  assert.deepEqual(j.followUpsAteReuniao, { valor: 2, n: 1 });
  assert.deepEqual(j.contatoAteFechamento, { valor: null, n: 0 });
});

test("funil acumulado e gargalo", () => {
  const leads = [
    leadBase({ primeiro_contato_em: t(1), primeira_reuniao_marcada_em: t(2), primeira_reuniao_realizada_em: t(3), proposta_enviada_em: t(4), fechado_em: t(5) }),
    leadBase({ primeiro_contato_em: t(1), primeira_reuniao_marcada_em: t(2) }),
    leadBase({ primeiro_contato_em: t(1) }),
    leadBase({ primeiro_contato_em: t(1) }),
  ];
  const f = calcularFunil(leads);
  assert.deepEqual(f.etapas.map((e) => e.qtd), [4, 4, 2, 1, 1, 1]);
  assert.equal(f.etapas[0].taxa, null);
  assert.equal(f.etapas[2].taxa, 0.5);
  assert.equal(f.gargalo, "marcadas");
});

test("tentativas até a reunião e quem está em follow-up", () => {
  const leads = [
    leadBase({ primeira_reuniao_marcada_em: t(2), follow_ups_ate_reuniao: 0 }),
    leadBase({ primeira_reuniao_marcada_em: t(2), follow_ups_ate_reuniao: 3 }),
    leadBase({ coluna_id: "follow_up", follow_up: 2 }),
  ];
  const r = tentativasAteReuniao(leads, COLUNAS_PADRAO);
  assert.equal(r.distribuicao.find((d) => d.n === 0)?.qtd, 1);
  assert.equal(r.distribuicao.find((d) => d.n === 3)?.qtd, 1);
  assert.deepEqual(r.mediaQuemPrecisou, { valor: 3, n: 1 });
  assert.deepEqual(r.emFollowUp, [{ n: 2, qtd: 1 }]);
});

test("por grupo (orgânico × pago) e motivos", () => {
  const leads = [
    leadBase({ trafego: "pago", coluna_id: "fechamento", valor_fechamento: 500 }),
    leadBase({ trafego: "pago", coluna_id: "perdido", motivo_perda: "Achou caro" }),
    leadBase({ trafego: "organico", coluna_id: "perdido", motivo_perda: "Achou caro" }),
  ];
  const g = porGrupo(leads, COLUNAS_PADRAO, chaveTrafego);
  assert.deepEqual(g[0], { grupo: "Pago", leads: 2, reunioes: 0, realizadas: 0, fechamentos: 1, receita: 500, conversao: 0.5, ticket: 500 });
  assert.deepEqual(contarMotivos(leads, COLUNAS_PADRAO, "perdido"), [{ motivo: "Achou caro", qtd: 2 }]);
});

test("no-show, recuperação e depois da reunião", () => {
  const leads = [
    leadBase({ no_shows: 1, remarcacoes: 1, compareceu: true, coluna_id: "fechamento", fechado_em: t(9), follow_ups_ate_fechamento: 0 }),
    leadBase({ no_shows: 1 }),
    leadBase({ compareceu: true, coluna_id: "fechamento", fechado_em: t(9), follow_ups_ate_fechamento: 2 }),
    leadBase({ compareceu: true, coluna_id: "perdido" }),
    leadBase({ compareceu: true, coluna_id: "proposta" }),
  ];
  assert.deepEqual(noShowRecuperacao(leads), { faltaram: 2, remarcaram: 1, compareceramDepois: 1, taxa: 0.5 });
  assert.deepEqual(depoisDaReuniao(leads, COLUNAS_PADRAO), { total: 4, naHora: 1, noFollowUp: 1, naoFechou: 1, emAndamento: 1 });
});

test("comparecimento por período e por pontos", () => {
  const ev = (compareceu: boolean, periodo: string, pontos: number): EventoCrm => ({
    id: String(Math.random()), lead_id: "x", tipo: "reuniao_resultado", descricao: "", created_at: t(1),
    dados: { compareceu, reuniao_em: t(1), periodo, dia_semana: 2, pontos_feitos: pontos, pontos_aplicaveis: 5 },
  });
  const eventos = [ev(true, "manha", 5), ev(false, "manha", 1), ev(true, "noite", 5)];
  assert.deepEqual(comparecimentoPor(eventos, "periodo"), [
    { grupo: "Manhã", realizadas: 1, faltas: 1, taxa: 0.5 },
    { grupo: "Noite", realizadas: 1, faltas: 0, taxa: 1 },
  ]);
  assert.deepEqual(comparecimentoPor(eventos, "pontos").map((l) => l.grupo), ["1 ponto", "5 pontos"]);
  assert.deepEqual(comparecimentoPor(eventos, "dia_semana").map((l) => l.grupo), ["terça"]);
});

test("tempo por coluna, previsão e parados", () => {
  const agora = new Date(t(10));
  const lead = leadBase({ id: "L", created_at: t(1), coluna_id: "respondeu", coluna_desde: t(3) });
  const eventos: EventoCrm[] = [
    { id: "1", lead_id: "L", tipo: "mudanca_coluna", descricao: "", created_at: t(2), dados: { de: "novo_lead", para: "primeiro_contato" } },
    { id: "2", lead_id: "L", tipo: "mudanca_coluna", descricao: "", created_at: t(3), dados: { de: "primeiro_contato", para: "respondeu" } },
  ];
  const tempos = tempoPorColuna([lead], eventos, COLUNAS_PADRAO, agora);
  assert.deepEqual(tempos.find((x) => x.colunaId === "novo_lead")?.media, { valor: 24, n: 1 });
  assert.deepEqual(tempos.find((x) => x.colunaId === "respondeu")?.media, { valor: 168, n: 1 });

  const p = previsao([
    leadBase({ coluna_id: "proposta" }),
    leadBase({ coluna_id: "fechamento", proposta_enviada_em: t(1), valor_fechamento: 2000 }),
    leadBase({ coluna_id: "perdido", proposta_enviada_em: t(1) }),
  ], COLUNAS_PADRAO);
  assert.deepEqual(p, { emProposta: 1, taxa: 0.5, ticket: 2000, valor: 1000, amostra: 2 });

  // 7 dias exatos ainda não é "mais de 7 dias": usa o dia seguinte
  const par = parados([lead, leadBase({ id: "G", coluna_id: "fechamento", coluna_desde: t(1) })], COLUNAS_PADRAO, new Date(t(11)));
  assert.equal(parados([lead], COLUNAS_PADRAO, agora).length, 0);
  assert.equal(par.length, 1);
  assert.equal(par[0].coluna.id, "respondeu");
  assert.deepEqual(par[0].leads.map((l) => l.id), ["L"]);
});
