import test from "node:test";
import assert from "node:assert/strict";
import { traduzirExcalidraw } from "./fluxoTraducoes.ts";

test("texto exato, mantendo os espaços em volta", () => {
  assert.equal(traduzirExcalidraw("Sharp arrow"), "Seta reta");
  assert.equal(traduzirExcalidraw(" Code "), " Código ");
  assert.equal(traduzirExcalidraw("Hand-drawn"), "Manuscrito");
});

test("dicas com Ctrl/Cmd e atalho no fim da frase", () => {
  assert.equal(traduzirExcalidraw("Hold Ctrl and Arrow key to create a flowchart"), "Segure Ctrl e aperte uma seta do teclado para criar um fluxograma");
  assert.equal(traduzirExcalidraw("Hold Cmd to disable snapping"), "Segure Cmd para não encaixar");
  assert.equal(traduzirExcalidraw("For Command palette, use Ctrl+/"), "Paleta de comandos: Ctrl+/");
  assert.equal(
    traduzirExcalidraw("Click to start multiple points, drag for single line. Press A again to change arrow type."),
    "Clique no início e clique no destino, ou arraste. Aperte A de novo para mudar o tipo de seta.",
  );
});

test("duas dicas na mesma linha: só a parte em inglês muda", () => {
  assert.equal(
    traduzirExcalidraw("Pressione Enter para adicionar o texto. Hold Ctrl and Arrow key to create a flowchart"),
    "Pressione Enter para adicionar o texto. Segure Ctrl e aperte uma seta do teclado para criar um fluxograma",
  );
});

test("português, números e palavras soltas dentro de frases ficam como estão", () => {
  assert.equal(traduzirExcalidraw("Arquiteto"), null);
  assert.equal(traduzirExcalidraw("100%"), null);
  assert.equal(traduzirExcalidraw("Texto do card"), null);
  assert.equal(traduzirExcalidraw("My Code snippet"), null);
});
