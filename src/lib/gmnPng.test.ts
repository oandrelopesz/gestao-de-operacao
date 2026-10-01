import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
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

// PNG montado à mão para os testes de proteção: o lerPng não confere o CRC, então ele fica zerado.
const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function bloco(nome: string, dados: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + dados.length);
  out.writeUInt32BE(dados.length, 0);
  out.write(nome, 4, "latin1");
  Buffer.from(dados).copy(out, 8);
  return out;
}
function ihdr(largura: number, altura: number, tipo = 6): Buffer {
  const d = Buffer.alloc(13);
  d.writeUInt32BE(largura, 0);
  d.writeUInt32BE(altura, 4);
  d[8] = 8;
  d[9] = tipo;
  return d;
}
const pngDeBlocos = (...b: Buffer[]) => new Uint8Array(Buffer.concat([ASSINATURA, ...b, bloco("IEND", new Uint8Array(0))]));

test("lerPng só aceita um IHDR, e só como primeiro bloco", async () => {
  const idat = bloco("IDAT", deflateSync(new Uint8Array(1 * (1 * 4 + 1))));
  // 1º IHDR pequeno (passaria numa conferência só do primeiro bloco) e um 2º IHDR com outro tamanho
  await assert.rejects(lerPng(pngDeBlocos(bloco("IHDR", ihdr(1, 1)), bloco("IHDR", ihdr(4000, 3000)), idat)), /PNG inválido/);
  // IHDR que não é o primeiro bloco
  await assert.rejects(lerPng(pngDeBlocos(bloco("tEXt", Buffer.from("texto")), bloco("IHDR", ihdr(1, 1)), idat)), /PNG inválido/);
  // sem IHDR nenhum
  await assert.rejects(lerPng(pngDeBlocos(idat)), /PNG incompleto/);
  // o PNG normal continua passando
  assert.equal((await lerPng(pngDeBlocos(bloco("IHDR", ihdr(1, 1)), idat))).largura, 1);
});

test("lerPng recusa lado acima do teto antes de descomprimir (padrão 4096; o chamador pode baixar o teto)", async () => {
  // IHDR declara 5000x2, mas o fluxo de dados nem chega a ser lido
  const grande = pngDeBlocos(bloco("IHDR", ihdr(5000, 2)), bloco("IDAT", new Uint8Array([1, 2, 3])));
  await assert.rejects(lerPng(grande), /PNG grande demais/);
  const alta = pngDeBlocos(bloco("IHDR", ihdr(2, 5000)), bloco("IDAT", new Uint8Array([1, 2, 3])));
  await assert.rejects(lerPng(alta), /PNG grande demais/);
  // teto menor, passado pelo chamador (a ação da logo usa 2048)
  const png = await gravarPng(imagem(40, 4));
  await assert.rejects(lerPng(png, 32), /PNG grande demais/);
  const lido = await lerPng(png, 40);
  assert.equal(lido.largura, 40);
  assert.equal(lido.altura, 4);
});

test("lerPng para de descomprimir no tamanho que o IHDR declara (bomba de deflate com IHDR 4x4)", async () => {
  const MB = 1024 * 1024;
  const zeros = deflateSync(new Uint8Array(50 * MB), { level: 9 }); // ~50 MB de zeros em poucas dezenas de KB
  assert.ok(zeros.length < 100 * 1024);
  const bomba = pngDeBlocos(bloco("IHDR", ihdr(4, 4)), bloco("IDAT", zeros));
  // Conta quantos bytes a descompressão chegou a produzir (o teste roda no Node; o DecompressionStream é trocado só aqui).
  const global = globalThis as unknown as { DecompressionStream: typeof DecompressionStream };
  const Original = global.DecompressionStream;
  let produzidos = 0;
  global.DecompressionStream = class {
    readonly writable: WritableStream<BufferSource>;
    readonly readable: ReadableStream<Uint8Array>;
    constructor(formato: CompressionFormat) {
      const d = new Original(formato);
      this.writable = d.writable;
      this.readable = d.readable.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(parte, controle) {
          produzidos += parte.length;
          controle.enqueue(parte);
        },
      }));
    }
  } as unknown as typeof DecompressionStream;
  let img: Awaited<ReturnType<typeof lerPng>>;
  try {
    img = await lerPng(bomba);
  } finally {
    global.DecompressionStream = Original;
  }
  assert.equal(img.largura, 4);
  assert.equal(img.altura, 4);
  assert.equal(img.dados.length, 4 * 4 * 4);
  assert.ok(img.dados.every((v) => v === 0));
  assert.ok(produzidos < 8 * MB, `descomprimiu ${produzidos} bytes de 50 MB`);
  // fluxo mais curto do que o IHDR declara continua sendo erro
  const curto = pngDeBlocos(bloco("IHDR", ihdr(8, 8)), bloco("IDAT", deflateSync(new Uint8Array(10))));
  await assert.rejects(lerPng(curto), /PNG corrompido/);
});
