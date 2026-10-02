process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import {
  corDaLinhaCrm,
  interpretarLinhaCrm,
  isoDeDataHora,
  lerData,
  lerDataHora,
  lerHora,
  lerInteiro,
  lerReais,
  linhaCrm,
  migrarLinhaAntiga,
  MOTIVO_MIGRACAO,
  motivoRemarcacaoDoTexto,
  motivosDaEtapa,
  type LinhaCrm,
} from "./planilhaCrm.ts";
import { COLUNAS_PADRAO } from "./crmColunas.ts";
import { leadBase, type ColunaCrm, type LeadCrm } from "./crmTipos.ts";
import { deSP } from "./crmFormato.ts";

const colunas = COLUNAS_PADRAO;
const col = (id: string): ColunaCrm => colunas.find((c) => c.id === id)!;
const agora = deSP(2026, 10, 1, 15, 0);
const lead = (over: Partial<LeadCrm> = {}) =>
  leadBase({ id: "L1", nome: "Daniel", coluna_id: "desenvolvendo", created_at: deSP(2026, 9, 10, 10, 0).toISOString(), ...over });
const comEdicao = (l: LeadCrm, mudancas: LinhaCrm, origem = null, pendencia = null) => ({
  ...linhaCrm(l, colunas, origem, pendencia),
  ...mudancas,
});

test("leitura de data, hora, data e hora, reais e inteiro", () => {
  assert.deepEqual(lerData("05/10/2026"), { ano: 2026, mes: 10, dia: 5 });
  assert.deepEqual(lerData("5/10/26"), { ano: 2026, mes: 10, dia: 5 });
  assert.equal(lerData("32/10/2026"), null);
  assert.deepEqual(lerHora("10:30"), { hora: 10, minuto: 30 });
  assert.deepEqual(lerHora("10:30:00"), { hora: 10, minuto: 30 });
  assert.deepEqual(lerHora("14h"), { hora: 14, minuto: 0 });
  assert.deepEqual(lerHora("9h15"), { hora: 9, minuto: 15 });
  assert.equal(lerHora("25:00"), null);
  assert.equal(isoDeDataHora("05/10/2026", "10:30"), deSP(2026, 10, 5, 10, 30).toISOString());
  assert.equal(lerDataHora("05/10/2026 14:00"), deSP(2026, 10, 5, 14, 0).toISOString());
  assert.equal(lerDataHora("05/10/2026"), deSP(2026, 10, 5, 10, 0).toISOString());
  assert.equal(lerDataHora("amanhã"), null);
  assert.equal(lerReais("R$ 1.500,00"), 1500);
  assert.equal(lerReais("1500"), 1500);
  assert.equal(lerReais("1.500"), 1500);
  assert.equal(lerReais("2500,5"), 2500.5);
  assert.equal(lerReais(""), null);
  assert.equal(lerReais("mil reais"), undefined);
  assert.equal(lerInteiro("3"), 3);
  assert.equal(lerInteiro(""), null);
  assert.equal(lerInteiro("três"), undefined);
});

test("linha da aba CRM: campos, origem, reunião, valores e etapa", () => {
  const l = lead({
    email: "d@x.com", empresa: "Loja", telefone: "5521999990000", trafego: "pago",
    reuniao_em: deSP(2026, 10, 3, 10, 0).toISOString(), reuniao_duracao_min: 45, evento_google_id: "ev1",
    evento_status: "ok", evento_meet_link: "https://meet.google.com/abc", valor_proposta: 2500, coluna_id: "reuniao_marcada",
    coluna_desde: deSP(2026, 10, 1, 9, 5).toISOString(), follow_up: 2,
  });
  const linha = linhaCrm(l, colunas, { abaNome: "Generalista", faturamentoTexto: "De R$50 mil a R$100 mil por mês" }, null);
  assert.equal(linha["Lead"], "Daniel");
  assert.equal(linha["Aba de origem"], "Generalista");
  assert.equal(linha["Etapa"], "Reunião marcada");
  assert.equal(linha["Na etapa desde"], "01/10/2026 09:05");
  assert.equal(linha["Tentativas"], "2");
  assert.equal(linha["Reunião (data)"], "03/10/2026");
  assert.equal(linha["Reunião (hora)"], "10:00");
  assert.equal(linha["Duração (min)"], "45");
  assert.equal(linha["Situação"], "Evento criado");
  assert.equal(linha["Valor da proposta"].replace(/\s/g, " "), "R$ 2.500,00");
  assert.equal(linha["Valor fechado"], "");
  assert.equal(linha["Orgânico/Pago"], "Pago");
  assert.equal(linha["Faturamento"], "De R$50 mil a R$100 mil por mês");
  assert.equal(linha["Entrou no CRM"], "10/09/2026");
  assert.equal(linha["ID (sistema)"], "L1");
  const semOrigem = linhaCrm(lead({ faturamento_faixa: "50k_100k" }), colunas, null, null);
  assert.equal(semOrigem["Aba de origem"], "Sistema");
  assert.equal(semOrigem["Faturamento"], "R$ 50 a 100 mil");
  assert.equal(semOrigem["Reunião (data)"], "");
});

test("linha com pendência mostra a etapa escolhida e o que falta", () => {
  const linha = linhaCrm(lead(), colunas, null, { etapa_id: "reuniao_marcada", falta: "data e hora da reunião" });
  assert.equal(linha["Etapa"], "Reunião marcada");
  assert.equal(linha["Situação"], "Falta preencher: data e hora da reunião; no sistema o lead continua em Desenvolvendo conversa");
});

test("motivos e cores por etapa", () => {
  assert.deepEqual(motivosDaEtapa(col("remarcar")), ["Não compareceu (no-show)", "Não confirmou", "Pediu para remarcar"]);
  assert.equal(motivosDaEtapa(col("perdido")).includes("Achou caro"), true);
  assert.deepEqual(motivosDaEtapa(col("respondeu")), []);
  assert.equal(motivoRemarcacaoDoTexto("Não compareceu (no-show)"), "no_show");
  assert.equal(motivoRemarcacaoDoTexto("nao confirmou"), "nao_confirmou");
  assert.equal(motivoRemarcacaoDoTexto("Pediu para remarcar"), "pediu_remarcar");
  assert.equal(motivoRemarcacaoDoTexto("outra coisa"), null);
  assert.equal(corDaLinhaCrm("ganho", false)?.fundo, "#d9ead3");
  assert.equal(corDaLinhaCrm("perdido", false)?.fundo, "#f4cccc");
  assert.equal(corDaLinhaCrm("reuniao", false)?.fundo, "#fff2cc");
  assert.equal(corDaLinhaCrm("padrao", true)?.fundo, "#fce5cd");
  assert.equal(corDaLinhaCrm("padrao", false), null);
});

test("campos simples: e-mail válido grava com evento; inválido volta com aviso", () => {
  const l = lead();
  const ok = interpretarLinhaCrm(l, colunas, comEdicao(l, { "E-mail": "novo@x.com", "Observações": "liga às 10h" }), null, null, agora);
  assert.equal(ok.patch.email, "novo@x.com");
  assert.equal(ok.patch.observacoes, "liga às 10h");
  assert.equal(ok.eventos[0].tipo, "edicao");
  assert.equal(ok.eventos[0].descricao, "Editado: Observações, E-mail");
  const ruim = interpretarLinhaCrm(l, colunas, comEdicao(l, { "E-mail": "sem-arroba" }), null, null, agora);
  assert.equal(ruim.patch.email, undefined);
  assert.deepEqual(ruim.reverter, ["E-mail"]);
  assert.deepEqual(ruim.avisos, ["E-mail inválido."]);
});

test("coluna que só o sistema preenche volta ao valor do sistema", () => {
  const l = lead();
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Link do Meet": "https://meet.google.com/x" }), null, null, agora);
  assert.deepEqual(r.reverter, ["Link do Meet"]);
  assert.deepEqual(r.patch, {});
});

test("etapa que exige dado sem o dado vira pendência", () => {
  const l = lead();
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Etapa": "Reunião marcada" }), null, null, agora);
  assert.deepEqual(r.pendencia, { etapa_id: "reuniao_marcada", falta: "data e hora da reunião" });
  assert.equal(r.patch.coluna_id, undefined);
  const perdido = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Etapa": "Lead perdido" }), null, null, agora);
  assert.deepEqual(perdido.pendencia, { etapa_id: "perdido", falta: "o motivo" });
  const ganho = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Etapa": "Fechamento" }), null, null, agora);
  assert.deepEqual(ganho.pendencia, { etapa_id: "fechamento", falta: "o valor fechado" });
});

test("reunião marcada com data e hora move e pede evento na agenda", () => {
  const l = lead();
  const r = interpretarLinhaCrm(
    l, colunas,
    comEdicao(l, { "Etapa": "Reunião marcada", "Reunião (data)": "03/10/2026", "Reunião (hora)": "14:30" }),
    null, null, agora,
  );
  assert.equal(r.patch.coluna_id, "reuniao_marcada");
  assert.equal(r.patch.reuniao_em, deSP(2026, 10, 3, 14, 30).toISOString());
  assert.equal(r.patch.reuniao_duracao_min, 30);
  assert.equal(r.agenda, "criar");
  assert.equal(r.pendencia, null);
});

test("pendência completada na edição seguinte apaga a pendência", () => {
  const l = lead();
  const pend = { etapa_id: "perdido", falta: "o motivo" };
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Motivo": "Achou caro" }, null, pend as never), null, pend, agora);
  assert.equal(r.patch.coluna_id, "perdido");
  assert.equal(r.patch.motivo_perda, "Achou caro");
  assert.equal(r.pendencia, "apagar");
});

test("voltar a etapa para a do sistema apaga a pendência", () => {
  const l = lead();
  const pend = { etapa_id: "perdido", falta: "o motivo" };
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Etapa": "Desenvolvendo conversa" }, null, pend as never), null, pend, agora);
  assert.equal(r.pendencia, "apagar");
  assert.deepEqual(r.patch, {});
});

test("remarcação: 'Pediu para remarcar' sem data nova fica pendente; com data nova move", () => {
  const em = deSP(2026, 10, 2, 10, 0).toISOString();
  const l = lead({ coluna_id: "reuniao_marcada", reuniao_em: em, evento_google_id: "ev1", evento_status: "ok" });
  const sem = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Etapa": "Remarcar reunião", "Motivo": "Pediu para remarcar" }), null, null, agora);
  assert.deepEqual(sem.pendencia, { etapa_id: "remarcar", falta: "a nova data e hora da reunião" });
  const com = interpretarLinhaCrm(
    l, colunas,
    comEdicao(l, { "Etapa": "Remarcar reunião", "Motivo": "Pediu para remarcar", "Reunião (data)": "06/10/2026" }),
    null, null, agora,
  );
  assert.equal(com.patch.coluna_id, "remarcar");
  assert.equal(com.patch.reuniao_em, deSP(2026, 10, 6, 10, 0).toISOString());
  assert.equal(com.patch.remarcacoes, 1);
  assert.equal(com.agenda, "mover");
});

test("reunião mudada sem trocar de etapa move o evento", () => {
  const l = lead({ coluna_id: "reuniao_marcada", reuniao_em: deSP(2026, 10, 2, 10, 0).toISOString(), evento_google_id: "ev1" });
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Reunião (hora)": "16:00" }), null, null, agora);
  assert.equal(r.patch.reuniao_em, deSP(2026, 10, 2, 16, 0).toISOString());
  assert.equal(r.agenda, "mover");
  const soData = interpretarLinhaCrm(lead(), colunas, comEdicao(lead(), { "Reunião (data)": "04/10/2026" }), null, null, agora);
  assert.deepEqual(soData.patch, {}, "só a data: espera a hora");
  assert.deepEqual(soData.reverter, []);
});

test("tentativas: sobem na etapa de follow-up; fora dela ou para baixo voltam", () => {
  const l = lead({ coluna_id: "follow_up", follow_up: 1 });
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Tentativas": "3" }), null, null, agora);
  assert.equal(r.patch.follow_up, 3);
  assert.equal(r.eventos.filter((e) => e.tipo === "tentativa").length, 2);
  const fora = interpretarLinhaCrm(lead(), colunas, comEdicao(lead(), { "Tentativas": "2" }), null, null, agora);
  assert.deepEqual(fora.reverter, ["Tentativas"]);
  const menos = interpretarLinhaCrm(l, colunas, comEdicao(l, { "Tentativas": "0" }), null, null, agora);
  assert.deepEqual(menos.reverter, ["Tentativas"]);
});

test("motivo só vale nas etapas que têm motivo", () => {
  const perdido = lead({ coluna_id: "perdido", motivo_perda: "Achou caro" });
  const r = interpretarLinhaCrm(perdido, colunas, comEdicao(perdido, { "Motivo": "Sem orçamento agora" }), null, null, agora);
  assert.equal(r.patch.motivo_perda, "Sem orçamento agora");
  const fora = interpretarLinhaCrm(lead(), colunas, comEdicao(lead(), { "Motivo": "Achou caro" }), null, null, agora);
  assert.deepEqual(fora.reverter, ["Motivo"]);
});

test("e-mail novo com reunião futura pede convite", () => {
  const l = lead({ coluna_id: "reuniao_marcada", reuniao_em: deSP(2026, 10, 5, 10, 0).toISOString(), evento_google_id: "ev1", email: "a@x.com" });
  const r = interpretarLinhaCrm(l, colunas, comEdicao(l, { "E-mail": "b@x.com" }), null, null, agora);
  assert.equal(r.agenda, "convidar");
  assert.equal(r.emailAntigo, "a@x.com");
});

test("faturamento editado fica para a edge function decidir", () => {
  const r = interpretarLinhaCrm(lead(), colunas, comEdicao(lead(), { "Faturamento": "R$ 10 a 30 mil" }), null, null, agora);
  assert.equal(r.faturamento, "R$ 10 a 30 mil");
});

test("migração do CRM antigo: etapa, datas, reunião passada e tentativas", () => {
  const base = { "Lead": "Daniel", "Empresa": "Loja", "Telefone": "5511999990000", "Data 1ª mensagem": "10/09/2026" };
  const primeiro = migrarLinhaAntiga(base, colunas, agora)!;
  assert.equal(primeiro.campos.coluna_id, "primeiro_contato");
  assert.equal(primeiro.campos.primeiro_contato_em, deSP(2026, 9, 10, 10, 0).toISOString());
  assert.equal(primeiro.campos.created_at, deSP(2026, 9, 10, 10, 0).toISOString());
  assert.equal(primeiro.eventos[0].descricao, "Importado do CRM antigo da planilha (Primeiro contato)");

  const perdido = migrarLinhaAntiga({ ...base, "Lead Perdido": "Sim" }, colunas, agora)!;
  assert.equal(perdido.campos.coluna_id, "perdido");
  assert.equal(perdido.campos.motivo_perda, MOTIVO_MIGRACAO);

  const reuniao = migrarLinhaAntiga(
    { ...base, "Lead respondeu": "Sim", "Desenvolvendo conversa": "Sim", "Reunião Agendada": "Sim", "Data da reunião": "11/09/2026", "Hora da reunião": "10:00" },
    colunas, agora,
  )!;
  assert.equal(reuniao.campos.coluna_id, "reuniao_marcada");
  assert.equal(reuniao.campos.reuniao_em, deSP(2026, 9, 11, 10, 0).toISOString());
  assert.equal(reuniao.campos.reuniao_marcada_em, agora.toISOString());
  assert.equal(reuniao.campos.evento_google_id, undefined);

  const fup = migrarLinhaAntiga({ ...base, "Follow Up 1": "Sim", "Data FUP 1": "12/09/2026" }, colunas, agora)!;
  assert.equal(fup.campos.coluna_id, "follow_up");
  assert.equal(fup.campos.follow_up, 1);
  assert.equal(fup.eventos[1].tipo, "tentativa");
  assert.equal(fup.eventos[1].em, deSP(2026, 9, 12, 10, 0).toISOString());

  const desenv = migrarLinhaAntiga({ ...base, "Desenvolvendo conversa": "Sim", "Reunião Agendada": "Não" }, colunas, agora)!;
  assert.equal(desenv.campos.coluna_id, "desenvolvendo");
  assert.equal(migrarLinhaAntiga({ "Lead": "", "Empresa": "" }, colunas, agora), null);
});
