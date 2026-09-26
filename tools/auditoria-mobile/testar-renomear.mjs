// Renomeia uma reunião pela tela da aba Fireflies e mede até o selo "Renomeando…" sumir (aplicado no Fireflies),
// depois volta ao nome original. Só deixa passar a escrita na fireflies_reunioes e o webhook "aplicar agora".
// Uso: node testar-renomear.mjs <BASE> "<nome atual>"
import { chromium } from "playwright-core";
import { CHROME } from "./rotas.mjs";

const [BASE = "http://localhost:5188", NOME = "xwk-gxud-rjw"] = process.argv.slice(2);
const navegador = await chromium.launch({ executablePath: CHROME });
const p = await (await navegador.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const bloqueadas = [];
await p.route(/supabase\.co|minuanoai\.com\.br/, (rota) => {
  const req = rota.request();
  const m = req.method();
  if (["GET", "HEAD", "OPTIONS"].includes(m)) return rota.continue();
  if (m === "PATCH" && /\/rest\/v1\/fireflies_reunioes/.test(req.url())) return rota.continue();
  if (m === "POST" && /\/webhook\/fireflies-pendencias/.test(req.url())) return rota.continue();
  bloqueadas.push(`${m} ${req.url().split("?")[0]}`);
  return rota.abort();
});

async function renomear(de, para) {
  await p.getByPlaceholder(/Buscar por nome/).fill(de);
  const card = p.locator("div.rounded-xl, div[class*='rounded']").filter({ has: p.getByRole("heading", { name: de, exact: true }) }).first();
  await card.getByRole("button", { name: "Mais opções" }).click();
  await p.getByRole("menuitem", { name: /Renomear/ }).click();
  const campo = p.locator("#fireflies-nome");
  await campo.fill(para);
  const t0 = Date.now();
  await p.getByRole("button", { name: "Salvar" }).click();
  await p.getByPlaceholder(/Buscar por nome/).fill(para);
  await p.getByText("Renomeando…").first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  await p.getByText("Renomeando…").first().waitFor({ state: "detached", timeout: 90_000 });
  return Date.now() - t0;
}

await p.goto(`${BASE}/fireflies`, { waitUntil: "domcontentloaded" });
await p.waitForSelector("text=Abrir no Fireflies", { timeout: 60_000 });
const novo = `${NOME} (teste de renomear)`;
const ida = await renomear(NOME, novo);
const volta = await renomear(novo, NOME);
console.log(JSON.stringify({ renomearAteAplicarMs: ida, voltarAteAplicarMs: volta, bloqueadas }));
await navegador.close();
