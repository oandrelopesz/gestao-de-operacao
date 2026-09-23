import test from "node:test";
import assert from "node:assert/strict";
import {
  COLUNA_FDS, secaoFds, ehSecaoFds, diaDaSecao, containerIdsDoQuadro, containerDe,
  aplicarContainer, moverParaDia, camposParaSalvar,
} from "./fimDeSemana.ts";

test("containerIdsDoQuadro: a coluna do fim de semana vira sábado e domingo, no lugar dela", () => {
  assert.deepEqual(
    containerIdsDoQuadro(["fazer_hoje", "fazer_depois_amanha", COLUNA_FDS, "standby"]),
    ["fazer_hoje", "fazer_depois_amanha", "fazer_fim_de_semana:sabado", "fazer_fim_de_semana:domingo", "standby"],
  );
});

test("containerDe: card do fim de semana vai para a seção do dia; sem dia conta como sábado", () => {
  assert.equal(containerDe({ id: "a", status: COLUNA_FDS, dia_fim_de_semana: "domingo" }), "fazer_fim_de_semana:domingo");
  assert.equal(containerDe({ id: "a", status: COLUNA_FDS, dia_fim_de_semana: null }), "fazer_fim_de_semana:sabado");
  assert.equal(containerDe({ id: "a", status: "standby", dia_fim_de_semana: "domingo" }), "standby");
});

test("aplicarContainer: entrar numa seção grava status e dia; sair para outra coluna apaga o dia", () => {
  const d = { id: "a", status: "fazer_hoje", dia_fim_de_semana: null as string | null, titulo: "x" };
  const dentro = aplicarContainer(d, secaoFds("domingo"));
  assert.deepEqual(dentro, { id: "a", status: COLUNA_FDS, dia_fim_de_semana: "domingo", titulo: "x" });
  assert.deepEqual(aplicarContainer(dentro, "standby"), { id: "a", status: "standby", dia_fim_de_semana: null, titulo: "x" });
});

test("ehSecaoFds / diaDaSecao", () => {
  assert.equal(ehSecaoFds("fazer_fim_de_semana:sabado"), true);
  assert.equal(ehSecaoFds("fazer_hoje"), false);
  assert.equal(diaDaSecao("fazer_fim_de_semana:domingo"), "domingo");
  assert.equal(diaDaSecao("qualquer"), "sabado");
});

const fds = (id: string, dia: string, ordem: number) => ({ id, status: COLUNA_FDS, dia_fim_de_semana: dia, ordem });

test("moverParaDia: vai para o fim do outro dia e renumera as duas seções", () => {
  const lista = [fds("s1", "sabado", 0), fds("s2", "sabado", 1), fds("s3", "sabado", 2), fds("d1", "domingo", 0)];
  const r = moverParaDia(lista, "s2", "domingo");
  const por = Object.fromEntries(r.map((d) => [d.id, `${d.dia_fim_de_semana}:${d.ordem}`]));
  assert.deepEqual(por, { s1: "sabado:0", s3: "sabado:1", d1: "domingo:0", s2: "domingo:1" });
});

test("moverParaDia: já no dia pedido, a lista não muda (mantém a posição do drop)", () => {
  const lista = [fds("s1", "sabado", 0), fds("s2", "sabado", 1)];
  assert.equal(moverParaDia(lista, "s2", "sabado"), lista);
});

test("moverParaDia: card vindo de outra coluna (drop pendente) entra no fim do dia escolhido", () => {
  const lista = [fds("d1", "domingo", 0), { id: "x", status: COLUNA_FDS, dia_fim_de_semana: "sabado", ordem: 0 }];
  const r = moverParaDia(lista, "x", "domingo");
  assert.deepEqual(r.find((d) => d.id === "x"), { id: "x", status: COLUNA_FDS, dia_fim_de_semana: "domingo", ordem: 1 });
});

test("camposParaSalvar: só status, ordem e dia (null fora da coluna)", () => {
  assert.deepEqual(camposParaSalvar({ id: "a", status: "standby", ordem: 3, dia_fim_de_semana: "sabado" }), { status: "standby", ordem: 3, dia_fim_de_semana: null });
  assert.deepEqual(camposParaSalvar({ id: "a", status: COLUNA_FDS, ordem: null, dia_fim_de_semana: "domingo" }), { status: COLUNA_FDS, ordem: 0, dia_fim_de_semana: "domingo" });
});
