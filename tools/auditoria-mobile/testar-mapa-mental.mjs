// Mapa mental com teclado e mouse de verdade: cria um quadro "TESTE CLAUDE — mapa" com o modelo Mapa mental, escreve,
// cria tópicos com Enter/Tab, recolhe/expande, apaga ramo e desfaz, arrasta para o outro lado, recarrega e confere.
// Apaga o quadro de teste no fim. Uso: node testar-mapa-mental.mjs http://localhost:5190 <pasta>
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CHROME, abrirEstavel } from "./rotas.mjs";

const [BASE, SAIDA] = process.argv.slice(2);
mkdirSync(SAIDA, { recursive: true });
const nav = await chromium.launch({ executablePath: CHROME });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(String(e).slice(0, 300)));
p.on("console", (m) => { if (m.type() === "error" && !/hydrat|cz-shortcut/i.test(m.text())) erros.push(m.text().slice(0, 300)); });
const espera = (ms) => p.waitForTimeout(ms);
const r = {};
const foto = (nome) => p.screenshot({ path: `${SAIDA}/${nome}.png` });

/** Tópicos do mapa: id, texto, pai, lado, recolhido e caixa */
const topicos = () => p.evaluate(() => {
  const vivos = h.elements.filter((e) => !e.isDeleted);
  const texto = (id) => vivos.find((t) => t.containerId === id)?.text ?? "";
  return vivos.filter((e) => e.customData?.mm).map((e) => ({
    id: e.id, texto: texto(e.id), pai: e.customData.mm.pai, lado: e.customData.mm.lado, recolhido: !!e.customData.mm.recolhido,
    x: e.x, y: e.y, w: e.width, h: e.height,
  }));
});
const ligacoes = () => p.evaluate(() => h.elements.filter((e) => !e.isDeleted && e.customData?.mmLigacao).map((e) => ({
  filho: e.customData.mmLigacao.filho, de: e.startBinding?.elementId, para: e.endBinding?.elementId, pts: e.points.length,
})));
const sobreposicoes = (ts) => {
  let n = 0;
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
    const a = ts[i], b = ts[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) n++;
  }
  return n;
};
const naTela = (x, y) => p.evaluate(([x, y]) => { const s = h.state; return { x: (x + s.scrollX) * s.zoom.value + s.offsetLeft, y: (y + s.scrollY) * s.zoom.value + s.offsetTop }; }, [x, y]);
const clicarNoTopico = async (t) => { const c = await naTela(t.x + t.w / 2, t.y + 6); await p.mouse.click(c.x, c.y); await espera(250); };
const escrevendo = () => p.evaluate(() => !!document.querySelector(".excalidraw textarea.excalidraw-wysiwyg"));

let idQuadro = null;
try {
  // Quadro novo com o modelo Mapa mental
  await abrirEstavel(p, `${BASE}/fluxogramas`, 6000);
  await p.getByRole("button", { name: "Novo quadro" }).first().click();
  const d = p.getByRole("dialog");
  await d.waitFor();
  await d.getByRole("button", { name: /Mapa mental/ }).click();
  await d.locator("#novo-quadro-nome").fill("TESTE CLAUDE — mapa");
  await foto("01-novo-quadro");
  await d.getByRole("button", { name: "Criar e abrir" }).click();
  await p.waitForURL(/\/fluxogramas\/[0-9a-f-]{36}/, { timeout: 30000 });
  idQuadro = p.url().split("/").pop();
  await p.waitForFunction(() => window.h?.app && document.querySelector(".excalidraw canvas.interactive"), null, { timeout: 60000 });
  await p.waitForFunction(() => h.elements.filter((e) => !e.isDeleted && e.customData?.mm).length === 5, null, { timeout: 15000 });
  await espera(600);
  r.criouMapa = (await topicos()).length;
  r.raizEscrevendo = await escrevendo();
  await foto("02-mapa-criado");

  // Escreve a ideia central; Enter confirma e abre um tópico novo; Tab cria filho; Enter cria irmão
  await p.keyboard.type("Plano 2027");
  await p.keyboard.press("Enter"); await espera(500);
  r.enterNaRaizAbriuTopico = await escrevendo();
  await p.keyboard.type("Marketing");
  await p.keyboard.press("Tab"); await espera(500);
  await p.keyboard.type("Anúncios");
  await p.keyboard.press("Enter"); await espera(500);
  await p.keyboard.type("Orgânico");
  await p.keyboard.press("Escape"); await espera(700);
  let ts = await topicos();
  const porTexto = (t) => ts.find((x) => x.texto === t);
  const raiz = ts.find((x) => x.pai === null);
  r.textos = ts.map((t) => t.texto);
  r.hierarquia = {
    raiz: raiz?.texto,
    marketingFilhoDaRaiz: porTexto("Marketing")?.pai === raiz?.id,
    anunciosFilhoDeMarketing: porTexto("Anúncios")?.pai === porTexto("Marketing")?.id,
    organicoIrmaoDeAnuncios: porTexto("Orgânico")?.pai === porTexto("Marketing")?.id,
  };
  r.sobreposicoes = sobreposicoes(ts);
  const ls = await ligacoes();
  r.ligacoes = { total: ls.length, todasPresas: ls.every((l) => l.para === l.filho && ts.find((t) => t.id === l.filho)?.pai === l.de), curvas: ls.every((l) => l.pts === 4) };
  await foto("03-com-topicos");

  // Barra flutuante com Marketing selecionado
  await clicarNoTopico(porTexto("Marketing"));
  r.barra = await p.locator(".mm-barra button").count();
  await foto("04-barra");

  // Recolher Marketing (Ctrl+.) e expandir pelo selo
  await p.keyboard.press("Control+."); await espera(500);
  ts = await topicos();
  r.recolhido = { marketing: ts.find((t) => t.texto === "Marketing")?.recolhido, sumiram: !ts.some((t) => t.texto === "Anúncios"), selo: await p.locator(".mm-selo").first().textContent().catch(() => null) };
  await foto("05-recolhido");
  await p.locator(".mm-selo").first().click(); await espera(500);
  ts = await topicos();
  r.expandido = ts.some((t) => t.texto === "Anúncios") && ts.some((t) => t.texto === "Orgânico");

  // Apagar o ramo Orgânico e desfazer
  await clicarNoTopico(ts.find((t) => t.texto === "Orgânico"));
  await p.keyboard.press("Delete"); await espera(400);
  const aposApagar = (await topicos()).some((t) => t.texto === "Orgânico");
  await p.keyboard.press("Control+z"); await espera(400);
  r.apagarEDesfazer = { apagou: !aposApagar, voltou: (await topicos()).some((t) => t.texto === "Orgânico") };

  // Arrastar "Tópico 1" (direita) para a esquerda da ideia central
  ts = await topicos();
  const t1 = ts.find((t) => t.texto === "Tópico 1");
  const rz = ts.find((t) => t.pai === null);
  await p.keyboard.press("Escape"); await p.mouse.click(300, 860); await espera(200);
  const ini = await naTela(t1.x + t1.w / 2, t1.y + 6);
  const fim = await naTela(rz.x - 260, rz.y + 6);
  await p.mouse.move(ini.x, ini.y); await p.mouse.down(); await p.mouse.move((ini.x + fim.x) / 2, ini.y, { steps: 8 }); await p.mouse.move(fim.x, fim.y, { steps: 8 }); await p.mouse.up();
  await espera(700);
  ts = await topicos();
  r.trocouDeLado = ts.find((t) => t.texto === "Tópico 1")?.lado;
  r.sobreposicoesDepois = sobreposicoes(ts);
  await foto("06-arrastado");

  // Recolhe de novo e recarrega: tudo precisa voltar igual (inclusive o recolhido)
  await clicarNoTopico(ts.find((t) => t.texto === "Marketing"));
  await p.keyboard.press("Control+."); await espera(400);
  await p.keyboard.press("Escape"); await p.mouse.click(300, 860);
  await p.waitForFunction(() => /Salvo/.test(document.querySelector(".fluxo-editor")?.firstElementChild?.textContent || ""), null, { timeout: 20000 });
  await espera(2500);
  const antesDeRecarregar = (await topicos()).map((t) => t.texto).sort();
  await p.reload();
  await p.waitForFunction(() => window.h?.app && h.elements.some((e) => e.customData?.mm), null, { timeout: 60000 });
  await espera(1000);
  const depois = await topicos();
  r.recarregou = {
    iguais: JSON.stringify(depois.map((t) => t.texto).sort()) === JSON.stringify(antesDeRecarregar),
    marketingRecolhido: depois.find((t) => t.texto === "Marketing")?.recolhido,
  };
  await clicarNoTopico(depois.find((t) => t.texto === "Marketing"));
  await p.keyboard.press("Control+."); await espera(500);
  r.expandiuAposRecarregar = (await topicos()).some((t) => t.texto === "Anúncios");
  await p.keyboard.press("Escape"); await p.mouse.click(300, 860); await espera(300);
  await foto("07-final");

  // Card comum: Enter continua editando o texto dele (atalho do mapa não interfere)
  await p.click(".excalidraw [title=\"Formas extras e cards\"]"); await espera(400);
  await p.getByRole("tab", { name: "Cards" }).click(); await espera(200);
  await p.getByRole("button", { name: /Card arredondado/ }).click(); await espera(300);
  await p.locator(".excalidraw .painel-gestor .sidebar__header__buttons button").last().click(); await espera(300);
  const card = await p.evaluate(() => { const e = h.elements.filter((x) => !x.isDeleted && x.type === "rectangle" && !x.customData?.mm).at(-1); return { x: e.x, y: e.y, w: e.width, h: e.height }; });
  await clicarNoTopico(card);
  r.dicaEscondidaNoMapa = null;
  await p.keyboard.press("Enter"); await espera(300);
  r.enterNoCardEdita = await escrevendo();
  await p.keyboard.press("Escape");
  r.mapaIntacto = (await topicos()).length;
} catch (e) {
  r.falha = String(e).slice(0, 500);
  await foto("99-falha").catch(() => {});
}
// Limpeza: apaga o quadro de teste
if (idQuadro) {
  r.limpeza = await p.evaluate(async (id) => {
    const { excluirFluxo } = await import("/src/lib/fluxosDados.ts");
    await excluirFluxo(id);
    return "apagado";
  }, idQuadro).catch((e) => String(e).slice(0, 120));
}
r.erros = erros;
console.log(JSON.stringify(r, null, 1));
await nav.close();
