import test from "node:test";
import assert from "node:assert/strict";
import { capturar, ehUrlDeVideo } from "../src/jobs/lp.js";

test("reconhece URL de vídeo e player conhecido", () => {
  assert.ok(ehUrlDeVideo("https://cdn.site.com/vsl.mp4"));
  assert.ok(ehUrlDeVideo("https://cdn.site.com/stream/master.m3u8?token=1"));
  assert.ok(ehUrlDeVideo("https://scripts.converteai.net/abc/players/xyz/player.js"));
  assert.ok(ehUrlDeVideo("https://player.vimeo.com/video/12345"));
  assert.ok(!ehUrlDeVideo("https://cdn.site.com/estilo.css"));
  assert.ok(!ehUrlDeVideo("https://cdn.site.com/foto.jpg"));
});

function deps({ urlsDeVideo = [], falhas = {} } = {}) {
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
