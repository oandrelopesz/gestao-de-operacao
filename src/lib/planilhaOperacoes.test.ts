process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { agruparFila, opCrm, opCrmMudancas, opLead, opLixeira } from "../../supabase/functions/planilha/operacoes.ts";
import { linhaCrm } from "./planilhaCrm.ts";
import { COLUNAS_PADRAO } from "./crmColunas.ts";
import { leadBase } from "./crmTipos.ts";

const colunas = COLUNAS_PADRAO;

test("fila: junta campos do mesmo registro, null vale a linha toda, exclusão vence", () => {
  const g = agruparFila([
    { id: 1, entidade: "crm", registro_id: "a", op: "upsert", campos: ["email"], dados: null },
    { id: 2, entidade: "crm", registro_id: "a", op: "upsert", campos: ["nome"], dados: null },
    { id: 3, entidade: "lead", registro_id: "b", op: "upsert", campos: ["Nome"], dados: null },
    { id: 4, entidade: "lead", registro_id: "b", op: "upsert", campos: null, dados: null },
    { id: 5, entidade: "lead", registro_id: "c", op: "upsert", campos: ["Nome"], dados: null },
    { id: 6, entidade: "lead", registro_id: "c", op: "delete", campos: null, dados: { aba_id: "9" } },
  ]);
  assert.deepEqual(g, [
    { entidade: "crm", id: "a", op: "upsert", campos: ["email", "nome"], dados: null },
    { entidade: "lead", id: "b", op: "upsert", campos: null, dados: null },
    { entidade: "lead", id: "c", op: "delete", campos: null, dados: { aba_id: "9" } },
  ]);
});

test("operação do CRM: só as colunas dos campos que mudaram; cor e motivos quando muda a etapa", () => {
  const lead = leadBase({ id: "L1", nome: "Ana", email: "a@x.com", coluna_id: "perdido", motivo_perda: "Achou caro" });
  const parcial = opCrm(lead, colunas, null, null, ["email"]);
  assert.deepEqual(parcial, { tipo: "linha", aba: "CRM", id: "L1", valores: { "E-mail": "a@x.com" }, completa: false });
  const etapa = opCrm(lead, colunas, null, null, ["coluna_id"]);
  assert.equal(etapa.tipo === "linha" && etapa.valores["Etapa"], "Lead perdido");
  assert.equal(etapa.tipo === "linha" && etapa.cor?.fundo, "#f4cccc");
  assert.equal(etapa.tipo === "linha" && etapa.motivos?.includes("Achou caro"), true);
  const toda = opCrm(lead, colunas, null, null);
  assert.equal(toda.tipo === "linha" && toda.completa, true);
  assert.equal(toda.tipo === "linha" && toda.valores["ID (sistema)"], "L1");
});

test("operação depois de uma edição: escreve o que mudou, o que volta e as colunas do sistema", () => {
  const antes = leadBase({ id: "L1", nome: "Ana", coluna_id: "desenvolvendo" });
  const depois = { ...antes, email: "novo@x.com" };
  const op = opCrmMudancas(linhaCrm(antes, colunas, null, null), depois, colunas, null, null, ["Tentativas"]);
  assert.equal(op.tipo, "linha");
  if (op.tipo !== "linha") return;
  assert.equal(op.valores["E-mail"], "novo@x.com");
  assert.equal(op.valores["Tentativas"], "0");
  assert.equal(op.valores["Situação"], "");
  assert.equal("Lead" in op.valores, false);
});

test("lixeira sem a coluna de ID; lead com campos pedidos ou linha toda", () => {
  const lix = opLixeira(leadBase({ id: "L1", nome: "Ana" }), colunas, { abaNome: "Generalista", faturamentoTexto: null });
  assert.equal(lix.tipo === "lixeira" && lix.valores["Aba de origem"], "Generalista");
  assert.equal(lix.tipo === "lixeira" && "ID (sistema)" in lix.valores, false);
  const b = { id: "b1", aba_id: "9", posicao: 3, dados: { "Nome": "Ana" }, lead_crm_id: null };
  assert.deepEqual(opLead(b, ["Nome", "Telefone"]), { tipo: "linha", aba: "9", id: "b1", valores: { "Nome": "Ana", "Telefone": "" } });
  assert.deepEqual(opLead(b, null), { tipo: "linha", aba: "9", id: "b1", valores: { "Nome": "Ana" }, completa: true });
});
