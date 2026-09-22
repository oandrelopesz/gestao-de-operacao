import test from "node:test";
import assert from "node:assert/strict";
import { ehAdsLibrary, idDoAnuncio, escolherMidias, baixarAnuncio, midiasDoHtml } from "../src/jobs/adslibrary.js";
import { baixar } from "../src/jobs/download.js";

test("ehAdsLibrary reconhece só o link de anúncio da Ads Library (com id)", () => {
  assert.ok(ehAdsLibrary("https://www.facebook.com/ads/library/?id=1196920881913840"));
  assert.ok(ehAdsLibrary("https://www.facebook.com/ads/library/?active_status=all&country=BR&id=1196920881913840&media_type=all"));
  assert.ok(!ehAdsLibrary("https://www.facebook.com/ads/library/?q=nike&country=BR"));
  assert.ok(!ehAdsLibrary("https://www.facebook.com/reel/123"));
  assert.ok(!ehAdsLibrary("não é url"));
});

test("idDoAnuncio tira o id da query", () => {
  assert.equal(idDoAnuncio("https://www.facebook.com/ads/library/?country=BR&id=1196920881913840&x=1"), "1196920881913840");
  assert.equal(idDoAnuncio("https://www.facebook.com/ads/library/?q=nike"), null);
});

test("escolherMidias: anúncio de vídeo fica só com o vídeo (poster e miniaturas caem)", () => {
  const r = escolherMidias([
    { tipo: "imagem", url: "https://scontent.fbcdn.net/poster.jpg", largura: 480 },
    { tipo: "video", url: "https://video.fbcdn.net/o1/v/a.mp4?x=1" },
    { tipo: "imagem", url: "https://scontent.fbcdn.net/avatar.jpg", largura: 40 },
  ]);
  assert.deepEqual(r, [{ tipo: "video", url: "https://video.fbcdn.net/o1/v/a.mp4?x=1" }]);
});

test("escolherMidias: estático fica com as imagens grandes, sem repetir a mesma imagem", () => {
  const r = escolherMidias([
    { tipo: "imagem", url: "https://scontent.fbcdn.net/avatar.jpg", largura: 40 },
    { tipo: "imagem", url: "https://scontent.fbcdn.net/a.jpg?oh=1", largura: 480 },
    { tipo: "imagem", url: "https://scontent.fbcdn.net/a.jpg?oh=2", largura: 480 },
    { tipo: "imagem", url: "https://scontent.fbcdn.net/b.jpg?oh=3", largura: 600 },
  ]);
  assert.deepEqual(r.map((m) => m.url), ["https://scontent.fbcdn.net/a.jpg?oh=1", "https://scontent.fbcdn.net/b.jpg?oh=3"]);
});

function pagina({ midias, tipos = {} }) {
  const gravados = [];
  return {
    gravados,
    abrirAnuncio: async () => ({
      midias: async () => midias,
      baixar: async (url) => ({ corpo: Buffer.from("bytes de " + url), tipo: tipos[url] || (url.startsWith("https://video.") ? "video/mp4" : "image/jpeg") }),
      fechar: async () => {},
    }),
    gravar: async (caminho, corpo) => { gravados.push({ caminho, bytes: corpo.length }); },
  };
}

test("baixarAnuncio: vídeo vira anuncio-1.mp4 em modo unico", async () => {
  const d = pagina({ midias: [
    { tipo: "imagem", url: "https://scontent.fbcdn.net/poster.jpg", largura: 480 },
    { tipo: "video", url: "https://video.fbcdn.net/o1/v/a?x=1" },
  ] });
  const r = await baixarAnuncio({ link: "https://www.facebook.com/ads/library/?id=1", dir: "/tmp/j" }, d);
  assert.deepEqual(r, { arquivos: ["/tmp/j/anuncio-1.mp4"], modo: "unico" });
  assert.deepEqual(d.gravados, [{ caminho: "/tmp/j/anuncio-1.mp4", bytes: "bytes de https://video.fbcdn.net/o1/v/a?x=1".length }]);
});

test("baixarAnuncio: três imagens viram carrossel com extensão pelo content-type", async () => {
  const d = pagina({
    midias: [1, 2, 3].map((n) => ({ tipo: "imagem", url: `https://scontent.fbcdn.net/${n}.jpg`, largura: 480 })),
    tipos: { "https://scontent.fbcdn.net/2.jpg": "image/png" },
  });
  const r = await baixarAnuncio({ link: "https://www.facebook.com/ads/library/?id=1", dir: "/tmp/j" }, d);
  assert.equal(r.modo, "carrossel");
  assert.deepEqual(r.arquivos, ["/tmp/j/anuncio-1.jpg", "/tmp/j/anuncio-2.png", "/tmp/j/anuncio-3.jpg"]);
});

test("baixarAnuncio: card sem mídia dá erro claro", async () => {
  const d = pagina({ midias: [] });
  await assert.rejects(
    baixarAnuncio({ link: "https://www.facebook.com/ads/library/?id=1", dir: "/tmp/j" }, d),
    /Anúncio não encontrado na Ads Library/,
  );
});

test("baixar() desvia link da Ads Library para baixarAnuncio sem chamar yt-dlp", async () => {
  const chamadas = [];
  const d = {
    rodar: async (cmd) => { chamadas.push(cmd); return { stdout: "", stderr: "" }; },
    listarMidias: async () => [],
    existeArquivo: () => true,
    baixarAnuncio: async ({ link, dir }) => ({ arquivos: [`${dir}/anuncio-1.mp4`], modo: "unico", link }),
  };
  const r = await baixar({ link: "https://www.facebook.com/ads/library/?id=1196920881913840", rede: "facebook", dir: "/tmp/j" }, d);
  assert.equal(r.modo, "unico");
  assert.deepEqual(chamadas, []);
});

const HTML = "...\"ad_archive_id\":\"111\",\"snapshot\":{\"images\":[{\"original_image_url\":\"https:\\/\\/sc.fbcdn.net\\/orig1.jpg\",\"resized_image_url\":\"https:\\/\\/sc.fbcdn.net\\/small1.jpg\"}],\"videos\":[],\"cards\":[]},{\"ad_archive_id\":\"222\",\"snapshot\":{\"images\":[{\"original_image_url\":\"https:\\/\\/sc.fbcdn.net\\/poster2.jpg\",\"resized_image_url\":\"https:\\/\\/sc.fbcdn.net\\/small2.jpg\"}],\"videos\":[{\"video_hd_url\":\"https:\\/\\/v.fbcdn.net\\/hd2.mp4\",\"video_sd_url\":\"https:\\/\\/v.fbcdn.net\\/sd2.mp4\"}],\"cards\":[]}}";

test("midiasDoHtml: anuncio estatico devolve a imagem ORIGINAL (nao a resized)", () => {
  assert.deepEqual(midiasDoHtml(HTML, "111"), [{ tipo: "imagem", url: "https://sc.fbcdn.net/orig1.jpg", largura: 9999 }]);
});

test("midiasDoHtml: anuncio de video devolve o HD; escolherMidias descarta o poster", () => {
  const m = midiasDoHtml(HTML, "222");
  assert.ok(m.some((x) => x.tipo === "video" && x.url === "https://v.fbcdn.net/hd2.mp4"));
  assert.deepEqual(escolherMidias(m), [{ tipo: "video", url: "https://v.fbcdn.net/hd2.mp4" }]);
});

test("midiasDoHtml: com HD presente, o SD do mesmo video (outra pasta) e ignorado", () => {
  const html = '"ad_archive_id":"333","snapshot":{"images":[],"videos":[{"video_hd_url":"https:\\/\\/v.fbcdn.net\\/m366\\/hd.mp4","video_sd_url":"https:\\/\\/v.fbcdn.net\\/m69\\/sd.mp4"}],"cards":[]}}';
  const m = midiasDoHtml(html, "333");
  assert.deepEqual(m, [{ tipo: "video", url: "https://v.fbcdn.net/m366/hd.mp4" }]);
});

test("midiasDoHtml: id ausente devolve vazio (cai no fallback do DOM)", () => {
  assert.deepEqual(midiasDoHtml(HTML, "999"), []);
});

test("midiasDoHtml: le so o anuncio do id, nao vaza midia do vizinho", () => {
  const m = midiasDoHtml(HTML, "111");
  assert.ok(!m.some((x) => /2\.(jpg|mp4)/.test(x.url)));
});
