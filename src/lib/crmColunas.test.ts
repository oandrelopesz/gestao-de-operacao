import test from "node:test";
import assert from "node:assert/strict";
import {
  COLUNAS_PADRAO, TIPOS_COLUNA, colunaInicial, emMassa, emailValido, exigenciaDe, motivosDa, MOTIVOS_PERDA_PADRAO,
  ordenarColunas, tetoDa, validarColunas, rotuloFaixa, FAIXAS_FATURAMENTO,
} from "./crmColunas.ts";
import type { ColunaCrm } from "./crmTipos.ts";

test("colunas padrão: 14, ordem 0..13, ids únicos e válidas", () => {
  assert.equal(COLUNAS_PADRAO.length, 14);
  assert.deepEqual(COLUNAS_PADRAO.map((c) => c.ordem), [...Array(14).keys()]);
  assert.equal(new Set(COLUNAS_PADRAO.map((c) => c.id)).size, 14);
  assert.equal(validarColunas(COLUNAS_PADRAO), null);
  assert.equal(TIPOS_COLUNA.length, 11);
});

test("exigenciaDe por tipo", () => {
  const sem = { reuniao_em: null };
  const com = { reuniao_em: "2026-10-01T12:00:00.000Z" };
  assert.equal(exigenciaDe("reuniao", com), "reuniao");
  assert.equal(exigenciaDe("confirmacao", sem), "reuniao");
  assert.equal(exigenciaDe("confirmacao", com), "nenhuma");
  assert.equal(exigenciaDe("remarcacao", com), "remarcacao");
  assert.equal(exigenciaDe("proposta", sem), "proposta");
  assert.equal(exigenciaDe("ganho", sem), "ganho");
  assert.equal(exigenciaDe("perdido", sem), "motivo");
  assert.equal(exigenciaDe("desqualificado", sem), "motivo");
  assert.equal(exigenciaDe("padrao", sem), "nenhuma");
  assert.equal(exigenciaDe("follow_up", sem), "nenhuma");
  assert.equal(exigenciaDe("realizada", sem), "nenhuma");
});

test("emMassa: sim, motivo ou não", () => {
  assert.equal(emMassa("padrao"), "sim");
  assert.equal(emMassa("follow_up"), "sim");
  assert.equal(emMassa("proposta"), "sim");
  assert.equal(emMassa("realizada"), "sim");
  assert.equal(emMassa("perdido"), "motivo");
  assert.equal(emMassa("desqualificado"), "motivo");
  for (const t of ["reuniao", "confirmacao", "remarcacao", "ganho"] as const) assert.equal(emMassa(t), "nao");
});

test("tetoDa e motivosDa", () => {
  const c = (tipo: ColunaCrm["tipo"], config: ColunaCrm["config"] = {}): ColunaCrm => ({ id: "x", titulo: "X", hex: "#000000", ordem: 0, tipo, config });
  assert.equal(tetoDa(c("follow_up")), 7);
  assert.equal(tetoDa(c("follow_up", { teto: 12 })), 12);
  assert.equal(tetoDa(c("follow_up", { teto: 0 })), 7);
  assert.deepEqual(motivosDa(c("perdido")), MOTIVOS_PERDA_PADRAO);
  assert.deepEqual(motivosDa(c("perdido", { motivos: [" Preço ", ""] })), ["Preço"]);
  assert.deepEqual(motivosDa(c("padrao")), []);
});

test("ordenarColunas e colunaInicial", () => {
  const embaralhadas = [...COLUNAS_PADRAO].reverse();
  assert.equal(ordenarColunas(embaralhadas)[0].id, "novo_lead");
  assert.equal(colunaInicial(embaralhadas)?.id, "novo_lead");
  assert.equal(colunaInicial([]), null);
});

test("validarColunas aponta o problema", () => {
  const base = COLUNAS_PADRAO[0];
  assert.match(validarColunas([]) ?? "", /ao menos uma/);
  assert.match(validarColunas([{ ...base, titulo: "  " }]) ?? "", /nome/);
  assert.match(validarColunas([{ ...base, hex: "azul" }]) ?? "", /Cor/);
  assert.match(validarColunas([{ ...base, tipo: "xyz" as never }]) ?? "", /Tipo/);
});

test("emailValido e rotuloFaixa", () => {
  assert.equal(emailValido("ana@empresa.com.br"), true);
  assert.equal(emailValido("ana@empresa"), false);
  assert.equal(emailValido(""), false);
  assert.equal(rotuloFaixa(FAIXAS_FATURAMENTO, "10k_30k"), "R$ 10 a 30 mil");
  assert.equal(rotuloFaixa(FAIXAS_FATURAMENTO, null), "Não informado");
});
