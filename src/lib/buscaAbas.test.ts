import test from "node:test";
import assert from "node:assert/strict";
import { buscarAbas, type ItemBusca } from "./buscaAbas.ts";
import { MENSAGEM_NENHUM, MENSAGEM_PARECIDOS } from "./search.ts";

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
const resultado = (q: string) => buscarAbas(ABAS, q);
const busca = (q: string) => resultado(q).itens.map((a) => a.to);

test("sem texto não lista nada: itens vazios, modo todos e sem mensagem", () => {
  for (const q of ["", "   ", "!!!"]) {
    const r = resultado(q);
    assert.deepEqual(r.itens, [], `consulta ${JSON.stringify(q)}`);
    assert.equal(r.modo, "todos");
    assert.equal(r.mensagem, null);
  }
});

test("acha pelo nome, pelo começo e sem acento", () => {
  // "crm" está no nome das duas abas; no empate vale a ordem do menu (Planilha/CRM vem antes)
  assert.deepEqual(busca("crm").sort(), ["/acessos", "/crm"]);
  assert.equal(busca("fin")[0], "/financeiro");
  assert.equal(busca("transcricao")[0], "/transcritor");
  assert.deepEqual(busca("CLIENTES").sort(), ["/clientes", "/nps"]);
  assert.equal(resultado("fin").modo, "exato");
  assert.equal(resultado("fin").mensagem, null);
});

test("aceita erros de digitação", () => {
  assert.equal(busca("finaceiro")[0], "/financeiro");
  assert.equal(busca("trancritor")[0], "/transcritor");
  assert.equal(busca("agnda")[0], "/agenda");
  assert.equal(busca("demandsa")[0], "/");
  assert.equal(busca("arqivos")[0], "/arquivos");
  assert.equal(resultado("finaceiro").modo, "exato");
});

test("acha por sinônimo e pelo grupo", () => {
  assert.equal(busca("prospecao")[0], "/crm");
  assert.equal(busca("faturamento")[0], "/financeiro");
  assert.equal(busca("pdf")[0], "/arquivos");
  assert.deepEqual(busca("ferramentas").sort(), ["/arquivos", "/fireflies", "/notas", "/transcritor"]);
  // grupo: só campo secundário, então no empate fica a ordem do menu
  assert.deepEqual(busca("operacao"), ["/", "/agenda", "/acessos", "/nps"]);
});

test("o nome da aba vem antes do sinônimo e do grupo, mesmo quando a outra aba está antes no menu", () => {
  const itens: ItemBusca[] = [
    { to: "/outra", label: "Outra", grupo: "Ferramentas", palavras: ["agenda"] },
    { to: "/agenda", label: "Agenda", grupo: "Operação" },
    { to: "/ferramentas", label: "Ferramentas", grupo: "Operação" },
  ];
  assert.deepEqual(buscarAbas(itens, "agenda").itens.map((a) => a.to), ["/agenda", "/outra"]);
  assert.deepEqual(buscarAbas(itens, "ferramentas").itens.map((a) => a.to), ["/ferramentas", "/outra"]);
  // "reunioes" é sinônimo de Agenda e de Fireflies: empate entre secundários, ordem do menu
  assert.deepEqual(busca("reunioes"), ["/agenda", "/fireflies"]);
});

test("várias palavras: todas precisam bater, em qualquer campo do item", () => {
  assert.deepEqual(busca("nps clientes"), ["/nps"]);
  assert.equal(resultado("nps clientes").modo, "exato");
  // palavra do nome + palavra do sinônimo
  assert.deepEqual(busca("reunioes gravadas"), ["/fireflies"]);
  // palavras vazias do português não atrapalham
  assert.deepEqual(busca("nps de clientes"), ["/nps"]);
});

test("sem resultado exato: mostra os parecidos, com a mensagem", () => {
  const r = resultado("nps xyz");
  assert.equal(r.modo, "parecidos");
  assert.deepEqual(r.itens.map((a) => a.to), ["/nps"]);
  assert.equal(r.mensagem, MENSAGEM_PARECIDOS);
  assert.equal(r.mensagem, "Sem resultado exato. Itens parecidos:");
});

test("nenhum resultado encontrado: lista vazia, com a mensagem", () => {
  for (const q of ["xyzw", "nps xyz abc"]) {
    const r = resultado(q);
    assert.deepEqual(r.itens, [], `consulta ${JSON.stringify(q)}`);
    assert.equal(r.modo, "nenhum");
    assert.equal(r.mensagem, MENSAGEM_NENHUM);
  }
  assert.equal(resultado("xyzw").mensagem, "Nenhum resultado encontrado.");
});

test("letras soltas na ordem (\"fnc\") não acham mais a aba", () => {
  assert.deepEqual(busca("fnc"), []);
  assert.equal(resultado("fnc").modo, "nenhum");
});

test("mantém o tipo do item (campos extras) e não altera a lista recebida", () => {
  const comIcone = ABAS.map((a) => ({ ...a, icone: `icone-${a.to}` }));
  const copia = comIcone.map((a) => ({ ...a }));
  const r = buscarAbas(comIcone, "agenda");
  assert.equal(r.itens[0].icone, "icone-/agenda");
  assert.deepEqual(comIcone, copia);
});
