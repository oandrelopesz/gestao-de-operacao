import test from "node:test";
import assert from "node:assert/strict";
import { escolherMidiaDaPagina, capturarMidiaDaPagina } from "../src/jobs/pagina.js";

const v = (url, tamanho, tipo = "video/mp4") => ({ url, tamanho, tipo });
const i = (url, tamanho, tipo = "image/jpeg") => ({ url, tamanho, tipo });

test("escolherMidiaDaPagina: mp4 direto vence, o maior (o player baixa miniaturas e testes de autoplay)", () => {
  const r = escolherMidiaDaPagina({
    videos: [v("https://cdn/teste-autoplay.mp4", 1600), v("https://cdn/anuncio.mp4", 5_000_000), v("https://cdn/preview.mp4", 300_000)],
    imagens: [i("https://cdn/capa.jpg", 400_000)],
    embeds: [],
  });
  assert.deepEqual(r, { tipo: "arquivo", url: "https://cdn/anuncio.mp4", extensao: "mp4" });
});

test("escolherMidiaDaPagina: sem mp4, HLS ou embed vão para o yt-dlp", () => {
  assert.deepEqual(escolherMidiaDaPagina({ videos: [], imagens: [], embeds: ["https://cdn/master.m3u8"] }), { tipo: "ytdlp", url: "https://cdn/master.m3u8" });
  assert.deepEqual(escolherMidiaDaPagina({ videos: [], imagens: [], embeds: ["https://www.youtube.com/embed/abc"] }), { tipo: "ytdlp", url: "https://www.youtube.com/embed/abc" });
});

test("escolherMidiaDaPagina: sem vídeo, a maior imagem acima de 30 KB (logo e ícone ficam de fora)", () => {
  const r = escolherMidiaDaPagina({
    videos: [],
    imagens: [i("https://cdn/logo.png", 8_000, "image/png"), i("https://cdn/criativo.png", 250_000, "image/png"), i("https://cdn/banner.webp", 90_000, "image/webp")],
    embeds: [],
  });
  assert.deepEqual(r, { tipo: "arquivo", url: "https://cdn/criativo.png", extensao: "png" });
});

test("escolherMidiaDaPagina: mp4 minúsculo (<100 KB) não conta como vídeo", () => {
  const r = escolherMidiaDaPagina({ videos: [v("https://cdn/x.mp4", 50_000)], imagens: [i("https://cdn/c.jpg", 60_000)], embeds: [] });
  assert.equal(r.url, "https://cdn/c.jpg");
});

test("escolherMidiaDaPagina: nada aproveitável devolve null", () => {
  assert.equal(escolherMidiaDaPagina({ videos: [], imagens: [i("https://cdn/icone.png", 2_000)], embeds: [] }), null);
});

test("capturarMidiaDaPagina: baixa o arquivo escolhido pelo navegador e fecha a página", async () => {
  let fechou = false;
  const gravados = [];
  const r = await capturarMidiaDaPagina({ link: "https://ads.tiktok.com/x", dir: "/tmp/j" }, {
    abrirPagina: async () => ({
      colhido: () => ({ videos: [v("https://cdn/anuncio.mp4", 2_000_000)], imagens: [], embeds: [] }),
      baixar: async () => ({ corpo: Buffer.from("mp4"), tipo: "video/mp4" }),
      fechar: async () => { fechou = true; },
    }),
    gravar: async (caminho) => { gravados.push(caminho); },
  });
  assert.deepEqual(r, { arquivos: ["/tmp/j/pagina-1.mp4"], modo: "unico" });
  assert.deepEqual(gravados, ["/tmp/j/pagina-1.mp4"]);
  assert.equal(fechou, true);
});

test("capturarMidiaDaPagina: HLS/embed é entregue ao yt-dlp e devolve o que ele baixou", async () => {
  let chamou;
  const r = await capturarMidiaDaPagina({ link: "https://adstransparency.google.com/x", dir: "/tmp/j" }, {
    abrirPagina: async () => ({ colhido: () => ({ videos: [], imagens: [], embeds: ["https://www.youtube.com/embed/abc"] }), fechar: async () => {} }),
    baixarComYtDlp: async (url) => { chamou = url; return ["/tmp/j/abc.mp4"]; },
  });
  assert.equal(chamou, "https://www.youtube.com/embed/abc");
  assert.deepEqual(r, { arquivos: ["/tmp/j/abc.mp4"], modo: "unico" });
});

test("capturarMidiaDaPagina: página sem mídia vira erro claro (e fecha a página)", async () => {
  let fechou = false;
  await assert.rejects(
    () => capturarMidiaDaPagina({ link: "https://x", dir: "/tmp/j" }, {
      abrirPagina: async () => ({ colhido: () => ({ videos: [], imagens: [], embeds: [] }), fechar: async () => { fechou = true; } }),
    }),
    /nenhum vídeo ou imagem/i,
  );
  assert.equal(fechou, true);
});

test("escolherMidiaDaPagina: somenteVideo não aceita imagem (miniatura não é o vídeo)", () => {
  const r = escolherMidiaDaPagina({ videos: [], imagens: [i("https://cdn/thumb.jpg", 400_000)], embeds: [] }, { somenteVideo: true });
  assert.equal(r, null);
});

test("capturarMidiaDaPagina: vídeo do YouTube que não baixa explica o motivo e o que fazer", async () => {
  await assert.rejects(
    () => capturarMidiaDaPagina({ link: "https://adstransparency.google.com/x", dir: "/tmp/j" }, {
      abrirPagina: async () => ({ colhido: () => ({ videos: [], imagens: [], embeds: ["https://www.youtube.com/embed/abc"] }), fechar: async () => {} }),
      baixarComYtDlp: async () => [],
    }),
    /YouTube.*Enviar arquivo/,
  );
});
