import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarLink, limparLinks, dominioDoLink, montarDescricaoDemanda, filtrarIdeias, colunaPadrao, tipoIdeiaMeta,
} from "./ideiasTexto.ts";
import { MENSAGEM_NENHUM, MENSAGEM_PARECIDOS } from "./search.ts";

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
  const r = filtrarIdeias(ideias, { tipo: "todos", agencia: "todas", busca: "" });
  assert.equal(r.itens.length, 3);
  assert.equal(r.modo, "todos");
  assert.equal(r.mensagem, null);
});

test("filtrarIdeias: por tipo e por agência", () => {
  assert.deepEqual(filtrarIdeias(ideias, { tipo: "cliente", agencia: "todas", busca: "" }).itens.map((i) => i.id), ["2", "3"]);
  assert.deepEqual(filtrarIdeias(ideias, { tipo: "todos", agencia: "spike", busca: "" }).itens.map((i) => i.id), ["3"]);
});

test("filtrarIdeias: busca em título, descrição e links, sem diferenciar caixa", () => {
  assert.deepEqual(filtrarIdeias(ideias, { tipo: "todos", agencia: "todas", busca: "DARK" }).itens.map((i) => i.id), ["1"]);
  assert.deepEqual(filtrarIdeias(ideias, { tipo: "todos", agencia: "todas", busca: "cliente y" }).itens.map((i) => i.id), ["2"]);
  assert.deepEqual(filtrarIdeias(ideias, { tipo: "todos", agencia: "todas", busca: "ref.com" }).itens.map((i) => i.id), ["2"]);
});

test("filtrarIdeias: acha sem acento (e com acento onde não tem)", () => {
  const f = { tipo: "todos", agencia: "todas" };
  assert.deepEqual(filtrarIdeias(ideias, { ...f, busca: "automacao" }).itens.map((i) => i.id), ["3"]);
  assert.deepEqual(filtrarIdeias(ideias, { ...f, busca: "AUTOMAÇÃO" }).itens.map((i) => i.id), ["3"]);
});

test("filtrarIdeias: aceita erro de digitação (letras trocadas, a mais ou a menos)", () => {
  const f = { tipo: "todos", agencia: "todas" };
  const trocadas = filtrarIdeias(ideias, { ...f, busca: "dark mdoe" });
  assert.deepEqual(trocadas.itens.map((i) => i.id), ["1"]);
  assert.equal(trocadas.modo, "exato");
  assert.deepEqual(filtrarIdeias(ideias, { ...f, busca: "landding" }).itens.map((i) => i.id), ["2"]);
  assert.deepEqual(filtrarIdeias(ideias, { ...f, busca: "automaao" }).itens.map((i) => i.id), ["3"]);
});

test("filtrarIdeias: sem resultado exato mostra os parecidos com a mensagem; sem nada, modo nenhum", () => {
  const f = { tipo: "todos", agencia: "todas" };
  const parecidos = filtrarIdeias(ideias, { ...f, busca: "landing zebra" });
  assert.equal(parecidos.modo, "parecidos");
  assert.equal(parecidos.mensagem, MENSAGEM_PARECIDOS);
  assert.deepEqual(parecidos.itens.map((i) => i.id), ["2"]);
  const nenhum = filtrarIdeias(ideias, { ...f, busca: "zebra" });
  assert.equal(nenhum.modo, "nenhum");
  assert.equal(nenhum.mensagem, MENSAGEM_NENHUM);
  assert.deepEqual(nenhum.itens, []);
});

test("filtrarIdeias: tipo e agência valem antes da busca (parecido de outra agência não aparece)", () => {
  const r = filtrarIdeias(ideias, { tipo: "todos", agencia: "spike", busca: "landing" });
  assert.equal(r.modo, "nenhum");
  assert.deepEqual(r.itens, []);
});

test("colunaPadrao: fazer_hoje, senão a primeira não-sistema, senão a primeira", () => {
  assert.equal(colunaPadrao([{ id: "recorrentes", sistema: true }, { id: "fazer_hoje", sistema: false }]), "fazer_hoje");
  assert.equal(colunaPadrao([{ id: "recorrentes", sistema: true }, { id: "semana", sistema: false }]), "semana");
  assert.equal(colunaPadrao([{ id: "feito", sistema: true }]), "feito");
  assert.equal(colunaPadrao([]), "");
});

test("tipoIdeiaMeta: procura na lista passada e id desconhecido vira categoria cinza", () => {
  assert.equal(tipoIdeiaMeta("cliente").label, "Para cliente");
  assert.deepEqual(tipoIdeiaMeta("xyz"), { id: "xyz", label: "xyz", hex: "#64748b" });
  const cats = [{ id: "podcast_ab12", label: "Podcast", hex: "#ec4899" }];
  assert.equal(tipoIdeiaMeta("podcast_ab12", cats).label, "Podcast");
  assert.equal(tipoIdeiaMeta("cliente", cats).label, "cliente");
});

test("filtrarIdeias: situação separa abertas de concluídas (padrão: abertas)", () => {
  const base = { tipo: "este_sistema", agencia: null, descricao: null, links: [] as string[] };
  const ideias = [
    { ...base, titulo: "Aberta", concluida_em: null },
    { ...base, titulo: "Feita", concluida_em: "2026-09-23T10:00:00Z" },
  ];
  const f = { tipo: "todos", agencia: "todas", busca: "" };
  assert.deepEqual(filtrarIdeias(ideias, f).itens.map((i) => i.titulo), ["Aberta"]);
  assert.deepEqual(filtrarIdeias(ideias, { ...f, situacao: "concluidas" }).itens.map((i) => i.titulo), ["Feita"]);
  assert.deepEqual(filtrarIdeias(ideias, { ...f, situacao: "abertas" }).itens.map((i) => i.titulo), ["Aberta"]);
  // A busca só olha a situação escolhida
  assert.equal(filtrarIdeias(ideias, { ...f, busca: "feita" }).modo, "nenhum");
  assert.deepEqual(filtrarIdeias(ideias, { ...f, situacao: "concluidas", busca: "feita" }).itens.map((i) => i.titulo), ["Feita"]);
});
