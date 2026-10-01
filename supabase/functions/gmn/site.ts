// Leitura das imagens e da logo de um site, só por texto (HTML e, em site montado por JavaScript, os arquivos .js).
// Funções puras: recebem o texto e a URL da página e devolvem candidatos com URL absoluta.
import { extensaoDaUrl } from "./regras.ts";

export interface CandidatoSite {
  url: string;
  descricao: string; // alt, título, legenda ou og:image:alt (pode ficar vazio)
  fonte: "img" | "og" | "icone" | "jsonld" | "bundle" | "css";
  logo: boolean; // tem cara de logo: pista de texto (alt, classe, id ou nome do arquivo com "logo"), ícone, og:logo, JSON-LD logo
  // Sinal FORTE de logo (og:logo ou logo do JSON-LD): a imagem sai da busca de fotos. Só vem quando é verdadeiro. A pista de
  // texto sozinha é fraca (o alt "logo ali na frente" é uma foto): ela entra na busca de logos e na de fotos, e a visão decide.
  logoForte?: boolean;
}

const EXT_IMAGEM = /\.(png|jpe?g|jfif|webp|avif|gif|svg|bmp|ico|heic|heif|tiff?)(\?[^"'\s)]*)?$/i;

function atributos(tag: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    r[m[1].toLowerCase()] = (m[3] ?? m[4] ?? m[5] ?? "").trim();
  }
  return r;
}

function decodificar(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}

function absoluta(u: string, base: string): string | null {
  const v = decodificar(u);
  if (!v || v.startsWith("data:") || v.startsWith("blob:") || v.startsWith("javascript:")) return null;
  try {
    const url = new URL(v, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** A maior imagem de um srcset ("a.jpg 480w, b.jpg 1200w" → b.jpg). */
function maiorDoSrcset(srcset: string): string | null {
  let melhor: string | null = null, maior = -1;
  for (const parte of srcset.split(",")) {
    const [u, d] = parte.trim().split(/\s+/);
    const n = d ? parseFloat(d) : 1;
    if (u && n > maior) { maior = n; melhor = u; }
  }
  return melhor;
}

// Palavra inteira (letras ao redor não valem): "multimarcas", "brandão" e "marcas" não casam; "site-logo", "logo_2024" e "marca" casam.
const PARECE_LOGO = /(^|[^a-zà-ú])(logo|logotipo|logomarca|marca|brand)([^a-zà-ú]|$)/;

/**
 * Pista de texto de logo: só alt, classe, id e NOME DO ARQUIVO (último trecho do caminho, sem a query) entram, nunca o domínio
 * nem as pastas ("multimarcas.com.br/…/patio.jpg" e "brandao.com/foto.jpg" não são logo). CamelCase vira palavras ("siteLogo").
 */
function parecePorTexto(...partes: (string | undefined)[]): boolean {
  const texto = partes.filter(Boolean).join(" ").replace(/([a-zà-ú])([A-ZÀ-Ú])/g, "$1 $2").toLowerCase();
  return PARECE_LOGO.test(texto);
}

/** Último trecho do caminho de um endereço (sem a query e sem o fragmento); vazio se não houver. */
function nomeDoArquivo(u: string): string {
  const caminho = u.split(/[?#]/)[0];
  const nome = caminho.slice(caminho.lastIndexOf("/") + 1);
  try { return decodeURIComponent(nome); } catch { return nome; }
}

const ATRIBUTOS_DE_ARQUIVO = ["src", "data-src", "data-lazy-src", "data-original", "data-lazy"];
const ATRIBUTOS_DE_SRCSET = ["srcset", "data-srcset", "data-lazy-srcset"];

/**
 * O arquivo de uma <img>: o 1º atributo que não é placeholder (`data:` do lazy-load não vale) e, de todos os srcset, a maior
 * imagem. `src` cai para `grande` quando só há srcset.
 */
function fontesDaImg(a: Record<string, string>, base: string): { src: string | null; grande: string | null } {
  const util = (u: string | null | undefined) => (u && absoluta(u, base) ? u : null);
  const src = ATRIBUTOS_DE_ARQUIVO.map((k) => util(a[k])).find(Boolean) ?? null;
  const grande = ATRIBUTOS_DE_SRCSET.map((k) => (a[k] ? util(maiorDoSrcset(a[k])) : null)).find(Boolean) ?? null;
  return { src: src ?? grande, grande };
}

/** Endereços de imagem de um valor do JSON-LD: texto, lista de textos ou de objetos, ou objeto, com `url`. */
function imagensDoJsonLd(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(imagensDoJsonLd);
  const url = v && typeof v === "object" ? (v as Record<string, unknown>).url : null;
  return typeof url === "string" ? [url] : [];
}

/** Candidatos de imagem e de logo no HTML de uma página. */
export function imagensDoHtml(html: string, paginaUrl: string): CandidatoSite[] {
  const out: CandidatoSite[] = [];
  const add = (u: string | null | undefined, descricao: string, fonte: CandidatoSite["fonte"], logo: boolean, forte = false) => {
    const url = u ? absoluta(u, paginaUrl) : null;
    if (url) out.push({ url, descricao: decodificar(descricao).slice(0, 300), fonte, logo, ...(forte ? { logoForte: true } : {}) });
  };
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const nome = (a.property || a.name || "").toLowerCase();
    if (nome === "og:image" || nome === "og:image:url" || nome === "og:image:secure_url" || nome === "twitter:image") {
      add(a.content, "", "og", false);
    }
    if (nome === "og:logo") add(a.content, "", "og", true, true);
  }
  const ogAlt = /<meta\b[^>]*(?:property|name)\s*=\s*["']og:image:alt["'][^>]*>/i.exec(html);
  if (ogAlt) { const a = atributos(ogAlt[0]); for (const c of out) if (c.fonte === "og" && !c.descricao) c.descricao = decodificar(a.content ?? ""); }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const rel = (a.rel || "").toLowerCase();
    if (/(^|\s)(icon|apple-touch-icon|mask-icon)(\s|$)/.test(rel)) add(a.href, "", "icone", true);
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const visitar = (v: unknown) => {
        if (!v || typeof v !== "object") return;
        if (Array.isArray(v)) { v.forEach(visitar); return; }
        const o = v as Record<string, unknown>;
        for (const u of imagensDoJsonLd(o.logo)) add(u, String(o.name ?? ""), "jsonld", true, true);
        for (const u of imagensDoJsonLd(o.image)) add(u, String(o.name ?? ""), "jsonld", false);
        for (const k of Object.keys(o)) if (k !== "logo" && k !== "image") visitar(o[k]);
      };
      visitar(JSON.parse(m[1]));
    } catch { /* JSON-LD quebrado: ignora */ }
  }
  // <figure> com legenda: a legenda vira a descrição da imagem de dentro
  const legendas = new Map<string, string>();
  for (const m of html.matchAll(/<figure\b[\s\S]*?<\/figure>/gi)) {
    const img = /<img\b[^>]*>/i.exec(m[0]);
    const cap = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(m[0]);
    if (img && cap) { const u = fontesDaImg(atributos(img[0]), paginaUrl).src; if (u) legendas.set(u, cap[1].replace(/<[^>]+>/g, " ")); }
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const { src, grande } = fontesDaImg(a, paginaUrl);
    if (!src) continue;
    const descricao = legendas.get(src) || a.alt || a.title || "";
    const arquivo = grande || src;
    add(arquivo, descricao, "img", parecePorTexto(a.alt, a.class, a.id, nomeDoArquivo(arquivo)));
  }
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    if (EXT_IMAGEM.test(m[1])) add(m[1], "", "css", parecePorTexto(nomeDoArquivo(m[1])));
  }
  return deduplicar(out);
}

/** Em site montado por JavaScript (Vite, Lovable, React), as imagens aparecem como caminhos dentro dos .js. */
export function imagensDoBundle(js: string, bundleUrl: string): CandidatoSite[] {
  const out: CandidatoSite[] = [];
  for (const m of js.matchAll(/["'`]((?:https?:\/\/|\/)[^"'`\s]{3,300}?\.(?:png|jpe?g|webp|avif|gif|svg))["'`]/gi)) {
    const url = absoluta(m[1], bundleUrl);
    if (url) out.push({ url, descricao: "", fonte: "bundle", logo: parecePorTexto(nomeDoArquivo(m[1])) });
  }
  return deduplicar(out);
}

/** Os .js do próprio site citados no HTML (até `max`), para procurar imagens em site montado por JavaScript. */
export function scriptsDoSite(html: string, paginaUrl: string, max = 3): string[] {
  const host = new URL(paginaUrl).host;
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const u = absoluta(m[1], paginaUrl);
    if (u && new URL(u).host === host && !out.includes(u)) out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

/** Mesma URL uma vez só (a primeira ocorrência vence, mas descrição, marca de logo e sinal forte de logo se somam). */
export function deduplicar(lista: CandidatoSite[]): CandidatoSite[] {
  const mapa = new Map<string, CandidatoSite>();
  for (const c of lista) {
    const ja = mapa.get(c.url);
    if (!ja) mapa.set(c.url, { ...c });
    else {
      if (!ja.descricao && c.descricao) ja.descricao = c.descricao;
      ja.logo = ja.logo || c.logo;
      if (c.logoForte) ja.logoForte = true;
    }
  }
  return [...mapa.values()];
}

const RASTREIO = /facebook\.com\/tr|google-analytics|googletagmanager|doubleclick|\/pixel|hotjar|clarity\.ms/i;

const semRastreio = (lista: CandidatoSite[]) => lista.filter((c) => !RASTREIO.test(c.url));
// Ícone do HTML (favicon, apple-touch-icon) conta como logo mesmo sem a marca `logo`.
const temCaraDeLogo = (c: CandidatoSite) => c.logo || c.fonte === "icone";
const pesoLogo = (c: CandidatoSite) => (c.logoForte || c.fonte === "jsonld" || c.fonte === "og" ? 0 : c.fonte === "img" ? 1 : 2);

function logosDe(lista: CandidatoSite[], max: number): CandidatoSite[] {
  return semRastreio(lista).filter(temCaraDeLogo).sort((a, b) => pesoLogo(a) - pesoLogo(b)).slice(0, max);
}

// SVG e ICO são logo ou ícone, nunca foto: ficam só pela pista de logo (o alt deles não os faz virar foto).
const EXTENSOES_QUE_NAO_SAO_FOTO = ["svg", "svgz", "ico"];

/** Sinal forte de logo: ícone do HTML, og:logo, logo do JSON-LD, ou arquivo SVG/ICO. Só ele tira uma imagem da busca de fotos. */
const temSinalForteDeLogo = (c: CandidatoSite) =>
  c.fonte === "icone" || !!c.logoForte || EXTENSOES_QUE_NAO_SAO_FOTO.includes(extensaoDaUrl(c.url));

const comDescricaoPrimeiro = (lista: CandidatoSite[]) => lista.sort((a, b) => Number(!a.descricao) - Number(!b.descricao));

/** Candidatos de logo para a busca da logo: até `max`, JSON-LD e og primeiro, sem rastreadores. Pista fraca de texto entra. */
export function candidatosDeLogo(lista: CandidatoSite[], max = 16): CandidatoSite[] {
  return logosDe(lista, max);
}

/**
 * Candidatos de foto para a busca das fotos: até `max`, com descrição primeiro, sem rastreadores e sem sinal forte de logo
 * (ícone, og:logo, logo do JSON-LD, SVG, ICO). Quem só tem pista fraca de texto (alt, classe ou nome do arquivo com "logo")
 * continua candidato: a visão decide se é foto.
 */
export function candidatosDeFoto(lista: CandidatoSite[], max = 24): CandidatoSite[] {
  return comDescricaoPrimeiro(semRastreio(lista).filter((c) => !temSinalForteDeLogo(c))).slice(0, max);
}

/**
 * Logos (até 8; JSON-LD e og:logo primeiro) e imagens (até 40; com descrição primeiro), sem rastreadores. Aqui qualquer pista de
 * logo (também a fraca) tira a imagem da lista de imagens; a busca das fotos usa `candidatosDeFoto`.
 */
export function separarCandidatos(lista: CandidatoSite[]): { logos: CandidatoSite[]; imagens: CandidatoSite[] } {
  const limpos = semRastreio(lista);
  const imagens = comDescricaoPrimeiro(limpos.filter((c) => !temCaraDeLogo(c) && !temSinalForteDeLogo(c))).slice(0, 40);
  return { logos: logosDe(lista, 8), imagens };
}

/**
 * URL http(s) de host público: nada de localhost, IP privado, link-local, IPv6 interno (loopback, ULA, link-local, IPv4
 * embutido, 6to4) ou nome de máquina da rede interna (sem ponto, `.internal`, `.local`).
 * LIMITE CONHECIDO: não resolve DNS. Um nome público que aponte para um IP interno (ex.: 10.0.0.5.nip.io) passa; quem
 * baixa confere cada redirecionamento, mas não o IP que o nome resolve.
 */
export function urlPublicaHttp(u: string): URL | null {
  let url: URL;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const h = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (h.includes(":")) {
    // IPv6: "::" e "::1", tudo que começa com "::" (IPv4 embutido), ULA (fc00::/7), link-local e site-local (fe80::/10 a
    // fec0::/10), 6to4 (2002::/16) e NAT64.
    return h.startsWith("::") || /^f[cd]/.test(h) || /^fe[89a-f]/.test(h) || h.startsWith("2002:") || h.startsWith("64:ff9b:") ? null : url;
  }
  if (h === "localhost" || /\.(localhost|internal|local|localdomain)$/.test(h)) return null;
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip) {
    const [a, b, c] = [Number(ip[1]), Number(ip[2]), Number(ip[3])];
    if (
      a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    ) return null;
  } else if (!h.includes(".")) {
    return null;
  }
  return url;
}

/**
 * Texto da página (bytes do HTML) com o charset do cabeçalho Content-Type ou, sem ele, do `<meta charset>` / `http-equiv` dos
 * primeiros 2 KB; sem nenhum dos dois (ou com um rótulo que o decodificador não conhece), UTF-8. Nunca lança.
 */
export function decodificarPagina(bytes: Uint8Array, contentType: string | null): string {
  const rotulo = (s: string) => /charset\s*=\s*["']?\s*([\w:.-]+)/i.exec(s)?.[1];
  const inicio = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const meta = /<meta\b[^>]*charset\s*=\s*["']?\s*([\w:.-]+)/i.exec(inicio)?.[1];
  // Meta que diz UTF-16 num texto que se lê como ASCII/UTF-8 é erro do site (a regra do HTML é tratar como UTF-8).
  for (const r of [contentType ? rotulo(contentType) : undefined, meta && !/^utf-?16/i.test(meta) ? meta : undefined]) {
    if (!r) continue;
    try {
      return new TextDecoder(r).decode(bytes);
    } catch { /* rótulo que o decodificador não conhece: tenta o próximo e, por fim, UTF-8 */ }
  }
  return new TextDecoder().decode(bytes);
}
