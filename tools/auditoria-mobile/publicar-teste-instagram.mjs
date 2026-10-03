// Teste REAL no site no ar: publica na conta de Instagram indicada (autorização do André, 03/10/2026: @kobegrowth com o
// material da pasta do Drive). Uso: node publicar-teste-instagram.mjs <usuario> <pasta-dos-arquivos> <pasta-dos-prints> <carrossel|agendada>
//   carrossel: carrossel-1..5.png em "Publicar agora"; agendada: post-1.png agendado para daqui a 3 minutos.
import { chromium } from "playwright-core";
import { readdirSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const [usuario, pasta, SP, modo] = process.argv.slice(2);
const navegador = await chromium.launch({ executablePath: CHROME });
const p = await navegador.newPage({ viewport: { width: 1366, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
await abrirEstavel(p, "https://gestao.andrelopes.digital/instagram");
await p.getByRole("button", { name: "Contas visíveis" }).waitFor({ timeout: 60000 });
await p.getByLabel("Buscar conta").fill(usuario);
await p.waitForTimeout(600);
await p.getByRole("button", { name: "Postar" }).first().click();
await p.getByText(`Postar em @${usuario}`).waitFor();
const arquivos = readdirSync(pasta).filter((n) => (modo === "carrossel" ? n.startsWith("carrossel-") : n === "post-1.png")).sort().map((n) => `${pasta}/${n}`);
await p.locator('input[type="file"]').setInputFiles(arquivos);
if (modo === "agendada") {
  await p.getByRole("button", { name: "Agendar" }).first().click();
  const quando = await p.evaluate(() => {
    const d = new Date(Date.now() + 3 * 60 * 1000); const z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  });
  await p.getByLabel("Data e hora (Brasília)").fill(quando);
  console.log("agendado para", quando);
}
const rotulo = modo === "carrossel" ? "Publicar agora" : "Agendar post";
const botao = p.getByRole("dialog").getByRole("button", { name: rotulo, exact: true });
// Espera todas as mídias convertidas e enviadas: o botão final só destrava assim
await p.waitForFunction(([rotulo, n]) => {
  const d = document.querySelector('[role="dialog"]');
  const b = [...(d?.querySelectorAll("button") ?? [])].find((x) => x.textContent?.trim() === rotulo);
  return b && !b.disabled && d.querySelectorAll("[draggable=true]").length === n;
}, [rotulo, arquivos.length], { timeout: 180000 });
console.log("mídias enviadas:", arquivos.length);
await p.screenshot({ path: `${SP}/ig-real-${modo}-antes.png` });
const linhas = p.locator("div.divide-y > div");
await botao.click();
await p.getByRole("tab", { name: /Posts/ }).waitFor();
// A lista de posts chega pelo realtime: espera a linha do post novo (na fila, ela fica no topo)
await p.getByText(/Agendado|Enviando|Publicando/).first().waitFor({ timeout: 60000 }).catch(() => {});
const limite = Date.now() + (modo === "carrossel" ? 4 : 9) * 60 * 1000;
let situacao = "";
while (Date.now() < limite) {
  const linha = linhas.first();
  situacao = (await linha.innerText().catch(() => "")).replace(/\s+/g, " ");
  if (/Publicado|Erro/.test(situacao)) break;
  await p.waitForTimeout(10000);
}
console.log("situação:", situacao);
await p.screenshot({ path: `${SP}/ig-real-${modo}-depois.png` });
const link = await p.getByRole("link", { name: "Ver no Instagram" }).first().getAttribute("href").catch(() => null);
console.log("permalink:", link);
console.log("erros:", erros.join(" | ") || "nenhum");
await navegador.close();
