// Aba Fireflies: mede a abertura, confere que só POR_VEZ cards são desenhados de início (o resto entra ao rolar),
// que passar o mouse no "Ver" já baixa o PDF (e o clique abre a prévia sem nova requisição) e que o DOCX sai com
// o nome certo. Só leitura: qualquer escrita no Supabase é abortada.
import { chromium } from "playwright-core";
import { CHROME } from "./rotas.mjs";

const [BASE = "http://localhost:5188"] = process.argv.slice(2);
const navegador = await chromium.launch({ executablePath: CHROME });
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
const escritas = [];
await p.route(/supabase\.co|minuanoai\.com\.br\/webhook/, (rota) => {
  const m = rota.request().method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS" || /\/storage\/v1\/object\/(authenticated\/)?fireflies\//.test(rota.request().url())) return rota.continue();
  if (/\/rest\/v1\/rpc\//.test(rota.request().url()) && m === "POST") return rota.continue(); // leituras por RPC
  escritas.push(`${m} ${rota.request().url().split("?")[0]}`);
  return rota.abort();
});
const downloadsDoBucket = [];
p.on("request", (r) => { if (/\/storage\/v1\/object\/(authenticated\/)?fireflies\//.test(r.url())) downloadsDoBucket.push(r.url().split("/fireflies/")[1]); });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));

const t0 = Date.now();
await p.goto(`${BASE}/fireflies`, { waitUntil: "domcontentloaded" });
await p.waitForSelector("text=Abrir no Fireflies", { timeout: 60_000 });
const primeiroCard = Date.now() - t0;
const cardsIniciais = await p.locator("h3").count();
const total = await p.locator("text=/\\d+ reuniões/").first().textContent();

// Rola até o fim: mais cards entram sozinhos
for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 5000); await p.waitForTimeout(300); }
const cardsDepois = await p.locator("h3").count();
await p.evaluate(() => window.scrollTo(0, 0));

// Mouse sobre "Ver" do resumo da 1ª reunião → PDF começa a baixar antes do clique
const verResumo = p.getByRole("button", { name: "Ver resumo" }).first();
const antes = downloadsDoBucket.length;
await verResumo.hover();
await p.waitForTimeout(1500);
const preCarregou = downloadsDoBucket.length > antes;
const antesClique = downloadsDoBucket.length;
const tClique = Date.now();
await verResumo.click();
await p.waitForSelector("iframe", { timeout: 20_000 });
const previaMs = Date.now() - tClique;
const baixouDeNovo = downloadsDoBucket.length > antesClique;
await p.getByRole("button", { name: "Fechar" }).first().click();
await p.waitForTimeout(500);

// DOCX da transcrição: nome do arquivo
const [download] = await Promise.all([
  p.waitForEvent("download", { timeout: 20_000 }),
  p.getByRole("button", { name: "Baixar transcrição em DOCX" }).first().click(),
]);

console.log(JSON.stringify({
  primeiroCardMs: primeiroCard, total, cardsIniciais, cardsDepoisDeRolar: cardsDepois,
  preCarregouAoPassarOMouse: preCarregou, previaAbriuEmMs: previaMs, previaBaixouDeNovo: baixouDeNovo,
  nomeDoDocx: download.suggestedFilename(), escritasBloqueadas: escritas, erros,
}, null, 1));
await navegador.close();
