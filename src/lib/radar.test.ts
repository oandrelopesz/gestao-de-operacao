import test from "node:test";
import assert from "node:assert/strict";
import {
  FILTROS_VAZIOS,
  bateFiltro,
  boletimAindaNaoChegou,
  contarFiltros,
  edicaoDoDia,
  filtrosParaSearch,
  hojeSP,
  horaSP,
  lerFiltros,
  linkSeguro,
  ordenarAchados,
  pedacosWhatsapp,
  rotuloDia,
  soHoraSP,
  somarDias,
  TEMAS,
} from "./radar.ts";
import type { Achado, Filtros } from "./radar.ts";

const achado = (over: Partial<Achado> = {}): Achado => ({
  id: "RAD-20261117-001",
  data: "2026-11-17",
  titulo: "Inteligência artificial no Meta Ads",
  classe: "bom",
  tipo: "A",
  tipo_motivo: null,
  alerta: false,
  temas: ["ia"],
  confianca: "alta",
  estagio: "anunciado",
  prontidao: null,
  publicacao: null,
  primeira_descoberta: "2026-11-17T10:00:00-03:00",
  atualizacao: null,
  corpo: {},
  links: [],
  post_x_url: null,
  link_citado_x_url: null,
  texto_whatsapp: "*Novo* recurso de _criação_",
  enviado_em: null,
  versao: 1,
  corrigido: false,
  status: "novo",
  status_em: null,
  nota_pessoal: null,
  ...over,
});

test("lerFiltros: descarta valor inválido, duplicado e aceita array ou lista separada por vírgula", () => {
  const f = lerFiltros({
    classe: "bom,lixo,bom",
    tema: ["ia", "xyz", "ia,marketing"],
    tipo: "B,Z",
    status: "novo,novo",
    confianca: ["alta", "nope"],
    alerta: "1",
    q: "  inteligencia  ",
    view: "tabela",
    dia: "2026-11-17",
    de: "17/11/2026",
    ate: "2026-11-30",
  });
  assert.deepEqual(f.classe, ["bom"]);
  assert.deepEqual(f.tema, ["marketing", "ia"]);
  assert.deepEqual(f.tipo, ["B"]);
  assert.deepEqual(f.status, ["novo"]);
  assert.deepEqual(f.confianca, ["alta"]);
  assert.equal(f.alerta, true);
  assert.equal(f.q, "inteligencia");
  assert.equal(f.view, "tabela");
  assert.equal(f.dia, "2026-11-17");
  assert.equal(f.de, undefined);
  assert.equal(f.ate, "2026-11-30");
});

test("lerFiltros: vazio devolve FILTROS_VAZIOS; alerta aceita 1 e true; view inválida vira dia", () => {
  assert.deepEqual(lerFiltros({}), FILTROS_VAZIOS);
  assert.equal(lerFiltros({ alerta: 1 }).alerta, true);
  assert.equal(lerFiltros({ alerta: true }).alerta, true);
  assert.equal(lerFiltros({ alerta: "0" }).alerta, false);
  assert.equal(lerFiltros({ view: "lixo" }).view, "dia");
});

test("filtrosParaSearch: só chaves com valor, listas unidas por vírgula, view omitida quando dia", () => {
  assert.deepEqual(filtrosParaSearch(FILTROS_VAZIOS), {});
  assert.deepEqual(filtrosParaSearch({ ...FILTROS_VAZIOS, view: "dia" }), {});
  const f: Filtros = { ...FILTROS_VAZIOS, classe: ["medio", "excelente"], alerta: true, view: "cards" };
  assert.deepEqual(filtrosParaSearch(f), { classe: "excelente,medio", alerta: "1", view: "cards" });
});

test("ida e volta: lerFiltros(filtrosParaSearch(f)) devolve o mesmo filtro", () => {
  const f: Filtros = {
    dia: "2026-11-17",
    de: "2026-11-01",
    ate: "2026-11-30",
    classe: ["excelente", "medio"],
    tema: ["marketing", "ciberseguranca"],
    tipo: ["A", "C"],
    status: ["novo", "lido"],
    confianca: ["moderada"],
    alerta: true,
    q: "agentes ia",
    view: "kanban",
  };
  assert.deepEqual(filtrosParaSearch(f), {
    dia: "2026-11-17",
    de: "2026-11-01",
    ate: "2026-11-30",
    classe: "excelente,medio",
    tema: "marketing,ciberseguranca",
    tipo: "A,C",
    status: "novo,lido",
    confianca: "moderada",
    alerta: "1",
    q: "agentes ia",
    view: "kanban",
  });
  assert.deepEqual(lerFiltros(filtrosParaSearch(f)), f);
});

test("contarFiltros: conta grupos ativos, período conta 1, dia e view não contam", () => {
  assert.equal(contarFiltros(FILTROS_VAZIOS), 0);
  const f: Filtros = {
    ...FILTROS_VAZIOS,
    classe: ["bom"],
    tema: ["ia", "marketing"],
    de: "2026-11-01",
    ate: "2026-11-30",
    q: "   ",
    dia: "2026-11-17",
    view: "tabela",
  };
  assert.equal(contarFiltros(f), 3);
  assert.equal(contarFiltros({ ...f, alerta: true, q: "x" }), 5);
});

test("bateFiltro: classe, tema em comum, alerta, q sem acento e sem caixa; ignora dia e view", () => {
  const a = achado({ classe: "bom", temas: ["ia", "dados_mensuracao"] });
  assert.equal(bateFiltro(a, { ...FILTROS_VAZIOS, classe: ["bom"] }), true);
  assert.equal(bateFiltro(a, { ...FILTROS_VAZIOS, classe: ["excelente"] }), false);
  assert.equal(bateFiltro(a, { ...FILTROS_VAZIOS, tema: ["marketing", "dados_mensuracao"] }), true);
  assert.equal(bateFiltro(a, { ...FILTROS_VAZIOS, tema: ["branding"] }), false);
  assert.equal(bateFiltro(a, { ...FILTROS_VAZIOS, q: "inteligencia" }), true);
  assert.equal(bateFiltro(a, { ...FILTROS_VAZIOS, q: "INTELIGÊNCIA meta" }), true);
  assert.equal(bateFiltro(a, { ...FILTROS_VAZIOS, q: "inteligencia xyz" }), false);
  assert.equal(bateFiltro(a, { ...FILTROS_VAZIOS, q: "novo recurso" }), true);
  assert.equal(bateFiltro(a, { ...FILTROS_VAZIOS, alerta: true }), false);
  assert.equal(bateFiltro(achado({ alerta: true }), { ...FILTROS_VAZIOS, alerta: true }), true);
  assert.equal(bateFiltro(a, { ...FILTROS_VAZIOS, dia: "2000-01-01", view: "tabela" }), true);
});

test("ordenarAchados: alerta primeiro, depois classe, depois primeira descoberta; não muda a lista original", () => {
  const x1 = achado({ id: "x1", classe: "excelente", primeira_descoberta: "2026-11-18T09:00:00-03:00" });
  const x2 = achado({ id: "x2", classe: "bom", primeira_descoberta: "2026-11-18T08:00:00-03:00" });
  const x3 = achado({ id: "x3", classe: "medio", alerta: true, primeira_descoberta: "2026-11-18T10:00:00-03:00" });
  const x4 = achado({ id: "x4", classe: "excelente", primeira_descoberta: "2026-11-18T07:00:00-03:00" });
  const entrada = [x1, x2, x3, x4];
  assert.deepEqual(ordenarAchados(entrada).map((a) => a.id), ["x3", "x4", "x1", "x2"]);
  assert.deepEqual(entrada.map((a) => a.id), ["x1", "x2", "x3", "x4"]);
});

test("hojeSP: 01:30 UTC do dia 18 ainda é dia 17 em São Paulo", () => {
  assert.equal(hojeSP(new Date("2026-11-18T01:30:00Z")), "2026-11-17");
  assert.equal(hojeSP(new Date("2026-11-18T12:00:00Z")), "2026-11-18");
});

test("horaSP e soHoraSP: convertem para o horário de Brasília", () => {
  assert.equal(horaSP("2026-11-18T00:04:00Z"), "17/11/2026 21:04 (Brasília)");
  assert.equal(soHoraSP("2026-11-18T00:04:00Z"), "21:04");
});

test("boletimAindaNaoChegou: verdadeiro antes de 08:15 de SP no próprio dia, falso depois ou em outro dia", () => {
  assert.equal(boletimAindaNaoChegou("2026-11-17", new Date("2026-11-17T11:00:00Z")), true); // 08:00 SP
  assert.equal(boletimAindaNaoChegou("2026-11-17", new Date("2026-11-17T11:14:59Z")), true);
  assert.equal(boletimAindaNaoChegou("2026-11-17", new Date("2026-11-17T11:15:00Z")), false); // 08:15 SP
  assert.equal(boletimAindaNaoChegou("2026-11-17", new Date("2026-11-17T11:20:00Z")), false); // 08:20 SP
  assert.equal(boletimAindaNaoChegou("2026-11-16", new Date("2026-11-17T11:00:00Z")), false);
});

test("rotuloDia: dia da semana com inicial maiúscula", () => {
  assert.equal(rotuloDia("2026-11-17"), "Terça, 17/11/2026");
});

test("somarDias: atravessa mês e ano sem fuso", () => {
  assert.equal(somarDias("2026-01-31", 1), "2026-02-01");
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
});

test("edicaoDoDia: formato DIA-AAAAMMDD", () => {
  assert.equal(edicaoDoDia("2026-11-17"), "DIA-20261117");
});

test("TEMAS: oito slugs na ordem da especificação", () => {
  assert.deepEqual(TEMAS.map((t) => t.slug), [
    "marketing",
    "branding",
    "performance",
    "ia",
    "software_saas",
    "dados_mensuracao",
    "ciberseguranca",
    "conteudo_social",
  ]);
});

test("pedacosWhatsapp: negrito, itálico e riscado", () => {
  assert.deepEqual(pedacosWhatsapp("*oi* _tudo_ ~não~"), [
    { texto: "oi", negrito: true },
    { texto: " " },
    { texto: "tudo", italico: true },
    { texto: " " },
    { texto: "não", riscado: true },
  ]);
});

test("pedacosWhatsapp: combina marcadores e trata quebra de linha", () => {
  assert.deepEqual(pedacosWhatsapp("*_x_*"), [{ texto: "x", negrito: true, italico: true }]);
  assert.deepEqual(pedacosWhatsapp("a\nb"), [{ texto: "a" }, { quebra: true }, { texto: "b" }]);
});

test("pedacosWhatsapp: marcador sem par fica literal; <script> é texto comum", () => {
  assert.deepEqual(pedacosWhatsapp("preço *5 e _x"), [{ texto: "preço *5 e _x" }]);
  assert.deepEqual(pedacosWhatsapp("**"), [{ texto: "**" }]);
  assert.deepEqual(pedacosWhatsapp("<script>alert(1)</script>"), [{ texto: "<script>alert(1)</script>" }]);
  assert.deepEqual(pedacosWhatsapp(""), []);
});

test("linkSeguro: só http e https", () => {
  assert.equal(linkSeguro("javascript:alert(1)"), null);
  assert.equal(linkSeguro("https://exemplo.com/x"), "https://exemplo.com/x");
  assert.equal(linkSeguro("http://exemplo.com"), "http://exemplo.com");
  assert.equal(linkSeguro("nao e url"), null);
  assert.equal(linkSeguro(null), null);
  assert.equal(linkSeguro(undefined), null);
});
