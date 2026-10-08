// Teste da migração (07/10/2026, autorizado pelo André, conta @kobegrowth): agenda uma foto para daqui a 3 min,
// espera o relógio do banco novo publicar e mostra o link; com "excluir <trecho>" apaga o post da rede.
// Uso: node testar-migracao-instagram.mjs <pasta-dos-arquivos> <pasta-dos-prints> agendar|excluir [trecho do link]
import { chromium } from "playwright-core";
import { CHROME, abrirEstavel } from "./rotas.mjs";
const [pasta, SP, modo, link] = process.argv.slice(2);
const navegador = await chromium.launch({ executablePath: CHROME });
const p = await navegador.newPage({ viewport: { width: 1366, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
await abrirEstavel(p, "https://gestao.andrelopes.digital/instagram");
await p.getByRole("button", { name: "Contas visíveis" }).waitFor({ timeout: 60000 });

if (modo === "agendar") {
  await p.getByRole("tab", { name: /Contas/ }).click();
  await p.getByLabel("Buscar conta").fill("kobegrowth");
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: "Postar" }).first().click();
  const d = p.getByRole("dialog").first();
  await d.getByText("Postar em @kobegrowth").waitFor();
  await d.locator('input[type="file"][multiple]').setInputFiles(`${pasta}/post-1.png`);
  await d.getByLabel("Legenda").fill("[TESTE] migração do sistema (será apagado)");
  await d.getByRole("button", { name: "Agendar", exact: true }).click();
  const quando = await p.evaluate(() => {
    const t = new Date(Date.now() + 3 * 60 * 1000); const z = (n) => String(n).padStart(2, "0");
    return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}T${z(t.getHours())}:${z(t.getMinutes())}`;
  });
  await d.getByLabel("Data e hora (Brasília)").fill(quando);
  await p.waitForFunction(() => {
    const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent?.trim() === "Agendar post");
    return b && !b.disabled;
  }, null, { timeout: 180000 });
  await d.getByRole("button", { name: "Agendar post", exact: true }).click();
  await d.waitFor({ state: "detached", timeout: 30000 });
  console.log("agendado para", quando);
  await p.getByRole("tab", { name: /Posts/ }).click();
  const linha = p.locator("div.divide-y > div").filter({ hasText: "[TESTE] migração" }).first();
  await linha.waitFor({ timeout: 30000 });
  const limite = Date.now() + 9 * 60 * 1000;
  let texto = "";
  while (Date.now() < limite) {
    await p.reload(); await p.getByRole("tab", { name: /Posts/ }).click();
    texto = (await linha.innerText().catch(() => "")).replace(/\s+/g, " ");
    if (/Publicado|Erro/.test(texto)) break;
    await p.waitForTimeout(20000);
  }
  console.log("linha:", texto.slice(0, 200));
  console.log("link:", await linha.locator('a[href*="instagram.com"]').first().getAttribute("href").catch(() => "(sem link)"));
}

if (modo === "excluir") {
  await p.getByRole("tab", { name: /Posts/ }).click();
  const linha = p.locator("div.divide-y > div").filter({ has: p.locator(`a[href*="${link}"]`) }).first();
  await linha.waitFor({ timeout: 30000 });
  await linha.getByRole("button", { name: "Excluir" }).click();
  await p.getByText(/Excluir do Instagram\?/).waitFor();
  await p.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
  await p.locator("[data-sonner-toast]").first().waitFor({ timeout: 60000 }).catch(() => {});
  console.log("avisos:", (await p.locator("[data-sonner-toast]").allInnerTexts()).join(" | ").replace(/\s+/g, " "));
  await p.waitForTimeout(3000);
  console.log("linha:", (await linha.innerText().catch(() => "(saiu da lista)")).replace(/\s+/g, " "));
}
await p.screenshot({ path: `${SP}/migracao-ig-${modo}.png` });
console.log("erros:", erros.join(" | ") || "nenhum");
await navegador.close();
