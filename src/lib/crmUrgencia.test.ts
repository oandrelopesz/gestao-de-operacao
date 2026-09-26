process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { montarFila, urgenciaDoLead } from "./crmUrgencia.ts";
import { COLUNAS_PADRAO } from "./crmColunas.ts";
import { leadBase } from "./crmTipos.ts";
import { deSP } from "./crmFormato.ts";

const agora = deSP(2026, 9, 26, 15, 0);
const H = 3_600_000;

test("urgência do card", () => {
  const u = (over: Parameters<typeof leadBase>[0]) => urgenciaDoLead(leadBase(over), COLUNAS_PADRAO, agora);
  assert.equal(u({ coluna_id: "novo_lead", created_at: new Date(agora.getTime() - 25 * H).toISOString() }).tipo, "sem_contato");
  assert.equal(u({ coluna_id: "novo_lead", created_at: new Date(agora.getTime() - 2 * H).toISOString() }).tipo, "em_dia");
  assert.equal(u({ coluna_id: "respondeu", proximo_contato_em: new Date(agora.getTime() - H).toISOString() }).tipo, "contato_vencido");
  assert.equal(u({ coluna_id: "reuniao_marcada", reuniao_em: new Date(agora.getTime() + 5 * H).toISOString() }).tipo, "reuniao_proxima");
  assert.equal(u({ coluna_id: "perdido", proximo_contato_em: new Date(agora.getTime() - H).toISOString() }).tipo, "em_dia");
  assert.match(u({ coluna_id: "respondeu", proximo_contato_em: deSP(2026, 9, 26, 10).toISOString() }).texto, /26\/09 às 10:00/);
});

test("fila do dia: cada lead num bloco só, na prioridade", () => {
  const leads = [
    leadBase({ id: "atrasado", coluna_id: "respondeu", proximo_contato_em: deSP(2026, 9, 25, 10).toISOString() }),
    leadBase({ id: "novo", coluna_id: "novo_lead", created_at: deSP(2026, 9, 26, 9).toISOString() }),
    leadBase({ id: "hoje", coluna_id: "follow_up", follow_up: 2, proximo_contato_em: deSP(2026, 9, 26, 18).toISOString() }),
    leadBase({ id: "reuniao_hoje", coluna_id: "reuniao_confirmada", reuniao_em: deSP(2026, 9, 26, 19).toISOString(), reuniao_marcada_em: deSP(2026, 9, 26, 14, 50).toISOString() }),
    leadBase({ id: "amanha", coluna_id: "reuniao_marcada", reuniao_em: deSP(2026, 9, 27, 10).toISOString(), reuniao_marcada_em: deSP(2026, 9, 20).toISOString() }),
    leadBase({ id: "ganho", coluna_id: "fechamento", proximo_contato_em: deSP(2026, 9, 20).toISOString() }),
  ];
  const fila = montarFila(leads, COLUNAS_PADRAO, agora);
  const onde = Object.fromEntries(fila.flatMap((g) => g.itens.map((i) => [i.lead.id, g.bloco])));
  assert.equal(onde.atrasado, "atrasados");
  assert.equal(onde.novo, "novos");
  assert.equal(onde.hoje, "hoje");
  assert.equal(onde.reuniao_hoje, "reunioes_hoje");
  // Reunião amanhã 10h (manhã): o ponto 2 (D-1 10:00) está atrasado → vai para "pontos atrasados"
  assert.equal(onde.amanha, "pontos_atrasados");
  assert.equal(onde.ganho, undefined);
  assert.deepEqual(fila.map((g) => g.bloco), ["atrasados", "pontos_atrasados", "novos", "hoje", "reunioes_hoje", "reunioes_amanha"]);
});
