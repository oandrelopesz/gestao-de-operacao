import test from "node:test";
import assert from "node:assert/strict";
import {
  arquivosParaApagar, arquivosParaSubir, arquivosUsados, assinaturaDaCena, centroDaTela, extensaoDoMime, lerCena, montarCena, textosDaCena,
} from "./fluxoCena.ts";

const els = [
  { id: "a", type: "rectangle", version: 3 },
  { id: "b", type: "text", version: 2, text: "Olá mundo" },
  { id: "c", type: "image", version: 1, fileId: "f1" },
  { id: "d", type: "image", version: 5, fileId: "f2", isDeleted: true },
  { id: "e", type: "text", version: 1, text: "apagado", isDeleted: true },
];

test("montarCena tira apagados e guarda só o essencial do appState", () => {
  const c = montarCena(els, { viewBackgroundColor: "#fff", gridSize: 20, zoom: { value: 2 }, scrollX: 10 }, { f1: { caminho: "x/f1.png", mimeType: "image/png" } });
  assert.deepEqual(c.elements.map((e) => e.id), ["a", "b", "c"]);
  assert.deepEqual(c.appState, { viewBackgroundColor: "#fff", gridSize: 20, gridModeEnabled: false });
  assert.deepEqual(Object.keys(c.arquivos), ["f1"]);
});

test("lerCena aceita vazio e lixo", () => {
  assert.deepEqual(lerCena(null), { elements: [], appState: {}, arquivos: {} });
  assert.deepEqual(lerCena({ elements: "x" }), { elements: [], appState: {}, arquivos: {} });
  assert.equal(lerCena({ elements: [{ id: "a", type: "text", version: 1 }] }).elements.length, 1);
});

test("arquivos: usados, a subir e a apagar", () => {
  const usados = arquivosUsados(els);
  assert.deepEqual([...usados], ["f1"]);
  assert.deepEqual(arquivosParaSubir({ f1: { mimeType: "image/png" }, f3: { mimeType: "image/png" } }, {}, new Set(["f1", "f3"])), ["f1", "f3"]);
  assert.deepEqual(arquivosParaSubir({ f1: { mimeType: "image/png" } }, { f1: { caminho: "q/f1.png", mimeType: "image/png" } }, usados), []);
  assert.deepEqual(arquivosParaApagar({ f1: { caminho: "q/f1.png", mimeType: "image/png" }, f9: { caminho: "q/f9.png", mimeType: "image/png" } }, usados), [{ id: "f9", caminho: "q/f9.png" }]);
});

test("textos para busca, assinatura e utilidades", () => {
  assert.equal(textosDaCena(els), "Olá mundo");
  assert.notEqual(assinaturaDaCena(els), assinaturaDaCena([...els, { id: "z", type: "text", version: 1 }]));
  assert.equal(assinaturaDaCena(els), assinaturaDaCena(els.map((e) => ({ ...e }))));
  assert.equal(extensaoDoMime("image/jpeg"), "jpg");
  assert.equal(extensaoDoMime("image/svg+xml"), "svg");
  assert.equal(extensaoDoMime("application/x"), "bin");
  assert.deepEqual(centroDaTela({ scrollX: -100, scrollY: -50, width: 800, height: 600, zoom: { value: 2 } }), { x: 300, y: 200 });
});
