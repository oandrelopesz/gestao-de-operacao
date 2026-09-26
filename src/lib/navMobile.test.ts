import test from "node:test";
import assert from "node:assert/strict";
import { ATALHOS_MOBILE, atalhoAtivo } from "./navMobile.ts";

test("atalhos da barra inferior: Demandas, Agenda, Notas e Transcritor, nessa ordem", () => {
  assert.deepEqual(ATALHOS_MOBILE.map((a) => a.to), ["/", "/agenda", "/notas", "/transcritor"]);
});

test("atalhoAtivo: Demandas só na raiz; os outros na própria rota e nas subrotas", () => {
  assert.equal(atalhoAtivo("/", "/"), true);
  assert.equal(atalhoAtivo("/agenda", "/"), false);
  assert.equal(atalhoAtivo("/agenda", "/agenda"), true);
  assert.equal(atalhoAtivo("/notas/123", "/notas"), true);
  assert.equal(atalhoAtivo("/notasx", "/notas"), false);
});
