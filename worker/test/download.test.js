import test from "node:test";
import assert from "node:assert/strict";
import { baixar, cookiesDe, normalizarFormatos } from "../src/jobs/download.js";
import { ComandoFalhou } from "../src/exec.js";

function deps({ ytdlp, gallery, midias, midiasAposYtdlp = null }) {
  const chamadas = [];
  let vezes = 0;
  return {
    chamadas,
    rodar: async (cmd, args) => {
      chamadas.push({ cmd, args });
      const r = cmd.includes("yt-dlp") ? ytdlp : gallery;
      if (r instanceof Error) throw r;
      return { stdout: "", stderr: "" };
    },
    // `midiasAposYtdlp` é o que a pasta tem na 1ª varredura (logo após o yt-dlp);
    // as varreduras seguintes devolvem `midias`, o estado após o gallery-dl.
    listarMidias: async () => {
      vezes += 1;
      return vezes === 1 && midiasAposYtdlp !== null ? midiasAposYtdlp : midias;
    },
    existeArquivo: () => true,
  };
}

test("vídeo único sai como modo unico", async () => {
  const d = deps({ ytdlp: {}, midias: ["/tmp/j/video.mp4"] });
  const r = await baixar({ link: "https://youtu.be/abc", rede: "youtube", dir: "/tmp/j" }, d);
  assert.deepEqual(r, { arquivos: ["/tmp/j/video.mp4"], modo: "unico" });
  assert.equal(d.chamadas.length, 1);
  assert.ok(d.chamadas[0].cmd.includes("yt-dlp"));
  assert.ok(d.chamadas[0].args.includes("--no-playlist"));
});

test("vários arquivos viram carrossel", async () => {
  const d = deps({ ytdlp: {}, midias: ["/tmp/j/1.jpg", "/tmp/j/2.jpg", "/tmp/j/3.jpg"] });
  const r = await baixar({ link: "https://instagram.com/p/x", rede: "instagram", dir: "/tmp/j" }, d);
  assert.equal(r.modo, "carrossel");
  assert.equal(r.arquivos.length, 3);
});

test("yt-dlp falhando cai para gallery-dl", async () => {
  const d = deps({
    ytdlp: new ComandoFalhou("yt-dlp", 1, "Unsupported URL"),
    gallery: {},
    midiasAposYtdlp: [],
    midias: ["/tmp/j/a.jpg"],
  });
  const r = await baixar({ link: "https://instagram.com/p/x", rede: "instagram", dir: "/tmp/j" }, d);
  assert.equal(r.modo, "unico");
  assert.equal(d.chamadas.length, 2);
  assert.ok(d.chamadas[1].cmd.includes("gallery-dl"));
});

test("yt-dlp que falha mas deixou arquivo NÃO chama gallery-dl", async () => {
  // Falha de pós-processamento depois do download: rodar o gallery-dl por cima duplicaria a mídia
  // e transformaria um vídeo único em "carrossel".
  const d = deps({
    ytdlp: new ComandoFalhou("yt-dlp", 1, "ERROR: postprocessing"),
    gallery: {},
    midias: ["/tmp/j/video.mp4"],
  });
  const r = await baixar({ link: "https://youtu.be/abc", rede: "youtube", dir: "/tmp/j" }, d);
  assert.equal(r.modo, "unico");
  assert.equal(d.chamadas.length, 1, "só o yt-dlp devia ter rodado");
});

test("os dois falhando lança erro com o motivo do yt-dlp", async () => {
  const d = deps({
    ytdlp: new ComandoFalhou("yt-dlp", 1, "ERROR: Video unavailable"),
    gallery: new ComandoFalhou("gallery-dl", 1, "no extractor"),
    midias: [],
  });
  await assert.rejects(
    () => baixar({ link: "https://x.com/y", rede: "outro", dir: "/tmp/j" }, d),
    (e) => /Video unavailable/.test(e.message),
  );
});

test("nenhum arquivo baixado também é erro", async () => {
  const d = deps({ ytdlp: {}, midias: [] });
  await assert.rejects(() => baixar({ link: "https://x.com/y", rede: "outro", dir: "/tmp/j" }, d), /não baixou nenhum arquivo/i);
});

test("cookies entram quando existe arquivo para a rede", async () => {
  assert.equal(cookiesDe("instagram", () => true), "/cookies/instagram.txt");
  assert.equal(cookiesDe("instagram", () => false), null);
  assert.equal(cookiesDe("internet", () => true), null);
  // O YouTube barra IP de servidor ("Sign in to confirm you're not a bot") sem cookie de login
  assert.equal(cookiesDe("youtube", () => true), "/cookies/youtube.txt");
});

test("o comando leva --cookies quando a rede tem cookies", async () => {
  const d = deps({ ytdlp: {}, midias: ["/tmp/j/v.mp4"] });
  await baixar({ link: "https://instagram.com/reel/x", rede: "instagram", dir: "/tmp/j" }, d);
  assert.ok(d.chamadas[0].args.includes("--cookies"));
  assert.ok(d.chamadas[0].args.includes("/cookies/instagram.txt"));
});

// ---------------------------------------------------------------- Carrossel

function depsCarrossel({ gallery = {}, ytdlp = {}, porEtapa }) {
  // porEtapa: o que a pasta tem depois de cada ferramenta ("gallery" / "ytdlp")
  const chamadas = [];
  let ultima = "nada";
  return {
    chamadas,
    rodar: async (cmd, args) => {
      chamadas.push({ cmd, args });
      if (cmd.includes("gallery-dl")) { ultima = "gallery"; if (gallery instanceof Error) throw gallery; }
      else if (cmd.includes("yt-dlp")) { ultima = "ytdlp"; if (ytdlp instanceof Error) throw ytdlp; }
      return { stdout: "", stderr: "" };
    },
    listarMidias: async () => porEtapa[ultima] || [],
    normalizarFormatos: async (arquivos) => arquivos,
    existeArquivo: () => true,
  };
}

test("carrossel usa o gallery-dl primeiro (o yt-dlp só pega os vídeos) e mantém imagem + vídeo na ordem do post", async () => {
  const d = depsCarrossel({ porEtapa: { gallery: ["/tmp/j/001_a.jpg", "/tmp/j/002_b.mp4", "/tmp/j/003_c.jpg"] } });
  const r = await baixar({ link: "https://instagram.com/p/x", rede: "instagram", dir: "/tmp/j", categoria: "carrossel" }, d);
  assert.equal(r.modo, "carrossel");
  assert.deepEqual(r.arquivos, ["/tmp/j/001_a.jpg", "/tmp/j/002_b.mp4", "/tmp/j/003_c.jpg"]);
  assert.equal(d.chamadas.length, 1);
  assert.ok(d.chamadas[0].cmd.includes("gallery-dl"));
  const args = d.chamadas[0].args;
  assert.equal(args[args.indexOf("-D") + 1], "/tmp/j", "arquivos direto na pasta do job, sem subpastas");
  assert.match(args[args.indexOf("-f") + 1], /^\{num:>03\}/, "nome começa pela posição do card no post");
  assert.ok(args.includes("--cookies"));
});

test("carrossel com um card só continua indo para uma pasta", async () => {
  const d = depsCarrossel({ porEtapa: { gallery: ["/tmp/j/001_a.mp4"] } });
  const r = await baixar({ link: "https://instagram.com/p/x", rede: "instagram", dir: "/tmp/j", categoria: "carrossel" }, d);
  assert.equal(r.modo, "carrossel");
});

test("carrossel sem nada no gallery-dl cai para o yt-dlp com playlist liberada", async () => {
  const d = depsCarrossel({
    gallery: new ComandoFalhou("gallery-dl", 1, "no extractor"),
    porEtapa: { ytdlp: ["/tmp/j/001_v.mp4", "/tmp/j/002_v.mp4"] },
  });
  const r = await baixar({ link: "https://tiktok.com/x", rede: "tiktok", dir: "/tmp/j", categoria: "carrossel" }, d);
  assert.equal(r.modo, "carrossel");
  assert.equal(d.chamadas.length, 2);
  assert.ok(d.chamadas[1].cmd.includes("yt-dlp"));
  assert.ok(!d.chamadas[1].args.includes("--no-playlist"), "carrossel precisa de todos os itens");
});

test("carrossel passa pela normalização de formatos", async () => {
  const d = depsCarrossel({ porEtapa: { gallery: ["/tmp/j/001_a.webp", "/tmp/j/002_b.webm"] } });
  d.normalizarFormatos = async (arquivos) => arquivos.map((a) => a.replace(".webp", ".jpg").replace(".webm", ".mp4"));
  const r = await baixar({ link: "https://instagram.com/p/x", rede: "instagram", dir: "/tmp/j", categoria: "carrossel" }, d);
  assert.deepEqual(r.arquivos, ["/tmp/j/001_a.jpg", "/tmp/j/002_b.mp4"]);
});

test("normalizarFormatos: jpg/png/mp4/mov ficam; webp vira jpg, webm vira mp4, gif vira mp4", async () => {
  const comandos = [];
  const rodar = async (cmd, args) => { comandos.push(args[args.length - 1]); return { stdout: "", stderr: "" }; };
  const saida = await normalizarFormatos(["/t/1.jpg", "/t/2.webp", "/t/3.mp4", "/t/4.webm", "/t/5.png", "/t/6.mov", "/t/7.gif"], { rodar, apagar: async () => {} });
  assert.deepEqual(saida, ["/t/1.jpg", "/t/2.jpg", "/t/3.mp4", "/t/4.mp4", "/t/5.png", "/t/6.mov", "/t/7.mp4"]);
  assert.deepEqual(comandos, ["/t/2.jpg", "/t/4.mp4", "/t/7.mp4"]);
});

test("normalizarFormatos: se a conversão falhar, fica o arquivo original (não perde o card)", async () => {
  const rodar = async () => { throw new ComandoFalhou("ffmpeg", 1, "codec"); };
  const saida = await normalizarFormatos(["/t/1.heic"], { rodar, apagar: async () => {} });
  assert.deepEqual(saida, ["/t/1.heic"]);
});

// ---------------------------------------------------------------- LinkedIn e cookies

test("post do LinkedIn usa o leitor próprio antes do yt-dlp e vira carrossel com várias imagens", async () => {
  const d = depsCarrossel({ porEtapa: {} });
  let recebido;
  d.baixarPostLinkedin = async (a) => { recebido = a; return ["/tmp/j/001_linkedin.jpg", "/tmp/j/002_linkedin.jpg"]; };
  d.lerArquivo = async () => ".linkedin.com\tTRUE\t/\tTRUE\t0\tli_at\tAAA";
  const r = await baixar({ link: "https://www.linkedin.com/posts/x-share-1/", rede: "linkedin", dir: "/tmp/j", categoria: "carrossel" }, d);
  assert.equal(r.modo, "carrossel");
  assert.equal(r.arquivos.length, 2);
  assert.equal(d.chamadas.length, 0, "nem yt-dlp nem gallery-dl");
  assert.equal(recebido.cookies, "li_at=AAA");
});

test("post do LinkedIn com uma imagem só (não carrossel) sai como unico", async () => {
  const d = depsCarrossel({ porEtapa: {} });
  d.baixarPostLinkedin = async () => ["/tmp/j/001_linkedin.jpg"];
  const r = await baixar({ link: "https://www.linkedin.com/posts/x-share-1/", rede: "linkedin", dir: "/tmp/j", categoria: "post_estatico" }, d);
  assert.equal(r.modo, "unico");
});

test("post do LinkedIn sem imagem (vídeo) segue para o yt-dlp", async () => {
  const d = depsCarrossel({ porEtapa: { ytdlp: ["/tmp/j/v.mp4"] } });
  d.baixarPostLinkedin = async () => [];
  const r = await baixar({ link: "https://www.linkedin.com/posts/x-share-1/", rede: "linkedin", dir: "/tmp/j", categoria: "video_organico" }, d);
  assert.deepEqual(r.arquivos, ["/tmp/j/v.mp4"]);
  assert.ok(d.chamadas[0].cmd.includes("yt-dlp"));
});

test("erro do leitor do LinkedIn (pediu login) aparece na mensagem final se nada baixar", async () => {
  const d = depsCarrossel({ gallery: new ComandoFalhou("gallery-dl", 1, "Unsupported URL"), ytdlp: new ComandoFalhou("yt-dlp", 1, "ERROR: Unable to extract video"), porEtapa: {} });
  d.baixarPostLinkedin = async () => { throw new Error("O LinkedIn pediu login para ver esse post"); };
  await assert.rejects(
    () => baixar({ link: "https://www.linkedin.com/posts/x-share-1/", rede: "linkedin", dir: "/tmp/j", categoria: "post_estatico" }, d),
    /pediu login/,
  );
});

test("gallery-dl com cookies não tenta regravar o arquivo (config da VPS é só leitura)", async () => {
  const d = depsCarrossel({ porEtapa: { gallery: ["/tmp/j/001_a.jpg"] } });
  await baixar({ link: "https://instagram.com/p/x", rede: "instagram", dir: "/tmp/j", categoria: "carrossel" }, d);
  const args = d.chamadas[0].args;
  assert.equal(args[args.indexOf("-o") + 1], "cookies-update=false");
});

// ---------------------------------------------------------------- Plataformas novas

test("cookies por plataforma: bibliotecas de anúncio e Threads usam o login da rede-mãe", () => {
  assert.equal(cookiesDe("meta_ads", () => true), "/cookies/facebook.txt");
  assert.equal(cookiesDe("tiktok_ads", () => true), "/cookies/tiktok.txt");
  assert.equal(cookiesDe("threads", () => true), "/cookies/instagram.txt");
  assert.equal(cookiesDe("google_ads", () => true), null);
  assert.equal(cookiesDe("kwai", () => true), null);
});

test("TikTok Ads e Google Ads vão direto para o captador de página", async () => {
  for (const rede of ["tiktok_ads", "google_ads"]) {
    const d = depsCarrossel({ porEtapa: {} });
    d.capturarMidiaDaPagina = async () => ({ arquivos: ["/tmp/j/pagina-1.mp4"], modo: "unico" });
    const r = await baixar({ link: "https://ads.tiktok.com/x", rede, dir: "/tmp/j", categoria: "video_anuncio" }, d);
    assert.deepEqual(r.arquivos, ["/tmp/j/pagina-1.mp4"]);
    assert.equal(d.chamadas.length, 0, `${rede}: nem yt-dlp nem gallery-dl`);
  }
});

test("site qualquer: captador de página é a última tentativa depois de yt-dlp e gallery-dl", async () => {
  const d = depsCarrossel({ gallery: new ComandoFalhou("gallery-dl", 1, "Unsupported URL"), ytdlp: new ComandoFalhou("yt-dlp", 1, "ERROR: Unsupported URL"), porEtapa: {} });
  d.capturarMidiaDaPagina = async () => ({ arquivos: ["/tmp/j/pagina-1.jpg"], modo: "unico" });
  const r = await baixar({ link: "https://kwai.com/x", rede: "kwai", dir: "/tmp/j", categoria: "video_organico" }, d);
  assert.deepEqual(r.arquivos, ["/tmp/j/pagina-1.jpg"]);
  assert.deepEqual(d.chamadas.map((c) => (c.cmd.includes("yt-dlp") ? "yt" : "gal")), ["yt", "gal"]);
});

test("captador de página falhando também entra na mensagem final", async () => {
  const d = depsCarrossel({ gallery: new ComandoFalhou("gallery-dl", 1, "x"), ytdlp: new ComandoFalhou("yt-dlp", 1, "ERROR: y"), porEtapa: {} });
  d.capturarMidiaDaPagina = async () => { throw new Error("Nenhum vídeo ou imagem na página"); };
  await assert.rejects(() => baixar({ link: "https://site.com/x", rede: "internet", dir: "/tmp/j", categoria: "anuncio_estatico" }, d), /página: Nenhum vídeo/);
});

test("categoria de vídeo: captador de página roda em modo somente vídeo", async () => {
  const d = depsCarrossel({ gallery: new ComandoFalhou("gallery-dl", 1, "x"), ytdlp: new ComandoFalhou("yt-dlp", 1, "ERROR: y"), porEtapa: {} });
  let opcoes;
  d.capturarMidiaDaPagina = async (a) => { opcoes = a; return { arquivos: ["/tmp/j/pagina-1.mp4"], modo: "unico" }; };
  await baixar({ link: "https://site.com/v", rede: "internet", dir: "/tmp/j", categoria: "video_anuncio" }, d);
  assert.equal(opcoes.somenteVideo, true);
});

test("cookies vão para uma cópia gravável na pasta do job (yt-dlp e gallery-dl regravam o arquivo)", async () => {
  const d = deps({ ytdlp: {}, midias: ["/tmp/j/v.mp4"] });
  const copias = [];
  d.copiarCookies = async (origem, destino) => { copias.push([origem, destino]); };
  await baixar({ link: "https://instagram.com/reel/x", rede: "instagram", dir: "/tmp/j" }, d);
  assert.deepEqual(copias, [["/cookies/instagram.txt", "/tmp/j/.cookies.txt"]]);
  const args = d.chamadas[0].args;
  assert.equal(args[args.indexOf("--cookies") + 1], "/tmp/j/.cookies.txt");
});
