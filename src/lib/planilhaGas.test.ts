process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { chavesDosTitulos } from "./bancoLeads.ts";

// O Apps Script devolve os bytes do digest com sinal (-128..127)
const Utilities = {
  DigestAlgorithm: { MD5: "md5" },
  Charset: { UTF_8: "utf8" },
  computeDigest: (_alg: string, s: string) => [...createHash("md5").update(s, "utf8").digest()].map((b) => (b > 127 ? b - 256 : b)),
};
const gas: any = { Utilities, console };
vm.createContext(gas);
vm.runInContext(readFileSync("infra/planilha-crm/Codigo.gs", "utf8"), gas);

const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");
const US = String.fromCharCode(31);
const RS = String.fromCharCode(30);

test("md5 do script igual ao do Node (e ao md5 do Postgres)", () => {
  assert.equal(gas.md5_(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(gas.md5_("Árvore"), md5("Árvore"));
});

test("hash da linha: chaves em ordem de código, valores vazios fora (igual a planilha_canonico)", () => {
  const dados = { "Telefone": "55", "Nome": "Abreu", "Vazio": "", "Árvore": "x" };
  assert.equal(gas.canonico_(dados), `Nome${US}Abreu${RS}Telefone${US}55${RS}Árvore${US}x`);
  assert.equal(gas.hashLinha_(dados), md5(`Nome${US}Abreu${RS}Telefone${US}55${RS}Árvore${US}x`));
});

test("agregado da aba: id:hash:posicao em ordem de id, separado por vírgula", () => {
  const itens = [{ id: "b", hash: "h2", posicao: 3 }, { id: "a", hash: "h1", posicao: 2 }];
  assert.equal(gas.agregado_(itens), md5("a:h1:2,b:h2:3"));
  assert.equal(gas.agregado_([]), md5(""));
});

test("chaves das colunas iguais às do sistema", () => {
  const titulos = ["Nome", "", " Nome ", "Telefone", "Nome", "Lead válido"];
  assert.deepEqual([...gas.chavesDe_(titulos)], chavesDosTitulos(titulos));
});

test("etapa da aba CRM antiga (lixeira)", () => {
  assert.equal(gas.etapaAntiga_({ "Lead Perdido": "Sim" }), "Lead perdido");
  assert.equal(gas.etapaAntiga_({ "Reunião Agendada": "Sim", "Lead respondeu": "Sim" }), "Reunião marcada");
  assert.equal(gas.etapaAntiga_({ "Follow Up 2": "Sim" }), "Follow-up");
  assert.equal(gas.etapaAntiga_({}), "Primeiro contato");
});

test("valor para a célula: fórmula e sinal de mais viram texto; espaço especial vira espaço", () => {
  assert.equal(gas.valorParaCelula_("=1+1"), "'=1+1");
  assert.equal(gas.valorParaCelula_("+5561981387869"), "'+5561981387869");
  assert.equal(gas.valorParaCelula_(`R$${String.fromCharCode(160)}2.500,00`), "R$ 2.500,00");
  assert.equal(gas.valorParaCelula_(null), "");
});
