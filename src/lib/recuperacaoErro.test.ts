import test from "node:test";
import assert from "node:assert/strict";
import { ehCodigoDesatualizado, podeRecarregar, INTERVALO_MIN_RECARGA_MS } from "./recuperacaoErro.ts";

test("reconhece falha ao buscar código de uma versão anterior do site", () => {
  assert.equal(ehCodigoDesatualizado(new TypeError("Failed to fetch dynamically imported module: https://x/assets/pdfs-abc.js")), true);
  assert.equal(ehCodigoDesatualizado(new Error("error loading dynamically imported module")), true);
  assert.equal(ehCodigoDesatualizado(new TypeError("Importing a module script failed.")), true);
  assert.equal(ehCodigoDesatualizado({ name: "ChunkLoadError", message: "Loading chunk 12 failed." }), true);
  assert.equal(ehCodigoDesatualizado(new Error("Unable to preload CSS for /assets/index-1.css")), true);
  assert.equal(ehCodigoDesatualizado(new Error("Cannot read properties of undefined (reading 'nome')")), false);
  assert.equal(ehCodigoDesatualizado(null), false);
});

test("só recarrega a página se a última recarga automática foi há mais de 20 s (evita laço)", () => {
  assert.equal(INTERVALO_MIN_RECARGA_MS, 20_000);
  assert.equal(podeRecarregar(null, 1_000_000), true);
  assert.equal(podeRecarregar(1_000_000 - 25_000, 1_000_000), true);
  assert.equal(podeRecarregar(1_000_000 - 5_000, 1_000_000), false);
});
