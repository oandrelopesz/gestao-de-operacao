import test from "node:test";
import assert from "node:assert/strict";
import {
  NOMES_DIA, rotuloFazerNoDia, secaoId, parseSecao, mapaDias, containerIdsDoQuadro, diaEfetivo,
  containerDe, aplicarContainer, moverParaDia, camposParaSalvar, moverVariosPara, ordenarPeloQuadro,
  porOrdem, alternarPrioridade, prioridadeAoSoltar,
} from "./colunasDias.ts";
import type { ItemDia } from "./colunasDias.ts";

const colunas = [
  { id: "fazer_hoje", dias: [] },
  { id: "fazer_fim_de_semana", dias: [6, 0] },
  { id: "segunda_x", dias: [1] },
  { id: "standby", dias: [] },
];
const mapa = mapaDias(colunas);

test("nomes e rótulos dos dias", () => {
  assert.equal(NOMES_DIA[0], "Domingo");
  assert.equal(NOMES_DIA[6], "Sábado");
  assert.equal(rotuloFazerNoDia(6), "Fazer no sábado");
  assert.equal(rotuloFazerNoDia(0), "Fazer no domingo");
  assert.equal(rotuloFazerNoDia(1), "Fazer na segunda");
});

test("secaoId / parseSecao", () => {
  assert.equal(secaoId("fazer_fim_de_semana", 6), "fazer_fim_de_semana:6");
  assert.deepEqual(parseSecao("fazer_fim_de_semana:0"), { coluna: "fazer_fim_de_semana", dia: 0 });
  assert.equal(parseSecao("fazer_hoje"), null);
  assert.equal(parseSecao("x:7"), null);
});

test("mapaDias só com colunas que têm dias; containers no lugar da coluna, na ordem dos dias", () => {
  assert.deepEqual(mapa, { fazer_fim_de_semana: [6, 0], segunda_x: [1] });
  assert.deepEqual(containerIdsDoQuadro(colunas), ["fazer_hoje", "fazer_fim_de_semana:6", "fazer_fim_de_semana:0", "segunda_x:1", "standby"]);
});

test("diaEfetivo/containerDe: dia inválido ou vazio vira o primeiro dia da coluna", () => {
  assert.equal(diaEfetivo({ id: "a", status: "fazer_fim_de_semana", dia_semana: 0 }, mapa), 0);
  assert.equal(diaEfetivo({ id: "a", status: "fazer_fim_de_semana", dia_semana: null }, mapa), 6);
  assert.equal(diaEfetivo({ id: "a", status: "fazer_fim_de_semana", dia_semana: 3 }, mapa), 6);
  assert.equal(diaEfetivo({ id: "a", status: "standby", dia_semana: 3 }, mapa), null);
  assert.equal(containerDe({ id: "a", status: "fazer_fim_de_semana", dia_semana: 0 }, mapa), "fazer_fim_de_semana:0");
  assert.equal(containerDe({ id: "a", status: "standby", dia_semana: 0 }, mapa), "standby");
});

test("aplicarContainer: seção grava status e dia; coluna simples apaga o dia", () => {
  const d = { id: "a", status: "fazer_hoje", dia_semana: null as number | null, titulo: "x" };
  const dentro = aplicarContainer(d, "segunda_x:1");
  assert.deepEqual(dentro, { id: "a", status: "segunda_x", dia_semana: 1, titulo: "x" });
  assert.deepEqual(aplicarContainer(dentro, "standby"), { id: "a", status: "standby", dia_semana: null, titulo: "x" });
});

const fds = (id: string, dia: number, ordem: number) => ({ id, status: "fazer_fim_de_semana", dia_semana: dia, ordem });

test("moverParaDia: vai para o fim do outro dia e renumera as duas seções", () => {
  const lista = [fds("s1", 6, 0), fds("s2", 6, 1), fds("s3", 6, 2), fds("d1", 0, 0)];
  const r = moverParaDia(lista, "s2", 0, mapa);
  const por = Object.fromEntries(r.map((d) => [d.id, `${d.dia_semana}:${d.ordem}`]));
  assert.deepEqual(por, { s1: "6:0", s3: "6:1", d1: "0:0", s2: "0:1" });
});

test("moverParaDia: já no dia pedido devolve a mesma lista; id desconhecido também", () => {
  const lista = [fds("s1", 6, 0)];
  assert.equal(moverParaDia(lista, "s1", 6, mapa), lista);
  assert.equal(moverParaDia(lista, "zzz", 0, mapa), lista);
});

test("camposParaSalvar: dia só em coluna com dias", () => {
  assert.deepEqual(camposParaSalvar({ id: "a", status: "standby", ordem: 2, dia_semana: 6 }, mapa), { status: "standby", ordem: 2, dia_semana: null, prioritaria: false, prioridade_pos: null });
  assert.deepEqual(camposParaSalvar({ id: "a", status: "fazer_fim_de_semana", ordem: null, dia_semana: null }, mapa), { status: "fazer_fim_de_semana", ordem: 0, dia_semana: 6, prioritaria: false, prioridade_pos: null });
  assert.deepEqual(
    camposParaSalvar({ id: "a", status: "standby", ordem: 0, prioritaria: true, prioridade_pos: 3 }, mapa),
    { status: "standby", ordem: 0, dia_semana: null, prioritaria: true, prioridade_pos: 3 },
  );
});

// ---------------------------------------------------------------- Coroa (prioridade)
const card = (id: string, ordem: number, prioritaria = false): ItemDia => ({ id, status: "fazer_hoje", ordem, prioritaria });
const ordemDoQuadro = (lista: { id: string; status: string; ordem?: number | null; prioritaria?: boolean | null }[]) =>
  [...lista].sort(porOrdem).map((d) => (d.prioritaria ? `${d.id}*` : d.id)).join(" ");

test("porOrdem: prioritárias primeiro, depois pela ordem", () => {
  assert.equal(ordemDoQuadro([card("a", 0), card("b", 1), card("c", 5, true), card("d", 2, true)]), "d* c* a b");
});

test("alternarPrioridade: ligar sobe para o fim das prioritárias; desligar volta à posição de antes", () => {
  const lista = [card("p", 0, true), card("a", 1), card("b", 2), card("c", 3), card("d", 4)];
  const ligada = alternarPrioridade(lista, ["c"], true, mapa);
  assert.equal(ordemDoQuadro(ligada), "p* c* a b d");
  assert.equal(ligada.find((d) => d.id === "c")?.prioridade_pos, 2);
  const desligada = alternarPrioridade(ligada, ["c"], false, mapa);
  assert.equal(ordemDoQuadro(desligada), "p* a b c d");
  assert.equal(desligada.find((d) => d.id === "c")?.prioridade_pos, null);
});

test("alternarPrioridade: em massa mantém a ordem; a coluna encolheu → volta para o fim (proporcional)", () => {
  const lista = [card("a", 0), card("b", 1), card("c", 2), card("d", 3)];
  const ligadas = alternarPrioridade(lista, ["d", "b"], true, mapa);
  assert.equal(ordemDoQuadro(ligadas), "b* d* a c");
  const encolheu = ligadas.filter((d) => d.id !== "a" && d.id !== "c");
  assert.equal(ordemDoQuadro(alternarPrioridade(encolheu, ["b", "d"], false, mapa)), "b d");
  // só os que mudam: ligar uma que já é prioritária não mexe em nada
  assert.equal(alternarPrioridade(ligadas, ["b"], true, mapa), ligadas);
});

test("prioridadeAoSoltar: prioritária abaixo de normal perde a coroa; normal acima de prioritária ganha", () => {
  // ordem = onde cada card caiu depois do arrasto
  const perde = prioridadeAoSoltar([card("p", 0, true), card("a", 1), card("q", 2, true), card("b", 3)], "q", "fazer_hoje", "fazer_hoje", mapa);
  assert.equal(perde.find((d) => d.id === "q")?.prioritaria, false);
  const fica = prioridadeAoSoltar([card("q", 0, true), card("p", 1, true), card("a", 2)], "q", "fazer_hoje", "fazer_hoje", mapa);
  assert.equal(fica.find((d) => d.id === "q")?.prioritaria, true);
  const ganha = prioridadeAoSoltar([card("p", 0, true), card("a", 1), card("q", 2, true)].map((d, i) => ({ ...d, ordem: [0, 1, 2][i] })), "a", "fazer_hoje", "fazer_hoje", mapa);
  assert.equal(ganha.find((d) => d.id === "a")?.prioritaria, true);
  const normalNoTopoSemPrioritarias = prioridadeAoSoltar([card("a", 0), card("b", 1)], "a", "fazer_hoje", "fazer_hoje", mapa);
  assert.equal(normalNoTopoSemPrioritarias.find((d) => d.id === "a")?.prioritaria, false);
});

test("prioridadeAoSoltar: em outra coluna (outro dia) a coroa continua", () => {
  const lista = [card("a", 0), { ...card("q", 1, true), status: "fazer_amanha" }];
  assert.equal(prioridadeAoSoltar(lista, "q", "fazer_hoje", "fazer_amanha", mapa), lista);
  assert.equal(ordemDoQuadro([card("a", 0), card("q", 1, true)]), "q* a");
});

test("moverVariosPara: leva o grupo para o fim do destino e renumera as origens", () => {
  const lista = [
    { id: "a", status: "fazer_hoje", ordem: 0 },
    { id: "b", status: "fazer_hoje", ordem: 1 },
    { id: "c", status: "fazer_hoje", ordem: 2 },
    { id: "x", status: "standby", ordem: 0 },
    { id: "y", status: "standby", ordem: 1 },
  ];
  const r = moverVariosPara(lista, ["a", "c", "y"], "feito", mapa);
  const por = (id: string) => r.find((d) => d.id === id)!;
  assert.deepEqual(["a", "c", "y"].map((id) => [por(id).status, por(id).ordem]), [["feito", 0], ["feito", 1], ["feito", 2]]);
  assert.deepEqual([por("b").ordem, por("x").ordem], [0, 0]);
});

test("moverVariosPara: entra logo depois do card solto no arrasto", () => {
  const lista = [
    { id: "a", status: "fazer_hoje", ordem: 0 },
    { id: "s1", status: "standby", ordem: 0 },
    { id: "ativo", status: "standby", ordem: 1 },
    { id: "s2", status: "standby", ordem: 2 },
    { id: "b", status: "fazer_hoje", ordem: 1 },
  ];
  const r = moverVariosPara(lista, ["ativo", "a", "b"], "standby", mapa, "ativo");
  const seq = r.filter((d) => d.status === "standby").sort((x, y) => (x.ordem ?? 0) - (y.ordem ?? 0)).map((d) => d.id);
  assert.deepEqual(seq, ["s1", "ativo", "a", "b", "s2"]);
});

test("moverVariosPara: seção de dia grava o dia da semana", () => {
  const lista = [{ id: "a", status: "fazer_hoje", ordem: 0, dia_semana: null }];
  const r = moverVariosPara(lista, ["a"], secaoId("fazer_fim_de_semana", 0), mapa);
  assert.deepEqual([r[0].status, r[0].dia_semana, r[0].ordem], ["fazer_fim_de_semana", 0, 0]);
});

test("ordenarPeloQuadro: coluna do quadro, depois a ordem dentro dela", () => {
  const lista = [
    { id: "s", status: "standby", ordem: 0 },
    { id: "h2", status: "fazer_hoje", ordem: 5 },
    { id: "h1", status: "fazer_hoje", ordem: 1 },
  ];
  const ids = ordenarPeloQuadro(lista, ["s", "h2", "h1"], containerIdsDoQuadro(colunas), mapa);
  assert.deepEqual(ids, ["h1", "h2", "s"]);
});
