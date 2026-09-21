import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarLink, limparLinks, dominioDoLink, montarDescricaoDemanda, filtrarIdeias, colunaPadrao, tipoIdeiaMeta,
} from "./ideiasTexto.ts";

test("normalizarLink: vazio fica vazio e sem esquema ganha https://", () => {
  assert.equal(normalizarLink("   "), "");
  assert.equal(normalizarLink("exemplo.com/pagina"), "https://exemplo.com/pagina");
  assert.equal(normalizarLink(" http://exemplo.com "), "http://exemplo.com");
});

test("limparLinks: normaliza, tira vazios e duplicados mantendo a ordem", () => {
  assert.deepEqual(
    limparLinks(["exemplo.com", "", "https://exemplo.com", "  ", "outro.com"]),
    ["https://exemplo.com", "https://outro.com"],
  );
});

test("dominioDoLink: tira www e devolve o próprio texto se não for URL", () => {
  assert.equal(dominioDoLink("https://www.figma.com/file/abc"), "figma.com");
  assert.equal(dominioDoLink("não é url"), "não é url");
});

test("montarDescricaoDemanda: descrição + bloco de links", () => {
  assert.equal(
    montarDescricaoDemanda({ descricao: "Fazer X", links: ["https://a.com", "https://b.com"] }),
    "Fazer X\n\nLinks de referência:\n- https://a.com\n- https://b.com",
  );
});

test("montarDescricaoDemanda: só links, só descrição, ou nada", () => {
  assert.equal(montarDescricaoDemanda({ descricao: null, links: ["https://a.com"] }), "Links de referência:\n- https://a.com");
  assert.equal(montarDescricaoDemanda({ descricao: "  Fazer X  ", links: [] }), "Fazer X");
  assert.equal(montarDescricaoDemanda({ descricao: "   ", links: [] }), null);
});

const ideias = [
  { id: "1", tipo: "este_sistema", agencia: null, titulo: "Dark mode", descricao: null, links: [] },
  { id: "2", tipo: "cliente", agencia: "effect", titulo: "Landing nova", descricao: "para o cliente Y", links: ["https://ref.com"] },
  { id: "3", tipo: "cliente", agencia: "spike", titulo: "Automação", descricao: null, links: [] },
];

test("filtrarIdeias: sem filtro devolve tudo", () => {
  assert.equal(filtrarIdeias(ideias, { tipo: "todos", agencia: "todas", busca: "" }).length, 3);
});

test("filtrarIdeias: por tipo e por agência", () => {
  assert.deepEqual(filtrarIdeias(ideias, { tipo: "cliente", agencia: "todas", busca: "" }).map((i) => i.id), ["2", "3"]);
  assert.deepEqual(filtrarIdeias(ideias, { tipo: "todos", agencia: "spike", busca: "" }).map((i) => i.id), ["3"]);
});

test("filtrarIdeias: busca em título, descrição e links, sem diferenciar caixa", () => {
  assert.deepEqual(filtrarIdeias(ideias, { tipo: "todos", agencia: "todas", busca: "DARK" }).map((i) => i.id), ["1"]);
  assert.deepEqual(filtrarIdeias(ideias, { tipo: "todos", agencia: "todas", busca: "cliente y" }).map((i) => i.id), ["2"]);
  assert.deepEqual(filtrarIdeias(ideias, { tipo: "todos", agencia: "todas", busca: "ref.com" }).map((i) => i.id), ["2"]);
});

test("colunaPadrao: fazer_hoje, senão a primeira não-sistema, senão a primeira", () => {
  assert.equal(colunaPadrao([{ id: "recorrentes", sistema: true }, { id: "fazer_hoje", sistema: false }]), "fazer_hoje");
  assert.equal(colunaPadrao([{ id: "recorrentes", sistema: true }, { id: "semana", sistema: false }]), "semana");
  assert.equal(colunaPadrao([{ id: "feito", sistema: true }]), "feito");
  assert.equal(colunaPadrao([]), "");
});

test("tipoIdeiaMeta: id desconhecido cai no primeiro tipo", () => {
  assert.equal(tipoIdeiaMeta("cliente").label, "Para cliente");
  assert.equal(tipoIdeiaMeta("xyz").id, "este_sistema");
});
