import test from "node:test";
import assert from "node:assert/strict";
import { baixar, cookiesDe } from "../src/jobs/download.js";
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
});

test("o comando leva --cookies quando a rede tem cookies", async () => {
  const d = deps({ ytdlp: {}, midias: ["/tmp/j/v.mp4"] });
  await baixar({ link: "https://instagram.com/reel/x", rede: "instagram", dir: "/tmp/j" }, d);
  assert.ok(d.chamadas[0].args.includes("--cookies"));
  assert.ok(d.chamadas[0].args.includes("/cookies/instagram.txt"));
});
