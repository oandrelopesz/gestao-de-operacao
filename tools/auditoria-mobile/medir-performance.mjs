// Desempenho de cada aba: abertura a frio (cache vazio) e troca de aba pelo menu (1ª visita e revisita),
// no computador (1440x900) e no celular (390x844, toque, CPU 4x mais lenta e rede 4G).
// Só leitura: toda requisição que não seja GET/HEAD/OPTIONS ao Supabase (e às APIs do Google) é abortada
// antes de sair do navegador, e nenhum botão de salvar/excluir é clicado.
//
// uso: node medir-performance.mjs <BASE> [saida.json]
//   ROTAS=/,/agenda   limita as telas     TELAS=desktop|mobile   limita as telas de aparelho
//   FASES=frio,nav    limita as fases     (padrão: as duas)
//   COMPARAR=<BASE2>  mede também outra versão, intercalando as duas (mesmas condições de máquina e rede)
//   REPETICOES=3      repete cada medida (o resumo usa a mediana) — a máquina/rede variam bastante
// Resumo em tabela: node resumir-performance.mjs <saida.json> [tabela.md]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gzipSync } from "node:zlib";
import { ROTAS as TODAS, CHROME } from "./rotas.mjs";

const [BASE = "http://localhost:4199", SAIDA = "resultados/performance.json"] = process.argv.slice(2);
// O Fireflies também está no menu (fica fora da lista da auditoria visual): entra logo depois do Transcritor,
// achado pela posição na lista — assim a lista não depende de índices fixos nem repete rota
const MENU = [...TODAS];
const depoisDoTranscritor = MENU.indexOf("/transcritor") + 1;
if (depoisDoTranscritor > 0 && !MENU.includes("/fireflies")) MENU.splice(depoisDoTranscritor, 0, "/fireflies");
const BASES = [BASE, ...(process.env.COMPARAR ? [process.env.COMPARAR] : [])];
const REPETICOES = Math.max(1, Number(process.env.REPETICOES || 1));
const ROTAS = process.env.ROTAS ? MENU.filter((r) => process.env.ROTAS.split(",").includes(r)) : MENU;
const FASES = (process.env.FASES || "frio,nav").split(",");
const TELAS = [
  { nome: "desktop", ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  {
    nome: "mobile",
    ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    cpu: 4,
    rede: { offline: false, latency: 40, downloadThroughput: (12 * 1024 * 1024) / 8, uploadThroughput: (6 * 1024 * 1024) / 8 },
  },
].filter((t) => !process.env.TELAS || process.env.TELAS.split(",").includes(t.nome));

const ESPERA_MAX = 20_000; // desiste da tela depois disso
const QUIETO = 2_000; // conteúdo "assentado": 2 s sem mudar
const JANELA_FRIO = 8_000; // abertura a frio: tarefas longas contadas nos primeiros 8 s (inclui o pré-aquecimento)

// Roda em toda página antes do app: tarefas longas, recursos e o instante em que a tela nova fica pronta.
const INIT = `(() => {
  if (window.__perf) return;
  try { performance.setResourceTimingBufferSize(10000); } catch {}
  const P = window.__perf = { lt: [], alvo: null, antigo: null, t0: null, novoEm: null, pronto: null, ultimaMut: null, hidratado: null };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch {}
  const tela = () => document.querySelector("main > div.page-enter");
  const visivel = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  const hidratado = (el) => Object.keys(el).some((k) => k.startsWith("__reactFiber"));
  // Pronto = tela nova montada e hidratada, sem esqueleto/spinner de carregamento (spinner em botão não conta)
  const semCarregando = (c) => {
    for (const el of c.querySelectorAll(".animate-pulse, .animate-spin")) if (!el.closest("button") && visivel(el)) return false;
    return !/Carregando/i.test(c.innerText || "");
  };
  P.armar = (alvo, frio) => {
    P.alvo = alvo; P.antigo = frio ? null : tela(); P.t0 = frio ? 0 : null; P.novoEm = null; P.pronto = null; P.ultimaMut = null;
  };
  const marcarInicio = (e) => {
    if (!P.alvo || P.t0 !== null) return;
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (a && a.getAttribute("href") === P.alvo) P.t0 = e.timeStamp;
  };
  for (const ev of ["pointerdown", "touchstart", "mousedown"]) document.addEventListener(ev, marcarInicio, { capture: true, passive: true });
  const loop = () => {
    const c = tela();
    if (c && P.hidratado === null && hidratado(c)) P.hidratado = performance.now();
    if (P.alvo && P.t0 !== null && c && c !== P.antigo && location.pathname === P.alvo && hidratado(c)) {
      const agora = performance.now();
      if (P.novoEm === null) P.novoEm = agora;
      if (P.pronto === null && c.firstElementChild && semCarregando(c)) P.pronto = agora;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const iniciarObs = () => {
    new MutationObserver((regs) => {
      const c = tela();
      if (!P.alvo || !c || c === P.antigo) return;
      if (regs.some((r) => c.contains(r.target) || r.target === c.parentElement)) P.ultimaMut = performance.now();
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  };
  if (document.documentElement) iniciarObs(); else addEventListener("DOMContentLoaded", iniciarObs);
})();`;

const MEDIA_TOQUE = [
  { name: "pointer", value: "coarse" }, { name: "hover", value: "none" },
  { name: "any-pointer", value: "coarse" }, { name: "any-hover", value: "none" },
];

const gz = new Map();
async function tamanhoGzip(url) {
  if (!gz.has(url)) {
    gz.set(url, fetch(url).then(async (r) => gzipSync(Buffer.from(await r.arrayBuffer())).length).catch(() => 0));
  }
  return gz.get(url);
}

const navegador = await chromium.launch({ executablePath: CHROME, args: ["--disable-features=Translate"] });

async function novaPagina(tela) {
  const contexto = await navegador.newContext({ ...tela.ctx, locale: "pt-BR", serviceWorkers: "block" });
  await contexto.addInitScript(INIT);
  const pagina = await contexto.newPage();
  const cdp = await contexto.newCDPSession(pagina);
  // Trava de segurança: nada que grave no banco/armazenamento sai do navegador
  await cdp.send("Fetch.enable", {
    patterns: [{ urlPattern: "*supabase.co*", requestStage: "Request" }, { urlPattern: "*googleapis.com*", requestStage: "Request" }],
  });
  cdp.on("Fetch.requestPaused", (ev) => {
    const m = ev.request.method;
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") cdp.send("Fetch.continueRequest", { requestId: ev.requestId }).catch(() => {});
    else {
      bloqueadas.add(`${m} ${ev.request.url.replace(/\?.*/, "")}`);
      cdp.send("Fetch.failRequest", { requestId: ev.requestId, errorReason: "BlockedByClient" }).catch(() => {});
    }
  });
  if (tela.cpu) await cdp.send("Emulation.setCPUThrottlingRate", { rate: tela.cpu });
  if (tela.rede) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", tela.rede);
  }
  if (tela.ctx.isMobile) await cdp.send("Emulation.setEmulatedMedia", { features: MEDIA_TOQUE });
  return { contexto, pagina };
}

const estado = (p) => p.evaluate(() => {
  const P = window.__perf;
  return { t0: P.t0, novoEm: P.novoEm, pronto: P.pronto, ultimaMut: P.ultimaMut, hidratado: P.hidratado, agora: performance.now() };
});

// Espera a tela ficar pronta e o conteúdo parar de mudar (ou desiste em ESPERA_MAX)
async function esperarAssentar(p) {
  const inicio = Date.now();
  for (;;) {
    const s = await estado(p);
    if (s.t0 !== null && s.pronto !== null) {
      const ultimo = Math.max(s.pronto, s.ultimaMut ?? 0);
      if (s.agora - ultimo >= QUIETO) return { ...s, conteudo: ultimo, timeout: false };
    }
    if (Date.now() - inicio > ESPERA_MAX) return { ...s, conteudo: s.pronto === null ? null : Math.max(s.pronto, s.ultimaMut ?? 0), timeout: true };
    await p.waitForTimeout(100);
  }
}

const ms = (v) => (v === null || v === undefined ? null : Math.round(v));
const tbt = (lts, de, ate) => Math.round(lts.filter(([s]) => s >= de && s <= ate).reduce((a, [, d]) => a + Math.max(0, d - 50), 0));
const somaLt = (lts, de, ate) => lts.filter(([s]) => s >= de && s <= ate);

// Recursos (JS do app e chamadas ao Supabase/Google) entre dois instantes da página
async function recursos(p, de, ate, base = BASE) {
  const lista = await p.evaluate(([de, ate]) => performance.getEntriesByType("resource")
    .filter((e) => e.startTime >= de && e.startTime <= ate)
    .map((e) => ({ url: e.name, ini: e.startTime, fim: e.responseEnd, bytes: e.decodedBodySize, tipo: e.initiatorType })), [de, ate]);
  const js = lista.filter((r) => r.url.startsWith(base) && /\.js(\?|$)/.test(r.url));
  const supa = lista.filter((r) => /supabase\.co\/(rest|functions|storage|auth)\//.test(r.url));
  const google = lista.filter((r) => /googleapis\.com|google\.com/.test(r.url));
  const chaves = supa.map((r) => { const u = new URL(r.url); return u.pathname.replace(/^\/(rest|functions)\/v1\//, "") + (u.search.length > 1 ? "?" + decodeURIComponent(u.search.slice(1)).slice(0, 80) : ""); });
  const contagem = {};
  for (const k of chaves) contagem[k] = (contagem[k] || 0) + 1;
  const duplicadas = Object.entries(contagem).filter(([, n]) => n > 1).map(([k, n]) => `${n}x ${k}`);
  let gzip = 0;
  for (const r of js) gzip += await tamanhoGzip(r.url);
  return {
    jsArquivos: js.length,
    jsKB: Math.round(js.reduce((a, r) => a + (r.bytes || 0), 0) / 1024),
    jsGzipKB: Math.round(gzip / 1024),
    jsNomes: js.map((r) => r.url.replace(/.*\/assets\//, "").replace(/-[\w-]{8}\.js$/, "")),
    supabase: supa.length,
    supabaseLista: chaves,
    supabaseDuplicadas: duplicadas,
    // a última resposta do Supabase até o conteúdo assentar (quanto a tela esperou pela rede)
    supabaseFim: supa.length ? Math.round(Math.max(...supa.map((r) => r.fim)) - de) : null,
    google: google.length,
  };
}

const resultados = [];
const bloqueadas = new Set();
const salvar = () => {
  mkdirSync(dirname(SAIDA), { recursive: true });
  writeFileSync(SAIDA, JSON.stringify({ bases: BASES, repeticoes: REPETICOES, data: new Date().toISOString(), bloqueadas: [...bloqueadas], resultados }, null, 2));
};
const registrar = (r) => {
  resultados.push(r);
  salvar();
  const f = (v) => (v === null || v === undefined ? "  —  " : String(v).padStart(5));
  console.log(`${BASES.length > 1 ? "[" + String(r.base).replace(/^https?:\/\//, "") + "] " : ""}${r.tela.padEnd(7)} ${r.fase.padEnd(5)} ${r.rota.padEnd(12)} pronto ${f(r.pronto)} conteúdo ${f(r.conteudo)} TBT ${f(r.tbt)} lt ${f(r.longas)} JS ${f(r.jsGzipKB)}KB supa ${f(r.supabase)}${r.supabaseDuplicadas?.length ? " dup " + r.supabaseDuplicadas.length : ""}${r.timeout ? " TIMEOUT" : ""}${r.erro ? " ERRO " + r.erro : ""}`);
};

// Abertura a frio de uma aba (contexto novo = cache vazio)
async function medirFrio(tela, base, rota) {
  const { contexto, pagina } = await novaPagina(tela);
  try {
    await pagina.goto(base + rota, { waitUntil: "commit", timeout: 60_000 });
    await pagina.evaluate((r) => window.__perf.armar(r, true), rota);
    const s = await esperarAssentar(pagina);
    const agora = (await estado(pagina)).agora;
    if (agora < JANELA_FRIO) await pagina.waitForTimeout(JANELA_FRIO - agora);
    const extra = await pagina.evaluate(() => ({
      lt: window.__perf.lt,
      fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
    }));
    const fim = s.conteudo ?? ESPERA_MAX;
    const rec = await recursos(pagina, 0, fim, base);
    const recTotal = await recursos(pagina, 0, JANELA_FRIO, base);
    const recHidratar = await recursos(pagina, 0, s.hidratado ?? fim, base);
    return {
      fcp: ms(extra.fcp), hidratado: ms(s.hidratado), pronto: ms(s.pronto), conteudo: ms(s.conteudo),
      timeout: s.timeout, tbt: tbt(extra.lt, 0, fim), longas: somaLt(extra.lt, 0, fim).length,
      tbt8s: tbt(extra.lt, 0, JANELA_FRIO), longas8s: somaLt(extra.lt, 0, JANELA_FRIO).length,
      maiorTarefa: Math.round(Math.max(0, ...somaLt(extra.lt, 0, JANELA_FRIO).map(([, d]) => d))),
      ...rec, jsGzipKBHidratar: recHidratar.jsGzipKB, jsArquivosHidratar: recHidratar.jsArquivos, jsGzipKB8s: recTotal.jsGzipKB,
      jsArquivos8s: recTotal.jsArquivos, supabase8s: recTotal.supabase, supabaseDuplicadas8s: recTotal.supabaseDuplicadas,
    };
  } catch (e) {
    return { erro: String(e.message || e).slice(0, 160) };
  } finally {
    await contexto.close();
  }
}

// Troca de aba pelo menu lateral, com o app já aberto: 1ª visita (nav1) e revisita (nav2) de cada aba
async function medirNav(tela, base, anotar) {
  const { contexto, pagina } = await novaPagina(tela);
  try {
    await pagina.goto(base + "/", { waitUntil: "commit", timeout: 60_000 });
    await pagina.evaluate(() => window.__perf.armar("/", true));
    await esperarAssentar(pagina);
    await pagina.waitForTimeout(12_000); // o app termina o pré-aquecimento (código e dados de todas as abas)
    let atual = "/";
    const sequencia = [...ROTAS.filter((r) => r !== "/"), "/"];
    for (const fase of ["nav1", "nav2"]) {
      for (const rota of sequencia) {
        if (rota === atual) continue;
        try {
          if (tela.ctx.isMobile) {
            // Celular: abre o menu pelo "Mais" da barra inferior e toca na aba. Os toques vão por eventos
            // no próprio elemento (a emulação às vezes desloca a janela visual e o toque por coordenada erra o alvo).
            await pagina.evaluate(() => document.querySelector("nav[aria-label='Atalhos'] button").click());
            await pagina.waitForTimeout(450);
          }
          const link = pagina.locator(`aside nav a[href="${rota}"]`).first();
          await pagina.evaluate((r) => window.__perf.armar(r, false), rota);
          if (tela.ctx.isMobile) {
            await pagina.evaluate((r) => {
              const a = document.querySelector(`aside nav a[href="${r}"]`);
              const toque = new Touch({ identifier: 1, target: a, clientX: 20, clientY: 20 });
              a.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
              a.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [toque], targetTouches: [toque], changedTouches: [toque] }));
              a.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, changedTouches: [toque] }));
              a.click();
            }, rota);
          } else {
            await link.hover();
            await pagina.waitForTimeout(150); // mão indo do passar o mouse ao clique
            await link.click();
          }
          const s = await esperarAssentar(pagina);
          const lts = await pagina.evaluate(() => window.__perf.lt);
          const t0 = s.t0 ?? 0;
          const fim = (s.conteudo ?? t0 + ESPERA_MAX);
          const rec = await recursos(pagina, t0, fim, base);
          anotar(fase, rota, {
            de: atual, pronto: ms(s.pronto === null ? null : s.pronto - t0),
            conteudo: ms(s.conteudo === null ? null : s.conteudo - t0), montou: ms(s.novoEm === null ? null : s.novoEm - t0),
            timeout: s.timeout, tbt: tbt(lts, t0, fim), longas: somaLt(lts, t0, fim).length,
            maiorTarefa: Math.round(Math.max(0, ...somaLt(lts, t0, fim).map(([, d]) => d))), ...rec,
          });
          atual = rota;
          await pagina.waitForTimeout(600);
        } catch (e) {
          anotar(fase, rota, { erro: String(e.message || e).slice(0, 160) });
          await pagina.goto(base + rota, { waitUntil: "commit" }).catch(() => {});
          await pagina.evaluate((r) => window.__perf.armar(r, true), rota).catch(() => {});
          await esperarAssentar(pagina).catch(() => {});
          atual = rota;
        }
      }
    }
  } finally {
    await contexto.close();
  }
}

for (const tela of TELAS) {
  // Aquece o navegador/servidor (a 1ª abertura depois de lançar o Chrome sai bem mais lenta e não conta)
  for (const base of BASES) await medirFrio(tela, base, "/");

  if (FASES.includes("frio")) {
    for (const rota of ROTAS) {
      for (let rep = 1; rep <= REPETICOES; rep++) {
        // alterna quem vai primeiro a cada repetição
        const ordem = rep % 2 ? BASES : [...BASES].reverse();
        for (const base of ordem) registrar({ tela: tela.nome, fase: "frio", rota, base, rep, ...(await medirFrio(tela, base, rota)) });
      }
    }
  }

  if (FASES.includes("nav")) {
    for (let rep = 1; rep <= REPETICOES; rep++) {
      const ordem = rep % 2 ? BASES : [...BASES].reverse();
      for (const base of ordem) {
        await medirNav(tela, base, (fase, rota, dados) => registrar({ tela: tela.nome, fase, rota, base, rep, ...dados }));
      }
    }
  }
}
await navegador.close();

salvar();
console.log(`\nRequisições de escrita bloqueadas (${bloqueadas.size}):`);
for (const b of bloqueadas) console.log("  " + b);
console.log(`\nSalvo em ${SAIDA}`);
