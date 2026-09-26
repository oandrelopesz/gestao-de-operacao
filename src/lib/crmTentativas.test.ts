process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { entrarEmFollowUp, infoTentativas, proximoContatoApos, registrarTentativa, textoCongelado } from "./crmTentativas.ts";
import { COLUNAS_PADRAO } from "./crmColunas.ts";
import { leadBase, type ColunaCrm } from "./crmTipos.ts";
import { deSP } from "./crmFormato.ts";

const col = (id: string): ColunaCrm => COLUNAS_PADRAO.find((c) => c.id === id)!;
const agora = deSP(2026, 9, 26, 15, 0);

test("cadência: 1, 2, 2, 3, 3, 4 dias às 10h; depois da 6ª, nada", () => {
  assert.equal(proximoContatoApos(1, agora), deSP(2026, 9, 27, 10).toISOString());
  assert.equal(proximoContatoApos(6, agora), deSP(2026, 9, 30, 10).toISOString());
  assert.equal(proximoContatoApos(7, agora), null);
});

test("registrar a 1ª tentativa grava contador, próximo contato, 1º contato e evento", () => {
  const r = registrarTentativa(leadBase({ coluna_id: "follow_up" }), col("follow_up"), agora);
  assert.notEqual(typeof r, "string");
  if (typeof r === "string") return;
  assert.equal(r.patch.follow_up, 1);
  assert.equal(r.patch.proximo_contato_em, deSP(2026, 9, 27, 10).toISOString());
  assert.equal(r.patch.primeiro_contato_em, agora.toISOString());
  assert.equal(r.eventos[0].tipo, "tentativa");
  assert.equal(r.eventos[0].descricao, "1ª tentativa de follow-up");
});

test("no teto, recusa; teto próprio zera o próximo contato na última", () => {
  assert.equal(registrarTentativa(leadBase({ follow_up: 7 }), col("follow_up"), agora), "As 7 tentativas acabaram.");
  const curta: ColunaCrm = { ...col("follow_up"), config: { teto: 3 } };
  const r = registrarTentativa(leadBase({ follow_up: 2, primeiro_contato_em: "2026-09-01T00:00:00.000Z" }), curta, agora);
  if (typeof r === "string") throw new Error(r);
  assert.equal(r.patch.follow_up, 3);
  assert.equal(r.patch.proximo_contato_em, null);
  assert.equal(r.patch.primeiro_contato_em, undefined);
});

test("proposta usa o contador próprio; coluna comum recusa", () => {
  const r = registrarTentativa(leadBase({ follow_up: 5, follow_up_proposta: 1 }), col("follow_up_proposta"), agora);
  if (typeof r === "string") throw new Error(r);
  assert.equal(r.patch.follow_up_proposta, 2);
  assert.equal(r.patch.follow_up, undefined);
  assert.equal(r.eventos[0].descricao, "2ª tentativa de follow-up de proposta");
  assert.equal(registrarTentativa(leadBase(), col("respondeu"), agora), "Esta coluna não conta tentativas.");
});

test("entrar na coluna conta a 1ª só quando o contador está em zero", () => {
  const r = entrarEmFollowUp(leadBase(), col("follow_up"), agora);
  assert.equal(r?.patch.follow_up, 1);
  assert.match(r?.eventos[0].descricao ?? "", /ao entrar na coluna/);
  assert.equal(entrarEmFollowUp(leadBase({ follow_up: 2 }), col("follow_up"), agora), null);
  assert.equal(entrarEmFollowUp(leadBase(), col("respondeu"), agora), null);
});

test("info e texto congelado", () => {
  const info = infoTentativas(leadBase({ follow_up: 7 }), col("follow_up"));
  assert.deepEqual(info, { escopo: "prospeccao", feitas: 7, teto: 7, noLimite: true, rotuloBotao: "Limite atingido" });
  assert.equal(infoTentativas(leadBase({ follow_up: 2 }), col("follow_up"))?.rotuloBotao, "Registrar 3ª tentativa");
  assert.equal(infoTentativas(leadBase(), col("respondeu")), null);
  assert.equal(textoCongelado(leadBase({ follow_up: 3 }), "padrao"), "Respondeu na 3ª tentativa de follow-up");
  assert.equal(textoCongelado(leadBase({ follow_up: 5 }), "perdido"), "Parou na 5ª tentativa de follow-up");
  assert.equal(textoCongelado(leadBase({ follow_up: 3 }), "follow_up"), null);
  assert.equal(textoCongelado(leadBase(), "padrao"), null);
});
