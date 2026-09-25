import test from "node:test";
import assert from "node:assert/strict";
import {
  ehAdsLibrary, idDoAnuncio, idDaPagina, escolherMidias, baixarAnuncio, midiasDoHtml, anunciosDoHtml, anuncioDaCategoria,
} from "../src/jobs/adslibrary.js";
import { baixar } from "../src/jobs/download.js";

const LINK_PAGINA = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&view_all_page_id=1151814758018183";

test("ehAdsLibrary reconhece anúncio (id), página do anunciante e busca da Ads Library", () => {
  assert.ok(ehAdsLibrary("https://www.facebook.com/ads/library/?id=1196920881913840"));
  assert.ok(ehAdsLibrary("https://www.facebook.com/ads/library/?active_status=all&country=BR&id=1196920881913840&media_type=all"));
  assert.ok(ehAdsLibrary(LINK_PAGINA));
  // busca não aponta um anúncio: vai para o leitor da Ads Library, que explica o que colar
  assert.ok(ehAdsLibrary("https://www.facebook.com/ads/library/?q=nike&country=BR"));
  assert.ok(!ehAdsLibrary("https://www.facebook.com/reel/123"));
  assert.ok(!ehAdsLibrary("https://www.facebook.com/adsmanager/?id=1"));
  assert.ok(!ehAdsLibrary("não é url"));
});

test("idDoAnuncio tira o id da query", () => {
  assert.equal(idDoAnuncio("https://www.facebook.com/ads/library/?country=BR&id=1196920881913840&x=1"), "1196920881913840");
  assert.equal(idDoAnuncio("https://www.facebook.com/ads/library/?q=nike"), null);
  assert.equal(idDoAnuncio(LINK_PAGINA), null);
});

test("idDaPagina tira o view_all_page_id do link da página do anunciante", () => {
  assert.equal(idDaPagina(LINK_PAGINA), "1151814758018183");
  assert.equal(idDaPagina("https://www.facebook.com/ads/library/?id=1"), null);
  assert.equal(idDaPagina("https://www.facebook.com/reel/1?view_all_page_id=2"), null);
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

// ---- JSON embutido na página (formato real da Ads Library, com as barras escapadas) ----

const url = (nome) => `https://scontent.fbcdn.net/v/${nome}?oh=1&oe=2`;
const vid = (nome) => `https://video.fbcdn.net/o1/v/${nome}?efg=1`;
const cardImagem = (n) => ({ body: " ", title: " ", video_hd_url: null, video_sd_url: null, video_preview_image_url: null, original_image_url: url(`orig${n}.jpg`), resized_image_url: url(`res${n}.jpg`) });
const cardVideo = (n) => ({ body: " ", title: " ", video_hd_url: vid(`hd${n}.mp4`), video_sd_url: vid(`sd${n}.mp4`), video_preview_image_url: url(`poster${n}.jpg`), original_image_url: null, resized_image_url: null });
const anuncioVideo = (n) => ({ display_format: "VIDEO", cards: [], images: [], videos: [{ video_hd_url: vid(`hd${n}.mp4`), video_sd_url: vid(`sd${n}.mp4`), video_preview_image_url: url(`poster${n}.jpg`) }] });
const anuncioImagem = (n) => ({ display_format: "IMAGE", cards: [], images: [{ original_image_url: url(`orig${n}.jpg`), resized_image_url: url(`res${n}.jpg`) }], videos: [] });
const carrossel = (cards) => ({ display_format: "CAROUSEL", cards, images: [], videos: [] });

/** Monta o trecho do HTML como a Ads Library embute: um objeto por anúncio, "\/" nas URLs. */
function htmlCom(anuncios) {
  const corpo = anuncios.map(([id, snapshot]) => JSON.stringify({ ad_archive_id: id, collation_count: 1, is_active: true, page_id: "1151814758018183", snapshot })).join(",");
  return `<html><script>{"require":[["x",{"results":[${corpo.replace(/\//g, "\\/")}]}]]}</script></html>`;
}

// Página real da Dra Rita (25/09/2026), com um vídeo na frente para garantir que a escolha é pelo formato
const HTML_PAGINA = htmlCom([
  ["1581099423554883", anuncioVideo(1)],
  ["902383655891168", carrossel([cardImagem(1), cardImagem(2), cardImagem(3)])],
  ["1041491755549981", anuncioVideo(2)],
]);

test("anunciosDoHtml: lê cada anúncio na ordem da página, com formato e cards", () => {
  const a = anunciosDoHtml(HTML_PAGINA);
  assert.deepEqual(a.map((x) => [x.id, x.formato, x.cards]), [
    ["1581099423554883", "VIDEO", 0],
    ["902383655891168", "CAROUSEL", 3],
    ["1041491755549981", "VIDEO", 0],
  ]);
});

test("anunciosDoHtml: carrossel de imagens devolve um arquivo por card, na ordem, com a imagem ORIGINAL", () => {
  const c = anunciosDoHtml(HTML_PAGINA).find((x) => x.id === "902383655891168");
  assert.deepEqual(c.midias, [1, 2, 3].map((n) => ({ tipo: "imagem", url: url(`orig${n}.jpg`) })));
});

test("anunciosDoHtml: carrossel misto guarda o vídeo E as imagens, cada card no seu lugar", () => {
  const [c] = anunciosDoHtml(htmlCom([["7", carrossel([cardImagem(1), cardVideo(2), cardImagem(3)])]]));
  assert.deepEqual(c.midias, [
    { tipo: "imagem", url: url("orig1.jpg") },
    { tipo: "video", url: vid("hd2.mp4") },
    { tipo: "imagem", url: url("orig3.jpg") },
  ]);
});

test("anunciosDoHtml: card sem HD usa o SD; imagem sem original usa a redimensionada", () => {
  const semHd = { ...cardVideo(1), video_hd_url: null };
  const semOriginal = { ...cardImagem(2), original_image_url: null };
  const [c] = anunciosDoHtml(htmlCom([["7", carrossel([semHd, semOriginal])]]));
  assert.deepEqual(c.midias, [{ tipo: "video", url: vid("sd1.mp4") }, { tipo: "imagem", url: url("res2.jpg") }]);
});

test("anunciosDoHtml: um anúncio repetido na página conta uma vez só", () => {
  const a = anunciosDoHtml(htmlCom([["7", anuncioVideo(1)], ["7", anuncioVideo(1)], ["8", anuncioImagem(1)]]));
  assert.deepEqual(a.map((x) => x.id), ["7", "8"]);
});

const HTML = "...\"ad_archive_id\":\"111\",\"snapshot\":{\"images\":[{\"original_image_url\":\"https:\\/\\/sc.fbcdn.net\\/orig1.jpg\",\"resized_image_url\":\"https:\\/\\/sc.fbcdn.net\\/small1.jpg\"}],\"videos\":[],\"cards\":[]},{\"ad_archive_id\":\"222\",\"snapshot\":{\"images\":[{\"original_image_url\":\"https:\\/\\/sc.fbcdn.net\\/poster2.jpg\",\"resized_image_url\":\"https:\\/\\/sc.fbcdn.net\\/small2.jpg\"}],\"videos\":[{\"video_hd_url\":\"https:\\/\\/v.fbcdn.net\\/hd2.mp4\",\"video_sd_url\":\"https:\\/\\/v.fbcdn.net\\/sd2.mp4\"}],\"cards\":[]}}";

test("midiasDoHtml: anuncio estatico devolve a imagem ORIGINAL (nao a resized)", () => {
  assert.deepEqual(midiasDoHtml(HTML, "111"), [{ tipo: "imagem", url: "https://sc.fbcdn.net/orig1.jpg" }]);
});

test("midiasDoHtml: anuncio de video devolve só o HD (o poster em images cai)", () => {
  assert.deepEqual(midiasDoHtml(HTML, "222"), [{ tipo: "video", url: "https://v.fbcdn.net/hd2.mp4" }]);
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

// ---- Qual anúncio da página do anunciante vale para a categoria do item ----

test("anuncioDaCategoria: carrossel pega o primeiro CAROUSEL mesmo com vídeo na frente", () => {
  assert.equal(anuncioDaCategoria(anunciosDoHtml(HTML_PAGINA), "carrossel").id, "902383655891168");
});

test("anuncioDaCategoria: vídeo pega o primeiro VIDEO; estático o primeiro IMAGE", () => {
  const a = anunciosDoHtml(htmlCom([["1", carrossel([cardImagem(1), cardImagem(2)])], ["2", anuncioImagem(1)], ["3", anuncioVideo(1)]]));
  assert.equal(anuncioDaCategoria(a, "video_anuncio").id, "3");
  assert.equal(anuncioDaCategoria(a, "video_organico").id, "3");
  assert.equal(anuncioDaCategoria(a, "anuncio_estatico").id, "2");
  assert.equal(anuncioDaCategoria(a, "post_estatico").id, "2");
  // categoria sem formato próprio (oferta etc.): o primeiro da página
  assert.equal(anuncioDaCategoria(a, "oferta").id, "1");
});

test("anuncioDaCategoria: formato desconhecido com vários cards (DCO etc.) também é carrossel", () => {
  const a = anunciosDoHtml(htmlCom([["1", anuncioVideo(1)], ["2", { ...carrossel([cardImagem(1), cardImagem(2)]), display_format: "DCO" }]]));
  assert.equal(anuncioDaCategoria(a, "carrossel").id, "2");
});

test("anuncioDaCategoria: sem anúncio do formato devolve null", () => {
  assert.equal(anuncioDaCategoria(anunciosDoHtml(htmlCom([["1", anuncioVideo(1)]])), "carrossel"), null);
});

// ---- baixarAnuncio com página falsa ----

function pagina({ html = "", dom = [], tipos = {} }) {
  const gravados = [];
  const abertos = [];
  return {
    gravados,
    abertos,
    abrirAnuncio: async (link, alvo) => {
      abertos.push(alvo);
      return {
        html: async () => html,
        midiasDoDom: async () => dom,
        baixar: async (u) => ({ corpo: Buffer.from("bytes de " + u), tipo: tipos[u] || (u.startsWith("https://video.") ? "video/mp4" : "image/jpeg") }),
        fechar: async () => {},
      };
    },
    gravar: async (caminho, corpo) => { gravados.push({ caminho, bytes: corpo.length }); },
  };
}

test("baixarAnuncio: link da página do anunciante + categoria carrossel baixa os cards do carrossel", async () => {
  const d = pagina({ html: HTML_PAGINA });
  const r = await baixarAnuncio({ link: LINK_PAGINA, dir: "/tmp/j", categoria: "carrossel" }, d);
  assert.deepEqual(r, { arquivos: ["/tmp/j/anuncio-1.jpg", "/tmp/j/anuncio-2.jpg", "/tmp/j/anuncio-3.jpg"], modo: "carrossel" });
  assert.deepEqual(d.gravados.map((g) => g.bytes), [1, 2, 3].map((n) => ("bytes de " + url(`orig${n}.jpg`)).length));
  assert.deepEqual(d.abertos, [{ pagina: "1151814758018183" }]);
});

test("baixarAnuncio: página sem carrossel dá erro dizendo o que colar", async () => {
  const d = pagina({ html: htmlCom([["1", anuncioVideo(1)], ["2", anuncioVideo(2)]]) });
  await assert.rejects(
    baixarAnuncio({ link: LINK_PAGINA, dir: "/tmp/j", categoria: "carrossel" }, d),
    /2 anúncios.*nenhum é carrossel.*Identificação da biblioteca/s,
  );
  assert.deepEqual(d.gravados, []);
});

test("baixarAnuncio: página sem anúncio nenhum no HTML dá erro claro", async () => {
  const d = pagina({ html: "<html></html>" });
  await assert.rejects(
    baixarAnuncio({ link: LINK_PAGINA, dir: "/tmp/j", categoria: "carrossel" }, d),
    /não trouxe nenhum anúncio/,
  );
});

test("baixarAnuncio: link de busca (sem id nem página) pede o link do anúncio, sem abrir o navegador", async () => {
  const d = pagina({ html: HTML_PAGINA });
  await assert.rejects(
    baixarAnuncio({ link: "https://www.facebook.com/ads/library/?q=emagrecimento&country=BR", dir: "/tmp/j", categoria: "carrossel" }, d),
    /Identificação da biblioteca/,
  );
  assert.deepEqual(d.abertos, []);
});

test("baixarAnuncio: link do anúncio de um carrossel misto baixa todos os cards na ordem", async () => {
  const d = pagina({ html: htmlCom([["55", carrossel([cardVideo(1), cardImagem(2), cardImagem(3)])]]) });
  const r = await baixarAnuncio({ link: "https://www.facebook.com/ads/library/?id=55", dir: "/tmp/j", categoria: "carrossel" }, d);
  assert.deepEqual(r, { arquivos: ["/tmp/j/anuncio-1.mp4", "/tmp/j/anuncio-2.jpg", "/tmp/j/anuncio-3.jpg"], modo: "carrossel" });
  assert.deepEqual(d.abertos, [{ id: "55" }]);
});

test("baixarAnuncio: categoria carrossel é sempre pasta, mesmo com um arquivo só", async () => {
  const d = pagina({ html: htmlCom([["55", anuncioImagem(1)]]) });
  const r = await baixarAnuncio({ link: "https://www.facebook.com/ads/library/?id=55", dir: "/tmp/j", categoria: "carrossel" }, d);
  assert.deepEqual(r, { arquivos: ["/tmp/j/anuncio-1.jpg"], modo: "carrossel" });
});

test("baixarAnuncio: sem o JSON, vídeo do DOM vira anuncio-1.mp4 em modo unico", async () => {
  const d = pagina({ dom: [
    { tipo: "imagem", url: "https://scontent.fbcdn.net/poster.jpg", largura: 480 },
    { tipo: "video", url: "https://video.fbcdn.net/o1/v/a?x=1" },
  ] });
  const r = await baixarAnuncio({ link: "https://www.facebook.com/ads/library/?id=1", dir: "/tmp/j", categoria: "video_anuncio" }, d);
  assert.deepEqual(r, { arquivos: ["/tmp/j/anuncio-1.mp4"], modo: "unico" });
  assert.deepEqual(d.gravados, [{ caminho: "/tmp/j/anuncio-1.mp4", bytes: "bytes de https://video.fbcdn.net/o1/v/a?x=1".length }]);
});

test("baixarAnuncio: sem o JSON, três imagens do DOM viram carrossel com extensão pelo content-type", async () => {
  const d = pagina({
    dom: [1, 2, 3].map((n) => ({ tipo: "imagem", url: `https://scontent.fbcdn.net/${n}.jpg`, largura: 480 })),
    tipos: { "https://scontent.fbcdn.net/2.jpg": "image/png" },
  });
  const r = await baixarAnuncio({ link: "https://www.facebook.com/ads/library/?id=1", dir: "/tmp/j" }, d);
  assert.equal(r.modo, "carrossel");
  assert.deepEqual(r.arquivos, ["/tmp/j/anuncio-1.jpg", "/tmp/j/anuncio-2.png", "/tmp/j/anuncio-3.jpg"]);
});

test("baixarAnuncio: card sem mídia dá erro claro", async () => {
  const d = pagina({});
  await assert.rejects(
    baixarAnuncio({ link: "https://www.facebook.com/ads/library/?id=1", dir: "/tmp/j" }, d),
    /Anúncio não encontrado na Ads Library/,
  );
});

// ---- baixar() ----

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

test("baixar() manda a página do anunciante com a categoria para baixarAnuncio e padroniza os cards", async () => {
  const recebido = [];
  const d = {
    rodar: async (cmd) => { throw new Error(`não devia rodar ${cmd}`); },
    listarMidias: async () => [],
    existeArquivo: () => false,
    baixarAnuncio: async (p) => { recebido.push(p); return { arquivos: [`${p.dir}/anuncio-1.webp`, `${p.dir}/anuncio-2.jpg`], modo: "carrossel" }; },
    normalizarFormatos: async (arquivos) => arquivos.map((a) => a.replace(/\.webp$/, ".jpg")),
  };
  const r = await baixar({ link: LINK_PAGINA, rede: "meta_ads", dir: "/tmp/j", categoria: "carrossel" }, d);
  assert.deepEqual(recebido, [{ link: LINK_PAGINA, dir: "/tmp/j", categoria: "carrossel" }]);
  assert.deepEqual(r, { arquivos: ["/tmp/j/anuncio-1.jpg", "/tmp/j/anuncio-2.jpg"], modo: "carrossel" });
});
