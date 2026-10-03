// Aba Instagram no servidor local (porta 5188): item no menu acima de "Google Meu Negócio", tela vazia e botão. Uso: node testar-instagram.mjs <pasta-dos-prints>
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const SP = process.argv[2];
const navegador = await chromium.launch({ executablePath: CHROME });
const p = await navegador.newPage({ viewport: { width: 1366, height: 860 } });
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
await abrirEstavel(p, "http://localhost:5188/instagram");
const menu = await p.locator("nav a, aside a").allInnerTexts();
const i = menu.findIndex((t) => t.trim() === "Instagram");
console.log("menu:", i >= 0 ? `${menu[i].trim()} -> depois: ${menu[i + 1]?.trim()}` : "SEM ITEM");
console.log("titulo:", await p.locator("h1").first().innerText());
await p.getByText("Nenhuma conta ainda").waitFor({ timeout: 30000 }).catch(() => {});
console.log("vazio:", await p.getByText("Nenhuma conta ainda").count());
console.log("botao:", await p.getByRole("button", { name: "Sincronizar contas" }).count());
await p.screenshot({ path: `${SP}/ig-vazio.png` });
console.log("erros:", erros.join(" | ") || "nenhum");
await navegador.close();
