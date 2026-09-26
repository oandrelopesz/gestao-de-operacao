// Gera os ícones do app (PNG) a partir de um SVG, renderizado no Chrome.
// Quadrado cheio (o iOS arredonda sozinho) com o degradê dos botões e as "faíscas" (lucide Sparkles) do logo
// do menu, centralizadas em ~52% — cabe na área segura de ícone "maskable" do Android.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CHROME } from "./rotas.mjs";

const SVG = (lado) => `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(123 123) scale(11.08)" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
    <path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>
  </g></svg>`;
const SAIDA = new URL("../../public/icons/", import.meta.url);
mkdirSync(SAIDA, { recursive: true });
const navegador = await chromium.launch({ executablePath: CHROME });
for (const [nome, lado] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  const p = await navegador.newPage({ viewport: { width: lado, height: lado }, deviceScaleFactor: 1 });
  await p.setContent(`<html><body style="margin:0">${SVG(lado)}</body></html>`);
  await p.screenshot({ path: fileURLToPath(new URL(nome, SAIDA)) });
  await p.close();
}
await navegador.close();
console.log("ícones gerados em public/icons");
