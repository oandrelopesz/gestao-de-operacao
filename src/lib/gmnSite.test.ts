import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidatosDeFoto, candidatosDeLogo, deduplicar, imagensDoBundle, imagensDoHtml, scriptsDoSite, separarCandidatos,
  urlPublicaHttp, type CandidatoSite,
} from "../../supabase/functions/gmn/site.ts";

const HTML = `<!doctype html><html><head>
<meta property="og:image" content="/img/capa.jpg"><meta property="og:image:alt" content="Fachada da loja">
<link rel="icon" href="/favicon.svg"><link rel="apple-touch-icon" href="https://cdn.loja.com/apple.png">
<script type="application/ld+json">{"@type":"AutoDealer","name":"Loja X","logo":"https://cdn.loja.com/logo-x.png","image":"/img/loja.webp"}</script>
<script type="module" src="/assets/index-abc123.js"></script>
</head><body>
<header><img class="site-logo" src="/img/marca.svg" alt="Loja X"></header>
<figure><img src="/img/patio.jpg" alt=""><figcaption>Pátio com <b>40 seminovos</b></figcaption></figure>
<img src="data:image/gif;base64,R0lGOD" alt="pixel"><img srcset="/img/sedan-480.jpg 480w, /img/sedan-1200.jpg 1200w" alt="Sedã prata">
<div style="background-image:url('/img/fundo.png')"></div>
</body></html>`;

test("imagensDoHtml: og, ícones, JSON-LD, img com legenda/alt/srcset e CSS; logo marcada; data: fora", () => {
  const r = imagensDoHtml(HTML, "https://www.loja.com/");
  const por = (u: string) => r.find((c) => c.url === u);
  assert.equal(por("https://www.loja.com/img/capa.jpg")?.descricao, "Fachada da loja");
  assert.equal(por("https://www.loja.com/favicon.svg")?.logo, true);
  assert.equal(por("https://cdn.loja.com/logo-x.png")?.logo, true);
  assert.equal(por("https://www.loja.com/img/marca.svg")?.logo, true);
  assert.equal(por("https://www.loja.com/img/patio.jpg")?.descricao, "Pátio com 40 seminovos");
  assert.equal(por("https://www.loja.com/img/sedan-1200.jpg")?.descricao, "Sedã prata");
  assert.ok(por("https://www.loja.com/img/fundo.png"));
  assert.ok(por("https://www.loja.com/img/loja.webp"));
  assert.ok(!r.some((c) => c.url.startsWith("data:")));
});

test("scriptsDoSite e imagensDoBundle: só .js do próprio site; caminhos de imagem dentro do .js", () => {
  assert.deepEqual(scriptsDoSite(HTML, "https://www.loja.com/"), ["https://www.loja.com/assets/index-abc123.js"]);
  const js = `const a="/assets/hero-9f8e.jpg",b='https://cdn.x.com/logo-brand.png',c="/api/dados.json";`;
  const r = imagensDoBundle(js, "https://www.loja.com/assets/index-abc123.js");
  assert.deepEqual(r.map((c) => c.url), ["https://www.loja.com/assets/hero-9f8e.jpg", "https://cdn.x.com/logo-brand.png"]);
  assert.equal(r[1].logo, true);
});

test("deduplicar soma descrição e marca de logo; separarCandidatos limita e ordena", () => {
  const d = deduplicar([
    { url: "https://a/1.png", descricao: "", fonte: "img", logo: false },
    { url: "https://a/1.png", descricao: "Logo A", fonte: "jsonld", logo: true },
  ]);
  assert.deepEqual(d, [{ url: "https://a/1.png", descricao: "Logo A", fonte: "img", logo: true }]);
  const muitos = Array.from({ length: 60 }, (_, i) => ({ url: `https://a/${i}.jpg`, descricao: "", fonte: "img" as const, logo: i < 12 }));
  const s = separarCandidatos(muitos);
  assert.equal(s.logos.length, 8);
  assert.equal(s.imagens.length, 40);
  assert.ok(s.imagens.every((c) => !c.logo));
});

const c = (url: string, fonte: CandidatoSite["fonte"], logo: boolean, descricao = ""): CandidatoSite => ({ url, descricao, fonte, logo });

test("candidatosDeLogo: os com cara de logo ou de ícone, JSON-LD e og primeiro, até 16, sem rastreadores", () => {
  const lista = [
    c("https://a/css.png", "css", true),
    c("https://a/img.png", "img", true),
    c("https://a/favicon.ico", "icone", false), // fonte "icone" vale mesmo sem a marca
    c("https://a/ld.png", "jsonld", true),
    c("https://a/foto.jpg", "img", false, "Fachada da loja"),
    c("https://a/og.png", "og", true),
    c("https://www.facebook.com/tr?id=1", "img", true),
  ];
  assert.deepEqual(
    candidatosDeLogo(lista).map((x) => x.url),
    ["https://a/ld.png", "https://a/og.png", "https://a/img.png", "https://a/css.png", "https://a/favicon.ico"],
  );
  assert.deepEqual(candidatosDeLogo(lista, 2).map((x) => x.url), ["https://a/ld.png", "https://a/og.png"]);
  const muitos = Array.from({ length: 60 }, (_, i) => c(`https://a/${i}.jpg`, "img", i < 20));
  assert.equal(candidatosDeLogo(muitos).length, 16);
  assert.equal(candidatosDeLogo(muitos, 5).length, 5);
  assert.ok(candidatosDeLogo(muitos).every((x) => x.logo));
});

test("candidatosDeFoto: os que não são logo nem ícone, com descrição primeiro, até 24, sem rastreadores", () => {
  const lista = [
    c("https://a/sem.jpg", "img", false),
    c("https://a/logo.png", "img", true),
    c("https://a/favicon.ico", "icone", false),
    c("https://a/com.jpg", "img", false, "Pátio com sedãs"),
    c("https://a/pixel.gif", "img", false), // "/pixel" é rastreador
    c("https://a/og.jpg", "og", false, "Fachada"),
  ];
  assert.deepEqual(
    candidatosDeFoto(lista).map((x) => x.url),
    ["https://a/com.jpg", "https://a/og.jpg", "https://a/sem.jpg"],
  );
  const muitos = Array.from({ length: 60 }, (_, i) => c(`https://a/${i}.jpg`, "img", i < 12));
  assert.equal(candidatosDeFoto(muitos).length, 24);
  assert.equal(candidatosDeFoto(muitos, 10).length, 10);
  assert.ok(candidatosDeFoto(muitos).every((x) => !x.logo));
});

test("candidatosDeLogo e candidatosDeFoto repartem a lista do HTML de exemplo", () => {
  const lista = imagensDoHtml(HTML, "https://www.loja.com/");
  const logos = candidatosDeLogo(lista).map((x) => x.url);
  const fotos = candidatosDeFoto(lista).map((x) => x.url);
  for (const u of ["https://cdn.loja.com/logo-x.png", "https://www.loja.com/favicon.svg", "https://cdn.loja.com/apple.png", "https://www.loja.com/img/marca.svg"]) {
    assert.ok(logos.includes(u), u);
    assert.ok(!fotos.includes(u), u);
  }
  for (const u of ["https://www.loja.com/img/capa.jpg", "https://www.loja.com/img/patio.jpg", "https://www.loja.com/img/sedan-1200.jpg"]) {
    assert.ok(fotos.includes(u), u);
    assert.ok(!logos.includes(u), u);
  }
  // Com descrição primeiro: capa, pátio e sedã têm; fundo.png e loja.webp não.
  assert.ok(fotos.indexOf("https://www.loja.com/img/patio.jpg") < fotos.indexOf("https://www.loja.com/img/fundo.png"));
});

test("urlPublicaHttp: só http(s) e host público", () => {
  assert.ok(urlPublicaHttp("https://www.loja.com/x.jpg"));
  for (const u of ["file:///etc/passwd", "http://localhost/x", "http://127.0.0.1/x", "http://10.0.0.5/x", "http://192.168.1.2/x", "http://169.254.169.254/x", "http://[::1]/x", "ftp://a/x", "nada"]) {
    assert.equal(urlPublicaHttp(u), null, u);
  }
});

test("urlPublicaHttp: faixas internas, IPv6 interno, hosts sem ponto e domínios que só parecem internos", () => {
  for (const u of [
    "http://0.0.0.0/x", "http://172.16.0.1/x", "http://172.31.255.255/x", "http://100.64.0.1/x", "http://2130706433/x",
    "http://[::]/x", "http://[fe80::1]/x", "http://[fd00::1]/x", "http://[fc00::1]/x", "http://[::ffff:127.0.0.1]/x",
    "http://servidor/x", "http://metadata.google.internal/x", "http://app.localhost/x", "http://impressora.local/x",
  ]) assert.equal(urlPublicaHttp(u), null, u);
  for (const u of [
    "https://fcbarcelona.com/x.jpg", "https://fdic.gov/x.jpg", "https://fedex.com/x.jpg", "http://172.32.0.1/x", "http://100.63.0.1/x",
    "http://8.8.8.8/x", "https://localhost.com/x.jpg",
  ]) assert.ok(urlPublicaHttp(u), u);
});
