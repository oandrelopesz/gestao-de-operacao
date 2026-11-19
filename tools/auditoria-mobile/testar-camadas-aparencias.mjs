// Abre as camadas (formulário "Nova", gaveta Agendadas e Ctrl+K, este só nas aparências novas) nas 3 aparências × claro/escuro e salva prints.
// Só abre e fecha com Esc: não salva nada. Uso: npm run teste -- testar-camadas-aparencias.mjs [base] [saida]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const [BASE = "http://localhost:5178", SAIDA = "prints/camadas"] = process.argv.slice(2);
mkdirSync(SAIDA, { recursive: true });
const navegador = await chromium.launch({ executablePath: CHROME });
const falhas = [];

for (const aparencia of ["classica", "painel", "editorial"]) {
  for (const tema of ["light", "dark"]) {
    const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(`try{localStorage.setItem("aparencia","${aparencia}");localStorage.setItem("theme","${tema}")}catch(e){}`);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => falhas.push(`${aparencia}/${tema} pageerror: ${e.message.slice(0, 140)}`));
    await abrirEstavel(p, BASE + "/");
    const nome = `${aparencia}-${tema}`;
    const passo = async (rotulo, abrir) => {
      try {
        await abrir();
        await p.waitForSelector("[role=dialog]", { timeout: 8000 });
        await p.waitForTimeout(600);
        await p.screenshot({ path: `${SAIDA}/${rotulo}-${nome}.png` });
        await p.keyboard.press("Escape");
        await p.waitForSelector("[role=dialog]", { state: "detached", timeout: 8000 });
      } catch (e) {
        falhas.push(`${nome} ${rotulo}: ${e.message.split("\n")[0]}`);
        await p.keyboard.press("Escape").catch(() => {});
      }
    };
    await passo("nova", () => p.getByRole("button", { name: "Nova", exact: true }).click());
    await passo("gaveta", () => p.getByRole("button", { name: "Agendadas", exact: true }).click());
    await passo("ctrlk",() => p.keyboard.press("Control+k"));
    await ctx.close();
  }
}
await navegador.close();
console.log(falhas.length ? falhas.join("\n") : "camadas abriram e fecharam nas 6 combinações");
