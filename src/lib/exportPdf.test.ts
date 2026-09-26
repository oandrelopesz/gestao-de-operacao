import test from "node:test";
import assert from "node:assert/strict";
import { DocumentoPdf, larguraTexto, paraWinAnsi, quebrarTexto } from "./exportPdf.ts";

const texto = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

test("WinAnsi: acentos, travessão e trocas", () => {
  assert.deepEqual(Array.from(paraWinAnsi("ção")), [0xe7, 0xe3, 0x6f]);
  assert.deepEqual(Array.from(paraWinAnsi("—“”•€")), [0x97, 0x93, 0x94, 0x95, 0x80]);
  assert.equal(texto(paraWinAnsi("A → B ✓ 😀")), "A -> B ? ?");
});

test("largura e quebra de linhas", () => {
  assert.equal(larguraTexto("Ana", 10, false), (667 + 556 + 556) / 100);
  assert.ok(larguraTexto("Ana", 10, true) > larguraTexto("Ana", 10, false));
  const linhas = quebrarTexto("uma frase um pouco mais longa que a largura disponível\nsegunda linha", 100, 10, false);
  assert.ok(linhas.length >= 3);
  for (const l of linhas) assert.ok(larguraTexto(l, 10, false) <= 100, `"${l}" passou da largura`);
  assert.equal(linhas[linhas.length - 1], "segunda linha");
  const palavraGigante = quebrarTexto("x".repeat(80), 50, 10, false);
  assert.ok(palavraGigante.length > 1);
  assert.deepEqual(quebrarTexto("", 100, 10, false), [""]);
});

test("PDF com páginas, xref certo e fontes", () => {
  const doc = new DocumentoPdf();
  doc.novaPagina();
  doc.texto(40, 60, "Olá, Ação (1)", 12, { negrito: true });
  doc.retangulo(40, 80, 100, 20, [0.1, 0.2, 0.3]);
  doc.novaPagina();
  doc.linha(40, 100, 200, 100, [0, 0, 0], 1);
  doc.texto(40, 120, "Segunda página", 10, {}, 0);
  const pdf = doc.gerar("Teste");
  const s = texto(pdf);
  assert.ok(s.startsWith("%PDF-1.4"));
  assert.ok(s.trimEnd().endsWith("%%EOF"));
  assert.match(s, /\/Type \/Pages \/Kids \[[^\]]+\] \/Count 2/);
  assert.match(s, /\/BaseFont \/Helvetica-Bold \/Encoding \/WinAnsiEncoding/);
  const xref = Number(/startxref\s+(\d+)/.exec(s)![1]);
  assert.equal(s.slice(xref, xref + 4), "xref");
  const entradas = s.slice(xref).split("\n").slice(2).filter((l) => / n\s*$/.test(l));
  for (const [i, e] of entradas.entries()) {
    const off = Number(e.slice(0, 10));
    assert.equal(s.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`);
  }
  // "Olá" em hex WinAnsi: 4F 6C E1
  assert.match(s, /<4F6CE12C20/i);
});
