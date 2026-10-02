process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import {
  chavesDosTitulos,
  colunasVisiveis,
  dataIsoDoTexto,
  ehAbaDeLeads,
  ehValido,
  faixaDoFaturamento,
  filtrarBanco,
  FILTRO_BANCO_PADRAO,
  leadCrmDoBanco,
  linkDoTexto,
  linkInstagram,
  montarColunas,
  opcoesDeFiltro,
  papelDoTitulo,
  textoDeBusca,
  valorDoPapel,
  type AbaBanco,
  type LeadBanco,
} from "./bancoLeads.ts";

const TITULOS_GENERALISTA = [
  "Data de chegada", "#", "Nome", "Empresa", "Instagram", "Link Instagram", "Telefone", "Faturamento mensal",
  "Investimento", "Origem", "Lead válido", "Primeira mensagem enviada", "ID (sistema)",
];
const OCULTAS = new Set([1, 12]);
const aba: AbaBanco = {
  id: "737400116",
  nome: "Generalista",
  ordem: 6,
  colunas: montarColunas(TITULOS_GENERALISTA.map((titulo, indice) => ({ titulo, indice, oculta: OCULTAS.has(indice) }))),
};
const lead = (dados: Record<string, string>, extra: Partial<LeadBanco> = {}): LeadBanco => ({
  id: "l1", aba_id: aba.id, posicao: 2, dados, lead_crm_id: null, ...extra,
});

test("papel pelo título: sem acento, sem diferença de maiúsculas e espaços", () => {
  assert.equal(papelDoTitulo("Nome do cliente"), "nome");
  assert.equal(papelDoTitulo("  lead VALIDO "), "valido");
  assert.equal(papelDoTitulo("Região / Cidade"), "cidade");
  assert.equal(papelDoTitulo("Especialidade"), "nicho");
  assert.equal(papelDoTitulo("ID (sistema)"), "id");
  assert.equal(papelDoTitulo("Observações"), null);
});

test("chaves: título aparado, repetidos ganham sufixo, vazio vira null", () => {
  assert.deepEqual(chavesDosTitulos(["Nome", "", " Nome ", "Telefone", "Nome"]), ["Nome", null, "Nome (2)", "Telefone", "Nome (3)"]);
});

test("montarColunas: pula título vazio, papel repetido fica sem papel, guarda índice e oculta", () => {
  const cols = montarColunas([
    { titulo: "Nome", indice: 0, oculta: false },
    { titulo: "", indice: 1, oculta: false },
    { titulo: "Nome do cliente", indice: 2, oculta: true },
  ]);
  assert.deepEqual(cols, [
    { chave: "Nome", titulo: "Nome", indice: 0, oculta: false, papel: "nome" },
    { chave: "Nome do cliente", titulo: "Nome do cliente", indice: 2, oculta: true, papel: null },
  ]);
});

test("aba de leads: tem 'Primeira mensagem enviada' e não é aba reservada", () => {
  assert.equal(ehAbaDeLeads("Médicos", TITULOS_GENERALISTA), true);
  assert.equal(ehAbaDeLeads("CRM", TITULOS_GENERALISTA), false);
  assert.equal(ehAbaDeLeads("Sem Instagram", TITULOS_GENERALISTA), false);
  assert.equal(ehAbaDeLeads("Outra", ["Nome", "Telefone"]), false);
});

test("colunas visíveis: sem as ocultas e sem o ID, na ordem da planilha", () => {
  const titulos = colunasVisiveis(aba).map((c) => c.titulo);
  assert.equal(titulos.includes("#"), false);
  assert.equal(titulos.includes("ID (sistema)"), false);
  assert.equal(titulos[0], "Data de chegada");
  assert.equal(titulos[1], "Nome");
});

test("faturamento → faixa só quando os limites batem", () => {
  assert.equal(faixaDoFaturamento("De R$50 mil a R$100 mil por mês"), "50k_100k");
  assert.equal(faixaDoFaturamento("De R$10 mil a R$30 mil por mês"), "10k_30k");
  assert.equal(faixaDoFaturamento("Até R$10 mil por mês"), "ate_10k");
  assert.equal(faixaDoFaturamento("Acima de R$1 milhão"), "acima_1m");
  assert.equal(faixaDoFaturamento("De R$300 mil a R$1.000.000"), "300k_1m");
  assert.equal(faixaDoFaturamento("De R$100 mil a R$500 mil por mês"), null);
  assert.equal(faixaDoFaturamento("De €50 mil a €100 mil por mês"), null);
  assert.equal(faixaDoFaturamento(""), null);
  assert.equal(faixaDoFaturamento("Em branco"), null);
});

test("data da planilha → aaaa-mm-dd", () => {
  assert.equal(dataIsoDoTexto("01/07/2025"), "2025-07-01");
  assert.equal(dataIsoDoTexto("1/7/25"), "2025-07-01");
  assert.equal(dataIsoDoTexto("31/13/2025"), null);
  assert.equal(dataIsoDoTexto("ontem"), null);
});

test("lead do CRM a partir da linha", () => {
  const l = lead({
    "Data de chegada": "13/02/2025", "Nome": "Abreu", "Empresa": "Imperial store", "Instagram": "@imperialstorerj",
    "Telefone": "5521971093314", "Faturamento mensal": "De R$50 mil a R$100 mil por mês",
  });
  assert.deepEqual(leadCrmDoBanco(l, aba), {
    nome: "Abreu", empresa: "Imperial store", telefone: "5521971093314", instagram: "@imperialstorerj",
    cidade: null, nicho: null, site: null, faturamento_faixa: "50k_100k", trafego: "organico", data_lead: "2025-02-13",
  });
  const semNome = leadCrmDoBanco(lead({ "Empresa": "Loja X" }), aba);
  assert.equal(semNome.nome, "Loja X");
  assert.equal("data_lead" in semNome, false);
});

test("lead válido: vazio conta como Sim", () => {
  assert.equal(ehValido(lead({}), aba), true);
  assert.equal(ehValido(lead({ "Lead válido": "Não" }), aba), false);
  assert.equal(valorDoPapel(lead({ "Telefone": " 55 " }), aba, "telefone"), "55");
});

test("links", () => {
  assert.equal(linkInstagram("@dr.brunopassos"), "https://instagram.com/dr.brunopassos");
  assert.equal(linkInstagram("https://instagram.com/abc"), "https://instagram.com/abc");
  assert.equal(linkInstagram("Clínica derma Blu"), null);
  assert.equal(linkDoTexto("https://vinci.malta.com.br  |  LP: https://x.link/J"), "https://vinci.malta.com.br");
  assert.equal(linkDoTexto("otonorte.com.br"), "https://otonorte.com.br");
  assert.equal(linkDoTexto("sem site"), null);
});

test("filtros: válido, no CRM e valor exato de coluna", () => {
  const abas = new Map([[aba.id, aba]]);
  const a = lead({ "Nome": "A", "Origem": "Generalista 3" }, { id: "a" });
  const b = lead({ "Nome": "B", "Lead válido": "Não", "Origem": "Generalista 1" }, { id: "b" });
  const c = lead({ "Nome": "C", "Origem": "Generalista 3" }, { id: "c", lead_crm_id: "x" });
  const todos = [a, b, c];
  assert.equal(filtrarBanco(todos, abas, FILTRO_BANCO_PADRAO), todos);
  assert.deepEqual(filtrarBanco(todos, abas, { ...FILTRO_BANCO_PADRAO, valido: "nao" }).map((l) => l.id), ["b"]);
  assert.deepEqual(filtrarBanco(todos, abas, { ...FILTRO_BANCO_PADRAO, crm: "sim" }).map((l) => l.id), ["c"]);
  assert.deepEqual(
    filtrarBanco(todos, abas, { ...FILTRO_BANCO_PADRAO, colunas: { "Origem": "Generalista 3" } }).map((l) => l.id),
    ["a", "c"],
  );
});

test("opções de filtro: só colunas visíveis com 2 a 15 valores", () => {
  const visivel: AbaBanco = { ...aba, colunas: aba.colunas.map((c) => ({ ...c, oculta: false })) };
  const leads = [
    lead({ "Investimento": "Sim", "Origem": "G1" }),
    lead({ "Investimento": "Em branco", "Origem": "G1" }),
  ];
  const ops = opcoesDeFiltro(leads, visivel);
  assert.deepEqual(ops.map((o) => o.titulo), ["Investimento"]);
  assert.deepEqual(ops[0].valores, ["Em branco", "Sim"]);
});

test("texto de busca junta nome, empresa, telefone, Instagram e o resto", () => {
  const t = textoDeBusca(lead({ "Nome": "Abreu", "Empresa": "Imperial", "Origem": "G3" }), aba);
  assert.equal(t[0], "Abreu");
  assert.equal(t.includes("G3"), true);
});
