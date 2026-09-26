// Regressão de desktop: captura cada tela na versão base e na nova (mesmo instante, mesmos dados) em 1440 e 1024 px
// e compara pixel a pixel. Qualquer diferença gera um PNG em <saida>/diff-*.png para inspeção.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { ROTAS, nomeDaRota, CHROME, abrirEstavel } from "./rotas.mjs";

const [URL_BASE, URL_NOVA, SAIDA = "saida-desktop"] = process.argv.slice(2);
if (!URL_BASE || !URL_NOVA) { console.error("uso: node comparar-desktop.mjs <urlBase> <urlNova> [saida]"); process.exit(1); }
mkdirSync(SAIDA, { recursive: true });
const navegador = await chromium.launch({ executablePath: CHROME });
const relatorio = [];
for (const largura of [1440, 1024]) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, deviceScaleFactor: 1, locale: "pt-BR", reducedMotion: "reduce" });
  for (const rota of ROTAS) {
    const capturar = async (url) => { const p = await contexto.newPage(); try { await abrirEstavel(p, url + rota); return PNG.sync.read(await p.screenshot({ fullPage: true })); } finally { await p.close(); } };
    try {
      const a = await capturar(URL_BASE);
      const b = await capturar(URL_NOVA);
      const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
      const recorta = (img) => { const o = new PNG({ width: w, height: h }); PNG.bitblt(img, o, 0, 0, w, h, 0, 0); return o; };
      const diff = new PNG({ width: w, height: h });
      const px = pixelmatch(recorta(a).data, recorta(b).data, diff.data, w, h, { threshold: 0.1 });
      const tamanhoIgual = a.width === b.width && a.height === b.height;
      if (px > 0 || !tamanhoIgual) writeFileSync(`${SAIDA}/diff-${largura}-${nomeDaRota(rota)}.png`, PNG.sync.write(diff));
      relatorio.push({ largura, rota, pixelsDiferentes: px, tamanhoIgual, base: `${a.width}x${a.height}`, nova: `${b.width}x${b.height}` });
    } catch (e) {
      relatorio.push({ largura, rota, erro: String(e.message || e).slice(0, 160) });
    }
  }
  await contexto.close();
}
await navegador.close();
writeFileSync(`${SAIDA}/diff.json`, JSON.stringify(relatorio, null, 2));
for (const r of relatorio) console.log(`${r.largura} ${r.rota.padEnd(12)} ${r.erro ? "ERRO " + r.erro : `${r.pixelsDiferentes} px ${r.tamanhoIgual ? "" : `(tamanho ${r.base} → ${r.nova})`}`}`);
const problemas = relatorio.filter((r) => r.erro || r.pixelsDiferentes > 0 || !r.tamanhoIgual);
console.log(problemas.length ? `\n${problemas.length} tela(s) com diferença` : "\nDesktop idêntico em todas as telas");
