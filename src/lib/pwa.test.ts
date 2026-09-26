import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const pub = (p: string) => new URL(`../../public/${p}`, import.meta.url);
/** Largura e altura de um PNG pelo cabeçalho IHDR. */
const tamanhoPng = (p: string) => { const b = readFileSync(pub(p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test("manifest do app: nome, tela cheia, início e cores", () => {
  const m = JSON.parse(readFileSync(pub("manifest.webmanifest"), "utf8"));
  assert.equal(m.name, "Gestor Pro");
  assert.equal(m.short_name, "Gestor Pro");
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/");
  assert.equal(m.scope, "/");
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
});

test("ícones do manifest existem no tamanho declarado", () => {
  const m = JSON.parse(readFileSync(pub("manifest.webmanifest"), "utf8"));
  const tamanhos = m.icons.map((i: { sizes: string }) => i.sizes).sort();
  assert.deepEqual(tamanhos, ["192x192", "512x512"]);
  for (const i of m.icons) {
    assert.equal(i.type, "image/png");
    assert.deepEqual(tamanhoPng(i.src.replace(/^\//, "")), i.sizes.split("x").map(Number));
  }
});

test("ícone da tela de início do iPhone: 180x180", () => {
  assert.ok(existsSync(pub("icons/apple-touch-icon.png")));
  assert.deepEqual(tamanhoPng("icons/apple-touch-icon.png"), [180, 180]);
});
