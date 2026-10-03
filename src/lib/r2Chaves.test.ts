import test from "node:test";
import assert from "node:assert/strict";
import { MODULOS_R2, arquivoDaImagemNota, caminhoValido, chaveR2, urlImagemNota } from "./r2Chaves.ts";

const SB = "https://abc.supabase.co";

test("MODULOS_R2 liga cada módulo ao bucket antigo do Supabase", () => {
  assert.deepEqual(MODULOS_R2, { arquivos: "pdfs", notas: "notas", fluxogramas: "fluxogramas", instagram: "instagram" });
});

test("caminhoValido aceita caminhos normais e recusa os perigosos", () => {
  assert.equal(caminhoValido("123e4567.pdf"), true);
  assert.equal(caminhoValido("fluxo-1/img.png"), true);
  for (const ruim of ["", "/abc.pdf", "a//b.png", "../x", "a/../b", "a/./b", "a\\b", "a\nb", "a\tb"]) {
    assert.equal(caminhoValido(ruim), false, JSON.stringify(ruim));
  }
});

test("chaveR2 põe o módulo na frente e recusa lixo", () => {
  assert.equal(chaveR2("arquivos", "123e4567.pdf"), "arquivos/123e4567.pdf");
  assert.equal(chaveR2("fluxogramas", "f1/i1.png"), "fluxogramas/f1/i1.png");
  assert.throws(() => chaveR2("arquivos", "../segredo"), /inválido/);
  assert.throws(() => chaveR2("outro" as never, "a.pdf"), /Módulo inválido/);
  assert.throws(() => chaveR2("notas", "x".repeat(600)), /longo/);
});

test("urlImagemNota e arquivoDaImagemNota: ida e volta", () => {
  const url = urlImagemNota(`${SB}/`, "abc d.webp");
  assert.equal(url, `${SB}/functions/v1/r2?c=notas%2Fabc%20d.webp`);
  assert.equal(arquivoDaImagemNota(url), "abc d.webp");
});

test("arquivoDaImagemNota reconhece o endereço antigo e ignora imagens de fora", () => {
  assert.equal(arquivoDaImagemNota(`${SB}/storage/v1/object/public/notas/abc%20d.webp?x=1`), "abc d.webp");
  assert.equal(arquivoDaImagemNota("https://site.com/b.png"), null);
  assert.equal(arquivoDaImagemNota(`${SB}/functions/v1/r2?c=arquivos%2Fa.pdf`), null);
  assert.equal(arquivoDaImagemNota(`${SB}/functions/v1/r2?c=notas%2F..%2Fx`), null);
});

test("arquivoDaImagemNota nunca lança e recusa caminho perigoso também no endereço antigo", () => {
  assert.equal(arquivoDaImagemNota(`${SB}/storage/v1/object/public/notas/..%2Fx`), null);
  assert.equal(arquivoDaImagemNota(`${SB}/storage/v1/object/public/notas/a%zz.png`), null);
  assert.equal(arquivoDaImagemNota(`${SB}/functions/v1/r2?c=%zz`), null);
});