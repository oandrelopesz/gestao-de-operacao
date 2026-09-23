import test from "node:test";
import assert from "node:assert/strict";
import {
  NOMES_DIA, rotuloFazerNoDia, secaoId, parseSecao, mapaDias, containerIdsDoQuadro, diaEfetivo,
  containerDe, aplicarContainer, moverParaDia, camposParaSalvar,
} from "./colunasDias.ts";

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
  assert.deepEqual(camposParaSalvar({ id: "a", status: "standby", ordem: 2, dia_semana: 6 }, mapa), { status: "standby", ordem: 2, dia_semana: null });
  assert.deepEqual(camposParaSalvar({ id: "a", status: "fazer_fim_de_semana", ordem: null, dia_semana: null }, mapa), { status: "fazer_fim_de_semana", ordem: 0, dia_semana: 6 });
});
