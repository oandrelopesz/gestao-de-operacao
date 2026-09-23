import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ehPostLinkedin, midiasDoPostLinkedin, cabecalhoDeCookies, baixarPostLinkedin } from "../src/jobs/linkedin.js";

const img = (id, tam = "feedshare-shrink_1280") => `https://media.licdn.com/dms/image/v2/${id}/${tam}/B4DZ/0/1?e=1&v=beta&t=x`;
const ld = (imagens) => `<script type="application/ld+json">${JSON.stringify({ "@type": "SocialMediaPosting", image: imagens.map((url) => ({ "@type": "ImageObject", url })) })}</script>`;
const artigo = (miolo) => `<main><article class="post">${miolo}</article></main>`;

test("ehPostLinkedin: posts e feed/update; perfil e vagas não", () => {
  assert.equal(ehPostLinkedin("https://www.linkedin.com/posts/fulano_x-share-7506362943828049920-2GbS/"), true);
  assert.equal(ehPostLinkedin("https://br.linkedin.com/feed/update/urn:li:activity:7508159058416390144/"), true);
  assert.equal(ehPostLinkedin("https://www.linkedin.com/in/fulano/"), false);
  assert.equal(ehPostLinkedin("https://www.linkedin.com/jobs/view/1/"), false);
  assert.equal(ehPostLinkedin("https://instagram.com/p/x"), false);
});

test("midiasDoPostLinkedin: imagens do post principal pelo JSON-LD, na ordem", () => {
  const html = ld([img("A"), img("B"), img("C")]) + artigo(`<img src="${img("A")}">`) + `<img src="${img("OUTRO_POST")}">`;
  const r = midiasDoPostLinkedin(html);
  assert.equal(r.tipo, "imagens");
  assert.deepEqual(r.urls.map((u) => u.split("/")[6]), ["A", "B", "C"]);
});

test("midiasDoPostLinkedin: documento (carrossel em PDF) dentro do post principal vira manifesto", () => {
  const cfg = JSON.stringify({ doc: { manifestUrl: "https://media.licdn.com/dms/document/pl/v2/DOC/manifest?e=1&t=y", totalPageCount: 7 } }).replace(/"/g, "&quot;");
  const html = ld([img("CAPA")]) + artigo(`<div data-native-document-config="${cfg}"></div>`);
  assert.deepEqual(midiasDoPostLinkedin(html), { tipo: "documento", manifestUrl: "https://media.licdn.com/dms/document/pl/v2/DOC/manifest?e=1&t=y" });
});

test("midiasDoPostLinkedin: documento de OUTRO post (recomendado, fora do <article>) é ignorado", () => {
  const cfg = JSON.stringify({ doc: { manifestUrl: "https://media.licdn.com/dms/document/pl/v2/OUTRO/m" } }).replace(/"/g, "&quot;");
  const html = ld([img("A"), img("B")]) + artigo(`<img src="${img("A")}">`) + `<div data-native-document-config="${cfg}"></div>`;
  assert.equal(midiasDoPostLinkedin(html).tipo, "imagens");
});

test("midiasDoPostLinkedin: sem JSON-LD usa as imagens do post (sem logo nem foto de perfil)", () => {
  const html = artigo(`<img src="${img("LOGO", "company-logo_100_100")}"><img data-delayed-url="${img("X")}"><img src="${img("Y", "feedshare-image-high-res")}"><img src="${img("PERFIL", "profile-displayphoto-shrink_100_100")}">`);
  const r = midiasDoPostLinkedin(html);
  assert.deepEqual(r.urls.map((u) => u.split("/")[6]), ["X", "Y"]);
});

test("midiasDoPostLinkedin: post sem imagem nem documento (vídeo, só texto) devolve null", () => {
  assert.equal(midiasDoPostLinkedin(artigo("<video></video>")), null);
});

test("cabecalhoDeCookies: pega só os cookies do domínio pedido, no formato de cabeçalho", () => {
  const txt = [
    "# Netscape HTTP Cookie File",
    ".linkedin.com\tTRUE\t/\tTRUE\t0\tli_at\tAAA",
    "#HttpOnly_.www.linkedin.com\tTRUE\t/\tTRUE\t0\tJSESSIONID\t\"ajax:1\"",
    ".google.com\tTRUE\t/\tTRUE\t0\tSID\tNAO",
  ].join("\n");
  assert.equal(cabecalhoDeCookies(txt, "linkedin.com"), 'li_at=AAA; JSESSIONID="ajax:1"');
  assert.equal(cabecalhoDeCookies("", "linkedin.com"), "");
});

function fetchFake(rotas) {
  const chamadas = [];
  const f = async (url, init = {}) => {
    chamadas.push({ url, init });
    const r = rotas.find(([padrao]) => url.includes(padrao));
    if (!r) return { ok: false, status: 404, headers: new Map(), text: async () => "", json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    const [, resp] = r;
    return {
      ok: (resp.status || 200) < 300,
      status: resp.status || 200,
      headers: new Map(Object.entries(resp.headers || {})),
      text: async () => resp.texto || "",
      json: async () => resp.json,
      arrayBuffer: async () => new TextEncoder().encode(resp.bytes || "img").buffer,
    };
  };
  f.chamadas = chamadas;
  return f;
}

test("baixarPostLinkedin: baixa cada imagem na ordem, com extensão pelo content-type e cookies no pedido da página", async () => {
  const dir = await import("node:fs/promises").then((fs) => fs.mkdtemp(`${process.env.TMPDIR || process.env.TEMP || "/tmp"}/li-`));
  const html = ld([img("A"), img("B")]) + artigo("");
  const f = fetchFake([
    ["/posts/", { texto: html }],
    ["/A/", { headers: { "content-type": "image/jpeg" }, bytes: "aaa" }],
    ["/B/", { headers: { "content-type": "image/png" }, bytes: "bbb" }],
  ]);
  const r = await baixarPostLinkedin({ link: "https://www.linkedin.com/posts/x-share-1/", dir, cookies: "li_at=AAA" }, { fetch: f });
  assert.deepEqual(r.map((c) => c.split(/[\\/]/).pop()), ["001_linkedin.jpg", "002_linkedin.png"]);
  assert.equal(await readFile(r[1], "utf8"), "bbb");
  assert.equal(f.chamadas[0].init.headers.Cookie, undefined);
  assert.equal(f.chamadas[0].init.redirect, "manual");
});

test("baixarPostLinkedin: documento baixa todas as páginas na maior resolução", async () => {
  const dir = await import("node:fs/promises").then((fs) => fs.mkdtemp(`${process.env.TMPDIR || process.env.TEMP || "/tmp"}/li-`));
  const cfg = JSON.stringify({ doc: { manifestUrl: "https://media.licdn.com/doc/manifest" } }).replace(/"/g, "&quot;");
  const f = fetchFake([
    ["/posts/", { texto: artigo(`<div data-native-document-config="${cfg}"></div>`) }],
    ["/doc/manifest", { json: { perResolutions: [{ width: 645, imageManifestUrl: "https://media.licdn.com/doc/pequena" }, { width: 1545, imageManifestUrl: "https://media.licdn.com/doc/grande" }] } }],
    ["/doc/grande", { json: { pages: ["https://media.licdn.com/pg/1", "https://media.licdn.com/pg/2", "https://media.licdn.com/pg/3"] } }],
    ["/pg/", { headers: { "content-type": "image/jpeg" } }],
  ]);
  const r = await baixarPostLinkedin({ link: "https://www.linkedin.com/posts/x-share-1/", dir, cookies: "" }, { fetch: f });
  assert.equal(r.length, 3);
  assert.ok(!f.chamadas.some((c) => c.url.includes("/doc/pequena")), "não usa a resolução menor");
});

test("baixarPostLinkedin: redirecionar para cadastro/login vira erro claro de login", async () => {
  const f = fetchFake([["/posts/", { status: 307, headers: { location: "https://www.linkedin.com/signup/cold-join?x=1" } }]]);
  await assert.rejects(
    () => baixarPostLinkedin({ link: "https://www.linkedin.com/posts/x-share-1/", dir: "/tmp/nao-usa", cookies: "" }, { fetch: f }),
    /pediu login/i,
  );
});

test("baixarPostLinkedin: post sem imagem devolve lista vazia (o chamador tenta o yt-dlp)", async () => {
  const f = fetchFake([["/posts/", { texto: artigo("<video></video>") }]]);
  assert.deepEqual(await baixarPostLinkedin({ link: "https://www.linkedin.com/posts/x-share-1/", dir: "/tmp/nao-usa", cookies: "" }, { fetch: f }), []);
});

test("baixarPostLinkedin: tenta sem login primeiro; com login só se o post pedir", async () => {
  const dir = await import("node:fs/promises").then((fs) => fs.mkdtemp(`${process.env.TMPDIR || process.env.TEMP || "/tmp"}/li-`));
  const html = ld([img("A")]) + artigo("");
  const f = fetchFake([["/posts/", { texto: html }], ["/A/", { headers: { "content-type": "image/jpeg" } }]]);
  await baixarPostLinkedin({ link: "https://www.linkedin.com/posts/x-share-1/", dir, cookies: "li_at=AAA" }, { fetch: f });
  assert.equal(f.chamadas[0].init.headers.Cookie, undefined, "público: sem cookie (logado, o LinkedIn devolve a página montada por JS)");
});

test("baixarPostLinkedin: post restrito refaz o pedido com a sessão", async () => {
  const dir = await import("node:fs/promises").then((fs) => fs.mkdtemp(`${process.env.TMPDIR || process.env.TEMP || "/tmp"}/li-`));
  let n = 0;
  const f = async (url, init = {}) => {
    if (url.includes("/posts/")) {
      n++;
      if (!init.headers.Cookie) return { ok: false, status: 307, headers: new Map([["location", "https://www.linkedin.com/signup/cold-join"]]), text: async () => "" };
      return { ok: true, status: 200, headers: new Map(), text: async () => ld([img("B")]) + artigo("") };
    }
    return { ok: true, status: 200, headers: new Map([["content-type", "image/jpeg"]]), arrayBuffer: async () => new ArrayBuffer(3) };
  };
  const r = await baixarPostLinkedin({ link: "https://www.linkedin.com/posts/x-share-1/", dir, cookies: "li_at=AAA" }, { fetch: f });
  assert.equal(n, 2);
  assert.equal(r.length, 1);
});

test("baixarPostLinkedin: restrito que continua redirecionando mesmo com a sessão vira a mensagem clara", async () => {
  const f = async (url, init = {}) => init.headers.Cookie
    ? { ok: false, status: 302, headers: new Map([["location", "https://www.linkedin.com/feed/"]]), text: async () => "" }
    : { ok: false, status: 307, headers: new Map([["location", "https://www.linkedin.com/signup/cold-join"]]), text: async () => "" };
  await assert.rejects(
    () => baixarPostLinkedin({ link: "https://www.linkedin.com/posts/x-share-1/", dir: "/tmp/nao-usa", cookies: "li_at=AAA" }, { fetch: f }),
    /pediu login/,
  );
});
