import test from "node:test";
import assert from "node:assert/strict";
import { buscarAbas, distancia, normalizar, type ItemBusca } from "./buscaAbas.ts";

const ABAS: ItemBusca[] = [
  { to: "/", label: "Demandas", grupo: "Operação", palavras: ["tarefas"] },
  { to: "/agenda", label: "Agenda", grupo: "Operação", palavras: ["calendário", "reuniões"] },
  { to: "/acessos", label: "Planilha/CRM", grupo: "Operação", palavras: ["acessos", "senhas"] },
  { to: "/nps", label: "NPS de Clientes", grupo: "Operação" },
  { to: "/clientes", label: "Clientes Ativos", grupo: "Comercial" },
  { to: "/crm", label: "CRM", grupo: "Comercial", palavras: ["prospecção", "leads", "funil"] },
  { to: "/financeiro", label: "Financeiro", grupo: "Pessoal", palavras: ["faturamento", "receita"] },
  { to: "/transcritor", label: "Transcritor", grupo: "Ferramentas", palavras: ["transcrição", "áudio"] },
  { to: "/fireflies", label: "Fireflies", grupo: "Ferramentas", palavras: ["reuniões gravadas"] },
  { to: "/notas", label: "Notas", grupo: "Ferramentas", palavras: ["anotações"] },
  { to: "/arquivos", label: "Arquivos", grupo: "Ferramentas", palavras: ["pdf", "documentos"] },
];
const busca = (q: string) => buscarAbas(ABAS, q).map((a) => a.to);

test("normalizar tira acento, caixa e pontuação", () => {
  assert.equal(normalizar("  Prospecção / NPS!  "), "prospeccao nps");
});

test("distância com troca de letras vizinhas contando 1", () => {
  assert.equal(distancia("demandsa", "demandas"), 1);
  assert.equal(distancia("finaceiro", "financeiro"), 1);
  assert.equal(distancia("abc", "abc"), 0);
  assert.equal(distancia("", "abc"), 3);
});

test("acha pelo nome, pelo começo e sem acento", () => {
  assert.equal(busca("crm")[0], "/crm");
  assert.ok(busca("crm").includes("/acessos"));
  assert.equal(busca("fin")[0], "/financeiro");
  assert.equal(busca("transcricao")[0], "/transcritor");
  assert.equal(busca("CLIENTES")[0], "/clientes");
});

test("aceita erros de digitação", () => {
  assert.equal(busca("finaceiro")[0], "/financeiro");
  assert.equal(busca("trancritor")[0], "/transcritor");
  assert.equal(busca("agnda")[0], "/agenda");
  assert.equal(busca("demandsa")[0], "/");
  assert.equal(busca("arqivos")[0], "/arquivos");
});

test("acha por sinônimo e pelo grupo", () => {
  assert.equal(busca("prospecao")[0], "/crm");
  assert.equal(busca("faturamento")[0], "/financeiro");
  assert.equal(busca("pdf")[0], "/arquivos");
  assert.deepEqual(busca("ferramentas").sort(), ["/arquivos", "/fireflies", "/notas", "/transcritor"]);
});

test("várias palavras precisam todas bater", () => {
  assert.equal(busca("nps clientes")[0], "/nps");
  assert.deepEqual(busca("nps xyz"), []);
});

test("nada parecido não traz resultado", () => {
  assert.deepEqual(busca("xyzw"), []);
  assert.deepEqual(busca("   "), []);
});
