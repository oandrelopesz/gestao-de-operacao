import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidatosDeFoto, candidatosDeLogo, decodificarPagina, deduplicar, imagensDoBundle, imagensDoHtml, scriptsDoSite,
  separarCandidatos, urlPublicaHttp, type CandidatoSite,
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

test("imagensDoHtml: a pista de logo olha alt, classe, id e nome do arquivo (palavra inteira), nunca o domínio, as pastas nem pedaços de palavra", () => {
  const html = `<html><body>
  <img src="https://www.multimarcas.com.br/wp-content/uploads/marcas/patio.jpg" alt="Pátio coberto">
  <img src="https://brandao.com/foto.jpg" alt="Fachada da loja">
  <img src="/img/todas.jpg" alt="Seminovos de todas as marcas">
  <img src="/img/frente.jpg" alt="logo ali na frente">
  <img src="/img/logo-loja.png" alt="">
  <img src="/img/cabecalho.png" class="site-logo" alt="">
  <img src="/img/camel.png" class="siteLogo" alt="">
  <img src="/img/arquivo.png" id="brand" alt="">
  <img src="/img/Logomarca-Loja.PNG" alt="">
  <img src="/img/logotipo_2024.svg" alt="">
  <img src="/img/logos-clientes/selo.jpg" alt="Selo">
  <img src="/img/branding.jpg" alt="Equipe">
  <div style="background:url(/css/multimarcas-fundo.jpg)"></div><div style="background:url(/css/logo.png)"></div>
  </body></html>`;
  const r = imagensDoHtml(html, "https://www.loja.com/");
  const logo = (u: string) => r.find((x) => x.url === u)?.logo;
  for (const u of [
    "https://www.multimarcas.com.br/wp-content/uploads/marcas/patio.jpg", "https://brandao.com/foto.jpg",
    "https://www.loja.com/img/todas.jpg", "https://www.loja.com/img/logos-clientes/selo.jpg", "https://www.loja.com/img/branding.jpg",
    "https://www.loja.com/css/multimarcas-fundo.jpg",
  ]) assert.equal(logo(u), false, u);
  for (const u of [
    "https://www.loja.com/img/logo-loja.png", "https://www.loja.com/img/cabecalho.png", "https://www.loja.com/img/camel.png",
    "https://www.loja.com/img/arquivo.png", "https://www.loja.com/img/Logomarca-Loja.PNG", "https://www.loja.com/img/logotipo_2024.svg",
    "https://www.loja.com/css/logo.png",
    "https://www.loja.com/img/frente.jpg", // "logo" como palavra solta no alt vale como pista fraca: a visão decide
  ]) assert.equal(logo(u), true, u);
  // Pista fraca não tira da busca de fotos: as quatro fotos pedidas continuam candidatas, inclusive a do alt "logo ali na frente".
  const fotos = candidatosDeFoto(r).map((x) => x.url);
  for (const u of [
    "https://www.multimarcas.com.br/wp-content/uploads/marcas/patio.jpg", "https://brandao.com/foto.jpg",
    "https://www.loja.com/img/todas.jpg", "https://www.loja.com/img/frente.jpg",
  ]) assert.ok(fotos.includes(u), u);
  assert.ok(fotos.includes("https://www.loja.com/img/logo-loja.png"), "pista fraca (nome do arquivo): a visão decide");
  assert.ok(!fotos.includes("https://www.loja.com/img/logotipo_2024.svg"), "SVG é sinal forte");
  // Na busca de logos entram os de pista fraca e os de pista forte.
  const logos = candidatosDeLogo(r).map((x) => x.url);
  for (const u of ["https://www.loja.com/img/logo-loja.png", "https://www.loja.com/img/cabecalho.png", "https://www.loja.com/img/frente.jpg"]) {
    assert.ok(logos.includes(u), u);
  }
  assert.ok(!logos.includes("https://brandao.com/foto.jpg"));
});

test("imagensDoHtml: og:logo, logo do JSON-LD e ícones são sinal forte; imagem do JSON-LD e og:image não", () => {
  const html = `<head><meta property="og:image" content="/og.jpg"><meta property="og:logo" content="/og-logo.png">
  <link rel="icon" href="/favicon.png">
  <script type="application/ld+json">{"name":"Loja","logo":"/ld-logo.png","image":"/ld-foto.jpg"}</script></head>
  <body><img class="site-logo" src="/img/cabecalho.png" alt=""></body>`;
  const r = imagensDoHtml(html, "https://www.loja.com/");
  const por = (u: string) => r.find((x) => x.url === `https://www.loja.com${u}`);
  assert.equal(por("/og-logo.png")?.logoForte, true);
  assert.equal(por("/ld-logo.png")?.logoForte, true);
  assert.equal(por("/favicon.png")?.fonte, "icone");
  assert.notEqual(por("/ld-foto.jpg")?.logoForte, true);
  assert.notEqual(por("/og.jpg")?.logoForte, true);
  assert.notEqual(por("/img/cabecalho.png")?.logoForte, true);
  assert.equal(por("/img/cabecalho.png")?.logo, true);
  const fotos = candidatosDeFoto(r).map((x) => x.url.replace("https://www.loja.com", ""));
  assert.deepEqual(fotos.sort(), ["/img/cabecalho.png", "/ld-foto.jpg", "/og.jpg"]);
});

test("imagensDoHtml: imagens preguiçosas (src com placeholder data:, data-original, data-lazy, data-lazy-srcset, data-srcset)", () => {
  const html = `<body>
  <img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" data-lazy-src="/lazy/a.jpg" alt="Sedã a">
  <img src="data:image/gif;base64,R0lGOD" data-src="/lazy/b.jpg">
  <img src="data:image/gif;base64,R0lGOD" data-original="/lazy/c.jpg">
  <img src="data:image/gif;base64,R0lGOD" data-lazy="/lazy/d.jpg">
  <img src="data:image/gif;base64,R0lGOD" data-lazy-srcset="/lazy/e-300.jpg 300w, /lazy/e-900.jpg 900w">
  <img src="data:image/gif;base64,R0lGOD" data-srcset="/lazy/f-300.jpg 300w, /lazy/f-900.jpg 900w">
  <img data-src="data:image/gif;base64,R0lGOD" data-lazy-src="/lazy/g.jpg">
  <figure><img src="data:image/gif;base64,R0lGOD" data-lazy-src="/lazy/h.jpg"><figcaption>Interior do <i>SUV</i></figcaption></figure>
  </body>`;
  const r = imagensDoHtml(html, "https://www.loja.com/");
  assert.deepEqual(r.map((x) => x.url), [
    "https://www.loja.com/lazy/a.jpg", "https://www.loja.com/lazy/b.jpg", "https://www.loja.com/lazy/c.jpg", "https://www.loja.com/lazy/d.jpg",
    "https://www.loja.com/lazy/e-900.jpg", "https://www.loja.com/lazy/f-900.jpg", "https://www.loja.com/lazy/g.jpg", "https://www.loja.com/lazy/h.jpg",
  ]);
  assert.equal(r[0].descricao, "Sedã a");
  assert.equal(r[7].descricao, "Interior do SUV");
});

test("imagensDoHtml: JSON-LD com image em lista de textos, em lista de objetos com url e em objeto com url", () => {
  const html = `<head>
  <script type="application/ld+json">{"@type":"AutoDealer","name":"Loja","image":["https://cdn.loja.com/a.jpg",{"@type":"ImageObject","url":"/b.jpg"},3,null]}</script>
  <script type="application/ld+json">{"@type":"Store","name":"Filial","image":{"@type":"ImageObject","url":"https://cdn.loja.com/c.jpg"},"logo":[{"url":"/l1.png"},"/l2.png"]}</script>
  <script type="application/ld+json">[{"@type":"Product","name":"Sedã","image":["/d.jpg"]}]</script></head>`;
  const r = imagensDoHtml(html, "https://www.loja.com/");
  const por = (u: string) => r.find((x) => x.url === u);
  for (const u of ["https://cdn.loja.com/a.jpg", "https://www.loja.com/b.jpg", "https://cdn.loja.com/c.jpg", "https://www.loja.com/d.jpg"]) {
    assert.equal(por(u)?.fonte, "jsonld", u);
    assert.equal(por(u)?.logo, false, u);
  }
  assert.equal(por("https://www.loja.com/b.jpg")?.descricao, "Loja");
  assert.equal(por("https://www.loja.com/d.jpg")?.descricao, "Sedã");
  assert.equal(por("https://www.loja.com/l1.png")?.logo, true);
  assert.equal(por("https://www.loja.com/l2.png")?.logoForte, true);
  assert.equal(r.length, 6);
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

// `forte`: sinal forte de logo (og:logo ou logo do JSON-LD); só ele, e não a pista fraca de texto, tira a imagem da busca de fotos.
const c = (url: string, fonte: CandidatoSite["fonte"], logo: boolean, descricao = "", forte = false): CandidatoSite =>
  ({ url, descricao, fonte, logo, ...(forte ? { logoForte: true } : {}) });

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

test("candidatosDeFoto: sem sinal forte de logo nem ícone, com descrição primeiro, até 24, sem rastreadores", () => {
  const lista = [
    c("https://a/sem.jpg", "img", false),
    c("https://a/logo-forte.png", "jsonld", true, "", true), // logo do JSON-LD: sinal forte
    c("https://a/og-logo.png", "og", true, "", true), // og:logo: sinal forte
    c("https://a/favicon.ico", "icone", false),
    c("https://a/com.jpg", "img", false, "Pátio com sedãs"),
    c("https://a/pixel.gif", "img", false), // "/pixel" é rastreador
    c("https://a/og.jpg", "og", false, "Fachada"),
  ];
  assert.deepEqual(
    candidatosDeFoto(lista).map((x) => x.url),
    ["https://a/com.jpg", "https://a/og.jpg", "https://a/sem.jpg"],
  );
  const muitos = Array.from({ length: 60 }, (_, i) => c(`https://a/${i}.jpg`, "jsonld", i < 12, "", i < 12));
  assert.equal(candidatosDeFoto(muitos).length, 24);
  assert.equal(candidatosDeFoto(muitos, 10).length, 10);
  assert.ok(candidatosDeFoto(muitos).every((x) => !x.logo));
});

test("candidatosDeFoto: pista fraca de logo (só texto) não tira da busca de fotos: a visão decide; na busca de logos entra", () => {
  const lista = [
    c("https://a/patio.jpg", "img", true, "Pátio coberto"), // só a pista de texto (alt, classe, nome)
    c("https://a/hero.jpg", "og", true), // og:image que repete uma imagem com classe "brand-hero"
    c("https://a/css.png", "css", true),
    c("https://a/logo-forte.png", "jsonld", true, "", true),
  ];
  assert.deepEqual(candidatosDeFoto(lista).map((x) => x.url), ["https://a/patio.jpg", "https://a/hero.jpg", "https://a/css.png"]);
  assert.deepEqual(
    candidatosDeLogo(lista).map((x) => x.url),
    ["https://a/hero.jpg", "https://a/logo-forte.png", "https://a/patio.jpg", "https://a/css.png"],
  );
  // O sinal forte sobrevive à junção da mesma URL, qualquer que seja a fonte que veio primeiro.
  const junto = deduplicar([c("https://a/x.png", "og", false), c("https://a/x.png", "jsonld", true, "Loja", true)]);
  assert.equal(junto[0].logoForte, true);
  assert.deepEqual(candidatosDeFoto(junto), []);
  assert.equal(deduplicar([c("https://a/y.png", "og", false), c("https://a/y.png", "img", true)])[0].logoForte, undefined);
  assert.equal(candidatosDeFoto(deduplicar([c("https://a/y.png", "og", false), c("https://a/y.png", "img", true)])).length, 1);
});

test("candidatosDeFoto: SVG e ICO nunca são foto, mesmo com alt longo (ficam pela pista de logo ou ícone)", () => {
  const lista = [
    c("https://a/garantia.svg", "img", false, "Garantia de 3 meses em todos os carros"),
    c("https://a/whatsapp.SVG?v=2", "img", false, "Fale conosco pelo WhatsApp"),
    c("https://a/atalho.ico", "img", false, "Atalho do site para a loja"),
    c("https://a/fundo.svg#x", "css", false),
    c("https://a/foto.jpg", "img", false),
    c("https://a/foto.avif", "img", false, "Fachada da loja em AVIF"),
    c("https://a/imagem", "img", false),
    c("https://a/foto.php?id=1", "img", false, "Pátio coberto"),
  ];
  assert.deepEqual(
    candidatosDeFoto(lista).map((x) => x.url),
    ["https://a/foto.avif", "https://a/foto.php?id=1", "https://a/foto.jpg", "https://a/imagem"],
  );
  assert.deepEqual(separarCandidatos(lista).imagens.map((x) => x.url), candidatosDeFoto(lista).map((x) => x.url));
  // Um bando de SVG com legenda não empurra as fotos do bundle (sem alt) para fora do limite de 24.
  const bando = [
    ...Array.from({ length: 30 }, (_, i) => c(`https://a/selo${i}.svg`, "img", false, `Selo de qualidade número ${i}`)),
    ...Array.from({ length: 5 }, (_, i) => c(`https://a/bundle${i}.jpg`, "bundle", false)),
  ];
  assert.deepEqual(candidatosDeFoto(bando).map((x) => x.url), Array.from({ length: 5 }, (_, i) => `https://a/bundle${i}.jpg`));
});

test("decodificarPagina: charset do cabeçalho, ou do meta nos primeiros 2 KB, senão UTF-8; rótulo desconhecido não derruba", () => {
  const latin1 = (s: string) => Uint8Array.from([...s].map((ch) => ch.charCodeAt(0)));
  const utf8 = (s: string) => new TextEncoder().encode(s);
  // Cabeçalho vence o meta
  assert.equal(decodificarPagina(latin1("<img alt='Pátio'>"), "text/html; charset=ISO-8859-1"), "<img alt='Pátio'>");
  assert.equal(decodificarPagina(latin1("<img alt='Pátio'>"), 'text/html; charset="windows-1252"'), "<img alt='Pátio'>");
  assert.equal(decodificarPagina(utf8("<meta charset='iso-8859-1'>Pátio"), "text/html; charset=utf-8"), "<meta charset='iso-8859-1'>Pátio");
  // Sem charset no cabeçalho: <meta charset> e <meta http-equiv>
  assert.equal(decodificarPagina(latin1("<meta charset=\"iso-8859-1\"><p>Pátio</p>"), "text/html"), "<meta charset=\"iso-8859-1\"><p>Pátio</p>");
  assert.equal(decodificarPagina(latin1("<META HTTP-EQUIV='Content-Type' CONTENT='text/html; charset=windows-1252'>Pátio"), null), "<META HTTP-EQUIV='Content-Type' CONTENT='text/html; charset=windows-1252'>Pátio");
  // Padrão UTF-8 (com e sem cabeçalho) e BOM
  assert.equal(decodificarPagina(utf8("<p>Pátio</p>"), "text/html"), "<p>Pátio</p>");
  assert.equal(decodificarPagina(utf8("<p>Pátio</p>"), null), "<p>Pátio</p>");
  assert.equal(decodificarPagina(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8("<p>Pátio</p>")]), null), "<p>Pátio</p>");
  // Rótulo desconhecido: UTF-8, sem lançar
  assert.equal(decodificarPagina(utf8("<p>Pátio</p>"), "text/html; charset=nao-existe-9"), "<p>Pátio</p>");
  assert.equal(decodificarPagina(utf8("<meta charset=\"xyz\"><p>Pátio</p>"), null), "<meta charset=\"xyz\"><p>Pátio</p>");
  // Meta que diz UTF-16 num texto que é UTF-8: erro do site, vale UTF-8
  assert.equal(decodificarPagina(utf8('<meta charset="utf-16"><p>Pátio</p>'), null), '<meta charset="utf-16"><p>Pátio</p>');
  // O meta só vale nos primeiros 2 KB
  const longe = latin1(`${" ".repeat(3000)}<meta charset="iso-8859-1"><p>Pátio</p>`);
  assert.equal(decodificarPagina(longe, null), new TextDecoder().decode(longe));
  assert.ok(decodificarPagina(longe, null).includes("�"));
  assert.equal(decodificarPagina(new Uint8Array(0), null), "");
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
    "http://198.18.0.1/x", "http://198.19.255.255/x", "http://192.0.0.8/x", "http://[fec0::1]/x", "http://[2002:a9fe:a9fe::1]/x",
  ]) assert.equal(urlPublicaHttp(u), null, u);
  for (const u of [
    "https://fcbarcelona.com/x.jpg", "https://fdic.gov/x.jpg", "https://fedex.com/x.jpg", "http://172.32.0.1/x", "http://100.63.0.1/x",
    "http://8.8.8.8/x", "https://localhost.com/x.jpg", "http://198.17.0.1/x", "http://198.20.0.1/x", "http://192.0.1.1/x",
  ]) assert.ok(urlPublicaHttp(u), u);
});
