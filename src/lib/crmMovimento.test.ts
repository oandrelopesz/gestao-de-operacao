process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { planejarMovimento, planejarReuniao, validarMovimento } from "./crmMovimento.ts";
import { COLUNAS_PADRAO } from "./crmColunas.ts";
import { leadBase, type ColunaCrm } from "./crmTipos.ts";
import { deSP } from "./crmFormato.ts";

const col = (id: string): ColunaCrm => COLUNAS_PADRAO.find((c) => c.id === id)!;
const agora = deSP(2026, 9, 26, 15, 0);
const agoraIso = agora.toISOString();
const quinta13h = deSP(2026, 10, 1, 13, 0).toISOString();

test("movimento simples: coluna, data de entrada, evento e 1º contato (uma vez)", () => {
  const p = planejarMovimento(leadBase({ coluna_id: "novo_lead" }), col("novo_lead"), col("primeiro_contato"), {}, agora);
  assert.equal(p.patch.coluna_id, "primeiro_contato");
  assert.equal(p.patch.coluna_desde, agoraIso);
  assert.equal(p.patch.primeiro_contato_em, agoraIso);
  assert.equal(p.eventos[0].tipo, "mudanca_coluna");
  assert.equal(p.eventos[0].descricao, "Novo lead → Primeiro contato");
  assert.equal(p.agenda, null);
  const de = planejarMovimento(leadBase({ primeiro_contato_em: "2026-09-02T00:00:00.000Z" }), col("primeiro_contato"), col("respondeu"), {}, agora);
  assert.equal(de.patch.primeiro_contato_em, undefined);
});

test("ir direto para perdido não marca 1º contato", () => {
  const p = planejarMovimento(leadBase(), col("novo_lead"), col("perdido"), { motivo: "Contato inválido" }, agora);
  assert.equal(p.patch.primeiro_contato_em, undefined);
  assert.equal(p.patch.motivo_perda, "Contato inválido");
  assert.equal(p.patch.perdido_em, agoraIso);
});

test("entrar em follow-up conta a 1ª tentativa", () => {
  const p = planejarMovimento(leadBase(), col("primeiro_contato"), col("follow_up"), {}, agora);
  assert.equal(p.patch.follow_up, 1);
  assert.equal(p.eventos.filter((e) => e.tipo === "tentativa").length, 1);
});

test("validação por exigência", () => {
  const l = leadBase();
  assert.match(validarMovimento(l, col("reuniao_marcada"), {}) ?? "", /data e a hora/);
  assert.equal(validarMovimento(l, col("reuniao_marcada"), { reuniao: { em: quinta13h, duracaoMin: 30 } }), null);
  assert.match(validarMovimento(l, col("reuniao_marcada"), { reuniao: { em: quinta13h, duracaoMin: 30, email: "x@" } }) ?? "", /E-mail/);
  assert.match(validarMovimento(l, col("reuniao_confirmada"), {}) ?? "", /data e a hora/);
  assert.equal(validarMovimento(leadBase({ reuniao_em: quinta13h }), col("reuniao_confirmada"), {}), null);
  assert.match(validarMovimento(l, col("remarcar"), {}) ?? "", /aconteceu/);
  assert.match(validarMovimento(l, col("remarcar"), { remarcacao: { motivo: "pediu_remarcar" } }) ?? "", /nova data/);
  assert.equal(validarMovimento(l, col("remarcar"), { remarcacao: { motivo: "no_show" } }), null);
  assert.match(validarMovimento(l, col("fechamento"), { valorFechamento: 0 }) ?? "", /valor fechado/);
  assert.match(validarMovimento(l, col("perdido"), { motivo: " " }) ?? "", /motivo/);
  assert.equal(validarMovimento(l, col("proposta"), {}), null);
});

test("marcar reunião: campos, marcos, pontos e criar evento", () => {
  const lead = leadBase({ follow_up: 3, email: null });
  const p = planejarMovimento(lead, col("desenvolvendo"), col("reuniao_marcada"), { reuniao: { em: quinta13h, duracaoMin: 45, email: "ana@empresa.com" } }, agora);
  assert.equal(p.patch.reuniao_em, quinta13h);
  assert.equal(p.patch.reuniao_duracao_min, 45);
  assert.equal(p.patch.email, "ana@empresa.com");
  assert.equal(p.patch.reuniao_marcada_em, agoraIso);
  assert.equal(p.patch.primeira_reuniao_marcada_em, agoraIso);
  assert.equal(p.patch.follow_ups_ate_reuniao, 3);
  assert.deepEqual(p.patch.pontos_contato, { ref: quinta13h, marcada_em: agoraIso, feitos: {} });
  assert.equal(p.agenda, "criar");
  assert.ok(p.eventos.some((e) => e.tipo === "reuniao" && /marcada para 01\/10 às 13:00/.test(e.descricao)));
});

test("reunião já com evento: mesma data e e-mail novo → convidar; data nova → mover; marco não reescreve", () => {
  const lead = leadBase({ reuniao_em: quinta13h, reuniao_duracao_min: 30, evento_google_id: "ev1", primeira_reuniao_marcada_em: "2026-09-20T00:00:00.000Z", email: null });
  const conv = planejarReuniao(lead, { em: quinta13h, duracaoMin: 30, email: "b@c.com" }, agora);
  assert.equal(conv.agenda, "convidar");
  assert.equal(conv.patch.pontos_contato, undefined);
  const mov = planejarReuniao(lead, { em: deSP(2026, 10, 2, 16).toISOString(), duracaoMin: 30 }, agora);
  assert.equal(mov.agenda, "mover");
  assert.equal(mov.patch.primeira_reuniao_marcada_em, undefined);
  assert.ok(mov.eventos.some((e) => /movida para 02\/10 às 16:00/.test(e.descricao)));
  const nada = planejarReuniao(lead, { em: quinta13h, duracaoMin: 30 }, agora);
  assert.equal(nada.agenda, null);
  assert.equal(nada.eventos.length, 0);
});

test("remarcação: pediu para remarcar move o evento e conta a remarcação", () => {
  const lead = leadBase({ reuniao_em: quinta13h, evento_google_id: "ev1", primeira_reuniao_marcada_em: agoraIso });
  const nova = deSP(2026, 10, 5, 19, 30).toISOString();
  const p = planejarMovimento(lead, col("reuniao_marcada"), col("remarcar"), { remarcacao: { motivo: "pediu_remarcar", nova: { em: nova, duracaoMin: 30 } } }, agora);
  assert.equal(p.patch.remarcacoes, 1);
  assert.equal(p.patch.reuniao_em, nova);
  assert.equal(p.patch.motivo_remarcacao, "pediu_remarcar");
  assert.equal(p.agenda, "mover");
});

test("remarcação: no-show sem nova data tira a reunião e registra o resultado", () => {
  const lead = leadBase({ reuniao_em: quinta13h, evento_google_id: "ev1", reuniao_marcada_em: agoraIso, pontos_contato: { ref: quinta13h, marcada_em: agoraIso, feitos: { "1": agoraIso } } });
  const p = planejarMovimento(lead, col("reuniao_confirmada"), col("remarcar"), { remarcacao: { motivo: "no_show" } }, deSP(2026, 10, 1, 14));
  assert.equal(p.patch.no_shows, 1);
  assert.equal(p.patch.reuniao_em, null);
  assert.equal(p.agenda, null);
  const r = p.eventos.find((e) => e.tipo === "reuniao_resultado");
  assert.equal(r?.dados?.compareceu, false);
  assert.equal(r?.dados?.periodo, "inicio_tarde");
  assert.equal(r?.dados?.pontos_feitos, 1);
});

test("remarcação: não confirmou sem nova data mantém reunião e evento", () => {
  const lead = leadBase({ reuniao_em: quinta13h, evento_google_id: "ev1" });
  const p = planejarMovimento(lead, col("reuniao_marcada"), col("remarcar"), { remarcacao: { motivo: "nao_confirmou" } }, agora);
  assert.equal(p.patch.reuniao_em, undefined);
  assert.equal(p.patch.no_shows, undefined);
  assert.equal(p.agenda, null);
});

test("reunião realizada: comparecimento, marco e resultado", () => {
  const lead = leadBase({ reuniao_em: quinta13h, reuniao_marcada_em: agoraIso });
  const p = planejarMovimento(lead, col("reuniao_confirmada"), col("reuniao_realizada"), {}, deSP(2026, 10, 1, 14));
  assert.equal(p.patch.compareceu, true);
  assert.ok(p.patch.primeira_reuniao_realizada_em);
  assert.equal(p.eventos.find((e) => e.tipo === "reuniao_resultado")?.dados?.compareceu, true);
});

test("proposta e ganho", () => {
  const prop = planejarMovimento(leadBase(), col("reuniao_realizada"), col("proposta"), { valorProposta: 2500 }, agora);
  assert.equal(prop.patch.valor_proposta, 2500);
  assert.equal(prop.patch.proposta_enviada_em, agoraIso);
  const ganho = planejarMovimento(leadBase({ follow_up_proposta: 2 }), col("follow_up_proposta"), col("fechamento"), { valorFechamento: 3000 }, agora);
  assert.equal(ganho.patch.valor_fechamento, 3000);
  assert.equal(ganho.patch.fechado_em, agoraIso);
  assert.equal(ganho.patch.follow_ups_ate_fechamento, 2);
  assert.ok(ganho.eventos.some((e) => e.tipo === "ganho" && e.descricao === "Fechado: R$ 3.000,00"));
  const deNovo = planejarMovimento(leadBase({ fechado_em: "2026-09-01T00:00:00.000Z" }), col("proposta"), col("fechamento"), { valorFechamento: 10 }, agora);
  assert.equal(deNovo.patch.fechado_em, undefined);
});

test("perdido/desqualificado com reunião futura cancelam o evento; reunião passada não", () => {
  const futura = leadBase({ reuniao_em: quinta13h, evento_google_id: "ev1" });
  const p = planejarMovimento(futura, col("reuniao_marcada"), col("desqualificado"), { motivo: "Concorrente" }, agora);
  assert.equal(p.agenda, "cancelar");
  assert.equal(p.patch.reuniao_em, null);
  assert.equal(p.patch.motivo_desqualificacao, "Concorrente");
  assert.equal(p.patch.desqualificado_em, agoraIso);
  const passada = planejarMovimento(futura, col("reuniao_realizada"), col("perdido"), { motivo: "Achou caro" }, deSP(2026, 10, 3));
  assert.equal(passada.agenda, null);
  assert.equal(passada.patch.reuniao_em, undefined);
});
