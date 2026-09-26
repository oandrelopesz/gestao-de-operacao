// Gera os ícones do app (PNG) e o favicon (SVG + ICO) a partir de um SVG, renderizado no Chrome.
// Ícones do app: quadrado cheio (o iOS arredonda sozinho) com o degradê dos botões e as "faíscas" (lucide
// Sparkles) do logo do menu, centralizadas em ~52% — cabe na área segura de ícone "maskable" do Android.
// Favicon: o mesmo desenho com cantos arredondados e traço mais grosso, para continuar legível em 16 px na aba.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CHROME } from "./rotas.mjs";

const FAISCAS = `
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
    <path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>`;
const DEGRADE = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs>`;

const SVG = (lado) => `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 512 512">
  ${DEGRADE}
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(123 123) scale(11.08)" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${FAISCAS}
  </g></svg>`;

// Faíscas maiores (~70% do quadrado) e traço 2.2: em 16 px o desenho do app some
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${DEGRADE}
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <g transform="translate(76 76) scale(15)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${FAISCAS}
  </g></svg>
`;

/** ICO com as imagens em PNG (aceito por todos os navegadores atuais e pelo Windows desde o Vista). */
function montarIco(pngs) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(pngs.length, 4);
  const entradas = [];
  let deslocamento = 6 + 16 * pngs.length;
  for (const { lado, png } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = lado >= 256 ? 0 : lado;
    e[1] = lado >= 256 ? 0 : lado;
    e.writeUInt16LE(1, 4); // planos
    e.writeUInt16LE(32, 6); // bits por pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(deslocamento, 12);
    deslocamento += png.length;
    entradas.push(e);
  }
  return Buffer.concat([cabecalho, ...entradas, ...pngs.map((x) => x.png)]);
}

const PUBLICO = new URL("../../public/", import.meta.url);
const SAIDA = new URL("icons/", PUBLICO);
mkdirSync(SAIDA, { recursive: true });
const navegador = await chromium.launch({ executablePath: CHROME });
// A janela tem no mínimo 64 px (o Chrome trava o screenshot de janelas minúsculas); recorta o tamanho pedido
const renderizar = async (svg, lado, fundoTransparente) => {
  const janela = Math.max(lado, 64);
  const p = await navegador.newPage({ viewport: { width: janela, height: janela }, deviceScaleFactor: 1 });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg style="display:block" width="${lado}" height="${lado}" `)}</body></html>`);
  const png = await p.screenshot({ omitBackground: fundoTransparente, clip: { x: 0, y: 0, width: lado, height: lado } });
  await p.close();
  return png;
};

for (const [nome, lado] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(fileURLToPath(new URL(nome, SAIDA)), await renderizar(SVG(lado).replace(/ width="\d+" height="\d+"/, ""), lado, false));
}
writeFileSync(fileURLToPath(new URL("favicon.svg", PUBLICO)), FAVICON_SVG);
const pngs = [];
for (const lado of [16, 32, 48]) pngs.push({ lado, png: await renderizar(FAVICON_SVG, lado, true) });
writeFileSync(fileURLToPath(new URL("favicon.ico", PUBLICO)), montarIco(pngs));
await navegador.close();
console.log("ícones gerados em public/icons e favicon em public/");
