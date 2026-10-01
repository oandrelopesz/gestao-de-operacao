import { test } from "node:test";
import assert from "node:assert/strict";
import { gravarPng, lerPng, type ImagemRgba } from "../../supabase/functions/gmn/png.ts";

function imagem(largura: number, altura: number, alfa = 255): ImagemRgba {
  const dados = new Uint8Array(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) {
    dados[i * 4] = (i * 7) % 256; dados[i * 4 + 1] = (i * 13) % 256; dados[i * 4 + 2] = (i * 29) % 256; dados[i * 4 + 3] = alfa;
  }
  return { largura, altura, dados };
}

test("gravarPng/lerPng: ida e volta exata, opaca (sai RGB) e com transparência (sai RGBA)", async () => {
  for (const img of [imagem(37, 23), imagem(16, 9, 128)]) {
    const png = await gravarPng(img);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(png[25], img.dados[3] === 255 ? 2 : 6); // tipo de cor no IHDR
    const volta = await lerPng(png);
    assert.equal(volta.largura, img.largura);
    assert.equal(volta.altura, img.altura);
    assert.deepEqual(volta.dados, img.dados);
  }
});

test("lerPng recusa o que não é PNG de 8 bits RGB/RGBA", async () => {
  await assert.rejects(lerPng(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), /não é PNG/);
  const png = await gravarPng(imagem(4, 4));
  const paleta = new Uint8Array(png);
  paleta[25] = 3; // tipo 3 (paleta) não é suportado
  await assert.rejects(lerPng(paleta), /não suportado/);
});
