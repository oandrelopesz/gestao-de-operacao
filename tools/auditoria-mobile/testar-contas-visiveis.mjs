// Popup "Contas visíveis" em 3 larguras: todas as chaves dentro do popup e sem rolagem para o lado.
// Uso: node testar-contas-visiveis.mjs <pasta-dos-prints>
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const SP = process.argv[2];
const navegador = await chromium.launch({ executablePath: CHROME });
for (const [nome, width, height] of [["computador", 1366, 860], ["tablet", 768, 1024], ["celular", 390, 844]]) {
  const p = await navegador.newPage({ viewport: { width, height } });
  await abrirEstavel(p, "http://localhost:5188/instagram");
  await p.getByRole("button", { name: "Contas visíveis" }).click();
  const d = p.getByRole("dialog");
  await d.getByRole("switch").first().waitFor({ timeout: 30000 });
  const r = await d.evaluate((el) => {
    const caixa = el.getBoundingClientRect();
    const chaves = [...el.querySelectorAll('[role="switch"]')].map((s) => s.getBoundingClientRect());
    return {
      chaves: chaves.length,
      fora: chaves.filter((c) => c.right > caixa.right - 8 || c.left < caixa.left).length,
      rolaDeLado: el.scrollWidth > el.clientWidth + 1,
      pagina: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  console.log(nome, JSON.stringify(r), r.fora === 0 && !r.rolaDeLado && !r.pagina ? "OK" : "FALHOU");
  await p.screenshot({ path: `${SP}/contas-visiveis-${nome}.png` });
  await p.close();
}
await navegador.close();
