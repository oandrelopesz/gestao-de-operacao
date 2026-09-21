import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capturar, ehUrlDeVideo, interagirComoUsuario, umaPlaylistPorPasta, ehVideoDeVerdade, TAMANHO_MINIMO_VSL } from "../src/jobs/lp.js";

test("reconhece URL de vídeo e player conhecido", () => {
  assert.ok(ehUrlDeVideo("https://cdn.site.com/vsl.mp4"));
  assert.ok(ehUrlDeVideo("https://cdn.site.com/stream/master.m3u8?token=1"));
  // Script do player não é vídeo: o yt-dlp salvaria o .js cru como "VSL". O player, ao rodar,
  // dispara as .m3u8 de verdade, e essas sim entram.
  assert.ok(!ehUrlDeVideo("https://scripts.converteai.net/abc/players/xyz/player.js"));
  assert.ok(!ehUrlDeVideo("https://scripts.converteai.net/lib/js/smartplayer-wc/v4/smartplayer.js"));
  assert.ok(ehUrlDeVideo("https://cdn.converteai.net/abc/6a74/main.m3u8"));
  assert.ok(ehUrlDeVideo("https://player.vimeo.com/video/12345"));
  assert.ok(!ehUrlDeVideo("https://cdn.site.com/estilo.css"));
  assert.ok(!ehUrlDeVideo("https://cdn.site.com/foto.jpg"));
});

function deps({ urlsDeVideo = [], falhas = {}, respostasMp4 = [] } = {}) {
  const chamadas = [];
  return {
    chamadas,
    rodar: async (cmd, args) => {
      chamadas.push({ cmd, args });
      if (falhas[cmd.split("/").pop()]) throw falhas[cmd.split("/").pop()];
      return { stdout: "", stderr: "" };
    },
    abrirNavegador: async () => ({
      urlsDeVideo,
      screenshot: async () => { chamadas.push({ cmd: "screenshot", args: [] }); },
      fechar: async () => {},
    }),
    existeArquivo: () => true,
    // respostas de ehMp4 na ordem das chamadas; sem lista, tudo é MP4
    ehMp4: async () => (respostasMp4.length ? respostasMp4.shift() : true),
  };
}

test("captura gera html, zip e print", async () => {
  const d = deps();
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "Landing page - Médico - Dr X" }, d);
  const nomes = r.arquivos.map((a) => a.nome);
  assert.deepEqual(nomes, [
    "Landing page - Médico - Dr X.html",
    "Landing page - Médico - Dr X - mirror.zip",
    "Landing page - Médico - Dr X - print.png",
  ]);
  assert.ok(d.chamadas.some((c) => c.cmd.includes("single-file")));
  assert.ok(d.chamadas.some((c) => c.cmd.includes("wget")));
  assert.ok(d.chamadas.some((c) => c.cmd.includes("zip")));
  assert.ok(d.chamadas.some((c) => c.cmd === "screenshot"));
});

test("espelho usa nomes de arquivo válidos no Windows (sem ? | : nos nomes)", async () => {
  // Sem essa flag o wget grava "estilo.css?ver=1" e "index.html?utm_source=..|..", e o Explorer
  // do Windows recusa o zip inteiro como "pasta inválida".
  const d = deps();
  await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "Site - Nicho - Player" }, d);
  const wget = d.chamadas.find((c) => c.cmd.includes("wget"));
  assert.ok(wget.args.includes("--restrict-file-names=windows"));
});

test("interação simula usuário de verdade: mouse, roda até o fim e volta ao topo", async () => {
  // Sites com WP Rocket "Delay JavaScript execution" só carregam os scripts (inclusive o player da
  // VSL) depois de mousemove/wheel/tecla. scrollBy via JS dispara "scroll", que não conta.
  const eventos = [];
  const pagina = {
    mouse: { move: async (x, y) => eventos.push(["move", x, y]), wheel: async (dx, dy) => eventos.push(["wheel", dy]) },
    keyboard: { press: async (k) => eventos.push(["key", k]) },
    evaluate: async (fn) => (String(fn).includes("scrollHeight") ? 2500 : eventos.push(["evaluate"])),
    waitForTimeout: async () => {},
  };
  await interagirComoUsuario(pagina);
  assert.ok(eventos.some((e) => e[0] === "move"));
  assert.ok(eventos.some((e) => e[0] === "key"));
  const rolado = eventos.filter((e) => e[0] === "wheel").reduce((t, e) => t + e[1], 0);
  assert.ok(rolado >= 2500, "rolou a página toda: " + rolado);
  assert.equal(eventos.at(-1)[0], "evaluate", "termina voltando ao topo");
});

test("arquivo que o yt-dlp gravou mas não é MP4 não vira VSL nem gasta número", async () => {
  // O extrator genérico do yt-dlp salva qualquer URL direta (até um .js) com o nome pedido.
  const d = deps({ urlsDeVideo: ["https://cdn.site.com/v1/a.m3u8", "https://cdn.site.com/v2/b.m3u8"], respostasMp4: [false, true] });
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "Site - Nicho - Player" }, d);
  const nomes = r.arquivos.map((a) => a.nome);
  assert.ok(nomes.includes("Site - Nicho - Player - VSL 01.mp4"));
  assert.ok(!nomes.includes("Site - Nicho - Player - VSL 02.mp4"));
});

test("playlists HLS na mesma pasta são o mesmo vídeo: só a primeira (a master) baixa", () => {
  // VTurb/converteai: main.m3u8 lista video_0.m3u8, video_1.m3u8... na mesma pasta; o player pede a
  // master e depois uma rendição, e sem isto a VSL vinha duas vezes (720p e 360p).
  assert.deepEqual(umaPlaylistPorPasta([
    "https://cdn.converteai.net/acc/6a74/main.m3u8",
    "https://cdn.converteai.net/acc/6a74/video_2.m3u8",
    "https://cdn.converteai.net/acc/6a74/video_0.m3u8",
    "https://cdn.converteai.net/acc/outro/main.m3u8",
    "https://cdn.site.com/vsl.mp4",
  ]), [
    "https://cdn.converteai.net/acc/6a74/main.m3u8",
    "https://cdn.converteai.net/acc/outro/main.m3u8",
    "https://cdn.site.com/vsl.mp4",
  ]);
});

test("captura baixa uma VSL só, mesmo com master e rendição na rede", async () => {
  const d = deps({ urlsDeVideo: ["https://cdn.x.net/acc/vid/main.m3u8", "https://cdn.x.net/acc/vid/video_2.m3u8"] });
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "Site - Nicho - Player" }, d);
  assert.equal(r.arquivos.filter((a) => a.nome.includes("VSL")).length, 1);
  assert.equal(d.chamadas.filter((c) => c.cmd.includes("yt-dlp")).length, 1);
});

test("ehVideoDeVerdade: só MP4 com tamanho de vídeo; .js e o MP4 de 2x2 px do autoplay ficam de fora", async () => {
  const dir = mkdtempSync(join(tmpdir(), "swipe-vsl-"));
  // MP4 real de 2x2 px / 0,12 s que o player VTurb baixa para testar autoplay (capturado em 21/09/2026)
  const autoplay = Buffer.from("AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu5tZGF0", "base64");
  writeFileSync(join(dir, "autoplay.mp4"), autoplay);
  writeFileSync(join(dir, "player.mp4"), "(function(t,n,s){try{n._plt=n._plt||0}catch(e){}})();");
  const grande = Buffer.alloc(TAMANHO_MINIMO_VSL + 1);
  grande.write("ftypisom", 4, "latin1");
  writeFileSync(join(dir, "vsl.mp4"), grande);
  const semCabecalho = Buffer.alloc(TAMANHO_MINIMO_VSL + 1);
  writeFileSync(join(dir, "lixo.mp4"), semCabecalho);
  assert.equal(await ehVideoDeVerdade(join(dir, "autoplay.mp4")), false);
  assert.equal(await ehVideoDeVerdade(join(dir, "player.mp4")), false);
  assert.equal(await ehVideoDeVerdade(join(dir, "lixo.mp4")), false);
  assert.equal(await ehVideoDeVerdade(join(dir, "vsl.mp4")), true);
  assert.equal(await ehVideoDeVerdade(join(dir, "nao-existe.mp4")), false);
});

test("vídeos da página viram arquivos VSL numerados", async () => {
  const d = deps({ urlsDeVideo: ["https://cdn.site.com/a.m3u8", "https://cdn.site.com/b.mp4"] });
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "Site - Nicho - Player" }, d);
  const nomes = r.arquivos.map((a) => a.nome);
  assert.ok(nomes.includes("Site - Nicho - Player - VSL 01.mp4"));
  assert.ok(nomes.includes("Site - Nicho - Player - VSL 02.mp4"));
  assert.equal(d.chamadas.filter((c) => c.cmd.includes("yt-dlp")).length, 2);
});

test("VSL que falha não derruba a captura", async () => {
  const d = deps({ urlsDeVideo: ["https://cdn.site.com/a.m3u8"], falhas: { "yt-dlp": new Error("403") } });
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "Site - N - P" }, d);
  assert.equal(r.arquivos.filter((a) => a.nome.includes("VSL")).length, 0);
  assert.equal(r.arquivos.length, 3);
});

test("single-file falhando derruba o job", async () => {
  const d = deps({ falhas: { "single-file": new Error("chromium morreu") } });
  await assert.rejects(() => capturar({ link: "https://lp.com", dir: "/tmp/j", base: "B" }, d), /chromium morreu/);
});

test("sem orçamento, devolve a LP sem baixar VSL nenhuma", async () => {
  const d = deps({ urlsDeVideo: ["https://cdn.site.com/a.m3u8", "https://cdn.site.com/b.mp4"] });
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "Site - N - P" }, { ...d, orcamentoMs: -1 });
  assert.equal(r.arquivos.filter((a) => a.nome.includes("VSL")).length, 0);
  assert.equal(r.arquivos.length, 3, "html, zip e print continuam sendo entregues");
  assert.equal(d.chamadas.filter((c) => c.cmd.includes("yt-dlp")).length, 0);
});

test("espelho falhando não derruba a captura", async () => {
  const d = deps({ falhas: { zip: new Error("nothing to do") } });
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "LP - N - P" }, d);
  const nomes = r.arquivos.map((a) => a.nome);
  assert.deepEqual(nomes, ["LP - N - P.html", "LP - N - P - print.png"]);
});

test("VSL que sai sem gravar arquivo não gasta número", async () => {
  let vez = 0;
  const d = deps({ urlsDeVideo: ["https://cdn.site.com/a.mp4", "https://cdn.site.com/b.mp4"] });
  d.existeArquivo = () => { vez += 1; return vez > 1; }; // a 1ª não gravou, a 2ª gravou
  const r = await capturar({ link: "https://lp.com", dir: "/tmp/j", base: "LP - N - P" }, d);
  const vsls = r.arquivos.filter((a) => a.nome.includes("VSL")).map((a) => a.nome);
  assert.deepEqual(vsls, ["LP - N - P - VSL 01.mp4"], "a VSL que sobrou tem que ser a 01, sem buraco");
});
