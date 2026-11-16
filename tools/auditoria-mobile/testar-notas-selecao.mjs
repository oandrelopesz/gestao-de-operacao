// Testa a seleção no editor de notas: clique triplo pega só a linha (nota colada = um parágrafo com quebras)
// e Shift + mouse soma trechos para aplicar negrito/itálico de uma vez. Cria uma nota [TESTE-SEL] pela API e apaga no fim.
// Uso (de dentro de tools/auditoria-mobile, com o vite local na 5178): node testar-notas-selecao.mjs
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const SITE = process.env.SITE || "http://localhost:5178";
const env = Object.fromEntries(readFileSync("../../.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const REST = env.VITE_SUPABASE_URL + "/rest/v1/notas";
const H = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };
const limpar = () => fetch(`${REST}?titulo=like.*TESTE-SEL*`, { method: "DELETE", headers: H });

// Igual às notas coladas de verdade: um parágrafo só, linhas separadas por hardBreak
const LINHAS = ["Meta Ads", "- R$27 mil para Psicologia", "- R$315 mil para Campanha Geral", "", "Google Ads", "- R$11.250 via PIX"];
const conteudo = LINHAS.flatMap((l, i) => [...(i ? [{ type: "hardBreak" }] : []), ...(l ? [{ type: "text", text: l }] : [])]);
const doc = { type: "doc", content: [{ type: "paragraph", content: conteudo }] };

let falhou = false;
const ok = (c, m, extra) => { console.log(c ? "ok  " : "FALHA", m, c ? "" : JSON.stringify(extra ?? "")); if (!c) falhou = true; };

await limpar();
const r = await fetch(REST, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ titulo: "[TESTE-SEL] seleção", conteudo: LINHAS.join("\n"), doc }) });
if (!r.ok) throw new Error(await r.text());

const nav = await chromium.launch({ executablePath: CHROME });
try {
  const p = await (await nav.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  p.on("console", (m) => { if (m.type() === "error" && !/GSI|403|FedCM|identity|accounts list/.test(m.text())) console.log("  console:", m.text().slice(0, 200)); });
  p.on("pageerror", (e) => console.log("  pageerror:", e.message));
  await abrirEstavel(p, `${SITE}/notas`, Number(process.env.ESPERA_MS || 8000));
  await p.getByPlaceholder("Buscar nas notas...").fill("TESTE-SEL");
  await p.getByText("[TESTE-SEL] seleção").first().click();
  await p.waitForFunction(() => document.querySelector(".ProseMirror")?.editor, null, { timeout: 60_000 }).catch(async (e) => {
    await p.screenshot({ path: process.env.TEMP + "/notas-selecao-erro.png" });
    console.log(await p.evaluate(() => ({ pm: !!document.querySelector(".ProseMirror"), dialogo: document.querySelector("[role=dialog]")?.textContent?.slice(0, 200) })));
    throw e;
  });

  // Ponto na tela sobre `texto` (f = 0 começo, 1 fim), pelas posições do editor: marcas e decorações dividem o texto no DOM
  const centro = (texto, f = 0.5) => p.evaluate(([t, f]) => {
    const ed = document.querySelector(".ProseMirror").editor;
    let pos = -1;
    ed.state.doc.descendants((n, at) => {
      if (pos >= 0 || !n.isTextblock) return;
      const i = n.textBetween(0, n.content.size, undefined, "\n").indexOf(t);
      if (i >= 0) pos = at + 1 + i;
    });
    if (pos < 0) throw new Error("texto não achado: " + t);
    const a = ed.view.coordsAtPos(pos), b = ed.view.coordsAtPos(pos + t.length);
    return { x: a.left + (b.left - a.left) * f, y: (a.top + a.bottom) / 2 };
  }, [texto, f]);
  const trechos = () => p.evaluate(() => { const ed = document.querySelector(".ProseMirror").editor; return ed.state.selection.ranges.map((r) => ed.state.doc.textBetween(r.$from.pos, r.$to.pos, "\n", "\n")); });
  const marcas = () => p.evaluate(() => { const o = {}; document.querySelector(".ProseMirror").editor.state.doc.descendants((n) => { if (n.isText) o[n.text] = n.marks.map((m) => m.type.name).sort().join(","); }); return o; });
  const clicar = async (texto, opcoes = {}, f) => { const c = await centro(texto, f); await p.mouse.click(c.x, c.y, opcoes); await p.waitForTimeout(150); };
  const comTecla = (tecla) => async (fn) => { await p.keyboard.down(tecla); await fn(); await p.keyboard.up(tecla); await p.waitForTimeout(150); };
  const comShift = comTecla("Shift"), comCtrl = comTecla("Control");

  // 1. Clique triplo: só a linha
  await clicar("R$27 mil", { clickCount: 3 });
  ok(JSON.stringify(await trechos()) === JSON.stringify(["- R$27 mil para Psicologia"]), "clique triplo seleciona só a linha", await trechos());
  await clicar("Google Ads", { clickCount: 3 });
  ok(JSON.stringify(await trechos()) === JSON.stringify(["Google Ads"]), "clique triplo em outra linha", await trechos());

  // 2. Shift + clique triplo soma a linha; negrito vale para as duas
  await clicar("Meta Ads", { clickCount: 3 });
  await comShift(() => clicar("Google Ads", { clickCount: 3 }));
  ok(JSON.stringify(await trechos()) === JSON.stringify(["Meta Ads", "Google Ads"]), "Shift + clique triplo soma a linha", await trechos());
  ok(await p.locator(".ProseMirror .nota-selecao").count() === 2, "os dois trechos aparecem marcados na tela");
  await p.screenshot({ path: process.env.TEMP + "/notas-selecao-multipla.png", clip: { x: 0, y: 0, width: 1440, height: 1000 } });
  await p.getByRole("button", { name: "Negrito (Ctrl+B)" }).click();
  let m = await marcas();
  ok(m["Meta Ads"] === "bold" && m["Google Ads"] === "bold" && m["- R$27 mil para Psicologia"] === "", "negrito aplicado só nas duas linhas", m);
  ok(await p.getByRole("button", { name: "Negrito (Ctrl+B)" }).getAttribute("aria-pressed") === "true", "botão de negrito fica marcado");

  // 3. Shift + arrastar soma um trecho; Ctrl+I aplica itálico nos dois
  await clicar("Psicologia", { clickCount: 2 });
  const a = await centro("R$315", 0), b = await centro("R$315", 1);
  await comShift(async () => { await p.mouse.move(a.x + 1, a.y); await p.mouse.down(); await p.mouse.move(b.x - 1, b.y, { steps: 5 }); await p.mouse.up(); });
  ok(JSON.stringify(await trechos()) === JSON.stringify(["Psicologia", "R$315"]), "Shift + arrastar soma o trecho", await trechos());
  await p.keyboard.press("Control+i");
  m = await marcas();
  ok(m["Psicologia"] === "italic" && m["R$315"] === "italic" && m["Meta Ads"] === "bold", "itálico nos dois trechos (Ctrl+I)", m);

  // 4. Shift + clique duplo soma a palavra
  await clicar("Ads", { clickCount: 2 });
  await comShift(() => clicar("PIX", { clickCount: 2 }));
  ok(JSON.stringify(await trechos()) === JSON.stringify(["Ads", "PIX"]), "Shift + clique duplo soma a palavra", await trechos());

  // 5. Sem nada selecionado, Shift+clique estica a seleção como sempre
  await clicar("Meta Ads", {}, 0);
  await comShift(() => clicar("Google Ads", {}, 0.5));
  const t5 = await trechos();
  ok(t5.length === 1 && t5[0].startsWith("Meta Ads") && t5[0].includes("Campanha Geral"), "Shift+clique a partir do cursor estica (um trecho só)", t5);

  // 6. Clique comum desfaz a seleção múltipla; Backspace apaga os trechos sem levar o meio junto
  await clicar("Meta Ads", { clickCount: 3 });
  await comShift(() => clicar("Google Ads", { clickCount: 3 }));
  await p.keyboard.press("Backspace");
  const texto = await p.evaluate(() => document.querySelector(".ProseMirror").editor.getText());
  ok(!texto.includes("Meta Ads") && !texto.includes("Google Ads") && texto.includes("R$27 mil para Psicologia") && texto.includes("via PIX"), "Backspace apaga só os trechos", texto);
  await p.keyboard.press("Control+z");
  await clicar("PIX", {});
  ok((await trechos()).length === 1, "clique comum volta a um cursor só");

  // 7. Ctrl + mouse faz o mesmo que Shift, inclusive a partir de um cursor sem seleção
  await clicar("Meta Ads", { clickCount: 3 });
  await comCtrl(() => clicar("Google Ads", { clickCount: 3 }));
  ok(JSON.stringify(await trechos()) === JSON.stringify(["Meta Ads", "Google Ads"]), "Ctrl + clique triplo soma a linha", await trechos());
  await comCtrl(() => clicar("R$315", { clickCount: 2 }));
  ok((await trechos()).length === 3, "Ctrl + clique duplo soma a 3ª seleção", await trechos());
  await clicar("PIX", {});
  await comCtrl(() => clicar("Psicologia", { clickCount: 2 }));
  await comCtrl(() => clicar("PIX", { clickCount: 2 }));
  ok(JSON.stringify(await trechos()) === JSON.stringify(["Psicologia", "PIX"]), "Ctrl + clique duplo a partir do cursor soma palavras", await trechos());
  await p.keyboard.press("Control+b");
  m = await marcas();
  ok(/bold/.test(m["Psicologia"] ?? "") && /bold/.test(m["PIX"] ?? ""), "Ctrl+B nas duas palavras", m);
} finally {
  await nav.close();
  await limpar();
}
console.log(falhou ? "\nHOUVE FALHA" : "\nTUDO OK");
process.exit(falhou ? 1 : 0);
