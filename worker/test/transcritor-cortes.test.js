import test from "node:test";
import assert from "node:assert/strict";
import { lerSilencios, escolherCortes, trechos, deslocarSegmentos, promptComContexto } from "../src/transcritor/cortes.js";

const STDERR = [
  "[silencedetect @ 0x1] silence_start: 12.5",
  "[silencedetect @ 0x1] silence_end: 13.4 | silence_duration: 0.9",
  "[silencedetect @ 0x1] silence_start: 295.1",
  "[silencedetect @ 0x1] silence_end: 296.3 | silence_duration: 1.2",
  "[silencedetect @ 0x1] silence_start: 598",
  "[silencedetect @ 0x1] silence_end: 598.8 | silence_duration: 0.8",
].join("\n");

test("lerSilencios devolve o meio de cada silêncio", () => {
  assert.deepEqual(lerSilencios(STDERR), [12.95, 295.7, 598.4]);
});

test("escolherCortes corta no silêncio mais perto de cada 3 min (janela de 20 s)", () => {
  assert.deepEqual(escolherCortes([12.95, 175.7, 368.4, 540.2], 650), [175.7, 368.4, 540.2]);
});

test("escolherCortes sem silêncio perto corta no tempo exato", () => {
  assert.deepEqual(escolherCortes([12.95], 700), [180, 360, 540]);
});

test("escolherCortes em áudio curto não corta", () => {
  assert.deepEqual(escolherCortes([100], 190), []);
});

test("trechos transforma cortes em intervalos que cobrem o áudio todo", () => {
  assert.deepEqual(trechos([295.7, 598.4], 900), [
    { inicio: 0, fim: 295.7 },
    { inicio: 295.7, fim: 598.4 },
    { inicio: 598.4, fim: 900 },
  ]);
  assert.deepEqual(trechos([], 42), [{ inicio: 0, fim: 42 }]);
});

test("deslocarSegmentos soma o início do trecho aos tempos", () => {
  assert.deepEqual(deslocarSegmentos([{ start: 1, end: 2.5, text: "a" }], 300), [{ start: 301, end: 302.5, text: "a" }]);
});

test("promptComContexto: glossário + final do trecho anterior, dentro do limite", () => {
  const p = promptComContexto("Termos que podem aparecer: CTR.", "x".repeat(1000));
  assert.ok(p.startsWith("Termos que podem aparecer: CTR."));
  assert.ok(p.length <= 900);
  assert.equal(promptComContexto(undefined, ""), undefined);
  assert.equal(promptComContexto(undefined, "final do trecho"), "final do trecho");
});
